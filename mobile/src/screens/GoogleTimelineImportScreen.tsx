import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { PrimaryButton } from "../components/PrimaryButton";
import { RouteVisualizer } from "../components/RouteVisualizer";
import { Screen } from "../components/Screen";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors, typography } from "../theme/colors";
import { GoogleTimelineBackup, GoogleTimelineCandidate, GoogleTimelineGroup, GoogleTimelineUploadState } from "../types";
import { clearGoogleTimelineBackup, GoogleTimelineBackupMetadata, listGoogleTimelineBackups, loadGoogleTimelineBackup, loadGoogleTimelineRawJson, saveGoogleTimelineBackup, updateGoogleTimelineBackupResult } from "../services/googleTimelineBackup";
import {
  clearGoogleTimelineUploadState,
  loadGoogleTimelineUploadState,
  prepareGoogleTimelineImport,
  uploadGoogleTimelineImport,
  GOOGLE_TIMELINE_BACKUP_VERSION,
  GOOGLE_TIMELINE_IMPORT_MAX_SOURCE_BYTES,
  GoogleTimelineImportProgress
} from "../services/googleTimelineImport";

export function GoogleTimelineImportScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const [backup, setBackup] = useState<GoogleTimelineBackup | null>(null);
  const [savedBackups, setSavedBackups] = useState<GoogleTimelineBackupMetadata[]>([]);
  const [uploadState, setUploadState] = useState<GoogleTimelineUploadState | null>(null);
  const [progress, setProgress] = useState<GoogleTimelineImportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewMode, setViewMode] = useState<"dates" | "routes">("dates");
  const [activityFilter, setActivityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [selectionFilter, setSelectionFilter] = useState<"all" | "selected" | "unselected">("all");
  const [previewCandidate, setPreviewCandidate] = useState<GoogleTimelineCandidate | null>(null);
  const [editingGroup, setEditingGroup] = useState<GoogleTimelineGroup | null>(null);
  const [groupTitleDraft, setGroupTitleDraft] = useState("");
  const [albumEnabledDraft, setAlbumEnabledDraft] = useState(false);
  const [mergeGroupIds, setMergeGroupIds] = useState<Set<string>>(() => new Set());
  const [albumCandidateIds, setAlbumCandidateIds] = useState<Set<string>>(() => new Set());
  const [showCustomize, setShowCustomize] = useState(false);
  const [showSavedImports, setShowSavedImports] = useState(false);
  const [importConfirmationOpen, setImportConfirmationOpen] = useState(false);
  const cancelRequested = useRef(false);

  const selectedGroups = useMemo(() => backup?.groups.filter((group) => group.selected !== false) || [], [backup]);
  const selectedCandidates = useMemo(
    () => selectedGroups.reduce((total, group) => total + group.candidates.filter((candidate) => candidate.selected !== false).length, 0),
    [selectedGroups]
  );
  const enabledAlbumCount = useMemo(
    () => selectedGroups.filter((group) => group.albumEnabled !== false && group.candidates.filter((candidate) => candidate.selected !== false).length >= 2).length,
    [selectedGroups]
  );
  const importComplete = uploadState?.phase === "complete";
  const importPaused = uploadState?.phase === "failed" || progress?.phase === "failed";
  const currentStep = !backup ? 1 : busy || progress || importComplete ? 3 : 2;
  const filteredCandidates = useMemo(() => {
    if (!backup) return [];
    const query = searchQuery.trim().toLowerCase();
    return backup.candidates.filter((candidate) =>
      (activityFilter === "all" || candidate.activityType === activityFilter) &&
      (yearFilter === "all" || candidate.localDate.slice(0, 4) === yearFilter) &&
      (monthFilter === "all" || candidate.localDate.slice(5, 7) === monthFilter) &&
      (selectionFilter === "all" || (selectionFilter === "selected" ? candidate.selected !== false : candidate.selected === false)) &&
      (!query || `${candidate.localDate} ${candidate.activityType} ${candidate.startLabel} ${candidate.endLabel}`.toLowerCase().includes(query))
    );
  }, [activityFilter, backup, monthFilter, searchQuery, selectionFilter, yearFilter]);
  const activityTypes = useMemo(() => ["all", ...Array.from(new Set(backup?.candidates.map((candidate) => candidate.activityType) || []))], [backup]);
  const years = useMemo(() => ["all", ...Array.from(new Set(backup?.candidates.map((candidate) => candidate.localDate.slice(0, 4)) || [])).sort()], [backup]);
  const months = useMemo(() => ["all", ...Array.from(new Set(backup?.candidates.map((candidate) => candidate.localDate.slice(5, 7)) || [])).sort()], [backup]);

  const loadExisting = useCallback(async () => {
    let [savedBackup, savedState, saved] = await Promise.all([loadGoogleTimelineBackup(), loadGoogleTimelineUploadState(), listGoogleTimelineBackups()]);
    if (savedBackup && savedBackup.version < GOOGLE_TIMELINE_BACKUP_VERSION && savedState?.phase !== "complete") {
      setBusy(true);
      setNotice("Refreshing your saved Timeline analysis...");
      const rawJson = await loadGoogleTimelineRawJson(savedBackup.importId);
      if (rawJson) {
        try {
          const prepared = await prepareGoogleTimelineImport(rawJson);
          savedBackup = prepared.backup;
          savedState = prepared.state;
          await updateGoogleTimelineBackupResult(savedBackup.importId, "ready", 0);
          saved = await listGoogleTimelineBackups();
          setNotice("Your saved Timeline analysis is up to date.");
        } catch {
          savedBackup = null;
          setError("The saved Timeline analysis could not be refreshed. Choose the original file again.");
        } finally {
          setBusy(false);
        }
      } else {
        savedBackup = null;
        setBusy(false);
        setError("This saved analysis needs the original Timeline file again. Choose it below to refresh safely.");
      }
    }
    if (savedBackup) setBackup(savedBackup);
    if (savedState && savedBackup?.importId === savedState.importId) setUploadState(savedState);
    setSavedBackups(saved);
  }, []);

  useEffect(() => {
    loadExisting().catch(() => {});
  }, [loadExisting]);

  async function pickTimeline() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      if (typeof asset.size === "number" && asset.size > GOOGLE_TIMELINE_IMPORT_MAX_SOURCE_BYTES) {
        throw new Error("This Timeline export is larger than the 64 MiB device limit.");
      }
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const prepared = await prepareGoogleTimelineImport(text);
      setBackup(prepared.backup);
      setSavedBackups(await listGoogleTimelineBackups());
      setUploadState(prepared.state);
      setProgress(null);
      setMergeGroupIds(new Set());
      setAlbumCandidateIds(new Set());
      setShowCustomize(false);
      setViewMode("dates");
      setSearchQuery("");
      setYearFilter("all");
      setMonthFilter("all");
      setSelectionFilter("all");
      setNotice(`RidePulse found ${prepared.backup.candidates.length.toLocaleString()} rides and grouped them automatically. Nothing has been added yet.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Timeline import could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleGroup(groupId: string) {
    if (!backup || busy) return;
    const next: GoogleTimelineBackup = {
      ...backup,
      groups: backup.groups.map((group) => group.id === groupId ? { ...group, selected: !group.selected } : group)
    };
    setBackup(next);
    setMergeGroupIds(new Set());
    setAlbumCandidateIds(new Set());
    try {
      await saveGoogleTimelineBackup(next);
    } catch {
      setError("Selection could not be saved locally. Try again.");
    }
  }

  async function toggleCandidate(candidateId: string) {
    if (!backup || busy) return;
    const next: GoogleTimelineBackup = {
      ...backup,
      candidates: backup.candidates.map((candidate) => candidate.id === candidateId ? { ...candidate, selected: candidate.selected === false } : candidate),
      groups: backup.groups.map((group) => ({ ...group, candidates: group.candidates.map((candidate) => candidate.id === candidateId ? { ...candidate, selected: candidate.selected === false } : candidate) }))
    };
    setBackup(next);
    await saveGoogleTimelineBackup(next).catch(() => setError("Selection could not be saved locally. Try again."));
  }

  async function selectFiltered(selected: boolean) {
    if (!backup || busy) return;
    const ids = new Set(filteredCandidates.map((candidate) => candidate.id));
    const next: GoogleTimelineBackup = {
      ...backup,
      candidates: backup.candidates.map((candidate) => ids.has(candidate.id) ? { ...candidate, selected } : candidate),
      groups: backup.groups.map((group) => ({ ...group, candidates: group.candidates.map((candidate) => ids.has(candidate.id) ? { ...candidate, selected } : candidate) }))
    };
    setBackup(next);
    await saveGoogleTimelineBackup(next).catch(() => setError("Selection could not be saved locally. Try again."));
  }

  function openGroupEditor(group: GoogleTimelineGroup) {
    setEditingGroup(group);
    setGroupTitleDraft(group.title);
    setAlbumEnabledDraft(group.albumEnabled !== false);
  }

  async function saveGroupEdit() {
    if (!backup || !editingGroup) return;
    const next: GoogleTimelineBackup = {
      ...backup,
      groups: backup.groups.map((group) => group.id === editingGroup.id ? { ...group, title: groupTitleDraft.trim() || group.title, albumEnabled: albumEnabledDraft } : group)
    };
    setBackup(next);
    setEditingGroup(null);
    await saveGoogleTimelineBackup(next).catch(() => setError("Album settings could not be saved locally."));
  }

  async function mergeSelectedGroups() {
    if (!backup || mergeGroupIds.size < 2) return;
    const groupsToMerge = backup.groups.filter((group) => mergeGroupIds.has(group.id));
    const candidates = groupsToMerge.flatMap((group) => group.candidates).sort((first, second) => Date.parse(first.startedAt) - Date.parse(second.startedAt));
    const merged: GoogleTimelineGroup = {
      id: `merged-${candidates[0].id.slice(-12)}-${candidates[candidates.length - 1].id.slice(-12)}-${candidates.length}`,
      title: "Merged Timeline album",
      startedAt: candidates[0].startedAt,
      endedAt: candidates[candidates.length - 1].endedAt,
      distanceM: candidates.reduce((sum, candidate) => sum + candidate.distanceM, 0),
      candidates,
      selected: true,
      albumEnabled: true
    };
    const selectedIds = new Set(groupsToMerge.map((group) => group.id));
    const next = { ...backup, groups: [...backup.groups.filter((group) => !selectedIds.has(group.id)), merged] };
    setBackup(next);
    setMergeGroupIds(new Set());
    await saveGoogleTimelineBackup(next).catch(() => setError("Albums could not be merged locally."));
  }

  function toggleMergeGroup(groupId: string) {
    setMergeGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleAlbumCandidate(candidateId: string) {
    setAlbumCandidateIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function createAlbumFromSelected() {
    if (!backup || albumCandidateIds.size < 2) return;
    Alert.alert(
      "Create album from selected routes?",
      `${albumCandidateIds.size.toLocaleString()} chosen routes will be moved into one album.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Create album", onPress: () => void applyCreateAlbumFromSelected() }
      ]
    );
  }

  async function applyCreateAlbumFromSelected() {
    if (!backup) return;
    const selected = backup.groups
      .flatMap((group) => group.candidates)
      .filter((candidate) => albumCandidateIds.has(candidate.id))
      .sort((first, second) => Date.parse(first.startedAt) - Date.parse(second.startedAt));
    if (selected.length < 2) return;
    const selectedIds = new Set(selected.map((candidate) => candidate.id));
    const remainingGroups = backup.groups
      .map((group) => {
        const candidates = group.candidates.filter((candidate) => !selectedIds.has(candidate.id));
        if (!candidates.length) return null;
        const sorted = candidates.slice().sort((first, second) => Date.parse(first.startedAt) - Date.parse(second.startedAt));
        return {
          ...group,
          candidates: sorted,
          startedAt: sorted[0].startedAt,
          endedAt: sorted[sorted.length - 1].endedAt,
          distanceM: sorted.reduce((sum, candidate) => sum + candidate.distanceM, 0),
          albumEnabled: group.albumEnabled && sorted.length >= 2
        };
      })
      .filter((group): group is GoogleTimelineGroup => group != null);
    const newGroup: GoogleTimelineGroup = {
      id: `selected-${selected[0].id.slice(-12)}-${selected[selected.length - 1].id.slice(-12)}-${selected.length}`,
      title: "Selected Timeline album",
      startedAt: selected[0].startedAt,
      endedAt: selected[selected.length - 1].endedAt,
      distanceM: selected.reduce((sum, candidate) => sum + candidate.distanceM, 0),
      candidates: selected,
      selected: true,
      albumEnabled: true
    };
    const next = { ...backup, groups: [...remainingGroups, newGroup] };
    setBackup(next);
    setAlbumCandidateIds(new Set());
    await saveGoogleTimelineBackup(next).catch(() => setError("The new album could not be saved locally."));
  }

  async function reopenBackup(importId: string) {
    let saved = await loadGoogleTimelineBackup(importId);
    if (!saved) { setError("That saved import is no longer available on this device."); return; }
    let state = await loadGoogleTimelineUploadState(importId);
    if (saved.version < GOOGLE_TIMELINE_BACKUP_VERSION && state?.phase !== "complete") {
      setBusy(true);
      setNotice("Refreshing your saved Timeline analysis...");
      const rawJson = await loadGoogleTimelineRawJson(importId);
      if (!rawJson) { setBusy(false); setError("Choose the original Timeline file again to refresh this saved analysis safely."); return; }
      try {
        const prepared = await prepareGoogleTimelineImport(rawJson);
        saved = prepared.backup;
        state = prepared.state;
        await updateGoogleTimelineBackupResult(saved.importId, "ready", 0);
        setSavedBackups(await listGoogleTimelineBackups());
      } catch {
        setError("The saved Timeline analysis could not be refreshed. Choose the original file again.");
        return;
      } finally {
        setBusy(false);
      }
    }
    setBackup(saved);
    setUploadState(state);
    setShowCustomize(false);
    setMergeGroupIds(new Set());
    setAlbumCandidateIds(new Set());
    setNotice("Saved Timeline import reopened.");
  }

  function deleteBackup(metadata: GoogleTimelineBackupMetadata) {
    Alert.alert("Delete saved import?", "This removes RidePulse's private local copy. The original file in Downloads is not changed, and rides already uploaded stay in your Journal.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await clearGoogleTimelineBackup(metadata.importId);
        await clearGoogleTimelineUploadState(metadata.importId);
        setSavedBackups(await listGoogleTimelineBackups());
        if (backup?.importId === metadata.importId) { setBackup(null); setUploadState(null); }
      } }
    ]);
  }

  function startUpload() {
    if (!backup || busy || selectedCandidates < 1) return;
    setImportConfirmationOpen(true);
  }

  async function performUpload() {
    if (!backup || busy || selectedCandidates < 1) return;
    setImportConfirmationOpen(false);
    cancelRequested.current = false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const finalState = await uploadGoogleTimelineImport(backup, {
        onProgress: handleProgress,
        shouldCancel: () => cancelRequested.current
      });
      setUploadState(finalState);
      setSavedBackups(await listGoogleTimelineBackups());
      setNotice(`Added ${finalState.uploadedCandidateIds.length.toLocaleString()} rides and created ${Object.keys(finalState.tripIdsByGroupId).length.toLocaleString()} Trips. ${finalState.skippedCandidateIds.length.toLocaleString()} existing or overlapping rides were skipped safely.`);
    } catch (value) {
      const message = value instanceof Error ? value.message : "Timeline upload stopped.";
      setError(message.toLowerCase().includes("timed out")
        ? "The server took too long for this batch. Your progress is saved; tap Resume import to continue safely."
        : message);
      const state = await loadGoogleTimelineUploadState();
      if (state) setUploadState(state);
    } finally {
      setBusy(false);
    }
  }

  function handleProgress(next: GoogleTimelineImportProgress) {
    setProgress(next);
  }

  function pauseImport() {
    cancelRequested.current = true;
    setNotice("Pausing after the current batch. You can resume from this saved import.");
  }

  const renderCandidate = useCallback(({ item }: { item: GoogleTimelineCandidate }) => (
    <View style={styles.routeRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.selected !== false, disabled: busy }}
        disabled={busy}
        onPress={() => toggleCandidate(item.id)}
        style={({ pressed }) => [styles.routeSelect, { backgroundColor: colors.surface, borderColor: item.selected !== false ? `${colors.accent}55` : colors.border }, pressed && styles.pressed]}
      >
        <View style={[styles.checkboxSmall, { backgroundColor: item.selected !== false ? colors.accent : colors.surfaceHigh }]}><Ionicons name={item.selected !== false ? "checkmark" : "remove"} color={item.selected !== false ? colors.onAccent : colors.muted} size={15} /></View>
        <View style={styles.groupCopy}>
          <Text style={[styles.groupTitle, { color: colors.text }]}>{item.activityType.replaceAll("_", " ")}</Text>
          <Text style={[styles.groupMeta, { color: colors.muted }]}>{item.localDate} · {Math.round(item.distanceM / 1000 * 10) / 10} km · {Math.round(item.durationS / 60)} min</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Preview route" onPress={() => setPreviewCandidate(item)} style={[styles.previewButton, { backgroundColor: colors.surfaceHigh }]}>
        <Ionicons name="eye-outline" color={colors.accent} size={19} />
      </Pressable>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Choose route for a custom album" accessibilityState={{ checked: albumCandidateIds.has(item.id) }} onPress={() => toggleAlbumCandidate(item.id)} style={[styles.previewButton, { backgroundColor: albumCandidateIds.has(item.id) ? colors.accent : colors.surfaceHigh }]}>
        <Ionicons name="albums-outline" color={albumCandidateIds.has(item.id) ? colors.onAccent : colors.muted} size={19} />
      </Pressable>
    </View>
  ), [albumCandidateIds, busy, colors, backup]);

  const renderGroup = useCallback(({ item }: { item: GoogleTimelineGroup }) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.selected !== false, disabled: busy }}
      disabled={busy}
      onPress={() => toggleGroup(item.id)}
      style={({ pressed }) => [styles.group, { backgroundColor: colors.surface, borderColor: item.selected !== false ? `${colors.accent}70` : colors.border }, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, { backgroundColor: item.selected !== false ? colors.accent : colors.surfaceHigh }]}>
        <Ionicons name={item.selected !== false ? "checkmark" : "remove"} color={item.selected !== false ? colors.onAccent : colors.muted} size={18} />
      </View>
      <View style={styles.groupCopy}>
        <Text style={[styles.groupTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.groupMeta, { color: colors.muted }]}>{item.candidates.length} routes · {Math.round(item.distanceM / 1000)} km{item.albumEnabled ? " · album" : " · standalone"}</Text>
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Choose date album to merge" accessibilityState={{ checked: mergeGroupIds.has(item.id) }} onPress={(event) => { event.stopPropagation(); toggleMergeGroup(item.id); }} style={[styles.iconButton, { backgroundColor: mergeGroupIds.has(item.id) ? colors.accent : colors.surfaceHigh }]}><Ionicons name="git-merge-outline" color={mergeGroupIds.has(item.id) ? colors.onAccent : colors.muted} size={18} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit Timeline album" onPress={(event) => { event.stopPropagation(); openGroupEditor(item); }} style={styles.iconButton}><Ionicons name="create-outline" color={colors.muted} size={19} /></Pressable>
    </Pressable>
  ), [busy, colors, backup, mergeGroupIds]);

  return (
    <Screen includeTopInset={false}>
      <FlatList
        style={styles.list}
        data={showCustomize ? (viewMode === "dates" ? backup?.groups || [] : filteredCandidates) : []}
        keyExtractor={(item: any) => item.id}
        renderItem={(viewMode === "dates" ? renderGroup : renderCandidate) as any}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>GOOGLE MAPS TIMELINE</Text>
            <Text style={[styles.title, { color: colors.text }]}>{backup ? "Your past rides are ready" : "Bring your past rides into RidePulse"}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{backup ? "RidePulse has prepared the file and will handle duplicates and Trip grouping automatically." : "Choose your Timeline JSON once. You will see a simple summary before anything is added."}</Text>
            <ImportSteps current={currentStep} colors={colors} />

            {!backup ? (
              <>
                <PrimaryButton label={busy ? "Reading your Timeline..." : "Choose Timeline JSON"} icon="document-text" loading={busy} onPress={pickTimeline} block />
                <View style={styles.simpleGuide}>
                  <GuideRow icon="search-outline" title="Find your rides" body="RidePulse recognizes motorcycle and passenger-vehicle journeys." colors={colors} />
                  <GuideRow icon="checkmark-circle-outline" title="You approve the result" body="Nothing is added until you confirm the summary." colors={colors} />
                  <GuideRow icon="lock-closed-outline" title="Your export stays private" body="The raw Google file remains on this phone." colors={colors} />
                </View>
              </>
            ) : (
              <>
                <View style={[styles.summary, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>What RidePulse found</Text>
                  <View style={styles.summaryStats}>
                    <SummaryStat value={selectedCandidates.toLocaleString()} label="rides" colors={colors} />
                    <SummaryStat value={enabledAlbumCount.toLocaleString()} label="Trips" colors={colors} />
                  </View>
                  <Text style={[styles.summaryHint, { color: colors.muted }]}>RidePulse adds only new rides. Rides from the same date become a Trip automatically.</Text>
                </View>

                <Pressable accessibilityRole="button" onPress={() => setShowCustomize((value) => !value)} style={[styles.customizeButton, { borderColor: colors.border }]}>
                  <Ionicons name="options-outline" color={colors.accent} size={19} />
                  <View style={styles.groupCopy}><Text style={[styles.customizeTitle, { color: colors.text }]}>Customize rides and Trips</Text><Text style={[styles.choiceBody, { color: colors.muted }]}>Optional: exclude dates, preview routes, rename Trips, or merge groups.</Text></View>
                  <Ionicons name={showCustomize ? "chevron-up" : "chevron-down"} color={colors.muted} size={18} />
                </Pressable>
                <Pressable accessibilityRole="button" onPress={pickTimeline} disabled={busy} style={styles.changeFileButton}><Ionicons name="document-text-outline" color={colors.muted} size={17} /><Text style={[styles.changeFileText, { color: colors.muted }]}>Choose a different file</Text></Pressable>
              </>
            )}

            {savedBackups.length ? <Pressable accessibilityRole="button" onPress={() => setShowSavedImports((value) => !value)} style={styles.savedToggle}><Text style={[styles.savedToggleText, { color: colors.muted }]}>Saved imports ({savedBackups.length})</Text><Ionicons name={showSavedImports ? "chevron-up" : "chevron-down"} color={colors.muted} size={17} /></Pressable> : null}
            {showSavedImports ? <View style={styles.savedArea}>{savedBackups.map((saved) => <View key={saved.importId} style={[styles.savedRow, { backgroundColor: colors.surfaceHigh }]}><Pressable onPress={() => reopenBackup(saved.importId)} style={styles.savedOpen}><Ionicons name="archive-outline" color={colors.accent} size={18} /><View style={styles.groupCopy}><Text numberOfLines={1} style={[styles.groupTitle, { color: colors.text }]}>{saved.coverageStart && saved.coverageEnd ? `${saved.coverageStart} to ${saved.coverageEnd}` : saved.createdAt.slice(0, 10)} · {saved.candidateCount.toLocaleString()} rides</Text><Text numberOfLines={1} style={[styles.groupMeta, { color: colors.muted }]}>{formatBackupSize(saved.fileSizeBytes)} · {backupStatusLabel(saved)}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete saved Timeline import" onPress={() => deleteBackup(saved)} style={styles.iconButton}><Ionicons name="trash-outline" color={colors.danger} size={18} /></Pressable></View>)}</View> : null}
            {backup && showCustomize ? <View style={styles.reviewToolbar}><Text style={[styles.sectionHeading, { color: colors.text }]}>Choose what to import</Text><Text style={[styles.choiceBody, { color: colors.muted }]}>Everything is selected. Tap a date or ride only when you want to leave it out.</Text><View style={styles.modeSwitch}>{(["dates", "routes"] as const).map((mode) => <Pressable key={mode} onPress={() => setViewMode(mode)} style={[styles.modeButton, { backgroundColor: viewMode === mode ? colors.accent : colors.surfaceHigh }]}><Text style={[styles.modeText, { color: viewMode === mode ? colors.onAccent : colors.muted }]}>{mode === "dates" ? "By date" : "Individual rides"}</Text></Pressable>)}</View>{viewMode === "routes" ? <View style={styles.bulkRow}><Pressable onPress={() => selectFiltered(true)} style={[styles.bulkButton, { borderColor: colors.border }]}><Text style={[styles.bulkText, { color: colors.text }]}>Select visible</Text></Pressable><Pressable onPress={() => selectFiltered(false)} style={[styles.bulkButton, { borderColor: colors.border }]}><Text style={[styles.bulkText, { color: colors.text }]}>Clear visible</Text></Pressable><Pressable disabled={albumCandidateIds.size < 2} onPress={createAlbumFromSelected} style={[styles.bulkButton, { borderColor: colors.border, opacity: albumCandidateIds.size < 2 ? 0.45 : 1 }]}><Ionicons name="albums-outline" color={colors.accent} size={16} /><Text style={[styles.bulkText, { color: colors.text }]}>Make Trip ({albumCandidateIds.size})</Text></Pressable></View> : <Pressable disabled={mergeGroupIds.size < 2} onPress={mergeSelectedGroups} style={[styles.bulkButton, { borderColor: colors.border, opacity: mergeGroupIds.size < 2 ? 0.45 : 1 }]}><Ionicons name="git-merge-outline" color={colors.accent} size={16} /><Text style={[styles.bulkText, { color: colors.text }]}>Merge Trips ({mergeGroupIds.size})</Text></Pressable>}</View> : null}
            {backup && showCustomize && viewMode === "routes" ? <>
              <View style={[styles.searchField, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="search" color={colors.muted} size={18} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search date, place, or activity" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} autoCapitalize="none" autoCorrect={false} /><Pressable accessibilityRole="button" accessibilityLabel="Clear Timeline search" disabled={!searchQuery} onPress={() => setSearchQuery("")} style={styles.searchClear}><Ionicons name="close-circle" color={searchQuery ? colors.muted : "transparent"} size={18} /></Pressable></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{activityTypes.map((type) => <Pressable key={type} onPress={() => setActivityFilter(type)} style={[styles.chip, { borderColor: activityFilter === type ? colors.accent : colors.border, backgroundColor: activityFilter === type ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: activityFilter === type ? colors.accent : colors.muted }]}>{type === "all" ? "All activity" : type.replaceAll("_", " ")}</Text></Pressable>)}</ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{years.map((year) => <Pressable key={year} onPress={() => setYearFilter(year)} style={[styles.chip, { borderColor: yearFilter === year ? colors.accent : colors.border, backgroundColor: yearFilter === year ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: yearFilter === year ? colors.accent : colors.muted }]}>{year === "all" ? "All years" : year}</Text></Pressable>)}</ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{months.map((month) => <Pressable key={month} onPress={() => setMonthFilter(month)} style={[styles.chip, { borderColor: monthFilter === month ? colors.accent : colors.border, backgroundColor: monthFilter === month ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: monthFilter === month ? colors.accent : colors.muted }]}>{month === "all" ? "All months" : monthLabel(month)}</Text></Pressable>)}</ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "selected", "unselected"] as const).map((filter) => <Pressable key={filter} onPress={() => setSelectionFilter(filter)} style={[styles.chip, { borderColor: selectionFilter === filter ? colors.accent : colors.border, backgroundColor: selectionFilter === filter ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: selectionFilter === filter ? colors.accent : colors.muted }]}>{filter === "all" ? "All routes" : filter === "selected" ? "Selected" : "Unselected"}</Text></Pressable>)}</ScrollView>
            </> : null}
            {progress ? (
              <View style={[styles.progress, { backgroundColor: colors.surface }]}>
                <View style={styles.progressHeader}><Text style={[styles.progressTitle, { color: colors.text }]}>{progress.phase === "complete" ? "Import complete" : progress.phase === "failed" ? "Import paused" : "Reviewing and adding rides"}</Text><Text style={[styles.progressValue, { color: colors.accent }]}>{progress.processedCandidates}/{progress.totalCandidates}</Text></View>
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHigh }]}><View style={[styles.progressFill, { backgroundColor: progress.phase === "failed" ? colors.danger : colors.accent, width: `${progress.totalCandidates ? Math.min(100, progress.processedCandidates / progress.totalCandidates * 100) : 0}%` }]} /></View>
              </View>
            ) : null}
            {error ? <View style={[styles.notice, { backgroundColor: `${colors.danger}16` }]}><Ionicons name="alert-circle" color={colors.danger} size={20} /><Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text></View> : null}
            {notice ? <View style={[styles.notice, { backgroundColor: `${colors.success}16` }]}><Ionicons name="checkmark-circle" color={colors.success} size={20} /><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text></View> : null}
            {backup && showCustomize ? <Text style={[styles.sectionLabel, { color: colors.muted }]}>{viewMode === "dates" ? `${selectedGroups.length.toLocaleString()} selected dates` : `${filteredCandidates.length.toLocaleString()} visible rides`}</Text> : null}
          </View>
        )}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
      />
      {backup ? <View style={[styles.actionDock, { backgroundColor: colors.background, borderColor: colors.border }]}>{importComplete ? <PrimaryButton label="View rides in Journal" icon="checkmark-circle" onPress={() => navigation.navigate("MainTabs", { screen: "Journal" })} block /> : <PrimaryButton label={busy ? "Reviewing and adding rides..." : importPaused ? "Resume import" : `Add ${selectedCandidates.toLocaleString()} rides`} icon={importPaused ? "refresh" : "cloud-upload"} loading={busy} disabled={!selectedCandidates} onPress={startUpload} block />}{busy && progress ? <Pressable accessibilityRole="button" onPress={pauseImport} style={styles.dockLink}><Ionicons name="pause" color={colors.accent} size={17} /><Text style={[styles.linkText, { color: colors.text }]}>Pause after this batch</Text></Pressable> : null}</View> : null}
      {busy && !backup ? <View style={styles.busyOverlay}><ActivityIndicator color={colors.accent} /></View> : null}
      <Modal visible={Boolean(previewCandidate)} animationType="slide" onRequestClose={() => setPreviewCandidate(null)}>
        <Screen><View style={styles.previewSheet}><View style={styles.sheetHeader}><Text style={[styles.previewTitle, { color: colors.text }]}>Route preview</Text><Pressable accessibilityRole="button" accessibilityLabel="Close route preview" onPress={() => setPreviewCandidate(null)} style={[styles.iconButton, { backgroundColor: colors.surfaceHigh }]}><Ionicons name="close" color={colors.text} size={21} /></Pressable></View>{previewCandidate ? <RoutePreview candidate={previewCandidate} /> : null}</View></Screen>
      </Modal>
      <Modal visible={Boolean(editingGroup)} transparent animationType="slide" onRequestClose={() => setEditingGroup(null)}><View style={styles.modalBackdrop}><Pressable style={styles.modalDismiss} onPress={() => setEditingGroup(null)} /><View style={[styles.editSheet, { backgroundColor: colors.surface }]}><Text style={[styles.previewTitle, { color: colors.text }]}>Edit album</Text><TextInput value={groupTitleDraft} onChangeText={setGroupTitleDraft} placeholder="Album name" placeholderTextColor={colors.muted} style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} /><Pressable accessibilityRole="switch" accessibilityState={{ checked: albumEnabledDraft }} onPress={() => setAlbumEnabledDraft((enabled) => !enabled)} style={[styles.albumToggle, { borderColor: albumEnabledDraft ? colors.accent : colors.border, backgroundColor: albumEnabledDraft ? `${colors.accent}18` : colors.surfaceHigh }]}><Ionicons name={albumEnabledDraft ? "albums" : "remove-circle-outline"} color={albumEnabledDraft ? colors.accent : colors.muted} size={19} /><Text style={[styles.bulkText, { color: colors.text }]}>{albumEnabledDraft ? "Create album for this date" : "Keep routes standalone"}</Text></Pressable><PrimaryButton label="Save album" icon="save" onPress={saveGroupEdit} block /></View></View></Modal>
      <ConfirmationModal
        visible={importConfirmationOpen}
        title={importPaused ? "Resume Timeline import?" : "Add these rides?"}
        message={importPaused ? "RidePulse will continue from the last completed batch." : "RidePulse will review, deduplicate, and group the selected rides automatically."}
        detail={importPaused ? "Completed rides will not be added twice." : `${selectedCandidates.toLocaleString()} rides selected · Up to ${enabledAlbumCount.toLocaleString()} Trips`}
        confirmLabel={importPaused ? "Resume import" : "Add rides"}
        confirmIcon={importPaused ? "refresh" : "cloud-upload"}
        loading={busy}
        onClose={() => setImportConfirmationOpen(false)}
        onConfirm={() => void performUpload()}
      />
    </Screen>
  );
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function ImportSteps({ current, colors }: { current: number; colors: ThemeColors }) {
  return <View style={styles.steps}>{["Choose file", "Review", "Import"].map((label, index) => {
    const step = index + 1;
    const complete = step < current;
    const active = step === current;
    return <React.Fragment key={label}><View style={styles.step}><View style={[styles.stepCircle, { backgroundColor: complete || active ? colors.accent : colors.surfaceHigh }]}>{complete ? <Ionicons name="checkmark" color={colors.onAccent} size={15} /> : <Text style={[styles.stepNumber, { color: active ? colors.onAccent : colors.muted }]}>{step}</Text>}</View><Text style={[styles.stepLabel, { color: active ? colors.text : colors.muted }]}>{label}</Text></View>{step < 3 ? <View style={[styles.stepLine, { backgroundColor: complete ? colors.accent : colors.border }]} /> : null}</React.Fragment>;
  })}</View>;
}

function GuideRow({ icon, title, body, colors }: { icon: IoniconName; title: string; body: string; colors: ThemeColors }) {
  return <View style={styles.guideRow}><View style={[styles.guideIcon, { backgroundColor: colors.surfaceHigh }]}><Ionicons name={icon} color={colors.accent} size={20} /></View><View style={styles.groupCopy}><Text style={[styles.guideTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.guideBody, { color: colors.muted }]}>{body}</Text></View></View>;
}

function SummaryStat({ value, label, colors }: { value: string; label: string; colors: ThemeColors }) {
  return <View style={styles.summaryStat}><Text adjustsFontSizeToFit numberOfLines={1} style={[styles.summaryStatValue, { color: colors.text }]}>{value}</Text><Text style={[styles.summaryStatLabel, { color: colors.muted }]}>{label}</Text></View>;
}

function RoutePreview({ candidate }: { candidate: GoogleTimelineCandidate }) {
  return <RouteVisualizer ride={{ points: candidate.points, startedAt: candidate.startedAt, endedAt: candidate.endedAt, durationS: candidate.durationS, distanceM: candidate.distanceM, source: "imported", importSource: "google_timeline", sourceActivityType: candidate.activityType, speedDataQuality: candidate.points.some((point) => point.speedKmh != null) ? "measured" : "estimated" }} title={`${candidate.localDate} · ${candidate.activityType.replaceAll("_", " ")}`} />;
}

function monthLabel(month: string) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1] || month;
}

function formatBackupSize(bytes: number) {
  return bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : "Size unavailable";
}

function backupStatusLabel(backup: GoogleTimelineBackupMetadata) {
  if (backup.lastImportPhase === "complete") return `${backup.lastImportedCount || 0} imported`;
  if (backup.lastImportPhase === "failed") return "Import paused";
  return "Ready to review";
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 10 },
  headerContent: { gap: 13, marginBottom: 6 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 0 },
  title: { fontFamily: typography.extraBold, fontSize: 34, lineHeight: 40 },
  subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21 },
  steps: { minHeight: 58, flexDirection: "row", alignItems: "flex-start", paddingTop: 4 },
  step: { width: 70, alignItems: "center", gap: 6 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNumber: { fontFamily: typography.bold, fontSize: 12 },
  stepLabel: { fontFamily: typography.bold, fontSize: 10, textAlign: "center" },
  stepLine: { flex: 1, height: 2, marginTop: 13 },
  simpleGuide: { gap: 16, paddingVertical: 8 },
  guideRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  guideIcon: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  guideTitle: { fontFamily: typography.bold, fontSize: 14 },
  guideBody: { fontFamily: typography.regular, fontSize: 12, lineHeight: 18 },
  summary: { borderRadius: 20, padding: 15, gap: 8 },
  summaryTitle: { fontFamily: typography.bold, fontSize: 15 },
  summaryStats: { flexDirection: "row", gap: 18, paddingVertical: 5 },
  summaryStat: { flex: 1, minWidth: 0 },
  summaryStatValue: { fontFamily: typography.extraBold, fontSize: 28 },
  summaryStatLabel: { fontFamily: typography.bold, fontSize: 11 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontFamily: typography.medium, fontSize: 12 },
  summaryValue: { fontFamily: typography.extraBold, fontSize: 17 },
  summaryHint: { fontFamily: typography.regular, fontSize: 11, lineHeight: 17, marginTop: 2 },
  savedArea: { gap: 7 },
  savedToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  savedToggleText: { fontFamily: typography.bold, fontSize: 12 },
  savedRow: { minHeight: 54, borderRadius: 14, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  savedOpen: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  sectionLabel: { fontFamily: typography.bold, fontSize: 11, letterSpacing: 0, marginTop: 4 },
  sectionHeading: { fontFamily: typography.extraBold, fontSize: 18 },
  reviewToolbar: { gap: 9 },
  modeSwitch: { flexDirection: "row", alignSelf: "flex-start", borderRadius: 14, overflow: "hidden" },
  modeButton: { minHeight: 38, minWidth: 80, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  modeText: { fontFamily: typography.bold, fontSize: 12 },
  bulkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bulkButton: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  bulkText: { fontFamily: typography.bold, fontSize: 11 },
  chips: { gap: 7, paddingVertical: 2 },
  chip: { minHeight: 34, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: typography.medium, fontSize: 11 },
  group: { minHeight: 68, borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  checkbox: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  groupCopy: { flex: 1, minWidth: 0, gap: 4 },
  groupTitle: { fontFamily: typography.bold, fontSize: 14 },
  groupMeta: { fontFamily: typography.medium, fontSize: 12 },
  routeRow: { flexDirection: "row", alignItems: "stretch", gap: 7 },
  routeSelect: { flex: 1, minHeight: 64, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  checkboxSmall: { width: 29, height: 29, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  previewButton: { width: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  progress: { borderRadius: 18, padding: 14, gap: 10 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  progressTitle: { fontFamily: typography.bold, fontSize: 13 },
  progressValue: { fontFamily: typography.bold, fontSize: 12 },
  progressTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  choiceBody: { fontFamily: typography.regular, fontSize: 11, lineHeight: 17 },
  customizeButton: { minHeight: 68, borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  customizeTitle: { fontFamily: typography.bold, fontSize: 13 },
  changeFileButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  changeFileText: { fontFamily: typography.bold, fontSize: 11 },
  notice: { minHeight: 56, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { flex: 1, fontFamily: typography.medium, fontSize: 12, lineHeight: 18 },
  empty: { borderRadius: 20, padding: 18, gap: 7, alignItems: "flex-start" },
  emptyTitle: { fontFamily: typography.bold, fontSize: 16 },
  emptyText: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19 },
  footer: { gap: 13, marginTop: 8 },
  linkButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  pauseButton: { minHeight: 44, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  linkText: { fontFamily: typography.bold, fontSize: 13 },
  actionDock: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 8 },
  dockLink: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  searchField: { minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 0, fontFamily: typography.medium, fontSize: 13 },
  searchClear: { width: 24, height: 32, alignItems: "center", justifyContent: "center" },
  previewSheet: { flex: 1, padding: 18, gap: 12 },
  previewTitle: { fontFamily: typography.extraBold, fontSize: 22 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  editSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34, gap: 13 },
  editInput: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: typography.medium, fontSize: 13 },
  albumToggle: { minHeight: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  pressed: { opacity: 0.86, transform: [{ scale: 0.992 }] },
  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.18)" }
});
