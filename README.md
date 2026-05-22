# Duke Ride

A React Native and Node/PostgreSQL MVP for replacing KTM Connect-style ride tracking on a KTM Duke 250 Gen 3. The app is dark themed, KTM orange/black, and includes login, Google Maps route navigation, manual ride tracking, history, dashboard stats, analytics charts, and PDF reports.

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
+-- backend/                # Express API, kept for local/reference backend
|   +-- db/schema.sql       # PostgreSQL schema
|   +-- db/seed.sql         # Sample rider and rides
|   +-- src/routes/         # Auth, rides, dashboard, analytics, reports
|   +-- tests/
+-- worker/                 # Cloudflare Workers API for free hosted backend
+   +-- src/index.js        # Worker routes matching /api/*
+   +-- wrangler.toml
+-- docker-compose.yml      # Local PostgreSQL
```

## MVP Features

- Email/password authentication with JWT.
- Google Maps route lookup with Geocoding API and Directions API.
- Safety confirmation before navigation: "Set your destination before riding. Do not interact with the phone while riding."
- Start Ride / Stop Ride tracking with foreground and background location support.
- Optional automatic ride tracking with speed-based start/stop detection and pending upload retry.
- Ride storage with start/end location, path points, distance, duration, top speed, average speed, and timestamps.
- Post-ride review with ride title, notes, reviewed status, and confirmed duplicate cleanup.
- Ride Detail photo import for camera photos taken during a ride, including map markers when photo GPS metadata exists.
- Dashboard totals for today, month, year, total rides, best top speed, and average speed.
- Daily, monthly, and yearly ride history.
- Basic charts for distance, ride duration trends, and top speed comparison.
- JSON report endpoint and in-app PDF export.
- Location permission, background location prompt, battery optimization warning copy, and internet/API error messages.

## Required API Keys

Create a Google Cloud API key and enable:

- Maps SDK for Android
- Maps SDK for iOS
- Directions API
- Geocoding API

For Android production builds, restrict the key to your Android package and SHA-1 signing certificate. For iOS, restrict it to your bundle identifier.

## Backend Setup

The recommended free hosted backend is now the Cloudflare Worker in `worker/`.
The Express backend in `backend/` remains useful for local development and as a route reference.

## Cloudflare Worker Backend

```bash
cd worker
npm install
npm run check
```

Configure production secrets:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
```

Deploy:

```bash
npm run deploy
```

After deployment, set the mobile API URL to the Worker route plus `/api`:

```text
EXPO_PUBLIC_API_BASE_URL=https://duke-ride-api.dukeride-kvk.workers.dev/api
```

## Express Backend Setup

```bash
cd backend
cp .env.example .env
npm install
```

Start PostgreSQL:

```bash
cd ..
docker compose up -d
```

Run schema and seed:

```bash
cd backend
npm run db:migrate
npm run db:seed
npm run dev
```

The API runs at `http://localhost:4000`.

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
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000/api
```

Use `10.0.2.2` for Android emulator, `http://localhost:4000/api` for iOS simulator, and your machine LAN IP for a physical device.

Run the app:

```bash
npm start
```

For native Maps/background location behavior, run a native build:

```bash
npm run android
```

## Database Schema

The schema is in `backend/db/schema.sql` and includes:

- `users`: account, password hash, rider name, bike model.
- `rides`: summary stats and start/end coordinates.
- `ride_points`: normalized GPS points for route rendering and speed-over-time analysis.

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `POST /api/rides`
- `GET /api/rides?period=today|month|year|all`
- `GET /api/rides/:id`
- `GET /api/analytics/distance?bucket=daily|monthly|yearly`
- `GET /api/analytics/speed/:rideId`
- `GET /api/reports?period=day|month|year&date=2026-05-11`

## Safety Notes

This app is designed so the destination can be set before riding and ride tracking can run with minimal interaction. Do not interact with the phone while riding. Mount the device securely, configure permissions before moving, and follow local traffic laws.

## Online Deployment

Use [DEPLOYMENT.md](DEPLOYMENT.md) to deploy the Cloudflare Worker backend with Neon PostgreSQL and point the mobile app at the public API URL.

## Next Production Steps

- Add turn instruction progression based on GPS proximity.
- Add offline ride queueing when the network is unavailable.
- Add refresh tokens and password reset.
- Add E2E tests on a real Android device for background tracking.
- Add Firebase Crashlytics or Sentry for field reliability.
