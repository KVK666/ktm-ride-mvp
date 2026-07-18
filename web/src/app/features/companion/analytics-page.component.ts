import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { HttpRequestError } from '../../core/http-client';
import { AnalyticsPoint, RiderPulseInsights } from '../../core/models';
import { bucketLabel, duration, km, kmh, numberValue } from '../../core/format';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

type Bucket = 'daily' | 'monthly' | 'yearly';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [LoadingPulseComponent, RouterLink],
  template: `
    <section class="page-title">
      <p class="kicker">RIDER PULSE</p>
      <h1>Your riding rhythm</h1>
      <p>A focused view of your momentum, habits, ride character, and next meaningful target.</p>
    </section>

    <nav class="insights-tabs" aria-label="Insights sections">
      <a class="active" routerLink="/app/analytics" aria-current="page">Overview</a>
      <a routerLink="/app/analytics" fragment="trends">Trends</a>
      <a routerLink="/app/reports">Reports</a>
    </nav>

    @if (insightLoading()) {
      <app-loading-pulse label="Loading your rider pulse" />
    } @else if (insightError()) {
      <section class="pulse-state error-state" role="alert">
        <p class="kicker">PULSE UNAVAILABLE</p>
        <h3>Your ride history is safe.</h3>
        <p>{{ insightError() }}</p>
        <button class="secondary-action" type="button" (click)="loadInsights()">
          Try Rider Pulse again
        </button>
      </section>
    } @else if (insights(); as pulse) {
      <section class="pulse-hero" aria-labelledby="goal-heading">
        <div class="pulse-hero-copy">
          <div class="pulse-heading-row">
            <div>
              <p class="kicker">MONTHLY DISTANCE GOAL</p>
              <h3 id="goal-heading">{{ goalHeadline() }}</h3>
            </div>
            <span class="pace-pill" [class.complete]="goalProgressRaw() >= 100">{{
              paceLabel()
            }}</span>
          </div>
          <p class="coaching-copy">{{ coachingMessage() }}</p>

          <div class="goal-progress-copy">
            <strong>{{ km(pulse.distanceCurrentMonthM) }}</strong>
            <span>of {{ monthlyGoalKm() }} km this calendar month</span>
          </div>
          <progress
            class="goal-progress"
            [value]="goalProgress()"
            max="100"
            [attr.aria-label]="'Monthly distance goal: ' + goalProgressRounded() + '% complete'"
          ></progress>
          <div class="goal-foot">
            <span>{{ goalProgressRounded() }}% complete</span>
            <span>Projected {{ km(pulse.projectedMonthDistanceM) }}</span>
          </div>

          @if (editingGoal()) {
            <form class="goal-form" (submit)="saveGoal($event)">
              <label for="monthly-goal-km">Monthly target in kilometres</label>
              <div class="goal-form-row">
                <input
                  id="monthly-goal-km"
                  type="number"
                  inputmode="decimal"
                  min="10"
                  max="5000"
                  step="10"
                  [value]="goalDraftKm()"
                  (input)="updateGoalDraft($event)"
                  aria-describedby="goal-help"
                />
                <button class="primary-action" type="submit" [disabled]="goalSaving()">{{ goalSaving() ? 'Saving...' : 'Save target' }}</button>
                <button class="secondary-action" type="button" [disabled]="goalSaving()" (click)="cancelGoalEdit()">
                  Cancel
                </button>
              </div>
              <small id="goal-help">Choose a realistic target between 10 and 5,000 km.</small>
              @if (goalError()) {
                <span class="field-error" role="alert">{{ goalError() }}</span>
              }
            </form>
          } @else {
            <button class="goal-edit-button" type="button" (click)="startGoalEdit()">
              Edit monthly target
            </button>
          }

          @if (goalSaved()) {
            <p class="saved-message" role="status">{{ goalSaved() }}</p>
          }
        </div>

        <div class="pulse-orbit" aria-hidden="true">
          <span class="orbit-value">{{ goalProgressRounded() }}%</span>
          <span>goal progress</span>
        </div>
      </section>

      @if (!hasRideActivity()) {
        <section class="pulse-state empty-state">
          <p class="kicker">READY WHEN YOU ARE</p>
          <h3>Your first ride will bring this pulse to life.</h3>
          <p>
            Record a ride to unlock momentum, habits, streaks, projections, and personal benchmarks.
          </p>
        </section>
      } @else {
        <section class="insight-section" aria-labelledby="momentum-heading">
          <div class="section-heading">
            <div>
              <p class="kicker">LAST 30 DAYS</p>
              <h3 id="momentum-heading">Momentum</h3>
            </div>
            <p>{{ trendLabel() }}</p>
          </div>
          <dl class="insight-grid momentum-grid">
            <div class="insight-card accent-card">
              <dt>Distance</dt>
              <dd>{{ km(pulse.distanceLast30DaysM) }}</dd>
              <small>{{ previousPeriodLabel() }}</small>
            </div>
            <div class="insight-card">
              <dt>Rides</dt>
              <dd>{{ pulse.ridesLast30Days }}</dd>
              <small>completed recently</small>
            </div>
            <div class="insight-card">
              <dt>Active days</dt>
              <dd>{{ pulse.activeDaysLast30Days }}</dd>
              <small>days you made time to ride</small>
            </div>
            <div class="insight-card">
              <dt>Current streak</dt>
              <dd>
                {{ pulse.currentRideDayStreak }}
                {{ pulse.currentRideDayStreak === 1 ? 'day' : 'days' }}
              </dd>
              <small>consecutive ride days</small>
            </div>
          </dl>
        </section>

        <section class="insight-section" aria-labelledby="character-heading">
          <div class="section-heading">
            <div>
              <p class="kicker">YOUR RIDE SIGNATURE</p>
              <h3 id="character-heading">Ride character</h3>
            </div>
            <p>Patterns that make your rides yours.</p>
          </div>
          <dl class="insight-grid character-grid">
            <div class="insight-card">
              <dt>Longest ride</dt>
              <dd>{{ km(pulse.longestRideM) }}</dd>
              <small>your distance benchmark</small>
            </div>
            <div class="insight-card">
              <dt>Average ride</dt>
              <dd>{{ km(pulse.averageRideDistanceM) }}</dd>
              <small>distance per ride</small>
            </div>
            <div class="insight-card">
              <dt>Average time</dt>
              <dd>{{ duration(pulse.averageRideDurationS) }}</dd>
              <small>time in the saddle</small>
            </div>
            <div class="insight-card">
              <dt>Average top speed</dt>
              <dd>{{ kmh(pulse.averageTopSpeedKmh) }}</dd>
              <small>across recorded rides</small>
            </div>
            <div class="insight-card signature-card">
              <dt>Favourite day</dt>
              <dd>{{ pulse.favoriteWeekday || 'Still learning' }}</dd>
              <small>your most common ride day</small>
            </div>
            <div class="insight-card signature-card">
              <dt>Favourite time</dt>
              <dd>{{ pulse.favoriteTimeOfDay || 'Still learning' }}</dd>
              <small>when you ride most often</small>
            </div>
          </dl>
        </section>

        <section class="care-strip" aria-labelledby="care-heading">
          <div>
            <p class="kicker">JOURNAL HEALTH</p>
            <h3 id="care-heading">Keep the story useful</h3>
            <p>{{ careMessage() }}</p>
          </div>
          <dl>
            <div>
              <dt>Reviewed</dt>
              <dd>{{ reviewPercent() }}%</dd>
            </div>
            <div>
              <dt>Needs attention</dt>
              <dd>{{ pulse.cleanupCandidateCount }}</dd>
            </div>
          </dl>
        </section>
      }
    }

    <section class="trend-section" aria-labelledby="trend-heading">
      <div class="section-heading trend-heading">
        <div>
          <p class="kicker">RIDE HISTORY</p>
          <h3 id="trend-heading">{{ title() }}</h3>
        </div>
        <p>Explore your distance, duration, and top-speed trends.</p>
      </div>

      <div class="filter-bar" role="group" aria-label="Analytics period">
        @for (item of buckets; track item) {
          <button
            type="button"
            [class.active]="bucket() === item"
            [attr.aria-pressed]="bucket() === item"
            (click)="setBucket(item)"
          >
            {{ item }}
          </button>
        }
      </div>

      @if (trendLoading()) {
        <app-loading-pulse label="Loading ride history" />
      } @else if (trendError()) {
        <button class="notice danger" type="button" (click)="loadTrend()">
          {{ trendError() }} Tap to retry.
        </button>
      } @else {
        <div class="metric-grid">
          <article class="metric-card accent">
            <span>Distance</span><strong>{{ km(totalDistance()) }}</strong>
          </article>
          <article class="metric-card">
            <span>Rides</span><strong>{{ totalRides() }}</strong>
          </article>
          <article class="metric-card">
            <span>Time</span><strong>{{ duration(totalDuration()) }}</strong>
          </article>
          <article class="metric-card">
            <span>Top speed</span><strong>{{ kmh(topSpeed()) }}</strong>
          </article>
        </div>

        @if (!recent().length) {
          <section class="pulse-state empty-state compact-empty">
            <h3>No trend data yet.</h3>
            <p>Finish a ride and your history will begin to chart itself here.</p>
          </section>
        } @else {
          <div class="chart-grid">
            <section class="chart-card">
              <h3>Distance trend</h3>
              <div class="bars">
                @for (point of recent(); track point.bucket) {
                  <div class="bar-wrap">
                    <span
                      class="bar"
                      role="img"
                      [attr.aria-label]="label(point.bucket) + ': ' + km(point.distanceM)"
                      [style.height.%]="barHeight(point.distanceM)"
                    ></span>
                    <small>{{ label(point.bucket) }}</small>
                  </div>
                }
              </div>
            </section>

            <section class="chart-card">
              <h3>Ride duration</h3>
              <div class="bars">
                @for (point of recent(); track point.bucket) {
                  <div class="bar-wrap">
                    <span
                      class="bar blue"
                      role="img"
                      [attr.aria-label]="label(point.bucket) + ': ' + duration(point.durationS)"
                      [style.height.%]="durationHeight(point.durationS)"
                    ></span>
                    <small>{{ label(point.bucket) }}</small>
                  </div>
                }
              </div>
            </section>

            <section class="chart-card">
              <h3>Top speed</h3>
              <div class="bars">
                @for (point of recent(); track point.bucket) {
                  <div class="bar-wrap">
                    <span
                      class="bar yellow"
                      role="img"
                      [attr.aria-label]="label(point.bucket) + ': ' + kmh(point.topSpeedKmh)"
                      [style.height.%]="speedHeight(point.topSpeedKmh)"
                    ></span>
                    <small>{{ label(point.bucket) }}</small>
                  </div>
                }
              </div>
            </section>
          </div>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding-bottom: 28px;
    }

    .pulse-hero,
    .pulse-state,
    .insight-card,
    .care-strip {
      border: 1px solid rgba(245, 242, 234, 0.08);
      background: linear-gradient(180deg, rgba(24, 28, 34, 0.96), rgba(17, 20, 25, 0.92));
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
    }

    .pulse-hero {
      position: relative;
      min-height: 390px;
      padding: clamp(24px, 4vw, 42px);
      border-radius: 34px;
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(180px, 0.38fr);
      align-items: center;
      gap: clamp(24px, 5vw, 64px);
      background:
        radial-gradient(circle at 84% 30%, rgba(200, 255, 90, 0.18), transparent 28%),
        linear-gradient(135deg, rgba(31, 37, 45, 0.98), rgba(12, 15, 18, 0.96));
    }

    .pulse-hero::after {
      content: '';
      position: absolute;
      width: 280px;
      height: 280px;
      right: -120px;
      bottom: -170px;
      border: 1px solid rgba(200, 255, 90, 0.18);
      border-radius: 50%;
    }

    .pulse-hero-copy {
      position: relative;
      z-index: 1;
      min-width: 0;
    }

    .pulse-heading-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
    }

    .pulse-heading-row h3,
    .pulse-state h3,
    .section-heading h3,
    .care-strip h3 {
      margin: 0;
      font-size: clamp(1.7rem, 4vw, 3rem);
      line-height: 1.05;
    }

    .pace-pill {
      flex: 0 0 auto;
      padding: 8px 12px;
      border: 1px solid rgba(103, 167, 255, 0.28);
      border-radius: 999px;
      color: var(--blue);
      background: rgba(103, 167, 255, 0.08);
      font-size: 0.76rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .pace-pill.complete {
      color: var(--on-accent);
      border-color: var(--accent);
      background: var(--accent);
    }

    .coaching-copy {
      max-width: 680px;
      margin: 16px 0 30px;
      color: var(--text-soft);
      line-height: 1.65;
    }

    .goal-progress-copy {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
    }

    .goal-progress-copy strong {
      font-size: clamp(1.8rem, 4vw, 3.4rem);
      line-height: 1;
    }

    .goal-progress-copy span,
    .goal-foot,
    .goal-form small {
      color: var(--muted);
    }

    .goal-progress {
      width: 100%;
      height: 12px;
      margin: 16px 0 8px;
      border: 0;
      border-radius: 999px;
      overflow: hidden;
      background: var(--elevated);
    }

    .goal-progress::-webkit-progress-bar {
      border-radius: 999px;
      background: var(--elevated);
    }

    .goal-progress::-webkit-progress-value {
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--accent-soft));
    }

    .goal-progress::-moz-progress-bar {
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--accent-soft));
    }

    .goal-foot {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.82rem;
      font-weight: 800;
    }

    .goal-edit-button {
      min-height: 42px;
      margin-top: 22px;
      padding: 0;
      border: 0;
      color: var(--accent);
      background: transparent;
      font-weight: 900;
      cursor: pointer;
    }

    .goal-form {
      margin-top: 22px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 20px;
      background: rgba(8, 10, 12, 0.42);
    }

    .goal-form label {
      display: block;
      margin-bottom: 10px;
      font-size: 0.84rem;
      font-weight: 900;
    }

    .goal-form-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .goal-form input {
      flex: 1 1 160px;
      min-height: 46px;
      padding: 0 14px;
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      color: var(--text);
      background: var(--surface);
      font-size: 1rem;
    }

    .goal-form small,
    .field-error,
    .saved-message {
      display: block;
      margin-top: 10px;
    }

    .field-error {
      color: var(--danger);
      font-size: 0.82rem;
      font-weight: 800;
    }

    .saved-message {
      margin-bottom: 0;
      color: var(--success);
      font-size: 0.84rem;
      font-weight: 800;
    }

    .pulse-orbit {
      position: relative;
      z-index: 1;
      width: min(100%, 220px);
      aspect-ratio: 1;
      justify-self: center;
      border: 1px solid rgba(200, 255, 90, 0.22);
      border-radius: 50%;
      display: grid;
      place-content: center;
      text-align: center;
      background: radial-gradient(circle, rgba(200, 255, 90, 0.14), transparent 64%);
      box-shadow:
        inset 0 0 0 18px rgba(200, 255, 90, 0.025),
        0 0 70px rgba(200, 255, 90, 0.08);
    }

    .pulse-orbit::before,
    .pulse-orbit::after {
      content: '';
      position: absolute;
      inset: 15%;
      border: 1px solid rgba(200, 255, 90, 0.18);
      border-radius: 50%;
    }

    .pulse-orbit::after {
      inset: 31%;
      border-color: rgba(200, 255, 90, 0.28);
    }

    .orbit-value,
    .pulse-orbit > span:last-child {
      position: relative;
      z-index: 1;
    }

    .orbit-value {
      font-size: clamp(2.3rem, 5vw, 4rem);
      font-weight: 900;
      line-height: 1;
    }

    .pulse-orbit > span:last-child {
      margin-top: 7px;
      color: var(--muted);
      font-size: 0.74rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .pulse-state {
      padding: clamp(22px, 4vw, 34px);
      border-radius: 28px;
    }

    .pulse-state p:not(.kicker) {
      max-width: 680px;
      color: var(--text-soft);
      line-height: 1.65;
    }

    .error-state {
      border-color: rgba(255, 98, 107, 0.22);
    }

    .empty-state {
      margin-top: 18px;
    }

    .compact-empty {
      margin-top: 18px;
    }

    .insight-section,
    .trend-section {
      margin-top: 34px;
    }

    .section-heading {
      margin-bottom: 16px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 22px;
    }

    .section-heading > p {
      max-width: 440px;
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
      text-align: right;
    }

    .insight-grid {
      margin: 0;
      display: grid;
      gap: 12px;
    }

    .momentum-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .character-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .insight-card {
      min-height: 170px;
      padding: 20px;
      border-radius: 24px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      overflow: hidden;
    }

    .insight-card dt {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .insight-card dd {
      margin: 9px 0 7px;
      font-size: clamp(1.45rem, 3vw, 2.35rem);
      font-weight: 900;
      line-height: 1.05;
      overflow-wrap: anywhere;
    }

    .insight-card small {
      color: var(--muted);
      line-height: 1.4;
    }

    .accent-card {
      color: var(--on-accent);
      border-color: var(--accent);
      background: var(--accent);
    }

    .accent-card dt,
    .accent-card small {
      color: rgba(16, 22, 6, 0.66);
    }

    .signature-card {
      background:
        linear-gradient(145deg, rgba(103, 167, 255, 0.12), transparent 62%),
        linear-gradient(180deg, rgba(24, 28, 34, 0.96), rgba(17, 20, 25, 0.92));
    }

    .care-strip {
      margin-top: 34px;
      padding: clamp(22px, 4vw, 32px);
      border-radius: 28px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 28px;
    }

    .care-strip p:not(.kicker) {
      max-width: 680px;
      margin-bottom: 0;
      color: var(--text-soft);
      line-height: 1.6;
    }

    .care-strip dl {
      margin: 0;
      display: grid;
      grid-template-columns: repeat(2, minmax(112px, 1fr));
      gap: 10px;
    }

    .care-strip dl div {
      min-width: 112px;
      padding: 16px;
      border-radius: 18px;
      background: var(--surface-high);
    }

    .care-strip dt {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .care-strip dd {
      margin: 8px 0 0;
      font-size: 1.65rem;
      font-weight: 900;
    }

    .trend-section {
      padding-top: 8px;
    }

    .trend-heading {
      margin-bottom: 18px;
    }

    .chart-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .chart-grid .chart-card {
      margin-top: 24px;
    }

    .chart-grid .bars {
      height: 240px;
    }

    @media (max-width: 1100px) {
      .momentum-grid,
      .character-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .chart-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      .pulse-hero {
        min-height: auto;
        grid-template-columns: 1fr;
        border-radius: 24px;
      }

      .pulse-orbit {
        display: none;
      }

      .pulse-heading-row,
      .section-heading,
      .care-strip {
        align-items: flex-start;
        grid-template-columns: 1fr;
        flex-direction: column;
      }

      .section-heading > p {
        text-align: left;
      }

      .momentum-grid,
      .character-grid {
        grid-template-columns: 1fr;
      }

      .insight-card {
        min-height: 132px;
      }

      .care-strip dl {
        width: 100%;
      }

      .goal-form-row > * {
        flex: 1 1 100%;
      }
    }

    @media (max-width: 430px) {
      .pulse-heading-row {
        display: grid;
      }

      .pace-pill {
        justify-self: start;
      }

      .goal-foot,
      .care-strip dl {
        grid-template-columns: 1fr;
        flex-direction: column;
      }
    }
  `,
})
export class AnalyticsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  readonly bucket = signal<Bucket>('daily');
  readonly points = signal<AnalyticsPoint[]>([]);
  readonly insights = signal<RiderPulseInsights | null>(null);
  readonly insightLoading = signal(true);
  readonly insightError = signal('');
  readonly trendLoading = signal(true);
  readonly trendError = signal('');
  readonly monthlyGoalKm = signal(300);
  readonly goalDraftKm = signal(300);
  readonly editingGoal = signal(false);
  readonly goalSaving = signal(false);
  readonly goalError = signal('');
  readonly goalSaved = signal('');
  readonly buckets: Bucket[] = ['daily', 'monthly', 'yearly'];
  readonly km = km;
  readonly kmh = kmh;
  readonly duration = duration;
  readonly recent = computed(() => this.points().slice(-10));
  readonly maxDistance = computed(() =>
    Math.max(...this.recent().map((point) => numberValue(point.distanceM)), 1),
  );
  readonly maxDuration = computed(() =>
    Math.max(...this.recent().map((point) => numberValue(point.durationS)), 1),
  );
  readonly maxTrendSpeed = computed(() =>
    Math.max(...this.recent().map((point) => numberValue(point.topSpeedKmh)), 1),
  );
  readonly totalDistance = computed(() =>
    this.points().reduce((sum, point) => sum + numberValue(point.distanceM), 0),
  );
  readonly totalRides = computed(() =>
    this.points().reduce((sum, point) => sum + numberValue(point.rideCount), 0),
  );
  readonly totalDuration = computed(() =>
    this.points().reduce((sum, point) => sum + numberValue(point.durationS), 0),
  );
  readonly topSpeed = computed(() =>
    this.points().reduce((max, point) => Math.max(max, numberValue(point.topSpeedKmh)), 0),
  );
  readonly title = computed(() =>
    this.bucket() === 'yearly'
      ? 'Yearly performance'
      : this.bucket() === 'monthly'
        ? 'Monthly performance'
        : 'Daily performance',
  );
  readonly hasRideActivity = computed(
    () =>
      numberValue(this.insights()?.ridesLast30Days) > 0 ||
      numberValue(this.insights()?.distanceLast30DaysM) > 0,
  );
  readonly goalProgressRaw = computed(() => {
    const goalMeters = Math.max(1, this.monthlyGoalKm()) * 1000;
    return (numberValue(this.insights()?.distanceCurrentMonthM) / goalMeters) * 100;
  });
  readonly goalProgress = computed(() => Math.min(100, Math.max(0, this.goalProgressRaw())));
  readonly goalProgressRounded = computed(() => Math.round(this.goalProgressRaw()));
  readonly reviewPercent = computed(() =>
    Math.min(100, Math.max(0, Math.round(numberValue(this.insights()?.reviewCompletionPercent)))),
  );
  readonly goalHeadline = computed(() => {
    if (!this.hasRideActivity()) {
      return 'Set the distance that motivates you';
    }
    if (this.goalProgressRaw() >= 100) {
      return 'Goal reached. Keep the wheels turning.';
    }
    const remainingKm = Math.max(
      0,
      this.monthlyGoalKm() - numberValue(this.insights()?.distanceCurrentMonthM) / 1000,
    );
    return `${this.formatKmNumber(remainingKm)} km to your target`;
  });
  readonly paceLabel = computed(() => {
    if (this.goalProgressRaw() >= 100) {
      return 'Goal complete';
    }
    const projectedKm = numberValue(this.insights()?.projectedMonthDistanceM) / 1000;
    return projectedKm >= this.monthlyGoalKm() ? 'On pace' : 'Building pace';
  });
  readonly coachingMessage = computed(() => {
    const pulse = this.insights();
    if (!pulse || !this.hasRideActivity()) {
      return 'Pick a target that feels achievable. Your first recorded ride will start measuring progress.';
    }
    if (this.goalProgressRaw() >= 100) {
      return `You have cleared this target with ${pulse.ridesLast30Days} rides. Anything more is bonus distance.`;
    }
    const projectedKm = numberValue(pulse.projectedMonthDistanceM) / 1000;
    if (projectedKm >= this.monthlyGoalKm()) {
      return `At your current pace, you are projected to reach ${this.formatKmNumber(projectedKm)} km this month.`;
    }
    const projectedGap = Math.max(0, this.monthlyGoalKm() - projectedKm);
    return `Your current projection is ${this.formatKmNumber(projectedGap)} km short. One purposeful ride can move the line.`;
  });
  readonly trendLabel = computed(() => {
    const trend = this.insights()?.distanceTrendPercent;
    if (trend === null || trend === undefined || !Number.isFinite(Number(trend))) {
      return 'This is your new 30-day baseline.';
    }
    const rounded = Math.round(Number(trend));
    if (rounded === 0) {
      return 'Distance is steady versus the previous 30 days.';
    }
    return `${Math.abs(rounded)}% ${rounded > 0 ? 'more' : 'less'} distance than the previous 30 days.`;
  });
  readonly previousPeriodLabel = computed(
    () => `${this.km(this.insights()?.distancePrevious30DaysM)} in the previous 30 days`,
  );
  readonly careMessage = computed(() => {
    const cleanupCount = Math.max(
      0,
      Math.round(numberValue(this.insights()?.cleanupCandidateCount)),
    );
    if (cleanupCount > 0) {
      return `${cleanupCount} ${cleanupCount === 1 ? 'ride needs' : 'rides need'} a quick check, while ${this.reviewPercent()}% of your journal is reviewed.`;
    }
    if (this.reviewPercent() >= 100) {
      return 'Every ride is reviewed and no cleanup candidates need attention.';
    }
    return `No cleanup candidates need attention. Your journal is ${this.reviewPercent()}% reviewed.`;
  });

  ngOnInit() {
    void this.loadGoal();
    void this.loadInsights();
    void this.loadTrend();
  }

  setBucket(bucket: Bucket) {
    this.bucket.set(bucket);
    void this.loadTrend();
  }

  async loadInsights() {
    this.insightLoading.set(true);
    this.insightError.set('');
    try {
      const response = await this.api.request<{ insights?: unknown }>(
        `/analytics/insights?timezone=${encodeURIComponent(this.localTimezone())}`,
      );
      const insights = this.normalizeInsights(response.insights);
      if (!insights) {
        throw new Error('The Rider Pulse response was incomplete. Please try again.');
      }
      this.insights.set(insights);
    } catch (error: unknown) {
      this.insightError.set(
        error instanceof Error ? error.message : 'Unable to load your rider pulse.',
      );
    } finally {
      this.insightLoading.set(false);
    }
  }

  async loadTrend() {
    const requestId = ++this.trendRequestId;
    const requestedBucket = this.bucket();
    this.trendLoading.set(true);
    this.trendError.set('');
    try {
      const response = await this.api.request<{ points: AnalyticsPoint[] }>(
        `/analytics/distance?bucket=${requestedBucket}`,
      );
      if (requestId !== this.trendRequestId) return;
      this.points.set(Array.isArray(response.points) ? response.points : []);
    } catch (error: unknown) {
      if (requestId !== this.trendRequestId) return;
      this.trendError.set(error instanceof Error ? error.message : 'Unable to load analytics.');
    } finally {
      if (requestId === this.trendRequestId) this.trendLoading.set(false);
    }
  }

  startGoalEdit() {
    this.goalDraftKm.set(this.monthlyGoalKm());
    this.goalError.set('');
    this.goalSaved.set('');
    this.editingGoal.set(true);
  }

  cancelGoalEdit() {
    this.goalDraftKm.set(this.monthlyGoalKm());
    this.goalError.set('');
    this.editingGoal.set(false);
  }

  updateGoalDraft(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    this.goalDraftKm.set(value);
    this.goalError.set('');
  }

  async saveGoal(event: Event) {
    event.preventDefault();
    if (this.goalSaving()) return;
    const value = Number(this.goalDraftKm());
    if (!Number.isFinite(value) || value < 10 || value > 5000) {
      this.goalError.set('Enter a target between 10 and 5,000 km.');
      return;
    }
    const rounded = Math.round(value);
    this.goalError.set('');
    this.goalSaved.set('');
    this.goalSaving.set(true);
    try {
      const savedToServer = await this.writeGoal(rounded);
      this.monthlyGoalKm.set(rounded);
      this.goalDraftKm.set(rounded);
      this.editingGoal.set(false);
      this.goalSaved.set(savedToServer ? `Monthly target saved at ${rounded} km.` : `Monthly target saved in this browser while offline.`);
    } catch (error) {
      this.goalError.set(`Monthly target was not saved. ${errorMessage(error)} Try again.`);
    } finally {
      this.goalSaving.set(false);
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

  private normalizeInsights(value: unknown): RiderPulseInsights | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const insight = value as Partial<RiderPulseInsights>;
    const requiredNumbers: Array<keyof RiderPulseInsights> = [
      'ridesLast30Days',
      'distanceLast30DaysM',
      'distancePrevious30DaysM',
      'distanceCurrentMonthM',
      'activeDaysLast30Days',
      'currentRideDayStreak',
      'longestRideM',
      'averageRideDistanceM',
      'averageRideDurationS',
      'averageTopSpeedKmh',
      'reviewCompletionPercent',
      'cleanupCandidateCount',
      'projectedMonthDistanceM',
    ];
    if (
      typeof insight.generatedAt !== 'string' ||
      !insight.generatedAt ||
      requiredNumbers.some(
        (key) =>
          insight[key] === null ||
          insight[key] === undefined ||
          !Number.isFinite(Number(insight[key])),
      )
    ) {
      return null;
    }
    return {
      generatedAt: typeof insight.generatedAt === 'string' ? insight.generatedAt : '',
      ridesLast30Days: Math.max(0, Math.round(numberValue(insight.ridesLast30Days))),
      distanceLast30DaysM: Math.max(0, numberValue(insight.distanceLast30DaysM)),
      distancePrevious30DaysM: Math.max(0, numberValue(insight.distancePrevious30DaysM)),
      distanceCurrentMonthM: Math.max(0, numberValue(insight.distanceCurrentMonthM)),
      distanceTrendPercent:
        insight.distanceTrendPercent === null ||
        insight.distanceTrendPercent === undefined ||
        !Number.isFinite(Number(insight.distanceTrendPercent))
          ? null
          : Number(insight.distanceTrendPercent),
      activeDaysLast30Days: Math.max(0, Math.round(numberValue(insight.activeDaysLast30Days))),
      currentRideDayStreak: Math.max(0, Math.round(numberValue(insight.currentRideDayStreak))),
      longestRideM: Math.max(0, numberValue(insight.longestRideM)),
      averageRideDistanceM: Math.max(0, numberValue(insight.averageRideDistanceM)),
      averageRideDurationS: Math.max(0, numberValue(insight.averageRideDurationS)),
      averageTopSpeedKmh: Math.max(0, numberValue(insight.averageTopSpeedKmh)),
      favoriteWeekday: this.optionalLabel(insight.favoriteWeekday),
      favoriteTimeOfDay: this.optionalLabel(insight.favoriteTimeOfDay),
      reviewCompletionPercent: Math.min(
        100,
        Math.max(0, numberValue(insight.reviewCompletionPercent)),
      ),
      cleanupCandidateCount: Math.max(0, Math.round(numberValue(insight.cleanupCandidateCount))),
      projectedMonthDistanceM: Math.max(0, numberValue(insight.projectedMonthDistanceM)),
    };
  }

  private optionalLabel(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private formatKmNumber(value: number) {
    return value >= 100 ? Math.round(value).toLocaleString() : value.toFixed(1);
  }

  private async loadGoal() {
    let localGoal: number | null = null;
    try {
      const stored = Number(window.localStorage.getItem(this.goalStorageKey()));
      if (Number.isFinite(stored) && stored >= 10 && stored <= 5000) {
        const rounded = Math.round(stored);
        localGoal = rounded;
      }
    } catch {
      // Storage can be disabled; the in-memory default still works.
    }
    if (localGoal != null) {
      this.monthlyGoalKm.set(localGoal);
      this.goalDraftKm.set(localGoal);
    }
    try {
      const response = await this.api.request<{ preferences?: { monthlyDistanceGoalKm?: unknown } }>('/profile/preferences');
      const serverGoal = Number(response.preferences?.monthlyDistanceGoalKm);
      if (Number.isFinite(serverGoal) && serverGoal >= 10 && serverGoal <= 5000) {
        const rounded = Math.round(serverGoal);
        this.monthlyGoalKm.set(rounded);
        this.goalDraftKm.set(rounded);
        this.storeGoal(rounded);
      } else if (localGoal != null) {
        void this.writeGoal(localGoal).catch(() => {
          // Keep the valid legacy local target if the deployed server rejects the migration write.
        });
      }
    } catch {
      // The server endpoint is additive. Existing deployments continue with rider-scoped local storage.
    }
  }

  private async writeGoal(value: number): Promise<boolean> {
    const integerGoal = Math.round(Number(value));
    if (!Number.isFinite(integerGoal) || integerGoal < 10 || integerGoal > 5000) return false;
    try {
      await this.api.request('/profile/preferences', {
        method: 'PATCH', body: JSON.stringify({ monthlyDistanceGoalKm: integerGoal }),
      });
      this.storeGoal(integerGoal);
      return true;
    } catch (error) {
      if (canUseLocalFallback(error)) {
        this.storeGoal(integerGoal);
        return false;
      }
      throw error;
    }
  }

  private storeGoal(value: number) {
    try {
      window.localStorage.setItem(this.goalStorageKey(), String(value));
    } catch {
      // Storage can be disabled; keep the goal for the current session.
    }
  }

  private goalStorageKey() {
    const userKey = this.auth.user()?.id || this.auth.user()?.email || 'rider';
    return `ridepulse_monthly_goal_km_${encodeURIComponent(userKey)}`;
  }

  private localTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  private trendRequestId = 0;
}

function canUseLocalFallback(error: unknown) {
  return (error instanceof HttpRequestError && error.status === 404) || isOfflineError(error);
}

function isOfflineError(error: unknown) {
  return error instanceof Error && /Network request failed|Request timed out/i.test(error.message);
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Check your connection and try again.';
}
