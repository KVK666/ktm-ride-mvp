import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { dateLabel, km, kmh } from '../../core/format';
import { Ride, Trip } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { RouteArtComponent } from '../../shared/route-art.component';

@Component({
  selector: 'app-trip-detail-page',
  standalone: true,
  imports: [FormsModule, LoadingPulseComponent, LucideAngularModule, RouterLink, RouteArtComponent],
  template: `
    <a class="back-link" routerLink="/app/trips">Back to trips</a>
    @if (loading()) {
      <app-loading-pulse label="Loading trip album" />
    } @else if (trip(); as current) {
      <section class="detail-hero">
        <div>
          <p class="kicker">TRIP ALBUM</p>
          <h2>{{ current.title }}</h2>
          <p>{{ current.description || 'A manual album of rides from your journal.' }}</p>
          <div class="badge-row">
            <span>{{ current.rideCount || rides().length }} rides</span>
            <span>{{ km(current.distanceM) }}</span>
            @if (current.startedAt) {
              <span>{{ dateLabel(current.startedAt) }}</span>
            }
          </div>
        </div>
        <div class="detail-art">
          @if (rides()[0]; as firstRide) {
            <app-route-art [points]="firstRide.routePreview || firstRide.points" />
          }
        </div>
      </section>

      @if (message()) {
        <button class="notice" type="button" (click)="message.set('')">{{ message() }}</button>
      }
      @if (error()) {
        <button class="notice danger" type="button" (click)="load()">{{ error() }} Tap to retry.</button>
      }

      <section class="content-section search-panel">
        <div class="section-head">
          <h2>Add rides</h2>
          <span>Search journal</span>
        </div>
        <label class="search-field">
          <lucide-icon name="search" size="17" />
          <input [(ngModel)]="searchQuery" (keyup.enter)="searchRides()" placeholder="Search title, notes, places" />
        </label>
        <div class="button-row">
          <button type="button" class="primary-action" [disabled]="searching()" (click)="searchRides()">
            <lucide-icon name="search" size="17" /> {{ searching() ? 'Searching...' : 'Search rides' }}
          </button>
          <button type="button" class="secondary-action" (click)="clearSearch()">Clear</button>
        </div>
        @if (searchResults().length) {
          <div class="ride-list search-results">
            @for (ride of availableSearchResults(); track ride.id) {
              <article class="ride-row">
                <div>
                  <strong>{{ ride.title || ride.aiTitle || ride.smartTitle || dateLabel(ride.startedAt) + ' ride' }}</strong>
                  <span>{{ dateLabel(ride.startedAt) }} / {{ km(ride.distanceM) }} / {{ kmh(ride.topSpeedKmh) }}</span>
                </div>
                <button type="button" class="primary-action compact-action" [disabled]="addingRideId() === ride.id" (click)="addRide(ride)">
                  <lucide-icon name="plus-circle" size="16" /> {{ addingRideId() === ride.id ? 'Adding...' : 'Add' }}
                </button>
              </article>
            } @empty {
              <article class="empty-card">Matching rides are already in this trip.</article>
            }
          </div>
        }
      </section>

      <section class="content-section">
        <div class="section-head">
          <h2>Rides in this trip</h2>
          <span>{{ rides().length }}</span>
        </div>
        <div class="journal-grid">
          @for (ride of rides(); track ride.id) {
            <article class="journal-tile trip-ride-tile">
              <a [routerLink]="['/app/journal', ride.id]">
                <div class="tile-art"><app-route-art [points]="ride.routePreview || ride.points" /></div>
                <p>{{ dateLabel(ride.startedAt) }}</p>
                <h3>{{ ride.title || ride.aiTitle || ride.smartTitle || dateLabel(ride.startedAt) + ' ride' }}</h3>
                <span>{{ ride.aiSummary || ride.summaryText || ride.highlightReason || ride.endLabel }}</span>
                <div class="tile-metrics">
                  <b>{{ km(ride.distanceM) }}</b>
                  <b>{{ kmh(ride.topSpeedKmh) }}</b>
                </div>
              </a>
              <button type="button" class="secondary-action remove-trip-ride" [disabled]="removingRideId() === ride.id" (click)="removeRide(ride)">
                <lucide-icon name="trash-2" size="16" /> {{ removingRideId() === ride.id ? 'Removing...' : 'Remove' }}
              </button>
            </article>
          } @empty {
            <article class="empty-card">No rides in this trip yet. Search above to add one.</article>
          }
        </div>
      </section>

      <section class="content-section danger-card">
        <div class="section-head"><h2>Trip controls</h2><span>Album only</span></div>
        <p>Deleting this trip keeps the rides and their photos in your journal.</p>
        <button type="button" class="delete-ride-button" [disabled]="deleting()" (click)="deleteTrip()">
          <lucide-icon name="trash-2" size="18" /> {{ deleting() ? 'Deleting...' : 'Delete trip' }}
        </button>
      </section>
    } @else {
      <article class="empty-card">{{ error() || 'Trip unavailable.' }}</article>
    }
  `
})
export class TripDetailPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly trip = signal<Trip | null>(null);
  readonly rides = signal<Ride[]>([]);
  readonly searchResults = signal<Ride[]>([]);
  readonly loading = signal(false);
  readonly searching = signal(false);
  readonly deleting = signal(false);
  readonly addingRideId = signal('');
  readonly removingRideId = signal('');
  readonly error = signal('');
  readonly message = signal('');
  readonly km = km;
  readonly kmh = kmh;
  readonly dateLabel = dateLabel;
  searchQuery = '';
  readonly availableSearchResults = computed(() => {
    const existing = new Set(this.rides().map((ride) => ride.id));
    return this.searchResults().filter((ride) => !existing.has(ride.id));
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Trip id is missing.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await this.api.request<{ trip: Trip; rides: Ride[] }>(`/trips/${encodeURIComponent(id)}`);
      this.trip.set(response.trip || null);
      this.rides.set(Array.isArray(response.rides) ? response.rides : []);
    } catch (error: unknown) {
      this.trip.set(null);
      this.rides.set([]);
      this.error.set(error instanceof Error ? error.message : 'Unable to load trip.');
    } finally {
      this.loading.set(false);
    }
  }

  async searchRides() {
    this.searching.set(true);
    this.message.set('');
    try {
      const query = this.searchQuery.trim();
      const response = await this.api.request<{ rides: Ride[] }>(`/rides?period=all${query ? `&q=${encodeURIComponent(query)}` : ''}`);
      this.searchResults.set(Array.isArray(response.rides) ? response.rides : []);
      if (!response.rides?.length) {
        this.message.set('No rides matched that search.');
      }
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'Unable to search rides.');
    } finally {
      this.searching.set(false);
    }
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults.set([]);
  }

  async addRide(ride: Ride) {
    const trip = this.trip();
    if (!trip || this.addingRideId()) {
      return;
    }
    this.addingRideId.set(ride.id);
    this.message.set('');
    try {
      const response = await this.api.request<{ trip: Trip; rides: Ride[] }>(`/trips/${encodeURIComponent(trip.id)}/rides`, {
        method: 'POST',
        body: JSON.stringify({ rideId: ride.id })
      });
      this.trip.set(response.trip || trip);
      this.rides.set(Array.isArray(response.rides) ? response.rides : [...this.rides(), ride]);
      this.message.set('Ride added to trip.');
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'Unable to add ride.');
    } finally {
      this.addingRideId.set('');
    }
  }

  async removeRide(ride: Ride) {
    const trip = this.trip();
    if (!trip || this.removingRideId()) {
      return;
    }
    if (!window.confirm(`Remove this ride from ${trip.title}? The ride stays in your journal.`)) {
      return;
    }
    this.removingRideId.set(ride.id);
    try {
      const response = await this.api.request<{ trip: Trip; rides: Ride[] }>(`/trips/${encodeURIComponent(trip.id)}/rides/${encodeURIComponent(ride.id)}`, { method: 'DELETE' });
      this.trip.set(response.trip || trip);
      this.rides.set(Array.isArray(response.rides) ? response.rides : this.rides().filter((item) => item.id !== ride.id));
      this.message.set('Ride removed from trip.');
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'Unable to remove ride.');
    } finally {
      this.removingRideId.set('');
    }
  }

  async deleteTrip() {
    const trip = this.trip();
    if (!trip || this.deleting()) {
      return;
    }
    if (!window.confirm(`Delete ${trip.title}? Rides and photos stay in your journal.`)) {
      return;
    }
    this.deleting.set(true);
    try {
      await this.api.request(`/trips/${encodeURIComponent(trip.id)}`, { method: 'DELETE' });
      await this.router.navigate(['/app/trips']);
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'Unable to delete trip.');
    } finally {
      this.deleting.set(false);
    }
  }
}
