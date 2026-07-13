import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Coordinate, DirectionStep, RouteDetails } from './models';

declare const google: any;

type GoogleMapsWindow = Window & {
  google?: any;
  gm_authFailure?: () => void;
  __ridepulseGoogleMapsInit?: () => void;
};

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private loadPromise: Promise<any> | null = null;

  get configured() {
    return Boolean(environment.googleMapsApiKey);
  }

  async load() {
    if (!this.configured) {
      throw new Error('Google Maps is not configured for this web build. Set WEB_GOOGLE_MAPS_API_KEY and redeploy the web app.');
    }
    const win = window as GoogleMapsWindow;
    if (win.google?.maps) {
      return win.google;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = new Promise((resolve, reject) => {
      let settled = false;
      const previousAuthFailure = win.gm_authFailure;
      const previousInit = win.__ridepulseGoogleMapsInit;
      const cleanup = () => {
        window.clearTimeout(timeout);
        win.gm_authFailure = previousAuthFailure;
        win.__ridepulseGoogleMapsInit = previousInit;
      };
      const fail = (message: string) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        this.loadPromise = null;
        reject(new Error(message));
      };
      const timeout = window.setTimeout(() => {
        fail('Google Maps took too long to load. Check the browser key restrictions, enabled APIs, and network access.');
      }, 15000);
      const finish = () => {
        if (settled) {
          return;
        }
        const loadedGoogle = win.google;
        if (loadedGoogle?.maps) {
          settled = true;
          cleanup();
          resolve(loadedGoogle);
          return;
        }
        fail('Google Maps loaded without the Maps library. Confirm Maps JavaScript API is enabled for this key.');
      };
      win.gm_authFailure = () => {
        fail('Google Maps rejected this browser key. Check WEB_GOOGLE_MAPS_API_KEY, HTTP referrer restrictions, billing, and enabled APIs.');
      };
      win.__ridepulseGoogleMapsInit = finish;
      const existing = document.querySelector<HTMLScriptElement>('script[data-ridepulse-google-maps]');
      if (existing) {
        if (win.google?.maps) {
          finish();
          return;
        }
        existing.addEventListener('load', () => window.setTimeout(finish, 0), { once: true });
        existing.addEventListener('error', () => fail('Google Maps script failed to load. Check WEB_GOOGLE_MAPS_API_KEY and HTTP referrer restrictions.'), { once: true });
        return;
      }

      const script = document.createElement('script');
      const params = new URLSearchParams({
        key: environment.googleMapsApiKey,
        callback: '__ridepulseGoogleMapsInit',
        loading: 'async'
      });
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.defer = true;
      script.dataset['ridepulseGoogleMaps'] = 'true';
      script.onerror = () => fail('Google Maps script failed to load. Check WEB_GOOGLE_MAPS_API_KEY and HTTP referrer restrictions.');
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  async route(origin: Coordinate, destination: string | Coordinate): Promise<RouteDetails> {
    await this.load();
    const directions = new google.maps.DirectionsService();
    const result = await new Promise<any>((resolve, reject) => {
      directions.route(
        {
          origin: toLatLngLiteral(origin),
          destination: typeof destination === 'string' ? destination : toLatLngLiteral(destination),
          travelMode: google.maps.TravelMode.DRIVING
        },
        (response: any, status: string) => {
          if (status === 'OK' && response?.routes?.[0]) {
            resolve(response);
          } else {
            reject(new Error(status === 'ZERO_RESULTS' ? 'Route was not found.' : mapsStatusMessage(status)));
          }
        }
      );
    });

    const route = result.routes[0];
    const leg = route.legs?.[0] || {};
    const coordinates = route.overview_path?.map((point: any) => ({
      latitude: point.lat(),
      longitude: point.lng()
    })) || [];
    const steps: DirectionStep[] = Array.isArray(leg.steps)
      ? leg.steps.map((step: any) => ({
          instruction: stripHtml(step.instructions || ''),
          distanceText: String(step.distance?.text || ''),
          durationText: String(step.duration?.text || ''),
          start: fromLatLng(step.start_location),
          end: fromLatLng(step.end_location)
        }))
      : [];

    return {
      coordinates,
      steps,
      distanceText: String(leg.distance?.text || ''),
      durationText: String(leg.duration?.text || ''),
      distanceM: Number(leg.distance?.value || 0),
      durationS: Number(leg.duration?.value || 0)
    };
  }
}

export function validCoordinate(value?: Coordinate | null): value is Coordinate {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function googleMapsRouteUrl(points: Coordinate[]) {
  const valid = points.filter(validCoordinate);
  const start = valid[0];
  const end = valid[valid.length - 1];
  if (!start || !end) {
    return 'https://www.google.com/maps';
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${start.latitude},${start.longitude}&destination=${end.latitude},${end.longitude}&travelmode=driving`;
}

function toLatLngLiteral(point: Coordinate) {
  return { lat: Number(point.latitude), lng: Number(point.longitude) };
}

function fromLatLng(point: any): Coordinate {
  return { latitude: Number(point?.lat?.() || 0), longitude: Number(point?.lng?.() || 0) };
}

function stripHtml(value: string) {
  const container = document.createElement('div');
  container.innerHTML = value;
  return container.textContent || container.innerText || value;
}

function mapsStatusMessage(status: string) {
  if (status === 'REQUEST_DENIED') {
    return 'Google Maps denied this request. Check key restrictions and that Directions API is enabled.';
  }
  if (status === 'OVER_QUERY_LIMIT') {
    return 'Google Maps quota was exceeded for this key.';
  }
  if (status === 'INVALID_REQUEST') {
    return 'Google Maps could not use this origin or destination.';
  }
  return `Maps route failed: ${status}`;
}
