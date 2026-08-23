import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FolderOpen, LucideAngularModule, PlusCircle, RefreshCw, Search } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { Trip } from '../../core/models';
import { TripsPageComponent } from './trips-page.component';

const trip = (id: string, title: string, description = ''): Trip => ({
  id,
  title,
  description,
  rideCount: 0,
  distanceM: 0,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
});

describe('TripsPageComponent', () => {
  let request: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    request = vi.fn(() => Promise.resolve({ trips: [] }));
    await TestBed.configureTestingModule({
      imports: [TripsPageComponent],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick({ FolderOpen, PlusCircle, RefreshCw, Search })),
        { provide: ApiService, useValue: { request } },
      ],
    }).compileComponents();
  });

  it('filters albums and renders more cards incrementally', async () => {
    const trips = Array.from({ length: 30 }, (_, index) => trip(`trip-${index}`, `Trip ${index}`));
    request.mockResolvedValue({ trips });

    const fixture = TestBed.createComponent(TripsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.displayedTrips()).toHaveLength(24);
    expect(component.hasMore()).toBe(true);

    component.loadMore();
    expect(component.displayedTrips()).toHaveLength(30);
    expect(component.hasMore()).toBe(false);

    component.setSearchQuery('trip 2');
    expect(component.filteredTrips().map((item) => item.id)).toEqual([
      'trip-2', 'trip-20', 'trip-21', 'trip-22', 'trip-23', 'trip-24',
      'trip-25', 'trip-26', 'trip-27', 'trip-28', 'trip-29',
    ]);
    expect(component.displayedTrips()).toHaveLength(11);
  });

  it('searches album notes and clears the query without another request', async () => {
    request.mockResolvedValue({ trips: [trip('coast', 'Coastal loop', 'Sea roads'), trip('city', 'City commute')] });

    const fixture = TestBed.createComponent(TripsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    component.setSearchQuery('sea roads');
    expect(component.displayedTrips().map((item) => item.id)).toEqual(['coast']);
    component.clearSearch();

    expect(component.displayedTrips().map((item) => item.id)).toEqual(['coast', 'city']);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
