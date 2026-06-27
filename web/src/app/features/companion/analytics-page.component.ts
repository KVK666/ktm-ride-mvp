import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AnalyticsPoint } from '../../core/models';
import { bucketLabel, duration, km, kmh, numberValue } from '../../core/format';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

type Bucket = 'daily' | 'monthly' | 'yearly';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [LoadingPulseComponent],
  template: `
    <section class="page-title">
      <p class="kicker">RIDE ANALYTICS</p>
      <h2>{{ title() }}</h2>
      <p>Distance, time, ride count, and top speed trends from the existing RidePulse API.</p>
    </section>

    <div class="filter-bar">
      @for (item of buckets; track item) {
        <button type="button" [class.active]="bucket() === item" (click)="setBucket(item)">{{ item }}</button>
      }
    </div>

    @if (loading()) {
      <app-loading-pulse label="Loading analytics" />
    } @else {
      <div class="metric-grid">
        <article class="metric-card accent"><span>Distance</span><strong>{{ km(totalDistance()) }}</strong></article>
        <article class="metric-card"><span>Rides</span><strong>{{ totalRides() }}</strong></article>
        <article class="metric-card"><span>Time</span><strong>{{ duration(totalDuration()) }}</strong></article>
        <article class="metric-card"><span>Top speed</span><strong>{{ kmh(topSpeed()) }}</strong></article>
      </div>

      @if (error()) {
        <button class="notice danger" type="button" (click)="load()">{{ error() }} Tap to retry.</button>
      }

      <section class="chart-card">
        <h3>Distance trend</h3>
        <div class="bars">
          @for (point of recent(); track point.bucket) {
            <div class="bar-wrap">
              <span class="bar" [style.height.%]="barHeight(point.distanceM)"></span>
              <small>{{ label(point.bucket) }}</small>
            </div>
          } @empty {
            <p>No analytics data yet.</p>
          }
        </div>
      </section>

      <section class="chart-card">
        <h3>Ride duration</h3>
        <div class="bars">
          @for (point of recent(); track point.bucket) {
            <div class="bar-wrap">
              <span class="bar blue" [style.height.%]="durationHeight(point.durationS)"></span>
              <small>{{ label(point.bucket) }}</small>
            </div>
          } @empty {
            <p>No duration data yet.</p>
          }
        </div>
      </section>

      <section class="chart-card">
        <h3>Top speed</h3>
        <div class="bars">
          @for (point of recent(); track point.bucket) {
            <div class="bar-wrap">
              <span class="bar yellow" [style.height.%]="speedHeight(point.topSpeedKmh)"></span>
              <small>{{ label(point.bucket) }}</small>
            </div>
          } @empty {
            <p>No speed data yet.</p>
          }
        </div>
      </section>
    }
  `
})
export class AnalyticsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly bucket = signal<Bucket>('daily');
  readonly points = signal<AnalyticsPoint[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly buckets: Bucket[] = ['daily', 'monthly', 'yearly'];
  readonly km = km;
  readonly kmh = kmh;
  readonly duration = duration;
  readonly recent = computed(() => this.points().slice(-10));
  readonly maxDistance = computed(() => Math.max(...this.recent().map((point) => numberValue(point.distanceM)), 1));
  readonly maxDuration = computed(() => Math.max(...this.recent().map((point) => numberValue(point.durationS)), 1));
  readonly maxTrendSpeed = computed(() => Math.max(...this.recent().map((point) => numberValue(point.topSpeedKmh)), 1));
  readonly totalDistance = computed(() => this.points().reduce((sum, point) => sum + numberValue(point.distanceM), 0));
  readonly totalRides = computed(() => this.points().reduce((sum, point) => sum + numberValue(point.rideCount), 0));
  readonly totalDuration = computed(() => this.points().reduce((sum, point) => sum + numberValue(point.durationS), 0));
  readonly topSpeed = computed(() => this.points().reduce((max, point) => Math.max(max, numberValue(point.topSpeedKmh)), 0));
  readonly title = computed(() => this.bucket() === 'yearly' ? 'Yearly performance' : this.bucket() === 'monthly' ? 'Monthly performance' : 'Daily performance');

  ngOnInit() {
    void this.load();
  }

  setBucket(bucket: Bucket) {
    this.bucket.set(bucket);
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await this.api.request<{ points: AnalyticsPoint[] }>(`/analytics/distance?bucket=${this.bucket()}`);
      this.points.set(Array.isArray(response.points) ? response.points : []);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load analytics.');
    } finally {
      this.loading.set(false);
    }
  }

  barHeight(value: unknown) {
    return Math.max(4, (numberValue(value) / this.maxDistance()) * 100);
  }

  durationHeight(value: unknown) {
    return Math.max(4, (numberValue(value) / this.maxDuration()) * 100);
  }

  speedHeight(value: unknown) {
    return Math.max(4, (numberValue(value) / this.maxTrendSpeed()) * 100);
  }

  label(value: string) {
    return bucketLabel(value, this.bucket());
  }
}
