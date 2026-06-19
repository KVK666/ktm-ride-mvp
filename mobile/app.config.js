const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

module.exports = {
  expo: {
    name: "Duke Ride",
    slug: "duke-ride",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    scheme: "dukeride",
    icon: "./assets/app-logo.png",
    splash: {
      image: "./assets/app-logo.png",
      resizeMode: "contain",
      backgroundColor: "#08090b"
    },
    ios: {
      bundleIdentifier: "com.example.dukeride",
      config: {
        googleMapsApiKey
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Duke Ride uses your location for route navigation and ride tracking.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Duke Ride uses background location to keep tracking active during rides.",
        NSPhotoLibraryUsageDescription: "Duke Ride reads your photo library only when you import ride photos or choose a profile photo.",
        LSApplicationQueriesSchemes: ["instagram", "instagram-stories"],
        UIBackgroundModes: ["location"]
      }
    },
    android: {
      package: "com.example.dukeride",
      adaptiveIcon: {
        foregroundImage: "./assets/app-logo.png",
        backgroundColor: "#0b0b0d"
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
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "ACCESS_MEDIA_LOCATION",
        "READ_MEDIA_IMAGES",
        "READ_EXTERNAL_STORAGE"
      ]
    },
    plugins: [
      "./plugins/withFullBleedAndroidIcon",
      "./plugins/withInstagramPackageQuery",
      "expo-font",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow Duke Ride to choose a profile photo from your gallery."
        }
      ],
      [
        "expo-media-library",
        {
          photosPermission: "Allow Duke Ride to find photos taken during your rides.",
          isAccessMediaLocationEnabled: true
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow Duke Ride to track rides in the background."
        }
      ]
    ]
  }
};
