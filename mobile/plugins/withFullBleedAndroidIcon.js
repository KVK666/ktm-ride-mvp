const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_launcher_full_bleed" />
  <foreground android:drawable="@drawable/ic_launcher_transparent" />
</adaptive-icon>
`;

const transparentXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="#00000000" />
</shape>
`;

const fullBleedXml = `<?xml version="1.0" encoding="utf-8"?>
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
  android:gravity="fill"
  android:src="@drawable/ic_launcher_full_bleed_image" />
`;

module.exports = function withFullBleedAndroidIcon(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resRoot = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res");
      const mipmapAnyDpi = path.join(resRoot, "mipmap-anydpi-v26");
      const drawable = path.join(resRoot, "drawable");
      const sourceIcon = path.join(projectRoot, "assets", "ridepulse-logo.png");

      fs.mkdirSync(mipmapAnyDpi, { recursive: true });
      fs.mkdirSync(drawable, { recursive: true });

      fs.writeFileSync(path.join(mipmapAnyDpi, "ic_launcher.xml"), adaptiveIconXml);
      fs.writeFileSync(path.join(mipmapAnyDpi, "ic_launcher_round.xml"), adaptiveIconXml);
      fs.writeFileSync(path.join(drawable, "ic_launcher_full_bleed.xml"), fullBleedXml);
      fs.writeFileSync(path.join(drawable, "ic_launcher_transparent.xml"), transparentXml);
      fs.copyFileSync(sourceIcon, path.join(drawable, "ic_launcher_full_bleed_image.png"));

      return config;
    }
  ]);
};
