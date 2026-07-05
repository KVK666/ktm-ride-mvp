import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { dateLabel, duration, km, kmh } from '../../core/format';
import { DashboardStats, JournalHighlight, JournalResponse, Ride } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { RouteArtComponent } from '../../shared/route-art.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [LoadingPulseComponent, LucideAngularModule, RouterLink, RouteArtComponent],
  template: `
    @if (loading()) {
      <app-loading-pulse label="Loading your ride journal" />
    } @else {
      <section class="page-grid">
        <article class="hero-card">
          <p class="kicker">RIDEPULSE JOURNAL</p>
          <h2>{{ latest()?.title || latest()?.aiTitle || latest()?.smartTitle || 'The road remembers.' }}</h2>
          <p>{{ latest()?.aiSummary || latest()?.summaryText || latest()?.highlightReason || 'Start a ride in the mobile app and your web companion will light up here.' }}</p>
          <div class="route-preview"><app-route-art [points]="latest()?.routePreview || latest()?.points" /></div>
          @if (latest()) {
            <a class="text-link" [routerLink]="['/app/journal', latest()?.id]">Open ride details <lucide-icon name="arrow-right" size="16" /></a>
          }
        </article>

        <div class="metric-grid">
          <article class="metric-card accent"><span>This month</span><strong>{{ km(journal()?.monthlyRecap?.distanceM || stats()?.monthDistanceM) }}</strong></article>
          <article class="metric-card"><span>Total rides</span><strong>{{ stats()?.totalRides || 0 }}</strong></article>
          <article class="metric-card"><span>Best speed</span><strong>{{ kmh(stats()?.bestTopSpeedKmh) }}</strong></article>
          <article class="metric-card"><span>Average</span><strong>{{ kmh(stats()?.averageSpeedKmh) }}</strong></article>
        </div>
      </section>

      @if (error()) {
        <button class="notice danger" type="button" (click)="load()">{{ error() }} Tap to retry.</button>
      }

      <section class="content-section">
        <div class="section-head">
          <h2>Worth remembering</h2>
          <a routerLink="/app/journal">See journal</a>
        </div>
        <div class="card-row">
          @for (highlight of highlights(); track highlight.id) {
            <article class="small-card">
              <lucide-icon name="sparkles" size="20" />
              <h3>{{ highlight.title }}</h3>
              <p>{{ highlight.body }}</p>
            </article>
          } @empty {
            <article class="empty-card">No highlights yet. Record a ride in the mobile app to begin your smart journal.</article>
          }
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <h2>Recent journeys</h2>
        </div>
        <div class="ride-list">
          @for (ride of recent(); track ride.id) {
            <a class="ride-row" [routerLink]="['/app/journal', ride.id]">
              <div><strong>{{ ride.title || ride.aiTitle || ride.smartTitle || dateLabel(ride.startedAt) + ' ride' }}</strong><span>{{ dateLabel(ride.startedAt) }} · {{ ride.endLabel }}</span></div>
              <b>{{ km(ride.distanceM) }}</b>
            </a>
          } @empty {
            <article class="empty-card">Your recent rides will appear here after the mobile app uploads them.</article>
          }
        </div>
      </section>
    }
  `
})
export class HomePageComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly journal = signal<JournalResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly km = km;
  readonly kmh = kmh;
  readonly dateLabel = dateLabel;

  latest = () => this.journal()?.latestRide || this.journal()?.recentRides?.[0] || null;
  stats = () => this.journal()?.stats || null;
  highlights = () => this.journal()?.highlights || [];
  recent = () => this.journal()?.recentRides || [];

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.journal.set(await this.loadJournal());
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load home.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadJournal() {
    const home = await this.api.optional<JournalResponse>('/home');
    if (home) {
      return this.normalizeJournal(home);
    }
    const journal = await this.api.optional<JournalResponse>('/journal');
    if (journal) {
      return this.normalizeJournal(journal);
    }
    const dashboard = await this.api.request<{ stats: DashboardStats; recentRides: Ride[] }>('/dashboard');
    return this.normalizeJournal({
      generatedAt: new Date().toISOString(),
      stats: dashboard.stats,
      latestRide: dashboard.recentRides?.[0] || null,
      monthlyRecap: {
        distanceM: dashboard.stats?.monthDistanceM || 0,
        previousMonthDistanceM: dashboard.stats?.previousMonthDistanceM || 0,
        rideCount: dashboard.recentRides?.length || 0
      },
      highlights: this.fallbackHighlights(dashboard.recentRides),
      recentRides: dashboard.recentRides || [],
      unreviewedCount: dashboard.stats?.unreviewedRides || 0
    });
  }

  private normalizeJournal(value: JournalResponse): JournalResponse {
    return {
      ...value,
      highlights: Array.isArray(value.highlights) ? value.highlights : [],
      recentRides: Array.isArray(value.recentRides) ? value.recentRides : [],
      monthlyRecap: value.monthlyRecap || { distanceM: 0, previousMonthDistanceM: 0, rideCount: 0 },
      stats: value.stats || {
        todayDistanceM: 0,
        monthDistanceM: 0,
        yearDistanceM: 0,
        totalRides: 0,
        bestTopSpeedKmh: 0,
        averageSpeedKmh: 0
      }
    };
  }

  private fallbackHighlights(rides: Ride[] = []): JournalHighlight[] {
    const ride = rides[0];
    return ride ? [{ id: 'latest', type: 'ride', title: 'Latest escape', body: ride.highlightReason || 'Your newest route is ready to revisit.', rideId: ride.id }] : [];
  }
}
