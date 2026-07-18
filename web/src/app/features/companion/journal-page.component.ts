import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { dateLabel, km, kmh } from '../../core/format';
import { Ride, Trip } from '../../core/models';
import { rideDisplayTitle } from '../../core/ride-title';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { RouteArtComponent } from '../../shared/route-art.component';
import { DialogFocusDirective } from '../../shared/dialog-focus.directive';

type Filter = 'all' | 'month' | 'unreviewed' | 'cleanup';
type Sort = 'newest' | 'longest' | 'fastest';
type JournalView = 'rides' | 'trips' | 'memories';
type RidePage = { rides?: Ride[]; pageInfo?: { hasMore?: boolean; nextCursor?: string | null } };

@Component({
  selector: 'app-journal-page',
  standalone: true,
  imports: [DialogFocusDirective, FormsModule, LoadingPulseComponent, LucideAngularModule, RouterLink, RouteArtComponent],
  template: `
    <section class="page-title">
      <p class="kicker">YOUR RIDE LIBRARY</p>
      <h1>Journal</h1>
      <p>Find a ride, group a trip, or revisit the moments worth keeping.</p>
    </section>

    <nav class="journal-tabs" aria-label="Journal sections">
      @for (item of views; track item.key) {
        <button type="button" [class.active]="view() === item.key" [attr.aria-current]="view() === item.key ? 'page' : null" (click)="setView(item.key)">
          <lucide-icon [name]="item.icon" size="17" /> {{ item.label }}
        </button>
      }
    </nav>

    @if (view() === 'rides') {
      <div class="journal-controls">
        <div class="filter-bar" aria-label="Ride filters">
          @for (item of filters; track item.key) {
            <button type="button" [class.active]="filter() === item.key" [attr.aria-pressed]="filter() === item.key" (click)="choose(item.key)">{{ item.label }}</button>
          }
        </div>
        <label class="journal-sort">Sort
          <select [ngModel]="sort()" (ngModelChange)="setSort($event)">
            <option value="newest">Newest</option><option value="longest">Longest</option><option value="fastest">Fastest</option>
          </select>
        </label>
      </div>
      <section class="search-panel journal-search-panel">
        <label class="search-field"><lucide-icon name="search" size="17" /><input [(ngModel)]="searchQuery" (ngModelChange)="queueSearch()" aria-label="Search rides" placeholder="Search titles, notes, places, insights" /></label>
        <div class="button-row"><button type="button" class="secondary-action" (click)="clearSearch()">Clear</button></div>
      </section>
      @if (error()) { <button class="notice danger" type="button" (click)="load()">{{ error() }} Tap to retry.</button> }
      @if (loading()) { <app-loading-pulse label="Loading your rides" /> } @else {
        <div class="ride-list journal-rows">
          @for (ride of displayed(); track ride.id) {
            <a class="ride-row journal-row" [routerLink]="['/app/journal', ride.id]">
              <div class="journal-row-art"><app-route-art [points]="ride.routePreview || ride.points" /></div>
              <div><strong>{{ titleFor(ride) }}</strong><span>{{ dateLabel(ride.startedAt) }} · {{ ride.cleanupReason || ride.aiSummary || ride.summaryText || ride.endLabel }}</span></div>
              <div class="journal-row-metrics"><b>{{ km(ride.distanceM) }}</b><span>{{ kmh(ride.topSpeedKmh) }}</span></div>
            </a>
          } @empty { <article class="empty-card">No rides match this view yet.</article> }
        </div>
        @if (hasMore()) { <button type="button" class="secondary-action journal-more" (click)="loadMore()">Load more rides</button> }
      }
    } @else if (view() === 'trips') {
      <section class="section-head"><div><h2>Trip albums</h2><p class="section-copy">Manual folders keep related rides together without changing the originals.</p></div><button type="button" class="primary-action" (click)="tripDialogOpen.set(true)"><lucide-icon name="plus-circle" size="17" /> New trip</button></section>
      @if (tripLoading()) { <app-loading-pulse label="Loading trip albums" /> } @else {
        <div class="journal-grid trips-grid">
          @for (trip of trips(); track trip.id) { <a class="journal-tile trip-tile" [routerLink]="['/app/trips', trip.id]"><div class="trip-tile-icon"><lucide-icon name="folder-open" size="28" /></div><p>{{ trip.startedAt ? dateLabel(trip.startedAt) : 'New trip' }}</p><h3>{{ trip.title }}</h3><span>{{ trip.description || 'Manual ride album' }}</span><div class="tile-metrics"><b>{{ trip.rideCount || 0 }} rides</b><b>{{ km(trip.distanceM) }}</b></div></a> } @empty { <article class="empty-card">No trip albums yet. Create one and add rides from Ride Detail.</article> }
        </div>
      }
      @if (tripDialogOpen()) {
        <div class="dialog-backdrop" (click)="tripDialogOpen.set(false)"></div>
        <form class="journal-dialog" role="dialog" aria-modal="true" aria-labelledby="new-trip-heading" (submit)="createTrip($event)" [appDialogFocus]="closeTripDialog">
          <div class="section-head"><h2 id="new-trip-heading">New trip album</h2><button type="button" class="modal-close" aria-label="Close" (click)="tripDialogOpen.set(false)"><lucide-icon name="x" size="20" /></button></div>
          <label>Trip title<input name="tripTitle" maxlength="120" required [(ngModel)]="tripTitle" placeholder="Coastal weekend" /></label>
          <label>Notes<textarea name="tripDescription" maxlength="1000" [(ngModel)]="tripDescription" placeholder="Optional notes"></textarea></label>
          <div class="button-row"><button type="submit" class="primary-action" [disabled]="tripSaving()">{{ tripSaving() ? 'Creating...' : 'Create trip' }}</button><button type="button" class="secondary-action" (click)="tripDialogOpen.set(false)">Cancel</button></div>
        </form>
      }
    } @else {
      <section class="section-head"><div><h2>Memories</h2><p class="section-copy">A quieter view of your recent ride stories and album moments.</p></div></section>
      <div class="journal-grid">
        @for (ride of memories(); track ride.id) { <a class="journal-tile" [routerLink]="['/app/journal', ride.id]"><div class="tile-art"><app-route-art [points]="ride.routePreview || ride.points" /></div><p>{{ dateLabel(ride.startedAt) }}</p><h3>{{ titleFor(ride) }}</h3><span>{{ ride.aiSummary || ride.summaryText || ride.highlightReason || 'Open this ride to add photos and notes.' }}</span><div class="tile-metrics"><b>{{ km(ride.distanceM) }}</b><b>Memory</b></div></a> } @empty { <article class="empty-card">Your saved ride moments will appear here.</article> }
      </div>
    }
  `,
})
export class JournalPageComponent implements OnDestroy, OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly rides = signal<Ride[]>([]);
  readonly trips = signal<Trip[]>([]);
  readonly filter = signal<Filter>('all');
  readonly sort = signal<Sort>('newest');
  readonly view = signal<JournalView>('rides');
  readonly loading = signal(false);
  readonly tripLoading = signal(false);
  readonly tripDialogOpen = signal(false);
  readonly tripSaving = signal(false);
  readonly error = signal('');
  readonly hasMore = signal(false);
  private nextCursor: string | null = null;
  private listGeneration = 0;
  private reloadQueued = false;
  readonly km = km;
  readonly kmh = kmh;
  readonly dateLabel = dateLabel;
  searchQuery = '';
  tripTitle = '';
  tripDescription = '';
  readonly views: { key: JournalView; label: string; icon: string }[] = [
    { key: 'rides', label: 'Rides', icon: 'history' }, { key: 'trips', label: 'Trips', icon: 'folder-open' }, { key: 'memories', label: 'Memories', icon: 'image' },
  ];
  readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'month', label: 'This month' }, { key: 'unreviewed', label: 'Needs review' }, { key: 'cleanup', label: 'Cleanup' },
  ];
  readonly displayed = computed(() => this.sorted(this.filtered(this.rides())));
  readonly memories = computed(() => this.rides().filter((ride) => Boolean(ride.aiSummary || ride.summaryText || ride.highlightReason)).slice(0, 24));

  ngOnInit() {
    this.restoreState();
    const legacyView = this.route.snapshot.data['journalView'] as JournalView | undefined;
    const queryView = this.route.snapshot.queryParamMap.get('view') as JournalView | null;
    const queryFilter = this.route.snapshot.queryParamMap.get('filter') as Filter | null;
    const querySort = this.route.snapshot.queryParamMap.get('sort') as Sort | null;
    if (queryView === 'rides' || queryView === 'trips' || queryView === 'memories') this.view.set(queryView);
    else if (legacyView) this.view.set(legacyView);
    if (queryFilter && this.filters.some((item) => item.key === queryFilter)) this.filter.set(queryFilter);
    if (querySort && ['newest', 'longest', 'fastest'].includes(querySort)) this.sort.set(querySort);
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) this.searchQuery = q;
    void this.load();
    if (this.view() === 'trips') void this.loadTrips();
  }

  ngOnDestroy() { if (this.searchTimer) clearTimeout(this.searchTimer); }

  closeTripDialog = () => this.tripDialogOpen.set(false);

  setView(view: JournalView) {
    this.view.set(view); this.persistState();
    void this.router.navigate(['/app/journal'], { queryParams: { view: view === 'rides' ? null : view, q: this.searchQuery || null }, queryParamsHandling: 'merge' });
    if (view === 'trips' && !this.trips().length) void this.loadTrips();
    if (view === 'memories' && !this.rides().length) void this.load();
  }

  choose(filter: Filter) { this.filter.set(filter); this.persistState(); this.restartList(); }
  setSort(sort: Sort) { if (this.sort() === sort) return; this.sort.set(sort); this.persistState(); void this.updateQuery(); this.restartList(); }
  queueSearch() { if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.restartList(), 300); }
  clearSearch() { this.searchQuery = ''; this.restartList(); }
  titleFor(ride: Ride) { return rideDisplayTitle(ride); }

  async load(more = false) {
    if (this.loading()) return;
    if (more && !this.nextCursor) return;
    const generation = this.listGeneration;
    this.loading.set(true); this.error.set('');
    try {
      const params = new URLSearchParams({ period: this.filter() === 'month' ? 'month' : 'all', limit: '50', sort: this.sort() });
      const query = this.searchQuery.trim(); if (query) params.set('q', query);
      if (this.filter() === 'unreviewed') params.set('reviewStatus', 'unreviewed');
      if (this.filter() === 'cleanup') params.set('reviewStatus', 'cleanup');
      if (more && this.nextCursor) params.set('cursor', this.nextCursor);
      const response = await this.api.request<RidePage>(`/rides?${params.toString()}`);
      if (generation !== this.listGeneration) return;
      const received = Array.isArray(response.rides) ? response.rides : [];
      this.rides.set(more ? [...this.rides(), ...received.filter((ride) => !this.rides().some((old) => old.id === ride.id))] : received);
      this.nextCursor = response.pageInfo?.nextCursor || null;
      this.hasMore.set(Boolean(response.pageInfo?.hasMore));
      this.persistState(); void this.updateQuery();
    } catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'Unable to load journal.'); }
    finally {
      this.loading.set(false);
      if (this.reloadQueued) {
        this.reloadQueued = false;
        void this.load();
      }
    }
  }

  loadMore() { void this.load(true); }
  async createTrip(event: Event) {
    event.preventDefault();
    const title = this.tripTitle.trim();
    if (!title || this.tripSaving()) return;
    this.tripSaving.set(true);
    try {
      await this.api.request('/trips', { method: 'POST', body: JSON.stringify({ title, description: this.tripDescription.trim() || null }) });
      this.tripTitle = ''; this.tripDescription = ''; this.tripDialogOpen.set(false);
      await this.loadTrips();
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Unable to create trip album.'); }
    finally { this.tripSaving.set(false); }
  }
  private async loadTrips() { this.tripLoading.set(true); try { const response = await this.api.request<{ trips?: Trip[] }>('/trips'); this.trips.set(Array.isArray(response.trips) ? response.trips : []); } finally { this.tripLoading.set(false); } }
  private filtered(rides: Ride[]) { if (this.filter() === 'unreviewed') return rides.filter((ride) => !ride.reviewedAt); if (this.filter() === 'cleanup') return rides.filter((ride) => ride.cleanupCandidate); return rides; }
  private sorted(rides: Ride[]) { const copy = [...rides]; if (this.sort() === 'longest') return copy.sort((a, b) => Number(b.distanceM || 0) - Number(a.distanceM || 0)); if (this.sort() === 'fastest') return copy.sort((a, b) => Number(b.topSpeedKmh || 0) - Number(a.topSpeedKmh || 0)); return copy; }
  private updateQuery() { void this.router.navigate([], { relativeTo: this.route, queryParams: { q: this.searchQuery.trim() || null, filter: this.filter() === 'all' ? null : this.filter(), sort: this.sort() === 'newest' ? null : this.sort() }, queryParamsHandling: 'merge', replaceUrl: true }); }
  private restartList() {
    this.listGeneration += 1;
    this.nextCursor = null;
    this.hasMore.set(false);
    if (this.loading()) { this.reloadQueued = true; return; }
    void this.load();
  }
  private stateKey() {
    const rider = this.auth?.user()?.id || this.auth?.user()?.email || 'anonymous';
    return `ridepulse_web_journal_state_${encodeURIComponent(rider)}`;
  }
  private restoreState() { try { const state = JSON.parse(window.localStorage.getItem(this.stateKey()) || '{}') as Partial<{ filter: Filter; sort: Sort; view: JournalView }>; if (state.filter && this.filters.some((item) => item.key === state.filter)) this.filter.set(state.filter); if (state.sort && ['newest', 'longest', 'fastest'].includes(state.sort)) this.sort.set(state.sort); if (state.view && ['rides', 'trips', 'memories'].includes(state.view)) this.view.set(state.view); } catch { /* storage is optional */ } }
  private persistState() { try { window.localStorage.setItem(this.stateKey(), JSON.stringify({ filter: this.filter(), sort: this.sort(), view: this.view() })); } catch { /* storage is optional */ } }
}
