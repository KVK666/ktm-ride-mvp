import * as TaskManager from "expo-task-manager";
import { handleBackgroundLocations } from "./autoRideTracking";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";
import { BACKGROUND_LOCATION_TASK } from "./trackingKeys";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) {
    if (error) {
      await logDiagnostic({
        level: "warn",
        area: "location-task",
        message: "Background location task reported an error",
        details: diagnosticDetails(error)
      });
    }
    return;
  }

  try {
    const locations = Array.isArray((data as any).locations) ? (data as any).locations : [];
    await handleBackgroundLocations(locations);
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "location-task",
      message: "Background location task failed",
      details: diagnosticDetails(err)
    });
  }
});
