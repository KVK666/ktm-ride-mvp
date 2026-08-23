import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { api } from "../api/client";
import { GoogleTimelineBackup, GoogleTimelineCandidate, GoogleTimelineGroup, GoogleTimelineUploadState } from "../types";
import { groupTimelineCandidates, parseGoogleTimeline, GoogleTimelineParseOptions } from "./googleTimelineParser";
import { saveGoogleTimelineBackup, updateGoogleTimelineBackupResult } from "./googleTimelineBackup";

export const GOOGLE_TIMELINE_IMPORT_STATE_KEY = "ridepulse_google_timeline_import_state_v1";
export const GOOGLE_TIMELINE_IMPORT_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export const GOOGLE_TIMELINE_IMPORT_BATCH_SIZE = 50;

export type GoogleTimelineImportProgress = {
  phase: GoogleTimelineUploadState["phase"];
  totalCandidates: number;
  processedCandidates: number;
  uploadedCandidates: number;
  skippedCandidates: number;
  totalGroups: number;
  processedGroups: number;
  error?: string;
};

export type GoogleTimelineUploadOptions = {
  batchSize?: number;
  onProgress?: (progress: GoogleTimelineImportProgress) => void;
  confirmedOverlapCandidateIds?: readonly string[];
  shouldCancel?: () => boolean;
};

export type PreparedGoogleTimelineImport = {
  backup: GoogleTimelineBackup;
  state: GoogleTimelineUploadState;
};

type ImportStatus = "new" | "duplicate" | "overlap";

export async function prepareGoogleTimelineImport(jsonText: string, options: GoogleTimelineParseOptions = {}): Promise<PreparedGoogleTimelineImport> {
  if (typeof jsonText !== "string" || !jsonText.trim()) throw new Error("The selected file is empty.");
  const sourceFileSizeBytes = utf8ByteLength(jsonText);
  if (sourceFileSizeBytes > GOOGLE_TIMELINE_IMPORT_MAX_SOURCE_BYTES) throw new Error("This Timeline export is larger than the 64 MiB device limit.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("That file is not valid JSON. Choose a Google Timeline JSON export.");
  }
  const normalized = parseGoogleTimeline(parsed, options);
  if (!normalized.candidates.length) throw new Error("No driving or motorcycle routes were found in this Timeline export.");

  const sourceHash = await hashGoogleTimelineSource(jsonText);
  const candidates = await assignStableCandidateIds(normalized.candidates);
  const groups = await assignStableGroupIds(groupTimelineCandidates(candidates));
  const backup: GoogleTimelineBackup = {
    version: 1,
    importId: `gti-${sourceHash.slice(0, 32)}`,
    sourceHash,
    createdAt: new Date().toISOString(),
    sourceFileSizeBytes,
    rawJsonUri: null,
    candidates,
    groups
  };
  const metadata = await saveGoogleTimelineBackup(backup, jsonText);
  backup.rawJsonUri = metadata.rawJsonUri || null;
  const state = createInitialGoogleTimelineUploadState(backup);
  await saveGoogleTimelineUploadState(state);
  return { backup, state };
}

export function createInitialGoogleTimelineUploadState(backup: GoogleTimelineBackup): GoogleTimelineUploadState {
  return {
    importId: backup.importId,
    sourceHash: backup.sourceHash,
    phase: "ready",
    checked: false,
    uploadedCandidateIds: [],
    skippedCandidateIds: [],
    rideIdsByCandidateId: {},
    tripIdsByGroupId: {},
    failedCandidateId: null,
    error: null,
    updatedAt: new Date().toISOString()
  };
}

export async function hashGoogleTimelineSource(value: string) {
  return sha256Text(value);
}

/** Content-derived external id, independent of import file hash and export date. */
export async function stableGoogleTimelineCandidateId(candidate: GoogleTimelineCandidate) {
  return `gt-${await sha256Text(`google-timeline:candidate:v1:${canonicalCandidate(candidate)}`)}`;
}

export async function loadGoogleTimelineUploadState(importId?: string) {
  try {
    const activeImportId = importId || await AsyncStorage.getItem(GOOGLE_TIMELINE_ACTIVE_IMPORT_KEY);
    const value = await AsyncStorage.getItem(stateKey(activeImportId || ""));
    if (!value) return null;
    const parsed = JSON.parse(value);
    return isUploadState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveGoogleTimelineUploadState(state: GoogleTimelineUploadState) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(stateKey(next.importId), JSON.stringify(next));
  await AsyncStorage.setItem(GOOGLE_TIMELINE_ACTIVE_IMPORT_KEY, next.importId);
  return next;
}

export async function clearGoogleTimelineUploadState(importId?: string) {
  const active = await AsyncStorage.getItem(GOOGLE_TIMELINE_ACTIVE_IMPORT_KEY);
  const target = importId || active;
  if (target) await AsyncStorage.removeItem(stateKey(target));
  if (!importId || target === active) await AsyncStorage.removeItem(GOOGLE_TIMELINE_ACTIVE_IMPORT_KEY);
}

/** Resume from per-batch checkpoints; retries are idempotent by external id. */
export async function uploadGoogleTimelineImport(backup: GoogleTimelineBackup, options: GoogleTimelineUploadOptions = {}) {
  const storedState = await loadGoogleTimelineUploadState(backup.importId);
  let state: GoogleTimelineUploadState = storedState && storedState.sourceHash === backup.sourceHash
    ? storedState
    : createInitialGoogleTimelineUploadState(backup);
  const batchSize = Math.max(1, Math.min(GOOGLE_TIMELINE_IMPORT_BATCH_SIZE, Math.floor(options.batchSize || GOOGLE_TIMELINE_IMPORT_BATCH_SIZE)));
  const activeCandidates = selectedCandidates(backup);
  const activeGroups = albumGroups(backup);
  const confirmedOverlapIds = new Set(options.confirmedOverlapCandidateIds || []);
  if (confirmedOverlapIds.size) {
    state.skippedCandidateIds = state.skippedCandidateIds.filter((candidateId) => !confirmedOverlapIds.has(candidateId));
  }
  if (!activeCandidates.length) throw new Error("Select at least one Timeline route to import.");

  const assertNotCancelled = () => {
    if (options.shouldCancel?.()) throw new Error("Import paused by rider.");
  };

  const notify = (phase: GoogleTimelineImportProgress["phase"], error?: string) => {
    options.onProgress?.({
      phase,
      totalCandidates: activeCandidates.length,
      processedCandidates: state.uploadedCandidateIds.length + state.skippedCandidateIds.length,
      uploadedCandidates: state.uploadedCandidateIds.length,
      skippedCandidates: state.skippedCandidateIds.length,
      totalGroups: activeGroups.length,
      processedGroups: Object.keys(state.tripIdsByGroupId).length,
      error
    });
  };

  try {
    const hasUncheckedActiveCandidate = activeCandidates.some((candidate) =>
      !state.uploadedCandidateIds.includes(candidate.id) && !state.skippedCandidateIds.includes(candidate.id)
    );
    if (!state.checked || hasUncheckedActiveCandidate) {
      assertNotCancelled();
      state = await saveGoogleTimelineUploadState({ ...state, phase: "checking", error: null, failedCandidateId: null });
      notify("checking");
      const checked = await checkGoogleTimelineImport(backup, activeCandidates, batchSize);
      for (const candidate of activeCandidates) {
        const status = checked.statusByCandidateId[candidate.id];
        if (status === "duplicate" || (status === "overlap" && !confirmedOverlapIds.has(candidate.id))) {
          if (!state.skippedCandidateIds.includes(candidate.id)) state.skippedCandidateIds.push(candidate.id);
          if (status === "duplicate") {
            const rideId = checked.rideIdsByCandidateId[candidate.id];
            if (rideId) state.rideIdsByCandidateId[candidate.id] = rideId;
          } else {
            delete state.rideIdsByCandidateId[candidate.id];
          }
        }
      }
      state = await saveGoogleTimelineUploadState({ ...state, checked: true, phase: "uploading", error: null });
    } else {
      state = await saveGoogleTimelineUploadState({ ...state, phase: "uploading", error: null, failedCandidateId: null });
    }
    notify("uploading");

    const pending = activeCandidates.filter((candidate) => !state.uploadedCandidateIds.includes(candidate.id) && !state.skippedCandidateIds.includes(candidate.id));
    for (const batch of batches(pending, batchSize)) {
      assertNotCancelled();
      state = await saveGoogleTimelineUploadState({ ...state, phase: "uploading", failedCandidateId: batch[0]?.id || null, error: null });
      const allowedInBatch = batch.filter((candidate) => confirmedOverlapIds.has(candidate.id)).map((candidate) => candidate.id);
      const response = await api<any>("/imports/google-timeline/rides", {
        method: "POST",
        body: JSON.stringify({
          rides: batch.map((candidate) => toRidePayload(backup, candidate)),
          allowOverlapClientRideIds: allowedInBatch
        })
      });
      const rows = responseRows(response, "rides");
      for (const candidate of batch) {
        const row = rows.find((value) => value.clientRideId === candidate.id);
        if (!row) throw new Error("The server returned an incomplete Timeline ride batch.");
        const status = normalizeImportStatus(row.status);
        if (!status) throw new Error("The server returned an unknown Timeline ride status.");
        if (status === "duplicate" || status === "overlap") {
          if (!state.skippedCandidateIds.includes(candidate.id)) state.skippedCandidateIds.push(candidate.id);
        } else if (status === "new") {
          if (!state.uploadedCandidateIds.includes(candidate.id)) state.uploadedCandidateIds.push(candidate.id);
        } else {
          throw new Error("The server returned an unknown Timeline ride status.");
        }
        state.rideIdsByCandidateId[candidate.id] = text(row.rideId, row.id);
      }
      state.failedCandidateId = null;
      state = await saveGoogleTimelineUploadState(state);
      notify("uploading");
    }

    const pendingGroups = activeGroups.filter((group) => !state.tripIdsByGroupId[group.id]);
    for (const batch of batches(pendingGroups, batchSize)) {
      assertNotCancelled();
      const trips = batch.map((group) => ({
        clientTripId: group.id,
        title: group.title,
        description: "Imported from Google Timeline",
        rideClientIds: group.candidates
          .filter((candidate) => candidate.selected !== false && Boolean(state.rideIdsByCandidateId[candidate.id]))
          .map((candidate) => candidate.id)
      })).filter((trip) => trip.rideClientIds.length >= 2);
      if (!trips.length) continue;
      const response = await api<any>("/imports/google-timeline/trips", {
        method: "POST",
        body: JSON.stringify({ trips })
      });
      const rows = responseRows(response, "trips");
      for (const trip of trips) {
        const row = rows.find((value) => value.clientTripId === trip.clientTripId);
        if (!row) throw new Error("The server returned an incomplete Timeline trip batch.");
        const tripId = text(row.tripId, row.id);
        if (tripId) state.tripIdsByGroupId[trip.clientTripId] = tripId;
      }
      state = await saveGoogleTimelineUploadState({ ...state, phase: "uploading" });
      notify("uploading");
    }

    state = await saveGoogleTimelineUploadState({ ...state, phase: "complete", failedCandidateId: null, error: null });
    await updateGoogleTimelineBackupResult(backup.importId, "complete", state.uploadedCandidateIds.length);
    notify("complete");
    return state;
  } catch (error) {
    const message = readableError(error);
    state = await saveGoogleTimelineUploadState({ ...state, phase: "failed", error: message });
    await updateGoogleTimelineBackupResult(backup.importId, "failed", state.uploadedCandidateIds.length).catch(() => {});
    notify("failed", message);
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function checkGoogleTimelineImport(backup: GoogleTimelineBackup, candidates = selectedCandidates(backup), batchSize = GOOGLE_TIMELINE_IMPORT_BATCH_SIZE) {
  const statusByCandidateId: Record<string, ImportStatus> = {};
  const rideIdsByCandidateId: Record<string, string> = {};
  const safeBatchSize = Math.max(1, Math.min(GOOGLE_TIMELINE_IMPORT_BATCH_SIZE, Math.floor(batchSize || GOOGLE_TIMELINE_IMPORT_BATCH_SIZE)));
  for (const batch of batches(candidates, safeBatchSize)) {
    const response = await api<any>("/imports/google-timeline/check", {
      method: "POST",
      body: JSON.stringify({
        importId: backup.importId,
        sourceHash: backup.sourceHash,
        rides: batch.map((candidate) => toRidePayload(backup, candidate))
      })
    });
    for (const row of responseRows(response, "rides")) {
      if (typeof row.clientRideId !== "string") continue;
      const status = normalizeImportStatus(row.status);
      if (!status) throw new Error("The server returned an unknown Timeline check status.");
      statusByCandidateId[row.clientRideId] = status;
      const rideId = text(row.rideId, row.id);
      if (rideId) rideIdsByCandidateId[row.clientRideId] = rideId;
    }
  }
  for (const candidate of candidates) if (!statusByCandidateId[candidate.id]) statusByCandidateId[candidate.id] = "new";
  return { statusByCandidateId, rideIdsByCandidateId };
}

function toRidePayload(backup: GoogleTimelineBackup, candidate: GoogleTimelineCandidate) {
  return {
    externalId: candidate.id,
    clientRideId: candidate.id,
    startLabel: candidate.startLabel,
    endLabel: candidate.endLabel,
    startedAt: candidate.startedAt,
    endedAt: candidate.endedAt,
    distanceM: candidate.distanceM,
    durationS: candidate.durationS,
    sourceActivityType: candidate.activityType,
    speedDataQuality: candidate.points.some((point) => point.speedKmh != null) ? "measured" : "derived",
    points: candidate.points,
    importId: backup.importId
  };
}

function selectedCandidates(backup: GoogleTimelineBackup) {
  const selected = new Set<string>();
  for (const group of backup.groups) {
    if (group.selected === false) continue;
    for (const candidate of group.candidates) if (candidate.selected !== false) selected.add(candidate.id);
  }
  return backup.candidates.filter((candidate) => selected.has(candidate.id));
}

function albumGroups(backup: GoogleTimelineBackup) {
  return backup.groups.filter((group) => group.selected !== false && group.albumEnabled !== false && group.candidates.filter((candidate) => candidate.selected !== false).length >= 2);
}

async function assignStableCandidateIds(candidates: GoogleTimelineCandidate[]) {
  const assigned: GoogleTimelineCandidate[] = [];
  for (const batch of batches(candidates, 32)) {
    assigned.push(...await Promise.all(batch.map(async (candidate) => ({
      ...candidate,
      id: await stableGoogleTimelineCandidateId(candidate)
    }))));
  }
  return assigned;
}

async function assignStableGroupIds(groups: GoogleTimelineGroup[]) {
  const assigned: GoogleTimelineGroup[] = [];
  for (const batch of batches(groups, 32)) {
    assigned.push(...await Promise.all(batch.map(async (group) => ({
      ...group,
      id: `gtg-${await sha256Text(`google-timeline:group:v1:${group.candidates[0]?.localDate || group.startedAt.slice(0, 10)}:${group.candidates.map((candidate) => candidate.id).join("|")}`)}`
    }))));
  }
  return assigned;
}

function canonicalCandidate(candidate: GoogleTimelineCandidate) {
  return JSON.stringify({
    activityType: candidate.activityType,
    startedAt: candidate.startedAt,
    endedAt: candidate.endedAt,
    points: candidate.points.map((point) => [point.latitude, point.longitude, point.recordedAt])
  });
}

async function sha256Text(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function responseRows(response: any, key: string): any[] {
  return Array.isArray(response?.[key]) ? response[key] : [];
}

function batches<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function text(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function utf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function normalizeImportStatus(value: unknown): ImportStatus | null {
  switch (String(value || "").toLowerCase()) {
    case "new":
    case "created":
      return "new";
    case "duplicate":
    case "existing":
      return "duplicate";
    case "overlap":
    case "probable_overlap":
    case "conflict":
      return "overlap";
    default:
      return null;
  }
}

function readableError(value: unknown) {
  return value instanceof Error ? value.message : String(value || "Import failed");
}

function isUploadState(value: any): value is GoogleTimelineUploadState {
  return Boolean(value && typeof value.importId === "string" && typeof value.sourceHash === "string" && Array.isArray(value.uploadedCandidateIds) && Array.isArray(value.skippedCandidateIds) && value.rideIdsByCandidateId && value.tripIdsByGroupId);
}

const GOOGLE_TIMELINE_ACTIVE_IMPORT_KEY = "ridepulse_google_timeline_active_import_v1";

function stateKey(importId: string) {
  return `${GOOGLE_TIMELINE_IMPORT_STATE_KEY}:${importId}`;
}
