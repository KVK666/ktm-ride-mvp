package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.AuthUserRow;
import com.ridepulse.api.repository.ProfileRepository;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ProfileServiceTest {
  private final ProfileRepository profileRepository = mock(ProfileRepository.class);
  private final ProfileService service = new ProfileService(profileRepository, mock(PhotoValidationService.class));

  @Test
  void patchUpdatesOnlyProvidedFieldsAndReturnsAuthUserShape() {
    AuthUserRow row = new AuthUserRow("user-1", "rider@example.com", null, "Riya", "Duke 390", true, "2026-07-19T10:00:00Z");
    when(profileRepository.update("user-1", true, "Riya", false, null)).thenReturn(Optional.of(row));

    Map<String, Object> response = service.update("user-1", Map.of("name", " Riya "));

    verify(profileRepository).update("user-1", true, "Riya", false, null);
    Map<?, ?> user = (Map<?, ?>) response.get("user");
    assertThat(user.get("id")).isEqualTo("user-1");
    assertThat(user.get("name")).isEqualTo("Riya");
    assertThat(user.get("bikeModel")).isEqualTo("Duke 390");
  }

  @Test
  void preferencesExposeUnsetGoalForLegacyMigrationAndValidateUpdates() {
    when(profileRepository.monthlyDistanceGoalKm("user-1")).thenReturn(Optional.of(0));
    when(profileRepository.updateMonthlyDistanceGoalKm("user-1", 450)).thenReturn(Optional.of(450));

    Map<?, ?> defaults = (Map<?, ?>) service.preferences("user-1").get("preferences");
    Map<?, ?> updated = (Map<?, ?>) service.updatePreferences("user-1", Map.of("monthlyDistanceGoalKm", 450)).get("preferences");
    assertThat(defaults.containsKey("monthlyDistanceGoalKm")).isTrue();
    assertThat(defaults.get("monthlyDistanceGoalKm")).isNull();
    assertThat(updated.get("monthlyDistanceGoalKm")).isEqualTo(450);
    assertThatThrownBy(() -> service.updatePreferences("user-1", Map.of("monthlyDistanceGoalKm", 5001)))
        .isInstanceOf(ApiException.class);
  }
}
