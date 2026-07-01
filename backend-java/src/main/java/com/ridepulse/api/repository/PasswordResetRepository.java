package com.ridepulse.api.repository;

import com.ridepulse.api.pojo.ResetTokenRow;
import com.ridepulse.api.pojo.ResetUserRow;
import java.util.Optional;

public interface PasswordResetRepository {
  Optional<ResetUserRow> findUserByEmail(String email);

  void markExistingTokensUsed(String userId);

  void createToken(String userId, String tokenHash, String expiresAt);

  Optional<ResetTokenRow> findValidTokenForUpdate(String tokenHash);

  void updatePassword(String userId, String passwordHash);

  void markTokenUsed(String tokenId);
}
