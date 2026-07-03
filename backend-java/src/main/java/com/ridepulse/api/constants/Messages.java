package com.ridepulse.api.constants;

public final class Messages {
  public static final String SUCCESS = "Success";
  public static final String CREATED = "Created";
  public static final String DELETED = "Deleted";
  public static final String DEFAULT_RIDER_NAME = "Rider";
  public static final String DEFAULT_BIKE_MODEL = "Motorcycle";
  public static final String EMAIL_PASSWORD_REQUIRED = "Email and 8+ character password are required";
  public static final String EMAIL_ALREADY_REGISTERED = "Email is already registered";
  public static final String INVALID_LOGIN = "Invalid email or password";
  public static final String MISSING_TOKEN = "Missing authorization token";
  public static final String INVALID_TOKEN = "Invalid or expired token";
  public static final String USER_NOT_FOUND = "User not found";
  public static final String RIDE_NOT_FOUND = "Ride not found";
  public static final String TRIP_NOT_FOUND = "Trip not found";
  public static final String TRIP_TITLE_REQUIRED = "Trip title is required";
  public static final String RIDE_PHOTO_NOT_FOUND = "Ride photo not found";
  public static final String PROFILE_PHOTO_NOT_FOUND = "Profile photo not found";
  public static final String INVALID_JSON = "Request body must be valid JSON";
  public static final String REQUEST_CONFLICT = "Request conflicts with existing data";
  public static final String ROUTE_NOT_FOUND = "Route not found";
  public static final String UNEXPECTED_ERROR = "Unexpected server error";
  public static final String ROUTE_REQUIRES_POINTS = "Ride requires start time, end time, and at least 2 points";
  public static final String RIDE_TOO_MANY_POINTS = "Ride cannot contain more than %d points";
  public static final String INVALID_RIDE_POINTS = "Ride points must include valid coordinates and timestamps";
  public static final String DEFAULT_START_LABEL = "Start point";
  public static final String DEFAULT_END_LABEL = "End point";
  public static final String PROFILE_PHOTO_INVALID_MIME = "Profile photo must be a JPEG, PNG, or WebP image";
  public static final String RIDE_PHOTO_INVALID_MIME = "Ride photo must be a JPEG, PNG, or WEBP image";
  public static final String PROFILE_PHOTO_MISSING_OR_INVALID = "Profile photo data is missing or invalid";
  public static final String RIDE_PHOTO_MISSING_OR_INVALID = "Ride photo must include valid base64 image data";
  public static final String PROFILE_PHOTO_MALFORMED = "Profile photo data is malformed";
  public static final String PROFILE_PHOTO_TOO_LARGE = "Profile photo is too large. Choose a smaller image.";
  public static final String RIDE_PHOTO_TOO_LARGE = "Ride photo is too large. Choose an image under 3 MB.";
  public static final String RESET_UNAVAILABLE = "Password reset is temporarily unavailable.";
  public static final String RESET_REQUEST_MESSAGE = "If that email exists, we sent a password reset link.";
  public static final String INVALID_RESET_MESSAGE = "Reset link is invalid or expired.";
  public static final String RESET_PASSWORD_TOO_SHORT = "Password must be at least 8 characters.";
  public static final String RESET_PASSWORD_UPDATED = "Password updated. Please sign in with your new password.";
  public static final String VALID_EMAIL_REQUIRED = "Enter a valid email address.";

  private Messages() {}
}
