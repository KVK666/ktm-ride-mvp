import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteArtwork } from "./RouteArtwork";
import { PrimaryButton } from "./PrimaryButton";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { OnboardingSlide } from "../types";

const width = Dimensions.get("window").width;

const slides: OnboardingSlide[] = [
  { id: "track", eyebrow: "TRACK", title: "Record the ride, not the hassle.", body: "Manual and optional auto tracking keep your route, distance, speed, and timing safe.", icon: "radio-button-on" },
  { id: "navigate", eyebrow: "NAVIGATE", title: "Plan the road ahead.", body: "Search destinations and use route guidance without pretending this is full turn-by-turn navigation.", icon: "navigate" },
  { id: "journal", eyebrow: "JOURNAL", title: "Every route becomes a story.", body: "RidePulse turns GPS traces into cinematic journal entries, highlights, and ride details.", icon: "book" },
  { id: "albums", eyebrow: "MEMORIES", title: "Build albums for the rides that matter.", body: "Import photos, create a slideshow, and revisit the day like a private ride memory.", icon: "images" },
  { id: "privacy", eyebrow: "PRIVATE", title: "Your photos stay on this phone.", body: "V3 albums are local-first. Cloud photo backup can come later when you want it.", icon: "shield-checkmark" }
];

export function OnboardingScreen({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);
  const slide = slides[index] || slides[0];
  const isLast = index >= slides.length - 1;
  const route = useMemo(() => [
    { latitude: 0, longitude: 0 },
    { latitude: 0.12, longitude: 0.12 },
    { latitude: -0.04, longitude: 0.34 },
    { latitude: 0.2, longitude: 0.56 }
  ], []);

  function goNext() {
    if (isLast) {
      onDone();
      return;
    }
    const next = index + 1;
    setIndex(next);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <RouteArtwork coordinates={route} height={280} style={styles.art} />
      <LinearGradient colors={["transparent", colors.background]} style={styles.fade} />
      <Pressable onPress={onSkip} style={styles.skip}>
        <Text style={[styles.skipText, { color: colors.muted }]}>Skip</Text>
      </Pressable>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        style={styles.slides}
      >
        {slides.map((item) => (
          <View key={item.id} style={[styles.slide, { width }]}>
            <View style={[styles.icon, { backgroundColor: `${colors.accent}1F` }]}>
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} color={colors.accent} size={30} />
            </View>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>{item.eyebrow}</Text>
            <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.body, { color: colors.textSoft }]}>{item.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((item, dotIndex) => (
            <View key={item.id} style={[styles.dot, { backgroundColor: dotIndex === index ? colors.accent : colors.borderStrong, width: dotIndex === index ? 24 : 8 }]} />
          ))}
        </View>
        <PrimaryButton block label={isLast ? "Get started" : `Next: ${slides[index + 1]?.eyebrow || slide.eyebrow}`} icon={isLast ? "checkmark" : "arrow-forward"} onPress={goNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  art: { borderRadius: 0 },
  fade: { position: "absolute", left: 0, right: 0, top: 130, height: 190 },
  skip: { position: "absolute", right: 18, top: 44, minHeight: 42, justifyContent: "center", paddingHorizontal: 12 },
  skipText: { fontFamily: typography.bold, fontSize: 13 },
  slides: { flex: 1, marginTop: -20 },
  slide: { paddingHorizontal: 24, paddingTop: 290, gap: 10 },
  icon: { width: 62, height: 62, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.5 },
  title: { fontFamily: typography.extraBold, fontSize: 34, lineHeight: 41, letterSpacing: -0.9 },
  body: { fontFamily: typography.medium, fontSize: 15, lineHeight: 23 },
  footer: { padding: 22, paddingBottom: 32, gap: 18 },
  dots: { flexDirection: "row", gap: 8, justifyContent: "center" },
  dot: { height: 8, borderRadius: 999 }
});
