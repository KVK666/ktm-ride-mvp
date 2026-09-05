package com.ridepulse.api.service;

import static com.ridepulse.api.service.RideIntelligenceSupport.*;

import com.ridepulse.api.dto.RideAiJob;
import com.ridepulse.api.repository.RideAiJobRepository;
import com.ridepulse.api.repository.RideRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;

@Service
public class RideAiIntelligenceService {
  private static final Logger log = LoggerFactory.getLogger(RideAiIntelligenceService.class);
  static final int AI_CONTEXT_VERSION = 2;
  private final RideRepository rides;
  private final RideAiJobRepository jobs;
  private final RideDestinationContext context;
  private final RideIntelligencePolicy policy;
  private final RideAiProvider provider;
  private final RideTripAutomation trips;
  private final TaskExecutor executor;
  private final TransactionTemplate completionTransaction;
  private volatile boolean ready;
  @Value("${ridepulse.ai.worker-enabled:true}")
  private boolean workerEnabled = true;

  RideAiIntelligenceService(RideRepository rides, RideAiJobRepository jobs,
      RideDestinationContext context, RideIntelligencePolicy policy, RideAiProvider provider,
      RideTripAutomation trips, @Qualifier("rideAiExecutor") TaskExecutor executor,
      PlatformTransactionManager transactionManager) {
    this.rides = rides;
    this.jobs = jobs;
    this.context = context;
    this.policy = policy;
    this.provider = provider;
    this.trips = trips;
    this.executor = executor;
    this.completionTransaction = new TransactionTemplate(transactionManager);
    this.completionTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  public void processRideAsync(String userId, String rideId) {
    try {
      jobs.enqueue(userId, rideId, AI_CONTEXT_VERSION);
    } catch (Exception error) {
      // The ride remains saved; opening intelligence can request processing again.
      log.warn("ride ai enqueue failed rideId={} message={}", rideId, error.getMessage());
    }
  }

  public Map<String, Object> configStatus() {
    return provider.configStatus();
  }

  public boolean processRideIfMissingAsync(String userId, Map<String, Object> ride) {
    if (ride == null || "pending".equals(string(ride.get("aiStatus")))) return false;
    int version = (int) numberOrDefault(ride.get("aiContextVersion"), 0);
    boolean missing = string(ride.get("aiTitle")).isBlank() && string(ride.get("aiSummary")).isBlank();
    if (!missing && !(version < AI_CONTEXT_VERSION && eligibleHistoricalRefresh(ride))) return false;
    String rideId = string(ride.get("id"));
    if (rideId.isBlank()) return false;
    processRideAsync(userId, rideId);
    return true;
  }

  @EventListener(ApplicationReadyEvent.class)
  void applicationReady() {
    ready = true;
  }

  @Scheduled(fixedDelayString = "${ridepulse.ai.poll-interval-ms:5000}")
  void dispatchPending() {
    if (!ready || !workerEnabled) return;
    for (int i = 0; i < 2; i++) {
      try {
        executor.execute(this::processNext);
      } catch (TaskRejectedException busy) {
        return; // Pending rows stay in PostgreSQL until a worker is available.
      }
    }
  }

  void processNext() {
    try {
      jobs.claimNext().ifPresent(this::processRide);
    } catch (Exception error) {
      log.warn("ride ai worker failed message={}", error.getMessage());
    }
  }

  private void processRide(RideAiJob job) {
    try {
      Map<String, Object> stored = rides.findOwnedRide(job.userId(), job.rideId()).orElse(null);
      if (stored == null) return;
      Map<String, Object> ride = context.enrichDestination(context.matchSavedPlaces(job.userId(), stored));
      List<Map<String, Object>> points = rides.intelligencePoints(job.rideId());
      Map<String, Object> fallback = policy.fallbackIntelligence(ride, points);
      Map<String, Object> ai = provider.callAi(ride, points, job.userId(), job.rideId());
      Map<String, Object> result = ai.isEmpty() ? fallback : policy.merge(fallback, ai);
      String title = savedPlaceTitle(ride);
      if (!title.isBlank()) result.put("aiTitle", title);
      if (isCommuteRoute(ride)) {
        result.put("rideKind", "commute");
        result.put("rideKindReason", "Matched the ride endpoints to your saved Home and Office places.");
      }
      copyDestination(ride, result);
      result.put("aiContextVersion", AI_CONTEXT_VERSION);
      complete(job, result);
    } catch (Exception error) {
      // A failed DB write or interrupted process leaves a lease that expires.
      log.warn("ride ai processing deferred rideId={} message={}", job.rideId(), error.getMessage());
    }
  }

  private void complete(RideAiJob job, Map<String, Object> result) {
    try {
      saveResult(job, result, true);
    } catch (Exception error) {
      // Roll back failed trip changes before saving a usable suggestion instead.
      Map<String, Object> fallback = new LinkedHashMap<>(result);
      Map<String, Object> suggestion = new LinkedHashMap<>(policy.parseTripSuggestion(result.get("tripSuggestion")));
      suggestion.put("action", "suggest");
      fallback.put("tripSuggestion", policy.toJson(suggestion));
      fallback.put("aiStatus", "fallback");
      saveResult(job, fallback, false);
    }
  }

  private void saveResult(RideAiJob job, Map<String, Object> result, boolean applyAutomation) {
    completionTransaction.executeWithoutResult(status -> {
      // Fence a slow worker after another process has reclaimed its lease.
      if (!jobs.lockForCompletion(job)) return;
      if (applyAutomation) {
        result.put("tripSuggestion", policy.toJson(trips.applyTripAutomation(job.userId(), job.rideId(), result)));
      }
      rides.saveAiIntelligence(job.userId(), job.rideId(), result);
      jobs.complete(job);
    });
  }

  public Map<String, Object> decorateIntelligence(Map<String, Object> intelligence, Map<String, Object> ride) {
    return decorateIntelligence("", intelligence, ride);
  }

  public Map<String, Object> decorateIntelligence(String userId, Map<String, Object> intelligence, Map<String, Object> ride) {
    Map<String, Object> matchedRide = context.matchSavedPlaces(userId, ride);
    Map<String, Object> decorated = new LinkedHashMap<>(intelligence == null ? Map.of() : intelligence);
    Map<String, Object> ai = policy.normalizeStoredAi(matchedRide);
    String savedPlaceTitle = savedPlaceTitle(matchedRide);
    if (!savedPlaceTitle.isBlank()) decorated.put("suggestedTitle", savedPlaceTitle);
    else if (!string(ai.get("aiTitle")).isBlank()) decorated.put("suggestedTitle", ai.get("aiTitle"));
    if (!string(ai.get("aiSummary")).isBlank()) decorated.put("summaryText", ai.get("aiSummary"));
    boolean commuteRoute = isCommuteRoute(matchedRide);
    Object classifiedKind = commuteRoute ? "commute" : ai.get("rideKind");
    decorated.put("classification", Map.of(
        "rideKind", stringOrDefault(classifiedKind, "scenic_leisure"),
        "label", rideKindLabel(classifiedKind),
        "confidence", commuteRoute ? 1.0 : numberOrDefault(ai.get("rideKindConfidence"), 0.55),
        "reason", commuteRoute ? "Matched the ride endpoints to your saved Home and Office places." : stringOrDefault(ai.get("rideKindReason"), "RidePulse used the route summary to classify this ride."),
        "status", stringOrDefault(ai.get("aiStatus"), "fallback")));
    decorated.put("keyInsight", stringOrDefault(ai.get("keyInsight"), stringOrDefault(decorated.get("highlightReason"), "A route worth remembering.")));
    decorated.put("bestMoment", stringOrDefault(ai.get("bestMoment"), "The saved route is ready for review."));
    decorated.put("tripAutomation", policy.parseTripSuggestion(ai.get("tripSuggestion")));
    return decorated;
  }
}
