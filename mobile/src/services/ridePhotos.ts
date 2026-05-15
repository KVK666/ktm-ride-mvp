import * as MediaLibrary from "expo-media-library";
import { PermissionsAndroid, Platform } from "react-native";
import { Ride, RidePhoto } from "../types";

export async function importRidePhotos(ride: Ride): Promise<RidePhoto[]> {
  await requestPhotoAccess();

  const startedAt = new Date(ride.startedAt).getTime();
  const endedAt = new Date(ride.endedAt || ride.startedAt).getTime();
  const photos: RidePhoto[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter: startedAt,
      createdBefore: endedAt,
      first: 100,
      after,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]]
    });

    for (const asset of page.assets) {
      const info = await getAssetInfo(asset);
      const location = normalizeLocation(info.location);
      photos.push({
        id: asset.id,
        uri: info.localUri || asset.uri,
        createdAt: new Date(asset.creationTime).toISOString(),
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        hasLocation: Boolean(location)
      });
    }

    after = page.endCursor;
    hasNextPage = page.hasNextPage;
  }

  return photos.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function requestPhotoAccess() {
  if (Platform.OS !== "android") {
    const permission = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
    if (permission.status !== "granted") {
      throw new Error("Gallery permission is required to import ride photos");
    }
    return;
  }

  const apiLevel = Number(Platform.Version);
  const photoPermission =
    apiLevel >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
  const permissions = [photoPermission];

  if (apiLevel >= 34) {
    permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED);
  }
  if (apiLevel >= 29) {
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION);
  }

  const results = await PermissionsAndroid.requestMultiple(permissions);
  const canReadPhotos =
    results[photoPermission] === PermissionsAndroid.RESULTS.GRANTED ||
    results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED] ===
      PermissionsAndroid.RESULTS.GRANTED;

  if (!canReadPhotos) {
    throw new Error("Gallery permission is required to import ride photos");
  }
}

async function getAssetInfo(asset: MediaLibrary.Asset): Promise<MediaLibrary.AssetInfo> {
  try {
    return await MediaLibrary.getAssetInfoAsync(asset);
  } catch (err: any) {
    if (String(err?.message || err).includes("ACCESS_MEDIA_LOCATION")) {
      return asset;
    }

    throw err;
  }
}

function normalizeLocation(location?: MediaLibrary.Location | null) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}
