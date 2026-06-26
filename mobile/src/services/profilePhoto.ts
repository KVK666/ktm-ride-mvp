import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { api } from "../api/client";
import { User } from "../types";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";

const PROFILE_PHOTO_KEY_PREFIX = "duke_ride_profile_photo:";
const PROFILE_PHOTO_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}profile-photos/`
  : "";
const MAX_UPLOAD_BYTES = 768 * 1024;

type ProfilePhotoMetadata = Pick<User, "hasProfilePhoto" | "profilePhotoUpdatedAt">;

type ProfilePhotoResponse = {
  imageBase64: string;
  mimeType: string;
  updatedAt?: string | null;
};

function storageKey(userId: string) {
  return `${PROFILE_PHOTO_KEY_PREFIX}${userId}`;
}

async function ensurePhotoDirectory() {
  if (!PROFILE_PHOTO_DIR) {
    throw new Error("Local document storage is unavailable");
  }

  const info = await FileSystem.getInfoAsync(PROFILE_PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROFILE_PHOTO_DIR, { intermediates: true });
  }
}

function extensionFor(uri: string) {
  const match = uri.match(/\.(jpe?g|png|webp|heic)$/i);
  return match?.[1]?.toLowerCase() || "jpg";
}

function extensionForMime(mimeType?: string | null) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function mimeTypeFor(uri: string) {
  const extension = extensionFor(uri);
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

async function deleteStoredFile(uri?: string | null) {
  if (!PROFILE_PHOTO_DIR || !uri || !uri.startsWith(PROFILE_PHOTO_DIR)) {
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (err) {
    await logDiagnostic({
      level: "warn",
      area: "profile",
      message: "Profile photo cleanup failed",
      details: diagnosticDetails(err)
    });
  }
}

export async function getProfilePhotoUri(userId?: string | null) {
  if (!userId) {
    return null;
  }
  try {
    return await AsyncStorage.getItem(storageKey(userId));
  } catch (err) {
    await logDiagnostic({
      level: "warn",
      area: "profile",
      message: "Profile photo lookup failed",
      details: diagnosticDetails(err)
    });
    return null;
  }
}

export async function pickAndSaveProfilePhoto(userId: string) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Gallery permission is required to choose a profile photo");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.58
  });

  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }

  await ensurePhotoDirectory();
  const currentUri = await getProfilePhotoUri(userId);
  const sourceUri = result.assets[0].uri;
  const destinationUri = `${PROFILE_PHOTO_DIR}${userId}-${Date.now()}.${extensionFor(sourceUri)}`;

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
    await AsyncStorage.setItem(storageKey(userId), destinationUri);
    await deleteStoredFile(currentUri);
    return destinationUri;
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "profile",
      message: "Profile photo save failed",
      details: diagnosticDetails(err)
    });
    throw new Error("Unable to save profile photo");
  }
}

export async function removeProfilePhoto(userId: string) {
  const currentUri = await getProfilePhotoUri(userId);
  await deleteStoredFile(currentUri);
  await AsyncStorage.removeItem(storageKey(userId));
}

export async function uploadProfilePhoto(userId: string, uri: string): Promise<ProfilePhotoMetadata> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error("Profile photo file is missing");
  }
  if (typeof info.size === "number" && info.size > MAX_UPLOAD_BYTES) {
    throw new Error("Profile photo is too large. Choose a smaller image.");
  }

  const imageBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  if (!imageBase64) {
    throw new Error("Unable to read profile photo");
  }

  const metadata = await api<ProfilePhotoMetadata>("/profile/photo", {
    method: "PUT",
    body: JSON.stringify({ imageBase64, mimeType: mimeTypeFor(uri) })
  });

  await AsyncStorage.setItem(storageKey(userId), uri);
  return metadata;
}

export async function fetchAndCacheBackendProfilePhoto(userId: string) {
  await ensurePhotoDirectory();
  const response = await api<ProfilePhotoResponse>("/profile/photo", {
    headers: { Accept: "application/json" }
  });
  if (!response.imageBase64 || !response.mimeType) {
    throw new Error("Profile photo response is incomplete");
  }

  const destinationUri = `${PROFILE_PHOTO_DIR}${userId}-backend-${Date.now()}.${extensionForMime(response.mimeType)}`;
  const currentUri = await getProfilePhotoUri(userId);
  await FileSystem.writeAsStringAsync(destinationUri, response.imageBase64, { encoding: FileSystem.EncodingType.Base64 });
  await AsyncStorage.setItem(storageKey(userId), destinationUri);
  await deleteStoredFile(currentUri);
  return destinationUri;
}

export async function deleteBackendProfilePhoto(userId: string): Promise<ProfilePhotoMetadata> {
  const metadata = await api<ProfilePhotoMetadata>("/profile/photo", { method: "DELETE" });
  await removeProfilePhoto(userId);
  return metadata;
}

export async function syncProfilePhotoForUser(user?: User | null): Promise<ProfilePhotoMetadata | null> {
  if (!user?.id) {
    return null;
  }

  try {
    if (user.hasProfilePhoto) {
      await fetchAndCacheBackendProfilePhoto(user.id);
      return null;
    }

    const localUri = await getProfilePhotoUri(user.id);
    if (localUri) {
      return await uploadProfilePhoto(user.id, localUri);
    }
  } catch (err) {
    await logDiagnostic({
      level: "warn",
      area: "profile",
      message: "Profile photo sync failed",
      details: diagnosticDetails(err)
    });
  }

  return null;
}
