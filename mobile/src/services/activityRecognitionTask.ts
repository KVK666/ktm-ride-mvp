import { AppRegistry } from "react-native";
import { handleMotionActivity } from "./autoRideTracking";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";

AppRegistry.registerHeadlessTask("RidePulseActivityRecognitionTask", () => async (activity) => {
  try {
    await handleMotionActivity(activity);
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "auto-tracking",
      message: "Motion detection background task failed",
      details: diagnosticDetails(err)
    });
  }
});
