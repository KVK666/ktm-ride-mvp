import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArrowRight, CircleAlert, Download, LucideAngularModule, Sparkles } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { HomePageComponent } from './home-page.component';

describe('HomePageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick({ ArrowRight, CircleAlert, Download, Sparkles })),
        {
          provide: ApiService,
          useValue: {
            optional: (path: string) => Promise.resolve(path === '/profile/preferences'
              ? { preferences: { monthlyDistanceGoalKm: 400 } }
              : null),
            request: () => Promise.resolve({ stats: {}, recentRides: [] }),
          },
        },
      ],
    }).compileComponents();
  });

  it('puts attention and a monthly goal before the latest ride', async () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    component.journal.set({
      generatedAt: '2026-07-19T00:00:00Z',
      stats: { totalRides: 1, monthDistanceM: 120_000, bestTopSpeedKmh: 80, averageSpeedKmh: 52 },
      monthlyRecap: { distanceM: 120_000, previousMonthDistanceM: 0, rideCount: 1 },
      latestRide: { id: 'ride-1', startedAt: '2026-07-19T00:00:00Z', distanceM: 120_000, title: 'Sunday ride' },
      recentRides: [],
      highlights: [],
      unreviewedCount: 2,
    } as never);
    component.goalKm.set(400);
    component.loading.set(false);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text.indexOf('rides need attention')).toBeLessThan(text.indexOf('Sunday ride'));
    expect(text).toContain('30% of 400 km goal');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Home');
  });
});
