# RidePulse Web Companion

Angular standalone web companion for RidePulse. It provides the public site, login/register, dashboard, journal, ride details, analytics, reports, profile, and foreground Google route preview.

## Development server

Start a local development server:

```bash
ng serve
```

Then open `http://localhost:4200/`. Companion routes use hash URLs such as `/#/app/home` so browser refreshes keep working on static hosting. Local source keeps the Google Maps key blank by default, so maps fall back to RidePulse route artwork unless a key is configured.

## Google Maps on web

For deployed live maps, set this environment variable on the Render Static Site named `ridepulse-web`:

```bash
WEB_GOOGLE_MAPS_API_KEY=<browser-restricted-google-maps-js-key>
```

In Google Cloud, enable these APIs for that key:

- Maps JavaScript API
- Directions API

Restrict the key by HTTP referrer to the deployed Render/custom web domains, including the wildcard path, for example `https://ridepulse-web.onrender.com/*`. Add `http://localhost:4200/*` and `http://127.0.0.1:4200/*` only if local live-map testing is needed. Rebuild/redeploy the static site after changing the key.

## Building

Build locally:

```bash
ng build
```

Render uses:

```bash
npm run build:render
```

That script writes production environment values from `WEB_API_BASE_URL`, `WEB_FALLBACK_API_BASE_URL`, `WEB_GOOGLE_MAPS_API_KEY`, and APK/release URL variables before building.

## Running unit tests

Run the Vitest-backed Angular unit tests:

```bash
ng test
```
