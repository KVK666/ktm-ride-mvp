# Duke Ride App Context

Last updated: 2026-05-13

This file is the living context for the KTM Duke Ride MVP. Keep it updated whenever the app gains a meaningful feature, deployment change, setup change, or known limitation.

## Current Purpose

Duke Ride is a private React Native ride tracking app for a KTM Duke 250 Gen 3. It is meant to replace the core useful parts of KTM Connect for a small rider group: tracking rides, viewing route history, checking speed/distance analytics, and using Google Maps based navigation.

## Current Stack

- Mobile app: Expo React Native, Android-first.
- Backend: Node.js/Express API.
- Database: PostgreSQL, currently hosted on Neon.
- Backend hosting: Render web service.
- Maps: Google Maps SDK for Android plus Google Directions and Geocoding APIs.
- Authentication: Email/password with JWT.
- Main repo branch: `ktm-ride-mvp`.
- GitHub repo: `https://github.com/KVK666/ktm-ride-mvp`.
- Current online API base URL: `https://ktm-ride-mvp.onrender.com/api`.

Do not commit `.env` files, API keys, database passwords, or Neon connection strings.

## What The App Does Now

- Lets a rider register and log in with email/password.
- Shows the logged-in rider name on the dashboard.
- Shows a Profile tab with name, email, bike model, rider ID, logout, and auto tracking toggle.
- Shows a dark KTM-inspired orange/black UI.
- Shows an Android app icon based on `mobile/assets/app-logo.png`.
- Uses Google Maps in navigation, ride, and history views.
- Lets users search a destination and view route/directions in the Navigate tab.
- Shows a safety warning before navigation.
- Lets users manually start and stop ride tracking.
- Tracks GPS points, distance, duration, top speed, average speed, start/end time, and route path.
- Supports background location for ride tracking when permission is granted.
- Saves completed rides to the backend/PostgreSQL.
- Shows dashboard totals for today, month, year, total rides, best top speed, average speed, and recent rides.
- Shows ride history by period, with route maps and full-screen map viewing.
- Shows analytics charts for distance, duration, speed trends, and top speed comparison.
- Generates basic reports and can export reports as PDF.

## Automatic Ride Tracking

Auto tracking is implemented as an optional setting and is off by default.

- Toggle location: Ride tab and Profile tab.
- Manual Start/Stop remains available.
- Manual tracking takes priority so an auto ride is not created at the same time.
- Auto tracking uses background GPS and speed-based detection.
- Auto-start rule: speed above `15 km/h` for about `60 seconds` and at least `250 meters`.
- Auto-stop rule: speed below `5 km/h` for about `5 minutes`.
- Discard rule: auto rides under `2 minutes` or under `500 meters` are ignored.
- If upload fails, auto rides are queued locally and retried when the app opens/logs in.
- Auto tracking status labels: `Off`, `Watching`, `Auto ride in progress`, `Pending upload`.

Known limitation: auto tracking detects sustained movement, not the exact vehicle. It cannot perfectly know bike vs car.

## Important Files

- `mobile/src/screens/RideScreen.tsx`: manual ride UI plus auto tracking card.
- `mobile/src/services/autoRideTracking.ts`: auto tracking state machine, thresholds, background handling, pending queue.
- `mobile/src/services/locationTask.ts`: Expo background location task entrypoint.
- `mobile/src/services/rideUpload.ts`: ride upload and pending auto ride sync.
- `mobile/src/services/trackingKeys.ts`: local storage keys and background task name.
- `mobile/src/hooks/useAutoTracking.ts`: shared UI hook for Ride/Profile toggle state.
- `mobile/src/context/AuthContext.tsx`: auth bootstrap and pending ride sync after login.
- `mobile/src/api/client.ts`: API client, SecureStore token, mirrored background token.
- `backend/src/routes/rides.js`: ride create/list/detail/delete API.
- `backend/db/schema.sql`: users, rides, and ride_points schema.

## Local Development Notes

Mobile:

```powershell
cd "C:\Users\BBS001\Documents\New project\mobile"
npm run typecheck
npm run android
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

Production backend health check:

```text
https://ktm-ride-mvp.onrender.com/health
```

## Testing Checklist

- Login with a real account.
- Register a new rider and confirm empty form fields.
- Confirm dashboard says `Hi, <name>`.
- Confirm Profile shows account details.
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
  - Full-screen map works and does not hide Google current-location controls.

## Safety And Reliability Notes

- The rider should set destination/tracking before moving.
- Do not interact with the phone while riding.
- Mount the phone securely.
- Android background tracking reliability depends on location permission and battery optimization.
- For best field testing, allow location all the time and disable battery optimization for Duke Ride.
- Render free tier may sleep after inactivity, so the first backend request can be slow.

## Known Gaps / Future Ideas

- True Google Maps trip import is not implemented; the app only tracks rides through Duke Ride.
- No password reset yet.
- No refresh-token flow yet.
- No push notifications yet.
- Auto tracking could later add a review screen for detected rides.
- Crash reporting such as Sentry/Firebase Crashlytics is not installed yet.
