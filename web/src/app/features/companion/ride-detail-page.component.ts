import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { HttpRequestError } from '../../core/http-client';
import { environment } from '../../../environments/environment';
import { dateLabel, duration, km, kmh } from '../../core/format';
import {
  Ride,
  RideAlbumPhoto,
  RideIntelligence,
  Trip,
} from '../../core/models';
import { rideDisplayTitle } from '../../core/ride-title';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { GoogleRouteMapComponent } from '../../shared/google-route-map.component';
import { DialogFocusDirective } from '../../shared/dialog-focus.directive';

@Component({
  selector: 'app-ride-detail-page',
  standalone: true,
  imports: [
    FormsModule,
    DialogFocusDirective,
    GoogleRouteMapComponent,
    LoadingPulseComponent,
    LucideAngularModule,
    RouterLink,
  ],
  template: `
    <a class="back-link" routerLink="/app/journal">Back to journal</a>
    @if (loading()) {
      <app-loading-pulse label="Loading ride details" />
    } @else if (ride(); as current) {
      <section class="ai-insight-hero">
        <div class="ai-insight-head">
          <div class="ai-icon">
            <lucide-icon [name]="aiThinking() ? 'sparkles' : 'activity'" size="24" />
          </div>
          <div>
            <p class="kicker">{{ aiThinking() ? 'STORY UPDATING' : 'RIDE STORY' }}</p>
            <h1>{{ displayTitle() }}</h1>
            <span>{{ dateLabel(current.startedAt) }} · {{ timeLabel(current.startedAt) }}</span>
          </div>
        </div>
        <p>{{ intelligence()?.summaryText || current.aiSummary || aiInsight() }}</p>
        <div class="ai-fact-grid">
          <article>
            <span>Why it stands out</span><strong>{{ aiInsight() }}</strong>
          </article>
          <article>
            <span>Best moment</span><strong>{{ bestMoment() }}</strong>
          </article>
        </div>
      </section>

      <div class="button-row detail-actions" aria-label="Ride actions">
        <button type="button" class="primary-action" (click)="openTripPicker()"><lucide-icon name="folder-open" size="17" /> Add to trip</button>
        <button type="button" class="secondary-action" (click)="copyStoryPrompt()"><lucide-icon name="sparkles" size="17" /> Create AI prompt</button>
        <button type="button" class="secondary-action" (click)="scrollToReview()"><lucide-icon name="save" size="17" /> Edit or review</button>
      </div>

      @if (rideTrips().length) {
        <section class="membership-summary" aria-label="Trip membership">
          <span>In trips</span>
          @for (trip of rideTrips(); track trip.id) { <a [routerLink]="['/app/trips', trip.id]">{{ trip.title }}</a> }
        </section>
      }

      @if (message()) {
        <button class="notice" type="button" (click)="message.set('')">{{ message() }}</button>
      }
      @if (error()) {
        <button class="notice danger" type="button" (click)="load()">
          {{ error() }} Tap to retry.
        </button>
      }

      @if (intelligence()?.cleanupCandidate) {
        <section class="cleanup-notice" role="status">
          <lucide-icon name="shield-check" size="22" />
          <div>
            <strong>Check this recording</strong>
            <p>{{ intelligence()?.cleanupReason || 'This ride recorded very little movement.' }}</p>
            <span>Mark it reviewed to keep it, or use Ride controls to delete it.</span>
          </div>
        </section>
      }

      <div class="metric-grid">
        <article class="metric-card accent">
          <span>Distance</span><strong>{{ km(current.distanceM) }}</strong>
        </article>
        <article class="metric-card">
          <span>Duration</span><strong>{{ duration(current.durationS) }}</strong>
        </article>
        <article class="metric-card">
          <span>Top speed</span><strong>{{ kmh(current.topSpeedKmh) }}</strong>
        </article>
        <article class="metric-card">
          <span>Average</span><strong>{{ kmh(current.avgSpeedKmh) }}</strong>
        </article>
      </div>

      <section class="content-section map-section">
        <div class="section-head">
          <h2>Google route map</h2>
          <span>{{ dateLabel(current.startedAt) }}</span>
        </div>
        <app-google-route-map
          [points]="routePoints()"
          [photos]="photos()"
          [title]="displayTitle()"
        />
      </section>

      <section class="content-section">
        <article class="review-panel">
          <div class="section-head">
            <h2>Ride review</h2>
            <span>{{ current.reviewedAt ? 'DONE' : 'OPEN' }}</span>
          </div>
          <label>
            Ride name
            <input maxlength="120" [(ngModel)]="titleDraft" placeholder="Sunday breakfast ride" />
          </label>
          <label>
            Notes
            <textarea
              maxlength="2000"
              [(ngModel)]="notesDraft"
              placeholder="Road condition, stops, fuel, anything worth remembering"
            ></textarea>
          </label>
          <div class="button-row">
            <button
              type="button"
              class="primary-action"
              [disabled]="savingReview()"
              (click)="saveReview(false)"
            >
              <lucide-icon name="save" size="17" /> Save
            </button>
            <button
              type="button"
              class="secondary-action"
              [disabled]="savingReview() || !!current.reviewedAt"
              (click)="saveReview(true)"
            >
              <lucide-icon name="check-circle" size="17" /> Reviewed
            </button>
          </div>
        </article>

        @if (duplicates().length) {
        <article class="review-panel duplicate-panel">
          <div class="section-head">
            <h2>Suspected duplicates</h2>
            <span>{{ duplicates().length }}</span>
          </div>
          <div class="ride-list compact">
            @for (duplicate of duplicates(); track duplicate.id) {
              <article class="ride-row">
                <div>
                  <strong>{{ rideTitle(duplicate) }}</strong>
                  <span>{{ km(duplicate.distanceM) }} / {{ duration(duplicate.durationS) }}</span>
                </div>
                <button type="button" class="icon-danger" (click)="deleteDuplicate(duplicate)">
                  <lucide-icon name="trash-2" size="17" />
                </button>
              </article>
            }
          </div>
        </article>
        }
      </section>

      <section class="content-section">
        <article class="review-panel">
          <div class="section-head">
            <h2>Route summary</h2>
            <span>{{ dateLabel(current.startedAt) }}</span>
          </div>
          <div class="route-facts">
            <div>
              <span>From</span><strong>{{ current.startLabel }}</strong>
            </div>
            <div>
              <span>To</span><strong>{{ current.endLabel }}</strong>
            </div>
            @if (current.destinationName) {
              <div>
                <span>Destination</span><strong>{{ destinationDetail(current) }}</strong>
              </div>
            }
            <div>
              <span>Started</span><strong>{{ timeLabel(current.startedAt) }}</strong>
            </div>
            <div>
              <span>Ended</span><strong>{{ timeLabel(current.endedAt) }}</strong>
            </div>
          </div>
        </article>
      </section>

      <section class="content-section album-section">
        <div class="section-head">
          <h2>Ride album</h2>
          <span>{{ photos().length }} synced photos</span>
        </div>
        <div class="button-row">
          <label class="primary-action file-action">
            <lucide-icon name="image-plus" size="17" /> Add photos
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              (change)="uploadPhotos($event)"
            />
          </label>
          <button
            type="button"
            class="secondary-action"
            [disabled]="!photos().length"
            (click)="slideshowOpen.set(true)"
          >
            <lucide-icon name="play-circle" size="17" /> Slideshow
          </button>
        </div>
        <div class="photo-grid">
          @for (photo of photos(); track photo.id) {
            <article class="photo-tile">
              <button type="button" (click)="viewerPhoto.set(photo)">
                <img [src]="photoUrl(photo)" alt="Ride photo" />
              </button>
              <div>
                <span>{{ timeLabel(photo.createdAt) }}</span>
                <button type="button" (click)="deletePhoto(photo)" title="Remove photo">
                  <lucide-icon name="x" size="15" />
                </button>
              </div>
            </article>
          } @empty {
            <article class="empty-card">
              No synced ride photos yet. Add web photos here, or update the mobile app to sync
              imported ride albums.
            </article>
          }
        </div>
      </section>

      <section class="content-section split-section">
        <article class="review-panel">
          <div class="section-head">
            <h2>Share this ride</h2>
            <span>Story tools</span>
          </div>
          <p>Create a visual memory from this ride without exposing private account data.</p>
          <div class="button-row">
            <button type="button" class="primary-action" (click)="copyStoryPrompt()">
              <lucide-icon name="copy" size="17" /> Copy prompt
            </button>
            <button type="button" class="secondary-action" (click)="downloadStoryCard()">
              <lucide-icon name="download" size="17" /> Download card
            </button>
            <a
              class="secondary-action"
              href="https://chatgpt.com/"
              target="_blank"
              rel="noreferrer"
            >
              <lucide-icon name="sparkles" size="17" /> Open ChatGPT
            </a>
          </div>
        </article>
        <article class="danger-card">
          <div class="section-head">
            <h2>Ride controls</h2>
            <span>Danger zone</span>
          </div>
          <p>
            Delete this ride if it was a test, duplicate, or something you do not want in the
            journal.
          </p>
          <button
            type="button"
            class="delete-ride-button"
            [disabled]="deletingRide()"
            (click)="deleteRide()"
          >
            <lucide-icon name="trash-2" size="18" />
            {{ deletingRide() ? 'Deleting...' : 'Delete this ride' }}
          </button>
        </article>
      </section>

      @if (viewerPhoto(); as photo) {
          <div class="media-modal" role="dialog" aria-modal="true" [appDialogFocus]="closePhotoViewer">
          <button type="button" class="modal-close" (click)="closePhotoViewer()">
            <lucide-icon name="x" size="22" />
          </button>
          <img [src]="photoUrl(photo)" alt="Ride photo preview" />
        </div>
      }

      @if (slideshowOpen()) {
          <div class="media-modal slideshow" role="dialog" aria-modal="true" [appDialogFocus]="closeSlideshow">
          <button type="button" class="modal-close" (click)="closeSlideshow()">
            <lucide-icon name="x" size="22" />
          </button>
          @for (photo of photos(); track photo.id) {
            <img [src]="photoUrl(photo)" alt="Ride slideshow photo" />
          }
        </div>
      }

      @if (tripPickerOpen()) {
        <div class="dialog-backdrop" (click)="closeTripPicker()"></div>
        <section class="journal-dialog trip-picker" role="dialog" aria-modal="true" aria-labelledby="trip-picker-title" [appDialogFocus]="closeTripPicker">
          <div class="section-head"><div><p class="kicker">TRIP MEMBERSHIP</p><h2 id="trip-picker-title">Add to trip albums</h2></div><button type="button" class="modal-close" aria-label="Close trip picker" (click)="closeTripPicker()"><lucide-icon name="x" size="20" /></button></div>
          <p class="section-copy">Choose one or more albums. Your ride stays in the journal and can belong to more than one trip.</p>
          @if (tripPickerError()) { <button type="button" class="notice danger" (click)="loadTripsForPicker()">{{ tripPickerError() }} Tap to retry.</button> }
          @if (tripsLoading()) { <app-loading-pulse label="Loading trip albums" /> } @else {
            <div class="trip-choice-list">
              @for (trip of allTrips(); track trip.id) {
                <label class="trip-choice">
                  <input type="checkbox" [checked]="isTripSelected(trip.id)" (change)="toggleTrip(trip.id, $any($event.target).checked)" />
                  <span><strong>{{ trip.title }}</strong><small>{{ trip.rideCount || 0 }} rides{{ trip.description ? ' · ' + trip.description : '' }}</small></span>
                  @if (isExistingMembership(trip.id)) { <em>Added</em> }
                </label>
              } @empty { <article class="empty-card">No trip albums yet. Create one below, then add this ride.</article> }
            </div>
            <div class="button-row">
              <button type="button" class="primary-action" [disabled]="tripSaving() || !selectedTripIds().size" (click)="saveTripMemberships()"><lucide-icon name="folder-plus" size="17" /> {{ tripSaving() ? 'Adding...' : 'Add selected' }}</button>
              <a class="secondary-action" routerLink="/app/trips" (click)="closeTripPicker()">Manage trips</a>
            </div>
            <form class="inline-trip-create" (submit)="createTrip($event)">
              <label>Create a new trip album <input name="tripTitle" [(ngModel)]="newTripTitle" maxlength="120" placeholder="Weekend escape" /></label>
              <button type="submit" class="secondary-action" [disabled]="creatingTrip()">{{ creatingTrip() ? 'Creating...' : 'Create and add ride' }}</button>
            </form>
          }
        </section>
      }
    } @else {
      <article class="empty-card">{{ error() || 'Ride details unavailable.' }}</article>
    }
  `,
  styles: `
    .membership-summary { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:12px 0 20px; color:var(--muted); font-size:.82rem; font-weight:900; }
    .membership-summary a { min-height:32px; display:inline-flex; align-items:center; border-radius:11px; padding:0 10px; color:var(--text); background:var(--surface-high); text-decoration:none; }
    .trip-picker { max-height:min(82vh, 650px); overflow:auto; }
    .trip-picker .section-head h2 { margin:4px 0 0; }
    .trip-choice-list { display:grid; gap:8px; max-height:260px; overflow:auto; }
    .trip-choice { min-height:62px; display:flex; align-items:center; gap:12px; border:1px solid var(--border); border-radius:15px; padding:10px 12px; cursor:pointer; }
    .trip-choice input { width:20px; height:20px; accent-color:var(--accent); }
    .trip-choice span { min-width:0; flex:1; display:grid; gap:3px; }.trip-choice small { overflow:hidden; color:var(--muted); font-size:.76rem; text-overflow:ellipsis; white-space:nowrap; }
    .trip-choice em { border-radius:10px; padding:4px 7px; color:var(--accent); background:rgba(200,255,90,.1); font-size:.72rem; font-style:normal; font-weight:900; }
    .inline-trip-create { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:end; gap:10px; border-top:1px solid var(--border); padding-top:14px; }.inline-trip-create label { display:grid; gap:6px; color:var(--muted); font-size:.78rem; font-weight:900; }.inline-trip-create input { min-height:42px; border:1px solid var(--border-strong); border-radius:12px; padding:0 10px; color:var(--text); background:var(--background); font:inherit; }
    @media (max-width:520px) { .inline-trip-create { grid-template-columns:1fr; }.inline-trip-create button { width:100%; }.trip-picker { padding:18px; } }
  `,
})
export class RideDetailPageComponent implements OnDestroy, OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly ride = signal<Ride | null>(null);
  readonly intelligence = signal<RideIntelligence | null>(null);
  readonly duplicates = signal<Ride[]>([]);
  readonly photos = signal<RideAlbumPhoto[]>([]);
  readonly loading = signal(true);
  readonly savingReview = signal(false);
  readonly deletingRide = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly viewerPhoto = signal<RideAlbumPhoto | null>(null);
  readonly slideshowOpen = signal(false);
  readonly rideTrips = signal<Trip[]>([]);
  readonly allTrips = signal<Trip[]>([]);
  readonly tripPickerOpen = signal(false);
  readonly tripsLoading = signal(false);
  readonly tripSaving = signal(false);
  readonly creatingTrip = signal(false);
  readonly tripPickerError = signal('');
  readonly selectedTripIds = signal<Set<string>>(new Set());
  titleDraft = '';
  notesDraft = '';
  newTripTitle = '';
  private aiRefreshAttempts = 0;
  private aiRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly photoObjectUrls = new Map<string, string>();
  readonly km = km;
  readonly kmh = kmh;
  readonly duration = duration;
  readonly dateLabel = dateLabel;
  readonly rideTitle = rideDisplayTitle;

  readonly routePoints = computed(() =>
    this.ride()?.points?.length ? this.ride()?.points || [] : this.ride()?.routePreview || [],
  );
  readonly displayTitle = computed(() => rideDisplayTitle(this.ride()));
  readonly badges = computed(() =>
    this.intelligence()?.badges?.length
      ? this.intelligence()?.badges || []
      : this.ride()?.badges || [],
  );
  readonly aiThinking = computed(
    () => (this.intelligence()?.classification?.status || this.ride()?.aiStatus) === 'pending',
  );
  readonly aiInsight = computed(() => {
    if (this.aiThinking()) {
      return 'RidePulse saved the ride first and is building a smarter name, summary, and trip decision now.';
    }
    return (
      this.intelligence()?.keyInsight ||
      this.ride()?.keyInsight ||
      this.intelligence()?.classification?.reason ||
      this.ride()?.rideKindReason ||
      this.intelligence()?.summaryText ||
      this.ride()?.aiSummary ||
      'RidePulse built this from distance, speed, and timing signals.'
    );
  });
  readonly bestMoment = computed(
    () =>
      this.intelligence()?.bestMoment ||
      this.ride()?.bestMoment ||
      `${kmh(this.ride()?.topSpeedKmh)} top speed`,
  );
  readonly storyPrompt = computed(() => {
    const ride = this.ride();
    if (!ride) {
      return '';
    }
    const route = this.routePromptLine(ride);
    const destination = ride.destinationName
      ? `, destination: ${this.destinationDetail(ride)}`
      : '';
    const insight =
      this.intelligence()?.keyInsight ||
      ride.keyInsight ||
      this.intelligence()?.summaryText ||
      ride.aiSummary;
    return `Create a cinematic RidePulse story image for "${this.displayTitle()}": ${km(ride.distanceM)}, ${duration(ride.durationS)}, top speed ${kmh(ride.topSpeedKmh)}, route context: ${route}${destination}${insight ? `, RidePulse insight: ${insight}` : ''}. Keep exact stats, avoid fake location details, use a dark graphite OLED mood with electric-lime route glow.`;
  });

  ngOnInit() {
    void this.load();
  }

  ngOnDestroy() {
    if (this.aiRefreshTimer) {
      clearTimeout(this.aiRefreshTimer);
    }
    this.photoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  closePhotoViewer = () => this.viewerPhoto.set(null);
  closeSlideshow = () => this.slideshowOpen.set(false);

  async load() {
    const id = this.rideId();
    if (!id) {
      this.error.set('Ride id is missing.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.aiRefreshAttempts = 0;
    try {
      const rideResponse = await this.api.request<{ ride: Ride }>(`/rides/${encodeURIComponent(id)}`);
      const ride = rideResponse.ride || null;
      this.ride.set(ride);
      this.titleDraft = ride?.title || '';
      this.notesDraft = ride?.notes || '';
      this.loading.set(false);
      const [intel, duplicates, photos, memberships] = await Promise.all([
        this.api.optional<{ intelligence: RideIntelligence }>(
          `/rides/${encodeURIComponent(id)}/intelligence`,
        ),
        this.api.optional<{ duplicates: Ride[] }>(`/rides/${encodeURIComponent(id)}/duplicates`),
        this.api.optional<{ photos: RideAlbumPhoto[] }>(`/rides/${encodeURIComponent(id)}/photos?includeData=false`),
        this.api.optional<{ trips: Trip[] }>(`/rides/${encodeURIComponent(id)}/trips`),
      ]);
      this.intelligence.set(intel?.intelligence || null);
      this.duplicates.set(Array.isArray(duplicates?.duplicates) ? duplicates.duplicates : []);
      this.photos.set(Array.isArray(photos?.photos) ? photos.photos : []);
      this.rideTrips.set(Array.isArray(memberships?.trips) ? memberships.trips : []);
      await Promise.all(this.photos().map((photo) => this.hydratePhoto(photo, id)));
      this.scheduleAiRefresh();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load ride.');
    } finally {
      this.loading.set(false);
    }
  }

  async saveReview(markReviewed: boolean) {
    const ride = this.ride();
    if (!ride) return;
    this.savingReview.set(true);
    this.message.set('');
    try {
      const response = await this.api.request<{ ride: Partial<Ride> }>(
        `/rides/${encodeURIComponent(ride.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ title: this.titleDraft, notes: this.notesDraft, markReviewed }),
        },
      );
      this.ride.set({ ...ride, ...response.ride });
      this.message.set(markReviewed ? 'Ride reviewed and saved.' : 'Ride review saved.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save ride review.');
    } finally {
      this.savingReview.set(false);
    }
  }

  async deleteDuplicate(duplicate: Ride) {
    if (
      !window.confirm(
        `Delete duplicate ride?\n\n${rideDisplayTitle(duplicate)}\n${km(duplicate.distanceM)}`,
      )
    ) {
      return;
    }
    try {
      await this.api.request(`/rides/${encodeURIComponent(duplicate.id)}`, { method: 'DELETE' });
      this.duplicates.set(this.duplicates().filter((item) => item.id !== duplicate.id));
      this.message.set('Duplicate ride deleted.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to delete duplicate ride.');
    }
  }

  async deleteRide() {
    const ride = this.ride();
    if (
      !ride ||
      !window.confirm(
        `Delete this ride?\n\n${this.displayTitle()}\n${km(ride.distanceM)}\n\nThis permanently removes the ride and synced album photos.`,
      )
    ) {
      return;
    }
    this.deletingRide.set(true);
    try {
      await this.api.request(`/rides/${encodeURIComponent(ride.id)}`, { method: 'DELETE' });
      await this.router.navigate(['/app/journal']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to delete this ride.');
    } finally {
      this.deletingRide.set(false);
    }
  }

  async uploadPhotos(event: Event) {
    const ride = this.ride();
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (!ride || !files.length) {
      return;
    }
    try {
      const uploaded: RideAlbumPhoto[] = [];
      for (const file of files) {
        const payload = await this.filePayload(file, this.clientPhotoId());
        const response = await this.uploadPhotoPayload(ride.id, payload);
        uploaded.push(response.photo);
      }
      this.photos.set([...uploaded, ...this.photos()]);
      this.message.set(`${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} synced.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to upload ride photos.');
    }
  }

  async deletePhoto(photo: RideAlbumPhoto) {
    const ride = this.ride();
    if (
      !ride ||
      !window.confirm(
        'Remove this synced album photo? Your original gallery photo is not affected.',
      )
    ) {
      return;
    }
    try {
      await this.api.request(
        `/rides/${encodeURIComponent(ride.id)}/photos/${encodeURIComponent(photo.id)}`,
        { method: 'DELETE' },
      );
      this.photos.set(this.photos().filter((item) => item.id !== photo.id));
      const objectUrl = this.photoObjectUrls.get(photo.id);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      this.photoObjectUrls.delete(photo.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to remove photo.');
    }
  }

  async copyStoryPrompt() {
    try {
      await navigator.clipboard.writeText(this.storyPrompt());
      this.message.set('Story prompt copied.');
    } catch {
      this.error.set('Unable to copy prompt.');
    }
  }

  downloadStoryCard() {
    const ride = this.ride();
    if (!ride) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#080A0C"/><text x="80" y="180" fill="#C8FF5A" font-family="Manrope,Arial" font-size="38" font-weight="800">RIDEPULSE</text><text x="80" y="350" fill="#F5F2EA" font-family="Manrope,Arial" font-size="86" font-weight="900">${escapeXml(this.displayTitle())}</text><text x="80" y="500" fill="#DAD8D1" font-family="Manrope,Arial" font-size="42">${escapeXml(km(ride.distanceM))} / ${escapeXml(duration(ride.durationS))} / top ${escapeXml(kmh(ride.topSpeedKmh))}</text><path d="M120 1280 C260 1010 420 1380 570 1120 S820 880 960 1040" fill="none" stroke="#2F3744" stroke-width="34" stroke-linecap="round"/><path d="M120 1280 C260 1010 420 1380 570 1120 S820 880 960 1040" fill="none" stroke="#C8FF5A" stroke-width="14" stroke-linecap="round"/></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ridepulse-${ride.id.slice(0, 8)}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  photoUrl(photo: RideAlbumPhoto) {
    if (photo.imageBase64) return `data:${photo.mimeType};base64,${photo.imageBase64}`;
    return this.photoObjectUrls.get(photo.id) || '';
  }

  timeLabel(value?: string) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime())
      ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : '--';
  }

  scrollToReview() {
    document.querySelector('.review-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async openTripPicker() {
    this.tripPickerOpen.set(true);
    this.tripPickerError.set('');
    const memberships = new Set(this.rideTrips().map((trip) => trip.id));
    this.selectedTripIds.set(memberships);
    await this.loadTripsForPicker();
  }

  closeTripPicker = () => {
    this.tripPickerOpen.set(false);
    this.tripPickerError.set('');
  };

  async loadTripsForPicker() {
    this.tripsLoading.set(true);
    this.tripPickerError.set('');
    try {
      const [trips, memberships] = await Promise.all([
        this.api.request<{ trips?: Trip[] }>('/trips'),
        this.api.optional<{ trips?: Trip[] }>(`/rides/${encodeURIComponent(this.rideId())}/trips`),
      ]);
      this.allTrips.set(Array.isArray(trips.trips) ? trips.trips : []);
      if (memberships) {
        const nextMemberships = Array.isArray(memberships.trips) ? memberships.trips : [];
        this.rideTrips.set(nextMemberships);
        this.selectedTripIds.set(new Set(nextMemberships.map((trip) => trip.id)));
      }
    } catch (error) {
      this.tripPickerError.set(error instanceof Error ? error.message : 'Unable to load trip albums.');
    } finally { this.tripsLoading.set(false); }
  }

  isTripSelected(id: string) { return this.selectedTripIds().has(id); }
  isExistingMembership(id: string) { return this.rideTrips().some((trip) => trip.id === id); }

  toggleTrip(id: string, selected: boolean) {
    const next = new Set(this.selectedTripIds());
    if (selected) next.add(id); else next.delete(id);
    this.selectedTripIds.set(next);
  }

  async saveTripMemberships() {
    const ride = this.ride();
    if (!ride || this.tripSaving()) return;
    const existing = new Set(this.rideTrips().map((trip) => trip.id));
    const additions = [...this.selectedTripIds()].filter((id) => !existing.has(id));
    if (!additions.length) { this.closeTripPicker(); return; }
    this.tripSaving.set(true); this.tripPickerError.set('');
    try {
      await Promise.all(additions.map((tripId) => this.addRideToTrip(tripId, ride.id)));
      const memberships = await this.api.optional<{ trips?: Trip[] }>(`/rides/${encodeURIComponent(ride.id)}/trips`);
      const fallbackTrips = this.allTrips().filter((trip) => this.selectedTripIds().has(trip.id));
      this.rideTrips.set(Array.isArray(memberships?.trips) ? memberships.trips : fallbackTrips);
      this.message.set(`Ride added to ${additions.length} trip${additions.length === 1 ? '' : 's'}.`);
      this.closeTripPicker();
    } catch (error) {
      this.tripPickerError.set(error instanceof Error ? error.message : 'Unable to add this ride to the selected trips.');
    } finally { this.tripSaving.set(false); }
  }

  async createTrip(event: Event) {
    event.preventDefault();
    const title = this.newTripTitle.trim();
    const ride = this.ride();
    if (!title || !ride || this.creatingTrip()) return;
    this.creatingTrip.set(true); this.tripPickerError.set('');
    try {
      const response = await this.api.request<{ trip?: Trip }>('/trips', { method: 'POST', body: JSON.stringify({ title, description: null }) });
      const trip = response.trip;
      if (!trip?.id) throw new Error('Trip was created but could not be opened.');
      this.allTrips.set([trip, ...this.allTrips().filter((item) => item.id !== trip.id)]);
      await this.addRideToTrip(trip.id, ride.id);
      this.rideTrips.set([trip, ...this.rideTrips().filter((item) => item.id !== trip.id)]);
      this.selectedTripIds.set(new Set([...this.selectedTripIds(), trip.id]));
      this.newTripTitle = '';
      this.message.set(`${trip.title} created and this ride was added.`);
    } catch (error) {
      this.tripPickerError.set(error instanceof Error ? error.message : 'Unable to create a trip album.');
    } finally { this.creatingTrip.set(false); }
  }

  private async addRideToTrip(tripId: string, rideId: string) {
    try {
      await this.api.request(`/trips/${encodeURIComponent(tripId)}/rides`, { method: 'PUT', body: JSON.stringify({ rideIds: [rideId] }) });
    } catch (error) {
      if (!(error instanceof HttpRequestError) || ![404, 405].includes(error.status)) throw error;
      await this.api.request(`/trips/${encodeURIComponent(tripId)}/rides`, { method: 'POST', body: JSON.stringify({ rideId }) });
    }
  }

  private scheduleAiRefresh() {
    if (this.aiRefreshTimer) {
      clearTimeout(this.aiRefreshTimer);
      this.aiRefreshTimer = null;
    }
    if (!this.aiThinking() || this.aiRefreshAttempts >= 4) {
      return;
    }
    this.aiRefreshTimer = setTimeout(() => {
      this.aiRefreshAttempts += 1;
      void this.refreshAiOnly();
    }, 4500);
  }

  private async refreshAiOnly() {
    const ride = this.ride();
    if (!ride) return;
    try {
      const [rideResponse, intel] = await Promise.all([
        this.api.request<{ ride: Ride }>(`/rides/${encodeURIComponent(ride.id)}`),
        this.api.optional<{ intelligence: RideIntelligence }>(
          `/rides/${encodeURIComponent(ride.id)}/intelligence`,
        ),
      ]);
      this.ride.set(rideResponse.ride || ride);
      this.intelligence.set(intel?.intelligence || this.intelligence());
    } finally {
      this.scheduleAiRefresh();
    }
  }

  private routePromptLine(ride: Ride) {
    const start = this.cleanRouteLabel(ride.startLabel);
    const end = this.cleanRouteLabel(ride.endLabel);
    if (start && end) return `${start} to ${end}`;
    return start || end || 'Saved RidePulse route, exact GPS trace kept private';
  }

  destinationDetail(ride: Ride) {
    const category = String(ride.destinationCategory || '').replace(/_/g, ' ');
    return [ride.destinationName, category, ride.destinationAddress]
      .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
      .join(' · ');
  }

  private cleanRouteLabel(value?: string | null) {
    const label = String(value || '')
      .replace(/\([^)]*\)/g, '')
      .trim();
    const lower = label.toLowerCase();
    if (
      !label ||
      lower.startsWith('auto start') ||
      lower.startsWith('auto end') ||
      /-?\d+\.\d{3,}/.test(label)
    ) {
      return '';
    }
    return label.length > 72 ? label.slice(0, 72) : label;
  }

  private rideId() {
    return this.route.snapshot.paramMap.get('id') || '';
  }

  private async filePayload(file: File, clientPhotoId: string) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Ride photo must be a JPEG, PNG, or WEBP image.');
    }
    const prepared = await this.prepareRidePhoto(file);
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Unable to read photo.'));
      reader.readAsDataURL(prepared.blob);
    });
    return {
      imageBase64,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      createdAt: new Date(file.lastModified || Date.now()).toISOString(),
      clientPhotoId,
    };
  }

  private async uploadPhotoPayload(rideId: string, payload: Awaited<ReturnType<RideDetailPageComponent['filePayload']>>) {
    const request = () => this.api.request<{ photo: RideAlbumPhoto }>(
      `/rides/${encodeURIComponent(rideId)}/photos`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    try {
      return await request();
    } catch (error) {
      if (!isTransientUploadError(error)) throw error;
      return request();
    }
  }

  private async prepareRidePhoto(file: File): Promise<{ blob: Blob; mimeType: string; fileName: string }> {
    const maxBytes = 4 * 1024 * 1024;
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      if (file.size <= maxBytes) return { blob: file, mimeType: file.type, fileName: file.name };
      throw new Error('This browser cannot prepare a large camera photo. Choose a smaller image or update your browser.');
    }
    try {
      const decoded = await this.decodeImage(file);
      try {
        let width = decoded.width;
        let height = decoded.height;
        const scaleToMax = Math.min(1, 2048 / Math.max(width, height));
        width = Math.max(1, Math.round(width * scaleToMax));
        height = Math.max(1, Math.round(height * scaleToMax));
        for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Photo preparation is not available in this browser.');
          context.fillStyle = '#080A0C';
          context.fillRect(0, 0, width, height);
          context.drawImage(decoded.source, 0, 0, width, height);
          for (const quality of [0.92, 0.84, 0.76, 0.68, 0.6]) {
            const blob = await this.canvasJpeg(canvas, quality);
            if (blob.size <= maxBytes) {
              return { blob, mimeType: 'image/jpeg', fileName: jpegFileName(file.name) };
            }
          }
          width = Math.max(1, Math.round(width * 0.8));
          height = Math.max(1, Math.round(height * 0.8));
        }
        throw new Error('Ride photo could not be prepared under 4 MB.');
      } finally {
        decoded.release();
      }
    } catch (error) {
      if (file.size <= maxBytes) return { blob: file, mimeType: file.type, fileName: file.name };
      throw error instanceof Error ? error : new Error('Unable to prepare this camera photo.');
    }
  }

  private async decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to read this image.'));
        image.src = objectUrl;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(objectUrl) };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  private canvasJpeg(canvas: HTMLCanvasElement, quality: number) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Unable to prepare this image.')),
      'image/jpeg', quality,
    ));
  }

  private async hydratePhoto(photo: RideAlbumPhoto, rideId: string) {
    if (photo.imageBase64 || this.photoObjectUrls.has(photo.id)) return;
    try {
      const response = await fetch(`${environment.apiBaseUrl}/rides/${encodeURIComponent(rideId)}/photos/${encodeURIComponent(photo.id)}`, {
        headers: this.auth.token() ? { Authorization: `Bearer ${this.auth.token()}` } : {},
      });
      if (!response.ok) return;
      this.photoObjectUrls.set(photo.id, URL.createObjectURL(await response.blob()));
      this.photos.set([...this.photos()]);
    } catch { /* The legacy endpoint can still return embedded photo data. */ }
  }

  private clientPhotoId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jpegFileName(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, '').trim() || 'ride-photo';
  return `${stem}.jpg`;
}

function isTransientUploadError(error: unknown) {
  return error instanceof Error && /Network request failed|Request timed out/i.test(error.message);
}
