import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { dateLabel, km, kmh } from '../../core/format';
import { Ride } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { RouteArtComponent } from '../../shared/route-art.component';

type Filter = 'all' | 'month' | 'longest' | 'fastest' | 'unreviewed';

@Component({
  selector: 'app-journal-page',
  standalone: true,
  imports: [FormsModule, LoadingPulseComponent, LucideAngularModule, RouterLink, RouteArtComponent],
  template: `
    <section class="page-title">
      <p class="kicker">EVERY ROAD, REMEMBERED</p>
      <h2>Journal</h2>
      <p>Editorial cards, smart labels, and the routes that made the month.</p>
    </section>

    <div class="filter-bar">
      @for (item of filters; track item.key) {
        <button type="button" [class.active]="filter() === item.key" (click)="choose(item.key)">{{ item.label }}</button>
      }
    </div>

    <section class="search-panel journal-search-panel">
      <label class="search-field">
        <lucide-icon name="search" size="17" />
        <input [(ngModel)]="searchQuery" (keyup.enter)="load()" placeholder="Search title, notes, places" />
      </label>
      <div class="button-row">
        <button type="button" class="primary-action" (click)="load()">
          <lucide-icon name="search" size="17" /> Search
        </button>
        <button type="button" class="secondary-action" (click)="clearSearch()">Clear</button>
        <a class="secondary-action" routerLink="/app/trips">
          <lucide-icon name="folder-open" size="17" /> Trip albums
        </a>
      </div>
    </section>

    @if (error()) {
      <button class="notice danger" type="button" (click)="load()">{{ error() }} Tap to retry.</button>
    }

    @if (loading()) {
      <app-loading-pulse label="Loading your roads" />
    } @else {
      <div class="journal-grid">
        @for (ride of displayed(); track ride.id) {
          <a class="journal-tile" [routerLink]="['/app/journal', ride.id]">
            <div class="tile-art"><app-route-art [points]="ride.routePreview || ride.points" /></div>
            <p>{{ dateLabel(ride.startedAt) }}</p>
            <h3>{{ ride.title || ride.aiTitle || ride.smartTitle || dateLabel(ride.startedAt) + ' ride' }}</h3>
            <span>{{ ride.aiSummary || ride.summaryText || ride.highlightReason || ride.endLabel }}</span>
            <div class="tile-metrics">
              <b>{{ km(ride.distanceM) }}</b>
              <b>{{ kmh(ride.topSpeedKmh) }}</b>
            </div>
          </a>
        } @empty {
          <article class="empty-card">No journeys in this chapter yet.</article>
        }
      </div>
    }
  `
})
export class JournalPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly rides = signal<Ride[]>([]);
  readonly filter = signal<Filter>('all');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly km = km;
  readonly kmh = kmh;
  readonly dateLabel = dateLabel;
  searchQuery = '';
  readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'month', label: 'This month' },
    { key: 'longest', label: 'Longest' },
    { key: 'fastest', label: 'Fastest' },
    { key: 'unreviewed', label: 'Unreviewed' }
  ];

  readonly displayed = computed(() => {
    const rides = [...this.rides()];
    if (this.filter() === 'unreviewed') {
      return rides.filter((ride) => !ride.reviewedAt);
    }
    if (this.filter() === 'longest') {
      return rides.sort((a, b) => Number(b.distanceM || 0) - Number(a.distanceM || 0));
    }
    if (this.filter() === 'fastest') {
      return rides.sort((a, b) => Number(b.topSpeedKmh || 0) - Number(a.topSpeedKmh || 0));
    }
    return rides;
  });

  ngOnInit() {
    void this.load();
  }

  choose(filter: Filter) {
    this.filter.set(filter);
    if (filter === 'month' || this.rides().length === 0) {
      void this.load();
    }
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const period = this.filter() === 'month' ? 'month' : 'all';
      const query = this.searchQuery.trim();
      const response = await this.api.request<{ rides: Ride[] }>(`/rides?period=${period}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
      this.rides.set(Array.isArray(response.rides) ? response.rides : []);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load journal.');
    } finally {
      this.loading.set(false);
    }
  }

  clearSearch() {
    this.searchQuery = '';
    void this.load();
  }
}
