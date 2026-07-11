import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AnalyticsPoint, RiderPulseInsights } from '../../core/models';
import { AnalyticsPageComponent } from './analytics-page.component';

const PULSE: RiderPulseInsights = {
  generatedAt: '2026-07-11T10:00:00Z',
  ridesLast30Days: 12,
  distanceLast30DaysM: 240_000,
  distancePrevious30DaysM: 180_000,
  distanceCurrentMonthM: 120_000,
  distanceTrendPercent: 33.3,
  activeDaysLast30Days: 8,
  currentRideDayStreak: 3,
  longestRideM: 72_000,
  averageRideDistanceM: 20_000,
  averageRideDurationS: 3_600,
  averageTopSpeedKmh: 84,
  favoriteWeekday: 'Sunday',
  favoriteTimeOfDay: 'Morning',
  reviewCompletionPercent: 75,
  cleanupCandidateCount: 2,
  projectedMonthDistanceM: 320_000,
};

describe('AnalyticsPageComponent', () => {
  const user = signal({
    id: 'rider-7',
    email: 'rider@example.com',
    name: 'Rider',
    bikeModel: 'Duke',
  });
  let request: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    window.localStorage.clear();
    request = vi.fn((path: string) => {
      if (path.startsWith('/analytics/insights?timezone=')) {
        return Promise.resolve({ insights: PULSE });
      }
      return Promise.resolve({ points: [] });
    });

    await TestBed.configureTestingModule({
      imports: [AnalyticsPageComponent],
      providers: [
        { provide: ApiService, useValue: { request } },
        { provide: AuthService, useValue: { user } },
      ],
    }).compileComponents();
  });

  it('loads the rider pulse and keeps trend analytics available', async () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(request).toHaveBeenCalledWith(
      expect.stringMatching(/^\/analytics\/insights\?timezone=/),
    );
    expect(request).toHaveBeenCalledWith('/analytics/distance?bucket=daily');
    expect(text).toContain('Your riding rhythm');
    expect(text).toContain('120 km');
    expect(text).toContain('this calendar month');
    expect(text).toContain('12');
    expect(text).toContain('Sunday');
    expect(text).toContain('Morning');
    expect(text).toContain('75%');
  });

  it('persists a monthly goal for the signed-in rider', async () => {
    window.localStorage.setItem('ridepulse_monthly_goal_km_rider-7', '450');
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.monthlyGoalKm()).toBe(450);

    component.startGoalEdit();
    component.goalDraftKm.set(520);
    component.saveGoal(new Event('submit'));

    expect(component.monthlyGoalKm()).toBe(520);
    expect(window.localStorage.getItem('ridepulse_monthly_goal_km_rider-7')).toBe('520');
    expect(component.goalSaved()).toContain('520 km');
  });

  it('rejects an unsafe goal value without overwriting the saved target', async () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.startGoalEdit();
    component.goalDraftKm.set(9000);
    component.saveGoal(new Event('submit'));

    expect(component.monthlyGoalKm()).toBe(300);
    expect(component.goalError()).toContain('5,000');
    expect(window.localStorage.getItem('ridepulse_monthly_goal_km_rider-7')).toBeNull();
  });

  it('shows an empty state when the rider has no recorded activity', async () => {
    request.mockImplementation((path: string) =>
      path.startsWith('/analytics/insights?timezone=')
        ? Promise.resolve({
            insights: {
              ...PULSE,
              ridesLast30Days: 0,
              distanceLast30DaysM: 0,
              favoriteWeekday: null,
              favoriteTimeOfDay: null,
            },
          })
        : Promise.resolve({ points: [] }),
    );
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Your first ride will bring this pulse to life.',
    );
  });

  it('shows a retry action when Rider Pulse fails without hiding ride history', async () => {
    request.mockImplementation((path: string) =>
      path.startsWith('/analytics/insights?timezone=')
        ? Promise.reject(new Error('Pulse service unavailable.'))
        : Promise.resolve({ points: [] }),
    );
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Pulse service unavailable.');
    expect(text).toContain('RIDE HISTORY');
    expect(fixture.nativeElement.querySelector('.error-state button')).toBeTruthy();
  });

  it('rejects an incomplete insight payload instead of presenting false zero activity', async () => {
    request.mockImplementation((path: string) =>
      path.startsWith('/analytics/insights?timezone=')
        ? Promise.resolve({ insights: {} })
        : Promise.resolve({ points: [] }),
    );
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('The Rider Pulse response was incomplete.');
    expect(text).not.toContain('Your first ride will bring this pulse to life.');
  });

  it('keeps the latest trend period when older requests finish later', async () => {
    let resolveMonthly!: (value: { points: AnalyticsPoint[] }) => void;
    request.mockImplementation((path: string) => {
      if (path.startsWith('/analytics/insights?timezone=')) {
        return Promise.resolve({ insights: PULSE });
      }
      if (path === '/analytics/distance?bucket=monthly') {
        return new Promise<{ points: AnalyticsPoint[] }>((resolve) => {
          resolveMonthly = resolve;
        });
      }
      if (path === '/analytics/distance?bucket=yearly') {
        return Promise.resolve({
          points: [
            {
              bucket: '2026-01-01T00:00:00Z',
              distanceM: 9_000,
              rideCount: 1,
              durationS: 600,
              topSpeedKmh: 50,
            },
          ],
        });
      }
      return Promise.resolve({ points: [] });
    });

    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setBucket('monthly');
    fixture.componentInstance.setBucket('yearly');
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveMonthly({
      points: [
        {
          bucket: '2026-07-01T00:00:00Z',
          distanceM: 1_000,
          rideCount: 1,
          durationS: 60,
          topSpeedKmh: 10,
        },
      ],
    });
    await fixture.whenStable();

    expect(fixture.componentInstance.bucket()).toBe('yearly');
    expect(fixture.componentInstance.points()[0]?.distanceM).toBe(9_000);
  });
});
