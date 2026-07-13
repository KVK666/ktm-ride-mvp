import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { SavedPlace } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

type CapturedLocation = { latitude: number; longitude: number; accuracy: number | null };

@Component({
  selector: 'app-saved-places-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, LoadingPulseComponent],
  template: `
    <section class="page-title">
      <p class="kicker">SMART ROUTINES</p>
      <h2>Saved places</h2>
      <p>Teach RidePulse your Home, Office, and regular stops so future rides receive names that feel human.</p>
    </section>

    <section class="places-layout">
      <form class="place-form" (submit)="savePlace($event)">
        <div>
          <p class="kicker">ADD WHERE YOU ARE NOW</p>
          <h3>New saved place</h3>
          <p>Ride endpoints are matched inside the radius, allowing for normal GPS drift.</p>
        </div>
        <label>
          Place type
          <select [(ngModel)]="kind" name="kind" (ngModelChange)="kindChanged()">
            <option value="home">Home</option>
            <option value="office">Office</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Place name
          <input [(ngModel)]="label" name="label" maxlength="60" placeholder="Gym, family, favourite cafe" />
        </label>
        <label>
          Matching radius
          <select [(ngModel)]="radiusM" name="radiusM">
            <option [ngValue]="120">120 m · precise</option>
            <option [ngValue]="180">180 m · recommended</option>
            <option [ngValue]="300">300 m · wide</option>
          </select>
        </label>
        <button type="button" class="location-action" [disabled]="locating()" (click)="captureLocation()">
          <lucide-icon name="locate-fixed" size="18" />
          {{ locating() ? 'Finding location...' : captured() ? 'Location captured' : 'Use current location' }}
          @if (captured()?.accuracy != null) { <small>±{{ roundedAccuracy() }} m</small> }
        </button>
        <button type="submit" class="primary-action" [disabled]="saving()">
          <lucide-icon name="bookmark" size="18" /> {{ saving() ? 'Saving...' : 'Save place' }}
        </button>
      </form>

      <section class="place-list" aria-labelledby="your-places-heading">
        <div class="section-head">
          <div><p class="kicker">PRIVATE TO YOUR ACCOUNT</p><h3 id="your-places-heading">Your places</h3></div>
          <span>{{ places().length }} saved</span>
        </div>
        @if (loading()) {
          <app-loading-pulse label="Loading saved places" />
        } @else {
          @for (place of places(); track place.id) {
            <article class="place-card">
              <span class="place-icon"><lucide-icon [name]="placeIcon(place.kind)" size="22" /></span>
              <div>
                <strong>{{ place.label }}</strong>
                <span>{{ place.radiusM }} m match radius · {{ place.kind }}</span>
              </div>
              <button type="button" [disabled]="updatingId() === place.id" (click)="updateHere(place)" title="Move to current location">
                <lucide-icon name="locate-fixed" size="18" />
              </button>
              <button type="button" class="danger" (click)="remove(place)" title="Remove saved place">
                <lucide-icon name="trash-2" size="18" />
              </button>
            </article>
          } @empty {
            <article class="empty-card">No saved places yet. Add Home or Office while you are there.</article>
          }
        }
      </section>
    </section>

    @if (message()) { <button type="button" class="notice" (click)="message.set('')">{{ message() }}</button> }

    <section class="privacy-note">
      <lucide-icon name="shield-check" size="22" />
      <p><strong>Private routine matching.</strong> Saved coordinates are owner-scoped. Optional ride intelligence receives only matched place names, never your full GPS trace.</p>
    </section>
  `,
  styles: `
    :host { display: block; padding-bottom: 34px; }
    .page-title { max-width: 760px; margin-bottom: 26px; }
    .page-title h2 { margin: 5px 0 10px; font-size: clamp(2rem, 4vw, 3.4rem); }
    .page-title p:last-child, .place-form p, .privacy-note p { color: var(--muted); line-height: 1.65; }
    .places-layout { display: grid; grid-template-columns: minmax(300px, .75fr) minmax(0, 1.25fr); gap: 20px; align-items: start; }
    .place-form, .place-list, .privacy-note { border: 1px solid var(--border); border-radius: 28px; background: var(--surface); }
    .place-form { display: grid; gap: 15px; padding: 24px; }
    h3 { margin: 4px 0 0; font-size: 1.45rem; }
    label { display: grid; gap: 7px; color: var(--text-soft); font-size: .8rem; font-weight: 900; }
    input, select { min-height: 50px; padding: 0 14px; border: 1px solid var(--border-strong); border-radius: 15px; color: var(--text); background: var(--background); font: inherit; }
    button { font: inherit; }
    .location-action { min-height: 50px; padding: 0 14px; border: 1px solid var(--border-strong); border-radius: 15px; display: flex; align-items: center; gap: 9px; color: var(--text); background: var(--elevated); cursor: pointer; font-weight: 900; }
    .location-action small { margin-left: auto; color: var(--muted); }
    .place-list { padding: 22px; }
    .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 15px; }
    .section-head > span { color: var(--muted); font-size: .8rem; font-weight: 900; }
    .place-card { min-height: 78px; padding: 12px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 11px; }
    .place-card:first-of-type { border-top: 0; }
    .place-icon { width: 44px; height: 44px; border-radius: 15px; display: grid; place-items: center; color: var(--accent); background: rgba(200,255,90,.08); }
    .place-card > div { flex: 1; min-width: 0; display: grid; gap: 4px; }
    .place-card strong { font-size: 1.05rem; }
    .place-card span { color: var(--muted); font-size: .75rem; text-transform: capitalize; }
    .place-card button { width: 40px; height: 40px; border: 0; border-radius: 13px; display: grid; place-items: center; color: var(--text); background: var(--elevated); cursor: pointer; }
    .place-card button.danger { color: var(--danger); }
    .privacy-note { margin-top: 20px; padding: 18px 20px; display: flex; align-items: flex-start; gap: 12px; color: var(--blue); }
    .privacy-note p { margin: 0; }
    .privacy-note strong { color: var(--text); }
    @media (max-width: 840px) { .places-layout { grid-template-columns: 1fr; } .place-form, .place-list { border-radius: 22px; } }
    @media (max-width: 480px) { .place-card { flex-wrap: wrap; } .place-card > div { flex-basis: calc(100% - 60px); } .place-card button:first-of-type { margin-left: 55px; } }
  `,
})
export class SavedPlacesPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly places = signal<SavedPlace[]>([]);
  readonly loading = signal(true);
  readonly locating = signal(false);
  readonly saving = signal(false);
  readonly updatingId = signal<string | null>(null);
  readonly captured = signal<CapturedLocation | null>(null);
  readonly message = signal('');
  kind: 'home' | 'office' | 'other' = 'home';
  label = 'Home';
  radiusM = 180;

  ngOnInit() { void this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const response = await this.api.request<{ places?: SavedPlace[] }>('/places');
      this.places.set(Array.isArray(response.places) ? response.places : []);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to load saved places.');
    } finally {
      this.loading.set(false);
    }
  }

  kindChanged() {
    if (!this.label.trim() || ['Home', 'Office'].includes(this.label.trim())) {
      this.label = this.kind === 'home' ? 'Home' : this.kind === 'office' ? 'Office' : '';
    }
  }

  async captureLocation() {
    this.locating.set(true);
    this.message.set('');
    try {
      this.captured.set(await this.currentLocation());
      this.message.set('Location captured. You can save it now.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to get your location.');
    } finally {
      this.locating.set(false);
    }
  }

  async savePlace(event: Event) {
    event.preventDefault();
    const location = this.captured();
    if (!location) return this.message.set('Use your current location before saving.');
    if (!this.label.trim()) return this.message.set('Name this place first.');
    this.saving.set(true);
    this.message.set('');
    try {
      await this.api.request('/places', {
        method: 'POST',
        body: JSON.stringify({ label: this.label.trim(), kind: this.kind, radiusM: Number(this.radiusM), latitude: location.latitude, longitude: location.longitude }),
      });
      this.captured.set(null);
      this.message.set(`${this.label.trim()} saved. Future rides can use this name.`);
      await this.load();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to save this place.');
    } finally {
      this.saving.set(false);
    }
  }

  async updateHere(place: SavedPlace) {
    this.updatingId.set(place.id);
    this.message.set('');
    try {
      const location = await this.currentLocation();
      await this.api.request(`/places/${encodeURIComponent(place.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: place.label, kind: place.kind, radiusM: place.radiusM, latitude: location.latitude, longitude: location.longitude }),
      });
      this.message.set(`${place.label} moved to your current location.`);
      await this.load();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to update this place.');
    } finally {
      this.updatingId.set(null);
    }
  }

  async remove(place: SavedPlace) {
    if (!window.confirm(`Remove ${place.label}? It will no longer be used to recognise future rides.`)) return;
    try {
      await this.api.request(`/places/${encodeURIComponent(place.id)}`, { method: 'DELETE' });
      this.places.set(this.places().filter((item) => item.id !== place.id));
      this.message.set(`${place.label} removed.`);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to remove this place.');
    }
  }

  placeIcon(kind: string) { return kind === 'home' ? 'house' : kind === 'office' ? 'building-2' : 'map-pin'; }
  roundedAccuracy() { return Math.round(this.captured()?.accuracy || 0); }

  private currentLocation() {
    return new Promise<CapturedLocation>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Browser location is not available.'));
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null }),
        () => reject(new Error('Location permission is needed to save this place.')),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 5000 },
      );
    });
  }
}
