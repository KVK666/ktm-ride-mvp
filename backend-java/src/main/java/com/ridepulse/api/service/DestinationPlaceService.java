package com.ridepulse.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class DestinationPlaceService {
  private static final Logger log = LoggerFactory.getLogger(DestinationPlaceService.class);
  private static final String PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
  private static final String GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
  private static final double MAX_PLACE_DISTANCE_M = 100d;
  private static final Set<String> NON_DESTINATION_TYPES = Set.of(
      "route", "street_address", "premise", "subpremise", "postal_code", "political",
      "neighborhood", "locality", "administrative_area_level_1", "administrative_area_level_2", "country");

  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;
  private final String apiKey;
  private final String placesUrl;
  private final String geocodingUrl;

  DestinationPlaceService(
      ObjectMapper objectMapper,
      @Value("${RIDEPULSE_GOOGLE_PLACES_API_KEY:}") String apiKey) {
    this(objectMapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build(), apiKey, PLACES_URL, GEOCODING_URL);
  }

  DestinationPlaceService(ObjectMapper objectMapper, HttpClient httpClient, String apiKey, String placesUrl, String geocodingUrl) {
    this.objectMapper = objectMapper;
    this.httpClient = httpClient;
    this.apiKey = apiKey == null ? "" : apiKey.trim();
    this.placesUrl = placesUrl;
    this.geocodingUrl = geocodingUrl;
  }

  public Map<String, Object> configStatus() {
    return Map.of("configured", !apiKey.isBlank());
  }

  public Optional<DestinationPlace> resolve(Object latitudeValue, Object longitudeValue) {
    double latitude = number(latitudeValue);
    double longitude = number(longitudeValue);
    if (apiKey.isBlank() || !validCoordinate(latitude, longitude)) return Optional.empty();
    try {
      Optional<DestinationPlace> nearby = nearbyPlace(latitude, longitude);
      if (nearby.isPresent()) return nearby;
      return reverseGeocode(latitude, longitude);
    } catch (Exception error) {
      log.warn("destination place lookup failed message={}", error.getMessage());
      return Optional.empty();
    }
  }

  private Optional<DestinationPlace> nearbyPlace(double latitude, double longitude) throws Exception {
    String body = objectMapper.writeValueAsString(Map.of(
        "maxResultCount", 10,
        "rankPreference", "DISTANCE",
        "locationRestriction", Map.of("circle", Map.of(
            "center", Map.of("latitude", latitude, "longitude", longitude),
            "radius", MAX_PLACE_DISTANCE_M))));
    HttpRequest request = HttpRequest.newBuilder(URI.create(placesUrl))
        .timeout(Duration.ofSeconds(6))
        .header("Content-Type", "application/json")
        .header("X-Goog-Api-Key", apiKey)
        .header("X-Goog-FieldMask", "places.id,places.displayName,places.primaryType,places.types,places.formattedAddress,places.location,places.businessStatus")
        .POST(HttpRequest.BodyPublishers.ofString(body))
        .build();
    HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      log.warn("destination nearby lookup non-success status={}", response.statusCode());
      return Optional.empty();
    }
    JsonNode places = objectMapper.readTree(response.body()).path("places");
    if (!places.isArray()) return Optional.empty();
    return stream(places)
        .map(place -> candidate(place, latitude, longitude))
        .flatMap(Optional::stream)
        .min(Comparator.comparingDouble(Candidate::distanceM))
        .map(Candidate::place);
  }

  private Optional<Candidate> candidate(JsonNode node, double latitude, double longitude) {
    String name = text(node.path("displayName").path("text"));
    String primaryType = text(node.path("primaryType"));
    if (name.isBlank() || primaryType.isBlank() || NON_DESTINATION_TYPES.contains(primaryType)) return Optional.empty();
    if ("CLOSED_PERMANENTLY".equals(text(node.path("businessStatus")))) return Optional.empty();
    double placeLatitude = node.path("location").path("latitude").asDouble(Double.NaN);
    double placeLongitude = node.path("location").path("longitude").asDouble(Double.NaN);
    if (!validCoordinate(placeLatitude, placeLongitude)) return Optional.empty();
    double distanceM = haversine(latitude, longitude, placeLatitude, placeLongitude);
    if (distanceM > MAX_PLACE_DISTANCE_M) return Optional.empty();
    DestinationPlace place = new DestinationPlace(
        trim(name, 120), normalizeCategory(primaryType, node.path("types")),
        trim(text(node.path("formattedAddress")), 240), "google_places");
    return Optional.of(new Candidate(place, distanceM));
  }

  private Optional<DestinationPlace> reverseGeocode(double latitude, double longitude) throws Exception {
    String latlng = URLEncoder.encode(latitude + "," + longitude, StandardCharsets.UTF_8);
    URI uri = URI.create(geocodingUrl + "?latlng=" + latlng + "&key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8));
    HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(6)).GET().build();
    HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() < 200 || response.statusCode() >= 300) return Optional.empty();
    JsonNode first = objectMapper.readTree(response.body()).path("results").path(0);
    String address = trim(text(first.path("formatted_address")), 240);
    if (address.isBlank()) return Optional.empty();
    String area = address.split(",", 2)[0].trim();
    return Optional.of(new DestinationPlace(trim(area, 120), "area", address, "google_geocoding"));
  }

  private String normalizeCategory(String primaryType, JsonNode types) {
    List<String> values = stream(types).map(JsonNode::asText).map(value -> value.toLowerCase(Locale.ROOT)).toList();
    String type = primaryType.toLowerCase(Locale.ROOT);
    if (type.equals("coffee_shop") || type.equals("cafe") || values.contains("coffee_shop") || values.contains("cafe")) return "coffee_shop";
    if (type.contains("restaurant") || type.equals("bakery") || type.equals("meal_takeaway")) return "restaurant";
    if (type.equals("gas_station") || type.equals("petrol_station")) return "fuel_station";
    if (type.equals("park") || type.equals("national_park")) return "park";
    if (type.contains("store") || type.equals("shopping_mall") || type.equals("market")) return "store";
    if (type.equals("hotel") || type.equals("lodging")) return "hotel";
    if (type.equals("tourist_attraction") || type.equals("museum") || type.equals("historical_landmark")) return "attraction";
    return type.replaceAll("[^a-z0-9_]+", "_");
  }

  private java.util.stream.Stream<JsonNode> stream(JsonNode array) {
    if (array == null || !array.isArray()) return java.util.stream.Stream.empty();
    return java.util.stream.StreamSupport.stream(array.spliterator(), false);
  }

  private boolean validCoordinate(double latitude, double longitude) {
    return Double.isFinite(latitude) && Double.isFinite(longitude)
        && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  private double number(Object value) {
    if (value instanceof Number number) return number.doubleValue();
    try { return Double.parseDouble(String.valueOf(value)); }
    catch (Exception ignored) { return Double.NaN; }
  }

  private String text(JsonNode value) {
    return value != null && value.isTextual() ? value.asText().trim() : "";
  }

  private String trim(String value, int maxLength) {
    String text = value == null ? "" : value.trim();
    return text.length() > maxLength ? text.substring(0, maxLength) : text;
  }

  private double haversine(double lat1, double lon1, double lat2, double lon2) {
    double latDelta = Math.toRadians(lat2 - lat1);
    double lonDelta = Math.toRadians(lon2 - lon1);
    double a = Math.sin(latDelta / 2) * Math.sin(latDelta / 2)
        + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
        * Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);
    return 6371000d * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  public record DestinationPlace(String name, String category, String address, String source) {}
  private record Candidate(DestinationPlace place, double distanceM) {}
}
