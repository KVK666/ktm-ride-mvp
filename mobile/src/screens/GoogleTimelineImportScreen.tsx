import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { PrimaryButton } from "../components/PrimaryButton";
import { RouteVisualizer } from "../components/RouteVisualizer";
import { Screen } from "../components/Screen";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/colors";
import { GoogleTimelineBackup, GoogleTimelineCandidate, GoogleTimelineGroup, GoogleTimelineUploadState } from "../types";
import { clearGoogleTimelineBackup, GoogleTimelineBackupMetadata, listGoogleTimelineBackups, loadGoogleTimelineBackup, saveGoogleTimelineBackup } from "../services/googleTimelineBackup";
import {
  clearGoogleTimelineUploadState,
  loadGoogleTimelineUploadState,
  prepareGoogleTimelineImport,
  uploadGoogleTimelineImport,
  checkGoogleTimelineImport,
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
  const [checkSummary, setCheckSummary] = useState<{ newCount: number; duplicateCount: number; overlapCount: number; overlapCandidateIds: string[] } | null>(null);
  const cancelRequested = useRef(false);

  const selectedGroups = useMemo(() => backup?.groups.filter((group) => group.selected !== false) || [], [backup]);
  const selectedCandidates = useMemo(
    () => selectedGroups.reduce((total, group) => total + group.candidates.filter((candidate) => candidate.selected !== false).length, 0),
    [selectedGroups]
  );
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
    const [savedBackup, savedState, saved] = await Promise.all([loadGoogleTimelineBackup(), loadGoogleTimelineUploadState(), listGoogleTimelineBackups()]);
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
      setCheckSummary(null);
      setMergeGroupIds(new Set());
      setAlbumCandidateIds(new Set());
      setViewMode("dates");
      setSearchQuery("");
      setYearFilter("all");
      setMonthFilter("all");
      setSelectionFilter("all");
      setNotice(`Found ${prepared.backup.candidates.length.toLocaleString()} routes across ${prepared.backup.groups.length.toLocaleString()} dates.`);
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
    setCheckSummary(null);
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
    setCheckSummary(null);
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
    setCheckSummary(null);
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
    setCheckSummary(null);
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
    setCheckSummary(null);
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
    setCheckSummary(null);
    setAlbumCandidateIds(new Set());
    await saveGoogleTimelineBackup(next).catch(() => setError("The new album could not be saved locally."));
  }

  async function reopenBackup(importId: string) {
    const saved = await loadGoogleTimelineBackup(importId);
    if (!saved) { setError("That saved import is no longer available on this device."); return; }
    setBackup(saved);
    setUploadState(await loadGoogleTimelineUploadState(importId));
    setCheckSummary(null);
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

  async function startUpload() {
    if (!backup || busy || selectedCandidates < 1) return;
    if (!checkSummary) {
      setBusy(true);
      setError("");
      try {
        const checked = await checkGoogleTimelineImport(backup);
        const rows = Object.values(checked.statusByCandidateId);
        setCheckSummary({
          newCount: rows.filter((status) => status === "new").length,
          duplicateCount: rows.filter((status) => status === "duplicate").length,
          overlapCount: rows.filter((status) => status === "overlap").length,
          overlapCandidateIds: Object.entries(checked.statusByCandidateId).filter(([, status]) => status === "overlap").map(([candidateId]) => candidateId)
        });
        setNotice("Review the duplicate and overlap counts, then confirm the import.");
      } catch (value) {
        setError(value instanceof Error ? value.message : "Timeline conflict check failed.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const message = `${checkSummary.newCount} new routes are ready. ${checkSummary.duplicateCount} exact matches will be skipped.${checkSummary.overlapCount ? ` ${checkSummary.overlapCount} probable overlaps need your choice.` : ""}`;
    const actions: any[] = [{ text: "Cancel", style: "cancel" }];
    if (checkSummary.overlapCount) {
      actions.push({ text: "Skip overlaps", onPress: () => void performUpload(false) });
      actions.push({ text: "Include overlaps", onPress: () => void performUpload(true) });
    } else {
      actions.push({ text: "Import", onPress: () => void performUpload(false) });
    }
    Alert.alert("Confirm Timeline import", message, actions);
  }

  async function performUpload(includeOverlaps: boolean) {
    if (!backup || busy || selectedCandidates < 1) return;
    cancelRequested.current = false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const finalState = await uploadGoogleTimelineImport(backup, {
        onProgress: handleProgress,
        confirmedOverlapCandidateIds: includeOverlaps ? checkSummary?.overlapCandidateIds : [],
        shouldCancel: () => cancelRequested.current
      });
      setUploadState(finalState);
      setSavedBackups(await listGoogleTimelineBackups());
      setNotice(`Imported ${finalState.uploadedCandidateIds.length.toLocaleString()} routes. Existing routes were skipped safely.`);
      setCheckSummary(null);
    } catch (value) {
      const message = value instanceof Error ? value.message : "Timeline upload stopped.";
      setError(message);
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
        data={viewMode === "dates" ? backup?.groups || [] : filteredCandidates}
        keyExtractor={(item: any) => item.id}
        renderItem={(viewMode === "dates" ? renderGroup : renderCandidate) as any}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>PRIVATE IMPORT</Text>
            <Text style={[styles.title, { color: colors.text }]}>Google Timeline</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Choose a Timeline JSON export. RidePulse keeps the original file on this device and sends only the selected route records.</Text>
            <PrimaryButton label={busy && !backup ? "Reading export..." : "Choose Timeline JSON"} icon="document-text" loading={busy && !backup} onPress={pickTimeline} block />
            {savedBackups.length ? <View style={styles.savedArea}><Text style={[styles.sectionLabel, { color: colors.muted }]}>Saved local imports</Text>{savedBackups.map((saved) => <View key={saved.importId} style={[styles.savedRow, { backgroundColor: colors.surfaceHigh }]}><Pressable onPress={() => reopenBackup(saved.importId)} style={styles.savedOpen}><Ionicons name="archive-outline" color={colors.accent} size={18} /><View style={styles.groupCopy}><Text numberOfLines={1} style={[styles.groupTitle, { color: colors.text }]}>{saved.coverageStart && saved.coverageEnd ? `${saved.coverageStart} to ${saved.coverageEnd}` : saved.createdAt.slice(0, 10)} · {saved.candidateCount.toLocaleString()} routes</Text><Text numberOfLines={1} style={[styles.groupMeta, { color: colors.muted }]}>{formatBackupSize(saved.fileSizeBytes)} · {saved.groupCount} dates · {backupStatusLabel(saved)}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete saved Timeline import" onPress={() => deleteBackup(saved)} style={styles.iconButton}><Ionicons name="trash-outline" color={colors.danger} size={18} /></Pressable></View>)}</View> : null}
            {backup ? (
              <View style={[styles.summary, { backgroundColor: colors.surface }]}>
                <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: colors.muted }]}>Selected dates</Text><Text style={[styles.summaryValue, { color: colors.text }]}>{selectedGroups.length}</Text></View>
                <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: colors.muted }]}>Selected routes</Text><Text style={[styles.summaryValue, { color: colors.text }]}>{selectedCandidates.toLocaleString()}</Text></View>
                <Text style={[styles.summaryHint, { color: colors.muted }]}>Routes are selected by default. Albums start enabled only for dates with at least two routes.</Text>
              </View>
            ) : null}
            {backup ? <View style={styles.reviewToolbar}><View style={styles.modeSwitch}>{(["dates", "routes"] as const).map((mode) => <Pressable key={mode} onPress={() => setViewMode(mode)} style={[styles.modeButton, { backgroundColor: viewMode === mode ? colors.accent : colors.surfaceHigh }]}><Text style={[styles.modeText, { color: viewMode === mode ? colors.onAccent : colors.muted }]}>{mode === "dates" ? "Dates" : "Routes"}</Text></Pressable>)}</View>{viewMode === "routes" ? <View style={styles.bulkRow}><Pressable onPress={() => selectFiltered(true)} style={[styles.bulkButton, { borderColor: colors.border }]}><Text style={[styles.bulkText, { color: colors.text }]}>Select visible</Text></Pressable><Pressable onPress={() => selectFiltered(false)} style={[styles.bulkButton, { borderColor: colors.border }]}><Text style={[styles.bulkText, { color: colors.text }]}>Clear visible</Text></Pressable><Pressable disabled={albumCandidateIds.size < 2} onPress={createAlbumFromSelected} style={[styles.bulkButton, { borderColor: colors.border, opacity: albumCandidateIds.size < 2 ? 0.45 : 1 }]}><Ionicons name="albums-outline" color={colors.accent} size={16} /><Text style={[styles.bulkText, { color: colors.text }]}>Create album ({albumCandidateIds.size})</Text></Pressable></View> : <Pressable disabled={mergeGroupIds.size < 2} onPress={mergeSelectedGroups} style={[styles.bulkButton, { borderColor: colors.border, opacity: mergeGroupIds.size < 2 ? 0.45 : 1 }]}><Ionicons name="git-merge-outline" color={colors.accent} size={16} /><Text style={[styles.bulkText, { color: colors.text }]}>Merge chosen ({mergeGroupIds.size})</Text></Pressable>}</View> : null}
            {backup && viewMode === "routes" ? <>
              <View style={[styles.searchField, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="search" color={colors.muted} size={18} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search date, place, or activity" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} autoCapitalize="none" autoCorrect={false} /><Pressable accessibilityRole="button" accessibilityLabel="Clear Timeline search" disabled={!searchQuery} onPress={() => setSearchQuery("")} style={styles.searchClear}><Ionicons name="close-circle" color={searchQuery ? colors.muted : "transparent"} size={18} /></Pressable></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{activityTypes.map((type) => <Pressable key={type} onPress={() => setActivityFilter(type)} style={[styles.chip, { borderColor: activityFilter === type ? colors.accent : colors.border, backgroundColor: activityFilter === type ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: activityFilter === type ? colors.accent : colors.muted }]}>{type === "all" ? "All activity" : type.replaceAll("_", " ")}</Text></Pressable>)}</ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{years.map((year) => <Pressable key={year} onPress={() => setYearFilter(year)} style={[styles.chip, { borderColor: yearFilter === year ? colors.accent : colors.border, backgroundColor: yearFilter === year ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: yearFilter === year ? colors.accent : colors.muted }]}>{year === "all" ? "All years" : year}</Text></Pressable>)}</ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{months.map((month) => <Pressable key={month} onPress={() => setMonthFilter(month)} style={[styles.chip, { borderColor: monthFilter === month ? colors.accent : colors.border, backgroundColor: monthFilter === month ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: monthFilter === month ? colors.accent : colors.muted }]}>{month === "all" ? "All months" : monthLabel(month)}</Text></Pressable>)}</ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "selected", "unselected"] as const).map((filter) => <Pressable key={filter} onPress={() => setSelectionFilter(filter)} style={[styles.chip, { borderColor: selectionFilter === filter ? colors.accent : colors.border, backgroundColor: selectionFilter === filter ? `${colors.accent}20` : colors.surface }]}><Text style={[styles.chipText, { color: selectionFilter === filter ? colors.accent : colors.muted }]}>{filter === "all" ? "All routes" : filter === "selected" ? "Selected" : "Unselected"}</Text></Pressable>)}</ScrollView>
            </> : null}
            {progress ? (
              <View style={[styles.progress, { backgroundColor: colors.surface }]}>
                <View style={styles.progressHeader}><Text style={[styles.progressTitle, { color: colors.text }]}>{progress.phase === "complete" ? "Import complete" : progress.phase === "failed" ? "Import paused" : "Importing routes"}</Text><Text style={[styles.progressValue, { color: colors.accent }]}>{progress.processedCandidates}/{progress.totalCandidates}</Text></View>
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHigh }]}><View style={[styles.progressFill, { backgroundColor: progress.phase === "failed" ? colors.danger : colors.accent, width: `${progress.totalCandidates ? Math.min(100, progress.processedCandidates / progress.totalCandidates * 100) : 0}%` }]} /></View>
              </View>
            ) : null}
            {error ? <View style={[styles.notice, { backgroundColor: `${colors.danger}16` }]}><Ionicons name="alert-circle" color={colors.danger} size={20} /><Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text></View> : null}
            {notice ? <View style={[styles.notice, { backgroundColor: `${colors.success}16` }]}><Ionicons name="checkmark-circle" color={colors.success} size={20} /><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text></View> : null}
            {backup ? <Text style={[styles.sectionLabel, { color: colors.muted }]}>{viewMode === "dates" ? "Choose dates and albums" : `${filteredCandidates.length.toLocaleString()} visible routes`}</Text> : null}
          </View>
        )}
        ListEmptyComponent={!backup && !busy ? <View style={[styles.empty, { backgroundColor: colors.surface }]}><Ionicons name="time-outline" color={colors.accent} size={28} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No Timeline export selected</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Your Google export stays local until you choose which route dates to add.</Text></View> : null}
        ListFooterComponent={backup ? <View style={styles.footer}><PrimaryButton label={busy ? "Importing..." : checkSummary ? `Confirm import ${selectedCandidates.toLocaleString()} routes` : `Check ${selectedCandidates.toLocaleString()} routes`} icon="cloud-upload" loading={busy} disabled={!selectedCandidates} onPress={startUpload} block />{busy && progress ? <Pressable accessibilityRole="button" onPress={pauseImport} style={[styles.pauseButton, { borderColor: colors.border }]}><Ionicons name="pause" color={colors.accent} size={18} /><Text style={[styles.linkText, { color: colors.text }]}>Pause import</Text></Pressable> : null}<Pressable accessibilityRole="button" onPress={() => navigation.navigate("Trips")} style={styles.linkButton}><Text style={[styles.linkText, { color: colors.accent }]}>View trip albums</Text><Ionicons name="arrow-forward" color={colors.accent} size={17} /></Pressable></View> : null}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
      />
      {busy && !backup ? <View style={styles.busyOverlay}><ActivityIndicator color={colors.accent} /></View> : null}
      <Modal visible={Boolean(previewCandidate)} animationType="slide" onRequestClose={() => setPreviewCandidate(null)}>
        <Screen><View style={styles.previewSheet}><View style={styles.sheetHeader}><Text style={[styles.previewTitle, { color: colors.text }]}>Route preview</Text><Pressable accessibilityRole="button" accessibilityLabel="Close route preview" onPress={() => setPreviewCandidate(null)} style={[styles.iconButton, { backgroundColor: colors.surfaceHigh }]}><Ionicons name="close" color={colors.text} size={21} /></Pressable></View>{previewCandidate ? <RoutePreview candidate={previewCandidate} /> : null}</View></Screen>
      </Modal>
      <Modal visible={Boolean(editingGroup)} transparent animationType="slide" onRequestClose={() => setEditingGroup(null)}><View style={styles.modalBackdrop}><Pressable style={styles.modalDismiss} onPress={() => setEditingGroup(null)} /><View style={[styles.editSheet, { backgroundColor: colors.surface }]}><Text style={[styles.previewTitle, { color: colors.text }]}>Edit album</Text><TextInput value={groupTitleDraft} onChangeText={setGroupTitleDraft} placeholder="Album name" placeholderTextColor={colors.muted} style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} /><Pressable accessibilityRole="switch" accessibilityState={{ checked: albumEnabledDraft }} onPress={() => setAlbumEnabledDraft((enabled) => !enabled)} style={[styles.albumToggle, { borderColor: albumEnabledDraft ? colors.accent : colors.border, backgroundColor: albumEnabledDraft ? `${colors.accent}18` : colors.surfaceHigh }]}><Ionicons name={albumEnabledDraft ? "albums" : "remove-circle-outline"} color={albumEnabledDraft ? colors.accent : colors.muted} size={19} /><Text style={[styles.bulkText, { color: colors.text }]}>{albumEnabledDraft ? "Create album for this date" : "Keep routes standalone"}</Text></Pressable><PrimaryButton label="Save album" icon="save" onPress={saveGroupEdit} block /></View></View></Modal>
    </Screen>
  );
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
  content: { padding: 20, paddingBottom: 130, gap: 10 },
  headerContent: { gap: 13, marginBottom: 6 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 },
  title: { fontFamily: typography.extraBold, fontSize: 34, lineHeight: 40 },
  subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21 },
  summary: { borderRadius: 20, padding: 15, gap: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontFamily: typography.medium, fontSize: 12 },
  summaryValue: { fontFamily: typography.extraBold, fontSize: 17 },
  summaryHint: { fontFamily: typography.regular, fontSize: 11, lineHeight: 17, marginTop: 2 },
  savedArea: { gap: 7 },
  savedRow: { minHeight: 54, borderRadius: 14, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  savedOpen: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  sectionLabel: { fontFamily: typography.bold, fontSize: 11, letterSpacing: 0.8, marginTop: 4 },
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
  notice: { minHeight: 56, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { flex: 1, fontFamily: typography.medium, fontSize: 12, lineHeight: 18 },
  empty: { borderRadius: 20, padding: 18, gap: 7, alignItems: "flex-start" },
  emptyTitle: { fontFamily: typography.bold, fontSize: 16 },
  emptyText: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19 },
  footer: { gap: 13, marginTop: 8 },
  linkButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  pauseButton: { minHeight: 44, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  linkText: { fontFamily: typography.bold, fontSize: 13 },
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
