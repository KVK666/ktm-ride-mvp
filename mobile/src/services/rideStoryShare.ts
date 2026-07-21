import Share from "react-native-share";

export async function shareRideStoryImage(uri: string): Promise<void> {
  try {
    await Share.open({
      title: "Share RidePulse story",
      url: uri,
      type: "image/png",
      failOnCancel: false,
      useInternalStorage: true
    });
  } catch (error) {
    if (!isShareCancellation(error)) throw error;
  }
}

function isShareCancellation(error: unknown) {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return message.includes("cancel") || message.includes("did not share") || message.includes("dismiss");
}
