# RidePulse App Context

Last updated: 2026-06-25

This file is the living context for the RidePulse app. Keep it updated whenever the app gains a meaningful feature, UX change, deployment change, setup change, or known limitation. Treat `APP_CONTEXT.md` as part of the definition of done for user-facing changes.

## Current Purpose

RidePulse is a private React Native ride tracking app for a small rider group across any motorcycle brand. It focuses on the core useful parts riders actually need: tracking rides, viewing route history, checking speed and distance analytics, using Google Maps based navigation, and exporting ride reports.

## Current Stack

- Mobile app: Expo React Native, Android-first.
- Backend: Render Express API is the current production mobile target; Cloudflare Worker remains a contract-compatible fallback.
- Database: PostgreSQL, currently hosted on Neon.
- Backend hosting: Render Starter in Singapore, backed by Neon PostgreSQL.
- Maps: Google Maps SDK for Android plus Google Directions and Geocoding APIs.
- Authentication: Email/password with JWT.
- Main repo branch: `ktm-ride-mvp`.
- GitHub repo: `https://github.com/KVK666/ktm-ride-mvp`.
- Downloadable Android APK: `releases/RidePulse-latest.apk` in the GitHub repo when refreshed, though legacy asset names may still exist during migration.
- Official GitHub Release APK: `https://github.com/KVK666/ktm-ride-mvp/releases/tag/v0.1.0`.
- Automatic latest APK release: `https://github.com/KVK666/ktm-ride-mvp/releases/tag/latest`.
- Current production mobile API base URL: `https://ktm-ride-mvp.onrender.com/api`.
- Cloudflare Worker fallback API URL: `https://duke-ride-api.dukeride-kvk.workers.dev/api`.

Important compatibility rule: keep package IDs, deep links, API URLs, and legacy storage keys such as `duke_ride_*` stable unless a migration is explicitly planned and tested.

Do not commit `.env` files, API keys, database passwords, or Neon connection strings.

## What The App Does Now

- Lets a rider register and log in with email/password.
- Shows the logged-in rider name on the dashboard.
- Shows a More area with Profile, Analytics, and Reports destinations.
- Shows a Profile tab with local profile photo, name, email, bike model, rider ID, diagnostics, logout, and auto tracking toggle.
- Supports two persisted cinematic themes shown as Midnight and True Black, while retaining the `graphite`/`oled` storage values and legacy `ktm`/`universal` migration.
- UI uses the premium RidePulse journal system: near-black surfaces, warm white Manrope typography, restrained electric-lime accents, route artwork, softer elevation, and a floating bottom nav.
- Shows an Android app icon based on `mobile/assets/ridepulse-logo.png`.
- Uses Google Maps in navigation, ride, and history views.
- Lets users search a destination and view route/directions in the Navigate tab.
- Shows a safety warning before navigation.
- Lets users manually start and stop ride tracking.
- Manual ride tracking is crash-resilient: active ride start time and GPS points are continuously persisted locally and recovered after app restart.
- If a manual ride save/upload fails, the ride is kept in the local pending upload queue instead of being lost.
- Pending ride uploads show a `Retry upload now` action on Ride/Profile and report the upload result or failure reason.
- Tracks GPS points, distance, duration, top speed, average speed, start/end time, and route path.
- Stores GPS accuracy on new ride points and filters top-speed spikes using accuracy, a 250 km/h cap, and nearby speed support.
- Ride uploads include a client-generated ride ID so retries do not create duplicate rides.
- Supports background location for ride tracking when permission is granted.
- Saves completed rides to the backend/PostgreSQL.
- Shows dashboard totals for today, month, year, total rides, best top speed, average speed, and recent rides.
- Dashboard shows a recovery card when an interrupted manual ride is locally stored and needs to be stopped/saved from the Ride tab.
- Shows ride history by period, with route maps and full-screen map viewing.
- Opens a dedicated Ride Detail screen from History with full route map, ride stats, route summary, and speed-over-time chart.
- Ride Detail has a Ride Review section for ride title, notes, reviewed status, and confirmed duplicate cleanup.
- Ride Detail has a confirmed delete option for the selected ride, intended for test rides, unwanted rides, or duplicates that should be fully removed with their route points.
- Ride Detail can import phone camera photos taken during the ride window and display them as photo stops.
- Imported ride photos with GPS metadata appear as camera markers on the ride map.
- Ride Detail can create a local 9:16 ride story image and share it to Instagram/share sheet without using OpenAI API billing.
- Ride Detail can generate varied ChatGPT image prompts from exact ride stats, time/place mood, and optional Open-Meteo weather; prompts are copied/shared manually into ChatGPT.
- Shows analytics summary cards and charts for distance, ride count, duration, and top speed.
- Generates basic reports and can export reports as PDF.
- Keeps the old Cloudflare Worker project as legacy fallback code, but the production app and V2 Smart Journal backend target paid Render.
- Adds a V2 Smart Journal layer on top of existing ride data: `/api/journal` returns latest ride, monthly recap, highlights, recent rides, and review count; `/api/rides/:id/intelligence` returns suggested title, summary text, badges, fastest/route chapter data, and safe fallbacks for malformed or missing GPS points.
- Home, Journal, Ride Detail, Ride, and You now use premium smart-journal primitives such as route heroes, smart highlights, ride badges, route replay, chapter timeline, intentional empty states, and inline skeletons.

## Automatic Ride Tracking

Auto tracking is implemented as an optional setting and is off by default.

- Toggle location: Ride tab and Profile tab.
- Manual Start/Stop remains available.
- Manual tracking takes priority so an auto ride is not created at the same time.
- Auto tracking uses background GPS with both reported speed and inferred speed from GPS distance/time.
- Auto-start rule: sustained movement around `8 km/h` or clear GPS movement for about `30 seconds` and at least `100 meters`.
- Auto-start tolerates short bad/zero-speed GPS samples for about `75 seconds`.
- Auto-stop rule: speed below `5 km/h` for about `5 minutes`.
- Discard rule: auto rides under `2 minutes` or under `500 meters` are ignored.
- If upload fails, auto rides are queued locally and retried when the app opens/logs in.
- Pending auto ride sync is deduplicated and guarded so repeated retries do not submit the same ride multiple times.
- Auto tracking status labels: `Off`, `Watching`, `Auto ride in progress`, `Pending upload`.

Known limitation: auto tracking detects sustained movement, not the exact vehicle. It cannot perfectly know bike vs car.

## Important Files

- `mobile/src/screens/RideScreen.tsx`: manual ride UI plus auto tracking card.
- `mobile/src/services/manualRideSession.ts`: crash-resilient local manual ride session storage, recovery, and map point compaction.
- `mobile/src/screens/RideDetailScreen.tsx`: dedicated ride detail view opened from History, with ride review and duplicate cleanup.
- `mobile/src/components/RideStoryCard.tsx`: local 9:16 ride story image layout rendered for capture/share.
- `mobile/src/services/rideStoryPrompt.ts`: dynamic ChatGPT image prompt variants and optional Open-Meteo weather mood lookup.
- `mobile/src/services/rideStoryShare.ts`: Android Instagram/share-sheet handoff for generated story images.
- `mobile/plugins/withInstagramPackageQuery.js`: Expo config plugin that exposes Instagram to Android package queries for reliable share targeting.
- `mobile/src/screens/AnalyticsScreen.tsx`: analytics summaries and charts.
- `mobile/src/screens/ProfileScreen.tsx`: profile, local profile photo, diagnostics, and auto tracking toggle.
- `mobile/src/theme/ThemeContext.tsx`: persisted app theme mode and legacy theme migration.
- `mobile/src/theme/colors.ts`: Midnight and True Black palette values plus shared typography, layout, and motion tokens.
- `mobile/src/components/RouteArtwork.tsx`: lightweight SVG route artwork for Home, Journal, and ride-detail hero surfaces.
- `mobile/src/components/JournalHero.tsx`, `SmartHighlight.tsx`, `RideBadge.tsx`, `RouteReplay.tsx`, `ChapterTimeline.tsx`, `PremiumEmptyState.tsx`, and `InlineSkeleton.tsx`: Smart Journal V2 primitives.
- `backend/src/services/routePreviews.js`: bounded route-preview loader used by the Express fallback API.
- `backend/src/services/journalIntelligence.js`: derived smart-journal summaries, badges, highlights, route chapters, and fallback-safe ride intelligence.
- `mobile/src/services/profilePhoto.ts`: local per-user profile photo picker/storage.
- `mobile/src/services/ridePhotos.ts`: scans the phone photo library for photos created between ride start/end times.
- `mobile/src/services/autoRideTracking.ts`: auto tracking state machine, thresholds, background handling, pending queue.
- `mobile/src/services/locationTask.ts`: Expo background location task entrypoint.
- `mobile/src/services/rideUpload.ts`: ride upload and pending auto ride sync.
- `mobile/src/services/trackingKeys.ts`: local storage keys and background task name.
- `mobile/src/hooks/useAutoTracking.ts`: shared UI hook for Ride/Profile toggle state.
- `mobile/src/context/AuthContext.tsx`: auth bootstrap and pending ride sync after login.
- `mobile/src/api/client.ts`: API client, SecureStore token, mirrored background token.
- `worker/src/index.js`: Cloudflare Worker API routes for auth, rides, dashboard, analytics, and reports.
- `worker/src/rideMath.js`: Worker-safe ride distance/speed summary logic.
- `backend/src/routes/rides.js`: ride create/list/detail/delete API.
- `backend/db/schema.sql`: users, rides, and ride_points schema.
- `backend/scripts/removeDuplicateRides.js`: one-off duplicate ride cleanup for a rider ID prefix; dry-run by default.
- `backend/scripts/remove-duplicate-rides.ps1`: Windows wrapper that prompts for `DATABASE_URL` securely before running duplicate cleanup.
- `backend/scripts/removeDuplicateRidesViaApi.js`: one-off duplicate ride cleanup through the configured live API, useful when direct Neon connection details are confusing.

## Local Development Notes

Mobile:

```powershell
cd "C:\Users\BBS001\Documents\New project\mobile"
npm run typecheck
npm run android
npm run android:install:release
```

Release APK build:

```powershell
cd "C:\Users\BBS001\Documents\New project\mobile\android"
$env:Path='C:\Program Files\nodejs;' + $env:Path
.\gradlew.bat app:assembleRelease -x lint -x test --configure-on-demand --build-cache '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'
```

Install on connected Android phone:

```powershell
& "C:\Users\BBS001\AppData\Local\Android\Sdk\platform-tools\adb.exe" devices
& "C:\Users\BBS001\AppData\Local\Android\Sdk\platform-tools\adb.exe" push "C:\Users\BBS001\Documents\New project\mobile\android\app\build\outputs\apk\release\app-release.apk" /data/local/tmp/duke-release.apk
& "C:\Users\BBS001\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am force-stop com.example.dukeride
& "C:\Users\BBS001\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell pm install -r /data/local/tmp/duke-release.apk
```

Backend:

```powershell
cd "C:\Users\BBS001\Documents\New project\backend"
npm install
npm run dev
```

Cloudflare Worker:

```powershell
cd "C:\Users\BBS001\Documents\New project\worker"
npm install
npm run check
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npm run deploy
```

Current production backend health check:

```text
https://ktm-ride-mvp.onrender.com/health
```

## Latest Fix Notes

- 2026-05-20: Login was failing with `Unexpected server error` because the mobile `.env` was pointing at the Cloudflare Worker API, which was not verified healthy.
- 2026-05-20: `mobile/.env` was switched back to `https://ktm-ride-mvp.onrender.com/api`.
- 2026-05-20: A clean Android release build succeeded and the rebuilt APK was installed on the connected Moto phone.
- 2026-05-21: Patched and deployed the Worker with clearer `/health` readiness output and config errors.
- 2026-05-21: Cloudflare `DATABASE_URL` and `JWT_SECRET` secrets were configured.
- 2026-05-21: Live Worker health reports `ready: true`.
- 2026-05-21: `mobile/.env` was switched to `https://duke-ride-api.dukeride-kvk.workers.dev/api`.
- 2026-05-21: A clean Android release build succeeded and the Worker-backed APK was installed on the connected Moto phone.
- Next app test: login on the phone, confirm Dashboard/History load, then start/stop a short test ride and confirm it saves through Cloudflare Worker.
- 2026-05-21: Added duplicate ride cleanup tooling for rider ID prefixes such as `FC19BC08`. Run dry-run first, then apply only after reviewing the `DELETE` rows.
- 2026-05-21: Added Worker error responses with the failing route and request ID, so app server errors identify the broken endpoint instead of only saying `Unexpected server error`.
- 2026-05-22: Implemented Ride Review source changes: ride `title`, `notes`, `reviewed_at`, update endpoint, duplicate lookup endpoint, dashboard review count, Ride Detail review UI, and post-manual-ride review navigation.
- Required before deploy: update the Cloudflare Worker `DATABASE_URL` secret to the Neon database that contains `public.users`, `public.rides`, and `public.ride_points`; then run the schema migration so `rides.title`, `rides.notes`, and `rides.reviewed_at` exist.
- 2026-05-22: Added speed accuracy fix. New points store `accuracy_m`; top speed ignores poor-accuracy points, ignores readings above `250 km/h`, and requires nearby speed support so one GPS spike does not become the ride top speed.
- 2026-05-22: Refreshed core mobile UI surfaces: palette, stat cards, buttons, tab bar, login, dashboard, ride screen, history cards, and map chrome.
- 2026-05-22: Added Profile theme selector support, later migrated to the current Graphite and OLED Black app themes.
- 2026-05-25: Hardened long-ride reliability. Manual rides now persist active points continuously, recover after app restart, queue failed uploads locally, compact map rendering for long routes, and surface recoverable rides on Dashboard.
- 2026-05-25: Added manual pending-upload retry UI with visible success/failure messages for queued rides.
- 2026-05-25: Added `releases/Duke-Ride-latest.apk` so the app can be downloaded from GitHub onto other Android phones.
- 2026-05-25: Published official GitHub Release `v0.1.0` with `Duke-Ride-latest.apk` attached.
- 2026-06-19: Added Ride Detail story sharing with local Instagram Story image generation and dynamic ChatGPT prompt generation without OpenAI API billing.
- 2026-06-19: Rebuilt the Android release with the completed story feature, installed it successfully on Moto g34 5G (`ZA222K77F7`), and verified `com.example.dukeride` launched and remained running.
- 2026-06-19: Hardened app reliability across mobile, Express backend, and Cloudflare Worker. API responses, token storage, local ride recovery, background location tasks, pending uploads, Maps responses, charts, reports, diagnostics, profile photos, and ride photo import now guard malformed data and storage/network failures.
- 2026-06-19: Android release APK build succeeded and `releases/Duke-Ride-latest.apk` was refreshed. Phone install/launch could not run because ADB reported zero connected devices.
- 2026-06-19: Installed the refreshed release APK on connected Moto g34 5G (`ZA222K77F7`) and launched it successfully. Recent crash-filtered logcat output was clean.
- 2026-06-19: Replaced the APK asset attached to GitHub Release `v0.1.0`. Added GitHub Actions workflow `.github/workflows/release-android-apk.yml` so every push to `ktm-ride-mvp` builds the Android release APK and publishes it to the moving `latest` release. The workflow expects a repository secret named `GOOGLE_MAPS_API_KEY`.
- 2026-06-22: Rebranded the user-facing app to RidePulse while preserving package IDs, API URLs, deep links, and legacy `duke_ride_*` storage keys for upgrade safety.
- 2026-06-22: Replaced KTM-specific user-facing copy and visuals with a brand-neutral graphite and cyan system, including Graphite and OLED Black themes, a new More screen, a five-tab nav, a neutral RidePulse launcher name, and a new route-and-pulse icon asset.
- 2026-06-22: Compacted the mobile UI after on-device review: buttons, pills, cards, map overlays, and ride-detail actions were reduced in size, and the Android safe-area top crop was fixed in the shared screen wrapper.
- 2026-06-22: Built and installed the updated Android release on connected Moto g34 5G (`ZA222K77F7`) and verified the latest RidePulse home screen renders correctly on-device.
- 2026-06-25: Rebuilt RidePulse as a cinematic, route-led ride journal. Home now leads with the latest journey and derived highlights; History is presented as Journal; Ride has distinct cockpit/recording states and a confirmed finish flow; More is presented as You; authentication, navigation, analytics, reports, profile, and ride detail were visually refreshed.
- 2026-06-25: Added real GPS route artwork to ride cards through backward-compatible `routePreview` fields on `/api/rides` and `/api/dashboard`, sampled to at most 48 validated points. Dashboard also exposes previous-month and longest-ride metrics. Worker and Express fallback remain contract-compatible and no database migration is required.
- 2026-06-25: Added Manrope, Expo Linear Gradient, and Expo Haptics using Expo SDK 51-compatible versions. Mobile typecheck, backend ride-math tests, Worker dry-run, and Android release APK build all passed. On-device visual verification remains pending because ADB reported no connected devices.
- 2026-06-25: Migrated the production API target to the paid Render Starter service in Singapore. Render automatically deployed Git commit `3e85fdf`; `/health` confirmed the same commit, and a temporary production probe passed registration, login, and dashboard requests before its test account was removed.
- 2026-06-25: Configured the Express PostgreSQL pool for the Starter instance, retained the same Neon database and API contracts, clean-built an APK with the Render URL embedded, installed it on Moto g34 5G (`ZA222K77F7`), and launched it successfully. Final login with the rider's real credentials remains the immediate manual check.
- 2026-06-25: Implemented RidePulse V2 Smart Journal for the Render backend. Added additive Render endpoints `/api/journal` and `/api/rides/:id/intelligence`, optional smart ride metadata, backend tests for malformed GPS intelligence, premium mobile journal primitives, editorial Journal filters, smarter Home/You surfaces, Ride Detail route replay and chapter timeline, cockpit GPS confidence, and confirmed selected-ride deletion. Worker V2 parity is intentionally not part of this release because Render is now the active backend.

## Testing Checklist

- Login with a real account.
- Register a new rider and confirm empty form fields.
- Confirm dashboard says `Hi, <name>`.
- Confirm Profile shows account details and can add/change/remove the local profile photo.
- Confirm Ride Detail can save title/notes and mark reviewed.
- Confirm Ride Detail can delete the selected ride only after confirmation and returns to Journal.
- Confirm duplicate candidates appear in Ride Detail and require confirmation before delete.
- Confirm top speed does not jump from one isolated GPS spike during a ride.
- Manual ride test:
  - Start Ride.
  - Move a short distance.
  - Stop Ride.
  - Confirm History/Dashboard update.
- Auto ride test:
  - Enable Auto tracking before riding.
  - Grant background location permission.
  - Ride above the start threshold.
  - Stop for around 5 minutes.
  - Confirm ride appears in History/Dashboard.
- Offline/poor network test:
  - End an auto ride with no internet.
  - Reopen app with internet.
  - Confirm pending ride uploads.
- Map test:
  - Navigate tab route appears.
  - History ride map appears.
  - Tapping a History ride opens Ride Detail.
  - Ride Detail shows route map, stat cards, route summary, and speed chart.
- Ride Detail `Import ride photos` requests media permission and lists photos taken during the ride time window.
- Ride photos with location metadata show camera markers on the ride map.
- Full-screen map works and does not hide Google current-location controls.
- Ride Detail `Share story image` creates a 9:16 PNG and opens Instagram Stories when `EXPO_PUBLIC_INSTAGRAM_APP_ID` is configured, otherwise falls back cleanly.
- Ride Detail `AI story prompt` shows varied prompts, can regenerate styles, copy/share prompt text, and open ChatGPT.
- Analytics test:
  - Confirm Daily/Monthly/Yearly tabs load.
  - Confirm summary cards and charts use the latest ride buckets.

## Safety And Reliability Notes

- The rider should set destination/tracking before moving.
- Do not interact with the phone while riding.
- Mount the phone securely.
- Android background tracking reliability depends on location permission and battery optimization.
- For best field testing, allow location all the time and disable battery optimization for RidePulse.
- Paid Render Starter avoids free-tier sleeping; Neon can still have occasional database cold latency if the database scales to zero.

## Known Gaps / Future Ideas

- True Google Maps trip import is not implemented; the app only tracks rides through RidePulse.
- Imported ride photos are currently scanned/displayed from the local phone library and are not uploaded to the backend.
- Profile photos are local to the phone and are not uploaded to the backend.
- No password reset yet.
- No refresh-token flow yet.
- No push notifications yet.
- Auto tracking could later add a review screen for detected rides.
- Crash reporting such as Sentry/Firebase Crashlytics is not installed yet.
