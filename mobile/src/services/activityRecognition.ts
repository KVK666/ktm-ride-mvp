import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";

export type MotionActivity = {
  type: string;
  confidence: number;
  detectedAt: string;
};

export type ActivityRecognitionStatus = {
  available: boolean;
  running: boolean;
  permissionGranted: boolean;
};

const EVENT_NAME = "RidePulseActivityChanged";
const ACTIVITY_RECOGNITION_PERMISSION = "android.permission.ACTIVITY_RECOGNITION";
const nativeModule = NativeModules.RidePulseActivityRecognition;
const emitter = nativeModule ? new NativeEventEmitter(nativeModule) : null;

export async function getActivityRecognitionStatus(): Promise<ActivityRecognitionStatus> {
  if (Platform.OS !== "android" || !nativeModule?.getActivityRecognitionStatus) {
    return { available: false, running: false, permissionGranted: false };
  }
  const status = await nativeModule.getActivityRecognitionStatus();
  return {
    available: Boolean(status?.available),
    running: Boolean(status?.running),
    permissionGranted: Boolean(status?.permissionGranted)
  };
}

export async function startActivityRecognition(intervalMs: number): Promise<ActivityRecognitionStatus> {
  if (Platform.OS !== "android" || !nativeModule?.startActivityRecognition) {
    throw new Error("Motion detection is not available on this device.");
  }
  await ensureActivityRecognitionPermission();
  await nativeModule.startActivityRecognition(intervalMs);
  return getActivityRecognitionStatus();
}

export async function stopActivityRecognition() {
  if (Platform.OS !== "android" || !nativeModule?.stopActivityRecognition) {
    return;
  }
  await nativeModule.stopActivityRecognition();
}

export function addActivityRecognitionListener(listener: (activity: MotionActivity) => void) {
  if (!emitter) {
    return { remove: () => {} };
  }
  return emitter.addListener(EVENT_NAME, (event) => {
    listener(normalizeActivity(event));
  });
}

async function ensureActivityRecognitionPermission() {
  if (Platform.OS !== "android" || Number(Platform.Version) < 29) {
    return;
  }
  const permission = ACTIVITY_RECOGNITION_PERMISSION as any;
  const granted = await PermissionsAndroid.check(permission);
  if (granted) {
    return;
  }
  const result = await PermissionsAndroid.request(permission, {
    title: "Allow motion detection",
    message: "RidePulse uses motion detection to wait for vehicle movement before turning on ride GPS.",
    buttonPositive: "Allow",
    buttonNegative: "Not now"
  });
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error("Physical activity permission is required for battery-saving auto tracking.");
  }
}

function normalizeActivity(value: any): MotionActivity {
  return {
    type: typeof value?.type === "string" ? value.type : "UNKNOWN",
    confidence: Number.isFinite(Number(value?.confidence)) ? Number(value.confidence) : 0,
    detectedAt: typeof value?.detectedAt === "string" ? value.detectedAt : new Date().toISOString()
  };
}
