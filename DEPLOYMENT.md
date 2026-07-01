# Online Deployment

This setup is for a small private rider group. The current active production API is the Render Java Spring Boot service backed by Neon PostgreSQL. The Angular website deploys as a Render Static Site next to that API. The Render Express service remains the rollback fallback, and Cloudflare Worker notes remain legacy reference.

## Recommended Stack

- Database: Neon PostgreSQL
- Backend API: Render Java Spring Boot service
- Rollback API: Render Express service
- Web: Render Static Site
- Mobile app: standalone Android release APK pointed at the Java API URL

The Express backend is still kept in `backend/` for local development/reference and Render fallback. Production traffic should use `backend-java/` unless a rollback is needed.

Current Java API URL:

```text
https://ktm-ride-mvp-java.onrender.com
```

## 1. Create Or Reuse Neon Postgres

1. Open Neon and create or reuse the `ktm-ride` project.
2. Copy the pooled PostgreSQL connection string.
3. Keep `sslmode=require` in the URL.

The connection string looks like:

```text
postgresql://user:password@host/dbname?sslmode=require
```

## 2. Create Database Tables

From your laptop, run these from the `backend` folder. Replace the URL with your Neon URL.

PowerShell:

```powershell
cd "C:\Users\BBS001\Documents\New project\backend"
$env:DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
npm run db:migrate
npm run db:seed
```

The seed login is:

```text
Email: rider@example.com
Password: password
```

For real accounts, use the app Register screen/API.

Run the same migration command after schema changes too. For example, the ride upload idempotency fix adds `rides.client_ride_id` plus a unique index so auto-upload retries cannot create duplicate rides.
The ride review feature also requires `rides.title`, `rides.notes`, and `rides.reviewed_at`.

## 3. Install And Validate Worker

```powershell
cd "C:\Users\BBS001\Documents\New project\worker"
npm install
npm run check
```

Expected dry-run output includes a bundle upload summary and exits without deploying.

## 4. Configure Cloudflare Secrets

Login to Cloudflare if needed:

```powershell
npx wrangler login
```

Set production secrets:

```powershell
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
```

Use a long random `JWT_SECRET`. The Worker uses `JWT_EXPIRES_IN_SECONDS=2592000` from `wrangler.toml`, which is 30 days.

Windows helper:

```powershell
npm run setup:secrets
```

## Render Web Deployment

The repository includes `render.yaml` entries for:

- `ktm-ride-api`: existing Render Node API service.
- `ktm-ride-api-java`: active Java Spring Boot API service, deployed with Docker.
- `ridepulse-web`: Angular Render Static Site.

The Java backend lives in `backend-java/`. It deploys as a separate Docker-backed service and uses the same database/JWT/SMTP environment variables as the Node service. Keep the Node service available as rollback while Java remains the active API.

The web static site uses:

```text
Build command: cd web && npm ci && npm run build:render
Publish path: web/dist/web/browser
Rewrite: /* -> /index.html
```

Set these Render environment variables on `ridepulse-web`:

```text
WEB_API_BASE_URL=https://ktm-ride-mvp-java.onrender.com/api
WEB_FALLBACK_API_BASE_URL=https://ktm-ride-mvp.onrender.com/api
WEB_GOOGLE_MAPS_API_KEY=<browser-restricted-google-maps-js-key>
WEB_APK_URL=https://github.com/KVK666/ktm-ride-mvp/releases/tag/latest
```

Set these Render environment variables on the `ktm-ride-api` Express service for password reset email. For Gmail, use a Google App Password, not the normal Gmail account password:

```text
PASSWORD_RESET_URL_BASE=https://ridepulse-web.onrender.com/#/reset-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<sender-gmail-address>
SMTP_PASS=<gmail-app-password>
SMTP_FROM=RidePulse <sender-gmail-address>
```

The reset flow stores only hashed one-time tokens in Postgres. The Cloudflare Worker fallback does not send SMTP reset emails in this version; add HTTP email-provider support there first if the Worker becomes the active API again.

The forgot-password UI always shows a generic success message, even when the account email does not exist. For troubleshooting, check `https://ktm-ride-mvp-java.onrender.com/health` for non-secret `config.passwordReset` booleans and Render logs for `Password reset email accepted by SMTP`, `Password reset email failed`, or `Password reset requested for unknown account`.

Do not commit the Maps key. On Google Cloud, enable Maps JavaScript API and Directions API for this browser key, then restrict it by HTTP referrer to the Render Static Site domain with a wildcard path such as `https://ridepulse-web.onrender.com/*`, any custom web domain wildcard, and `http://localhost:4200/*` / `http://127.0.0.1:4200/*` only when local live-map testing is needed. Rebuild/redeploy `ridepulse-web` after changing `WEB_GOOGLE_MAPS_API_KEY`; existing static bundles do not pick up new env vars automatically.

After Render provides the web URL, tighten backend `CORS_ORIGIN` from `*` to a comma-separated list such as:

```text
http://localhost:4200,http://127.0.0.1:4200,https://ridepulse-web.onrender.com
```

## 5. Deploy Worker

```powershell
npm run deploy
```

Check health:

```text
https://duke-ride-api.dukeride-kvk.workers.dev/health
```

Expected response:

```json
{"ok":true,"ready":true,"service":"duke-ride-worker","config":{"databaseUrl":true,"jwtSecret":true}}
```

## 6. Point Mobile App To Java API

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
