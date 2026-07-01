package com.ridepulse.api.service;

import com.ridepulse.api.auth.AuthUser;
import com.ridepulse.api.auth.JwtService;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.AuthUserRow;
import com.ridepulse.api.repository.UserRepository;
import com.ridepulse.api.utility.RowMappers;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private final UserRepository userRepository;
  private final BCryptPasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  AuthService(UserRepository userRepository, BCryptPasswordEncoder passwordEncoder, JwtService jwtService) {
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
  }

  @Transactional
  public Map<String, Object> register(Map<String, Object> body) {
    String email = text(body, "email").trim().toLowerCase();
    String password = text(body, "password");
    String name = text(body, "name").trim();
    String bikeModel = text(body, "bikeModel").trim();
    if (email.isBlank() || password.length() < 8) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.EMAIL_PASSWORD_REQUIRED);
    }

    if (userRepository.findByEmail(email).isPresent()) {
      throw new ApiException(HttpStatus.CONFLICT, ProgramCodes.CONFLICT, Messages.EMAIL_ALREADY_REGISTERED);
    }

    try {
      AuthUserRow user = userRepository.create(email, passwordEncoder.encode(password), name.isBlank() ? Messages.DEFAULT_RIDER_NAME : name, bikeModel.isBlank() ? Messages.DEFAULT_BIKE_MODEL : bikeModel);
      return Map.of("token", jwtService.sign(user.id(), user.email()), "user", RowMappers.safeUser(user));
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, ProgramCodes.CONFLICT, Messages.EMAIL_ALREADY_REGISTERED);
    }
  }

  public Map<String, Object> login(Map<String, Object> body) {
    String email = text(body, "email").trim().toLowerCase();
    String password = text(body, "password");
    AuthUserRow user = userRepository.findByEmail(email).orElse(null);
    if (user == null || !passwordEncoder.matches(password, String.valueOf(user.passwordHash()))) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ProgramCodes.UNAUTHORIZED, Messages.INVALID_LOGIN);
    }
    return Map.of("token", jwtService.sign(user.id(), user.email()), "user", RowMappers.safeUser(user));
  }

  public Map<String, Object> me(AuthUser user) {
    AuthUserRow row = userRepository.findById(user.id())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.USER_NOT_FOUND));
    return Map.of("user", RowMappers.safeUser(row));
  }

  private static String text(Map<String, Object> body, String key) {
    Object value = body == null ? null : body.get(key);
    return value == null ? "" : String.valueOf(value);
  }
}
