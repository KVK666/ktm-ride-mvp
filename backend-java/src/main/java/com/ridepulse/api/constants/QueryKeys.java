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
  public static final String RIDE_LIST_DATE_RANGE = "ride.list-date-range";
  public static final String RIDE_LIST_SEARCH = "ride.list-search";
  public static final String RIDE_LIST_NEEDS_REVIEW = "ride.list-needs-review";
  public static final String RIDE_LIST_CLEANUP = "ride.list-cleanup";
  public static final String RIDE_LIST_CURSOR_NEWEST = "ride.list-cursor-newest";
  public static final String RIDE_LIST_CURSOR_LONGEST = "ride.list-cursor-longest";
  public static final String RIDE_LIST_CURSOR_FASTEST = "ride.list-cursor-fastest";
  public static final String RIDE_LIST_ORDER_NEWEST = "ride.list-order-newest";
  public static final String RIDE_LIST_ORDER_LONGEST = "ride.list-order-longest";
  public static final String RIDE_LIST_ORDER_FASTEST = "ride.list-order-fastest";
  public static final String RIDE_LIST_LIMIT = "ride.list-limit";
  public static final String RIDE_LIST_ORDER = "ride.list-order";
  public static final String RIDE_BY_OWNER = "ride.by-owner";
  public static final String RIDE_EXISTS = "ride.exists";
  public static final String RIDE_POINTS_FULL = "ride.points-full";
  public static final String RIDE_POINTS_INTELLIGENCE = "ride.points-intelligence";
  public static final String RIDE_INTELLIGENCE_STATS = "ride.intelligence-stats";
  public static final String RIDE_DUPLICATES = "ride.duplicates";
  public static final String RIDE_PATCH = "ride.patch";
  public static final String RIDE_INSERT = "ride.insert";
  public static final String RIDE_IMPORT_INSERT = "ride.import-insert";
  public static final String RIDE_INSERT_POINT = "ride.insert-point";
  public static final String RIDE_BY_CLIENT_ID = "ride.by-client-id";
  public static final String RIDE_OVERLAPS = "ride.overlaps";
  public static final String RIDE_OVERLAPS_RANGE = "ride.overlaps-range";
  public static final String RIDE_DELETE = "ride.delete";
  public static final String RIDE_AI_SAVE = "ride.ai-save";

  public static final String RIDE_PHOTO_LIST = "ride-photo.list";
  public static final String RIDE_PHOTO_LIST_METADATA = "ride-photo.list-metadata";
  public static final String RIDE_PHOTO_INSERT = "ride-photo.insert";
  public static final String RIDE_PHOTO_BY_ID = "ride-photo.by-id";
  public static final String RIDE_PHOTO_BINARY_BY_ID = "ride-photo.binary-by-id";
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
  public static final String PROFILE_UPDATE = "profile.update";
  public static final String PROFILE_PREFERENCES = "profile.preferences";
  public static final String PROFILE_UPDATE_PREFERENCES = "profile.update-preferences";

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
  public static final String TRIP_LIST_FOR_RIDE = "trip.list-for-ride";
  public static final String RIDE_OWNED_IDS = "ride.owned-ids";
  public static final String RIDE_OWNED_BY_CLIENT_IDS = "ride.owned-by-client-ids";
  public static final String TRIP_BY_CLIENT_ID = "trip.by-client-id";
  public static final String TRIP_IMPORT_INSERT = "trip.import-insert";
  public static final String RIDE_AI_ENQUEUE = "ride-ai.enqueue";
  public static final String RIDE_AI_CLAIM = "ride-ai.claim";
  public static final String RIDE_AI_LOCK = "ride-ai.lock";
  public static final String RIDE_AI_COMPLETE = "ride-ai.complete";

  private QueryKeys() {}
}
