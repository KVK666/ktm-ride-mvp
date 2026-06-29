const { withAndroidManifest } = require("@expo/config-plugins");

const UPDATES_REQUEST_HEADERS_KEY = "expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY";

module.exports = function withExpoUpdatesChannel(config) {
  return withAndroidManifest(config, async (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      return config;
    }

    const metadata = application["meta-data"] || [];
    const headers = JSON.stringify({ "expo-channel-name": "production" });
    const existing = metadata.find((item) => item?.$?.["android:name"] === UPDATES_REQUEST_HEADERS_KEY);

    if (existing) {
      existing.$["android:value"] = headers;
    } else {
      metadata.push({
        $: {
          "android:name": UPDATES_REQUEST_HEADERS_KEY,
          "android:value": headers
        }
      });
    }

    application["meta-data"] = metadata;
    return config;
  });
};
