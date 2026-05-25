import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { API_BASE_URL } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { useAutoTracking } from "../hooks/useAutoTracking";
import {
  clearDiagnostics,
  DiagnosticEvent,
  formatDiagnostics,
  getDiagnostics,
  logDiagnostic
} from "../services/diagnostics";
import { getProfilePhotoUri, pickAndSaveProfilePhoto, removeProfilePhoto } from "../services/profilePhoto";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";

type ProfileRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

function initialsFor(name?: string | null) {
  const parts = (name || "Rider")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";
}

function ProfileRow({ icon, label, value }: ProfileRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} color={colors.orange} size={20} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

export function ProfileScreen() {
  const { colors, mode: themeMode, setMode: setThemeMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user, logout } = useAuth();
  const autoTracking = useAutoTracking();
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>([]);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState("");
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [profilePhotoMessage, setProfilePhotoMessage] = useState("");
  const [profilePhotoLoading, setProfilePhotoLoading] = useState(false);
  const displayName = user?.name?.trim() || "Rider";
  const bikeModel = user?.bikeModel || "KTM Duke 250 Gen 3";
  const riderId = user?.id ? user.id.slice(0, 8).toUpperCase() : "Not available";

  const loadDiagnostics = useCallback(async () => {
    setDiagnostics(await getDiagnostics());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDiagnostics();
      getProfilePhotoUri(user?.id).then(setProfilePhotoUri);
    }, [loadDiagnostics, user?.id])
  );

  async function chooseProfilePhoto() {
    if (!user?.id || profilePhotoLoading) {
      return;
    }
    setProfilePhotoLoading(true);
    setProfilePhotoMessage("");
    try {
      const uri = await pickAndSaveProfilePhoto(user.id);
      if (uri) {
        setProfilePhotoUri(uri);
        setProfilePhotoMessage("Profile photo updated");
      }
    } catch (err: any) {
      setProfilePhotoMessage(err.message || "Unable to update profile photo");
    } finally {
      setProfilePhotoLoading(false);
    }
  }

  async function clearProfilePhoto() {
    if (!user?.id || profilePhotoLoading) {
      return;
    }
    setProfilePhotoLoading(true);
    setProfilePhotoMessage("");
    try {
      await removeProfilePhoto(user.id);
      setProfilePhotoUri(null);
      setProfilePhotoMessage("Profile photo removed");
    } catch (err: any) {
      setProfilePhotoMessage(err.message || "Unable to remove profile photo");
    } finally {
      setProfilePhotoLoading(false);
    }
  }

  async function exportDiagnostics() {
    setExportingDiagnostics(true);
    setDiagnosticsMessage("");
    try {
      const events = await getDiagnostics();
      const html = buildDiagnosticsHtml(formatDiagnostics(events));
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri);
    } catch (err: any) {
      setDiagnosticsMessage(err.message || "Unable to export diagnostics");
      await logDiagnostic({
        level: "error",
        area: "diagnostics",
        message: "Diagnostics export failed",
        details: err?.message || String(err)
      });
    } finally {
      setExportingDiagnostics(false);
      loadDiagnostics();
    }
  }

  async function clearLocalDiagnostics() {
    await clearDiagnostics();
    setDiagnostics([]);
    setDiagnosticsMessage("Diagnostics cleared");
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            onPress={chooseProfilePhoto}
            style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
          >
            <View style={styles.avatar}>
              {profilePhotoUri ? (
                <Image source={{ uri: profilePhotoUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initialsFor(displayName)}</Text>
              )}
            </View>
            <View style={styles.avatarBadge}>
              <Ionicons name={profilePhotoLoading ? "hourglass" : "camera"} color={colors.text} size={16} />
            </View>
          </Pressable>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Rider profile</Text>
            <Text style={styles.title}>{displayName}</Text>
            <Text style={styles.subtitle}>{bikeModel}</Text>
            {profilePhotoMessage ? <Text style={styles.profilePhotoMessage}>{profilePhotoMessage}</Text> : null}
          </View>
        </View>

        <View style={styles.card}>
          <ProfileRow icon="person" label="Name" value={displayName} />
          <ProfileRow icon="mail" label="Email" value={user?.email || "Not available"} />
          <ProfileRow icon="speedometer" label="Bike" value={bikeModel} />
          <ProfileRow icon="finger-print" label="Rider ID" value={riderId} />
        </View>

        <View style={styles.photoActions}>
          <PrimaryButton
            label={profilePhotoUri ? "Change photo" : "Add photo"}
            icon="camera"
            loading={profilePhotoLoading}
            disabled={!user?.id}
            onPress={chooseProfilePhoto}
          />
          {profilePhotoUri ? (
            <PrimaryButton
              label="Remove photo"
              icon="trash"
              danger
              disabled={!user?.id}
              onPress={clearProfilePhoto}
            />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <Text style={styles.cardCopy}>
            Your rides, reports, dashboard stats, and route history are saved to this rider account.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Theme</Text>
          <Text style={styles.cardCopy}>Choose the KTM look or a neutral universal color scheme.</Text>
          <View style={styles.themeOptions}>
            <ThemeOption
              label="KTM"
              description="Orange and black bike-focused style"
              selected={themeMode === "ktm"}
              color="#ff6a00"
              onPress={() => setThemeMode("ktm")}
            />
            <ThemeOption
              label="Universal"
              description="Neutral blue dark style"
              selected={themeMode === "universal"}
              color="#3b82f6"
              onPress={() => setThemeMode("universal")}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Diagnostics</Text>
          <Text style={styles.cardCopy}>
            API: {API_BASE_URL}
          </Text>
          <Text style={styles.cardCopy}>
            Build: {__DEV__ ? "Metro development" : "Standalone release"}
          </Text>
          {diagnosticsMessage ? <Text style={styles.success}>{diagnosticsMessage}</Text> : null}
          <View style={styles.diagnosticActions}>
            <PrimaryButton
              label="Export diagnostics"
              icon="share"
              loading={exportingDiagnostics}
              onPress={exportDiagnostics}
            />
            <PrimaryButton label="Clear diagnostics" icon="trash" danger onPress={clearLocalDiagnostics} />
          </View>
          {diagnostics.length ? (
            diagnostics.slice(0, 5).map((event) => (
              <View key={event.id} style={styles.diagnosticEvent}>
                <Text style={styles.diagnosticMeta}>
                  {event.level.toUpperCase()} / {event.area} / {new Date(event.createdAt).toLocaleString()}
                </Text>
                <Text style={styles.diagnosticMessage}>{event.message}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.cardCopy}>No diagnostics recorded.</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.cardTitle}>Auto tracking</Text>
              <Text style={styles.cardCopy}>
                {autoTracking.status.enabled
                  ? `Status: ${autoTracking.status.label}`
                  : "Enable hands-free ride detection before you start riding."}
              </Text>
            </View>
            <Switch
              value={autoTracking.status.enabled}
              disabled={autoTracking.loading}
              onValueChange={autoTracking.toggle}
              thumbColor={autoTracking.status.enabled ? colors.orange : colors.muted}
              trackColor={{ false: colors.border, true: colors.surfaceHigh }}
            />
          </View>
          {autoTracking.status.pendingCount ? (
            <View style={styles.pendingUploadBox}>
              <Text style={styles.pendingText}>
                {autoTracking.status.pendingCount} ride waiting to upload.
              </Text>
              <PrimaryButton
                label="Retry upload now"
                icon="cloud-upload"
                loading={autoTracking.loading}
                onPress={autoTracking.retryPendingUploads}
              />
            </View>
          ) : null}
          {autoTracking.syncMessage ? <Text style={styles.success}>{autoTracking.syncMessage}</Text> : null}
          {autoTracking.error ? <Text style={styles.error}>{autoTracking.error}</Text> : null}
        </View>

        <PrimaryButton label="Logout" icon="exit" danger onPress={logout} />
      </ScrollView>
    </Screen>
  );
}

function ThemeOption({
  label,
  description,
  selected,
  color,
  onPress
}: {
  label: string;
  description: string;
  selected: boolean;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.themeOption,
        selected && { borderColor: color, backgroundColor: colors.surfaceHigh },
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.themeSwatch, { backgroundColor: color }]} />
      <View style={styles.themeText}>
        <Text style={styles.themeLabel}>{label}</Text>
        <Text style={styles.themeDescription}>{description}</Text>
      </View>
      {selected ? <Ionicons name="checkmark-circle" color={color} size={22} /> : null}
    </Pressable>
  );
}

function buildDiagnosticsHtml(body: string) {
  return `
    <html>
      <body style="font-family: sans-serif; color: #111827;">
        <h1>Duke Ride diagnostics</h1>
        <p>Generated ${new Date().toLocaleString()}</p>
        <pre style="white-space: pre-wrap; font-size: 12px;">${escapeHtml(body)}</pre>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 16,
    gap: 16
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  avatarButton: {
    position: "relative"
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  avatarImage: {
    width: "100%",
    height: "100%"
  },
  avatarBadge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900"
  },
  heroText: {
    flex: 1,
    minWidth: 0
  },
  kicker: {
    color: colors.orangeSoft,
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 4
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 14
  },
  profilePhotoMessage: {
    color: colors.success,
    marginTop: 8,
    fontWeight: "700"
  },
  photoActions: {
    gap: 10
  },
  pressed: {
    opacity: 0.85
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center"
  },
  rowText: {
    flex: 1
  },
  rowLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  rowValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  cardCopy: {
    color: colors.muted,
    lineHeight: 20
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  settingText: {
    flex: 1
  },
  pendingUploadBox: {
    gap: 10
  },
  pendingText: {
    color: colors.yellow,
    fontWeight: "800"
  },
  diagnosticActions: {
    gap: 10
  },
  themeOptions: {
    gap: 10
  },
  themeOption: {
    minHeight: 68,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12
  },
  themeSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17
  },
  themeText: {
    flex: 1,
    minWidth: 0
  },
  themeLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  themeDescription: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 12
  },
  diagnosticEvent: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 4
  },
  diagnosticMeta: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: "800"
  },
  diagnosticMessage: {
    color: colors.text,
    fontWeight: "700"
  },
  success: {
    color: colors.success,
    fontWeight: "700"
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  }
});
