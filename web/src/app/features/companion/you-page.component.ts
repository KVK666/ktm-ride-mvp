import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { ProfilePhotoService } from '../../core/profile-photo.service';
import { JournalResponse } from '../../core/models';
import { km } from '../../core/format';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

@Component({
  selector: 'app-you-page',
  standalone: true,
  imports: [LoadingPulseComponent, LucideAngularModule, RouterLink],
  template: `
    <section class="profile-layout you-layout">
      <article class="profile-card identity-card" routerLink="/app/profile">
        <div class="avatar">
          @if (photo.photoUrl()) {
            <img [src]="photo.photoUrl()" alt="" />
          } @else {
            {{ initials() }}
          }
        </div>
        <p class="kicker">YOUR RIDEPULSE</p>
        <h2>{{ auth.user()?.name || 'Rider' }}</h2>
        <p>{{ auth.user()?.bikeModel || 'Motorcycle' }}</p>
      </article>

      <article class="profile-card secondary stat-wide">
        <lucide-icon name="activity" size="28" />
        <h3>Rider pulse</h3>
        @if (loading()) {
          <app-loading-pulse [compact]="true" label="Loading rider pulse" />
        } @else {
          <div class="metric-grid mini">
            <article class="metric-card accent"><span>Month</span><strong>{{ km(journal()?.stats?.monthDistanceM || 0) }}</strong></article>
            <article class="metric-card"><span>Rides</span><strong>{{ journal()?.stats?.totalRides || 0 }}</strong></article>
            <article class="metric-card"><span>To review</span><strong>{{ journal()?.unreviewedCount || 0 }}</strong></article>
          </div>
        }
      </article>

      <a class="profile-card secondary nav-card" routerLink="/app/analytics">
        <lucide-icon name="chart-column-increasing" size="28" />
        <p class="kicker">PERFORMANCE</p>
        <h3>Insights</h3>
        <p>Patterns hiding inside every kilometre.</p>
      </a>

      <a class="profile-card secondary nav-card" routerLink="/app/reports">
        <lucide-icon name="file-text" size="28" />
        <p class="kicker">EXPORT</p>
        <h3>Ride reports</h3>
        <p>Clean summaries ready to save or share.</p>
      </a>

      <a class="profile-card secondary nav-card" routerLink="/app/navigate">
        <lucide-icon name="navigation" size="28" />
        <p class="kicker">MAPS</p>
        <h3>Route planner</h3>
        <p>Preview Google routes before you move.</p>
      </a>

      <a class="profile-card secondary nav-card" routerLink="/app/places">
        <lucide-icon name="map-pin" size="28" />
        <p class="kicker">SMART ROUTINES</p>
        <h3>Saved places</h3>
        <p>Teach RidePulse your Home, Office, and regular stops.</p>
      </a>

      <article class="profile-card secondary">
        <lucide-icon name="shield-check" size="28" />
        <h3>Mobile-only controls</h3>
        <p>Ride recording, auto tracking, ride recovery, and OTA restart controls stay in the Android app for reliable background behavior.</p>
      </article>
    </section>
  `
})
export class YouPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly photo = inject(ProfilePhotoService);
  private readonly api = inject(ApiService);
  readonly journal = signal<JournalResponse | null>(null);
  readonly loading = signal(true);
  readonly km = km;

  ngOnInit() {
    void this.photo.load();
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.journal.set(await this.api.request<JournalResponse>('/journal'));
    } catch {
      this.journal.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  initials() {
    return (this.auth.user()?.name || 'Rider')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'R';
  }
}
