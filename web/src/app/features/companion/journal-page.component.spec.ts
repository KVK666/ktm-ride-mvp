import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FolderOpen, History, Image, LucideAngularModule, Search } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { JournalPageComponent } from './journal-page.component';

describe('JournalPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JournalPageComponent],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick({ FolderOpen, History, Image, Search })),
        { provide: ApiService, useValue: { request: () => Promise.resolve({ rides: [] }) } },
      ],
    }).compileComponents();
  });

  it('announces the active filter and ride search field', async () => {
    const fixture = TestBed.createComponent(JournalPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const filters = Array.from(
      fixture.nativeElement.querySelectorAll('.filter-bar button'),
    ) as HTMLButtonElement[];
    const search = fixture.nativeElement.querySelector(
      '.journal-search-panel input',
    ) as HTMLInputElement;

    expect(filters[0].getAttribute('aria-pressed')).toBe('true');
    expect(
      filters.slice(1).every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
    expect(search.getAttribute('aria-label')).toBe('Search rides');
  });

  it('shows only flagged rides in the cleanup queue', () => {
    const fixture = TestBed.createComponent(JournalPageComponent);
    const component = fixture.componentInstance;
    component.rides.set([
      { id: 'noise', cleanupCandidate: true },
      { id: 'ride', cleanupCandidate: false },
    ] as never[]);

    component.choose('cleanup');

    expect(component.displayed().map((ride) => ride.id)).toEqual(['noise']);
  });

  it('separates sorting from rider-review filters', () => {
    const fixture = TestBed.createComponent(JournalPageComponent);
    const component = fixture.componentInstance;
    component.rides.set([
      { id: 'short', distanceM: 5000, topSpeedKmh: 100, reviewedAt: '2026-07-18T00:00:00Z' },
      { id: 'long', distanceM: 20000, topSpeedKmh: 70 },
    ] as never[]);

    component.setSort('longest');

    expect(component.displayed().map((ride) => ride.id)).toEqual(['long', 'short']);
    component.choose('unreviewed');
    expect(component.displayed().map((ride) => ride.id)).toEqual(['long']);
  });

  it('offers rides, trips, and memories as journal sections', async () => {
    const fixture = TestBed.createComponent(JournalPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.journal-tabs button'))
      .map((button: HTMLButtonElement) => button.textContent?.trim());

    expect(labels).toEqual(['Rides', 'Trips', 'Memories']);
  });
});
