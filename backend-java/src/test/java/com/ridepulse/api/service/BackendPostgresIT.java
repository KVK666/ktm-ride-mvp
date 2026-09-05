package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.dto.CreateRideResult;
import com.ridepulse.api.dto.RideAiJob;
import com.ridepulse.api.repository.RideAiJobRepository;
import com.ridepulse.api.repository.RideRepository;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"ridepulse.ai.worker-enabled=false",
    "ridepulse.password-reset-url-base=https://example.test/reset", "SMTP_HOST=example.test", "SMTP_FROM=sender@example.test"})
@AutoConfigureMockMvc
class BackendPostgresIT {
  private static final String SCHEMA = "ridepulse_it_" + UUID.randomUUID().toString().replace("-", "");
  private static final String URL = testUrl();
  @Autowired RideService service;
  @Autowired RideAiJobRepository jobs;
  @Autowired RideAiIntelligenceService intelligence;
  @Autowired PlatformTransactionManager transactionManager;
  @Autowired @Qualifier(BeanNames.READ_WRITE_DATA_SOURCE) DataSource dataSource;
  @SpyBean RideRepository rides;
  @SpyBean com.ridepulse.api.repository.TripRepository tripRepository;
  @SpyBean RideAiProvider provider;
  @SpyBean PasswordResetEmailSender emailSender;
  @Autowired PasswordResetService passwordReset;
  @Autowired MockMvc mvc;
  @Autowired com.ridepulse.api.auth.JwtService jwt;
  @Autowired com.fasterxml.jackson.databind.ObjectMapper mapper;

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) throws Exception {
    try (var connection = DriverManager.getConnection(URL); var statement = connection.createStatement()) {
      statement.execute("create schema " + SCHEMA);
    }
    registry.add("DATABASE_URL", () -> schemaUrl(SCHEMA));
    registry.add("ridepulse.jwt-secret", () -> "isolated-integration-test-signing-secret");
    registry.add("RIDEPULSE_AI_API_KEY", () -> "");
    registry.add("RIDEPULSE_GOOGLE_PLACES_API_KEY", () -> "");
  }

  @AfterAll
  static void cleanup() throws Exception {
    try (var connection = DriverManager.getConnection(URL); var statement = connection.createStatement()) {
      statement.execute("drop schema " + SCHEMA + " cascade");
    }
  }

  @Test
  void freshDatabaseHasAllMigrationsAndCanSaveAndReadARide() {
    JdbcTemplate jdbc = jdbc();
    assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where success and version in ('1','2','3')", Integer.class)).isEqualTo(3);
    String userId = user();
    CreateRideResult result = service.create(userId, "fresh", payload());
    assertThat(result.created()).isTrue();
    assertThat(service.get(userId, String.valueOf(result.body().get("rideId")))).containsKey("ride");
    assertThat(jdbc.queryForObject("select ai_status from rides where id = cast(? as uuid)", String.class, result.body().get("rideId"))).isEqualTo("pending");
  }

  @Test
  void concurrentSameClientIdReturnsOneRideWithoutAbortedTransactions() throws Exception {
    String userId = user();
    CyclicBarrier barrier = new CyclicBarrier(2);
    AtomicInteger lookups = new AtomicInteger();
    doAnswer(call -> {
      Object value = call.callRealMethod();
      if (lookups.incrementAndGet() <= 2) barrier.await(10, TimeUnit.SECONDS);
      return value;
    }).when(rides).findByClientRideId(userId, "same-upload");
    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<CreateRideResult> first = executor.submit(() -> service.create(userId, "same-upload", payload()));
      Future<CreateRideResult> second = executor.submit(() -> service.create(userId, "same-upload", payload()));
      CreateRideResult a = first.get(20, TimeUnit.SECONDS);
      CreateRideResult b = second.get(20, TimeUnit.SECONDS);
      assertThat(a.created()).isNotEqualTo(b.created());
      assertThat(a.body().get("rideId")).isEqualTo(b.body().get("rideId"));
      assertThat(jdbc().queryForObject("select count(*) from rides where user_id = cast(? as uuid)", Integer.class, userId)).isEqualTo(1);
      assertThat(jdbc().queryForObject("select count(*) from ride_points where ride_id = cast(? as uuid)", Integer.class, a.body().get("rideId"))).isEqualTo(2);
    } finally {
      executor.shutdownNow();
    }
  }

  @Test
  void pointInsertFailureRollsBackTheRideAndDoesNotEnqueueAi() {
    String userId = user();
    doThrow(new IllegalStateException("simulated point write failure")).when(rides).insertPoints(anyString(), anyList());
    assertThatThrownBy(() -> service.create(userId, "rollback", payload())).isInstanceOf(IllegalStateException.class);
    assertThat(jdbc().queryForObject("select count(*) from rides where user_id = cast(? as uuid)", Integer.class, userId)).isZero();
  }

  @Test
  void expiredAiLeaseIsRecoveredAndOldWorkerCannotComplete() {
    // Isolate this scenario from pending rows created by other tests.
    jdbc().update("update rides set ai_status = 'fallback' where ai_status = 'pending'");
    String userId = user();
    String rideId = String.valueOf(service.create(userId, "lease", payload()).body().get("rideId"));
    RideAiJob old = jobs.claimNext().orElseThrow();
    assertThat(old.rideId()).isEqualTo(rideId);
    assertThat(jobs.claimNext()).isEmpty();
    jdbc().update("update rides set ai_lease_until = now() - interval '1 second' where id = cast(? as uuid)", rideId);
    RideAiJob recovered = jobs.claimNext().orElseThrow();
    assertThat(recovered.rideId()).isEqualTo(old.rideId());
    assertThat(recovered.token()).isNotEqualTo(old.token());
    new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
      assertThat(jobs.lockForCompletion(old)).isFalse();
      assertThat(jobs.lockForCompletion(recovered)).isTrue();
    });
  }

  @Test
  void pendingRideFromPreviousProcessGetsFallbackAndLeavesQueue() {
    jdbc().update("update rides set ai_status = 'fallback' where ai_status = 'pending'");
    String userId = user();
    String rideId = String.valueOf(service.create(userId, "restart", payload()).body().get("rideId"));
    intelligence.processNext();
    assertThat(jdbc().queryForObject("select ai_status from rides where id = cast(? as uuid)", String.class, rideId)).isEqualTo("fallback");
    assertThat(jdbc().queryForObject("select ai_title from rides where id = cast(? as uuid)", String.class, rideId)).isNotBlank();
    assertThat(jobs.claimNext()).isEmpty();
  }

  @Test
  void failedAutomaticTripMembershipRollsBackTripAndSavesSuggestion() {
    jdbc().update("update rides set ai_status = 'fallback' where ai_status = 'pending'");
    String userId = user();
    String rideId = String.valueOf(service.create(userId, "trip-rollback", payload()).body().get("rideId"));
    doReturn(Map.of("aiStatus", "ready", "tripSuggestion", Map.of(
        "action", "auto_create", "confidence", 0.99, "title", "Test trip")))
        .when(provider).callAi(anyMap(), anyList(), eq(userId), eq(rideId));
    doThrow(new IllegalStateException("simulated membership failure")).when(tripRepository).addRide(anyString(), eq(rideId));
    intelligence.processNext();
    assertThat(jdbc().queryForObject("select count(*) from trips where user_id = cast(? as uuid)", Integer.class, userId)).isZero();
    assertThat(jdbc().queryForObject("select trip_suggestion->>'action' from rides where id = cast(? as uuid)", String.class, rideId)).isEqualTo("suggest");
    assertThat(jdbc().queryForObject("select ai_status from rides where id = cast(? as uuid)", String.class, rideId)).isEqualTo("fallback");
  }

  @Test
  void resetDeliveryRunsAfterCommitAndTokenCanOnlyBeUsedOnce() throws Exception {
    String userId = user();
    java.util.concurrent.atomic.AtomicReference<String> token = new java.util.concurrent.atomic.AtomicReference<>();
    doAnswer(call -> {
      assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
      assertThat(jdbc().queryForObject("select count(*) from password_reset_tokens where user_id = cast(? as uuid)", Integer.class, userId)).isEqualTo(1);
      String link = call.getArgument(2);
      token.set(link.substring(link.indexOf("token=") + 6));
      return null;
    }).when(emailSender).send(eq(userId + "@example.test"), anyString(), anyString());
    assertThat(passwordReset.requestPasswordReset(userId + "@example.test"))
        .containsEntry("message", PasswordResetService.RESET_REQUEST_MESSAGE);
    assertThat(token.get()).isNotBlank();
    passwordReset.completePasswordReset(token.get(), "test-replacement-password");
    assertThatThrownBy(() -> passwordReset.completePasswordReset(token.get(), "another-test-password"))
        .isInstanceOf(com.ridepulse.api.http.ApiException.class);
  }

  @Test
  void separatedListAndPhotoEndpointsKeepEnvelopeAndOwnershipChecks() throws Exception {
    String userId = user();
    String authorization = "Bearer " + jwt.sign(userId, userId + "@example.test");
    var response = mvc.perform(post("/api/rides").header("Authorization", authorization)
        .contentType("application/json").header("Idempotency-Key", "http-contract")
        .content(mapper.writeValueAsString(payload())))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.data.rideId").isString())
        .andReturn().getResponse().getContentAsString();
    String rideId = mapper.readTree(response).path("data").path("rideId").asText();
    mvc.perform(post("/api/rides").header("Authorization", authorization)
        .contentType("application/json").header("Idempotency-Key", "http-contract")
        .content(mapper.writeValueAsString(payload())))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.rideId").value(rideId));
    mvc.perform(get("/api/rides").header("Authorization", authorization).param("limit", "10"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.rides[0].id").value(rideId))
        .andExpect(jsonPath("$.data.pageInfo.hasMore").value(false));
    mvc.perform(get("/api/rides/{id}/photos", rideId).header("Authorization", authorization))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.photos").isEmpty());
    String otherUser = user();
    mvc.perform(get("/api/rides/{id}/photos", rideId)
        .header("Authorization", "Bearer " + jwt.sign(otherUser, otherUser + "@example.test")))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/rides")).andExpect(status().isUnauthorized());
  }

  @Test
  void existingCoreDatabaseIsBaselinedWithoutLosingDataAndMigrationIsRepeatable() throws Exception {
    String legacySchema = SCHEMA + "_legacy";
    try (var connection = DriverManager.getConnection(URL); var statement = connection.createStatement()) {
      statement.execute("create schema " + legacySchema);
    }
    DataSource legacy = new DriverManagerDataSource(schemaUrl(legacySchema));
    try {
      new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__core_tables.sql")).execute(legacy);
      JdbcTemplate jdbc = new JdbcTemplate(legacy);
      String id = UUID.randomUUID().toString();
      jdbc.update("insert into users(id,email,password_hash) values(cast(? as uuid), 'preserved@example.test', 'test-hash')", id);
      Flyway flyway = Flyway.configure().dataSource(legacy).baselineOnMigrate(true).baselineVersion("0").load();
      flyway.migrate();
      assertThat(flyway.migrate().migrationsExecuted).isZero();
      assertThat(jdbc.queryForObject("select id::text from users where email='preserved@example.test'", String.class)).isEqualTo(id);
      assertThat(jdbc.queryForObject("select count(*) from saved_places", Integer.class)).isZero();
    } finally {
      try (var connection = DriverManager.getConnection(URL); var statement = connection.createStatement()) {
        statement.execute("drop schema " + legacySchema + " cascade");
      }
    }
  }

  private JdbcTemplate jdbc() { return new JdbcTemplate(dataSource); }

  private String user() {
    String id = UUID.randomUUID().toString();
    jdbc().update("insert into users(id,email,password_hash) values(cast(? as uuid), ?, 'test-hash')", id, id + "@example.test");
    return id;
  }

  private static Map<String, Object> payload() {
    return Map.of("startedAt", "2026-09-01T10:00:00Z", "endedAt", "2026-09-01T10:01:00Z",
        "points", List.of(
            Map.of("latitude", 12.97, "longitude", 77.59, "recordedAt", "2026-09-01T10:00:00Z", "speedKmh", 20),
            Map.of("latitude", 12.98, "longitude", 77.60, "recordedAt", "2026-09-01T10:01:00Z", "speedKmh", 20)));
  }

  private static String testUrl() {
    String url = System.getenv("RIDEPULSE_TEST_DATABASE_URL");
    if (url == null || !url.startsWith("jdbc:postgresql:")) {
      throw new IllegalStateException("Set RIDEPULSE_TEST_DATABASE_URL to a dedicated PostgreSQL test database");
    }
    return url;
  }

  private static String schemaUrl(String schema) {
    return URL + (URL.contains("?") ? "&" : "?") + "currentSchema=" + schema;
  }
}
