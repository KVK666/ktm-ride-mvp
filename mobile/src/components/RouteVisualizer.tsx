import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RideMap } from "./RideMap";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/colors";
import { RidePhoto } from "../types";
import {
  buildRouteReplayModel,
  buildReplayFacts,
  formatReplayActualTime,
  formatReplaySeconds,
  getReplayPosition,
  hasReplayCoordinates,
  replayDurationMs,
  replaySpeedFactLabel,
  replayTimingLabel,
  ReplayFacts,
  ReplayRideInput,
  REPLAY_SPEEDS,
  ReplaySpeed
} from "../utils/routeReplay";

type RouteVisualizerProps = {
  ride: ReplayRideInput;
  title?: string;
  photoMarkers?: RidePhoto[];
  onPhotoMarkerPress?: (photo: RidePhoto) => void;
};

export function RouteVisualizer({
  ride,
  title = "Route replay",
  photoMarkers = [],
  onPhotoMarkerPress
}: RouteVisualizerProps) {
  const { colors } = useTheme();
  const model = useMemo(() => buildRouteReplayModel(ride), [ride]);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const progressRef = useRef(0);

  const position = useMemo(() => getReplayPosition(model, progress), [model, progress]);
  const facts = useMemo(() => buildReplayFacts(ride, model), [model, ride]);
  const canReplay = model.canReplay && model.coordinates.length >= 2;

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    setProgress(0);
    progressRef.current = 0;
    setPlaying(false);
  }, [model]);

  useEffect(() => {
    if (!playing || !canReplay) {
      return;
    }

    let frame = 0;
    let previous = Date.now();
    const tick = () => {
      const now = Date.now();
      const frameDelta = Math.max(0, now - previous);
      previous = now;
      const nextProgress = progressRef.current + frameDelta / replayDurationMs(speed);
      if (nextProgress >= 1) {
        progressRef.current = 1;
        setProgress(1);
        setPlaying(false);
        return;
      }
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [canReplay, playing, speed]);

  const updateProgress = useCallback((nextProgress: number) => {
    const next = Math.min(1, Math.max(0, nextProgress));
    progressRef.current = next;
    setProgress(next);
  }, []);

  function togglePlayback() {
    if (!canReplay) {
      return;
    }
    if (progress >= 1) {
      updateProgress(0);
      setPlaying(true);
      return;
    }
    setPlaying((current) => !current);
  }

  const handlePhotoMarkerPress = useCallback((photo: RidePhoto) => {
    setFullScreenVisible(false);
    onPhotoMarkerPress?.(photo);
  }, [onPhotoMarkerPress]);

  if (!hasReplayCoordinates(ride)) {
    return null;
  }

  function handleScrub(nextProgress: number) {
    setPlaying(false);
    updateProgress(nextProgress);
  }

  return (
    <>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.kicker, { color: colors.blue }]}>ROUTE REPLAY</Text>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{title}</Text>
        </View>
        <View style={[styles.sourcePill, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
          <Text style={[styles.sourcePillText, { color: colors.muted }]}>{model.source.toUpperCase()}</Text>
        </View>
      </View>

      <ReplayFactsView facts={facts} />

      <View style={styles.mapFrame}>
        <RideMap
          coordinates={model.coordinates}
          current={canReplay ? position.coordinate : null}
          traveledCoordinates={canReplay ? position.traveledCoordinates : undefined}
          untraveledCoordinates={canReplay ? position.untraveledCoordinates : undefined}
          title={title}
          photoMarkers={photoMarkers}
          live={false}
          fullScreenEnabled={false}
          onPhotoMarkerPress={handlePhotoMarkerPress}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open route replay full screen"
          hitSlop={8}
          pointerEvents="box-only"
          onPress={() => setFullScreenVisible(true)}
          style={({ pressed }) => [styles.expandButton, { backgroundColor: colors.overlay, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name="expand" size={21} color={colors.text} />
        </Pressable>
      </View>

      {canReplay ? (
        <ReplayControls
          model={model}
          position={position}
          progress={progress}
          playing={playing}
          speed={speed}
          onToggle={togglePlayback}
          onScrub={handleScrub}
          onSpeedChange={setSpeed}
        />
      ) : (
        <StaticReplayNotice model={model} />
      )}
      </View>

      <Modal
        visible={fullScreenVisible}
        animationType="slide"
        onRequestClose={() => setFullScreenVisible(false)}
      >
        <SafeAreaView edges={["top", "bottom"]} style={[styles.fullScreen, { backgroundColor: colors.background }]}>
          <RideMap
            coordinates={model.coordinates}
            current={canReplay ? position.coordinate : null}
            traveledCoordinates={canReplay ? position.traveledCoordinates : undefined}
            untraveledCoordinates={canReplay ? position.untraveledCoordinates : undefined}
            title={title}
            photoMarkers={photoMarkers}
            live={false}
            fullScreenEnabled={false}
            style={styles.fullScreenMap}
            onPhotoMarkerPress={handlePhotoMarkerPress}
          />
          <View style={[styles.fullScreenHeader, { backgroundColor: colors.overlay, borderColor: colors.border }]}>
            <View style={styles.fullScreenHeaderText}>
              <Text style={[styles.kicker, { color: colors.blue }]}>ROUTE REPLAY</Text>
              <Text style={[styles.fullScreenTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full screen route replay"
              onPress={() => setFullScreenVisible(false)}
              style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={24} color={colors.onAccent} />
            </Pressable>
          </View>
          <View style={[styles.fullScreenControls, { backgroundColor: colors.overlay, borderColor: colors.border }]}>
            <ReplayFactsView facts={facts} compact />
            {canReplay ? (
              <ReplayControls
                model={model}
                position={position}
                progress={progress}
                playing={playing}
                speed={speed}
                onToggle={togglePlayback}
                onScrub={handleScrub}
                onSpeedChange={setSpeed}
                compact
              />
            ) : <StaticReplayNotice model={model} />}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

type ReplayControlsProps = {
  model: ReturnType<typeof buildRouteReplayModel>;
  position: ReturnType<typeof getReplayPosition>;
  progress: number;
  playing: boolean;
  speed: ReplaySpeed;
  onToggle: () => void;
  onScrub: (progress: number) => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
  compact?: boolean;
};

function ReplayControls({
  model,
  position,
  progress,
  playing,
  speed,
  onToggle,
  onScrub,
  onSpeedChange,
  compact = false
}: ReplayControlsProps) {
  const { colors } = useTheme();
  const trackWidth = useRef(1);
  const canReplay = model.canReplay;
  const scrubFromLocation = useCallback((locationX: number) => {
    onScrub(locationX / Math.max(1, trackWidth.current));
  }, [onScrub]);
  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => canReplay,
      onMoveShouldSetPanResponder: () => canReplay,
      onPanResponderGrant: (event) => scrubFromLocation(event.nativeEvent.locationX),
      onPanResponderMove: (event) => scrubFromLocation(event.nativeEvent.locationX)
    }),
    [canReplay, scrubFromLocation]
  );

  return (
    <View style={styles.controls}>
      <View style={styles.timeRow}>
        <View style={styles.timeBlock}>
          <Text style={[styles.timeLabel, { color: colors.muted }]}>ACTUAL</Text>
          <Text style={[styles.timeValue, compact && styles.compactTimeValue, { color: colors.text }]}>{formatReplayActualTime(position.actualAtMs)}</Text>
        </View>
        <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
        <View style={styles.timeBlock}>
          <Text style={[styles.timeLabel, { color: colors.muted }]}>ELAPSED</Text>
          <Text style={[styles.timeValue, compact && styles.compactTimeValue, { color: colors.text }]}>{formatReplaySeconds(position.elapsedS)} / {formatReplaySeconds(model.durationS || 0)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause route replay" : "Play route replay"}
          onPress={onToggle}
          style={({ pressed }) => [styles.playButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}
        >
          <Ionicons name={playing ? "pause" : "play"} color={colors.onAccent} size={20} />
        </Pressable>
      </View>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Replay position"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        onLayout={(event) => { trackWidth.current = Math.max(1, event.nativeEvent.layout.width); }}
        {...panResponder.panHandlers}
        style={styles.scrubberHitArea}
      >
        <View pointerEvents="none" style={[styles.scrubberTrack, { backgroundColor: colors.borderStrong }]}>
          <View style={[styles.scrubberProgress, { backgroundColor: colors.accent, width: `${progress * 100}%` }]} />
          <View style={[styles.scrubberThumb, { backgroundColor: colors.accent, borderColor: colors.background, left: `${progress * 100}%` }]} />
        </View>
      </View>

      <View style={styles.controlRow}>
        <Text style={[styles.controlLabel, { color: colors.muted }]}>PLAYBACK</Text>
        <View style={styles.speedOptions}>
          {REPLAY_SPEEDS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`${option} times playback speed`}
              accessibilityState={{ selected: speed === option }}
              onPress={() => onSpeedChange(option)}
              style={({ pressed }) => [
                styles.speedOption,
                { borderColor: speed === option ? colors.accent : colors.border, backgroundColor: speed === option ? `${colors.accent}22` : colors.surfaceHigh },
                pressed && styles.pressed
              ]}
            >
              <Text style={[styles.speedOptionText, { color: speed === option ? colors.accent : colors.muted }]}>{option}x</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={[styles.timingNote, { color: colors.muted }]}>{replayTimingLabel(model)}</Text>
    </View>
  );
}

function ReplayFactsView({ facts, compact = false }: { facts: ReplayFacts; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.factRows, compact && styles.compactFactRows]}>
      <View style={styles.factRow}>
        <ReplayFact label="DISTANCE" value={facts.distanceM == null ? "Unavailable" : `${(facts.distanceM / 1000).toFixed(facts.distanceM >= 10000 ? 0 : 1)} km`} colors={colors} />
        <ReplayFact label="DURATION" value={facts.durationS == null ? "Unavailable" : formatReplaySeconds(facts.durationS)} colors={colors} />
        <ReplayFact label="POINTS" value={String(facts.pointCount)} colors={colors} />
      </View>
      <View style={styles.factRow}>
        <ReplayFact label="ACTIVITY / SOURCE" value={`${facts.activityLabel} · ${facts.sourceLabel}`} colors={colors} wide />
        <ReplayFact label={replaySpeedFactLabel(facts, "average")} value={facts.averageSpeedKmh == null ? "Unavailable" : `${Math.round(facts.averageSpeedKmh)} km/h`} colors={colors} />
        <ReplayFact label={replaySpeedFactLabel(facts, "peak")} value={facts.peakSpeedKmh == null ? "Unavailable" : `${Math.round(facts.peakSpeedKmh)} km/h`} colors={colors} />
      </View>
    </View>
  );
}

function ReplayFact({ label, value, colors, wide = false }: { label: string; value: string; colors: ReturnType<typeof useTheme>["colors"]; wide?: boolean }) {
  return (
    <View style={[styles.fact, wide && styles.factWide]}>
      <Text style={[styles.factLabel, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function StaticReplayNotice({ model }: { model: ReturnType<typeof buildRouteReplayModel> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.staticNotice, { backgroundColor: colors.surfaceHigh }]}>
      <Ionicons name="pause-circle-outline" color={colors.muted} size={18} />
      <Text style={[styles.staticNoticeText, { color: colors.muted }]}>Static route · {replayTimingLabel(model)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    padding: 10,
    gap: 10
  },
  mapFrame: {
    position: "relative"
  },
  expandButton: {
    position: "absolute",
    zIndex: 4,
    elevation: 8,
    right: 12,
    bottom: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  controls: {
    gap: 8
  },
  factRows: {
    gap: 9,
    paddingHorizontal: 6
  },
  compactFactRows: {
    paddingHorizontal: 0,
    gap: 6
  },
  factRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  fact: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  factWide: {
    flex: 1.4
  },
  factLabel: {
    fontFamily: typography.bold,
    fontSize: 8,
    letterSpacing: 0.55
  },
  factValue: {
    fontFamily: typography.extraBold,
    fontSize: 12,
    lineHeight: 16
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 6,
    paddingTop: 2
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  kicker: {
    fontFamily: typography.bold,
    fontSize: 10,
    letterSpacing: 1.2
  },
  title: {
    fontFamily: typography.extraBold,
    fontSize: 17,
    lineHeight: 22
  },
  sourcePill: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  sourcePillText: {
    fontFamily: typography.bold,
    fontSize: 9,
    letterSpacing: 0.8
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6
  },
  timeBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  timeLabel: {
    fontFamily: typography.bold,
    fontSize: 9,
    letterSpacing: 0.8
  },
  timeValue: {
    fontFamily: typography.extraBold,
    fontSize: 14
  },
  compactTimeValue: {
    fontSize: 12
  },
  timeDivider: {
    width: 1,
    height: 28
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  scrubberHitArea: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 6
  },
  scrubberTrack: {
    height: 5,
    borderRadius: 3,
    position: "relative"
  },
  scrubberProgress: {
    height: 5,
    borderRadius: 3
  },
  scrubberThumb: {
    position: "absolute",
    top: -5,
    marginLeft: -7,
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 3
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 6
  },
  controlLabel: {
    fontFamily: typography.bold,
    fontSize: 9,
    letterSpacing: 0.8
  },
  speedOptions: {
    flexDirection: "row",
    gap: 6
  },
  speedOption: {
    minWidth: 45,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  speedOptionText: {
    fontFamily: typography.bold,
    fontSize: 12
  },
  timingNote: {
    fontFamily: typography.medium,
    fontSize: 11,
    paddingHorizontal: 6
  },
  staticNotice: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  staticNoticeText: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: 11
  },
  fullScreen: {
    flex: 1
  },
  fullScreenMap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    borderRadius: 0
  },
  fullScreenHeader: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 12,
    minHeight: 56,
    borderRadius: 15,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  fullScreenHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  fullScreenTitle: {
    fontFamily: typography.extraBold,
    fontSize: 15
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  fullScreenControls: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 8
  },
  pressed: {
    opacity: 0.75
  }
});
