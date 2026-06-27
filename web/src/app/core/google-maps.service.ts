import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Coordinate, DirectionStep, RouteDetails } from './models';

declare const google: any;

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private loadPromise: Promise<any> | null = null;

  get configured() {
    return Boolean(environment.googleMapsApiKey);
  }

  async load() {
    if (!this.configured) {
      throw new Error('Google Maps key is not configured.');
    }
    if ((window as any).google?.maps) {
      return (window as any).google;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-ridepulse-google-maps]');
      if (existing) {
        existing.addEventListener('load', () => resolve((window as any).google));
        existing.addEventListener('error', () => reject(new Error('Google Maps failed to load.')));
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(environment.googleMapsApiKey)}`;
      script.async = true;
      script.defer = true;
      script.dataset['ridepulseGoogleMaps'] = 'true';
      script.onload = () => resolve((window as any).google);
      script.onerror = () => reject(new Error('Google Maps failed to load.'));
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  async route(origin: Coordinate, destinationText: string): Promise<RouteDetails> {
    await this.load();
    const directions = new google.maps.DirectionsService();
    const result = await new Promise<any>((resolve, reject) => {
      directions.route(
        {
          origin: toLatLngLiteral(origin),
          destination: destinationText,
          travelMode: google.maps.TravelMode.DRIVING
        },
        (response: any, status: string) => {
          if (status === 'OK' && response?.routes?.[0]) {
            resolve(response);
          } else {
            reject(new Error(status === 'ZERO_RESULTS' ? 'Route was not found.' : `Maps route failed: ${status}`));
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
