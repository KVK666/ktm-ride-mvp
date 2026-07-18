import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { HttpRequestError, requestApiJson } from './http-client';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    try {
      return await requestApiJson<T>({
        baseUrl: environment.apiBaseUrl,
        path,
        options,
        token: this.auth.token(),
      });
    } catch (error: unknown) {
      if (error instanceof HttpRequestError && (error.status === 401 || error.status === 403)) {
        this.auth.clearSession();
        void this.router.navigate(['/auth']);
        throw new Error('Your session expired. Please sign in again.');
      }
      throw error;
    }
  }

  async optional<T>(path: string, options: RequestInit = {}): Promise<T | null> {
    try {
      return await this.request<T>(path, options);
    } catch {
      return null;
    }
  }
}
