package com.ridepulse.api.constants;

public final class QueryKeys {
  public static final String USER_INSERT = "user.insert";
  public static final String USER_BY_EMAIL = "user.by-email";
  public static final String USER_BY_ID = "user.by-id";

  public static final String PASSWORD_RESET_USER_BY_EMAIL = "password-reset.user-by-email";
  public static final String PASSWORD_RESET_MARK_EXISTING_USED = "password-reset.mark-existing-used";
  public static final String PASSWORD_RESET_INSERT = "password-reset.insert";
  public static final String PASSWORD_RESET_VALID_TOKEN = "password-reset.valid-token";
  public static final String PASSWORD_RESET_UPDATE_PASSWORD = "password-reset.update-password";
  public static final String PASSWORD_RESET_MARK_TOKEN_USED = "password-reset.mark-token-used";

  public static final String RIDE_SELECT = "ride.select";
  public static final String RIDE_LIST_BASE = "ride.list-base";
  public static final String RIDE_LIST_TODAY = "ride.list-today";
  public static final String RIDE_LIST_MONTH = "ride.list-month";
  public static final String RIDE_LIST_YEAR = "ride.list-year";
  public static final String RIDE_LIST_SEARCH = "ride.list-search";
  public static final String RIDE_LIST_ORDER = "ride.list-order";
  public static final String RIDE_BY_OWNER = "ride.by-owner";
  public static final String RIDE_EXISTS = "ride.exists";
  public static final String RIDE_POINTS_FULL = "ride.points-full";
  public static final String RIDE_POINTS_INTELLIGENCE = "ride.points-intelligence";
  public static final String RIDE_INTELLIGENCE_STATS = "ride.intelligence-stats";
  public static final String RIDE_DUPLICATES = "ride.duplicates";
  public static final String RIDE_PATCH = "ride.patch";
  public static final String RIDE_INSERT = "ride.insert";
  public static final String RIDE_INSERT_POINT = "ride.insert-point";
  public static final String RIDE_BY_CLIENT_ID = "ride.by-client-id";
  public static final String RIDE_DELETE = "ride.delete";
  public static final String RIDE_AI_MARK_PENDING = "ride.ai-mark-pending";
  public static final String RIDE_AI_SAVE = "ride.ai-save";

  public static final String RIDE_PHOTO_LIST = "ride-photo.list";
  public static final String RIDE_PHOTO_INSERT = "ride-photo.insert";
  public static final String RIDE_PHOTO_BY_ID = "ride-photo.by-id";
  public static final String RIDE_PHOTO_DELETE = "ride-photo.delete";

  public static final String ROUTE_PREVIEW = "route-preview";
  public static final String STATS_DASHBOARD = "stats.dashboard";
  public static final String DASHBOARD_RECENT = "dashboard.recent";
  public static final String JOURNAL_RECENT = "journal.recent";
  public static final String JOURNAL_MONTH = "journal.month";
  public static final String ANALYTICS_DISTANCE = "analytics.distance";
  public static final String ANALYTICS_SPEED = "analytics.speed";
  public static final String ANALYTICS_INSIGHT_RIDES = "analytics.insight-rides";
  public static final String REPORTS_SUMMARY = "reports.summary";
  public static final String REPORTS_ROUTES = "reports.routes";
  public static final String PROFILE_PHOTO = "profile.photo";
  public static final String PROFILE_UPDATE_PHOTO = "profile.update-photo";
  public static final String PROFILE_DELETE_PHOTO = "profile.delete-photo";

  public static final String SAVED_PLACE_LIST = "saved-place.list";
  public static final String SAVED_PLACE_BY_ID = "saved-place.by-id";
  public static final String SAVED_PLACE_COUNT = "saved-place.count";
  public static final String SAVED_PLACE_INSERT = "saved-place.insert";
  public static final String SAVED_PLACE_UPDATE = "saved-place.update";
  public static final String SAVED_PLACE_DELETE = "saved-place.delete";

  public static final String TRIP_LIST = "trip.list";
  public static final String TRIP_BY_ID = "trip.by-id";
  public static final String TRIP_RIDES = "trip.rides";
  public static final String TRIP_INSERT = "trip.insert";
  public static final String TRIP_UPDATE = "trip.update";
  public static final String TRIP_DELETE = "trip.delete";
  public static final String TRIP_ADD_RIDE = "trip.add-ride";
  public static final String TRIP_REMOVE_RIDE = "trip.remove-ride";
  public static final String TRIP_TOUCH = "trip.touch";

  public static final String SCHEMA_UUID_EXTENSION = "schema.uuid-extension";
  public static final String SCHEMA_PGCRYPTO_EXTENSION = "schema.pgcrypto-extension";
  public static final String SCHEMA_USER_PROFILE_DATA = "schema.user-profile-data";
  public static final String SCHEMA_USER_PROFILE_MIME = "schema.user-profile-mime";
  public static final String SCHEMA_USER_PROFILE_UPDATED = "schema.user-profile-updated";
  public static final String SCHEMA_PASSWORD_RESET_TABLE = "schema.password-reset-table";
  public static final String SCHEMA_PASSWORD_RESET_USER_FK = "schema.password-reset-user-fk";
  public static final String SCHEMA_RIDE_ALBUM_TABLE = "schema.ride-album-table";
  public static final String SCHEMA_TRIPS_TABLE = "schema.trips-table";
  public static final String SCHEMA_TRIP_RIDES_TABLE = "schema.trip-rides-table";
  public static final String SCHEMA_RIDE_AI_TITLE = "schema.ride-ai-title";
  public static final String SCHEMA_RIDE_AI_SUMMARY = "schema.ride-ai-summary";
  public static final String SCHEMA_RIDE_KIND = "schema.ride-kind";
  public static final String SCHEMA_RIDE_KIND_CONFIDENCE = "schema.ride-kind-confidence";
  public static final String SCHEMA_RIDE_KIND_REASON = "schema.ride-kind-reason";
  public static final String SCHEMA_RIDE_KEY_INSIGHT = "schema.ride-key-insight";
  public static final String SCHEMA_RIDE_BEST_MOMENT = "schema.ride-best-moment";
  public static final String SCHEMA_RIDE_TRIP_SUGGESTION = "schema.ride-trip-suggestion";
  public static final String SCHEMA_RIDE_AI_STATUS = "schema.ride-ai-status";
  public static final String SCHEMA_RIDE_AI_GENERATED_AT = "schema.ride-ai-generated-at";
  public static final String SCHEMA_PASSWORD_RESET_USER_INDEX = "schema.password-reset-user-index";
  public static final String SCHEMA_PASSWORD_RESET_EXPIRES_INDEX = "schema.password-reset-expires-index";
  public static final String SCHEMA_RIDE_PHOTO_RIDE_INDEX = "schema.ride-photo-ride-index";
  public static final String SCHEMA_RIDE_PHOTO_USER_INDEX = "schema.ride-photo-user-index";
  public static final String SCHEMA_TRIPS_USER_INDEX = "schema.trips-user-index";
  public static final String SCHEMA_TRIP_RIDES_RIDE_INDEX = "schema.trip-rides-ride-index";
  public static final String SCHEMA_RIDES_USER_STARTED_INDEX = "schema.rides-user-started-index";
  public static final String SCHEMA_SAVED_PLACES_TABLE = "schema.saved-places-table";
  public static final String SCHEMA_SAVED_PLACES_USER_FK = "schema.saved-places-user-fk";
  public static final String SCHEMA_SAVED_PLACES_USER_LABEL_INDEX = "schema.saved-places-user-label-index";

  private QueryKeys() {}
}
