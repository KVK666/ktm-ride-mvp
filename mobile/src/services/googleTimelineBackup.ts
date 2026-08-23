import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { GoogleTimelineBackup } from "../types";

export const GOOGLE_TIMELINE_BACKUP_META_KEY = "ridepulse_google_timeline_backup_meta_v1";
export const GOOGLE_TIMELINE_BACKUP_INDEX_KEY = "ridepulse_google_timeline_backup_index_v1";
const GOOGLE_TIMELINE_BACKUP_DIRECTORY = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}google-timeline/` : null;

export type GoogleTimelineBackupMetadata = {
  importId: string;
  sourceHash: string;
  createdAt: string;
  uri?: string;
  rawJsonUri?: string;
  candidateCount: number;
  groupCount: number;
  fileSizeBytes: number;
  coverageStart?: string;
  coverageEnd?: string;
  lastImportPhase?: "ready" | "checking" | "uploading" | "complete" | "failed";
  lastImportedCount?: number;
};

/** Keep only metadata in the index; route data and the original export stay app-private. */
export async function saveGoogleTimelineBackup(backup: GoogleTimelineBackup, rawJson?: string) {
  const previous = await metadataFor(backup.importId);
  const coverageDates = backup.candidates.map((candidate) => candidate.localDate).filter(Boolean).sort();
  const metadata: GoogleTimelineBackupMetadata = {
    importId: backup.importId,
    sourceHash: backup.sourceHash,
    createdAt: backup.createdAt,
    rawJsonUri: backup.rawJsonUri || undefined,
    candidateCount: backup.candidates.length,
    groupCount: backup.groups.length,
    fileSizeBytes: backup.sourceFileSizeBytes || previous?.fileSizeBytes || 0,
    coverageStart: coverageDates[0],
    coverageEnd: coverageDates[coverageDates.length - 1],
    lastImportPhase: previous?.lastImportPhase || "ready",
    lastImportedCount: previous?.lastImportedCount || 0
  };

  if (GOOGLE_TIMELINE_BACKUP_DIRECTORY) {
    await FileSystem.makeDirectoryAsync(GOOGLE_TIMELINE_BACKUP_DIRECTORY, { intermediates: true });
    metadata.uri = `${GOOGLE_TIMELINE_BACKUP_DIRECTORY}${safeFileName(backup.importId)}.json`;
    await FileSystem.writeAsStringAsync(metadata.uri, JSON.stringify(backup), { encoding: FileSystem.EncodingType.UTF8 });
    if (typeof rawJson === "string") {
      metadata.rawJsonUri = `${GOOGLE_TIMELINE_BACKUP_DIRECTORY}${safeFileName(backup.importId)}.raw.json`;
      await FileSystem.writeAsStringAsync(metadata.rawJsonUri, rawJson, { encoding: FileSystem.EncodingType.UTF8 });
    }
    await Promise.all([AsyncStorage.removeItem(inlineKey(backup.importId)), AsyncStorage.removeItem(rawInlineKey(backup.importId))]);
  } else {
    await AsyncStorage.setItem(inlineKey(backup.importId), JSON.stringify(backup));
    if (typeof rawJson === "string") await AsyncStorage.setItem(rawInlineKey(backup.importId), rawJson);
  }

  const index = await listGoogleTimelineBackups();
  const next = [metadata, ...index.filter((item) => item.importId !== metadata.importId)].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  await AsyncStorage.setItem(GOOGLE_TIMELINE_BACKUP_INDEX_KEY, JSON.stringify(next));
  // Keep the old single-record key as a migration/current pointer for older builds.
  await AsyncStorage.setItem(GOOGLE_TIMELINE_BACKUP_META_KEY, JSON.stringify(metadata));
  return metadata;
}

export async function listGoogleTimelineBackups(): Promise<GoogleTimelineBackupMetadata[]> {
  try {
    const value = await AsyncStorage.getItem(GOOGLE_TIMELINE_BACKUP_INDEX_KEY);
    if (value) {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(parseMetadata).filter((item): item is GoogleTimelineBackupMetadata => item != null);
    }
    const legacy = await AsyncStorage.getItem(GOOGLE_TIMELINE_BACKUP_META_KEY);
    const metadata = legacy ? parseMetadata(legacy) : null;
    return metadata ? [metadata] : [];
  } catch {
    return [];
  }
}

export async function loadGoogleTimelineBackup(importId?: string): Promise<GoogleTimelineBackup | null> {
  const metadata = await metadataFor(importId);
  if (!metadata) return null;
  if (metadata.uri) {
    try {
      const info = await FileSystem.getInfoAsync(metadata.uri);
      if (info.exists) {
        const value = await FileSystem.readAsStringAsync(metadata.uri, { encoding: FileSystem.EncodingType.UTF8 });
        const backup = parseBackup(value);
        if (backup) backup.rawJsonUri = metadata.rawJsonUri || null;
        return backup;
      }
    } catch {
      // Fall through to the AsyncStorage preview fallback.
    }
  }
  try {
    const value = await AsyncStorage.getItem(inlineKey(metadata.importId));
    const backup = value ? parseBackup(value) : null;
    if (backup) backup.rawJsonUri = metadata.rawJsonUri || null;
    return backup;
  } catch {
    return null;
  }
}

export async function loadGoogleTimelineRawJson(importId?: string): Promise<string | null> {
  const metadata = await metadataFor(importId);
  if (!metadata) return null;
  if (metadata.rawJsonUri) {
    try {
      const info = await FileSystem.getInfoAsync(metadata.rawJsonUri);
      if (info.exists) return await FileSystem.readAsStringAsync(metadata.rawJsonUri, { encoding: FileSystem.EncodingType.UTF8 });
    } catch {
      // Fall through to the inline fallback used on environments without a document directory.
    }
  }
  try {
    return await AsyncStorage.getItem(rawInlineKey(metadata.importId));
  } catch {
    return null;
  }
}

export async function clearGoogleTimelineBackup(importId?: string) {
  const metadata = await metadataFor(importId);
  if (!metadata) return false;
  if (metadata.uri) await FileSystem.deleteAsync(metadata.uri, { idempotent: true }).catch(() => {});
  if (metadata.rawJsonUri) await FileSystem.deleteAsync(metadata.rawJsonUri, { idempotent: true }).catch(() => {});
  await Promise.all([AsyncStorage.removeItem(inlineKey(metadata.importId)), AsyncStorage.removeItem(rawInlineKey(metadata.importId))]);
  const next = (await listGoogleTimelineBackups()).filter((item) => item.importId !== metadata.importId);
  await AsyncStorage.setItem(GOOGLE_TIMELINE_BACKUP_INDEX_KEY, JSON.stringify(next));
  const current = await AsyncStorage.getItem(GOOGLE_TIMELINE_BACKUP_META_KEY);
  if (current && parseMetadata(current)?.importId === metadata.importId) {
    if (next[0]) await AsyncStorage.setItem(GOOGLE_TIMELINE_BACKUP_META_KEY, JSON.stringify(next[0]));
    else await AsyncStorage.removeItem(GOOGLE_TIMELINE_BACKUP_META_KEY);
  }
  return true;
}

export async function getGoogleTimelineBackupMetadata(importId?: string) {
  return metadataFor(importId);
}

export async function updateGoogleTimelineBackupResult(importId: string, phase: "ready" | "checking" | "uploading" | "complete" | "failed", importedCount: number) {
  const index = await listGoogleTimelineBackups();
  const current = index.find((item) => item.importId === importId);
  if (!current) return;
  const updated = { ...current, lastImportPhase: phase, lastImportedCount: Math.max(0, importedCount) };
  const next = index.map((item) => item.importId === importId ? updated : item);
  await AsyncStorage.setItem(GOOGLE_TIMELINE_BACKUP_INDEX_KEY, JSON.stringify(next));
  const active = await AsyncStorage.getItem(GOOGLE_TIMELINE_BACKUP_META_KEY);
  if (active && parseMetadata(active)?.importId === importId) {
    await AsyncStorage.setItem(GOOGLE_TIMELINE_BACKUP_META_KEY, JSON.stringify(updated));
  }
}

async function metadataFor(importId?: string) {
  const list = await listGoogleTimelineBackups();
  return importId ? list.find((item) => item.importId === importId) || null : list[0] || null;
}

function parseMetadata(value: unknown): GoogleTimelineBackupMetadata | null {
  if (typeof value === "string") {
    try { return parseMetadata(JSON.parse(value)); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const parsed = value as any;
  if (typeof parsed.importId !== "string" || typeof parsed.sourceHash !== "string") return null;
  return {
    importId: parsed.importId,
    sourceHash: parsed.sourceHash,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    uri: typeof parsed.uri === "string" ? parsed.uri : undefined,
    rawJsonUri: typeof parsed.rawJsonUri === "string" ? parsed.rawJsonUri : undefined,
    candidateCount: Number.isFinite(Number(parsed.candidateCount)) ? Number(parsed.candidateCount) : 0,
    groupCount: Number.isFinite(Number(parsed.groupCount)) ? Number(parsed.groupCount) : 0,
    fileSizeBytes: Number.isFinite(Number(parsed.fileSizeBytes)) ? Number(parsed.fileSizeBytes) : 0,
    coverageStart: typeof parsed.coverageStart === "string" ? parsed.coverageStart : undefined,
    coverageEnd: typeof parsed.coverageEnd === "string" ? parsed.coverageEnd : undefined,
    lastImportPhase: ["ready", "checking", "uploading", "complete", "failed"].includes(parsed.lastImportPhase) ? parsed.lastImportPhase : undefined,
    lastImportedCount: Number.isFinite(Number(parsed.lastImportedCount)) ? Number(parsed.lastImportedCount) : 0
  };
}

function parseBackup(value: string): GoogleTimelineBackup | null {
  try {
    const parsed = JSON.parse(value);
    if (![1, 2].includes(parsed?.version) || typeof parsed.importId !== "string" || typeof parsed.sourceHash !== "string" || !Array.isArray(parsed.candidates) || !Array.isArray(parsed.groups)) return null;
    return parsed as GoogleTimelineBackup;
  } catch {
    return null;
  }
}

function inlineKey(importId: string) {
  return `ridepulse_google_timeline_backup_inline_v1:${safeFileName(importId)}`;
}

function rawInlineKey(importId: string) {
  return `ridepulse_google_timeline_backup_raw_inline_v1:${safeFileName(importId)}`;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "latest";
}
