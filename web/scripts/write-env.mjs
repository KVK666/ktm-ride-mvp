import { writeFileSync } from 'node:fs';

const apiBaseUrl = process.env.WEB_API_BASE_URL || 'https://ktm-ride-mvp.onrender.com/api';
const fallbackApiBaseUrl = process.env.WEB_FALLBACK_API_BASE_URL || '';
const googleMapsApiKey = process.env.WEB_GOOGLE_MAPS_API_KEY || '';
const apkUrl = process.env.WEB_APK_URL || 'https://github.com/KVK666/ktm-ride-mvp/releases/tag/latest';
const releaseUrl = process.env.WEB_RELEASE_URL || 'https://github.com/KVK666/ktm-ride-mvp/releases/tag/v0.1.0';

const output = `export const environment = {
  production: true,
  apiBaseUrl: ${JSON.stringify(apiBaseUrl)},
  fallbackApiBaseUrl: ${JSON.stringify(fallbackApiBaseUrl)},
  googleMapsApiKey: ${JSON.stringify(googleMapsApiKey)},
  apkUrl: ${JSON.stringify(apkUrl)},
  releaseUrl: ${JSON.stringify(releaseUrl)}
};
`;

writeFileSync(new URL('../src/environments/environment.prod.ts', import.meta.url), output);
