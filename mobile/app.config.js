const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const easProjectId =
  process.env.EAS_PROJECT_ID ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  "72bc39ae-7012-4f29-8012-13113b7ea8fc";
const updatesUrl =
  process.env.EXPO_UPDATES_URL ||
  process.env.EXPO_PUBLIC_UPDATES_URL ||
  "https://u.expo.dev/72bc39ae-7012-4f29-8012-13113b7ea8fc";

module.exports = {
  expo: {
    name: "RidePulse",
    slug: "duke-ride",
    version: "0.1.4",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    scheme: "dukeride",
    icon: "./assets/ridepulse-logo.png",
    runtimeVersion: {
      policy: "appVersion"
    },
    updates: {
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      ...(updatesUrl ? { url: updatesUrl } : {})
    },
    splash: {
      image: "./assets/ridepulse-logo.png",
      resizeMode: "contain",
      backgroundColor: "#080A0C"
    },
    ios: {
      bundleIdentifier: "com.example.dukeride",
      config: {
        googleMapsApiKey
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "RidePulse uses your location for route navigation and ride tracking.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "RidePulse uses background location to keep tracking active during rides.",
        NSPhotoLibraryUsageDescription: "RidePulse reads your photo library only when you import ride photos or choose a profile photo.",
        LSApplicationQueriesSchemes: ["instagram", "instagram-stories"],
        UIBackgroundModes: ["location"]
      }
    },
    android: {
      package: "com.example.dukeride",
      versionCode: 5,
      adaptiveIcon: {
        foregroundImage: "./assets/ridepulse-logo.png",
        backgroundColor: "#080A0C"
      },
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey
        }
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "ACTIVITY_RECOGNITION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "ACCESS_MEDIA_LOCATION",
        "READ_MEDIA_IMAGES",
        "READ_EXTERNAL_STORAGE"
      ]
    },
    plugins: [
      "./plugins/withFullBleedAndroidIcon",
      "./plugins/withActivityRecognitionAndroid",
      "./plugins/withExpoUpdatesChannel",
      "./plugins/withInstagramPackageQuery",
      "expo-font",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow RidePulse to choose a profile photo from your gallery."
        }
      ],
      [
        "expo-media-library",
        {
          photosPermission: "Allow RidePulse to find photos taken during your rides.",
          isAccessMediaLocationEnabled: true
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow RidePulse to track rides in the background."
        }
      ]
    ],
    extra: {
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {})
    }
  }
};
