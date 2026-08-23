import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { captureRef } from "react-native-view-shot";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Metric } from "../components/Metric";
import { RideSlideshowModal } from "../components/RideSlideshowModal";
import { RouteVisualizer } from "../components/RouteVisualizer";
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
import { hydrateRideAlbum, importRideWindowPhotosToAlbum, pickManualPhotosForAlbum, removeAlbumPhoto } from "../services/rideAlbums";
import { ThemeColors, typography } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { Ride, RideAlbum, RideAlbumPhoto, RideIntelligence, RidePhoto, RidePoint, Trip, TripSuggestion } from "../types";
import { rideDisplayTitle } from "../utils/rideTitle";
import { duration, km, kmh, shortDate, time } from "../utils/format";
import { normalizeBoundedCoordinate, normalizeFiniteCoordinate } from "../utils/coordinates";
import { finiteNumberOrZero, optionalFiniteNumber } from "../utils/normalize";
import { hasReplayCoordinates } from "../utils/routeReplay";

type RideDetailParams = {
  RideDetail: {
    rideId: string;
    reviewMode?: boolean;
  };
};

type RideDetailSection = "overview" | "album" | "details";

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
  const [reviewExpanded, setReviewExpanded] = useState(Boolean(route.params.reviewMode));
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
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptVariantId, setPromptVariantId] = useState<StoryPromptVariantId>("cinematic");
  const [promptSeed, setPromptSeed] = useState(0);
  const [promptWeather, setPromptWeather] = useState<RideWeatherMood | null>(null);
  const [promptWeatherLoading, setPromptWeatherLoading] = useState(false);
  const [promptWeatherRideId, setPromptWeatherRideId] = useState<string | null>(null);
  const [promptActionMessage, setPromptActionMessage] = useState("");
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripActionMessage, setTripActionMessage] = useState("");
  const [newTripTitle, setNewTripTitle] = useState("");
  const [newTripDescription, setNewTripDescription] = useState("");
  const [addingTripId, setAddingTripId] = useState<string | null>(null);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [rideTrips, setRideTrips] = useState<Trip[]>([]);
  const [activeSection, setActiveSection] = useState<RideDetailSection>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiRefreshCount, setAiRefreshCount] = useState(0);
  const storyCaptureRef = useRef<View | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setPhotoError("");
      setPhotosSearched(false);
      setAlbum(null);
      setPhotos([]);
      setRideTrips([]);
      setDuplicateRides([]);
      closePhotoViewer();
      const response = await api<{ ride: Ride }>(`/rides/${route.params.rideId}`);
      if (!response.ride) {
        throw new Error("Ride detail unavailable");
      }
      const nextRide = normalizeRide(response.ride);
      setRide(nextRide);
      setIntelligence(null);
      setAiRefreshCount(0);
      setTitleDraft(nextRide.title || "");
      setNotesDraft(nextRide.notes || "");
      setReviewExpanded(Boolean(route.params.reviewMode));
      setActiveSection("overview");
      setReviewMessage("");
      setLoading(false);
      await Promise.all([
        hydrateRideAlbum(nextRide.id).then((nextAlbum) => {
          setAlbum(nextAlbum);
          setPhotos(nextAlbum?.photos || []);
          setPhotosSearched(Boolean(nextAlbum?.photos.length));
        }),
        loadRideMembership(nextRide.id),
        (async () => {
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
            await logDiagnostic({
              level: "error",
              area: "ride-review",
              message: "Duplicate ride lookup failed",
              details: diagnosticDetails(duplicateError)
            });
          }
        })()
      ]);
    } catch (err: any) {
      setRide(null);
      setIntelligence(null);
      setDuplicateRides([]);
      setError(err.message || "Unable to load ride details");
    } finally {
      setLoading(false);
    }
  }, [route.params.rideId]);

  async function loadRideMembership(rideId = ride?.id) {
    if (!rideId) return;
    try {
      const response = await api<{ trips: Trip[] }>(`/rides/${rideId}/trips`);
      setRideTrips(Array.isArray(response.trips) ? response.trips : []);
    } catch (err) {
      setRideTrips([]);
      await logDiagnostic({ level: "warn", area: "trips", message: "Ride trip membership unavailable", details: diagnosticDetails(err) });
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!ride || aiRefreshCount >= 4) {
      return;
    }
    const status = intelligence?.classification?.status || ride.aiStatus;
    if (status !== "pending") {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [rideResponse, smart] = await Promise.all([
          api<{ ride: Ride }>(`/rides/${ride.id}`),
          api<{ intelligence: RideIntelligence }>(`/rides/${ride.id}/intelligence`)
        ]);
        if (cancelled || !rideResponse.ride) {
          return;
        }
        const nextRide = normalizeRide(rideResponse.ride);
        setRide(nextRide);
        setIntelligence(normalizeIntelligence(smart.intelligence, nextRide));
      } catch (err) {
        logDiagnostic({
          level: "warn",
          area: "ride-review",
          message: "Pending ride AI refresh failed",
          details: diagnosticDetails(err)
        });
      } finally {
        if (!cancelled) {
          setAiRefreshCount((current) => current + 1);
        }
      }
    }, 4500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aiRefreshCount, intelligence?.classification?.status, ride]);

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
  const displayTitle = rideTitle(ride || ({} as Ride));
  const currentTripSuggestion = useMemo(
    () => intelligence?.tripAutomation || parseTripSuggestion(ride?.tripSuggestion),
    [intelligence?.tripAutomation, ride?.tripSuggestion]
  );
  const actionableTripSuggestion = Boolean(currentTripSuggestion && ["suggest", "auto_add", "auto_create"].includes(currentTripSuggestion.action));

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
      navigation.navigate("MainTabs", { screen: "Journal" });
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
      "This removes the private RidePulse copy from your synced album everywhere. Your original gallery photo is never deleted.",
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
      await shareRideStoryImage(uri);
    } catch (err: any) {
      Alert.alert("Unable to share", err.message || "The ride story image could not be shared.");
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

  async function openTripModal() {
    if (!ride) {
      return;
    }
    setTripModalOpen(true);
    setTripActionMessage("");
    setNewTripTitle(currentTripSuggestion?.title || displayTitle || "");
    setNewTripDescription(currentTripSuggestion?.reason || "");
    await Promise.all([loadTripOptions(), loadRideMembership(ride.id)]);
  }

  function closeTripModal() {
    setTripModalOpen(false);
    setTripActionMessage("");
    setAddingTripId(null);
    setCreatingTrip(false);
  }

  async function loadTripOptions() {
    setTripsLoading(true);
    try {
      const response = await api<{ trips: Trip[] }>("/trips");
      setTrips(Array.isArray(response.trips) ? response.trips : []);
    } catch (err: any) {
      setTripActionMessage(err.message || "Unable to load trips");
    } finally {
      setTripsLoading(false);
    }
  }

  async function addRideToTrip(tripId: string) {
    if (!ride || addingTripId) {
      return;
    }
    setAddingTripId(tripId);
    setTripActionMessage("");
    try {
      await api(`/trips/${tripId}/rides`, {
        method: "POST",
        body: JSON.stringify({ rideId: ride.id })
      });
      const trip = trips.find((item) => item.id === tripId);
      setTripActionMessage(`Added to ${trip?.title || "trip"}.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([loadTripOptions(), loadRideMembership(ride.id)]);
    } catch (err: any) {
      setTripActionMessage(err.message || "Unable to add ride to trip");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setAddingTripId(null);
    }
  }

  async function createTripAndAddRide(override?: { title?: string | null; description?: string | null }) {
    if (!ride || creatingTrip) {
      return;
    }
    const title = (override?.title || newTripTitle).trim();
    if (!title) {
      setTripActionMessage("Name the trip album first.");
      return;
    }
    const description = (override?.description || newTripDescription).trim();
    setCreatingTrip(true);
    setTripActionMessage("");
    try {
      const created = await api<{ trip: Trip }>("/trips", {
        method: "POST",
        body: JSON.stringify({ title, description: description || null })
      });
      if (!created.trip?.id) {
        throw new Error("Trip was created, but could not be opened.");
      }
      await api(`/trips/${created.trip.id}/rides`, {
        method: "POST",
        body: JSON.stringify({ rideId: ride.id })
      });
      setNewTripTitle("");
      setNewTripDescription("");
      setTripActionMessage(`Created ${created.trip.title} and added this ride.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([loadTripOptions(), loadRideMembership(ride.id)]);
    } catch (err: any) {
      setTripActionMessage(err.message || "Unable to create trip");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setCreatingTrip(false);
    }
  }

  async function applySuggestedTrip() {
    if (!currentTripSuggestion || !ride) {
      return;
    }
    if ((currentTripSuggestion.action === "auto_add" || currentTripSuggestion.action === "suggest") && currentTripSuggestion.tripId) {
      await addRideToTrip(currentTripSuggestion.tripId);
      return;
    }
    await createTripAndAddRide({
      title: currentTripSuggestion.title || displayTitle,
      description: currentTripSuggestion.reason || ""
    });
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
      <Screen includeTopInset={false} style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </Screen>
    );
  }

  if (!ride) {
    return (
      <Screen includeTopInset={false} style={styles.empty}>
        <Text style={styles.error}>{error || "Ride detail unavailable"}</Text>
      </Screen>
    );
  }

  return (
    <Screen includeTopInset={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <AIInsightHero ride={ride} intelligence={intelligence} title={displayTitle} />

        <View style={styles.quickActions}>
          <QuickAction label={needsReview ? "Review ride" : "Edit review"} icon="create-outline" onPress={() => { setActiveSection("overview"); setReviewExpanded(true); }} />
          <QuickAction label="Add to trip" icon="albums" onPress={openTripModal} />
          <QuickAction label="Share" icon="share-social" loading={storySharing} onPress={handleShareStoryImage} />
          <QuickAction label="AI prompt" icon="sparkles" onPress={openPromptModal} />
        </View>
        {rideTrips.length ? <Text style={styles.membershipText}>Saved in {rideTrips.map((trip) => trip.title).join(", ")}</Text> : null}

        <View accessibilityRole="tablist" style={styles.sectionTabs}>
          {([
            { id: "overview" as const, label: "Overview", icon: "map-outline" as const },
            { id: "album" as const, label: "Album", icon: "images-outline" as const },
            { id: "details" as const, label: "Details", icon: "list-outline" as const }
          ]).map((section) => {
            const selected = activeSection === section.id;
            return (
              <Pressable
                key={section.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveSection(section.id)}
                style={({ pressed }) => [styles.sectionTab, selected && styles.sectionTabActive, pressed && styles.pressedPhoto]}
              >
                <Ionicons name={section.icon} color={selected ? colors.onAccent : colors.muted} size={17} />
                <Text style={[styles.sectionTabText, selected && styles.sectionTabTextActive]}>{section.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {activeSection === "overview" ? <>
        <View style={styles.metricStrip}>
          <Metric label="DISTANCE" value={km(ride.distanceM)} accent />
          <View style={styles.metricDivider} />
          <Metric label="DURATION" value={duration(ride.durationS)} />
          <View style={styles.metricDivider} />
          <Metric label="TOP SPEED" value={kmh(ride.topSpeedKmh)} />
        </View>

        {intelligence?.cleanupCandidate ? (
          <View style={styles.cleanupCard}>
            <View style={styles.cleanupIcon}>
              <Ionicons name="alert-circle" color={colors.danger} size={22} />
            </View>
            <View style={styles.cleanupText}>
              <Text style={styles.cleanupTitle}>Check this recording</Text>
              <Text style={styles.cleanupCopy}>{intelligence.cleanupReason || "This ride recorded very little movement."}</Text>
              <Text style={styles.cleanupAction}>Mark it reviewed below to keep it, or use Ride controls to delete it.</Text>
            </View>
          </View>
        ) : null}

        {hasReplayCoordinates(ride) ? (
          <RouteVisualizer
            ride={ride}
            title={`${ride.startLabel} to ${ride.endLabel}`}
            photoMarkers={photosWithLocation}
            onPhotoMarkerPress={openPhotoMarker}
          />
        ) : null}

        <View style={[styles.card, needsReview && styles.reviewCard]}>
          <View style={styles.sectionHeader}>
            <View style={styles.reviewHeading}>
              <Ionicons
                name={needsReview ? "ellipse" : "checkmark-circle"}
                color={needsReview ? colors.accent : colors.blue}
                size={needsReview ? 9 : 20}
              />
              <Text style={styles.sectionTitle}>Review</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={reviewExpanded ? "Close ride review" : "Edit ride review"}
              onPress={() => setReviewExpanded((expanded) => !expanded)}
              style={({ pressed }) => [styles.editReviewButton, pressed && styles.pressedPhoto]}
            >
              <Ionicons name={reviewExpanded ? "chevron-up" : "create-outline"} color={colors.accent} size={17} />
              <Text style={styles.editReviewText}>{reviewExpanded ? "Close" : "Edit"}</Text>
            </Pressable>
          </View>

          {reviewExpanded ? (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name</Text>
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
                  placeholder="Anything worth remembering"
                  placeholderTextColor={colors.muted}
                  multiline
                  maxLength={2000}
                  style={[styles.input, styles.notesInput]}
                  textAlignVertical="top"
                />
              </View>

              {reviewMessage ? <Text style={styles.reviewMessage}>{reviewMessage}</Text> : null}

              <View style={styles.reviewActions}>
                <PrimaryButton label="Save" icon="save" compact loading={reviewSaving} onPress={() => saveReview(false)} />
                {needsReview ? (
                  <PrimaryButton
                    label="Mark reviewed"
                    icon="checkmark-circle"
                    compact
                    loading={reviewSaving}
                    onPress={() => saveReview(true)}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          {duplicateRides.length ? <View style={styles.duplicateBlock}>
            <Text style={styles.duplicateTitle}>Suspected duplicates</Text>
            {duplicateRides.map((duplicate) => (
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
              ))}
          </View> : null}
        </View>
        </> : null}

        {activeSection === "album" ? <View style={styles.albumCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Album</Text>
            {photos.length ? <Text style={styles.albumCount}>{photos.length}</Text> : null}
          </View>
          {album?.coverUri ? <Image source={{ uri: album.coverUri }} style={styles.albumCover} /> : null}
          <View style={styles.storyActions}>
            <PrimaryButton
              label="Find photos"
              icon="images"
              compact
              loading={importingPhotos}
              onPress={handleImportRidePhotos}
            />
            <PrimaryButton
              label="Add"
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
                {photos.filter((photo) => photo.syncState === "synced").length} synced, {photos.filter((photo) => photo.syncState === "failed").length} waiting to retry, {photosWithLocation.length} with map location.
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
                      <Ionicons name={photo.syncState === "synced" ? "cloud-done" : photo.syncState === "failed" ? "cloud-offline" : "phone-portrait-outline"} color={photo.syncState === "failed" ? colors.danger : colors.muted} size={14} />
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
        </View> : null}

        {activeSection === "details" ? <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Route details</Text>
            <DetailRow icon="navigate-outline" label="Start" value={ride.startLabel || "Start point"} />
            <DetailRow icon="flag-outline" label="Finish" value={ride.endLabel || "End point"} />
            {ride.destinationName ? <DetailRow icon="location-outline" label="Destination" value={destinationDetail(ride)} /> : null}
            <DetailRow icon="speedometer-outline" label="Average speed" value={kmh(ride.avgSpeedKmh)} />
            <DetailRow icon="analytics-outline" label="Recorded points" value={String(ride.points?.length || 0)} />
            <DetailRow icon="calendar-outline" label="Started" value={ride.startedAt ? new Date(ride.startedAt).toLocaleString() : "Unavailable"} />
            <DetailRow icon="time-outline" label="Finished" value={ride.endedAt ? new Date(ride.endedAt).toLocaleString() : "Unavailable"} />
          </View>
          {(ride.notes || intelligence?.summaryText || ride.aiSummary || intelligence?.keyInsight || ride.keyInsight) ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Ride notes and insight</Text>
              {ride.notes ? <Text style={styles.detailCopy}>{ride.notes}</Text> : null}
              {intelligence?.summaryText || ride.aiSummary ? <Text style={styles.detailCopy}>{intelligence?.summaryText || ride.aiSummary}</Text> : null}
              {intelligence?.keyInsight || ride.keyInsight ? <Text style={styles.detailHighlight}>{intelligence?.keyInsight || ride.keyInsight}</Text> : null}
            </View>
          ) : null}
          <View style={styles.dangerCard}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.dangerTitle}>Delete ride</Text>
              <Text style={styles.sectionMeta}>Permanently removes this ride and its saved route points.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={deletingRide}
              onPress={confirmDeleteRide}
              style={({ pressed }) => [styles.deleteRideButton, pressed && styles.pressedPhoto, deletingRide && styles.disabledButton]}
            >
              <Ionicons name="trash" color={colors.danger} size={18} />
              <Text style={styles.deleteRideText}>{deletingRide ? "Deleting..." : "Delete ride"}</Text>
            </Pressable>
          </View>
        </> : null}
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
      <Modal visible={tripModalOpen} animationType="slide" onRequestClose={closeTripModal}>
        <Screen>
          <ScrollView contentContainerStyle={styles.promptModalContent}>
            <View style={styles.promptHeader}>
              <View style={styles.promptHeaderText}>
                <Text style={styles.kicker}>Trip album</Text>
                <Text style={styles.promptTitle}>Add this ride to a trip</Text>
                <Text style={styles.sectionMeta}>RidePulse can suggest a trip, but manual trip controls stay available.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close trip modal" onPress={closeTripModal} style={styles.promptClose}>
                <Ionicons name="close" color={colors.text} size={22} />
              </Pressable>
            </View>

            {currentTripSuggestion && currentTripSuggestion.action !== "none" ? (
              <View style={styles.tripSuggestionCard}>
                <Text style={styles.tripSuggestionEyebrow}>
                  {currentTripSuggestion.action === "auto_added" || currentTripSuggestion.action === "auto_created" ? "AI TRIP ACTION" : "AI TRIP SUGGESTION"}
                </Text>
                <Text style={styles.tripSuggestionTitle}>
                  {tripSuggestionText(currentTripSuggestion)}
                </Text>
                {currentTripSuggestion.reason ? <Text style={styles.sectionMeta}>{currentTripSuggestion.reason}</Text> : null}
                {actionableTripSuggestion ? (
                  <PrimaryButton
                    label={currentTripSuggestion.tripId ? "Add to suggested trip" : "Create suggested trip"}
                    icon={currentTripSuggestion.tripId ? "albums" : "sparkles"}
                    compact
                    loading={creatingTrip || Boolean(addingTripId)}
                    onPress={applySuggestedTrip}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.tripCreateBox}>
              <Text style={styles.tripModalTitle}>Create new trip</Text>
              <TextInput
                value={newTripTitle}
                onChangeText={setNewTripTitle}
                placeholder="Trip title"
                placeholderTextColor={colors.muted}
                maxLength={120}
                style={styles.input}
              />
              <TextInput
                value={newTripDescription}
                onChangeText={setNewTripDescription}
                placeholder="Optional notes"
                placeholderTextColor={colors.muted}
                maxLength={1000}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.notesInput]}
              />
              <PrimaryButton label="Create and add" icon="add-circle" compact loading={creatingTrip} onPress={() => createTripAndAddRide()} />
            </View>

            <View style={styles.tripListBox}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.tripModalTitle}>Existing trips</Text>
                  <Text style={styles.sectionMeta}>{tripsLoading ? "Loading trips..." : `${trips.length} trip album${trips.length === 1 ? "" : "s"}`}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={loadTripOptions} style={styles.promptClose}>
                  <Ionicons name="refresh" color={colors.text} size={20} />
                </Pressable>
              </View>
              {trips.map((trip) => {
                const alreadyAdded = rideTrips.some((membership) => membership.id === trip.id);
                return (
                  <Pressable
                    key={trip.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: alreadyAdded || Boolean(addingTripId) }}
                    disabled={alreadyAdded || Boolean(addingTripId)}
                    onPress={() => addRideToTrip(trip.id)}
                    style={({ pressed }) => [styles.tripOption, alreadyAdded && styles.tripOptionAdded, pressed && styles.pressedPhoto, addingTripId === trip.id && styles.disabledButton]}
                  >
                    <View style={styles.tripOptionText}>
                      <Text numberOfLines={2} style={styles.tripOptionTitle}>{trip.title}</Text>
                      <Text style={styles.sectionMeta}>{trip.rideCount || 0} rides · {km(trip.distanceM || 0)}</Text>
                    </View>
                    {alreadyAdded ? <Ionicons name="checkmark-circle" color={colors.accent} size={20} /> : null}
                    <Text style={styles.tripOptionAction}>{alreadyAdded ? "Added" : addingTripId === trip.id ? "Adding..." : "Add"}</Text>
                  </Pressable>
                );
              })}
              {!tripsLoading && !trips.length ? <Text style={styles.sectionMeta}>No trips yet. Create one above.</Text> : null}
            </View>
            {tripActionMessage ? <Text style={styles.reviewMessage}>{tripActionMessage}</Text> : null}
          </ScrollView>
        </Screen>
      </Modal>
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

function AIInsightHero({ ride, intelligence, title }: { ride: Ride; intelligence: RideIntelligence | null; title: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const status = intelligence?.classification?.status || ride.aiStatus || "fallback";
  const thinking = status === "pending";

  return (
    <View style={styles.aiHero}>
      <View pointerEvents="none" style={styles.aiHeroGlow} />
      <View style={styles.aiHeroTop}>
        <View style={styles.aiIcon}>
          <Ionicons name={thinking ? "sparkles" : "navigate"} color={colors.onAccent} size={22} />
        </View>
        <View style={styles.aiHeroText}>
          <Text numberOfLines={2} style={styles.aiTitle}>{title}</Text>
          <View style={styles.aiDateRow}>
            <Ionicons name="time-outline" color={colors.muted} size={14} />
            <Text style={styles.aiDate}>{shortDate(ride.startedAt)} · {time(ride.startedAt)}{ride.endedAt ? `–${time(ride.endedAt)}` : ""}</Text>
          </View>
        </View>
      </View>

      <View style={styles.aiRouteLine}>
        <Ionicons name="radio-button-on" color={colors.accent} size={15} />
        <Text numberOfLines={1} style={styles.aiRouteText}>{ride.startLabel}</Text>
        <Ionicons name="arrow-forward" color={colors.muted} size={14} />
        <Text numberOfLines={1} style={styles.aiRouteText}>{ride.endLabel}</Text>
      </View>

      {thinking ? <View style={styles.aiThinkingRow}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.aiThinkingText}>Naming this ride…</Text>
      </View> : null}
    </View>
  );
}

function rideTitle(ride: Ride) {
  return rideDisplayTitle(ride);
}

function normalizeIntelligence(value: any, ride: Ride): RideIntelligence {
  const fallback = buildFallbackIntelligence(ride);
  return {
    suggestedTitle: String(value?.suggestedTitle || fallback.suggestedTitle),
    summaryText: String(value?.summaryText || fallback.summaryText),
    badges: Array.isArray(value?.badges) ? value.badges.map(String).filter(Boolean).slice(0, 4) : fallback.badges,
    highlightReason: typeof value?.highlightReason === "string" ? value.highlightReason : fallback.highlightReason,
    fastestSegment: value?.fastestSegment && typeof value.fastestSegment === "object" ? {
      speedKmh: finiteNumberOrZero(value.fastestSegment.speedKmh),
      distanceM: finiteNumberOrZero(value.fastestSegment.distanceM),
      durationS: finiteNumberOrZero(value.fastestSegment.durationS),
      startedAt: typeof value.fastestSegment.startedAt === "string" ? value.fastestSegment.startedAt : null,
      endedAt: typeof value.fastestSegment.endedAt === "string" ? value.fastestSegment.endedAt : null,
      coordinate: normalizeBoundedCoordinate(value.fastestSegment.coordinate)
    } : null,
    midpoint: normalizeBoundedCoordinate(value?.midpoint),
    comparisons: value?.comparisons && typeof value.comparisons === "object" ? {
      distanceVsLongestM: value.comparisons.distanceVsLongestM == null ? null : finiteNumberOrZero(value.comparisons.distanceVsLongestM),
      monthSharePercent: value.comparisons.monthSharePercent == null ? null : finiteNumberOrZero(value.comparisons.monthSharePercent)
    } : fallback.comparisons,
    chapters: Array.isArray(value?.chapters)
      ? value.chapters.map(normalizeChapter).filter(Boolean).slice(0, 4) as RideIntelligence["chapters"]
      : fallback.chapters,
    classification: value?.classification && typeof value.classification === "object" ? {
      rideKind: typeof value.classification.rideKind === "string" ? value.classification.rideKind : ride.rideKind || fallback.classification?.rideKind,
      label: typeof value.classification.label === "string" ? value.classification.label : rideKindLabel(ride.rideKind),
      confidence: value.classification.confidence == null ? ride.rideKindConfidence || fallback.classification?.confidence : finiteNumberOrZero(value.classification.confidence),
      reason: typeof value.classification.reason === "string" ? value.classification.reason : ride.rideKindReason || fallback.classification?.reason,
      status: typeof value.classification.status === "string" ? value.classification.status : ride.aiStatus || fallback.classification?.status
    } : fallback.classification,
    keyInsight: typeof value?.keyInsight === "string" ? value.keyInsight : ride.keyInsight || fallback.keyInsight,
    bestMoment: typeof value?.bestMoment === "string" ? value.bestMoment : ride.bestMoment || fallback.bestMoment,
    tripAutomation: parseTripSuggestion(value?.tripAutomation || ride.tripSuggestion) || fallback.tripAutomation,
    cleanupCandidate: Boolean(value?.cleanupCandidate ?? ride.cleanupCandidate ?? fallback.cleanupCandidate),
    cleanupReason: typeof value?.cleanupReason === "string" ? value.cleanupReason : ride.cleanupReason || fallback.cleanupReason
  };
}

function buildFallbackIntelligence(ride: Ride): RideIntelligence {
  const title = rideTitle(ride);
  const summary = ride.aiSummary || ride.summaryText || `${km(ride.distanceM)} captured as a ${rideKindLabel(ride.rideKind).toLowerCase()}.`;
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
    classification: {
      rideKind: ride.rideKind || "scenic_leisure",
      label: rideKindLabel(ride.rideKind),
      confidence: ride.rideKindConfidence || 0.55,
      reason: ride.rideKindReason || "RidePulse used the saved ride summary to classify this ride.",
      status: ride.aiStatus || "fallback"
    },
    keyInsight: ride.keyInsight || "Built from saved ride data.",
    bestMoment: ride.bestMoment || bestMetricText(ride, null),
    tripAutomation: parseTripSuggestion(ride.tripSuggestion),
    cleanupCandidate: Boolean(ride.cleanupCandidate),
    cleanupReason: ride.cleanupReason || null,
    chapters: [
      { id: "start", title: "Roll out", body: ride.startLabel, timestamp: ride.startedAt, coordinate: { latitude: ride.startLatitude, longitude: ride.startLongitude } },
      { id: "finish", title: "Finish", body: ride.endLabel, timestamp: ride.endedAt || null, coordinate: { latitude: ride.endLatitude, longitude: ride.endLongitude } }
    ]
  };
}

function bestMetricText(ride: Ride, intelligence: RideIntelligence | null) {
  if (intelligence?.bestMoment || ride.bestMoment) {
    return String(intelligence?.bestMoment || ride.bestMoment);
  }
  if (ride.topSpeedKmh > 0) {
    return `${kmh(ride.topSpeedKmh)} top speed`;
  }
  return `${km(ride.distanceM)} saved`;
}

function tripSuggestionText(suggestion?: TripSuggestion | null) {
  if (!suggestion) {
    return "No trip action yet";
  }
  if (suggestion.action === "auto_created") return suggestion.title ? `Created ${suggestion.title}` : "Created a trip";
  if (suggestion.action === "auto_added") return suggestion.title ? `Added to ${suggestion.title}` : "Added to a trip";
  if (suggestion.action === "suggest" || suggestion.action === "auto_create" || suggestion.action === "auto_add") {
    return suggestion.title ? `Suggests ${suggestion.title}` : "Trip suggestion ready";
  }
  return "No confident trip match";
}

function rideKindLabel(kind?: string | null) {
  switch (kind) {
    case "commute": return "Commute";
    case "short_spin": return "Short spin";
    case "city_errand": return "City errand";
    case "long_trip": return "Long trip";
    case "fast_ride": return "Fast ride";
    case "night_ride": return "Night ride";
    default: return "Scenic ride";
  }
}

function parseTripSuggestion(value: unknown): TripSuggestion | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return parseTripSuggestion(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value !== "object") {
    return null;
  }
  const suggestion = value as Record<string, unknown>;
  return {
    action: typeof suggestion.action === "string" ? suggestion.action : "none",
    confidence: optionalFiniteNumber(suggestion.confidence),
    title: typeof suggestion.title === "string" ? suggestion.title : null,
    reason: typeof suggestion.reason === "string" ? suggestion.reason : null,
    tripId: typeof suggestion.tripId === "string" ? suggestion.tripId : null
  };
}

function normalizeChapter(value: any) {
  const coordinate = normalizeBoundedCoordinate(value?.coordinate);
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

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}><Ionicons name={icon} color={colors.accent} size={18} /></View>
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text selectable style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  loading = false,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading }}
      disabled={loading}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed, loading && styles.disabledButton]}
    >
      <View style={styles.quickActionIcon}>
        {loading ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons name={icon} color={colors.accent} size={21} />}
      </View>
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function normalizeRide(ride: any): Ride {
  return {
    ...ride,
    id: String(ride?.id || ""),
    startLabel: String(ride?.startLabel || "Start point"),
    endLabel: String(ride?.endLabel || "End point"),
    distanceM: finiteNumberOrZero(ride?.distanceM),
    durationS: finiteNumberOrZero(ride?.durationS),
    topSpeedKmh: finiteNumberOrZero(ride?.topSpeedKmh),
    avgSpeedKmh: finiteNumberOrZero(ride?.avgSpeedKmh),
    startedAt: typeof ride?.startedAt === "string" ? ride.startedAt : "",
    aiTitle: typeof ride?.aiTitle === "string" ? ride.aiTitle : null,
    aiSummary: typeof ride?.aiSummary === "string" ? ride.aiSummary : null,
    rideKind: typeof ride?.rideKind === "string" ? ride.rideKind : null,
    rideKindConfidence: optionalFiniteNumber(ride?.rideKindConfidence),
    rideKindReason: typeof ride?.rideKindReason === "string" ? ride.rideKindReason : null,
    keyInsight: typeof ride?.keyInsight === "string" ? ride.keyInsight : null,
    bestMoment: typeof ride?.bestMoment === "string" ? ride.bestMoment : null,
    tripSuggestion: parseTripSuggestion(ride?.tripSuggestion),
    aiStatus: typeof ride?.aiStatus === "string" ? ride.aiStatus : null,
    aiGeneratedAt: typeof ride?.aiGeneratedAt === "string" ? ride.aiGeneratedAt : null,
    destinationName: typeof ride?.destinationName === "string" ? ride.destinationName : null,
    destinationCategory: typeof ride?.destinationCategory === "string" ? ride.destinationCategory : null,
    destinationAddress: typeof ride?.destinationAddress === "string" ? ride.destinationAddress : null,
    aiContextVersion: optionalFiniteNumber(ride?.aiContextVersion),
    points: Array.isArray(ride?.points)
      ? ride.points.map(normalizeRidePoint).filter((point): point is RidePoint => Boolean(point))
      : []
  };
}

function destinationDetail(ride: Ride) {
  const category = String(ride.destinationCategory || "").replace(/_/g, " ");
  return [ride.destinationName, category, ride.destinationAddress]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(" · ");
}

function normalizeRidePoint(point: any): RidePoint | null {
  const coordinate = normalizeFiniteCoordinate(point);
  if (!coordinate) {
    return null;
  }
  return {
    ...(point && typeof point === "object" ? point : {}),
    ...coordinate,
    altitudeM: optionalFiniteNumber(point?.altitudeM),
    accuracyM: optionalFiniteNumber(point?.accuracyM),
    speedKmh: optionalFiniteNumber(point?.speedKmh),
    recordedAt: typeof point?.recordedAt === "string" ? point.recordedAt : ""
  };
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
    padding: 18,
    paddingBottom: 38,
    gap: 14
  },
  aiHero: {
    position: "relative" as const,
    overflow: "hidden" as const,
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  aiHeroGlow: {
    position: "absolute" as const,
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -72,
    top: -92,
    backgroundColor: `${colors.accent}16`
  },
  aiHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  aiIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  aiHeroText: {
    flex: 1,
    minWidth: 0
  },
  aiTitle: {
    color: colors.text,
    fontFamily: typography.extraBold,
    fontSize: 26,
    lineHeight: 32
  },
  aiDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5
  },
  aiDate: {
    color: colors.muted,
    fontFamily: typography.medium,
    fontSize: 12
  },
  aiTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
  },
  aiTypePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: `${colors.accent}18`
  },
  aiTypeText: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 12
  },
  aiConfidence: {
    color: colors.muted,
    fontFamily: typography.medium,
    fontSize: 12
  },
  aiRouteLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: colors.elevated
  },
  aiRouteText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSoft,
    fontFamily: typography.bold,
    fontSize: 12
  },
  aiThinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  aiThinkingText: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 12
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
  cleanupCard: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: `${colors.danger}55`,
    backgroundColor: `${colors.danger}12`
  },
  cleanupIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.danger}18`
  },
  cleanupText: {
    flex: 1,
    gap: 4
  },
  cleanupTitle: {
    color: colors.text,
    fontFamily: typography.extraBold,
    fontSize: 15
  },
  cleanupCopy: {
    color: colors.textSoft,
    fontFamily: typography.regular,
    fontSize: 12,
    lineHeight: 18
  },
  cleanupAction: {
    color: colors.danger,
    fontFamily: typography.bold,
    fontSize: 11,
    lineHeight: 17
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
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  quickAction: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 84,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  quickActionPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.86
  },
  quickActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: `${colors.accent}15`,
    alignItems: "center",
    justifyContent: "center"
  },
  quickActionText: {
    color: colors.text,
    fontFamily: typography.bold,
    fontSize: 12
  },
  membershipText: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 12,
    lineHeight: 18
  },
  sectionTabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  sectionTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5
  },
  sectionTabActive: { backgroundColor: colors.accent },
  sectionTabText: { color: colors.muted, fontFamily: typography.bold, fontSize: 11 },
  sectionTabTextActive: { color: colors.onAccent },
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
  deleteRow: {
    alignItems: "center",
    paddingVertical: 6
  },
  deleteRideButton: {
    alignSelf: "center",
    minHeight: 44,
    borderRadius: 15,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: `${colors.danger}55`,
    backgroundColor: `${colors.danger}12`,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  deleteRideText: {
    color: colors.danger,
    fontFamily: typography.bold,
    fontSize: 13
  },
  dangerCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: `${colors.danger}55`,
    backgroundColor: `${colors.danger}0D`,
    padding: 16,
    gap: 12
  },
  dangerTitle: { color: colors.danger, fontFamily: typography.extraBold, fontSize: 16 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 4 },
  detailIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.accent}14` },
  detailText: { flex: 1, minWidth: 0 },
  detailLabel: { color: colors.muted, fontFamily: typography.bold, fontSize: 10, letterSpacing: 0.7 },
  detailValue: { color: colors.text, fontFamily: typography.medium, fontSize: 13, lineHeight: 19, marginTop: 2 },
  detailCopy: { color: colors.textSoft, fontFamily: typography.regular, fontSize: 13, lineHeight: 20 },
  detailHighlight: { color: colors.accent, fontFamily: typography.bold, fontSize: 13, lineHeight: 20 },
  reviewCard: {
    borderWidth: 1,
    borderColor: `${colors.accent}55`
  },
  reviewHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  editReviewButton: {
    minHeight: 36,
    borderRadius: 13,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: `${colors.accent}12`
  },
  editReviewText: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 12
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
    alignItems: "center",
    justifyContent: "space-between",
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
  tripCreateBox: {
    padding: 14,
    borderRadius: 20,
    gap: 10,
    backgroundColor: colors.surface
  },
  tripSuggestionCard: {
    padding: 14,
    borderRadius: 20,
    gap: 9,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.accent
  },
  tripSuggestionEyebrow: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 10,
    letterSpacing: 1
  },
  tripSuggestionTitle: {
    color: colors.text,
    fontFamily: typography.extraBold,
    fontSize: 18,
    lineHeight: 23
  },
  tripModalTitle: {
    color: colors.text,
    fontFamily: typography.bold,
    fontSize: 16
  },
  tripListBox: {
    padding: 14,
    borderRadius: 20,
    gap: 10,
    backgroundColor: colors.surface
  },
  tripOption: {
    minHeight: 58,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceHigh
  },
  tripOptionAdded: { borderWidth: 1, borderColor: `${colors.accent}55`, opacity: 0.78 },
  tripOptionText: {
    flex: 1,
    minWidth: 0
  },
  tripOptionTitle: {
    color: colors.text,
    fontFamily: typography.bold,
    fontSize: 14,
    marginBottom: 3
  },
  tripOptionAction: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 12
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
