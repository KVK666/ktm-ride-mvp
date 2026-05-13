import * as TaskManager from "expo-task-manager";
import { handleBackgroundLocations } from "./autoRideTracking";
import { BACKGROUND_LOCATION_TASK } from "./trackingKeys";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) {
    return;
  }

  const locations = (data as any).locations || [];
  await handleBackgroundLocations(locations);
});
