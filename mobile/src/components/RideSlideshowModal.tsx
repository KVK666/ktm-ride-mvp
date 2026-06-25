import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Metric } from "./Metric";
import { RouteArtwork } from "./RouteArtwork";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride, RideAlbumPhoto } from "../types";
import { duration, km, kmh, shortDate } from "../utils/format";

const { width } = Dimensions.get("window");

type Slide =
  | { id: string; type: "intro" }
  | { id: string; type: "photo"; photo: RideAlbumPhoto }
  | { id: string; type: "summary" };

export function RideSlideshowModal({
  visible,
  ride,
  photos,
  initialIndex = 0,
  onClose
}: {
  visible: boolean;
  ride: Ride;
  photos: RideAlbumPhoto[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const slides = useMemo<Slide[]>(() => [
    { id: "intro", type: "intro" },
    ...photos.map((photo) => ({ id: photo.id, type: "photo" as const, photo })),
    { id: "summary", type: "summary" }
  ], [photos]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const start = Math.min(Math.max(0, initialIndex + 1), Math.max(0, slides.length - 1));
    setIndex(start);
    setPlaying(!reduceMotion);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: start * width, animated: false }));
  }, [initialIndex, reduceMotion, slides.length, visible]);

  useEffect(() => {
    if (!visible || reduceMotion || !playing || slides.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = current >= slides.length - 1 ? 0 : current + 1;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 3600);
    return () => clearInterval(timer);
  }, [playing, reduceMotion, slides.length, visible]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: colors.text }]}>{index + 1} / {slides.length}</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setPlaying((value) => !value)} style={[styles.iconButton, { backgroundColor: colors.surfaceHigh }]}>
              <Ionicons name={playing && !reduceMotion ? "pause" : "play"} color={colors.text} size={20} />
            </Pressable>
            <Pressable onPress={onClose} style={[styles.iconButton, { backgroundColor: colors.surfaceHigh }]}>
              <Ionicons name="close" color={colors.text} size={22} />
            </Pressable>
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {slides.map((slide) => (
            <View key={slide.id} style={[styles.slide, { width }]}>
              {slide.type === "intro" ? <IntroSlide ride={ride} /> : slide.type === "photo" ? <PhotoSlide photo={slide.photo} /> : <SummarySlide ride={ride} photoCount={photos.length} />}
            </View>
          ))}
        </ScrollView>
        <View style={styles.progressRow}>
          {slides.map((slide, slideIndex) => (
            <View key={slide.id} style={[styles.progress, { backgroundColor: slideIndex <= index ? colors.accent : colors.borderStrong }]} />
          ))}
        </View>
      </View>
    </Modal>
  );
}

function IntroSlide({ ride }: { ride: Ride }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inner}>
      <RouteArtwork coordinates={ride.points || ride.routePreview} start={{ latitude: ride.startLatitude, longitude: ride.startLongitude }} end={{ latitude: ride.endLatitude, longitude: ride.endLongitude }} height={360} style={styles.heroArt} />
      <Text style={[styles.kicker, { color: colors.accent }]}>RIDE MEMORY</Text>
      <Text style={[styles.title, { color: colors.text }]}>{ride.smartTitle || ride.title || `${shortDate(ride.startedAt)} ride`}</Text>
      <Text style={[styles.body, { color: colors.textSoft }]}>{ride.summaryText || `${ride.startLabel} to ${ride.endLabel}`}</Text>
    </View>
  );
}

function PhotoSlide({ photo }: { photo: RideAlbumPhoto }) {
  const { colors } = useTheme();
  return (
    <View style={styles.photoSlide}>
      <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
      <View style={[styles.photoCaption, { backgroundColor: `${colors.background}CC` }]}>
        <Text style={[styles.photoCaptionText, { color: colors.text }]}>{shortDate(photo.createdAt)}</Text>
        {photo.hasLocation ? <Ionicons name="location" color={colors.blue} size={16} /> : null}
      </View>
    </View>
  );
}

function SummarySlide({ ride, photoCount }: { ride: Ride; photoCount: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inner}>
      <Text style={[styles.kicker, { color: colors.accent }]}>SUMMARY</Text>
      <Text style={[styles.title, { color: colors.text }]}>A ride worth replaying.</Text>
      <Text style={[styles.body, { color: colors.textSoft }]}>{photoCount ? `${photoCount} photos saved in this local album.` : "Route-art memory, ready for photos whenever you add them."}</Text>
      <View style={[styles.metrics, { backgroundColor: colors.surface }]}>
        <Metric label="DISTANCE" value={km(ride.distanceM)} accent />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Metric label="DURATION" value={duration(ride.durationS)} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Metric label="TOP SPEED" value={kmh(ride.topSpeedKmh)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { position: "absolute", zIndex: 2, top: 38, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerText: { fontFamily: typography.bold, fontSize: 13 },
  headerActions: { flexDirection: "row", gap: 9 },
  iconButton: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  slide: { flex: 1 },
  inner: { flex: 1, justifyContent: "center", padding: 22, gap: 12 },
  heroArt: { borderRadius: 34, marginBottom: 10 },
  kicker: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.5 },
  title: { fontFamily: typography.extraBold, fontSize: 34, lineHeight: 41, letterSpacing: -0.8 },
  body: { fontFamily: typography.medium, fontSize: 15, lineHeight: 23 },
  photoSlide: { flex: 1, backgroundColor: "#000" },
  photo: { width: "100%", height: "100%" },
  photoCaption: { position: "absolute", left: 18, right: 18, bottom: 38, borderRadius: 20, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  photoCaptionText: { fontFamily: typography.bold, fontSize: 14 },
  metrics: { marginTop: 14, flexDirection: "row", alignItems: "center", padding: 17, borderRadius: 24, gap: 12 },
  divider: { width: 1, height: 42 },
  progressRow: { position: "absolute", left: 18, right: 18, bottom: 16, flexDirection: "row", gap: 5 },
  progress: { flex: 1, height: 4, borderRadius: 999 }
});
