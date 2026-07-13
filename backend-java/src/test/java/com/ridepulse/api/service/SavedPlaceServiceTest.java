package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.SavedPlaceRepository;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class SavedPlaceServiceTest {
  private final SavedPlaceRepository repository = mock(SavedPlaceRepository.class);
  private final SavedPlaceService service = new SavedPlaceService(repository);

  @Test
  void createsAnOwnerScopedPlaceWithNormalizedValues() {
    Map<String, Object> saved = Map.of("id", "place-1", "label", "Home");
    when(repository.create("owner-1", "Home", "home", 12.9716, 77.5946, 180)).thenReturn(saved);

    Map<String, Object> result = service.create("owner-1", Map.of(
        "label", " Home ", "kind", "home", "latitude", 12.9716, "longitude", 77.5946));

    assertThat(result).containsEntry("place", saved);
    verify(repository).create("owner-1", "Home", "home", 12.9716, 77.5946, 180);
  }

  @Test
  void rejectsInvalidCoordinatesBeforeWriting() {
    assertThatThrownBy(() -> service.create("owner-1", Map.of(
        "label", "Office", "kind", "office", "latitude", 120, "longitude", 77)))
        .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST));
  }

  @Test
  void refusesToUpdateAnotherUsersPlace() {
    when(repository.update("owner-1", "place-2", "Office", "office", 12, 77, 180)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.update("owner-1", "place-2", Map.of(
        "label", "Office", "kind", "office", "latitude", 12, "longitude", 77)))
        .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.status()).isEqualTo(HttpStatus.NOT_FOUND));
  }
}
