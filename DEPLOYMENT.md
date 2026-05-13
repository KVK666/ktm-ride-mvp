# Online Deployment

This setup is for a small private rider group: one hosted API plus one managed PostgreSQL database.

## Recommended Stack

- Database: Neon PostgreSQL
- Backend API: Render Web Service
- Mobile app: Android development/preview build pointed at the public API URL

## 1. Create Online Postgres

1. Open Neon and create a new project named `ktm-ride`.
2. Copy the pooled PostgreSQL connection string.
3. Keep `sslmode=require` in the URL.

The connection string will look like:

```text
postgresql://user:password@host/dbname?sslmode=require
```

## 2. Deploy Backend on Render

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. If creating manually, use:

```text
Root Directory: backend
Build Command: npm ci
Start Command: npm start
Health Check Path: /health
Region: Singapore
```

4. Add these environment variables:

```text
DATABASE_URL=<your Neon connection string>
DATABASE_SSL=true
JWT_SECRET=<long random secret>
JWT_EXPIRES_IN=30d
CORS_ORIGIN=*
NODE_VERSION=22
```

5. Deploy the service.
6. Open the Render URL and check:

```text
https://your-render-service.onrender.com/health
```

Expected response:

```json
{"ok":true,"service":"ktm-ride-backend"}
```

## 3. Create Database Tables

From your laptop, run these from the backend folder. Replace the URL with your Neon URL.

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
npm run db:migrate
npm run db:seed
```

The seed login is:

```text
Email: rider@example.com
Password: password
```

For your real accounts, use the app Register screen/API, or temporarily create users with `POST /api/auth/register`.

## 4. Point Mobile App to Online API

Edit `mobile/.env`:

```text
EXPO_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com/api
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
GOOGLE_MAPS_API_KEY=your-google-maps-key
```

Then rebuild/reinstall the app:

```powershell
cd "C:\Users\BBS001\Documents\New project\mobile"
npm run android
```

After this, USB is only needed to install/debug the app. Ride saving will go to the online backend.

## 5. Ride Test Without USB

1. Open the app while connected to the internet.
2. Login.
3. Start a short walking test ride first.
4. Stop the ride.
5. Confirm it appears in Dashboard and History.
6. Then test a short bike ride after setting everything before moving.

Do not interact with the phone while riding.
