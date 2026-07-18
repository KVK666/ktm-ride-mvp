import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { GoogleMapsService } from '../../core/google-maps.service';
import { Coordinate, RouteDetails, SavedPlace } from '../../core/models';
import { ApiService } from '../../core/api.service';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { GoogleRouteMapComponent } from '../../shared/google-route-map.component';

@Component({
  selector: 'app-navigate-page',
  standalone: true,
  imports: [FormsModule, GoogleRouteMapComponent, LoadingPulseComponent, LucideAngularModule],
  template: `
    <section class="page-title">
      <p class="kicker">PLAN BEFORE YOU MOVE</p>
      <h1>Plan a ride</h1>
      <p>Preview a route, use a saved place, then record the ride in Android. This website never records GPS rides.</p>
    </section>

    @if (savedPlaces().length) {
      <div class="filter-bar" role="group" aria-label="Saved destinations">
        @for (place of savedPlaces(); track place.id) {
          <button type="button" [class.active]="selectedPlace()?.id === place.id" (click)="choosePlace(place)">
            <lucide-icon [name]="place.kind === 'home' ? 'house' : place.kind === 'office' ? 'building-2' : 'map-pin'" size="15" />
            {{ place.label }}
          </button>
        }
      </div>
    }

    <div class="plan-section-head">
      <div>
        <p class="kicker">SAVED DESTINATIONS</p>
        <h3>Places that make your rides familiar</h3>
      </div>
      <button type="button" class="secondary-action" (click)="placesOpen.set(!placesOpen())" [attr.aria-expanded]="placesOpen()">
        <lucide-icon [name]="placesOpen() ? 'chevron-up' : 'bookmark'" size="17" />
        {{ placesOpen() ? 'Hide places' : 'Manage places' }}
      </button>
    </div>

    @if (placesOpen()) {
      <section class="places-layout" id="saved-places" aria-label="Saved places management">
        <form class="place-form" (submit)="savePlace($event)">
          <div>
            <p class="kicker">{{ editingPlace() ? 'EDIT SAVED PLACE' : 'ADD A SAVED PLACE' }}</p>
            <h3>{{ editingPlace() ? 'Update this place' : 'New saved place' }}</h3>
            <p>Use the current location or enter coordinates. RidePulse uses the radius to match normal GPS drift.</p>
          </div>
          <label>Place type
            <select [(ngModel)]="placeKind" name="placeKind" (ngModelChange)="placeKindChanged()">
              <option value="home">Home</option><option value="office">Office</option><option value="other">Other</option>
            </select>
          </label>
          <label>Place name <input [(ngModel)]="placeLabel" name="placeLabel" maxlength="60" placeholder="Gym, family, favourite cafe" /></label>
          <label>Matching radius
            <select [(ngModel)]="placeRadiusM" name="placeRadiusM">
              <option [ngValue]="120">120 m · precise</option><option [ngValue]="180">180 m · recommended</option><option [ngValue]="300">300 m · wide</option>
            </select>
          </label>
          <div class="coordinate-grid">
            <label>Latitude <input [(ngModel)]="placeLatitude" name="placeLatitude" inputmode="decimal" placeholder="12.9716" /></label>
            <label>Longitude <input [(ngModel)]="placeLongitude" name="placeLongitude" inputmode="decimal" placeholder="77.5946" /></label>
          </div>
          <button type="button" class="location-action" [disabled]="locating()" (click)="capturePlaceLocation()">
            <lucide-icon name="locate-fixed" size="18" /> {{ locating() ? 'Finding location...' : 'Use current location' }}
            @if (capturedAccuracy() != null) { <small>±{{ roundedAccuracy() }} m</small> }
          </button>
          <div class="button-row">
            <button type="submit" class="primary-action" [disabled]="savingPlace()"><lucide-icon name="bookmark" size="17" /> {{ savingPlace() ? 'Saving...' : editingPlace() ? 'Save changes' : 'Save place' }}</button>
            @if (editingPlace()) { <button type="button" class="secondary-action" (click)="cancelEditPlace()">Cancel</button> }
          </div>
        </form>
        <section class="place-list" aria-labelledby="your-places-heading">
          <div class="section-head"><div><p class="kicker">PRIVATE TO YOUR ACCOUNT</p><h3 id="your-places-heading">Your places</h3></div><button type="button" class="icon-button" title="Retry loading saved places" (click)="loadPlaces()"><lucide-icon name="refresh-cw" size="17" /></button></div>
          @if (placesLoading()) { <app-loading-pulse label="Loading saved places" /> }
          @if (placesError()) { <button type="button" class="notice danger" (click)="loadPlaces()">{{ placesError() }} Tap to retry.</button> }
          @if (!placesLoading() && !placesError()) {
            @for (place of savedPlaces(); track place.id) {
              <article class="place-card">
                <span class="place-icon"><lucide-icon [name]="placeIcon(place.kind)" size="22" /></span>
                <div><strong>{{ place.label }}</strong><span>{{ place.radiusM }} m radius · {{ place.kind }} · {{ coordinateLabel(place) }}</span></div>
                <button type="button" title="Use for route preview" (click)="choosePlace(place)"><lucide-icon name="navigation" size="17" /></button>
                <button type="button" title="Edit saved place" (click)="editPlace(place)"><lucide-icon name="pencil" size="17" /></button>
                <button type="button" class="danger" title="Remove saved place" (click)="removePlace(place)"><lucide-icon name="trash-2" size="17" /></button>
              </article>
            } @empty { <article class="empty-card">No saved places yet. Add Home, Office, or a regular stop above.</article> }
          }
        </section>
      </section>
    }

    <section class="search-panel">
      <label>
        Destination
        <input [(ngModel)]="destination" (ngModelChange)="selectedPlace.set(null)" placeholder="Where are you riding?" (keydown.enter)="requestRoute()" />
      </label>
      <button type="button" class="primary-action" [disabled]="loading()" (click)="requestRoute()">
        <lucide-icon name="navigation" size="18" /> Preview route
      </button>
    </section>

    @if (error()) {
      <button type="button" class="notice danger" (click)="error.set('')">{{ error() }}</button>
    }

    @if (loading()) {
      <app-loading-pulse label="Building route" />
    } @else {
      <section class="content-section map-section">
        <div class="section-head"><h2>Route preview</h2><span>{{ route()?.distanceText || '--' }}</span></div>
        <app-google-route-map [points]="route()?.coordinates || fallbackPoints()" [title]="destination || 'Navigation map'" />
      </section>
    }

    <div class="metric-grid">
      <article class="metric-card accent"><span>ETA</span><strong>{{ route()?.durationText || '--' }}</strong></article>
      <article class="metric-card"><span>Remaining</span><strong>{{ route()?.distanceText || '--' }}</strong></article>
      <article class="metric-card"><span>Recording</span><strong>Android</strong></article>
      <article class="metric-card"><span>Location</span><strong>One-time</strong></article>
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

    <section class="content-section plan-safety-card">
      <lucide-icon name="smartphone" size="22" />
      <div><strong>Ready to record?</strong><p>Use RidePulse for Android to start, recover, and safely save a GPS ride. This preview stops location access as soon as the route is ready.</p></div>
      <a class="primary-action" href="https://github.com/KVK666/ride-pulse/releases/tag/latest" target="_blank" rel="noreferrer">Record in Android</a>
    </section>
  `,
  styles: `
    .plan-section-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:24px 0 14px; }
    .plan-section-head h3 { margin:4px 0 0; font-size:1.2rem; }
    .places-layout { display:grid; grid-template-columns:minmax(280px,.78fr) minmax(0,1.22fr); gap:18px; margin-bottom:24px; }
    .place-form,.place-list { border:1px solid var(--border); border-radius:22px; padding:20px; background:var(--surface); }
    .place-form { display:grid; gap:12px; }
    .place-form h3 { margin:4px 0; } .place-form p { margin:0; color:var(--muted); line-height:1.5; }
    .place-form label { display:grid; gap:6px; color:var(--muted); font-size:.78rem; font-weight:900; }
    .place-form input,.place-form select { min-height:44px; border:1px solid var(--border-strong); border-radius:12px; padding:0 11px; color:var(--text); background:var(--background); font:inherit; }
    .coordinate-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .location-action { min-height:44px; border:1px solid var(--border-strong); border-radius:12px; display:flex; align-items:center; gap:8px; padding:0 12px; color:var(--text); background:var(--elevated); font:inherit; font-weight:900; cursor:pointer; }
    .location-action small { margin-left:auto; color:var(--muted); }
    .place-list .section-head { align-items:flex-end; } .place-list h3 { margin:4px 0 0; }
    .icon-button,.place-card button { width:40px; min-height:40px; border:0; border-radius:12px; display:grid; place-items:center; color:var(--text); background:var(--elevated); cursor:pointer; }
    .place-card { min-height:72px; display:flex; align-items:center; gap:9px; padding:10px 0; border-top:1px solid var(--border); }
    .place-card > div { flex:1; min-width:0; display:grid; gap:3px; } .place-card span { color:var(--muted); font-size:.74rem; }
    .place-icon { width:42px; min-height:42px; border-radius:14px; display:grid; place-items:center; color:var(--accent) !important; background:rgba(200,255,90,.08); }
    .place-card button.danger { color:var(--danger); }
    @media (max-width:760px) { .places-layout { grid-template-columns:1fr; } .plan-section-head { align-items:flex-start; } .coordinate-grid { grid-template-columns:1fr; } .place-card { flex-wrap:wrap; } .place-card > div { flex-basis:calc(100% - 54px); } .place-card button { margin-left:51px; } .place-card button ~ button { margin-left:0; } }
  `
})
export class NavigatePageComponent implements OnInit {
  private readonly maps = inject(GoogleMapsService);
  private readonly api = inject(ApiService);
  private readonly routeParams = inject(ActivatedRoute);
  destination = '';
  readonly savedPlaces = signal<SavedPlace[]>([]);
  readonly selectedPlace = signal<SavedPlace | null>(null);
  readonly route = signal<RouteDetails | null>(null);
  readonly current = signal<Coordinate | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly placesOpen = signal(false);
  readonly placesLoading = signal(false);
  readonly placesError = signal('');
  readonly savingPlace = signal(false);
  readonly locating = signal(false);
  readonly editingPlace = signal<SavedPlace | null>(null);
  readonly capturedAccuracy = signal<number | null>(null);
  placeKind: 'home' | 'office' | 'other' = 'home';
  placeLabel = 'Home';
  placeRadiusM = 180;
  placeLatitude = '';
  placeLongitude = '';

  ngOnInit() {
    this.placesOpen.set(this.routeParams.snapshot.data['planView'] === 'places');
    void this.loadPlaces();
  }

  choosePlace(place: SavedPlace) {
    this.selectedPlace.set(place);
    this.destination = place.label;
    this.error.set('');
  }

  async loadPlaces() {
    this.placesLoading.set(true);
    this.placesError.set('');
    try {
      const response = await this.api.request<{ places?: SavedPlace[] }>('/places');
      this.savedPlaces.set(Array.isArray(response.places) ? response.places : []);
    } catch (error) {
      this.placesError.set(error instanceof Error ? error.message : 'Unable to load saved places.');
    } finally {
      this.placesLoading.set(false);
    }
  }

  placeKindChanged() {
    if (!this.placeLabel.trim() || ['Home', 'Office'].includes(this.placeLabel.trim())) {
      this.placeLabel = this.placeKind === 'home' ? 'Home' : this.placeKind === 'office' ? 'Office' : '';
    }
  }

  editPlace(place: SavedPlace) {
    this.editingPlace.set(place);
    this.placeKind = place.kind === 'office' || place.kind === 'other' ? place.kind : 'home';
    this.placeLabel = place.label;
    this.placeRadiusM = place.radiusM;
    this.placeLatitude = String(place.latitude);
    this.placeLongitude = String(place.longitude);
    this.capturedAccuracy.set(null);
  }

  cancelEditPlace() {
    this.editingPlace.set(null);
    this.placeKind = 'home'; this.placeLabel = 'Home'; this.placeRadiusM = 180;
    this.placeLatitude = ''; this.placeLongitude = ''; this.capturedAccuracy.set(null);
  }

  async capturePlaceLocation() {
    this.locating.set(true);
    this.placesError.set('');
    try {
      const location = await this.currentPosition();
      this.placeLatitude = String(location.latitude);
      this.placeLongitude = String(location.longitude);
      this.capturedAccuracy.set(location.accuracy);
    } catch (error) {
      this.placesError.set(error instanceof Error ? error.message : 'Unable to get your current location.');
    } finally { this.locating.set(false); }
  }

  async savePlace(event: Event) {
    event.preventDefault();
    if (this.savingPlace()) return;
    const label = this.placeLabel.trim();
    const latitude = Number(this.placeLatitude);
    const longitude = Number(this.placeLongitude);
    if (!label || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      this.placesError.set('Enter a name and valid latitude/longitude, or use your current location.');
      return;
    }
    this.savingPlace.set(true); this.placesError.set('');
    const payload = { label, kind: this.placeKind, radiusM: Number(this.placeRadiusM), latitude, longitude };
    try {
      const editing = this.editingPlace();
      await this.api.request(editing ? `/places/${encodeURIComponent(editing.id)}` : '/places', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      this.cancelEditPlace();
      await this.loadPlaces();
    } catch (error) {
      this.placesError.set(error instanceof Error ? error.message : 'Unable to save this place.');
    } finally { this.savingPlace.set(false); }
  }

  async removePlace(place: SavedPlace) {
    if (!window.confirm(`Remove ${place.label}? It will no longer be used to recognise future rides.`)) return;
    this.placesError.set('');
    try {
      await this.api.request(`/places/${encodeURIComponent(place.id)}`, { method: 'DELETE' });
      this.savedPlaces.set(this.savedPlaces().filter((item) => item.id !== place.id));
      if (this.selectedPlace()?.id === place.id) this.selectedPlace.set(null);
      if (this.editingPlace()?.id === place.id) this.cancelEditPlace();
    } catch (error) { this.placesError.set(error instanceof Error ? error.message : 'Unable to remove this place.'); }
  }

  placeIcon(kind: string) { return kind === 'home' ? 'house' : kind === 'office' ? 'building-2' : 'map-pin'; }
  coordinateLabel(place: SavedPlace) { return `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`; }
  roundedAccuracy() { return Math.round(this.capturedAccuracy() || 0); }

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
      const selected = this.selectedPlace();
      const destination = selected && this.destination.trim() === selected.label
        ? { latitude: selected.latitude, longitude: selected.longitude }
        : this.destination.trim();
      this.route.set(await this.maps.route(origin, destination));
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
    return new Promise<Coordinate & { accuracy: number | null }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Browser location is not available.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }),
        () => reject(new Error('Location permission is required for navigation.')),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 5000 }
      );
    });
  }

}
