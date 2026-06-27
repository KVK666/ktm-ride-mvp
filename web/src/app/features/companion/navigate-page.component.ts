import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { GoogleMapsService } from '../../core/google-maps.service';
import { Coordinate, RouteDetails } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { GoogleRouteMapComponent } from '../../shared/google-route-map.component';
import { kmh } from '../../core/format';

@Component({
  selector: 'app-navigate-page',
  standalone: true,
  imports: [FormsModule, GoogleRouteMapComponent, LoadingPulseComponent, LucideAngularModule],
  template: `
    <section class="page-title">
      <p class="kicker">PLAN BEFORE YOU MOVE</p>
      <h2>Route planner</h2>
      <p>A clear route preview for the road ahead. This is foreground planning only, not web ride recording.</p>
    </section>

    <section class="search-panel">
      <label>
        Destination
        <input [(ngModel)]="destination" placeholder="Where are you riding?" (keydown.enter)="requestRoute()" />
      </label>
      <button type="button" class="primary-action" [disabled]="loading()" (click)="requestRoute()">
        <lucide-icon name="navigation" size="18" /> Go
      </button>
    </section>

    @if (error()) {
      <button type="button" class="notice danger" (click)="error.set('')">{{ error() }}</button>
    }

    @if (loading()) {
      <app-loading-pulse label="Building route" />
    } @else {
      <section class="content-section map-section">
        <div class="section-head"><h2>Google route preview</h2><span>{{ route()?.distanceText || '--' }}</span></div>
        <app-google-route-map [points]="route()?.coordinates || fallbackPoints()" [title]="destination || 'Navigation map'" />
      </section>
    }

    <div class="metric-grid">
      <article class="metric-card accent"><span>ETA</span><strong>{{ route()?.durationText || '--' }}</strong></article>
      <article class="metric-card"><span>Remaining</span><strong>{{ route()?.distanceText || '--' }}</strong></article>
      <article class="metric-card"><span>Speed</span><strong>{{ kmh(speed()) }}</strong></article>
      <article class="metric-card"><span>Progress</span><strong>{{ progress() }}%</strong></article>
    </div>

    <section class="content-section">
      <div class="section-head"><h2>Steps</h2><span>{{ route()?.steps?.length || 0 }}</span></div>
      <div class="ride-list">
        @for (step of route()?.steps?.slice(0, 10) || []; track step.instruction) {
          <article class="ride-row">
            <div><strong>{{ step.instruction }}</strong><span>{{ step.distanceText }} / {{ step.durationText }}</span></div>
          </article>
        } @empty {
          <article class="empty-card">Search for a destination to preview directions.</article>
        }
      </div>
    </section>
  `
})
export class NavigatePageComponent implements OnDestroy {
  private readonly maps = inject(GoogleMapsService);
  destination = '';
  readonly route = signal<RouteDetails | null>(null);
  readonly current = signal<Coordinate | null>(null);
  readonly speed = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly kmh = kmh;
  private watchId: number | null = null;

  readonly progress = computed(() => {
    const current = this.current();
    const coordinates = this.route()?.coordinates || [];
    if (!current || coordinates.length < 2) {
      return 0;
    }
    let nearestIndex = 0;
    let nearestDistance = Number.MAX_SAFE_INTEGER;
    coordinates.forEach((coordinate, index) => {
      const dLat = coordinate.latitude - current.latitude;
      const dLon = coordinate.longitude - current.longitude;
      const score = dLat * dLat + dLon * dLon;
      if (score < nearestDistance) {
        nearestDistance = score;
        nearestIndex = index;
      }
    });
    return Math.round((nearestIndex / Math.max(1, coordinates.length - 1)) * 100);
  });

  ngOnDestroy() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
  }

  async requestRoute() {
    if (this.loading()) {
      return;
    }
    if (!this.destination.trim()) {
      this.error.set('Enter a destination first.');
      return;
    }
    if (!window.confirm('Set the destination before riding. Do not interact with the website while moving. Continue with foreground route planning?')) {
      return;
    }
    if (!this.maps.configured) {
      this.error.set('Google Maps is not configured for this web build. Set WEB_GOOGLE_MAPS_API_KEY on the web deployment and redeploy.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const origin = await this.currentPosition();
      this.current.set(origin);
      this.watchLocation();
      this.route.set(await this.maps.route(origin, this.destination.trim()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Navigation unavailable. Check location permission and Maps configuration.');
    } finally {
      this.loading.set(false);
    }
  }

  fallbackPoints() {
    const current = this.current();
    return current ? [current] : [];
  }

  private currentPosition() {
    return new Promise<Coordinate>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Browser location is not available.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }),
        () => reject(new Error('Location permission is required for navigation.')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
    });
  }

  private watchLocation() {
    if (!navigator.geolocation) {
      return;
    }
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.current.set({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        this.speed.set(Math.max(0, (position.coords.speed || 0) * 3.6));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  }
}
