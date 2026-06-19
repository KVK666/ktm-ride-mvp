import { Platform } from "react-native";
import Share, { Social } from "react-native-share";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";

const INSTAGRAM_ANDROID_PACKAGE = "com.instagram.android";
const INSTAGRAM_APP_ID = process.env.EXPO_PUBLIC_INSTAGRAM_APP_ID || "";

export type RideStoryShareResult = {
  message: string;
  mode: "instagram-stories" | "instagram" | "share-sheet";
};

export async function shareRideStoryImage(uri: string): Promise<RideStoryShareResult> {
  if (Platform.OS !== "android") {
    await openShareSheet(uri);
    return {
      mode: "share-sheet",
      message: "Story image is ready to share."
    };
  }

  const instagramInstalled = await isInstagramInstalled();
  if (!instagramInstalled) {
    await openShareSheet(uri);
    return {
      mode: "share-sheet",
      message: "Instagram is not installed, so the story image opened in the share sheet."
    };
  }

  if (INSTAGRAM_APP_ID) {
    try {
      await Share.shareSingle({
        social: Social.InstagramStories,
        appId: INSTAGRAM_APP_ID,
        backgroundImage: uri,
        backgroundTopColor: "#07080a",
        backgroundBottomColor: "#ff6a00",
        useInternalStorage: true
      });
      return {
        mode: "instagram-stories",
        message: "Story image opened in Instagram Stories."
      };
    } catch (error) {
      if (isShareCancellation(error)) {
        return {
          mode: "instagram-stories",
          message: "Story sharing cancelled."
        };
      }
      await logDiagnostic({
        level: "warn",
        area: "ride-story",
        message: "Instagram Stories direct share failed",
        details: diagnosticDetails(error)
      });
    }
  }

  try {
    await Share.shareSingle({
      social: Social.Instagram,
      url: uri,
      type: "image/png",
      title: "Duke Ride story",
      forceDialog: true,
      useInternalStorage: true
    });
    return {
      mode: "instagram",
      message: INSTAGRAM_APP_ID
        ? "Instagram opened with the story image."
        : "Instagram opened with the image. Add EXPO_PUBLIC_INSTAGRAM_APP_ID for direct Stories handoff."
    };
  } catch (error) {
    if (isShareCancellation(error)) {
      return {
        mode: "instagram",
        message: "Story sharing cancelled."
      };
    }
    await logDiagnostic({
      level: "warn",
      area: "ride-story",
      message: "Instagram image share failed; falling back to share sheet",
      details: diagnosticDetails(error)
    });
    await openShareSheet(uri);
    return {
      mode: "share-sheet",
      message: "Instagram did not accept the image, so it opened in the share sheet."
    };
  }
}

async function isInstagramInstalled() {
  try {
    const result = await Share.isPackageInstalled(INSTAGRAM_ANDROID_PACKAGE);
    return result.isInstalled;
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "ride-story",
      message: "Instagram package check failed",
      details: diagnosticDetails(error)
    });
    return false;
  }
}

async function openShareSheet(uri: string) {
  await Share.open({
    title: "Share Duke Ride story",
    url: uri,
    type: "image/png",
    failOnCancel: false,
    useInternalStorage: true
  });
}

function isShareCancellation(error: unknown) {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return message.includes("cancel") || message.includes("did not share") || message.includes("dismiss");
}
