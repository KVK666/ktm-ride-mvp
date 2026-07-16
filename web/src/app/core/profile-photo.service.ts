import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

type ProfilePhotoJson = {
  imageBase64?: string;
  mimeType?: string;
  updatedAt?: string | null;
  hasProfilePhoto?: boolean;
  profilePhotoUpdatedAt?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ProfilePhotoService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private loadedForUserId = '';

  readonly photoUrl = signal('');
  readonly loading = signal(false);

  async load(force = false) {
    const user = this.auth.user();
    if (!this.auth.token() || !user?.id) {
      this.clear();
      return;
    }

    if (!force && this.loadedForUserId === user.id) {
      return;
    }

    this.loading.set(true);
    try {
      const response = await this.api.optional<ProfilePhotoJson>('/profile/photo', {
        headers: { Accept: 'application/json' }
      });
      this.loadedForUserId = user.id;
      this.photoUrl.set(this.toDataUrl(response));
    } finally {
      this.loading.set(false);
    }
  }

  clear() {
    this.loadedForUserId = '';
    this.photoUrl.set('');
    this.loading.set(false);
  }

  async upload(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Profile photo must be a JPEG, PNG, or WEBP image.');
    }
    if (file.size > 4 * 1024 * 1024) {
      throw new Error('Profile photo is too large. Choose an image under 4 MB.');
    }
    const imageBase64 = await this.fileBase64(file);
    const metadata = await this.api.request<ProfilePhotoJson>('/profile/photo', {
      method: 'PUT',
      body: JSON.stringify({ imageBase64, mimeType: file.type })
    });
    this.auth.updateUser(metadata);
    this.loadedForUserId = '';
    await this.load(true);
  }

  async remove() {
    const metadata = await this.api.request<ProfilePhotoJson>('/profile/photo', { method: 'DELETE' });
    this.auth.updateUser(metadata);
    this.clear();
  }

  private toDataUrl(response: ProfilePhotoJson | null) {
    const mimeType = String(response?.mimeType || '').toLowerCase();
    const imageBase64 = String(response?.imageBase64 || '');
    if (!mimeType.startsWith('image/') || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
      return '';
    }
    return `data:${mimeType};base64,${imageBase64}`;
  }

  private fileBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Unable to read profile photo.'));
      reader.readAsDataURL(file);
    });
  }
}
