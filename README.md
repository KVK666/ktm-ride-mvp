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
- Ride Detail photo import for camera photos taken during a ride, including map markers when photo GPS metadata exists.
- Ride Detail story sharing with a local Instagram Story image and dynamic ChatGPT image prompts based on ride details, place mood, time, and optional weather.
- Backend-owned AI Ride Intelligence for human ride titles, summaries, ride-kind detection, key insights, best moments, and trip automation suggestions, with deterministic fallback and long-ride trip suggestions when AI is unavailable.
- Dashboard totals for today, month, year, total rides, best top speed, and average speed.
- Daily, monthly, and yearly ride history.
- Basic charts for distance, ride duration trends, and top speed comparison.
- JSON report endpoint and in-app PDF export.
- Location/activity permission, background location prompt, battery optimization warning copy, and internet/API error messages.
- Brand-neutral RidePulse launcher name, icon, Graphite and OLED Black themes, and compact mobile UI controls.
- Angular web companion with a cinematic public site, Three.js hero scene, login/register, dashboard, journal, Google Maps route planner, rich ride detail, synced ride albums, analytics, reports export, profile photo management, fixed companion navigation, and branded RidePulse loading states.

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

The web app is a companion experience. It shows the premium public website and authenticated ride dashboard/journal surfaces, but ride recording stays in the Android app for reliable GPS and background tracking. Profile photos are loaded from the existing authenticated `/api/profile/photo` endpoint as JSON.

For Render Static Site deployment, the blueprint builds the Angular app with:

```bash
cd web
npm run build:render
```

and publishes `web/dist/web/browser` with an SPA rewrite to `/index.html`.

## Database Schema

The Java backend creates and uses the RidePulse PostgreSQL schema, including:

- `users`: account, password hash, rider name, bike model.
- `password_reset_tokens`: one-time hashed reset tokens with expiry and usage tracking.
- `rides`: summary stats and start/end coordinates.
- `ride_points`: normalized GPS points for route rendering and speed-over-time analysis.
- `ride_album_photos`: backend-synced ride album copies for web/mobile companion display.

To move existing production data from Neon to AWS, use [DEPLOYMENT.md](DEPLOYMENT.md#1a-migrate-existing-neon-data-to-aws). The migration script reads connection strings from environment variables and does not commit database secrets.

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `POST /api/rides`
- `GET /api/rides?period=today|month|year|all`
- `GET /api/rides/:id`
- `PATCH /api/rides/:id`
- `DELETE /api/rides/:id`
- `GET /api/rides/:id/intelligence`
- `GET /api/rides/:id/duplicates`
- `GET /api/rides/:id/photos`
- `POST /api/rides/:id/photos`
- `DELETE /api/rides/:id/photos/:photoId`
- `GET /api/trips`
- `POST /api/trips`
- `GET /api/trips/:id`
- `PATCH /api/trips/:id`
- `DELETE /api/trips/:id`
- `POST /api/trips/:id/rides`
- `DELETE /api/trips/:id/rides/:rideId`
- `GET /api/analytics/distance?bucket=daily|monthly|yearly`
- `GET /api/analytics/speed/:rideId`
- `GET /api/reports?period=day|month|year&date=2026-05-11`

Ride responses may include additive AI fields such as `aiTitle`, `aiSummary`, `rideKind`, `rideKindConfidence`, `rideKindReason`, `keyInsight`, `bestMoment`, `tripSuggestion`, `aiStatus`, and `aiGeneratedAt`. Existing route labels remain available as `startLabel` and `endLabel` for maps and route facts; AI titles, summaries, story prompts, and trip suggestions should avoid treating map labels as the main ride meaning.

## Safety Notes

This app is designed so the destination can be set before riding and ride tracking can run with minimal interaction. Do not interact with the phone while riding. Mount the device securely, configure permissions before moving, and follow local traffic laws.

Android auto tracking uses activity recognition to stay armed without immediately starting high-accuracy GPS. RidePulse starts the foreground GPS service only after vehicle-like movement is detected, then confirms the ride using the normal speed and distance rules. If motion detection is unavailable, the app falls back to lower-power location watching and says so in the Ride/Profile status.

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
