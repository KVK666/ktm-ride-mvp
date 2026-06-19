const { withAndroidManifest } = require("@expo/config-plugins");

const INSTAGRAM_PACKAGE = "com.instagram.android";

module.exports = function withInstagramPackageQuery(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    const queries = manifest.queries || [{}];
    const query = queries[0];
    const packages = query.package || [];
    const hasInstagram = packages.some((item) => item?.$?.["android:name"] === INSTAGRAM_PACKAGE);

    if (!hasInstagram) {
      packages.push({
        $: {
          "android:name": INSTAGRAM_PACKAGE
        }
      });
    }

    query.package = packages;
    manifest.queries = queries;
    return config;
  });
};
