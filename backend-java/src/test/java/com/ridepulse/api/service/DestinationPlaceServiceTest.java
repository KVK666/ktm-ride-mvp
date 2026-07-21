package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

class DestinationPlaceServiceTest {
  @Test
  void springCanCreateServiceWithProductionConstructor() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.getBeanFactory().registerSingleton("objectMapper", new ObjectMapper());
      context.register(DestinationPlaceService.class);
      context.refresh();

      assertThat(context.getBean(DestinationPlaceService.class).configStatus())
          .containsEntry("configured", false);
    }
  }

  @Test
  void choosesNearestPlausiblePlaceAndNormalizesCoffeeCategory() throws Exception {
    HttpClient client = mock(HttpClient.class);
    @SuppressWarnings("unchecked")
    HttpResponse<String> response = mock(HttpResponse.class);
    when(response.statusCode()).thenReturn(200);
    when(response.body()).thenReturn("""
        {"places":[
          {"displayName":{"text":"Far Cafe"},"primaryType":"cafe","formattedAddress":"Far Road",
           "businessStatus":"OPERATIONAL","location":{"latitude":12.9719,"longitude":77.5946}},
          {"displayName":{"text":"Third Wave Coffee"},"primaryType":"coffee_shop","formattedAddress":"Church Street",
           "businessStatus":"OPERATIONAL","location":{"latitude":12.97161,"longitude":77.59461}}
        ]}
        """);
    when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    DestinationPlaceService service = new DestinationPlaceService(
        new ObjectMapper(), client, "secret", "https://places.invalid", "https://geocode.invalid");

    Optional<DestinationPlaceService.DestinationPlace> place = service.resolve(12.9716, 77.5946);

    assertThat(place).isPresent();
    assertThat(place.orElseThrow().name()).isEqualTo("Third Wave Coffee");
    assertThat(place.orElseThrow().category()).isEqualTo("coffee_shop");
    assertThat(place.orElseThrow().source()).isEqualTo("google_places");
  }

  @Test
  void missingKeySkipsExternalLookup() {
    DestinationPlaceService service = new DestinationPlaceService(
        new ObjectMapper(), mock(HttpClient.class), "", "https://places.invalid", "https://geocode.invalid");

    assertThat(service.resolve(12.9716, 77.5946)).isEmpty();
    assertThat(service.configStatus()).containsEntry("configured", false).doesNotContainKey("apiKey");
  }

  @Test
  void rejectedRoadResultFallsBackToGeocodedArea() throws Exception {
    HttpClient client = mock(HttpClient.class);
    @SuppressWarnings("unchecked") HttpResponse<String> nearby = mock(HttpResponse.class);
    @SuppressWarnings("unchecked") HttpResponse<String> geocode = mock(HttpResponse.class);
    when(nearby.statusCode()).thenReturn(200);
    when(nearby.body()).thenReturn("""
        {"places":[{"displayName":{"text":"MG Road"},"primaryType":"route",
        "formattedAddress":"MG Road, Bengaluru","location":{"latitude":12.9716,"longitude":77.5946}}]}
        """);
    when(geocode.statusCode()).thenReturn(200);
    when(geocode.body()).thenReturn("{\"results\":[{\"formatted_address\":\"Ashok Nagar, Bengaluru, Karnataka\"}]}");
    when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(nearby, geocode);
    DestinationPlaceService service = new DestinationPlaceService(
        new ObjectMapper(), client, "secret", "https://places.invalid", "https://geocode.invalid");

    DestinationPlaceService.DestinationPlace place = service.resolve(12.9716, 77.5946).orElseThrow();

    assertThat(place.name()).isEqualTo("Ashok Nagar");
    assertThat(place.category()).isEqualTo("area");
    assertThat(place.source()).isEqualTo("google_geocoding");
  }

  @Test
  void timeoutReturnsEmptyInsteadOfFailingRideProcessing() throws Exception {
    HttpClient client = mock(HttpClient.class);
    when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(new IOException("timeout"));
    DestinationPlaceService service = new DestinationPlaceService(
        new ObjectMapper(), client, "secret", "https://places.invalid", "https://geocode.invalid");

    assertThat(service.resolve(12.9716, 77.5946)).isEmpty();
  }
}
