# RidePulse

A React Native, Angular, Java Spring Boot, and PostgreSQL ride tracking app with a brand-neutral RidePulse identity. It includes login, Google Maps route navigation, manual and automatic ride tracking, history, dashboard stats, analytics charts, reports, and ride-story sharing.

For the latest living summary of what the app currently does, deployed URLs, testing notes, and known gaps, see [APP_CONTEXT.md](APP_CONTEXT.md).

## Project Structure

```text
.
+-- mobile/                 # Expo React Native app
|   +-- App.tsx
|   +-- src/
|       +-- api/            # Backend and Google Maps clients
|       +-- components/     # Cards, buttons, map, safety modal
|       +-- context/        # Authentication state
|       +-- navigation/     # Auth stack and app tabs
|       +-- screens/        # Dashboard, Navigate, Ride, History, Analytics, Reports
|       +-- services/       # Background location task and auto tracking
|       +-- theme/
|       +-- utils/
+-- backend-java/           # Active Spring Boot API for Render production
|   +-- src/main/java/      # Controllers, services, repositories, DTOs
|   +-- src/main/resources/ # SQL query properties and app configuration
+-- web/                    # Angular public website and authenticated companion
+   +-- src/app/            # Landing page, auth, dashboard, journal, analytics
+   +-- public/             # RidePulse web assets
+-- docker-compose.yml      # Local PostgreSQL
```

## MVP Features

- Email/password authentication with JWT and secure email-based password reset on the Java API.
- Google Maps route lookup with Geocoding API and Directions API.
- Safety confirmation before navigation: "Set your destination before riding. Do not interact with the phone while riding."
- Start Ride / Stop Ride tracking with foreground and background location support.
- Optional automatic ride tracking with Android motion-first arming, speed-based start/stop confirmation, and pending upload retry.
- Ride storage with start/end location, path points, distance, duration, top speed, average speed, and timestamps.
- Post-ride review with ride title, notes, reviewed status, and confirmed duplicate cleanup.
- Non-destructive ride Cleanup queue for unreviewed near-zero movement recordings, with explicit keep-by-review or confirmed-delete decisions on mobile and web.
- Ride Detail photo import for camera photos taken during a ride, including map markers when photo GPS metadata exists.
- Ride Detail story sharing with a local Instagram Story image and dynamic ChatGPT image prompts based on ride details, place mood, time, and optional weather.
- Backend-owned AI Ride Intelligence for human ride titles, summaries, ride-kind detection, key insights, best moments, and trip automation suggestions, with deterministic fallback and long-ride trip suggestions when AI is unavailable.
- Account-synced Saved Places for Home, Office, and custom stops, with adjustable GPS matching radii, route-planner shortcuts, and intelligent routine names such as `Commute · Home to Office`.
- Focused mobile/web Ride Detail UX centred on story, key stats, map, notes, photos, and trip/share actions instead of model confidence/status and redundant technical sections.
- Dashboard totals for today, month, year, total rides, best top speed, and average speed.
- Daily, monthly, and yearly ride history.
- Rider Pulse Insights on mobile and web with one account-synced monthly distance goal, calendar-month progress, projection and coaching, rolling 30-day comparison, active days, ride-day streak, longest/average ride benchmarks, favourite weekday/time, review completion, cleanup attention, charts, and reports.
- JSON report endpoint and in-app PDF export.
- Location/activity permission, background location prompt, battery optimization warning copy, and internet/API error messages.
- Brand-neutral RidePulse launcher name, icon, Graphite and OLED Black themes, and compact mobile UI controls.
- Job-based Android navigation through Home, Plan, Ride, Journal, and Insights, with Account/settings behind the rider avatar and a tab-safe fixed Ride action.
- Angular web companion with a cinematic public site plus grouped Home, Plan, Journal, Insights, Account, rich ride detail, private synced albums, profile editing, responsive navigation, and accessible loading/focus states. GPS recording remains Android-only.

## Required API Keys

Create a Google Cloud API key and enable:

- Maps SDK for Android
- Maps SDK for iOS
- Directions API
- Geocoding API

For Android production builds, restrict the key to your Android package and SHA-1 signing certificate. For iOS, restrict it to your bundle identifier.

Optional backend AI enrichment is configured only on the Java API server:

- `RIDEPULSE_AI_API_KEY` or `OPENAI_API_KEY`
- `RIDEPULSE_AI_MODEL` (defaults to `gpt-4o-mini`)
- `RIDEPULSE_AI_URL` (defaults to the OpenAI chat completions endpoint)

Mobile and web clients never store AI secrets. If no AI key is configured, rides still save and receive deterministic fallback titles, summaries, ride kind, and insight fields.

Check `/health` for non-secret AI config status before debugging usage: `config.rideAi.apiKeyPresent` reports whether Render has an AI key, while `model` and `endpointHost` show the configured provider target without exposing credentials. Render logs include `ride ai provider skipped missing api key`, `ride ai provider request started`, `ride ai provider non-success`, and `ride ai saved` messages so OpenAI dashboard usage can be matched against backend attempts.

## Backend Setup

The active and only backend implementation is the Java Spring Boot service in `backend-java/`, deployed to Render with Docker and backed by PostgreSQL.

Production API:

```text
https://ktm-ride-mvp-java.onrender.com/api
```

## Java Backend Setup

Start PostgreSQL:

```bash
docker compose up -d
```

Run the Java backend:

```powershell
cd backend-java
$env:DATABASE_URL="postgres://ktm:ktm@localhost:5432/ktm_ride"
$env:JWT_SECRET="local-dev-secret"
$env:CORS_ORIGIN="*"
& "C:\ProgramData\chocolatey\lib\maven\apache-maven-3.9.16\bin\mvn.cmd" spring-boot:run
```

The API runs at `http://localhost:4001`.

Run the backend regression suite with `mvn test` from `backend-java/`.

For a hosted PostgreSQL database that stores RidePulse tables in a non-default schema, set `DB_SCHEMA`. For AWS with a schema named `ridepulse_db`, use:

```powershell
$env:DB_SCHEMA="ridepulse_db,public"
```

If `ridepulse_db` is the database name instead of a schema name, leave `DB_SCHEMA` unset and put `/ridepulse_db` in `DATABASE_URL`.

For password reset email in local or Render environments, configure SMTP on the Java backend:

```text
PASSWORD_RESET_URL_BASE=http://localhost:4200/#/reset-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=sender-gmail-address
SMTP_PASS=gmail-app-password
SMTP_FROM=RidePulse <sender-gmail-address>
```

Use the deployed web URL for production, for example `https://ridepulse-web.onrender.com/#/reset-password`. Use a Gmail App Password, not the normal Gmail password. Do not commit SMTP credentials.

The password-reset request always shows a generic success message so account emails cannot be discovered. If no email arrives, check `/health` for non-secret password-reset config booleans and Render logs for `Password reset email accepted by SMTP`, `Password reset email failed`, or `Password reset requested for unknown account`.

Seed login:

- Email: `rider@example.com`
- Password: `password`

## Mobile Setup

```bash
cd mobile
cp .env.example .env
npm install
```

Set your Maps key in `mobile/.env`:

```text
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-key
GOOGLE_MAPS_API_KEY=your-key
```

Set the backend URL:

```text
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4001/api
```

Optional direct Instagram Stories handoff:

```text
EXPO_PUBLIC_INSTAGRAM_APP_ID=your-facebook-app-id
```

Without this value, RidePulse still generates the story image and falls back to Instagram image sharing or the Android share sheet.

Use `10.0.2.2` for Android emulator, `http://localhost:4001/api` for iOS simulator, and your machine LAN IP for a physical device.

Run the app:

```bash
npm start
```

For native Maps/background location behavior, run a native build:

```bash
npm run android
```

Run the mobile policy tests and TypeScript check before packaging:

```bash
npm test
npm run typecheck
```

## Web Setup

```bash
cd web
npm install
npm start
```

The Angular dev server runs at `http://localhost:4200`. Web builds use the live Render API by default so browser Network output stays clean and does not show failed localhost probes.

For web Google Maps, set a browser-restricted key through Render as `WEB_GOOGLE_MAPS_API_KEY`. Local source keeps the key blank by default and falls back to route artwork/open-map links when Maps is not configured.

Build the production web bundle:

```bash
cd web
npm run build
```

Run the Angular unit suite with:

```bash
npm run test -- --watch=false
```

The web app exposes the same rider data and organization workflows as Android—rides, trips, memories, albums, plans, insights, reports, and account details—but ride recording and device controls stay in the Android app for reliable GPS/background behavior. Profile and ride photos use authenticated owner-scoped endpoints.

For Render Static Site deployment, the blueprint builds the Angular app with:

```bash
cd web
npm run build:render
```

and publishes `web/dist/web/browser` with an SPA rewrite to `/index.html`.

## Database Schema

The Java backend creates and uses the RidePulse PostgreSQL schema, including:

- `users`: account, password hash, editable rider name/bike model, profile photo, and optional monthly distance goal.
- `password_reset_tokens`: one-time hashed reset tokens with expiry and usage tracking.
- `rides`: summary stats and start/end coordinates.
- `ride_points`: normalized GPS points for route rendering and speed-over-time analysis.
- `ride_album_photos`: private backend-synced album copies with client idempotency IDs for reliable retry across Android and web.
- `saved_places`: owner-scoped Home, Office, and custom endpoint coordinates plus a GPS-drift matching radius.

To move existing production data from Neon to AWS, use [DEPLOYMENT.md](DEPLOYMENT.md#1a-migrate-existing-neon-data-to-aws). The migration script reads connection strings from environment variables and does not commit database secrets.

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/home`
- `GET /api/journal`
- `PATCH /api/profile`
- `GET /api/profile/preferences`
- `PATCH /api/profile/preferences`
- `GET /api/profile/photo`
- `PUT /api/profile/photo`
- `DELETE /api/profile/photo`
- `POST /api/rides`
- `GET /api/rides?period=today|month|year|all&q=&limit=&cursor=&reviewStatus=&sort=`
- `GET /api/rides/:id`
- `PATCH /api/rides/:id`
- `DELETE /api/rides/:id`
- `GET /api/rides/:id/intelligence`
- `GET /api/rides/:id/duplicates`
- `GET /api/rides/:id/photos`
- `GET /api/rides/:id/photos?includeData=false`
- `GET /api/rides/:id/photos/:photoId`
- `POST /api/rides/:id/photos`
- `DELETE /api/rides/:id/photos/:photoId`
- `GET /api/rides/:id/trips`
- `GET /api/trips`
- `POST /api/trips`
- `GET /api/trips/:id`
- `PATCH /api/trips/:id`
- `DELETE /api/trips/:id`
- `POST /api/trips/:id/rides`
- `PUT /api/trips/:id/rides`
- `DELETE /api/trips/:id/rides/:rideId`
- `GET /api/places`
- `POST /api/places`
- `PATCH /api/places/:id`
- `DELETE /api/places/:id`
- `GET /api/analytics/distance?bucket=daily|monthly|yearly`
- `GET /api/analytics/insights?timezone=Asia/Kolkata`
- `GET /api/analytics/speed/:rideId`
- `GET /api/reports?period=day|month|year&date=2026-05-11`

Ride responses may include additive AI fields such as `aiTitle`, `aiSummary`, `rideKind`, `rideKindConfidence`, `rideKindReason`, `keyInsight`, `bestMoment`, `tripSuggestion`, `aiStatus`, and `aiGeneratedAt`. Existing route labels remain available as `startLabel` and `endLabel` for maps and route facts; AI titles, summaries, story prompts, and trip suggestions should avoid treating map labels as the main ride meaning.

Paginated ride-list calls add `data.pageInfo` with `hasMore` and an opaque `nextCursor`; callers that omit pagination parameters keep the legacy `data.rides` response and 100-ride cap. Album listing remains backward-compatible with embedded image data by default, while `includeData=false` plus the individual binary endpoint avoids loading every photo blob. Photo uploads may include `clientPhotoId` so retries are idempotent. All profile, preference, ride, album, trip, place, analytics, and report data remains authenticated and owner-scoped.

`GET /api/analytics/insights` returns authenticated, owner-scoped summary analytics under `data.insights`; it never loads route points or labels. The optional IANA `timezone` query (for example `Asia/Kolkata`) makes calendar-month distance/projection, ride-day streak, favourite weekday, and favourite time rider-local; missing or invalid values safely fall back to UTC. The response includes `generatedAt`, rolling/current/previous distance, ride and active-day counts, streak, longest/average benchmarks, habit labels, review completion, cleanup count, and month projection. Startup schema bootstrap creates the supporting `rides(user_id, started_at)` index automatically, so no manual SQL step is required.

## Safety Notes

This app is designed so the destination can be set before riding and ride tracking can run with minimal interaction. Do not interact with the phone while riding. Mount the device securely, configure permissions before moving, and follow local traffic laws.

Android auto tracking uses activity recognition to stay armed without immediately starting high-accuracy GPS. RidePulse starts the foreground GPS service only after vehicle-like movement is detected, then confirms the ride using the normal speed and distance rules. If motion detection is unavailable, the app falls back to lower-power location watching and says so in the Ride/Profile status.

Motion callbacks are delivered through exactly one foreground or headless path, serialized, and deduplicated before they can change tracking state. For a background activity-recognition event, the native receiver preserves Android's permitted foreground-service launch window until the headless handler registers the GPS task. An active GPS probe is kept running across later vehicle signals instead of being restarted. Profile includes a tracking-readiness check for location permissions, phone location, and motion-service health; diagnostic cards can be expanded and copied without exporting the full report.

## Online Deployment

Use [DEPLOYMENT.md](DEPLOYMENT.md) for backend deployment notes. The current preferred production shape is the Render API plus a Render Static Site for the Angular web companion.

## Maintenance Note

When shipping meaningful UX, branding, deployment, or behavior changes, update [APP_CONTEXT.md](APP_CONTEXT.md) in the same change set so the repo context stays current.

## Next Production Steps

- Add turn instruction progression based on GPS proximity.
- Add offline ride queueing when the network is unavailable.
- Add refresh tokens.
- Add E2E tests on a real Android device for background tracking.
- Add Firebase Crashlytics or Sentry for field reliability.
