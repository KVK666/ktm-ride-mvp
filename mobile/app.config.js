const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

module.exports = {
  expo: {
    name: "Duke Ride",
    slug: "duke-ride",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    scheme: "dukeride",
    splash: {
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
        UIBackgroundModes: ["location"]
      }
    },
    android: {
      package: "com.example.dukeride",
      adaptiveIcon: {
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
        "FOREGROUND_SERVICE_LOCATION"
      ]
    },
    plugins: [
      "expo-font",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow Duke Ride to track rides in the background."
        }
      ]
    ]
  }
};
