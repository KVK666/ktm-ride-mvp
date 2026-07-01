package com.ridepulse.api.utility;

import com.ridepulse.api.pojo.AuthUserRow;
import com.ridepulse.api.pojo.PhotoRow;
import com.ridepulse.api.pojo.ResetTokenRow;
import com.ridepulse.api.pojo.ResetUserRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

public final class RowMappers {
  private RowMappers() {}

  public static AuthUserRow authUser(ResultSet rs) throws SQLException {
    return new AuthUserRow(
        String.valueOf(rs.getObject("id")),
        rs.getString("email"),
        rs.getString("password_hash"),
        rs.getString("name"),
        rs.getString("bike_model"),
        rs.getBoolean("has_profile_photo"),
        Rows.instantString(rs.getObject("profile_photo_updated_at")));
  }

  public static Map<String, Object> safeUser(AuthUserRow row) {
    Map<String, Object> user = new LinkedHashMap<>();
    user.put("id", row.id());
    user.put("email", row.email());
    user.put("name", row.name());
    user.put("bikeModel", row.bikeModel());
    user.put("hasProfilePhoto", row.hasProfilePhoto());
    user.put("profilePhotoUpdatedAt", row.profilePhotoUpdatedAt());
    return user;
  }

  public static ResetUserRow resetUser(ResultSet rs) throws SQLException {
    return new ResetUserRow(String.valueOf(rs.getObject("id")), rs.getString("email"), rs.getString("name"));
  }

  public static ResetTokenRow resetToken(ResultSet rs) throws SQLException {
    return new ResetTokenRow(String.valueOf(rs.getObject("id")), String.valueOf(rs.getObject("user_id")));
  }

  public static PhotoRow profilePhoto(ResultSet rs) throws SQLException {
    return new PhotoRow(rs.getBytes("profile_photo_data"), rs.getString("profile_photo_mime"), Rows.instantString(rs.getObject("profile_photo_updated_at")));
  }

  public static Map<String, Object> photoMetadata(ResultSet rs) throws SQLException {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("hasProfilePhoto", rs.getBoolean("has_profile_photo"));
    value.put("profilePhotoUpdatedAt", Rows.instantString(rs.getObject("profile_photo_updated_at")));
    return value;
  }

  public static Map<String, Object> ridePhoto(ResultSet rs, boolean includeData) throws SQLException {
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", String.valueOf(rs.getObject("id")));
    response.put("rideId", String.valueOf(rs.getObject("ride_id")));
    response.put("fileName", rs.getString("file_name"));
    response.put("mimeType", rs.getString("mime_type"));
    response.put("createdAt", Rows.instantString(rs.getObject("created_at")));
    response.put("importedAt", Rows.instantString(rs.getObject("imported_at")));
    response.put("latitude", rs.getObject("latitude") == null ? 0 : Rows.numeric(rs.getObject("latitude")));
    response.put("longitude", rs.getObject("longitude") == null ? 0 : Rows.numeric(rs.getObject("longitude")));
    response.put("hasLocation", rs.getBoolean("has_location"));
    if (includeData) {
      response.put("imageBase64", Base64.getEncoder().encodeToString(rs.getBytes("image_data")));
    }
    return response;
  }
}
