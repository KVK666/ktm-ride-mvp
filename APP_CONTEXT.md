# Duke Ride App Context

Last updated: 2026-05-22

This file is the living context for the KTM Duke Ride MVP. Keep it updated whenever the app gains a meaningful feature, deployment change, setup change, or known limitation.

## Current Purpose

Duke Ride is a private React Native ride tracking app for a KTM Duke 250 Gen 3. It is meant to replace the core useful parts of KTM Connect for a small rider group: tracking rides, viewing route history, checking speed/distance analytics, and using Google Maps based navigation.

## Current Stack

- Mobile app: Expo React Native, Android-first.
- Backend: Cloudflare Workers API is the current working mobile target; Render Express API remains a fallback.
- Database: PostgreSQL, currently hosted on Neon.
- Backend hosting: Cloudflare Workers currently working; Render remains available as fallback.
- Maps: Google Maps SDK for Android plus Google Directions and Geocoding APIs.
- Authentication: Email/password with JWT.
- Main repo branch: `ktm-ride-mvp`.
- GitHub repo: `https://github.com/KVK666/ktm-ride-mvp`.
- Current working mobile API base URL: `https://duke-ride-api.dukeride-kvk.workers.dev/api`.
- Render fallback API base URL: `https://ktm-ride-mvp.onrender.com/api`.
- Worker API URL: `https://duke-ride-api.dukeride-kvk.workers.dev/api`.

Do not commit `.env` files, API keys, database passwords, or Neon connection strings.

## What The App Does Now

- Lets a rider register and log in with email/password.
- Shows the logged-in rider name on the dashboard.
- Shows a Profile tab with local profile photo, name, email, bike model, rider ID, diagnostics, logout, and auto tracking toggle.
- Supports two persisted app themes from Profile: KTM orange/black and a neutral Universal dark blue scheme.
- UI uses a modernized dark cockpit style with tighter cards, clearer stat hierarchy, compact nav chrome, and the Duke Ride logo on login.
- Shows an Android app icon based on `mobile/assets/app-logo.png`.
- Uses Google Maps in navigation, ride, and history views.
- Lets users search a destination and view route/directions in the Navigate tab.
- Shows a safety warning before navigation.
- Lets users manually start and stop ride tracking.
- Manual ride tracking is crash-resilient: active ride start time and GPS points are continuously persisted locally and recovered after app restart.
- If a manual ride save/upload fails, the ride is kept in the local pending upload queue instead of being lost.
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
- Ride Detail can import phone camera photos taken during the ride window and display them as photo stops.
- Imported ride photos with GPS metadata appear as camera markers on the ride map.
- Shows analytics summary cards and charts for distance, ride count, duration, and top speed.
- Generates basic reports and can export reports as PDF.
- Provides a Cloudflare Worker API with the same mobile `/api/*` contract as the Express backend, and the installed app is currently pointed at the Worker.

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
- `mobile/src/screens/AnalyticsScreen.tsx`: analytics summaries and charts.
- `mobile/src/screens/ProfileScreen.tsx`: profile, local profile photo, diagnostics, and auto tracking toggle.
- `mobile/src/theme/ThemeContext.tsx`: persisted app theme mode and shared runtime palette.
- `mobile/src/theme/colors.ts`: KTM and Universal color palettes.
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
- `backend/scripts/removeDuplicateRidesViaApi.js`: one-off duplicate ride cleanup through the live Worker API, useful when direct Neon connection details are confusing.

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
https://duke-ride-api.dukeride-kvk.workers.dev/health
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
- 2026-05-22: Added Profile theme selector with persisted KTM and Universal app color schemes.
- 2026-05-25: Hardened long-ride reliability. Manual rides now persist active points continuously, recover after app restart, queue failed uploads locally, compact map rendering for long routes, and surface recoverable rides on Dashboard.

## Testing Checklist

- Login with a real account.
- Register a new rider and confirm empty form fields.
- Confirm dashboard says `Hi, <name>`.
- Confirm Profile shows account details and can add/change/remove the local profile photo.
- Confirm Ride Detail can save title/notes and mark reviewed.
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
- Analytics test:
  - Confirm Daily/Monthly/Yearly tabs load.
  - Confirm summary cards and charts use the latest ride buckets.

## Safety And Reliability Notes

- The rider should set destination/tracking before moving.
- Do not interact with the phone while riding.
- Mount the phone securely.
- Android background tracking reliability depends on location permission and battery optimization.
- For best field testing, allow location all the time and disable battery optimization for Duke Ride.
- Cloudflare Workers avoids the Render free-tier sleeping issue; Neon can still have occasional database cold latency.

## Known Gaps / Future Ideas

- True Google Maps trip import is not implemented; the app only tracks rides through Duke Ride.
- Imported ride photos are currently scanned/displayed from the local phone library and are not uploaded to the backend.
- Profile photos are local to the phone and are not uploaded to the backend.
- No password reset yet.
- No refresh-token flow yet.
- No push notifications yet.
- Auto tracking could later add a review screen for detected rides.
- Crash reporting such as Sentry/Firebase Crashlytics is not installed yet.
