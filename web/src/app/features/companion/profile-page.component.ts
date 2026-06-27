import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { ProfilePhotoService } from '../../core/profile-photo.service';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [LoadingPulseComponent, LucideAngularModule],
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
        <h2>{{ auth.user()?.name || 'Rider' }}</h2>
        <p>{{ auth.user()?.bikeModel || 'Motorcycle' }}</p>
        <span>{{ auth.user()?.email }}</span>
        @if (message()) {
          <button type="button" class="notice" (click)="message.set('')">{{ message() }}</button>
        }
      </article>

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
        <lucide-icon name="shield-check" size="28" />
        <h3>Secure companion</h3>
        <p>Profile and journal data are loaded with the same JWT-backed API used by the mobile app.</p>
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

  ngOnInit() {
    void this.photo.load();
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
