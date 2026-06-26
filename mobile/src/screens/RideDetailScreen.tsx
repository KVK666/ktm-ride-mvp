import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share as NativeShare,
  Text,
  TextInput,
  View
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Metric } from "../components/Metric";
import { ChapterTimeline } from "../components/ChapterTimeline";
import { RideBadge } from "../components/RideBadge";
import { RouteReplay } from "../components/RouteReplay";
import { RideSlideshowModal } from "../components/RideSlideshowModal";
import { RouteArtwork } from "../components/RouteArtwork";
import { RideMap } from "../components/RideMap";
import { Screen } from "../components/Screen";
import { RIDE_STORY_HEIGHT, RIDE_STORY_WIDTH, RideStoryCard } from "../components/RideStoryCard";
import { diagnosticDetails, logDiagnostic } from "../services/diagnostics";
import {
  buildRideStoryPrompt,
  fetchRideWeatherMood,
  rankStoryPromptVariants,
  recommendedStoryPromptVariant,
  StoryPromptVariant,
  RideWeatherMood,
  STORY_PROMPT_VARIANTS,
  StoryPromptVariantId
} from "../services/rideStoryPrompt";
import { shareRideStoryImage } from "../services/rideStoryShare";
import { getRideAlbum, importRideWindowPhotosToAlbum, pickManualPhotosForAlbum, removeAlbumPhoto } from "../services/rideAlbums";
import { ThemeColors, typography } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { Ride, RideAlbum, RideAlbumPhoto, RideIntelligence, RidePhoto, RidePoint } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";

type RideDetailParams = {
  RideDetail: {
    rideId: string;
    reviewMode?: boolean;
  };
};

const chartWidth = Dimensions.get("window").width - 40;

export function RideDetailScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const route = useRoute<RouteProp<RideDetailParams, "RideDetail">>();
  const navigation = useNavigation<any>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [intelligence, setIntelligence] = useState<RideIntelligence | null>(null);
  const [duplicateRides, setDuplicateRides] = useState<Ride[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [deletingDuplicateId, setDeletingDuplicateId] = useState<string | null>(null);
  const [deletingRide, setDeletingRide] = useState(false);
  const [album, setAlbum] = useState<RideAlbum | null>(null);
  const [photos, setPhotos] = useState<RideAlbumPhoto[]>([]);
  const [photosSearched, setPhotosSearched] = useState(false);
  const [importingPhotos, setImportingPhotos] = useState(false);
  const [manualImportingPhotos, setManualImportingPhotos] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const [storySharing, setStorySharing] = useState(false);
  const [storyMessage, setStoryMessage] = useState("");
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptVariantId, setPromptVariantId] = useState<StoryPromptVariantId>("cinematic");
  const [promptSeed, setPromptSeed] = useState(0);
  const [promptWeather, setPromptWeather] = useState<RideWeatherMood | null>(null);
  const [promptWeatherLoading, setPromptWeatherLoading] = useState(false);
  const [promptWeatherRideId, setPromptWeatherRideId] = useState<string | null>(null);
  const [promptActionMessage, setPromptActionMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const storyCaptureRef = useRef<View | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setPhotoError("");
      setPhotosSearched(false);
      setPhotos([]);
      closePhotoViewer();
      const response = await api<{ ride: Ride }>(`/rides/${route.params.rideId}`);
      if (!response.ride) {
        throw new Error("Ride detail unavailable");
      }
      const nextRide = normalizeRide(response.ride);
      setRide(nextRide);
      const nextAlbum = await getRideAlbum(nextRide.id);
      setAlbum(nextAlbum);
      setPhotos(nextAlbum?.photos || []);
      setPhotosSearched(Boolean(nextAlbum?.photos.length));
      setIntelligence(null);
      setTitleDraft(nextRide.title || "");
      setNotesDraft(nextRide.notes || "");
      setReviewMessage(route.params.reviewMode ? "Review this ride before your next trip." : "");
      try {
        const [duplicates, smart] = await Promise.all([
          api<{ duplicates: Ride[] }>(`/rides/${route.params.rideId}/duplicates`),
          api<{ intelligence: RideIntelligence }>(`/rides/${route.params.rideId}/intelligence`).catch(() => ({ intelligence: buildFallbackIntelligence(nextRide) }))
        ]);
        setDuplicateRides(Array.isArray(duplicates.duplicates) ? duplicates.duplicates.map(normalizeRide) : []);
        setIntelligence(normalizeIntelligence(smart.intelligence, nextRide));
      } catch (duplicateError: any) {
        setDuplicateRides([]);
        setIntelligence(buildFallbackIntelligence(nextRide));
        logDiagnostic({
          level: "error",
          area: "ride-review",
          message: "Duplicate ride lookup failed",
          details: diagnosticDetails(duplicateError)
        });
      }
    } catch (err: any) {
      setRide(null);
      setIntelligence(null);
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

  useEffect(() => {
    let cancelled = false;

    async function loadPromptWeather() {
      if (!promptModalOpen || !ride || promptWeatherRideId === ride.id) {
        return;
      }

      setPromptWeatherLoading(true);
      setPromptWeather(null);
      setPromptWeatherRideId(ride.id);
      try {
        const weather = await fetchRideWeatherMood(ride);
        if (!cancelled) {
          setPromptWeather(weather);
          setPromptVariantId(recommendedStoryPromptVariant(ride, weather));
        }
      } finally {
        setPromptWeatherLoading(false);
        if (cancelled) {
          setPromptWeatherRideId((current) => current === ride.id ? null : current);
        }
      }
    }

    loadPromptWeather();

    return () => {
      cancelled = true;
    };
  }, [promptModalOpen, promptWeatherRideId, ride]);

  const speedChart = useMemo(() => buildSpeedChart(ride?.points || []), [ride?.points]);
  const needsReview = !ride?.reviewedAt;
  const photosWithLocation = useMemo(() => photos.filter((photo) => photo.hasLocation), [photos]);
  const viewerImages = useMemo(() => photos.map((photo) => ({ uri: photo.uri })), [photos]);
  const rankedPromptVariants = useMemo(
    () => ride ? rankStoryPromptVariants(ride, promptWeather) : STORY_PROMPT_VARIANTS,
    [promptWeather, ride]
  );
  const selectedPrompt = useMemo(
    () => ride ? buildRideStoryPrompt(ride, promptVariantId, promptWeather, promptSeed) : "",
    [promptSeed, promptVariantId, promptWeather, ride]
  );
  const displayTitle = intelligence?.suggestedTitle || rideTitle(ride || ({} as Ride));

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      setReviewMessage(err.message || "Unable to save ride review");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } catch (err: any) {
      setReviewMessage(err.message || "Unable to delete duplicate ride");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setDeletingDuplicateId(null);
    }
  }

  function confirmDeleteRide() {
    if (!ride || deletingRide) {
      return;
    }

    Alert.alert(
      "Delete this ride?",
      `${displayTitle}\n${shortDate(ride.startedAt)} · ${km(ride.distanceM)}\n\nThis permanently removes the ride and its saved route points.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete ride",
          style: "destructive",
          onPress: () => deleteCurrentRide()
        }
      ]
    );
  }

  async function deleteCurrentRide() {
    if (!ride || deletingRide) {
      return;
    }

    setDeletingRide(true);
    setReviewMessage("");
    try {
      await api(`/rides/${ride.id}`, { method: "DELETE" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      navigation.navigate("MainTabs", { screen: "History" });
    } catch (err: any) {
      setReviewMessage(err.message || "Unable to delete this ride");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setDeletingRide(false);
    }
  }

  async function handleImportRidePhotos() {
    if (!ride) {
      return;
    }

    setImportingPhotos(true);
    setPhotoError("");
    try {
      const nextAlbum = await importRideWindowPhotosToAlbum(ride);
      setAlbum(nextAlbum);
      setPhotos(nextAlbum.photos);
      setPhotosSearched(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!nextAlbum.photos.length) {
        closePhotoViewer();
      }
    } catch (err: any) {
      setPhotosSearched(true);
      setPhotoError(err.message || "Unable to import ride photos");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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

  async function handleManualPhotoImport() {
    if (!ride) {
      return;
    }

    setManualImportingPhotos(true);
    setPhotoError("");
    try {
      const nextAlbum = await pickManualPhotosForAlbum(ride);
      if (nextAlbum) {
        setAlbum(nextAlbum);
        setPhotos(nextAlbum.photos);
        setPhotosSearched(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (err: any) {
      setPhotoError(err.message || "Unable to add photos");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      await logDiagnostic({
        level: "error",
        area: "photos",
        message: "Manual ride photo import failed",
        details: diagnosticDetails(err)
      });
    } finally {
      setManualImportingPhotos(false);
    }
  }

  function confirmRemovePhoto(photo: RideAlbumPhoto) {
    Alert.alert(
      "Remove photo from album?",
      "This only removes the local RidePulse album copy. Your original gallery photo is not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removePhotoFromAlbum(photo.id) }
      ]
    );
  }

  async function removePhotoFromAlbum(photoId: string) {
    if (!ride) {
      return;
    }

    try {
      const nextAlbum = await removeAlbumPhoto(ride.id, photoId);
      setAlbum(nextAlbum);
      setPhotos(nextAlbum.photos);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (!nextAlbum.photos.length) {
        closePhotoViewer();
      }
    } catch (err: any) {
      setPhotoError(err.message || "Unable to remove photo");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }

  async function handleShareStoryImage() {
    if (!ride || storySharing) {
      return;
    }

    setStorySharing(true);
    setStoryMessage("");
    try {
      if (!storyCaptureRef.current) {
        throw new Error("Story image is not ready yet");
      }
      await waitForCaptureReady();
      const uri = await captureRef(storyCaptureRef, {
        fileName: `ridepulse-${ride.id.slice(0, 8)}`,
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: 1080,
        height: 1920
      });
      const result = await shareRideStoryImage(uri);
      setStoryMessage(result.message);
    } catch (err: any) {
      setStoryMessage(err.message || "Unable to share story image");
      await logDiagnostic({
        level: "error",
        area: "ride-story",
        message: "Ride story image share failed",
        details: diagnosticDetails(err)
      });
    } finally {
      setStorySharing(false);
    }
  }

  function openPromptModal() {
    if (!ride) {
      return;
    }
    setPromptActionMessage("");
    setPromptSeed((current) => current + 1);
    setPromptVariantId(recommendedStoryPromptVariant(ride, promptWeather));
    setPromptModalOpen(true);
  }

  function closePromptModal() {
    setPromptModalOpen(false);
    setPromptActionMessage("");
  }

  function selectPromptVariant(variantId: StoryPromptVariantId) {
    setPromptVariantId(variantId);
    setPromptSeed((current) => current + 1);
    setPromptActionMessage("");
  }

  function regeneratePrompt() {
    if (!rankedPromptVariants.length) {
      return;
    }
    const currentIndex = rankedPromptVariants.findIndex((variant) => variant.id === promptVariantId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % rankedPromptVariants.length : 0;
    setPromptVariantId(rankedPromptVariants[nextIndex].id);
    setPromptSeed((current) => current + 1);
    setPromptActionMessage("");
  }

  async function copyPrompt() {
    try {
      await Clipboard.setStringAsync(selectedPrompt);
      setPromptActionMessage("Prompt copied. Paste it in ChatGPT to generate the story image.");
    } catch (err: any) {
      setPromptActionMessage(err.message || "Unable to copy prompt");
    }
  }

  async function sharePrompt() {
    try {
      await NativeShare.share({
        title: "RidePulse AI story prompt",
        message: selectedPrompt
      });
      setPromptActionMessage("Prompt shared.");
    } catch (err: any) {
      setPromptActionMessage(err.message || "Unable to share prompt");
    }
  }

  async function openChatGpt() {
    try {
      await Clipboard.setStringAsync(selectedPrompt);
      setPromptActionMessage("Prompt copied. Paste it in ChatGPT after it opens.");
      await Linking.openURL("https://chatgpt.com/");
    } catch (err: any) {
      setPromptActionMessage(err.message || "Unable to open ChatGPT");
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
        <RouteArtwork coordinates={ride.points} start={{ latitude: ride.startLatitude, longitude: ride.startLongitude }} end={{ latitude: ride.endLatitude, longitude: ride.endLongitude }} height={270} />
        <View style={styles.hero}>
          <Text style={styles.kicker}>JOURNEY</Text>
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.subtitle}>
            {time(ride.startedAt)} to {ride.endedAt ? time(ride.endedAt) : "--"}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.smartCard}>
          <Text style={styles.kicker}>SMART JOURNAL</Text>
          <Text style={styles.smartTitle}>{intelligence?.summaryText || ride.summaryText || "RidePulse built a story layer from this ride’s saved route."}</Text>
          {intelligence?.highlightReason || ride.highlightReason ? <Text style={styles.sectionMeta}>{intelligence?.highlightReason || ride.highlightReason}</Text> : null}
          {ride.albumHint ? <Text style={styles.albumHint}>{ride.albumHint}</Text> : null}
          {intelligence?.badges?.length || ride.badges?.length ? (
            <View style={styles.badgeRow}>
              {(intelligence?.badges || ride.badges || []).slice(0, 4).map((badge, index) => (
                <RideBadge key={`${badge}-${index}`} label={badge} tone={index === 0 ? "accent" : "blue"} />
              ))}
            </View>
          ) : null}
          {intelligence?.suggestedTitle && !titleDraft.trim() ? (
            <Pressable onPress={() => setTitleDraft(intelligence.suggestedTitle)} style={styles.suggestButton}>
              <Ionicons name="create" color={colors.onAccent} size={16} />
              <Text style={styles.suggestButtonText}>Use suggested title</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Ride story</Text>
              <Text style={styles.sectionMeta}>
                Share a local story image, or copy a varied ChatGPT prompt for a custom AI image.
              </Text>
            </View>
          </View>
          <View style={styles.storyActions}>
            <PrimaryButton
              label="Share story"
              icon="logo-instagram"
              compact
              loading={storySharing}
              onPress={handleShareStoryImage}
            />
            <PrimaryButton
              label="AI prompt"
              icon="sparkles"
              compact
              onPress={openPromptModal}
            />
          </View>
          {storyMessage ? <Text style={styles.reviewMessage}>{storyMessage}</Text> : null}
        </View>

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
              label="Save"
              icon="save"
              compact
              loading={reviewSaving}
              onPress={() => saveReview(false)}
            />
            <PrimaryButton
              label={needsReview ? "Reviewed" : "Done"}
              icon="checkmark-circle"
              compact
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

        <RouteReplay coordinates={ride.points?.length ? ride.points : ride.routePreview} title="Route pulse" />

        <ChapterTimeline chapters={intelligence?.chapters || []} />

        <View style={styles.metricStrip}>
          <Metric label="DISTANCE" value={km(ride.distanceM)} accent />
          <View style={styles.metricDivider} />
          <Metric label="DURATION" value={duration(ride.durationS)} />
          <View style={styles.metricDivider} />
          <Metric label="TOP SPEED" value={kmh(ride.topSpeedKmh)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Route summary</Text>
          <RouteRow icon="radio-button-on" label="From" value={ride.startLabel} />
          <RouteRow icon="flag" label="To" value={ride.endLabel} />
          <RouteRow icon="calendar" label="Date" value={`${shortDate(ride.startedAt)} at ${time(ride.startedAt)}`} />
          <RouteRow icon="pulse" label="GPS points" value={`${ride.points?.length || 0}`} />
        </View>

        <View style={styles.albumCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Ride Album</Text>
              <Text style={styles.sectionMeta}>
                Local photos for this ride. They stay on this phone and can become a slideshow memory.
              </Text>
            </View>
            {photos.length ? <Text style={styles.albumCount}>{photos.length}</Text> : null}
          </View>
          {album?.coverUri ? <Image source={{ uri: album.coverUri }} style={styles.albumCover} /> : null}
          <View style={styles.storyActions}>
            <PrimaryButton
              label="Find ride photos"
              icon="images"
              compact
              loading={importingPhotos}
              onPress={handleImportRidePhotos}
            />
            <PrimaryButton
              label="Add manually"
              icon="add-circle"
              compact
              loading={manualImportingPhotos}
              onPress={handleManualPhotoImport}
            />
            <PrimaryButton
              label="Slideshow"
              icon="play-circle"
              compact
              disabled={!ride}
              onPress={() => setSlideshowOpen(true)}
            />
          </View>
          {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
          {photos.length ? (
            <>
              <Text style={styles.photoMeta}>
                {photos.length} saved locally, {photosWithLocation.length} with map location.
              </Text>
              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <View key={photo.id} style={styles.photoTile}>
                    <Pressable
                      accessibilityRole="imagebutton"
                      onPress={() => openPhotoViewer(index)}
                      style={({ pressed }) => [styles.photoPress, pressed && styles.pressedPhoto]}
                    >
                    <Image source={{ uri: photo.uri }} style={styles.photo} />
                    <View style={styles.photoFooter}>
                      <Text style={styles.photoTime}>{time(photo.createdAt)}</Text>
                      {photo.hasLocation ? <Ionicons name="location" color={colors.blue} size={14} /> : null}
                    </View>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => confirmRemovePhoto(photo)} style={styles.removePhotoButton}>
                      <Ionicons name="close" color={colors.text} size={16} />
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => { setPhotoViewerInitialIndex(index); setSlideshowOpen(true); }} style={styles.playPhotoButton}>
                      <Ionicons name="play" color={colors.onAccent} size={14} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : photosSearched && !photoError ? (
            <View style={styles.photoEmpty}>
              <Ionicons name="images" color={colors.muted} size={26} />
              <Text style={styles.photoEmptyTitle}>No album photos yet</Text>
              <Text style={styles.photoEmptyText}>
                Try finding photos from the ride window, or add any gallery photo manually.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.chartBlock}>
          <Text style={styles.sectionTitle}>Speed over time</Text>
          <SpeedTrend data={speedChart.data} labels={speedChart.labels} width={chartWidth} colors={colors} />
        </View>

        <View style={styles.dangerCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Ride controls</Text>
              <Text style={styles.sectionMeta}>Delete this ride if it was a test, duplicate, or something you don’t want in the journal.</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={deletingRide}
            onPress={confirmDeleteRide}
            style={({ pressed }) => [styles.deleteRideButton, pressed && styles.pressedPhoto, deletingRide && styles.disabledButton]}
          >
            <Ionicons name="trash" color={colors.text} size={18} />
            <Text style={styles.deleteRideText}>{deletingRide ? "Deleting..." : "Delete this ride"}</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View pointerEvents="none" style={styles.storyCaptureStage}>
        <View ref={storyCaptureRef} collapsable={false}>
          <RideStoryCard ride={ride} />
        </View>
      </View>
      <StoryPromptModal
        visible={promptModalOpen}
        variants={rankedPromptVariants}
        selectedVariantId={promptVariantId}
        prompt={selectedPrompt}
        weather={promptWeather}
        weatherLoading={promptWeatherLoading}
        actionMessage={promptActionMessage}
        onClose={closePromptModal}
        onSelectVariant={selectPromptVariant}
        onRegenerate={regeneratePrompt}
        onCopy={copyPrompt}
        onShare={sharePrompt}
        onOpenChatGpt={openChatGpt}
      />
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
      <RideSlideshowModal
        visible={slideshowOpen}
        ride={ride}
        photos={photos}
        initialIndex={photoViewerInitialIndex}
        onClose={() => setSlideshowOpen(false)}
      />
    </Screen>
  );
}

function rideTitle(ride: Ride) {
  return ride.title?.trim() || ride.smartTitle || `${shortDate(ride.startedAt)} ride`;
}

function normalizeIntelligence(value: any, ride: Ride): RideIntelligence {
  const fallback = buildFallbackIntelligence(ride);
  return {
    suggestedTitle: String(value?.suggestedTitle || fallback.suggestedTitle),
    summaryText: String(value?.summaryText || fallback.summaryText),
    badges: Array.isArray(value?.badges) ? value.badges.map(String).filter(Boolean).slice(0, 4) : fallback.badges,
    highlightReason: typeof value?.highlightReason === "string" ? value.highlightReason : fallback.highlightReason,
    fastestSegment: value?.fastestSegment && typeof value.fastestSegment === "object" ? {
      speedKmh: finiteNumber(value.fastestSegment.speedKmh),
      distanceM: finiteNumber(value.fastestSegment.distanceM),
      durationS: finiteNumber(value.fastestSegment.durationS),
      startedAt: typeof value.fastestSegment.startedAt === "string" ? value.fastestSegment.startedAt : null,
      endedAt: typeof value.fastestSegment.endedAt === "string" ? value.fastestSegment.endedAt : null,
      coordinate: normalizeCoordinate(value.fastestSegment.coordinate)
    } : null,
    midpoint: normalizeCoordinate(value?.midpoint),
    comparisons: value?.comparisons && typeof value.comparisons === "object" ? {
      distanceVsLongestM: value.comparisons.distanceVsLongestM == null ? null : finiteNumber(value.comparisons.distanceVsLongestM),
      monthSharePercent: value.comparisons.monthSharePercent == null ? null : finiteNumber(value.comparisons.monthSharePercent)
    } : fallback.comparisons,
    chapters: Array.isArray(value?.chapters)
      ? value.chapters.map(normalizeChapter).filter(Boolean).slice(0, 4) as RideIntelligence["chapters"]
      : fallback.chapters
  };
}

function buildFallbackIntelligence(ride: Ride): RideIntelligence {
  const title = ride.smartTitle || ride.title?.trim() || `${shortDate(ride.startedAt)} ride`;
  const summary = ride.summaryText || `${km(ride.distanceM)} recorded from ${ride.startLabel} to ${ride.endLabel}.`;
  const badges = Array.isArray(ride.badges) && ride.badges.length ? ride.badges : [
    ride.distanceM >= 30000 ? "Open road" : "Quick spin",
    ride.reviewedAt ? "Reviewed" : "Needs story"
  ];
  return {
    suggestedTitle: title,
    summaryText: summary,
    badges,
    highlightReason: ride.highlightReason || "Built from saved ride data.",
    fastestSegment: null,
    midpoint: null,
    comparisons: {},
    chapters: [
      { id: "start", title: "Roll out", body: ride.startLabel, timestamp: ride.startedAt, coordinate: { latitude: ride.startLatitude, longitude: ride.startLongitude } },
      { id: "finish", title: "Finish", body: ride.endLabel, timestamp: ride.endedAt || null, coordinate: { latitude: ride.endLatitude, longitude: ride.endLongitude } }
    ]
  };
}

function normalizeChapter(value: any) {
  const coordinate = normalizeCoordinate(value?.coordinate);
  if (!value || typeof value !== "object" || !coordinate) {
    return null;
  }
  return {
    id: String(value.id || value.title || "chapter"),
    title: String(value.title || "Ride chapter"),
    body: String(value.body || ""),
    timestamp: typeof value.timestamp === "string" ? value.timestamp : null,
    coordinate
  };
}

function normalizeCoordinate(value: any) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
}

function PhotoViewerFooter({ photo, index, total }: { photo?: RidePhoto; index: number; total: number }) {
  const styles = useThemedStyles(createStyles);

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

function StoryPromptModal({
  visible,
  variants,
  selectedVariantId,
  prompt,
  weather,
  weatherLoading,
  actionMessage,
  onClose,
  onSelectVariant,
  onRegenerate,
  onCopy,
  onShare,
  onOpenChatGpt
}: {
  visible: boolean;
  variants: StoryPromptVariant[];
  selectedVariantId: StoryPromptVariantId;
  prompt: string;
  weather: RideWeatherMood | null;
  weatherLoading: boolean;
  actionMessage: string;
  onClose: () => void;
  onSelectVariant: (variantId: StoryPromptVariantId) => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onShare: () => void;
  onOpenChatGpt: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <ScrollView contentContainerStyle={styles.promptModalContent}>
          <View style={styles.promptHeader}>
            <View style={styles.promptHeaderText}>
              <Text style={styles.kicker}>ChatGPT image prompt</Text>
              <Text style={styles.promptTitle}>AI story prompt</Text>
              <Text style={styles.sectionMeta}>
                Copy this into ChatGPT to generate a custom story image from exact ride details.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close prompt modal"
              onPress={onClose}
              style={styles.promptClose}
            >
              <Ionicons name="close" color={colors.text} size={24} />
            </Pressable>
          </View>

          <View style={styles.weatherPill}>
            <Ionicons name={weatherLoading ? "cloudy" : weather ? "partly-sunny" : "time"} color={colors.orange} size={18} />
            <Text style={styles.weatherText}>
              {weatherLoading
                ? "Checking weather mood..."
                : weather
                  ? `Weather mood: ${weather.label}`
                  : "Weather unavailable, using ride time and place mood"}
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variantTabs}>
            {variants.map((variant) => {
              const selected = variant.id === selectedVariantId;
              return (
                <Pressable
                  key={variant.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelectVariant(variant.id)}
                  style={({ pressed }) => [
                    styles.variantTab,
                    selected && styles.variantTabActive,
                    pressed && styles.pressedPhoto
                  ]}
                >
                  <Text style={[styles.variantTabText, selected && styles.variantTabTextActive]}>
                    {variant.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.promptBox}>
            <Text selectable style={styles.promptText}>{prompt}</Text>
          </View>

          {actionMessage ? <Text style={styles.reviewMessage}>{actionMessage}</Text> : null}

          <View style={styles.promptActions}>
            <PrimaryButton label="Refresh" icon="refresh" compact onPress={onRegenerate} />
            <PrimaryButton label="Copy" icon="copy" compact onPress={onCopy} />
            <PrimaryButton label="Share" icon="share-social" compact onPress={onShare} />
            <PrimaryButton label="ChatGPT" icon="open" compact onPress={onOpenChatGpt} />
          </View>
        </ScrollView>
      </Screen>
    </Modal>
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

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

function SpeedTrend({ data, labels, width, colors }: { data: number[]; labels: string[]; width: number; colors: ThemeColors }) {
  const styles = useThemedStyles(createStyles);
  const safeData = data.length ? data.map(finiteNumber) : [0];
  const height = 190;
  const padding = 18;
  const max = Math.max(...safeData, 1);
  const points = safeData.map((value, index) => ({
    x: padding + (index / Math.max(1, safeData.length - 1)) * (width - padding * 2),
    y: height - padding - (value / max) * (height - padding * 2)
  }));
  return (
    <View accessibilityLabel={`Speed trend, maximum ${Math.round(max)} kilometres per hour`}>
      <Svg width={width} height={height}>
        {[0.25, 0.5, 0.75].map((position) => <Line key={position} x1={padding} x2={width - padding} y1={height * position} y2={height * position} stroke={colors.border} strokeDasharray="3 8" />)}
        <Polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={colors.accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r="4" fill={colors.surface} stroke={colors.accent} strokeWidth="3" />)}
      </Svg>
      <View style={styles.speedLabels}>{labels.map((label, index) => <Text key={`${label}-${index}`} style={styles.speedLabel}>{label}</Text>)}</View>
    </View>
  );
}

function buildSpeedChart(points: RidePoint[]) {
  const speeds = points.map((point) => Math.max(0, Math.round(finiteNumber(point.speedKmh))));
  if (!speeds.length) {
    return { labels: ["--"], data: [0] };
  }

  const sampleCount = Math.min(6, speeds.length);
  const step = Math.max(1, Math.floor(speeds.length / sampleCount));
  const sampled = points.filter((_, index) => index % step === 0).slice(0, sampleCount);
  const labels = sampled.map((point) => time(point.recordedAt));
  const data = sampled.map((point) => Math.max(0, Math.round(finiteNumber(point.speedKmh))));
  return {
    labels: labels.length ? labels : ["--"],
    data: data.length ? data : [0]
  };
}

function normalizeRide(ride: any): Ride {
  return {
    ...ride,
    id: String(ride?.id || ""),
    startLabel: String(ride?.startLabel || "Start point"),
    endLabel: String(ride?.endLabel || "End point"),
    distanceM: finiteNumber(ride?.distanceM),
    durationS: finiteNumber(ride?.durationS),
    topSpeedKmh: finiteNumber(ride?.topSpeedKmh),
    avgSpeedKmh: finiteNumber(ride?.avgSpeedKmh),
    startedAt: typeof ride?.startedAt === "string" ? ride.startedAt : "",
    points: Array.isArray(ride?.points)
      ? ride.points.map(normalizeRidePoint).filter((point): point is RidePoint => Boolean(point))
      : []
  };
}

function normalizeRidePoint(point: any): RidePoint | null {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    latitude,
    longitude,
    altitudeM: optionalNumber(point?.altitudeM),
    accuracyM: optionalNumber(point?.accuracyM),
    speedKmh: optionalNumber(point?.speedKmh),
    recordedAt: typeof point?.recordedAt === "string" ? point.recordedAt : ""
  };
}

function optionalNumber(value: unknown) {
  if (value == null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function waitForCaptureReady() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

const createStyles = (colors: ThemeColors) => ({
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
  empty: {
    padding: 16,
    justifyContent: "center"
  },
  content: {
    padding: 20,
    paddingBottom: 38,
    gap: 18
  },
  hero: {
    gap: 4
  },
  kicker: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 10,
    letterSpacing: 1.3
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 37,
    fontFamily: typography.extraBold
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: typography.medium
  },
  smartCard: {
    backgroundColor: colors.elevated,
    borderRadius: 28,
    padding: 18,
    gap: 10
  },
  smartTitle: {
    color: colors.text,
    fontFamily: typography.extraBold,
    fontSize: 21,
    lineHeight: 28
  },
  albumHint: {
    color: colors.accentSoft,
    fontFamily: typography.bold,
    fontSize: 12,
    lineHeight: 18
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  suggestButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 15,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 2
  },
  suggestButtonText: {
    color: colors.onAccent,
    fontFamily: typography.bold,
    fontSize: 12
  },
  emptyMap: {
    minHeight: 180,
    borderRadius: 18,
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
  metricStrip: { flexDirection: "row", alignItems: "center", gap: 12, padding: 17, borderRadius: 24, backgroundColor: colors.surface },
  metricDivider: { width: 1, height: 42, backgroundColor: colors.border },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 17,
    gap: 10
  },
  albumCard: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 17,
    gap: 12
  },
  albumCount: {
    color: colors.accent,
    fontFamily: typography.extraBold,
    fontSize: 28
  },
  albumCover: {
    width: "100%",
    height: 210,
    borderRadius: 24
  },
  dangerCard: {
    backgroundColor: `${colors.danger}14`,
    borderRadius: 24,
    padding: 17,
    gap: 12
  },
  deleteRideButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    borderRadius: 15,
    paddingHorizontal: 14,
    backgroundColor: colors.danger,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  deleteRideText: {
    color: colors.text,
    fontFamily: typography.bold,
    fontSize: 13
  },
  reviewCard: {
    borderColor: colors.accent
  },
  reviewBadge: {
    minWidth: 52,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  reviewBadgeOpen: {
    backgroundColor: colors.accent
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
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "700"
  },
  notesInput: {
    minHeight: 90,
    paddingTop: 10,
    lineHeight: 18
  },
  reviewMessage: {
    color: colors.yellow,
    fontWeight: "800"
  },
  reviewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  storyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  storyCaptureStage: {
    position: "absolute",
    left: -RIDE_STORY_WIDTH - 40,
    top: 0,
    width: RIDE_STORY_WIDTH,
    height: RIDE_STORY_HEIGHT
  },
  duplicateBlock: {
    gap: 10,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 12
  },
  duplicateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  duplicateCard: {
    minHeight: 56,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surfaceHigh,
    padding: 9,
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
    marginTop: 2,
    fontSize: 12
  },
  deleteDuplicateButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
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
    gap: 10
  },
  sectionHeaderText: {
    flex: 1
  },
  sectionMeta: {
    color: colors.muted,
    marginTop: 3,
    lineHeight: 18,
    fontSize: 13
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  routeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
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
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2
  },
  chartBlock: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingTop: 15
  },
  speedLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 14 },
  speedLabel: { flex: 1, color: colors.muted, fontFamily: typography.medium, fontSize: 9, textAlign: "center" as const },
  photoMeta: {
    color: colors.accent,
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
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1
  },
  photoPress: {
    flex: 1
  },
  removePhotoButton: {
    position: "absolute",
    right: 5,
    top: 5,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center"
  },
  playPhotoButton: {
    position: "absolute",
    right: 5,
    bottom: 35,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
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
    borderRadius: 18,
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
  promptModalContent: {
    padding: 16,
    gap: 12
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  promptHeaderText: {
    flex: 1,
    minWidth: 0
  },
  promptTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 3
  },
  promptClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1
  },
  weatherPill: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  weatherText: {
    color: colors.text,
    flex: 1,
    lineHeight: 19,
    fontWeight: "700"
  },
  variantTabs: {
    gap: 8,
    paddingRight: 16
  },
  variantTab: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  variantTabActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  variantTabText: {
    color: colors.muted,
    fontWeight: "900"
  },
  variantTabTextActive: {
    color: colors.text
  },
  promptBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12
  },
  promptText: {
    color: colors.text,
    lineHeight: 18,
    fontSize: 12,
    fontWeight: "700"
  },
  promptActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
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
    borderRadius: 14,
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
