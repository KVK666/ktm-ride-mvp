# RidePulse App Context

Last updated: 2026-08-23

This file is the living context for the RidePulse app. Keep it updated whenever the app gains a meaningful feature, UX change, deployment change, setup change, or known limitation. Treat `APP_CONTEXT.md` as part of the definition of done for user-facing changes.

## Current Purpose

RidePulse is a private React Native ride tracking app for a small rider group across any motorcycle brand. It focuses on the core useful parts riders actually need: tracking rides, viewing route history, checking speed and distance analytics, using Google Maps based navigation, and exporting ride reports.

## Current Stack

- Mobile app: Expo React Native, Android-first.
- Web app: Angular standalone app in `web/`, with a cinematic public website and authenticated companion dashboard.
- Backend: Render Java Spring Boot API in `backend-java/` is the only backend implementation.
- Database: PostgreSQL, currently hosted on Neon; AWS RDS cutover is supported with `DB_SCHEMA` when using a custom schema.
- Backend hosting: Render Starter in Singapore, currently backed by Neon PostgreSQL.
- OTA updates: Expo EAS Update / `expo-updates` on the `production` channel for JS and bundled asset updates after an OTA-enabled APK is installed.
- Current Android app/runtime version: `0.1.7` with Android version code `8`; JavaScript-only UI updates can ship to this runtime through the production OTA channel without clearing rider data.
- Maps: Google Maps SDK for Android plus Google Directions and Geocoding APIs.
- Authentication: Email/password with JWT and Render-backed email password reset.
- Main repo branch: `ride-pulse`.
- GitHub repo: `https://github.com/KVK666/ride-pulse`.
- Downloadable Android APK: `releases/RidePulse-latest.apk` in the GitHub repo when refreshed, though legacy asset names may still exist during migration.
- Official GitHub Release APK: `https://github.com/KVK666/ride-pulse/releases/tag/v0.1.0`.
- Automatic latest APK release: `https://github.com/KVK666/ride-pulse/releases/tag/latest`.
- Current production mobile API base URL: `https://ktm-ride-mvp-java.onrender.com/api`.
- Current production web API base URL: `https://ktm-ride-mvp-java.onrender.com/api`.

Important compatibility rule: keep package IDs, deep links, API URLs, and legacy storage keys such as `duke_ride_*` stable unless a migration is explicitly planned and tested.

Do not commit `.env` files, API keys, database passwords, or Neon/AWS database connection strings.

## What The App Does Now

- Lets a rider register and log in with email/password.
- Lets a rider request a password reset from mobile or web; email links open the web reset page and update the password through the Java API.
- Shows the logged-in rider name on the dashboard.
- Uses a job-based Android navigation model: Home, Plan, a central Ride cockpit, Journal, and Insights. The rider avatar opens Account and device-only settings.
- Uses the matching web information architecture—Home, Plan, Journal, Insights, and Account—while keeping GPS recording, tracking permissions, diagnostics, and OTA controls Android-only.
- Account shows the backend-synced display photo, editable name and bike model, immutable email/rider ID, appearance, photo privacy, support, and logout.
- Shows an App updates card in Profile so riders can manually check for, download, and restart into available OTA updates.
- Supports two persisted cinematic themes shown as Midnight and True Black, while retaining the `graphite`/`oled` storage values and legacy `ktm`/`universal` migration.
- UI uses the premium RidePulse journal system: near-black surfaces, warm white Manrope typography, restrained electric-lime accents, route artwork, softer elevation, and a floating bottom nav.
- Shows an Android app icon based on `mobile/assets/ridepulse-logo.png`, aligned with the in-app lime/black RidePulse identity.
- Uses Google Maps in navigation, ride, and history views.
- Lets users search a destination and preview a route in Plan, then hand live guidance to Google Maps. Route preview uses a bounded foreground location fix instead of keeping a GPS watcher active.
- Lets riders save owner-private Home, Office, and custom locations from mobile or web with an adjustable 50-1,000 metre matching radius. Saved places appear as one-tap destinations in both route planners.
- Shows a safety warning before navigation.
- Lets users manually start and stop ride tracking.
- Manual ride tracking is crash-resilient: active ride start time and GPS points are continuously persisted locally and recovered after app restart.
- Manual rides automatically stop after reported or inferred movement stays at or below `5 km/h` for about `5 minutes`. The saved ride ends at its last moving point so the parked confirmation tail does not inflate duration or the photo window.
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
- Journal ride search is server-backed on mobile and web, matching manual/AI titles, summaries, ride kind, source activity, notes, insights, and endpoint labels while preserving legacy period filters. Mobile adds explicit year and month calendar filters; new clients use cursor pagination, review filters, and newest/longest/fastest sorting.
- Journal includes a conservative Cleanup queue on mobile and web for unreviewed recordings with near-zero movement. RidePulse explains why each ride was flagged; riders explicitly keep it by marking it reviewed or remove it through the existing confirmed delete control. No ride is auto-deleted.
- Adds manual Trip Albums inside Journal: riders can create and edit trip folders, add existing rides individually or in an idempotent batch, remove rides without deleting them, see current membership, and browse trip detail on Android and web.
- Trips includes a three-step Google Timeline flow for the verified `semanticSegments` JSON format: choose a file, immediately review an automatically grouped summary, and add the rides. Android keeps a private device-only backup and defaults qualifying `MOTORCYCLING` and `IN_PASSENGER_VEHICLE` activities to selected. Detailed activity/year/month selection, route previews, and Trip editing stay behind optional Customize controls. During the resumable import, the backend validates each batch, reuses exact matches, skips probable overlaps, and creates enabled date albums only after their rides resolve.
- Timeline backup management shows file size, coverage dates, route/date counts, and the last import result. Removing the RidePulse copy never removes the original Downloads file. The raw JSON, `rawSignals`, `userLocationProfile`, place IDs, and unapproved activities are never sent to the backend.
- Trip lists are incremental/virtualized on Android and web so hundreds of date albums remain responsive; web Trips also has title/date/place search.
- Adds backend-owned AI ride intelligence with deterministic fallback: saved rides receive destination-aware titles, summaries, classification, key insight, best moment, and trip automation suggestions without blocking ride save. Saved places are matched first; otherwise a server-only Google Places lookup uses only the endpoint coordinate to recognise destinations such as coffee shops. Manual titles remain authoritative, and eligible older generic rides refresh once when opened.
- Opens a focused Ride Detail screen from History with the useful ride story, key stats, route map/summary, notes/review, sharing/trip actions, album, and confirmed cleanup controls.
- Ride Detail no longer exposes internal-looking ride confidence, AI status/date, GPS sample counts, empty duplicate state, generated chapter list, or the extra speed chart in the primary mobile/web flow. Those removals keep the page centred on the rider's memory rather than model diagnostics.
- Ride Detail and Timeline candidate preview share a full-screen Google Maps route replay for any ride with usable coordinates, including existing RidePulse rides. It shows traveled/untraveled trace, start/end/current markers, play/pause, scrubber, actual/elapsed time, `0.5x`/`1x`/`2x`, and source-aware facts. Timeline traces and derived speeds are explicitly approximate, and unavailable peak speed is never rendered as zero.
- Ride Detail has a Ride Review section for ride title, notes, reviewed status, and confirmed duplicate cleanup.
- Ride Detail has a confirmed delete option for the selected ride, intended for test rides, unwanted rides, or duplicates that should be fully removed with their route points.
- Ride Detail can import phone camera photos taken during the ride window and display them as photo stops.
- Imported ride photos with GPS metadata appear as camera markers on the ride map.
- Ride Detail has a private account-synced Ride Album: users can find photos from the ride window, manually add gallery photos, see local/syncing/synced/failed state, restore album copies on another device, and open a full-screen slideshow/reel. Removing a RidePulse album copy never deletes the original gallery photo.
- Ride Detail can create a local 9:16 ride story image using the intelligent display title and open the native all-app share sheet without using OpenAI API billing or showing a post-share status line.
- Ride Detail can generate varied ChatGPT image prompts from exact ride stats, time/place mood, and optional Open-Meteo weather; prompts are copied/shared manually into ChatGPT.
- Adds Rider Pulse analytics on mobile and web: per-user monthly distance targets, calendar-month progress and projection, contextual coaching, rolling 30-day distance/ride/active-day summaries, ride-day streaks, previous-period trend, longest and average ride benchmarks, favourite weekday/time, review completion, cleanup attention, and the existing daily/monthly/yearly charts.
- Rider Pulse calendar and habit metrics use the device/browser IANA timezone while rolling 30-day comparisons remain instant-based. Invalid or missing timezone input falls back safely to UTC.
- Monthly targets persist on the authenticated account through `/api/profile/preferences` with a 10-5,000 km validation range and legacy local fallback, so Android and web show the same goal.
- Mobile screens apply one safe-area inset plus measured floating-tab clearance; fixed Ride actions remain fully visible and tappable above the bottom panel.
- Generates basic reports and can export reports as PDF.
- Adds a V2 Smart Journal layer on top of existing ride data: `/api/journal` returns latest ride, monthly recap, highlights, recent rides, and review count; `/api/rides/:id/intelligence` returns suggested title, summary text, badges, fastest/route chapter data, and safe fallbacks for malformed or missing GPS points.
- Adds a V5 Home layer through `/api/home`, a compact Render endpoint that keeps `/api/journal` compatible while adding Home-specific memory seeds and pending review suggestions.
- Home, Journal, Ride Detail, Ride, Insights, and Account use premium smart-journal primitives with clearer action hierarchy, compact cards, intentional empty/error/offline states, and restrained route artwork.
- Home now includes local Google Photos-style Memories cards built from ride albums, route-art fallbacks, monthly recap memories, and review prompts.
- Fresh installs show a cinematic walkthrough before authentication, persisted with `duke_ride_onboarding_seen_v1`; Account can replay the walkthrough later.
- User display photos sync through `/api/profile/photo`; private ride albums sync through owner-scoped ride-photo endpoints with metadata-first and individual binary loading. Local caches remain for speed and offline fallback.
- OTA updates are enabled for JavaScript and bundled assets through EAS Update. Native changes such as app icon, permissions, package ID, native dependencies, Google Maps setup, or Android manifest changes still require installing a new APK.
- Timeline import adds native `expo-document-picker` and `expo-crypto` dependencies, so this release requires a newly built APK rather than an OTA-only update.
- Adds an Angular web companion in `web/` using the same graphite/OLED and electric-lime identity. Its protected experience groups Home, Plan, Journal (Rides/Trips/Memories), Insights (Rider Pulse/Reports), Account, rich Ride Detail, profile editing, saved-place planning, and private synced albums behind a responsive sidebar/mobile shell with accessible focus and loading states.
- Web ride recording is intentionally out of scope; the website directs riders to the Android app for GPS/background tracking, ride recovery, auto tracking, and OTA update workflows. Web foreground geolocation is used only for route planning.
- Password reset uses the Java API plus SMTP environment variables.

## Automatic Ride Tracking

Auto tracking is implemented as an optional setting and is off by default.

- Toggle location: Ride and Account > Ride & Tracking.
- Manual Start/Stop remains available.
- Manual tracking takes priority so an auto ride is not created at the same time.
- On Android, auto tracking arms activity recognition first so enabled auto tracking does not immediately start high-accuracy GPS or the persistent RidePulse foreground location notification.
- When activity recognition reports vehicle-like movement, RidePulse starts a short high-accuracy GPS probe and then uses both reported speed and inferred speed from GPS distance/time to confirm the ride.
- Motion callbacks use one foreground-or-headless delivery path, are serialized/deduplicated in JavaScript, and do not restart a GPS probe that is already running. The Android receiver also preserves the activity-recognition foreground-service launch exemption until the headless handler registers Expo Location, avoiding the background-start rejection captured in Profile diagnostics.
- If activity recognition is unavailable or permission is denied, auto tracking falls back to lower-power background location with clear status copy.
- Profile can run a tracking-readiness check across location permissions, phone location services, and Android motion detection. Diagnostic entries expand to show and copy their underlying error details.
- Auto-start rule: sustained movement around `8 km/h` or clear GPS movement for about `30 seconds` and at least `100 meters`.
- Auto-start tolerates short bad/zero-speed GPS samples for about `75 seconds`.
- GPS probe timeout: movement checks stop after about `3 minutes` if the auto-start rule is not met.
- Auto-stop rule: speed below `5 km/h` for about `5 minutes`.
- Discard rule: auto rides under `2 minutes` or under `500 meters` are ignored.
- If upload fails, auto rides are queued locally and retried when the app opens/logs in.
- Pending auto ride sync is deduplicated and guarded so repeated retries do not submit the same ride multiple times.
- Auto tracking status labels: `Off`, `Armed`, `Checking movement`, `Auto ride in progress`, `Pending upload`.

Known limitation: auto tracking detects vehicle-like movement and sustained GPS movement, not the exact vehicle. It cannot perfectly know bike vs car.

## Important Files

- `mobile/src/screens/RideScreen.tsx`: manual ride UI plus auto tracking card.
- `mobile/src/services/manualRideSession.ts`: crash-resilient local manual ride session storage, recovery, and map point compaction.
- `mobile/src/screens/RideDetailScreen.tsx`: dedicated ride detail view opened from History, with ride review and duplicate cleanup.
- `mobile/src/screens/TripsScreen.tsx` and `mobile/src/screens/TripDetailScreen.tsx`: manual Trip Albums list/detail UI.
- `mobile/src/screens/SavedPlacesScreen.tsx`: Home, Office, and custom-place capture, radius selection, update, and removal UI.
- `mobile/src/components/RideStoryCard.tsx`: local 9:16 ride story image layout rendered for capture/share.
- `mobile/src/services/rideStoryPrompt.ts`: dynamic ChatGPT image prompt variants and optional Open-Meteo weather mood lookup.
- `mobile/src/services/rideStoryShare.ts`: native all-app share-sheet handoff for generated story images.
- `mobile/plugins/withActivityRecognitionAndroid.js`: Expo config plugin that preserves Android activity-recognition permission, native receiver/service, Gradle dependency, and React package registration across prebuild.
- `mobile/src/screens/AnalyticsScreen.tsx`: Rider Pulse goal, coaching, habit/performance insights, resilient states, and analytics charts.
- `mobile/src/services/riderGoal.ts`: validated account-synced monthly distance goal persistence with a legacy local/offline fallback.
- `mobile/src/screens/ProfileScreen.tsx`: profile, backend display photo, diagnostics, and auto tracking toggle.
- `mobile/eas.json`: EAS build/update channels. Production builds and OTA updates use the `production` channel.
- `mobile/app.config.js`: Expo config including Android identity, plugins, EAS project ID, runtime version, and OTA update URL.
- `mobile/src/screens/ProfileScreen.tsx`: profile, backend display photo, diagnostics, app update checker, and auto tracking toggle.
- `mobile/src/theme/ThemeContext.tsx`: persisted app theme mode and legacy theme migration.
- `mobile/src/theme/colors.ts`: Midnight and True Black palette values plus shared typography, layout, and motion tokens.
- `mobile/src/components/RouteArtwork.tsx`: lightweight SVG route artwork for Home, Journal, memories, onboarding, and slideshow surfaces.
- `mobile/src/components/JournalHero.tsx`, `SmartHighlight.tsx`, `RideBadge.tsx`, `RouteReplay.tsx`, `ChapterTimeline.tsx`, `PremiumEmptyState.tsx`, and `InlineSkeleton.tsx`: Smart Journal V2 primitives.
- `mobile/src/components/MemoryCard.tsx`, `RideSlideshowModal.tsx`, and `OnboardingScreen.tsx`: local memories, album slideshow, and first-install walkthrough UI.
- `backend-java/src/main/java/com/ridepulse/api/service/RoutePreviewService.java`: bounded route-preview loader used by the Java API.
- `backend-java/src/main/java/com/ridepulse/api/service/PasswordResetService.java`: hashed one-time reset token creation, SMTP reset email delivery, and password update validation.
- `backend-java/src/main/java/com/ridepulse/api/service/JournalIntelligenceService.java`: derived smart-journal summaries, badges, highlights, route chapters, and fallback-safe ride intelligence.
- `backend-java/src/main/java/com/ridepulse/api/service/RideAiIntelligenceService.java`: backend-only AI/fallback ride naming, classification, insight, best moment, trip automation with user-owned trip safety checks, and non-secret provider observability through Render logs plus `/health`.
- `backend-java/src/main/java/com/ridepulse/api/service/DestinationPlaceService.java`: privacy-bounded Google Places/Geocoding endpoint resolver with category normalization and safe fallbacks.
- `backend-java/src/main/java/com/ridepulse/api/service/SavedPlaceService.java`: validation and owner-scoped CRUD for routine locations; matching is consumed only by authenticated ride intelligence.
- `web/src/app/features/companion/saved-places-page.component.ts`: responsive Saved Places management for the Angular companion.
- `backend-java/src/main/java/com/ridepulse/api/service/AnalyticsService.java`: owner-scoped Rider Pulse aggregation, rolling windows, rider-local calendar/habit metrics, and safe empty/malformed handling.
- `web/src/app/features/companion/analytics-page.component.ts`: responsive Rider Pulse goal, coaching, insight groups, resilient history charts, and accessible controls.
- `mobile/src/services/rideAlbums.ts`: local album cache, bounded photo processing, private backend hydration/upload, sync states, gallery/ride-window import, and Home memory generation.
- `mobile/src/services/onboarding.ts`: walkthrough completion storage.
- `mobile/src/services/profilePhoto.ts`: per-user profile photo picker, local cache, backend upload/download/delete sync.
- `mobile/src/components/ProfileAvatar.tsx`: shared backend-backed avatar display used by Home, You, and Profile surfaces.
- The Home journal header blends the signed-in rider photo edge-to-edge into the dark screen with side/bottom gradients and an overlaid journal greeting, while retaining a safe initials fallback and tap-through navigation to Profile.
- `mobile/src/services/ridePhotos.ts`: scans the phone photo library for photos created between ride start/end times.
- `mobile/src/services/autoRideTracking.ts`: motion-first auto tracking state machine, thresholds, background handling, pending queue.
- `mobile/src/services/activityRecognition.ts` and `activityRecognitionTask.ts`: Android native activity-recognition bridge and Headless JS task for motion-first ride wakeups.
- `mobile/src/services/locationTask.ts`: Expo background location task entrypoint.
- `mobile/src/services/rideUpload.ts`: ride upload and pending auto ride sync.
- `mobile/src/services/googleTimelineParser.ts`: strict `semanticSegments` validation, qualifying activity extraction, timestamp-bounded route reconstruction, stable grouping inputs, and conservative derived-speed gates.
- `mobile/src/services/googleTimelineBackup.ts` and `googleTimelineImport.ts`: private backup metadata, SHA-256 identity, automatic duplicate/overlap handling, and resumable normalized batch upload.
- `mobile/src/components/RouteVisualizer.tsx` and `mobile/src/utils/routeReplay.ts`: shared Google Maps replay UI and timestamp interpolation for recorded and imported rides.
- `mobile/src/services/trackingKeys.ts`: local storage keys and background task name.
- `mobile/src/hooks/useAutoTracking.ts`: shared UI hook for Ride/Profile toggle state.
- `mobile/src/context/AuthContext.tsx`: auth bootstrap and pending ride sync after login.
- `mobile/src/api/client.ts`: API client, SecureStore token, mirrored background token.
- `scripts/install-android-release.ps1`: release installer that prebuilds native Android config before Gradle so app icon and OTA metadata stay in sync.
- `backend-java/src/main/java/com/ridepulse/api/controller/RidesController.java`: ride create/list/detail/delete, paginated search, private photos, and ride-trip membership API.
- `backend-java/src/main/java/com/ridepulse/api/controller/TripsController.java`: authenticated manual Trip Albums API with idempotent single/batch ride membership.
- `backend-java/src/main/java/com/ridepulse/api/controller/GoogleTimelineImportController.java` and `service/GoogleTimelineImportService.java`: owner-scoped validation, duplicate/overlap checks, idempotent imported ride batches, and stable Trip creation.
- `backend-java/src/main/java/com/ridepulse/api/controller/ProfileController.java`: authenticated identity, monthly-goal preferences, and profile-photo API.
- `backend-java/src/main/java/com/ridepulse/api/controller/JournalController.java`: Home and Journal API surfaces.
- `backend-java/src/main/java/com/ridepulse/api/service/PhotoValidationService.java`: profile-photo and ride-photo MIME/base64/size validation.
- `backend-java/src/main/resources/db-queries.properties`: SQL, schema bootstrap statements, and `.pojo` mapping keys.
- `scripts/migrate-neon-to-aws.ps1`: guarded pg_dump/pg_restore helper for moving existing Neon `public` RidePulse data into an AWS PostgreSQL schema such as `ridepulse_db`.

## Local Development Notes

Mobile:

```powershell
cd "C:\Users\BBS001\Documents\New project\mobile"
npm test
npm run typecheck
npm run android
npm run android:install:release
npm run ota:publish -- --message "Describe the update"
```

OTA updates:

```powershell
cd "C:\Users\BBS001\Documents\New project\mobile"
npm run ota:publish -- --message "Describe the update"
```

OTA can update JavaScript and bundled assets only. If a change touches native Android files, permissions, app icon/splash, native dependencies, package ID, runtime version, or Expo config that affects native generation, build and install a new APK instead.

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
cd "C:\Users\BBS001\Documents\New project\backend-java"
$env:DATABASE_URL="postgres://ktm:ktm@localhost:5432/ktm_ride"
$env:JWT_SECRET="local-dev-secret"
& "C:\ProgramData\chocolatey\lib\maven\apache-maven-3.9.16\bin\mvn.cmd" spring-boot:run
```

Current production backend health check:

```text
https://ktm-ride-mvp-java.onrender.com/health
```

## Latest Fix Notes

- 2026-08-29: Repaired Timeline Trip creation on copied production schemas where `trips.id` had lost its UUID default and `trip_rides` had lost `(trip_id, ride_id)` uniqueness. Startup now restores Trip and Trip-membership defaults plus the unique membership index; normal and imported Trip inserts also generate IDs explicitly. Resumable imports can therefore reuse albums and memberships safely.
- 2026-08-23: Added review-first Google Timeline import and shared ride replay, then simplified the import to a three-step default path with a persistent primary action and optional advanced customization. Saved pre-release analyses are transparently refreshed from the private raw backup before import. The supplied 32.2 MB export yields 3,318 qualifying vehicle rides and 731 enabled multi-ride date albums; raw Timeline data remains device-only. Journal now supports server-backed year/month selection, and Android/web Trip lists handle the larger album volume incrementally. Android/runtime is `0.1.7` (version code `8`) so older APKs cannot receive incompatible native-module OTA updates.
- 2026-08-29: Removed the blocking network pre-check from Timeline Review. Review now opens immediately from the private on-device analysis with automatic date grouping; the final import performs batched server validation, exact deduplication, probable-overlap skipping, and resumable ride/Trip creation. Backend overlap inspection now uses at most two owner-scoped batch reads instead of per-ride queries. Timeline batches use the full 50-ride limit, a dedicated 60-second timeout, automatic transient retries, and per-batch checkpoints. Timeline import and ride deletion confirmations now use the themed RidePulse modal instead of native Android alerts.
- 2026-07-03: Prepared the Neon-to-AWS PostgreSQL migration path. Java database config now supports `DB_SCHEMA`/JDBC `currentSchema` for custom schemas such as `ridepulse_db,public`, Render has an optional dashboard-managed `DB_SCHEMA` variable, and `scripts/migrate-neon-to-aws.ps1` can dump Neon data and restore/move app tables into AWS without committing connection strings. Production is not marked cut over until the script is run, Render `DATABASE_URL` is changed to AWS, and smoke tests pass.
- 2026-07-02: Renamed the GitHub repository and main branch references to `ride-pulse`. Updated the local `origin` URL, APK release workflow trigger branch, Render/web APK download links, and current project context; kept production API/service URLs and package IDs stable.
- 2026-07-02: Fixed web CORS failures on authenticated Java API calls by allowing browser `OPTIONS` preflight requests to bypass JWT token validation while keeping real `/api/*` requests protected.
- 2026-07-02: Hotfixed mobile and web clients to unwrap the Java API standard response wrapper (`data`) while still accepting the old Node response shape. Published EAS production OTA update group `53510c9a-57a8-435e-a859-5ed3d095a885` from commit `ef944f7` so login/register/API calls work against Java.
- 2026-07-02: Removed legacy Node Express and Cloudflare Worker backend code from the repo; `backend-java/` is now the only backend implementation.
- 2026-07-02: Cut mobile and web production configuration over to the Java Spring Boot backend at `https://ktm-ride-mvp-java.onrender.com/api`. Published EAS production OTA update group `661624ee-e83b-4287-b3ef-ab31d25af376` from commit `ed8068b` so OTA-enabled installs receive the Java API URL.
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
- 2026-06-27: Enabled Expo EAS Update with project ID `72bc39ae-7012-4f29-8012-13113b7ea8fc`, production update URL `https://u.expo.dev/72bc39ae-7012-4f29-8012-13113b7ea8fc`, runtime version policy `appVersion`, and a Profile app-update card. Published the clean-commit `production` update group `2a72e9f9-237f-4a22-a776-a7bd47bbb5ea`.
- 2026-06-27: Rebuilt the OTA-enabled Android release APK, refreshed `releases/Duke-Ride-latest.apk`, installed it on connected Moto g34 5G (`ZA222K77F7`), and launched it successfully. Future JS/assets-only updates can be delivered OTA; native changes still require an APK.
- 2026-07-12: Renamed the tracked and published latest Android APK to `RidePulse-latest.apk`; the release workflow also removes the obsolete `Duke-Ride-latest.apk` asset after publishing.
- 2026-07-13: Fixed auto tracking failures observed in Profile diagnostics. Background motion handling now preserves Android's activity-recognition foreground-service launch exemption so Expo Location can start the GPS probe; foreground motion events no longer also launch a headless task, JS handling is serialized/deduplicated, and an active probe is updated without restart churn. Added tracking-readiness checks plus expandable/copyable diagnostic details, and bumped Android/runtime to `0.1.2` (version code `3`) for the native fix.
- 2026-06-25: Configured the Express PostgreSQL pool for the Starter instance, retained the same Neon database and API contracts, clean-built an APK with the Render URL embedded, installed it on Moto g34 5G (`ZA222K77F7`), and launched it successfully. Final login with the rider's real credentials remains the immediate manual check.
- 2026-06-25: Implemented RidePulse V2 Smart Journal for the Render backend. Added additive Render endpoints `/api/journal` and `/api/rides/:id/intelligence`, optional smart ride metadata, backend tests for malformed GPS intelligence, premium mobile journal primitives, editorial Journal filters, smarter Home/You surfaces, Ride Detail route replay and chapter timeline, cockpit GPS confidence, and confirmed selected-ride deletion. Worker V2 parity is intentionally not part of this release because Render is now the active backend.
- 2026-06-26: Implemented RidePulse V3 local Memories. Added first-install walkthrough, local ride albums with copied photo storage, manual gallery import, ride-window import into persistent albums, album photo removal, full-screen slideshow/reel, Home Memories carousel, and walkthrough replay from You. No backend photo storage or database migration was added.
- 2026-06-27: Implemented RidePulse V4 brand/profile polish. Recolored launcher/splash assets from sky-blue to the lime-led app identity, added backend-synced user display photos on Render/Postgres, added `/api/profile/photo`, and showed the same avatar across Home, You, and Profile. Ride album photos remain local-only.
- 2026-06-27: Implemented RidePulse V5 premium UX polish. Added `/api/home`, smarter Home memories, pending review continuation, saved Journal filter state, reduced-motion-aware Journal animation, stronger ride/profile/photo haptics, slideshow control polish, and richer Ride Detail album/story cues.
- 2026-06-27: Added the Angular web companion in `web/`. It includes the premium public landing page, Three.js route hero, Manrope/RidePulse theme tokens, login/register, authenticated Home/Journal/Ride Detail/Analytics/Reports/Profile pages, API fallback-capable client code, and production/local environment configuration. Follow-up polish removed reference-name copy, fixed the hero scroll gap, switched local web defaults to the live Render API to keep browser Network output clean, loaded profile photos via authenticated JSON, locked companion navigation during scroll, and replaced primary loading text with branded RidePulse loading animation.
- 2026-06-27: Expanded web toward full non-recording companion parity. Added Google Maps web configuration/fallbacks, Navigate and You pages, rich Ride Detail review/duplicates/delete/map/chart/story/photo surfaces, web profile photo add/remove, reports export, synced ride album backend endpoints/table, mobile album upload sync, and a Render Static Site blueprint for `ridepulse-web`.
- 2026-06-27: Polished RidePulse web UI reliability. Replaced Angular default tab metadata with cache-busted RidePulse icon links, constrained route artwork to prevent card clipping, improved companion responsive spacing/chart overflow, hardened Google Maps web load diagnostics, and documented `WEB_GOOGLE_MAPS_API_KEY` Render/Google Cloud requirements.
- 2026-06-27: Switched the Angular web companion to hash routing so authenticated pages like `/#/app/home` and `/#/app/journal` survive browser refreshes even on static hosts that do not rewrite deep links correctly.
- 2026-06-27: Hardened the web Google Maps loader with the supported async callback flow and `gm_authFailure` handling so browser-key, referrer, billing, or API authorization failures show actionable RidePulse errors.
- 2026-06-27: Fixed deployed web Google route maps for ride points returned as numeric strings by converting coordinates to numbers before constructing Google Maps paths and photo markers.
- 2026-06-29: Added Render-backed forgot-password support. Mobile and web can request reset links, the Angular web companion exposes `/#/reset-password`, the backend stores only hashed one-time tokens with 30-minute expiry, and SMTP is configured through environment variables.
- 2026-06-29: Published the forgot-password mobile UI through EAS Update on the `production` branch for runtime `0.1.0`. Update group `572d8d60-757d-4fff-9e8c-ff2a946f39e8` points at commit `c1b22af`.
- 2026-06-29: Fixed locally built Android APK OTA checks by embedding the required `expo-channel-name: production` request header in native Expo Updates metadata. Without that header, EAS returned `"channel-name": Required` even with the correct update URL.
- 2026-07-02: Added manual Trip Albums and server-backed ride search. Java now exposes `/api/trips` plus optional `/api/rides?q=...`, mobile adds Trip Albums screens and Ride Detail add-to-trip flow, and the Angular companion adds Trips pages plus Journal search.
- 2026-07-05: Added AI Ride Intelligence on the Java backend. Rides save immediately, then backend-only AI/fallback enrichment adds human titles, summaries, ride kind confidence/reasons, key insight, best moment, and trip automation state. Mobile Ride Detail now uses an AI Insight Hero instead of decorative route art; web/mobile Journal and Trip surfaces prefer human AI titles over raw start/end labels. AI provider keys stay server-side through environment variables.
- 2026-07-05: Improved the AI ride experience after provider setup. Pending AI now refreshes into mobile/web Ride Detail automatically, fallback intelligence suggests trip albums for obvious long rides, AI auto-add only targets user-owned trips, the mobile trip modal surfaces one-tap AI trip suggestions, and story prompts prefer AI titles/insights over noisy map labels.
- 2026-07-06: Hardened Trip Album write responses and AI provider observability. Trip create/update/add/remove now returns fresh primary-database state after writes and touches trip `updated_at` when membership changes. `/health` now exposes non-secret AI config status, Render has AI env placeholders, and backend logs show whether AI was skipped for missing key, called, rejected, failed, or saved as fallback/ready.
- 2026-06-29: Documented Gmail SMTP/App Password configuration for Render password reset email and added non-secret Gmail defaults to `render.yaml`; `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` remain Render-managed secrets.
- 2026-06-29: Added non-secret password-reset config status to `/health` and safer Render log messages for accepted SMTP sends, SMTP failures, and unknown-account reset requests.
- 2026-07-01: Added a Java/Spring Boot backend in `backend-java/` as a contract-preserving port of the previous API. Java defaults to port `4001`, keeps the existing PostgreSQL schema/JWT/API contracts, uses thin controllers with a standard response wrapper, keeps business flow in services, uses repository interfaces plus `NamedParameterJdbcTemplate` implementations with separate read-only/read-write datasources, stores SQL and `.pojo` mapping keys in `db-queries.properties`, and includes service tests plus Render Docker deployment notes.
- 2026-07-11: Completed a cross-stack reliability and accessibility review. Java JWT filtering now limits `401` handling to token verification so downstream API failures keep their real status and logging path, and JWT verification rejects signed tokens without expiry or identity claims. Web and mobile authentication and Journal controls now expose required/password-manager metadata, active filter state, explicit field labels and button roles, and stable spoken labels while primary actions are loading. Empty Ride and Navigate maps now show an honest GPS/destination placeholder instead of misleadingly centering on Bengaluru.
- 2026-07-11: Added a non-destructive ride Cleanup queue across Java, Android, and web. The backend flags only unreviewed near-zero movement recordings, both Journal surfaces expose a Cleanup filter and reason, and Ride Detail tells riders how to keep or explicitly delete the recording.
- 2026-07-11: Shipped Rider Pulse across Java, Android, and web. The new authenticated `/api/analytics/insights` contract supplies 17 owner-scoped summary signals without route points or PII, including rider-local calendar distance/projection, streak and habit timing via a validated IANA timezone. Mobile and web now add a per-user monthly goal, progress/projection, coaching, 30-day momentum, ride benchmarks, habits, review health, cleanup attention, resilient states, responsive/accessibility polish, and retained history charts. Java bootstrap adds a `rides(user_id, started_at)` index. Mobile Analytics/You/Profile reserve a measured minimum floating-tab clearance so Profile and Logout are no longer hidden by the bottom panel. Android version/runtime `0.1.1` (version code `2`) makes this embedded release authoritative over cached `0.1.0` OTA updates without clearing rider data.
- 2026-07-14: Added Saved Places across Java, Android, and web. Riders can privately save Home, Office, and custom current locations with a configurable match radius, maintain them from either client, and use them as route-planner shortcuts. New and dynamically loaded Ride Detail intelligence matches route endpoints without exposing the full trace to the AI provider, recognises Home/Office commutes, and produces human routine names. Ride Detail was simplified on both clients by removing confidence/status/model-like metadata and redundant replay/chapter/speed sections from the primary page.
- 2026-07-18: Fixed Saved Places and forgot-password after live phone, Render-log, and DBeaver testing exposed two migration-era failures. The manually copied `saved_places` and `password_reset_tokens` tables had lost their UUID and timestamp defaults, so inserts failed with null primary keys; those defaults and account foreign keys are now repaired at startup, and the copied `users.id` is restored as a unique key. Password-reset mail now creates a multipart message before adding plain-text and HTML alternatives. The documented `DATABASE_URL` is authoritative for both pools; owner-scoped reads and writes stay on that same database; non-unique integrity failures are no longer mislabeled as duplicate place names; and mobile keeps the server-returned place immediately after a successful save.
- 2026-07-21: Added intelligent endpoint destination naming. Saved places take precedence, otherwise the Java backend resolves only the final coordinate through Google Places/Geocoding, persists destination name/category/address, and supplies privacy-safe route-character signals to AI and deterministic fallback naming. Eligible generic historical rides refresh once on Ride Detail, manual titles are preserved, mobile/web show destination context, story cards use the intelligent title, and mobile sharing now opens the universal app chooser with no yellow post-share status text or Instagram-specific package visibility. Rebuilt the signed `0.1.6`/version-code `7` release, refreshed `releases/RidePulse-latest.apk`, installed it successfully on Moto g34 5G `ZA222K77F7`, confirmed the app remained running without a fatal crash, and verified Share handed the story image to WhatsApp with no yellow status line afterward.
- 2026-07-17: Reworked the Home rider photo into an edge-to-edge photographic hero. That historical layout was superseded by the action-first Home hierarchy on 2026-07-19 so recovery, Start Ride, attention, and monthly progress appear first.
- 2026-07-17: Made manual cockpit recording start promptly by reusing a recent accurate location when available, falling back to a bounded balanced first fix instead of blocking on a cold highest-accuracy fix, and starting high-accuracy foreground/background trackers after the durable local ride session becomes active. Existing background-location choices are respected without reopening permission prompts on every ride. Android/runtime `0.1.6` (version code `7`) makes the final combined performance and photo fix authoritative on installed devices.
- 2026-07-17: Connected active automatic rides to the Ride cockpit. While auto tracking is recording, the cockpit refreshes its local snapshot every two seconds and shows the live route, GPS quality, point count, speed, distance, duration, and auto-live save state; manual Start and the auto-tracking switch are disabled to prevent duplicate or destructive tracking. Pending-ride network sync no longer blocks each local status refresh.
- 2026-07-17: Profile selection now accepts large high-resolution mobile originals and converts them locally into a sharp, upload-efficient JPEG up to 2048px, using adaptive quality only when needed. The Java and web profile-photo ceilings are aligned at 4 MB, replacing the previous 768 KB backend/mobile and 2 MB web limits while retaining a bounded server-side abuse safeguard.
- 2026-07-19: Reorganized Android and web around Home, Plan, Ride/Journal, Insights, and Account; fixed Android safe-area/tab overlap and offline-auth behavior; added compact paginated Journal flows, canonical ride titles, bounded route preview, profile/goal sync, direct trip membership, and private metadata-first album sync. Java APIs remain additive and owner-scoped, legacy ride-list/photo/trip calls remain compatible, and the current Android tracking services/package/runtime are unchanged. Final verification passed 54 Java tests, 4 mobile policy tests, mobile type-check/Expo introspection, 25 Angular tests, the production web build, two independent review passes, and an Android release build/install/launch on Moto g34 5G `ZA222K77F7`; Home, idle Ride, and Plan were visually checked at 720×1600 with no action/navigation collision or startup crash. The tracked `releases/RidePulse-latest.apk` was refreshed from that same installed build for the push-triggered GitHub `latest` release.
- 2026-08-23: Added an always-on manual-ride auto-stop safety net. Foreground and background GPS samples share one serialized evaluator; five continuous minutes at or below `5 km/h` ends the ride at its last moving point. Completed rides upload with the existing idempotent manual client ID, fall back to the durable pending queue, retain recovery data if neither save path succeeds, and surface a one-time cockpit result without unexpected navigation.

- 2026-07-20: Fixed production Ride Album uploads after a PostgreSQL migration left `ride_album_photos.id` without a UUID default. The Java backend now generates the photo UUID explicitly during upload and additively repairs the table's UUID/timestamp/boolean defaults at startup, while preserving owner scoping and client-photo idempotency.

## Testing Checklist

- Login with a real account.
- Verify web and mobile sign-in/register controls with a screen reader or accessibility inspector, including loading, error, and password-reset states.
- Request password reset from mobile and web; confirm the email link opens `/#/reset-password`, rejects bad/expired tokens, updates the password, and requires signing in with the new password.
- Register a new rider and confirm empty form fields.
- Confirm Home shows the action-first Start Ride hierarchy and the rider avatar opens Account.
- Confirm Account shows identity/bike details and can add/change/remove the backend-synced display photo.
- Confirm the same display photo appears on Home, You, and Profile after logout/login and app restart.
- Confirm Ride Detail can save title/notes and mark reviewed.
- Confirm Ride Detail shows the story, key stats, map/replay, review, album, and actions without ride confidence, AI status/date, diagnostic GPS point counts, chapters, or a duplicate empty state.
- Confirm an existing recorded ride and an imported ride can open nonblank full-screen replay, scrub and change playback speed, and show unavailable speed honestly.
- Confirm Timeline import can choose/reopen/delete a private backup, show Review without waiting for the backend, filter routes by activity/year/month/selection, edit/merge/create date albums, and pause/resume automatic deduplication and import. Do not confirm a full personal production import during smoke testing.
- Confirm Ride Detail can delete the selected ride only after confirmation and returns to Journal.
- Confirm fresh installs show walkthrough before login, and replay walkthrough works from Account.
- Confirm Ride Detail album can find ride-window photos, manually add photos, remove album copies, and open slideshow.
- Confirm synced ride album photos appear on web after mobile import/manual add and can be uploaded/removed from web without deleting original gallery files.
- Confirm Home prefers `/api/home` and falls back to older journal/dashboard responses.
- Confirm Journal remembers its Rides/Trips/Memories view, filter, and sort after app restart/back navigation, and loads the next cursor page without duplicate rides.
- Confirm duplicate candidates appear in Ride Detail and require confirmation before delete.
- Confirm top speed does not jump from one isolated GPS spike during a ride.
- Manual ride test:
  - Start Ride.
  - Move a short distance.
  - Stop Ride.
  - Confirm History/Dashboard update.
  - Start another manual ride, move above `5 km/h`, then remain stopped for `5 minutes`; confirm the cockpit exits recording automatically and the saved duration/endpoint exclude the parked tail.
  - Repeat with the app backgrounded and background location granted; confirm the completed ride is not shown as an interrupted recovery.
  - Repeat offline; confirm the auto-stopped ride is queued locally and uploads after connectivity returns.
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
  - Plan route preview appears, offers Google Maps handoff, and stops foreground location work after the bounded preview fix.
  - Save Home and Office from both mobile and web, confirm they are account-synced, and confirm their chips route to the stored coordinates rather than geocoding the labels.
  - Record a ride whose endpoints fall inside the Home and Office radii; confirm Ride Detail names it as a Home-to-Office or Office-to-Home commute.
  - History ride map appears.
  - Tapping a History ride opens Ride Detail.
  - Ride Detail shows route map, stat cards, and route summary without redundant technical sections.
- Ride Detail `Import ride photos` requests media permission and lists photos taken during the ride time window.
- Ride photos with location metadata show camera markers on the ride map.
- Full-screen map works and does not hide Google current-location controls.
- Ride Detail `Share story image` creates a 9:16 PNG and opens the native chooser for every compatible installed app; cancellation is silent and no yellow status text appears afterward.
- Ride Detail `AI story prompt` shows varied prompts, can regenerate styles, copy/share prompt text, and open ChatGPT.
- Analytics test:
  - Confirm Insights loads the calendar-month goal, projection, coaching, 30-day momentum, ride character, habits, review completion, cleanup count, and Reports.
  - Edit the monthly target on one client and confirm the same authenticated rider sees it on Android and web.
  - Confirm Daily/Monthly/Yearly tabs load and rapid period changes leave the latest selected period visible.
  - Confirm summary cards and accessible charts use the latest ride buckets.
  - Temporarily block `/api/analytics/insights`; confirm its retry/error state does not hide or corrupt ride history.
- Mobile bottom-panel test:
  - Confirm Home, Plan, Journal, Insights, and Account content clears the floating tabs and Android navigation inset.
  - Confirm Ride Start/Finish remains fully visible and tappable without intersecting the floating tabs.

## Safety And Reliability Notes

- The rider should set destination/tracking before moving.
- Do not interact with the phone while riding.
- Mount the phone securely.
- Android background tracking reliability depends on location permission and battery optimization.
- Manual auto-stop works in the foreground without background permission; background auto-stop requires `Allow all the time` location access and remains subject to Android battery management.
- For best field testing, allow location all the time and disable battery optimization for RidePulse.
- Paid Render Starter avoids free-tier sleeping; Neon can still have occasional database cold latency if the database scales to zero.

## Known Gaps / Future Ideas

- Google Timeline import currently supports only the verified `semanticSegments` export shape and intentionally treats its sparse paths and derived speeds as approximate rather than turn-by-turn recordings.
- Ride album copies are private account data stored by the Java backend; gallery originals remain on the phone and are never deleted by RidePulse album removal.
- Profile display photos are synced to the Render Java backend; local cached copies are used only for speed and fallback.
- No refresh-token flow yet.
- The Angular web companion does not record rides in-browser; reliable ride tracking remains Android app-only.
- No push notifications yet.
- Auto tracking could later add a review screen for detected rides.
- Crash reporting such as Sentry/Firebase Crashlytics is not installed yet.
