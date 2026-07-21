# Online Deployment

This setup is for a small private rider group. The active production API is the Render Java Spring Boot service backed by PostgreSQL. The Angular website deploys as a Render Static Site next to that API.

## Recommended Stack

- Database: PostgreSQL, currently Neon with AWS RDS supported for cutover
- Backend API: Render Java Spring Boot service
- Web: Render Static Site
- Mobile app: standalone Android release APK pointed at the Java API URL

The only backend implementation in this repo is `backend-java/`.

Current Java API URL:

```text
https://ktm-ride-mvp-java.onrender.com
```

## 1. Create Or Reuse Postgres

1. Create or reuse a PostgreSQL database.
2. Copy the PostgreSQL connection string.
3. Keep `sslmode=require` in the URL for hosted databases.

The connection string looks like:

```text
postgresql://user:password@host/dbname?sslmode=require
```

If AWS uses a separate schema named `ridepulse_db` inside a database, configure the Java API with:

```text
DB_SCHEMA=ridepulse_db,public
```

The `public` fallback keeps PostgreSQL extension functions visible while RidePulse tables live in `ridepulse_db`. If `ridepulse_db` is the database name and tables live in that database's default `public` schema, leave `DB_SCHEMA` unset and use `/ridepulse_db` in `DATABASE_URL`.

## 1a. Migrate Existing Neon Data To AWS

Use a short maintenance window so new rides are not written to Neon while the final dump is running. Do not paste database URLs into committed files.

From PowerShell:

```powershell
cd "C:\Users\BBS001\Documents\New project"
$env:NEON_DATABASE_URL="postgresql://neon-user:neon-password@neon-host/neon-db?sslmode=require"
$env:AWS_DATABASE_URL="postgresql://aws-user:aws-password@aws-host/aws-db?sslmode=require"
.\scripts\migrate-neon-to-aws.ps1 -TargetSchema ridepulse_db
```

The script exports the existing Neon `public` schema, restores it to AWS, moves RidePulse app tables into `ridepulse_db`, and prints restored table, user, and ride counts. It stops if RidePulse tables already exist on the target unless `-AllowNonEmptyTarget` is passed after a manual backup/review.

After the data copy, set these on the Render Java API service:

```text
DATABASE_URL=postgresql://aws-user:aws-password@aws-host/aws-db?sslmode=require
DATABASE_SSL=true
DB_SCHEMA=ridepulse_db,public
```

Then redeploy/restart the Java API and verify:

1. `GET https://ktm-ride-mvp-java.onrender.com/health`
2. Login with a real rider.
3. Confirm Dashboard, Journal, Trips, Analytics, Reports, profile photo, and ride album data load.
4. Save one short test ride after cutover and confirm it appears in AWS.

## 2. Create Database Tables

The Java backend bootstraps the schema on startup from property-backed SQL. For local development, use the PostgreSQL service in `docker-compose.yml`.

```powershell
docker compose up -d
cd "C:\Users\BBS001\Documents\New project\backend-java"
$env:DATABASE_URL="postgres://ktm:ktm@localhost:5432/ktm_ride"
$env:JWT_SECRET="local-dev-secret"
& "C:\ProgramData\chocolatey\lib\maven\apache-maven-3.9.16\bin\mvn.cmd" spring-boot:run
```

## Render Web Deployment

The repository includes `render.yaml` entries for:

- `ktm-ride-api-java`: active Java Spring Boot API service, deployed with Docker.
- `ridepulse-web`: Angular Render Static Site.

The Java backend lives in `backend-java/`. It deploys as a Docker-backed service and uses Render-managed database/JWT/SMTP environment variables.

The web static site uses:

```text
Build command: cd web && npm ci && npm run build:render
Publish path: web/dist/web/browser
Rewrite: /* -> /index.html
```

Set these Render environment variables on `ridepulse-web`:

```text
WEB_API_BASE_URL=https://ktm-ride-mvp-java.onrender.com/api
WEB_GOOGLE_MAPS_API_KEY=<browser-restricted-google-maps-js-key>
WEB_APK_URL=https://github.com/KVK666/ride-pulse/releases/tag/latest
```

Set these Render environment variables on the `ktm-ride-api-java` service for password reset email. For Gmail, use a Google App Password, not the normal Gmail account password:

```text
PASSWORD_RESET_URL_BASE=https://ridepulse-web.onrender.com/#/reset-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<sender-gmail-address>
SMTP_PASS=<gmail-app-password>
SMTP_FROM=RidePulse <sender-gmail-address>
```

The reset flow stores only hashed one-time tokens in Postgres.

The forgot-password UI always shows a generic success message, even when the account email does not exist. For troubleshooting, check `https://ktm-ride-mvp-java.onrender.com/health` for non-secret `config.passwordReset` booleans and Render logs for `Password reset email accepted by SMTP`, `Password reset email failed`, or `Password reset requested for unknown account`.

For intelligent ride destination naming, create a separate server-side Google Cloud key with Places API (New) and Geocoding API enabled, restrict that key to those APIs, and set it only on `ktm-ride-api-java`:

```text
RIDEPULSE_GOOGLE_PLACES_API_KEY=<server-side-places-key>
```

Do not reuse or expose the mobile/browser Maps keys. Verify the non-secret state at `/health` under `config.destinationPlaces.configured`. RidePulse checks saved places first and otherwise sends only the final ride coordinate to Google; failures fall back without blocking ride saves.

Do not commit the Maps key. On Google Cloud, enable Maps JavaScript API and Directions API for this browser key, then restrict it by HTTP referrer to the Render Static Site domain with a wildcard path such as `https://ridepulse-web.onrender.com/*`, any custom web domain wildcard, and `http://localhost:4200/*` / `http://127.0.0.1:4200/*` only when local live-map testing is needed. Rebuild/redeploy `ridepulse-web` after changing `WEB_GOOGLE_MAPS_API_KEY`; existing static bundles do not pick up new env vars automatically.

After Render provides the web URL, tighten backend `CORS_ORIGIN` from `*` to a comma-separated list such as:

```text
http://localhost:4200,http://127.0.0.1:4200,https://ridepulse-web.onrender.com
```

## 3. Point Mobile App To Java API

Edit `mobile/.env`:

```text
EXPO_PUBLIC_API_BASE_URL=https://ktm-ride-mvp-java.onrender.com/api
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
GOOGLE_MAPS_API_KEY=your-google-maps-key
```

Then rebuild and install the standalone RidePulse APK:

```powershell
cd "C:\Users\BBS001\Documents\New project\mobile"
npm run android:install:release
```

## 7. Smoke Test

1. Open the app while connected to the internet.
2. Register or login.
3. Confirm Dashboard loads.
4. Start and stop a short walking test ride.
5. Confirm the ride appears in Dashboard, History, Ride Detail, Analytics, and Reports.
6. Request a password reset from web or mobile, open the email link, set a new password, then confirm the old password fails and the new password logs in.
7. Export diagnostics if any request fails.

Do not interact with the phone while riding.
