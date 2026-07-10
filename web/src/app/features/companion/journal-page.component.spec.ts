import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FolderOpen, LucideAngularModule, Search } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { JournalPageComponent } from './journal-page.component';

describe('JournalPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JournalPageComponent],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick({ FolderOpen, Search })),
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
});
