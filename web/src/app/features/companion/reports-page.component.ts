import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { dateLabel, duration, km, kmh } from '../../core/format';
import { ReportResponse } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

type Period = 'day' | 'month' | 'year';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [LoadingPulseComponent],
  template: `
    <section class="page-title">
      <p class="kicker">REPORTS</p>
      <h2>Ride summaries</h2>
      <p>Readable summaries powered by the existing reports endpoint.</p>
    </section>

    <div class="filter-bar">
      @for (item of periods; track item) {
        <button type="button" [class.active]="period() === item" (click)="setPeriod(item)">{{ item }}</button>
      }
    </div>

    @if (loading()) {
      <app-loading-pulse label="Loading ride report" />
    } @else if (report(); as current) {
      <div class="metric-grid">
        <article class="metric-card accent"><span>Distance</span><strong>{{ km(current.summary.distanceM) }}</strong></article>
        <article class="metric-card"><span>Rides</span><strong>{{ current.summary.rideCount }}</strong></article>
        <article class="metric-card"><span>Duration</span><strong>{{ duration(current.summary.durationS) }}</strong></article>
        <article class="metric-card"><span>Top speed</span><strong>{{ kmh(current.summary.topSpeedKmh) }}</strong></article>
      </div>

      <section class="content-section">
        <div class="section-head">
          <h2>Routes</h2>
          <button type="button" class="primary-action" (click)="exportReport(current)">Export / print</button>
        </div>
        <div class="ride-list">
          @for (route of current.routes; track route.startedAt) {
            <article class="ride-row">
              <div><strong>{{ route.from }}</strong><span>{{ route.to }} · {{ dateLabel(route.startedAt) }}</span></div>
              <b>{{ km(route.distanceM) }}</b>
            </article>
          } @empty {
            <article class="empty-card">No routes in this report period.</article>
          }
        </div>
      </section>
    } @else {
      <article class="empty-card">{{ error() || 'Report unavailable.' }}</article>
    }
  `
})
export class ReportsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly period = signal<Period>('month');
  readonly report = signal<ReportResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly periods: Period[] = ['day', 'month', 'year'];
  readonly km = km;
  readonly kmh = kmh;
  readonly duration = duration;
  readonly dateLabel = dateLabel;

  ngOnInit() {
    void this.load();
  }

  setPeriod(period: Period) {
    this.period.set(period);
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.report.set(await this.api.request<ReportResponse>(`/reports?period=${this.period()}&date=${new Date().toISOString()}`));
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load report.');
      this.report.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  exportReport(report: ReportResponse) {
    const rows = (report.routes || []).map((route) => `
      <tr>
        <td>${this.escape(dateLabel(route.startedAt))}</td>
        <td>${this.escape(route.from)}</td>
        <td>${this.escape(route.to)}</td>
        <td>${this.escape(km(route.distanceM))}</td>
        <td>${this.escape(duration(route.durationS))}</td>
        <td>${this.escape(kmh(route.topSpeedKmh))}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head>
          <title>RidePulse ${this.escape(report.period)} report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; padding: 28px; }
            h1 { margin-bottom: 6px; }
            .summary { line-height: 1.8; margin: 20px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 22px; }
            th, td { border-bottom: 1px solid #ddd; padding: 9px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>RidePulse ${this.escape(report.period)} report</h1>
          <div class="summary">
            <div>Ride count: ${report.summary.rideCount}</div>
            <div>Distance: ${this.escape(km(report.summary.distanceM))}</div>
            <div>Total duration: ${this.escape(duration(report.summary.durationS))}</div>
            <div>Average speed: ${this.escape(kmh(report.summary.averageSpeedKmh))}</div>
            <div>Top speed: ${this.escape(kmh(report.summary.topSpeedKmh))}</div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>From</th><th>To</th><th>Distance</th><th>Duration</th><th>Top speed</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ridepulse-${report.period}-report.html`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  private escape(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
