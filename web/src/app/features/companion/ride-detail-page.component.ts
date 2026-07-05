import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { dateLabel, duration, km, kmh, numberValue } from '../../core/format';
import { Ride, RideAlbumPhoto, RideIntelligence, RidePoint, TripSuggestion } from '../../core/models';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { GoogleRouteMapComponent } from '../../shared/google-route-map.component';
import { RouteArtComponent } from '../../shared/route-art.component';

@Component({
  selector: 'app-ride-detail-page',
  standalone: true,
  imports: [FormsModule, GoogleRouteMapComponent, LoadingPulseComponent, LucideAngularModule, RouterLink, RouteArtComponent],
  template: `
    <a class="back-link" routerLink="/app/journal">Back to journal</a>
    @if (loading()) {
      <app-loading-pulse label="Loading ride details" />
    } @else if (ride(); as current) {
      <section class="ai-insight-hero">
        <div class="ai-insight-head">
          <div class="ai-icon"><lucide-icon [name]="aiThinking() ? 'sparkles' : 'activity'" size="24" /></div>
          <div>
            <p class="kicker">{{ aiThinking() ? 'AI THINKING' : 'AI RIDE INTELLIGENCE' }}</p>
            <h2>{{ displayTitle() }}</h2>
          </div>
        </div>
        <div class="badge-row">
          <span>{{ rideKindLabel() }}</span>
          <span>{{ confidenceLabel() }}</span>
          @if (current.aiGeneratedAt) {
            <span>{{ dateLabel(current.aiGeneratedAt) }}</span>
          }
        </div>
        <p>{{ aiInsight() }}</p>
        <div class="ai-fact-grid">
          <article><span>Best signal</span><strong>{{ bestMoment() }}</strong></article>
          <article><span>Trip assist</span><strong>{{ tripAssistLabel() }}</strong></article>
        </div>
      </section>

      @if (message()) {
        <button class="notice" type="button" (click)="message.set('')">{{ message() }}</button>
      }
      @if (error()) {
        <button class="notice danger" type="button" (click)="load()">{{ error() }} Tap to retry.</button>
      }

      <div class="metric-grid">
        <article class="metric-card accent"><span>Distance</span><strong>{{ km(current.distanceM) }}</strong></article>
        <article class="metric-card"><span>Duration</span><strong>{{ duration(current.durationS) }}</strong></article>
        <article class="metric-card"><span>Top speed</span><strong>{{ kmh(current.topSpeedKmh) }}</strong></article>
        <article class="metric-card"><span>Average</span><strong>{{ kmh(current.avgSpeedKmh) }}</strong></article>
      </div>

      <section class="content-section map-section">
        <div class="section-head">
          <h2>Google route map</h2>
          <span>{{ routePoints().length }} GPS points</span>
        </div>
        <app-google-route-map [points]="routePoints()" [photos]="photos()" [title]="displayTitle()" />
      </section>

      <section class="content-section split-section">
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
            <textarea maxlength="2000" [(ngModel)]="notesDraft" placeholder="Road condition, stops, fuel, anything worth remembering"></textarea>
          </label>
          <div class="button-row">
            <button type="button" class="primary-action" [disabled]="savingReview()" (click)="saveReview(false)">
              <lucide-icon name="save" size="17" /> Save
            </button>
            <button type="button" class="secondary-action" [disabled]="savingReview() || !!current.reviewedAt" (click)="saveReview(true)">
              <lucide-icon name="check-circle" size="17" /> Reviewed
            </button>
          </div>
        </article>

        <article class="review-panel">
          <div class="section-head">
            <h2>Suspected duplicates</h2>
            <span>{{ duplicates().length }}</span>
          </div>
          <div class="ride-list compact">
            @for (duplicate of duplicates(); track duplicate.id) {
              <article class="ride-row">
                <div>
                  <strong>{{ duplicate.title || duplicate.smartTitle || dateLabel(duplicate.startedAt) + ' ride' }}</strong>
                  <span>{{ km(duplicate.distanceM) }} / {{ duration(duplicate.durationS) }}</span>
                </div>
                <button type="button" class="icon-danger" (click)="deleteDuplicate(duplicate)">
                  <lucide-icon name="trash-2" size="17" />
                </button>
              </article>
            } @empty {
              <article class="empty-card">No exact duplicate rides found for this route.</article>
            }
          </div>
        </article>
      </section>

      <section class="content-section split-section">
        <article class="route-replay">
          <div class="section-head"><h2>Route pulse</h2><span>Replay</span></div>
          <app-route-art [points]="routePoints()" />
          <p>A compact visual playback of the GPS trace. Exact turn guidance is not inferred.</p>
        </article>
        <article class="review-panel">
          <div class="section-head"><h2>Route summary</h2><span>{{ dateLabel(current.startedAt) }}</span></div>
          <div class="route-facts">
            <div><span>From</span><strong>{{ current.startLabel }}</strong></div>
            <div><span>To</span><strong>{{ current.endLabel }}</strong></div>
            <div><span>Started</span><strong>{{ timeLabel(current.startedAt) }}</strong></div>
            <div><span>Ended</span><strong>{{ timeLabel(current.endedAt) }}</strong></div>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div class="section-head"><h2>Speed over time</h2><span>{{ speedPoints().length }} samples</span></div>
        <div class="bars speed-bars">
          @for (point of speedPoints(); track point.recordedAt) {
            <div class="bar-wrap" [title]="timeLabel(point.recordedAt) + ' / ' + kmh(point.speedKmh)">
              <span class="bar" [style.height.%]="speedHeight(point.speedKmh)"></span>
            </div>
          } @empty {
            <article class="empty-card">Speed samples unavailable.</article>
          }
        </div>
      </section>

      <section class="content-section">
        <div class="section-head"><h2>Chapters</h2><span>{{ intelligence()?.highlightReason || current.highlightReason || 'Smart journal' }}</span></div>
        <div class="chapter-list">
          @for (chapter of intelligence()?.chapters || []; track chapter.id) {
            <article class="chapter-card">
              <strong>{{ chapter.title }}</strong>
              <p>{{ chapter.body }}</p>
              <span>{{ timeLabel(chapter.timestamp || undefined) }}</span>
            </article>
          } @empty {
            <article class="empty-card">No generated chapters for this ride yet.</article>
          }
        </div>
      </section>

      <section class="content-section album-section">
        <div class="section-head">
          <h2>Ride album</h2>
          <span>{{ photos().length }} synced photos</span>
        </div>
        <div class="button-row">
          <label class="primary-action file-action">
            <lucide-icon name="image-plus" size="17" /> Add photos
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple (change)="uploadPhotos($event)" />
          </label>
          <button type="button" class="secondary-action" [disabled]="!photos().length" (click)="slideshowOpen.set(true)">
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
            <article class="empty-card">No synced ride photos yet. Add web photos here, or update the mobile app to sync imported ride albums.</article>
          }
        </div>
      </section>

      <section class="content-section split-section">
        <article class="review-panel">
          <div class="section-head"><h2>Ride story</h2><span>Share tools</span></div>
          <p>{{ storyPrompt() }}</p>
          <div class="button-row">
            <button type="button" class="primary-action" (click)="copyStoryPrompt()">
              <lucide-icon name="copy" size="17" /> Copy prompt
            </button>
            <button type="button" class="secondary-action" (click)="downloadStoryCard()">
              <lucide-icon name="download" size="17" /> Download card
            </button>
            <a class="secondary-action" href="https://chatgpt.com/" target="_blank" rel="noreferrer">
              <lucide-icon name="sparkles" size="17" /> Open ChatGPT
            </a>
          </div>
        </article>
        <article class="danger-card">
          <div class="section-head"><h2>Ride controls</h2><span>Danger zone</span></div>
          <p>Delete this ride if it was a test, duplicate, or something you do not want in the journal.</p>
          <button type="button" class="delete-ride-button" [disabled]="deletingRide()" (click)="deleteRide()">
            <lucide-icon name="trash-2" size="18" /> {{ deletingRide() ? 'Deleting...' : 'Delete this ride' }}
          </button>
        </article>
      </section>

      @if (viewerPhoto(); as photo) {
        <div class="media-modal" role="dialog" aria-modal="true">
          <button type="button" class="modal-close" (click)="viewerPhoto.set(null)"><lucide-icon name="x" size="22" /></button>
          <img [src]="photoUrl(photo)" alt="Ride photo preview" />
        </div>
      }

      @if (slideshowOpen()) {
        <div class="media-modal slideshow" role="dialog" aria-modal="true">
          <button type="button" class="modal-close" (click)="slideshowOpen.set(false)"><lucide-icon name="x" size="22" /></button>
          @for (photo of photos(); track photo.id) {
            <img [src]="photoUrl(photo)" alt="Ride slideshow photo" />
          }
        </div>
      }
    } @else {
      <article class="empty-card">{{ error() || 'Ride details unavailable.' }}</article>
    }
  `
})
export class RideDetailPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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
  titleDraft = '';
  notesDraft = '';
  readonly km = km;
  readonly kmh = kmh;
  readonly duration = duration;
  readonly dateLabel = dateLabel;

  readonly routePoints = computed(() => this.ride()?.points?.length ? this.ride()?.points || [] : this.ride()?.routePreview || []);
  readonly speedPoints = computed(() => (this.ride()?.points || []).filter((point) => numberValue(point.speedKmh) > 0));
  readonly maxSpeed = computed(() => Math.max(...this.speedPoints().map((point) => numberValue(point.speedKmh)), 1));
  readonly displayTitle = computed(() => {
    const ride = this.ride();
    return this.intelligence()?.suggestedTitle || ride?.title || ride?.aiTitle || ride?.smartTitle || `${dateLabel(ride?.startedAt)} ride`;
  });
  readonly badges = computed(() => this.intelligence()?.badges?.length ? this.intelligence()?.badges || [] : this.ride()?.badges || []);
  readonly aiThinking = computed(() => (this.intelligence()?.classification?.status || this.ride()?.aiStatus) === 'pending');
  readonly rideKindLabel = computed(() => this.intelligence()?.classification?.label || this.kindLabel(this.ride()?.rideKind));
  readonly confidenceLabel = computed(() => {
    const confidence = numberValue(this.intelligence()?.classification?.confidence ?? this.ride()?.rideKindConfidence);
    return confidence > 0 ? `${Math.round(confidence * 100)}% confidence` : 'Learning';
  });
  readonly aiInsight = computed(() => {
    if (this.aiThinking()) {
      return 'RidePulse saved the ride first and is building a smarter name, summary, and trip decision now.';
    }
    return this.intelligence()?.keyInsight
      || this.ride()?.keyInsight
      || this.intelligence()?.classification?.reason
      || this.ride()?.rideKindReason
      || this.intelligence()?.summaryText
      || this.ride()?.aiSummary
      || 'RidePulse built this from distance, speed, and timing signals.';
  });
  readonly bestMoment = computed(() => this.intelligence()?.bestMoment || this.ride()?.bestMoment || `${kmh(this.ride()?.topSpeedKmh)} top speed`);
  readonly tripAssistLabel = computed(() => {
    const suggestion = this.tripSuggestion(this.intelligence()?.tripAutomation || this.ride()?.tripSuggestion);
    if (!suggestion) return 'No trip action yet';
    if (suggestion.action === 'auto_created') return suggestion.title ? `Created ${suggestion.title}` : 'Created a trip';
    if (suggestion.action === 'auto_added') return suggestion.title ? `Added to ${suggestion.title}` : 'Added to a trip';
    if (['suggest', 'auto_add', 'auto_create'].includes(suggestion.action)) return suggestion.title ? `Suggests ${suggestion.title}` : 'Trip suggestion ready';
    return 'No confident trip match';
  });
  readonly storyPrompt = computed(() => {
    const ride = this.ride();
    if (!ride) {
      return '';
    }
    return `Create a cinematic RidePulse story image for "${this.displayTitle()}": ${km(ride.distanceM)}, ${duration(ride.durationS)}, top speed ${kmh(ride.topSpeedKmh)}, from ${ride.startLabel} to ${ride.endLabel}, dark graphite OLED mood with electric-lime route glow.`;
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    const id = this.rideId();
    if (!id) {
      this.error.set('Ride id is missing.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const [rideResponse, intel, duplicates, photos] = await Promise.all([
        this.api.request<{ ride: Ride }>(`/rides/${encodeURIComponent(id)}`),
        this.api.optional<{ intelligence: RideIntelligence }>(`/rides/${encodeURIComponent(id)}/intelligence`),
        this.api.optional<{ duplicates: Ride[] }>(`/rides/${encodeURIComponent(id)}/duplicates`),
        this.api.optional<{ photos: RideAlbumPhoto[] }>(`/rides/${encodeURIComponent(id)}/photos`)
      ]);
      const ride = rideResponse.ride || null;
      this.ride.set(ride);
      this.intelligence.set(intel?.intelligence || null);
      this.duplicates.set(Array.isArray(duplicates?.duplicates) ? duplicates.duplicates : []);
      this.photos.set(Array.isArray(photos?.photos) ? photos.photos : []);
      this.titleDraft = ride?.title || '';
      this.notesDraft = ride?.notes || '';
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
      const response = await this.api.request<{ ride: Partial<Ride> }>(`/rides/${encodeURIComponent(ride.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: this.titleDraft, notes: this.notesDraft, markReviewed })
      });
      this.ride.set({ ...ride, ...response.ride });
      this.message.set(markReviewed ? 'Ride reviewed and saved.' : 'Ride review saved.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save ride review.');
    } finally {
      this.savingReview.set(false);
    }
  }

  async deleteDuplicate(duplicate: Ride) {
    if (!window.confirm(`Delete duplicate ride?\n\n${duplicate.title || duplicate.smartTitle || dateLabel(duplicate.startedAt)}\n${km(duplicate.distanceM)}`)) {
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
    if (!ride || !window.confirm(`Delete this ride?\n\n${this.displayTitle()}\n${km(ride.distanceM)}\n\nThis permanently removes the ride and synced album photos.`)) {
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
        const payload = await this.filePayload(file);
        const response = await this.api.request<{ photo: RideAlbumPhoto }>(`/rides/${encodeURIComponent(ride.id)}/photos`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
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
    if (!ride || !window.confirm('Remove this synced album photo? Your original gallery photo is not affected.')) {
      return;
    }
    try {
      await this.api.request(`/rides/${encodeURIComponent(ride.id)}/photos/${encodeURIComponent(photo.id)}`, { method: 'DELETE' });
      this.photos.set(this.photos().filter((item) => item.id !== photo.id));
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
    return `data:${photo.mimeType};base64,${photo.imageBase64}`;
  }

  speedHeight(value: unknown) {
    return Math.max(6, (numberValue(value) / this.maxSpeed()) * 100);
  }

  timeLabel(value?: string) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '--';
  }

  private kindLabel(kind?: string | null) {
    switch (kind) {
      case 'commute': return 'Commute';
      case 'short_spin': return 'Short spin';
      case 'city_errand': return 'City errand';
      case 'long_trip': return 'Long trip';
      case 'fast_ride': return 'Fast ride';
      case 'night_ride': return 'Night ride';
      default: return 'Scenic ride';
    }
  }

  private tripSuggestion(value: TripSuggestion | string | null | undefined): TripSuggestion | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return this.tripSuggestion(JSON.parse(value));
      } catch {
        return null;
      }
    }
    return value;
  }

  private rideId() {
    return this.route.snapshot.paramMap.get('id') || '';
  }

  private async filePayload(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Ride photo must be a JPEG, PNG, or WEBP image.');
    }
    if (file.size > 3 * 1024 * 1024) {
      throw new Error('Ride photo is too large. Choose an image under 3 MB.');
    }
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Unable to read photo.'));
      reader.readAsDataURL(file);
    });
    return { imageBase64, mimeType: file.type, fileName: file.name, createdAt: new Date(file.lastModified || Date.now()).toISOString() };
  }
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
