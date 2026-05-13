import * as MediaLibrary from "expo-media-library";
import { Ride, RidePhoto } from "../types";

export async function importRidePhotos(ride: Ride): Promise<RidePhoto[]> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Gallery permission is required to import ride photos");
  }

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
      const info = await MediaLibrary.getAssetInfoAsync(asset);
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

function normalizeLocation(location?: MediaLibrary.Location | null) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}
