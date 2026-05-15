import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";

const PROFILE_PHOTO_KEY_PREFIX = "duke_ride_profile_photo:";
const PROFILE_PHOTO_DIR = `${FileSystem.documentDirectory || ""}profile-photos/`;

function storageKey(userId: string) {
  return `${PROFILE_PHOTO_KEY_PREFIX}${userId}`;
}

async function ensurePhotoDirectory() {
  const info = await FileSystem.getInfoAsync(PROFILE_PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROFILE_PHOTO_DIR, { intermediates: true });
  }
}

function extensionFor(uri: string) {
  const match = uri.match(/\.(jpe?g|png|webp|heic)$/i);
  return match?.[1]?.toLowerCase() || "jpg";
}

async function deleteStoredFile(uri?: string | null) {
  if (!uri || !uri.startsWith(PROFILE_PHOTO_DIR)) {
    return;
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

export async function getProfilePhotoUri(userId?: string | null) {
  if (!userId) {
    return null;
  }
  return AsyncStorage.getItem(storageKey(userId));
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
    quality: 0.85
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
