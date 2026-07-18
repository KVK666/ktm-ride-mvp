import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { API_BASE_URL, api, readToken } from "../api/client";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";
import { importRidePhotos } from "./ridePhotos";
import { JournalResponse, Ride, RideAlbum, RideAlbumPhoto, RideMemory, RidePhoto } from "../types";
import { km, shortDate } from "../utils/format";
import { normalizeBoundedCoordinate } from "../utils/coordinates";
import { finiteNumberOrZero } from "../utils/normalize";
import { rideDisplayTitle } from "../utils/rideTitle";

const ALBUM_KEY_PREFIX = "duke_ride_album:";
const ALBUM_INDEX_KEY = "duke_ride_album_index_v1";
const ALBUM_DIRECTORY = `${FileSystem.documentDirectory || ""}ride-albums/`;
const MAX_SYNC_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_SYNC_PHOTO_DIMENSION = 2048;

export async function getRideAlbum(rideId?: string | null): Promise<RideAlbum | null> {
  if (!rideId) {
    return null;
  }

  try {
    const stored = await AsyncStorage.getItem(albumKey(rideId));
    if (!stored) {
      return emptyAlbum(rideId);
    }
    return normalizeAlbum(JSON.parse(stored), rideId);
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "albums",
      message: "Ride album read failed",
      details: diagnosticDetails(error)
    });
    return emptyAlbum(rideId);
  }
}

export async function hydrateRideAlbum(rideId: string): Promise<RideAlbum> {
  const local = await getRideAlbum(rideId) || emptyAlbum(rideId);
  try {
    const response = await api<{ photos?: any[] }>(`/rides/${rideId}/photos?includeData=false`);
    const remotePhotos = Array.isArray(response.photos) ? response.photos : [];
    await ensureAlbumDirectory(rideId);
    const remoteIds = new Set(remotePhotos.map((photo) => String(photo?.id || "")).filter(Boolean));
    const staleSynced = local.photos.filter((photo) => photo.backendPhotoId && !remoteIds.has(photo.backendPhotoId));
    const retainedLocal = local.photos.filter((photo) => !photo.backendPhotoId || remoteIds.has(photo.backendPhotoId));
    const hydrated = await Promise.all(remotePhotos.map(async (photo) => {
      try {
        return await cacheBackendPhoto(rideId, photo, retainedLocal);
      } catch (error) {
        await logDiagnostic({ level: "warn", area: "albums", message: "Private album photo cache failed", details: diagnosticDetails(error) });
        return null;
      }
    }));
    const photos = dedupePhotos([...retainedLocal, ...(hydrated.filter(Boolean) as RideAlbumPhoto[])]);
    const next = { ...local, coverUri: photos[0]?.uri || null, photos, updatedAt: new Date().toISOString() };
    await persistAlbum(next);
    await Promise.all(staleSynced.map((photo) => deletePrivateAlbumCopy(photo.uri)));
    return next;
  } catch (error) {
    await logDiagnostic({ level: "warn", area: "albums", message: "Private album refresh unavailable", details: diagnosticDetails(error) });
    return local;
  }
}

async function deletePrivateAlbumCopy(uri?: string | null) {
  if (uri?.startsWith(FileSystem.documentDirectory || "")) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

export async function getRideAlbums(rideIds: string[]): Promise<Record<string, RideAlbum>> {
  const uniqueIds = [...new Set(rideIds.filter(Boolean))];
  const albums = await Promise.all(uniqueIds.map((rideId) => getRideAlbum(rideId)));
  return albums.reduce<Record<string, RideAlbum>>((acc, album) => {
    if (album) {
      acc[album.rideId] = album;
    }
    return acc;
  }, {});
}

export async function importRideWindowPhotosToAlbum(ride: Ride): Promise<RideAlbum> {
  const photos = await importRidePhotos(ride);
  return savePhotosToAlbum(ride, photos, "ride-window");
}

export async function pickManualPhotosForAlbum(ride: Ride): Promise<RideAlbum | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Gallery permission is required to add photos");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 1,
    exif: true
  });

  if (result.canceled || !result.assets?.length) {
    return getRideAlbum(ride.id);
  }

  const photos = await Promise.all(result.assets.map((asset, index) => imagePickerAssetToPhoto(asset, index)));
  return savePhotosToAlbum(ride, photos.filter((photo): photo is RidePhoto => Boolean(photo)), "manual");
}

export async function savePhotosToAlbum(
  ride: Ride,
  photos: RidePhoto[],
  source: "ride-window" | "manual"
): Promise<RideAlbum> {
  const existing = await getRideAlbum(ride.id);
  const existingPhotos = existing?.photos || [];
  const copied = await Promise.all(
    photos.map((photo, index) => copyPhotoToAlbum(ride.id, photo, source, index))
  );
  const localPhotos = copied.filter((photo): photo is RideAlbumPhoto => Boolean(photo));
  const pendingPhotos = localPhotos.map((photo) => ({ ...photo, syncState: "syncing" as const }));
  const pendingAlbum: RideAlbum = {
    rideId: ride.id,
    title: rideDisplayTitle(ride),
    coverUri: existingPhotos[0]?.uri || pendingPhotos[0]?.uri || null,
    photos: dedupePhotos([...existingPhotos, ...pendingPhotos]),
    updatedAt: new Date().toISOString()
  };
  await persistAlbum(pendingAlbum);

  const synced = await syncAlbumPhotosToBackend(ride.id, pendingPhotos);
  const nextPhotos = dedupePhotos([...existingPhotos, ...synced]);
  const completedAlbum: RideAlbum = {
    ...pendingAlbum,
    coverUri: nextPhotos[0]?.uri || null,
    photos: nextPhotos,
    updatedAt: new Date().toISOString()
  };
  await persistAlbum(completedAlbum);
  return completedAlbum;
}

export async function removeAlbumPhoto(rideId: string, photoId: string): Promise<RideAlbum> {
  const album = await getRideAlbum(rideId);
  const removed = album?.photos.find((photo) => photo.id === photoId);
  if (removed?.backendPhotoId) {
    await api(`/rides/${rideId}/photos/${removed.backendPhotoId}`, { method: "DELETE" });
  }
  const photos = (album?.photos || []).filter((photo) => photo.id !== photoId);
  if (removed?.uri?.startsWith(FileSystem.documentDirectory || "")) {
    await FileSystem.deleteAsync(removed.uri, { idempotent: true }).catch(() => {});
  }
  const nextAlbum = {
    rideId,
    title: album?.title || null,
    coverUri: photos[0]?.uri || null,
    photos,
    updatedAt: new Date().toISOString()
  };
  await persistAlbum(nextAlbum);
  return nextAlbum;
}

export async function buildRideMemories(rides: Ride[], journal?: JournalResponse | null): Promise<RideMemory[]> {
  const safeRides = Array.isArray(rides) ? rides.filter((ride) => ride?.id) : [];
  const albums = await getRideAlbums(safeRides.map((ride) => ride.id));
  const memories: RideMemory[] = [];
  const photoRich = safeRides
    .map((ride) => ({ ride, album: albums[ride.id] }))
    .filter((item) => (item.album?.photos.length || 0) > 0)
    .sort((a, b) => (b.album?.photos.length || 0) - (a.album?.photos.length || 0));

  for (const item of photoRich.slice(0, 4)) {
    memories.push({
      id: `album-${item.ride.id}`,
      type: "album",
      title: item.album?.title || item.ride.aiTitle || item.ride.smartTitle || "Ride album",
      subtitle: `${item.album?.photos.length || 0} photos · ${km(item.ride.distanceM)}`,
      rideId: item.ride.id,
      coverUri: item.album?.coverUri || null,
      ride: item.ride,
      photoCount: item.album?.photos.length || 0
    });
  }

  const latest = safeRides[0];
  if (latest && !memories.some((memory) => memory.rideId === latest.id)) {
    memories.push({
      id: `route-${latest.id}`,
      type: "route",
      title: "Latest ride memory",
      subtitle: latest.summaryText || `${shortDate(latest.startedAt)} · ${km(latest.distanceM)}`,
      rideId: latest.id,
      ride: latest,
      photoCount: 0
    });
  }

  const longest = safeRides.reduce<Ride | null>((best, ride) => !best || ride.distanceM > best.distanceM ? ride : best, null);
  if (longest && !memories.some((memory) => memory.rideId === longest.id)) {
    memories.push({
      id: `longest-${longest.id}`,
      type: "route",
      title: "Longest route",
      subtitle: `${km(longest.distanceM)} · ${shortDate(longest.startedAt)}`,
      rideId: longest.id,
      ride: longest,
      photoCount: albums[longest.id]?.photos.length || 0,
      coverUri: albums[longest.id]?.coverUri || null
    });
  }

  const bestRide = journal?.monthlyRecap?.bestRide;
  if (bestRide && !memories.some((memory) => memory.rideId === bestRide.id)) {
    memories.push({
      id: `recap-${bestRide.id}`,
      type: "recap",
      title: "Best of this month",
      subtitle: `${km(bestRide.distanceM)} · ${journal?.monthlyRecap?.rideCount || 0} rides this month`,
      rideId: bestRide.id,
      ride: bestRide,
      photoCount: albums[bestRide.id]?.photos.length || 0,
      coverUri: albums[bestRide.id]?.coverUri || null
    });
  }

  const reviewSuggestion = journal?.pendingReviewSuggestions?.find((suggestion) => suggestion.rideId);
  const reviewRide = reviewSuggestion
    ? safeRides.find((ride) => ride.id === reviewSuggestion.rideId)
    : safeRides.find((ride) => !ride.reviewedAt);
  if (reviewRide && !memories.some((memory) => memory.rideId === reviewRide.id)) {
    memories.push({
      id: `review-${reviewRide.id}`,
      type: "review",
      title: "Story waiting",
      subtitle: reviewSuggestion?.prompt || reviewRide.reviewPrompt || "Give this ride a title or memory note.",
      rideId: reviewRide.id,
      ride: reviewRide,
      photoCount: albums[reviewRide.id]?.photos.length || 0,
      coverUri: albums[reviewRide.id]?.coverUri || null
    });
  }

  for (const seed of journal?.memorySeeds || []) {
    if (!seed.rideId || memories.some((memory) => memory.id === seed.id || memory.rideId === seed.rideId)) {
      continue;
    }
    const seedRide = safeRides.find((ride) => ride.id === seed.rideId);
    memories.push({
      id: seed.id,
      type: seed.type === "review" ? "review" : "route",
      title: seed.title,
      subtitle: seed.subtitle,
      rideId: seed.rideId,
      ride: seedRide || null,
      photoCount: seedRide ? albums[seedRide.id]?.photos.length || 0 : 0,
      coverUri: seedRide ? albums[seedRide.id]?.coverUri || null : null
    });
  }

  return memories.slice(0, 8);
}

async function imagePickerAssetToPhoto(asset: ImagePicker.ImagePickerAsset, index: number): Promise<RidePhoto | null> {
  const createdAt = readExifDate(asset.exif) || new Date().toISOString();
  let location = normalizeLocation({
    latitude: (asset.exif as any)?.GPSLatitude,
    longitude: (asset.exif as any)?.GPSLongitude
  });

  if (!location && asset.assetId) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
      location = normalizeLocation(info.location);
    } catch {
      // Location metadata is optional.
    }
  }

  return {
    id: asset.assetId || `${Date.now()}-${index}`,
    uri: asset.uri,
    createdAt,
    latitude: location?.latitude || 0,
    longitude: location?.longitude || 0,
    hasLocation: Boolean(location)
  };
}

async function copyPhotoToAlbum(
  rideId: string,
  photo: RidePhoto,
  source: "ride-window" | "manual",
  index: number
): Promise<RideAlbumPhoto | null> {
  try {
    await ensureAlbumDirectory(rideId);
    const extension = extensionForUri(photo.uri);
    const safeId = String(photo.id || `${Date.now()}-${index}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
    const destination = `${ALBUM_DIRECTORY}${rideId}/${source}-${safeId}-${index}${extension}`;
    await FileSystem.copyAsync({ from: photo.uri, to: destination });
    return {
      ...photo,
      id: `${source}-${safeId}-${index}`,
      uri: destination,
      originalUri: photo.uri,
      fileName: destination.split("/").pop() || null,
      importedAt: new Date().toISOString(),
      syncState: "local"
    };
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "albums",
      message: "Photo copy to ride album failed",
      details: diagnosticDetails(error)
    });
    return null;
  }
}

async function persistAlbum(album: RideAlbum) {
  await AsyncStorage.setItem(albumKey(album.rideId), JSON.stringify(album));
  const index = await readAlbumIndex();
  if (!index.includes(album.rideId)) {
    await AsyncStorage.setItem(ALBUM_INDEX_KEY, JSON.stringify([...index, album.rideId]));
  }
}

async function readAlbumIndex() {
  try {
    const stored = await AsyncStorage.getItem(ALBUM_INDEX_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function ensureAlbumDirectory(rideId: string) {
  await FileSystem.makeDirectoryAsync(ALBUM_DIRECTORY, { intermediates: true });
  await FileSystem.makeDirectoryAsync(`${ALBUM_DIRECTORY}${rideId}/`, { intermediates: true });
}

function normalizeAlbum(value: any, rideId: string): RideAlbum {
  const photos = Array.isArray(value?.photos)
    ? value.photos.map(normalizeAlbumPhoto).filter((photo): photo is RideAlbumPhoto => Boolean(photo))
    : [];
  return {
    rideId,
    title: typeof value?.title === "string" ? value.title : null,
    coverUri: typeof value?.coverUri === "string" ? value.coverUri : photos[0]?.uri || null,
    photos,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
  };
}

function normalizeAlbumPhoto(value: any): RideAlbumPhoto | null {
  const uri = typeof value?.uri === "string" ? value.uri : "";
  if (!uri) {
    return null;
  }
  return {
    id: String(value?.id || uri),
    uri,
    originalUri: typeof value?.originalUri === "string" ? value.originalUri : null,
    fileName: typeof value?.fileName === "string" ? value.fileName : null,
    backendPhotoId: typeof value?.backendPhotoId === "string" ? value.backendPhotoId : null,
    syncState: value?.syncState === "syncing"
      ? "failed"
      : value?.syncState === "synced" || value?.syncState === "failed"
      ? value.syncState
      : value?.backendPhotoId ? "synced" : "local",
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    importedAt: typeof value?.importedAt === "string" ? value.importedAt : new Date().toISOString(),
    latitude: finiteNumberOrZero(value?.latitude),
    longitude: finiteNumberOrZero(value?.longitude),
    hasLocation: Boolean(value?.hasLocation)
  };
}

async function syncAlbumPhotosToBackend(rideId: string, photos: RideAlbumPhoto[]) {
  const synced: RideAlbumPhoto[] = [];
  for (const photo of photos) {
    synced.push(await syncAlbumPhotoToBackend(rideId, photo));
  }
  return synced;
}

async function syncAlbumPhotoToBackend(rideId: string, photo: RideAlbumPhoto): Promise<RideAlbumPhoto> {
  let uploadUri: string | null = null;
  try {
    const prepared = await preparePhotoForSync(photo.uri);
    if (!prepared) return { ...photo, syncState: "failed" };
    uploadUri = prepared.uri;
    const imageBase64 = await FileSystem.readAsStringAsync(prepared.uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!imageBase64) {
      return { ...photo, syncState: "failed" };
    }
    const response = await api<{ photo: { id: string } }>(`/rides/${rideId}/photos`, {
      method: "POST",
      body: JSON.stringify({
        imageBase64,
        mimeType: "image/jpeg",
        fileName: jpegFileName(photo.fileName),
        clientPhotoId: photo.id,
        createdAt: photo.createdAt,
        latitude: photo.hasLocation ? photo.latitude : null,
        longitude: photo.hasLocation ? photo.longitude : null
      })
    });
    return { ...photo, backendPhotoId: response.photo?.id || photo.backendPhotoId || null, syncState: response.photo?.id ? "synced" : "failed" };
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "albums",
      message: "Ride album backend sync failed",
      details: diagnosticDetails(error)
    });
    return { ...photo, syncState: "failed" };
  } finally {
    if (uploadUri && uploadUri !== photo.uri) {
      await FileSystem.deleteAsync(uploadUri, { idempotent: true }).catch(() => {});
    }
  }
}

async function preparePhotoForSync(sourceUri: string): Promise<{ uri: string } | null> {
  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfo.exists) return null;

  const probe = await ImageManipulator.manipulateAsync(sourceUri, [], {
    compress: 0.96,
    format: ImageManipulator.SaveFormat.JPEG
  });
  const probeInfo = await FileSystem.getInfoAsync(probe.uri);
  const largestDimension = Math.max(probe.width || 0, probe.height || 0);
  if (largestDimension <= MAX_SYNC_PHOTO_DIMENSION && probeInfo.exists && Number(probeInfo.size || 0) <= MAX_SYNC_PHOTO_BYTES) {
    return { uri: probe.uri };
  }
  await FileSystem.deleteAsync(probe.uri, { idempotent: true }).catch(() => {});

  const variants = [
    { dimension: 2048, quality: 0.9 },
    { dimension: 2048, quality: 0.8 },
    { dimension: 2048, quality: 0.7 },
    { dimension: 1800, quality: 0.72 },
    { dimension: 1600, quality: 0.68 },
    { dimension: 1400, quality: 0.62 }
  ];
  for (const variant of variants) {
    const resize = probe.width >= probe.height
      ? { width: Math.min(probe.width, variant.dimension) }
      : { height: Math.min(probe.height, variant.dimension) };
    const optimized = await ImageManipulator.manipulateAsync(sourceUri, [{ resize }], {
      compress: variant.quality,
      format: ImageManipulator.SaveFormat.JPEG
    });
    const info = await FileSystem.getInfoAsync(optimized.uri);
    if (info.exists && Number(info.size || 0) <= MAX_SYNC_PHOTO_BYTES) return { uri: optimized.uri };
    await FileSystem.deleteAsync(optimized.uri, { idempotent: true }).catch(() => {});
  }
  return null;
}

function jpegFileName(fileName?: string | null) {
  const base = String(fileName || `ride-photo-${Date.now()}`).replace(/\.[^.]+$/, "");
  return `${base}.jpg`;
}

async function cacheBackendPhoto(rideId: string, value: any, localPhotos: RideAlbumPhoto[]): Promise<RideAlbumPhoto | null> {
  const backendPhotoId = String(value?.id || "");
  if (!backendPhotoId) return null;
  const existing = localPhotos.find((photo) => photo.backendPhotoId === backendPhotoId);
  if (existing) return { ...existing, syncState: "synced" as const };
  const extension = value?.mimeType === "image/png" ? ".png" : value?.mimeType === "image/webp" ? ".webp" : ".jpg";
  const destination = `${ALBUM_DIRECTORY}${rideId}/synced-${backendPhotoId.replace(/[^a-zA-Z0-9_-]/g, "-")}${extension}`;
  const token = await readToken();
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/rides/${rideId}/photos/${backendPhotoId}`, destination, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (result.status < 200 || result.status >= 300) return null;
  return {
    id: `synced-${backendPhotoId}`,
    backendPhotoId,
    uri: result.uri,
    fileName: typeof value?.fileName === "string" ? value.fileName : null,
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    importedAt: new Date().toISOString(),
    latitude: finiteNumberOrZero(value?.latitude),
    longitude: finiteNumberOrZero(value?.longitude),
    hasLocation: value?.hasLocation === true || (
      value?.latitude != null && value?.longitude != null &&
      Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude))
    ),
    syncState: "synced" as const
  };
}

function dedupePhotos(photos: RideAlbumPhoto[]) {
  const keys: string[] = [];
  const preferred = new Map<string, RideAlbumPhoto>();
  for (const photo of photos) {
    const key = photo.originalUri || photo.id || photo.uri;
    const existing = preferred.get(key);
    if (!existing) {
      keys.push(key);
      preferred.set(key, photo);
      continue;
    }
    if (syncStatePriority(photo.syncState) > syncStatePriority(existing.syncState)) preferred.set(key, photo);
  }
  return keys.map((key) => preferred.get(key)).filter((photo): photo is RideAlbumPhoto => Boolean(photo));
}

function syncStatePriority(state?: RideAlbumPhoto["syncState"]) {
  if (state === "synced") return 4;
  if (state === "syncing") return 3;
  if (state === "local") return 2;
  return 1;
}

function emptyAlbum(rideId: string): RideAlbum {
  return { rideId, coverUri: null, photos: [], updatedAt: new Date().toISOString() };
}

function albumKey(rideId: string) {
  return `${ALBUM_KEY_PREFIX}${rideId}`;
}

function extensionForUri(uri: string) {
  const match = uri.split("?")[0].match(/\.(jpe?g|png|webp|heic)$/i);
  return match ? match[0].toLowerCase() : ".jpg";
}

function mimeTypeForUri(uri: string) {
  const lower = uri.split("?")[0].toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function readExifDate(exif?: Record<string, any> | null) {
  const raw = exif?.DateTimeOriginal || exif?.DateTime || exif?.CreationDate;
  if (!raw) {
    return null;
  }
  const normalized = String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeLocation(value?: { latitude?: unknown; longitude?: unknown } | null) {
  return normalizeBoundedCoordinate(value);
}
