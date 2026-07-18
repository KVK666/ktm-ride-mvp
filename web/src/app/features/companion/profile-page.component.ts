import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { ProfilePhotoService } from '../../core/profile-photo.service';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';
import { ApiService } from '../../core/api.service';
import { HttpRequestError } from '../../core/http-client';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [FormsModule, LoadingPulseComponent, LucideAngularModule],
  template: `
    <section class="profile-layout">
      <article class="profile-card">
        <div class="avatar">
          @if (photo.loading()) {
            <app-loading-pulse [compact]="true" label="Loading profile photo" />
          } @else if (photo.photoUrl()) {
            <img [src]="photo.photoUrl()" alt="Profile photo" />
          } @else {
            <lucide-icon name="user" size="46" />
          }
        </div>
        <p class="kicker">RIDER PROFILE</p>
        <h1>{{ auth.user()?.name || 'Rider' }}</h1>
        <p>{{ auth.user()?.bikeModel || 'Motorcycle' }}</p>
        <span>{{ auth.user()?.email }}</span>
        @if (message()) {
          <button type="button" class="notice" (click)="message.set('')">{{ message() }}</button>
        }
      </article>

      <form class="profile-card secondary account-edit-card" (submit)="saveProfile($event)">
        <lucide-icon name="settings" size="28" />
        <p class="kicker">ACCOUNT</p>
        <h3>Rider details</h3>
        <label>Name <input name="name" maxlength="100" [(ngModel)]="nameDraft" /></label>
        <label>Motorcycle <input name="bikeModel" maxlength="120" [(ngModel)]="bikeDraft" placeholder="Your bike" /></label>
        <button class="primary-action" type="submit" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save details' }}</button>
      </form>

      <article class="profile-card secondary">
        <lucide-icon name="camera" size="28" />
        <h3>Display photo</h3>
        <p>Add, change, or remove the backend-synced profile photo shown across web and mobile.</p>
        <div class="button-row">
          <label class="primary-action file-action">
            <lucide-icon name="camera" size="17" /> {{ photo.photoUrl() ? 'Change photo' : 'Add photo' }}
            <input type="file" accept="image/jpeg,image/png,image/webp" (change)="uploadPhoto($event)" />
          </label>
          @if (photo.photoUrl()) {
            <button type="button" class="secondary-action" (click)="removePhoto()">
              <lucide-icon name="trash-2" size="17" /> Remove photo
            </button>
          }
        </div>
      </article>

      <article class="profile-card secondary">
        <lucide-icon name="image" size="28" />
        <h3>Private ride albums</h3>
        <p>Ride photos are private to your RidePulse account and available on web and Android. Removing one deletes the RidePulse copy everywhere, never the original photo in your phone gallery.</p>
      </article>

      <article class="profile-card secondary">
        <lucide-icon name="shield-check" size="28" />
        <h3>Secure companion</h3>
        <p>Profile and journal data are loaded with the same JWT-backed API used by the mobile app.</p>
      </article>

      <article class="profile-card secondary">
        <lucide-icon name="palette" size="28" />
        <h3>Appearance</h3>
        <p>The web companion uses RidePulse graphite and lime for a high-contrast, low-distraction view. Your Android appearance choices remain on your phone.</p>
      </article>

      <article class="profile-card secondary">
        <lucide-icon name="life-buoy" size="28" />
        <h3>Support</h3>
        <p>Need help with syncing, a ride, or the companion? Share the details through the RidePulse issue tracker.</p>
        <a class="text-link" href="https://github.com/KVK666/ride-pulse/issues" target="_blank" rel="noreferrer">Get support</a>
      </article>

      <article class="profile-card secondary">
        <lucide-icon name="radio" size="28" />
        <h3>Mobile remains the recorder</h3>
        <p>Use the Android app for GPS tracking, background location, ride recovery, photo imports, and OTA updates.</p>
        <a class="text-link" [href]="apkUrl" target="_blank" rel="noreferrer">Download latest APK</a>
      </article>
    </section>
  `
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly photo = inject(ProfilePhotoService);
  readonly apkUrl = environment.apkUrl;
  readonly message = signal('');
  private readonly api = inject(ApiService);
  readonly saving = signal(false);
  nameDraft = '';
  bikeDraft = '';

  ngOnInit() {
    void this.photo.load();
    this.nameDraft = this.auth.user()?.name || '';
    this.bikeDraft = this.auth.user()?.bikeModel || '';
  }

  async saveProfile(event: Event) {
    event.preventDefault();
    const name = this.nameDraft.trim();
    const bikeModel = this.bikeDraft.trim();
    if (!name || !bikeModel || this.saving()) {
      this.message.set('Enter both your name and motorcycle.');
      return;
    }
    this.saving.set(true);
    try {
      const response = await this.api.request<{ user?: { name?: string; bikeModel?: string } }>('/profile', {
        method: 'PATCH', body: JSON.stringify({ name, bikeModel }),
      });
      this.auth.updateUser(response.user || { name, bikeModel });
      this.message.set('Rider details saved across RidePulse.');
    } catch (error) {
      if (canUseLocalFallback(error)) {
        this.auth.updateUser({ name, bikeModel });
        this.message.set(error instanceof HttpRequestError ? 'Saved in this browser until the server upgrade is available.' : 'Saved in this browser while you are offline. Sync again when connected.');
      } else {
        this.message.set(`Rider details were not saved. ${errorMessage(error)} Try again.`);
      }
    } finally { this.saving.set(false); }
  }

  async uploadPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      await this.photo.upload(file);
      this.message.set('Profile photo saved to your account.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to update profile photo.');
    }
  }

  async removePhoto() {
    if (!window.confirm('Remove your synced profile photo?')) {
      return;
    }
    try {
      await this.photo.remove();
      this.message.set('Profile photo removed from your account.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to remove profile photo.');
    }
  }
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
