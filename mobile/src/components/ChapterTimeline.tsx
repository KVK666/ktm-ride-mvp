import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { RideChapter } from "../types";
import { time } from "../utils/format";

export function ChapterTimeline({ chapters }: { chapters: RideChapter[] }) {
  const { colors } = useTheme();
  const safeChapters = Array.isArray(chapters) ? chapters.slice(0, 4) : [];
  if (!safeChapters.length) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.kicker, { color: colors.accent }]}>CHAPTERS</Text>
      <Text style={[styles.title, { color: colors.text }]}>How the ride unfolded</Text>
      <View style={styles.list}>
        {safeChapters.map((chapter, index) => (
          <View key={chapter.id || `${chapter.title}-${index}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: index === 0 ? colors.blue : index === safeChapters.length - 1 ? colors.accent : colors.text }]} />
              {index < safeChapters.length - 1 ? <View style={[styles.line, { backgroundColor: colors.borderStrong }]} /> : null}
            </View>
            <View style={[styles.chapter, { backgroundColor: colors.surfaceHigh }]}>
              <View style={styles.chapterTop}>
                <Text style={[styles.chapterTitle, { color: colors.text }]}>{chapter.title}</Text>
                {chapter.timestamp ? <Text style={[styles.chapterTime, { color: colors.muted }]}>{time(chapter.timestamp)}</Text> : null}
              </View>
              <Text style={[styles.chapterBody, { color: colors.muted }]}>{chapter.body}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.footer}>
        <Ionicons name="information-circle" color={colors.muted} size={15} />
        <Text style={[styles.footerText, { color: colors.muted }]}>Generated from saved GPS points.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: 17, gap: 8 },
  kicker: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.3 },
  title: { fontFamily: typography.extraBold, fontSize: 20 },
  list: { gap: 0, marginTop: 4 },
  row: { flexDirection: "row", gap: 12 },
  rail: { width: 16, alignItems: "center" },
  dot: { width: 11, height: 11, borderRadius: 6, marginTop: 18 },
  line: { width: 2, flex: 1, minHeight: 44, marginTop: 4 },
  chapter: { flex: 1, borderRadius: 20, padding: 13, marginBottom: 10 },
  chapterTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  chapterTitle: { flex: 1, fontFamily: typography.extraBold, fontSize: 14 },
  chapterTime: { fontFamily: typography.bold, fontSize: 11 },
  chapterBody: { fontFamily: typography.regular, fontSize: 12, lineHeight: 18, marginTop: 4 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontFamily: typography.medium, fontSize: 11 }
});
