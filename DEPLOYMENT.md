# Online Deployment

This setup is for a small private rider group. The current active production API is the Render Express service backed by Neon PostgreSQL. The Angular website can deploy as a Render Static Site next to that API. Cloudflare Worker notes remain useful as fallback/reference.

## Recommended Stack

- Database: Neon PostgreSQL
- Backend API: Render Express service
- Web: Render Static Site
- Mobile app: standalone Android release APK pointed at the Worker API URL

The old Express backend is still kept in `backend/` for local development/reference and Render fallback, but production should use `worker/` to avoid Render free-tier sleeping.

Current Worker URL:

```text
https://duke-ride-api.dukeride-kvk.workers.dev
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
- `ridepulse-web`: Angular Render Static Site.

The web static site uses:

```text
Build command: cd web && npm ci && npm run build:render
Publish path: web/dist/web/browser
Rewrite: /* -> /index.html
```

Set these Render environment variables on `ridepulse-web`:

```text
WEB_API_BASE_URL=https://ktm-ride-mvp.onrender.com/api
WEB_GOOGLE_MAPS_API_KEY=<browser-restricted-google-maps-js-key>
WEB_APK_URL=https://github.com/KVK666/ktm-ride-mvp/releases/tag/latest
```

Do not commit the Maps key. Restrict it in Google Cloud to local dev and the Render/custom web domains.

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

## 6. Point Mobile App To Cloudflare

Edit `mobile/.env`:

```text
EXPO_PUBLIC_API_BASE_URL=https://duke-ride-api.<your-subdomain>.workers.dev/api
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
6. Export diagnostics if any request fails.

Do not interact with the phone while riding.
