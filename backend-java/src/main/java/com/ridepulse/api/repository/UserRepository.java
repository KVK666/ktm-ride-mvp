package com.ridepulse.api.repository;

import com.ridepulse.api.pojo.AuthUserRow;
import java.util.Optional;

public interface UserRepository {
  AuthUserRow create(String email, String passwordHash, String name, String bikeModel);

  Optional<AuthUserRow> findByEmail(String email);

  Optional<AuthUserRow> findById(String userId);
}
