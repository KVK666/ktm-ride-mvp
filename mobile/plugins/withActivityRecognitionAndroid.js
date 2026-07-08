const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withAppBuildGradle, withDangerousMod } = require("@expo/config-plugins");

const ACTIVITY_PERMISSION = "android.permission.ACTIVITY_RECOGNITION";
const PLAY_SERVICES_LOCATION = 'implementation("com.google.android.gms:play-services-location:21.0.1")';
const TEMPLATE_DIR = path.join(__dirname, "activity-recognition-android");
const TARGET_PACKAGE_DIR = path.join("app", "src", "main", "java", "com", "example", "dukeride");
const NATIVE_FILES = [
  "RidePulseActivityRecognitionHeadlessService.kt",
  "RidePulseActivityRecognitionModule.kt",
  "RidePulseActivityRecognitionPackage.kt",
  "RidePulseActivityRecognitionReceiver.kt"
];

module.exports = function withActivityRecognitionAndroid(config) {
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest["uses-permission"] || [];
    const hasPermission = permissions.some((item) => item?.$?.["android:name"] === ACTIVITY_PERMISSION);
    if (!hasPermission) {
      permissions.push({ $: { "android:name": ACTIVITY_PERMISSION } });
    }
    manifest["uses-permission"] = permissions;

    const application = manifest.application?.[0];
    if (application) {
      application.receiver = ensureManifestItem(application.receiver, ".RidePulseActivityRecognitionReceiver");
      application.service = ensureManifestItem(application.service, ".RidePulseActivityRecognitionHeadlessService");
    }
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy" && !config.modResults.contents.includes(PLAY_SERVICES_LOCATION)) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${PLAY_SERVICES_LOCATION}`
      );
    }
    return config;
  });

  return withDangerousMod(config, [
    "android",
    async (config) => {
      const targetDir = path.join(config.modRequest.platformProjectRoot, TARGET_PACKAGE_DIR);
      fs.mkdirSync(targetDir, { recursive: true });
      for (const fileName of NATIVE_FILES) {
        fs.copyFileSync(path.join(TEMPLATE_DIR, fileName), path.join(targetDir, fileName));
      }

      const mainApplicationPath = path.join(
        config.modRequest.platformProjectRoot,
        TARGET_PACKAGE_DIR,
        "MainApplication.kt"
      );
      if (!fs.existsSync(mainApplicationPath)) {
        return config;
      }
      const source = fs.readFileSync(mainApplicationPath, "utf8");
      if (source.includes("RidePulseActivityRecognitionPackage()")) {
        return config;
      }
      const updated = source.replace(
        "return PackageList(this).packages",
        `return PackageList(this).packages.toMutableList().apply {\n              add(RidePulseActivityRecognitionPackage())\n            }`
      );
      fs.writeFileSync(mainApplicationPath, updated);
      return config;
    }
  ]);
};

function ensureManifestItem(items = [], name) {
  const existing = items.some((item) => item?.$?.["android:name"] === name);
  if (existing) {
    return items;
  }
  return [
    ...items,
    {
      $: {
        "android:name": name,
        "android:exported": "false"
      }
    }
  ];
}
