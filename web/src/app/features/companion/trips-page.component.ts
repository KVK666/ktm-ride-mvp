import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { dateLabel, km } from '../../core/format';
import { Trip } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

const INITIAL_VISIBLE_TRIPS = 24;
const VISIBLE_TRIP_INCREMENT = 24;

@Component({
  selector: 'app-trips-page',
  standalone: true,
  imports: [FormsModule, LoadingPulseComponent, LucideAngularModule, RouterLink],
  template: `
    <section class="page-title">
      <p class="kicker">TRIP ALBUMS</p>
      <h2>Trips</h2>
      <p>Manual albums for grouping related rides without changing the original ride journal.</p>
    </section>

    <section class="search-panel trip-create-panel">
      <div class="section-head">
        <h2>New trip album</h2>
        <span>{{ trips().length }} saved</span>
      </div>
      <label class="search-field">
        <lucide-icon name="search" size="17" />
        <input
          [ngModel]="searchQuery()"
          (ngModelChange)="setSearchQuery($event)"
          aria-label="Search trip albums"
          placeholder="Search trip titles and notes"
        />
      </label>
      <label>
        Trip title
        <input maxlength="120" [(ngModel)]="titleDraft" placeholder="Coastal weekend, monsoon loop..." />
      </label>
      <label>
        Notes
        <textarea maxlength="1000" [(ngModel)]="descriptionDraft" placeholder="Optional notes"></textarea>
      </label>
      <div class="button-row">
        <button type="button" class="primary-action" [disabled]="saving()" (click)="createTrip()">
          <lucide-icon name="plus-circle" size="17" /> {{ saving() ? 'Creating...' : 'Create trip' }}
        </button>
        <button type="button" class="secondary-action" (click)="load()">
          <lucide-icon name="refresh-cw" size="17" /> Refresh
        </button>
        @if (searchQuery().trim()) {
          <button type="button" class="secondary-action" (click)="clearSearch()">Clear search</button>
        }
      </div>
    </section>

    @if (message()) {
      <button class="notice" type="button" (click)="message.set('')">{{ message() }}</button>
    }
    @if (error()) {
      <button class="notice danger" type="button" (click)="load()">{{ error() }} Tap to retry.</button>
    }

    @if (loading()) {
      <app-loading-pulse label="Loading trip albums" />
    } @else {
      @if (displayedTrips().length) {
        <div class="journal-grid trips-grid">
          @for (trip of displayedTrips(); track trip.id) {
            <a class="journal-tile trip-tile" [routerLink]="['/app/trips', trip.id]">
              <div class="trip-tile-icon"><lucide-icon name="folder-open" size="28" /></div>
              <p>{{ trip.startedAt ? dateLabel(trip.startedAt) : 'New trip' }}</p>
              <h3>{{ trip.title }}</h3>
              <span>{{ trip.description || 'Manual ride album' }}</span>
              <div class="tile-metrics">
                <b>{{ trip.rideCount || 0 }} rides</b>
                <b>{{ km(trip.distanceM) }}</b>
              </div>
            </a>
          }
        </div>
      } @else if (trips().length) {
        <article class="empty-card">No trip albums match your search.</article>
      } @else {
          <article class="empty-card">No trip albums yet. Create one above, then add rides from Ride Detail.</article>
      }
      @if (hasMore()) {
        <button type="button" class="secondary-action journal-more" (click)="loadMore()">
          Load more trip albums
        </button>
      }
    }
  `
})
export class TripsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly trips = signal<Trip[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly searchQuery = signal('');
  readonly visibleTripCount = signal(INITIAL_VISIBLE_TRIPS);
  readonly km = km;
  readonly dateLabel = dateLabel;
  readonly filteredTrips = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.trips();
    return this.trips().filter((trip) =>
      [trip.title, trip.description].some((value) => typeof value === 'string' && value.toLowerCase().includes(query)),
    );
  });
  readonly displayedTrips = computed(() => this.filteredTrips().slice(0, this.visibleTripCount()));
  readonly hasMore = computed(() => this.displayedTrips().length < this.filteredTrips().length);
  titleDraft = '';
  descriptionDraft = '';

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    this.visibleTripCount.set(INITIAL_VISIBLE_TRIPS);
    try {
      const response = await this.api.request<{ trips?: Trip[] }>('/trips');
      this.trips.set(Array.isArray(response.trips) ? response.trips : []);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load trip albums.');
    } finally {
      this.loading.set(false);
    }
  }

  setSearchQuery(query: string) {
    this.searchQuery.set(query);
    this.visibleTripCount.set(INITIAL_VISIBLE_TRIPS);
  }

  clearSearch() {
    this.setSearchQuery('');
  }

  loadMore() {
    this.visibleTripCount.update((count) => count + VISIBLE_TRIP_INCREMENT);
  }

  async createTrip() {
    const title = this.titleDraft.trim();
    if (!title || this.saving()) {
      this.message.set('Name the trip album first.');
      return;
    }
    this.saving.set(true);
    this.message.set('');
    try {
      const response = await this.api.request<{ trip: Trip }>('/trips', {
        method: 'POST',
        body: JSON.stringify({ title, description: this.descriptionDraft.trim() || null })
      });
      this.titleDraft = '';
      this.descriptionDraft = '';
      await this.load();
      if (response.trip?.id) {
        await this.router.navigate(['/app/trips', response.trip.id]);
      }
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'Unable to create trip.');
    } finally {
      this.saving.set(false);
    }
  }
}
