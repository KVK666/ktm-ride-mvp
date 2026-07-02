import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

type ParsedJson = { valid: true; value: unknown } | { valid: false; error: string };

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    try {
      return await this.requestFrom<T>(environment.apiBaseUrl, path, options);
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === 'AbortError') {
        throw new Error('Request timed out. Check the backend connection.');
      }
      if (error instanceof TypeError) {
        throw new Error('Network request failed. Check your internet connection.');
      }
      throw error;
    }
  }

  private async requestFrom<T>(baseUrl: string, path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.auth.token() ? { Authorization: `Bearer ${this.auth.token()}` } : {}),
          ...(options.headers || {})
        }
      });
    } finally {
      window.clearTimeout(timeout);
    }

    const text = await this.safeText(response);
    const parsed = this.parseJson(text);

    if (response.status === 401) {
      this.auth.clearSession();
      void this.router.navigate(['/auth']);
      throw new Error('Your session expired. Please sign in again.');
    }

    if (!response.ok) {
      if (parsed.valid) {
        throw new Error(this.errorMessage(parsed.value));
      }
      throw new Error((parsed as { valid: false; error: string }).error);
    }

    if (!parsed.valid) {
      throw new Error('Unexpected response from the server.');
    }

    return this.unwrapResponse(parsed.value) as T;
  }

  async optional<T>(path: string, options: RequestInit = {}): Promise<T | null> {
    try {
      return await this.request<T>(path, options);
    } catch {
      return null;
    }
  }

  private async safeText(response: Response) {
    try {
      return await response.text();
    } catch {
      throw new Error('Unable to read server response.');
    }
  }

  private parseJson(text: string): ParsedJson {
    if (!text) {
      return { valid: true, value: {} };
    }
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object'
        ? { valid: true, value }
        : { valid: false, error: 'Unexpected response from the server.' };
    } catch {
      return { valid: false, error: text.slice(0, 180) || 'Unexpected response from the server.' };
    }
  }

  private errorMessage(value: unknown) {
    if (this.isStandardApiResponse(value)) {
      return String((value as { message?: unknown; error?: unknown }).message || (value as { error?: unknown }).error || 'Request failed.');
    }
    if (value && typeof value === 'object' && 'error' in value) {
      return String((value as { error?: unknown }).error || 'Request failed.');
    }
    return 'Request failed.';
  }

  private unwrapResponse(value: unknown) {
    if (this.isStandardApiResponse(value)) {
      return (value as { data?: unknown }).data ?? {};
    }
    return value;
  }

  private isStandardApiResponse(value: unknown) {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'status' in value &&
      'programCode' in value &&
      'message' in value &&
      'data' in value
    );
  }
}
