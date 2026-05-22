# Duke Ride Cloudflare Worker API

Free-tier backend for the Duke Ride mobile app. It keeps the same API paths as the Express backend:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `POST /api/rides`
- `GET /api/rides?period=today|month|year|all`
- `GET /api/rides/:id`
- `DELETE /api/rides/:id`
- `GET /api/analytics/distance?bucket=daily|monthly|yearly`
- `GET /api/analytics/speed/:rideId`
- `GET /api/reports?period=day|month|year&date=2026-05-11`

## Local Validation

```powershell
cd "C:\Users\BBS001\Documents\New project\worker"
npm install
npm run check
```

For local `wrangler dev`, copy `.dev.vars.example` to `.dev.vars` and fill in real values. Do not commit `.dev.vars`.

## Secrets

Set these in Cloudflare before deployment:

```powershell
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
```

Use the same Neon PostgreSQL database URL. Keep `sslmode=require` in the URL.

On Windows, you can also run the helper below. It prompts for the Neon URL with hidden input and can generate a JWT secret for you:

```powershell
npm run setup:secrets
```

## Deploy

```powershell
npm run deploy
```

Then update `mobile/.env`:

```text
EXPO_PUBLIC_API_BASE_URL=https://duke-ride-api.<your-subdomain>.workers.dev/api
```

Rebuild and install the Android release APK after changing the API URL.

The Worker `/health` response should show `ready: true` before pointing the app at it:

```json
{"ok":true,"ready":true,"service":"duke-ride-worker","config":{"databaseUrl":true,"jwtSecret":true}}
```

## Schema Updates

Before deploying code that changes ride storage, rerun the backend schema migration against Neon:

```powershell
cd "C:\Users\BBS001\Documents\New project\backend"
$env:DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
npm run db:migrate
```

The current schema includes `rides.client_ride_id` and a unique index used to make ride uploads idempotent.
