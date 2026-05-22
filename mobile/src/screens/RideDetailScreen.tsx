import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useFocusEffect, useRoute } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { LineChart } from "react-native-chart-kit";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { RideMap } from "../components/RideMap";
import { Screen } from "../components/Screen";
import { StatCard } from "../components/StatCard";
import { diagnosticDetails, logDiagnostic } from "../services/diagnostics";
import { importRidePhotos } from "../services/ridePhotos";
import { colors } from "../theme/colors";
import { Ride, RidePhoto, RidePoint } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";

type RideDetailParams = {
  RideDetail: {
    rideId: string;
    reviewMode?: boolean;
  };
};

const chartWidth = Dimensions.get("window").width - 32;

export function RideDetailScreen() {
  const route = useRoute<RouteProp<RideDetailParams, "RideDetail">>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [duplicateRides, setDuplicateRides] = useState<Ride[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [deletingDuplicateId, setDeletingDuplicateId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<RidePhoto[]>([]);
  const [photosSearched, setPhotosSearched] = useState(false);
  const [importingPhotos, setImportingPhotos] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setPhotoError("");
      setPhotosSearched(false);
      setPhotos([]);
      closePhotoViewer();
      const response = await api<{ ride: Ride }>(`/rides/${route.params.rideId}`);
      setRide(response.ride);
      setTitleDraft(response.ride.title || "");
      setNotesDraft(response.ride.notes || "");
      setReviewMessage(route.params.reviewMode ? "Review this ride before your next trip." : "");
      try {
        const duplicates = await api<{ duplicates: Ride[] }>(`/rides/${route.params.rideId}/duplicates`);
        setDuplicateRides(duplicates.duplicates);
      } catch (duplicateError: any) {
        setDuplicateRides([]);
        logDiagnostic({
          level: "error",
          area: "ride-review",
          message: "Duplicate ride lookup failed",
          details: diagnosticDetails(duplicateError)
        });
      }
    } catch (err: any) {
      setRide(null);
      setDuplicateRides([]);
      setError(err.message || "Unable to load ride details");
    } finally {
      setLoading(false);
    }
  }, [route.params.rideId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const speedChart = useMemo(() => buildSpeedChart(ride?.points || []), [ride?.points]);
  const needsReview = !ride?.reviewedAt;
  const photosWithLocation = useMemo(() => photos.filter((photo) => photo.hasLocation), [photos]);
  const viewerImages = useMemo(() => photos.map((photo) => ({ uri: photo.uri })), [photos]);

  async function saveReview(markReviewed = false) {
    if (!ride || reviewSaving) {
      return;
    }

    setReviewSaving(true);
    setReviewMessage("");
    try {
      const response = await api<{ ride: Partial<Ride> }>(`/rides/${ride.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: titleDraft,
          notes: notesDraft,
          markReviewed
        })
      });
      setRide((current) => current ? { ...current, ...response.ride } : current);
      setReviewMessage(markReviewed ? "Ride reviewed and saved." : "Ride review saved.");
    } catch (err: any) {
      setReviewMessage(err.message || "Unable to save ride review");
    } finally {
      setReviewSaving(false);
    }
  }

  function confirmDeleteDuplicate(duplicate: Ride) {
    Alert.alert(
      "Delete duplicate ride?",
      `${rideTitle(duplicate)}\n${shortDate(duplicate.startedAt)} - ${km(duplicate.distanceM)}\n\nThis permanently removes the duplicate ride and its route points.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteDuplicate(duplicate.id)
        }
      ]
    );
  }

  async function deleteDuplicate(rideId: string) {
    setDeletingDuplicateId(rideId);
    setReviewMessage("");
    try {
      await api(`/rides/${rideId}`, { method: "DELETE" });
      setDuplicateRides((current) => current.filter((item) => item.id !== rideId));
      setReviewMessage("Duplicate ride deleted.");
    } catch (err: any) {
      setReviewMessage(err.message || "Unable to delete duplicate ride");
    } finally {
      setDeletingDuplicateId(null);
    }
  }

  async function handleImportRidePhotos() {
    if (!ride) {
      return;
    }

    setImportingPhotos(true);
    setPhotoError("");
    try {
      const importedPhotos = await importRidePhotos(ride);
      setPhotos(importedPhotos);
      setPhotosSearched(true);
      if (!importedPhotos.length) {
        closePhotoViewer();
      }
    } catch (err: any) {
      setPhotos([]);
      setPhotosSearched(true);
      setPhotoError(err.message || "Unable to import ride photos");
      logDiagnostic({
        level: "error",
        area: "photos",
        message: "Ride photo import failed",
        details: diagnosticDetails(err)
      });
    } finally {
      setImportingPhotos(false);
    }
  }

  function openPhotoViewer(index: number) {
    if (!photos[index]) {
      return;
    }

    setPhotoViewerInitialIndex(index);
    setPhotoViewerOpen(true);
  }

  function openPhotoMarker(photo: RidePhoto) {
    const index = photos.findIndex((item) => item.id === photo.id);
    openPhotoViewer(index);
  }

  function closePhotoViewer() {
    setPhotoViewerOpen(false);
    setPhotoViewerInitialIndex(0);
  }

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </Screen>
    );
  }

  if (!ride) {
    return (
      <Screen style={styles.empty}>
        <Text style={styles.error}>{error || "Ride detail unavailable"}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Ride detail</Text>
          <Text style={styles.title}>{rideTitle(ride)}</Text>
          <Text style={styles.subtitle}>
            {time(ride.startedAt)} to {ride.endedAt ? time(ride.endedAt) : "--"}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.card, needsReview && styles.reviewCard]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Ride Review</Text>
              <Text style={styles.sectionMeta}>
                {needsReview ? "Name this ride, add notes, then mark it reviewed." : "This ride has been reviewed."}
              </Text>
            </View>
            <View style={[styles.reviewBadge, needsReview ? styles.reviewBadgeOpen : styles.reviewBadgeDone]}>
              <Text style={styles.reviewBadgeText}>{needsReview ? "OPEN" : "DONE"}</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Ride name</Text>
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="Sunday breakfast ride"
              placeholderTextColor={colors.muted}
              maxLength={120}
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="Road condition, stops, fuel, anything worth remembering"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={2000}
              style={[styles.input, styles.notesInput]}
              textAlignVertical="top"
            />
          </View>

          {reviewMessage ? <Text style={styles.reviewMessage}>{reviewMessage}</Text> : null}

          <View style={styles.reviewActions}>
            <PrimaryButton
              label="Save review"
              icon="save"
              loading={reviewSaving}
              onPress={() => saveReview(false)}
            />
            <PrimaryButton
              label={needsReview ? "Mark reviewed" : "Reviewed"}
              icon="checkmark-circle"
              disabled={!needsReview}
              loading={reviewSaving}
              onPress={() => saveReview(true)}
            />
          </View>

          <View style={styles.duplicateBlock}>
            <Text style={styles.duplicateTitle}>Suspected duplicates</Text>
            {duplicateRides.length ? (
              duplicateRides.map((duplicate) => (
                <View key={duplicate.id} style={styles.duplicateCard}>
                  <View style={styles.duplicateText}>
                    <Text numberOfLines={2} style={styles.duplicateName}>{rideTitle(duplicate)}</Text>
                    <Text style={styles.duplicateMeta}>
                      {shortDate(duplicate.startedAt)} - {km(duplicate.distanceM)} - {duration(duplicate.durationS)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={deletingDuplicateId === duplicate.id}
                    onPress={() => confirmDeleteDuplicate(duplicate)}
                    style={({ pressed }) => [
                      styles.deleteDuplicateButton,
                      pressed && styles.pressedPhoto,
                      deletingDuplicateId === duplicate.id && styles.disabledButton
                    ]}
                  >
                    <Ionicons name="trash" color={colors.text} size={18} />
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={styles.sectionMeta}>No exact duplicate rides found for this route.</Text>
            )}
          </View>
        </View>

        {ride.points?.length ? (
          <RideMap
            coordinates={ride.points}
            title={`${ride.startLabel} to ${ride.endLabel}`}
            photoMarkers={photosWithLocation}
            onPhotoMarkerPress={openPhotoMarker}
          />
        ) : (
          <View style={styles.emptyMap}>
            <Ionicons name="map" color={colors.muted} size={26} />
            <Text style={styles.emptyMapText}>Route points unavailable</Text>
          </View>
        )}

        <View style={styles.grid}>
          <StatCard label="Distance" value={km(ride.distanceM)} accent={colors.orange} />
          <StatCard label="Duration" value={duration(ride.durationS)} />
          <StatCard label="Top speed" value={kmh(ride.topSpeedKmh)} accent={colors.yellow} />
          <StatCard label="Average" value={kmh(ride.avgSpeedKmh)} accent={colors.blue} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Route summary</Text>
          <RouteRow icon="radio-button-on" label="From" value={ride.startLabel} />
          <RouteRow icon="flag" label="To" value={ride.endLabel} />
          <RouteRow icon="calendar" label="Date" value={`${shortDate(ride.startedAt)} at ${time(ride.startedAt)}`} />
          <RouteRow icon="pulse" label="GPS points" value={`${ride.points?.length || 0}`} />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Photos from this ride</Text>
              <Text style={styles.sectionMeta}>
                Finds phone camera photos taken between ride start and end time.
              </Text>
            </View>
          </View>
          <PrimaryButton
            label="Import ride photos"
            icon="images"
            loading={importingPhotos}
            onPress={handleImportRidePhotos}
          />
          {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
          {photos.length ? (
            <>
              <Text style={styles.photoMeta}>
                {photos.length} found, {photosWithLocation.length} with map location.
              </Text>
              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <Pressable
                    accessibilityRole="imagebutton"
                    key={photo.id}
                    onPress={() => openPhotoViewer(index)}
                    style={({ pressed }) => [styles.photoTile, pressed && styles.pressedPhoto]}
                  >
                    <Image source={{ uri: photo.uri }} style={styles.photo} />
                    <View style={styles.photoFooter}>
                      <Text style={styles.photoTime}>{time(photo.createdAt)}</Text>
                      {photo.hasLocation ? <Ionicons name="location" color={colors.blue} size={14} /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          ) : photosSearched && !photoError ? (
            <View style={styles.photoEmpty}>
              <Ionicons name="images" color={colors.muted} size={26} />
              <Text style={styles.photoEmptyTitle}>No photos found</Text>
              <Text style={styles.photoEmptyText}>
                Photos taken with your normal camera during this ride window will appear here.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.chartBlock}>
          <Text style={styles.sectionTitle}>Speed over time</Text>
          <LineChart
            width={chartWidth}
            height={220}
            data={{
              labels: speedChart.labels,
              datasets: [{ data: speedChart.data }]
            }}
            yAxisSuffix=" km/h"
            chartConfig={{
              backgroundGradientFrom: colors.surface,
              backgroundGradientTo: colors.surface,
              color: () => colors.orange,
              labelColor: () => colors.muted,
              decimalPlaces: 0,
              propsForDots: { r: "4", strokeWidth: "2", stroke: colors.orange }
            }}
            bezier
            style={styles.chart}
          />
        </View>
      </ScrollView>
      {viewerImages.length ? (
        <ImageViewing
          images={viewerImages}
          imageIndex={Math.min(photoViewerInitialIndex, viewerImages.length - 1)}
          visible={photoViewerOpen}
          onRequestClose={closePhotoViewer}
          animationType="none"
          backgroundColor="#000"
          doubleTapToZoomEnabled
          swipeToCloseEnabled
          HeaderComponent={({ imageIndex }) => (
            <View style={styles.viewerHeader}>
              <Text style={styles.viewerCount}>{imageIndex + 1} / {photos.length}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close photo viewer"
                onPress={closePhotoViewer}
                style={styles.viewerClose}
              >
                <Ionicons name="close" color={colors.text} size={26} />
              </Pressable>
            </View>
          )}
          FooterComponent={({ imageIndex }) => (
            <PhotoViewerFooter photo={photos[imageIndex]} index={imageIndex} total={photos.length} />
          )}
        />
      ) : null}
    </Screen>
  );
}

function rideTitle(ride: Ride) {
  return ride.title?.trim() || `${shortDate(ride.startedAt)} ride`;
}

function PhotoViewerFooter({ photo, index, total }: { photo?: RidePhoto; index: number; total: number }) {
  if (!photo) {
    return null;
  }

  return (
    <View style={styles.viewerFooter}>
      <Text style={styles.viewerTitle}>Photo {index + 1} of {total}</Text>
      <Text style={styles.viewerMeta}>
        {time(photo.createdAt)} - {photo.hasLocation ? "Map location available" : "No map location"}
      </Text>
    </View>
  );
}

function RouteRow({
  icon,
  label,
  value
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.routeRow}>
      <View style={styles.routeIcon}>
        <Ionicons name={icon} color={colors.orange} size={18} />
      </View>
      <View style={styles.routeText}>
        <Text style={styles.routeLabel}>{label}</Text>
        <Text style={styles.routeValue}>{value}</Text>
      </View>
    </View>
  );
}

function buildSpeedChart(points: RidePoint[]) {
  const speeds = points.map((point) => Math.max(0, Math.round(point.speedKmh || 0)));
  if (!speeds.length) {
    return { labels: ["--"], data: [0] };
  }

  const sampleCount = Math.min(6, speeds.length);
  const step = Math.max(1, Math.floor(speeds.length / sampleCount));
  const sampled = points.filter((_, index) => index % step === 0).slice(0, sampleCount);
  const labels = sampled.map((point) => time(point.recordedAt));
  const data = sampled.map((point) => Math.max(0, Math.round(point.speedKmh || 0)));
  return {
    labels: labels.length ? labels : ["--"],
    data: data.length ? data : [0]
  };
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
  empty: {
    padding: 16,
    justifyContent: "center"
  },
  content: {
    padding: 16,
    gap: 16
  },
  hero: {
    gap: 4
  },
  kicker: {
    color: colors.orange,
    fontWeight: "900"
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14
  },
  emptyMap: {
    minHeight: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  emptyMapText: {
    color: colors.muted,
    fontWeight: "800"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12
  },
  reviewCard: {
    borderColor: colors.orange
  },
  reviewBadge: {
    minWidth: 58,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  reviewBadgeOpen: {
    backgroundColor: colors.orange
  },
  reviewBadgeDone: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1
  },
  reviewBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900"
  },
  inputGroup: {
    gap: 6
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "700"
  },
  notesInput: {
    minHeight: 104,
    paddingTop: 12,
    lineHeight: 20
  },
  reviewMessage: {
    color: colors.yellow,
    fontWeight: "800"
  },
  reviewActions: {
    gap: 10
  },
  duplicateBlock: {
    gap: 10,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 12
  },
  duplicateTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  duplicateCard: {
    minHeight: 62,
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceHigh,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  duplicateText: {
    flex: 1,
    minWidth: 0
  },
  duplicateName: {
    color: colors.text,
    fontWeight: "900"
  },
  duplicateMeta: {
    color: colors.muted,
    marginTop: 3
  },
  deleteDuplicateButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger
  },
  disabledButton: {
    opacity: 0.55
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  sectionHeader: {
    flexDirection: "row",
    gap: 12
  },
  sectionHeaderText: {
    flex: 1
  },
  sectionMeta: {
    color: colors.muted,
    marginTop: 4,
    lineHeight: 19
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  routeIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center"
  },
  routeText: {
    flex: 1
  },
  routeLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  routeValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2
  },
  chartBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingTop: 14
  },
  chart: {
    borderRadius: 8,
    marginTop: 8
  },
  photoMeta: {
    color: colors.orange,
    fontWeight: "800"
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  photoTile: {
    width: "31%",
    minWidth: 96,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1
  },
  pressedPhoto: {
    opacity: 0.78
  },
  photo: {
    width: "100%",
    aspectRatio: 1
  },
  photoFooter: {
    minHeight: 30,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  photoTime: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800"
  },
  photoEmpty: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    gap: 6,
    padding: 18
  },
  photoEmptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  photoEmptyText: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 19
  },
  error: {
    color: colors.danger
  },
  viewerHeader: {
    paddingTop: 42,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  viewerCount: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16
  },
  viewerClose: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  viewerFooter: {
    paddingHorizontal: 18,
    paddingBottom: 34,
    gap: 4
  },
  viewerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center"
  },
  viewerMeta: {
    color: colors.muted,
    textAlign: "center"
  }
});
