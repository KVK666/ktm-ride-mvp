import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { User } from './models';

type AuthResponse = {
  token: string;
  user: User;
};

const TOKEN_KEY = 'ridepulse_web_token';
const USER_KEY = 'ridepulse_web_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly token = signal<string | null>(this.readStorage(TOKEN_KEY));
  readonly user = signal<User | null>(this.readUser());
  readonly bootstrapped = signal(false);

  get signedIn() {
    return Boolean(this.token());
  }

  async bootstrap() {
    if (!this.token()) {
      this.bootstrapped.set(true);
      return;
    }
    try {
      const response = await this.rawRequest<{ user: User }>('/auth/me');
      this.user.set(response.user);
      this.writeStorage(USER_KEY, JSON.stringify(response.user));
    } catch {
      this.clearSession();
    } finally {
      this.bootstrapped.set(true);
    }
  }

  async login(email: string, password: string) {
    const response = await this.rawRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.saveSession(response);
  }

  async register(name: string, email: string, password: string, bikeModel: string) {
    const response = await this.rawRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, bikeModel })
    });
    this.saveSession(response);
  }

  async requestPasswordReset(email: string) {
    return this.rawRequest<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async resetPassword(token: string, password: string) {
    return this.rawRequest<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    });
  }

  logout() {
    this.clearSession();
  }

  updateUser(partial: Partial<User>) {
    const current = this.user();
    if (!current) {
      return;
    }
    const next = { ...current, ...partial };
    this.user.set(next);
    this.writeStorage(USER_KEY, JSON.stringify(next));
  }

  clearSession() {
    this.token.set(null);
    this.user.set(null);
    this.removeStorage(TOKEN_KEY);
    this.removeStorage(USER_KEY);
  }

  private saveSession(response: AuthResponse) {
    this.token.set(response.token);
    this.user.set(response.user);
    this.writeStorage(TOKEN_KEY, response.token);
    this.writeStorage(USER_KEY, JSON.stringify(response.user));
  }

  private async rawRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    try {
      return await this.rawRequestFrom<T>(environment.apiBaseUrl, path, options);
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

  private async rawRequestFrom<T>(baseUrl: string, path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token() ? { Authorization: `Bearer ${this.token()}` } : {}),
          ...(options.headers || {})
        }
      });
    } finally {
      window.clearTimeout(timeout);
    }

    const text = await response.text();
    const parsed = this.parseJson(text);
    if (!response.ok) {
      throw new Error(this.errorMessage(parsed));
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Unexpected response from the server.');
    }
    return this.unwrapResponse(parsed) as T;
  }

  private parseJson(text: string) {
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 180) || 'Unexpected response from the server.' };
    }
  }

  private errorMessage(parsed: unknown) {
    if (this.isStandardApiResponse(parsed)) {
      return String((parsed as { message?: unknown; error?: unknown }).message || (parsed as { error?: unknown }).error || 'Authentication failed.');
    }
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return String((parsed as { error?: unknown }).error || 'Authentication failed.');
    }
    return 'Authentication failed.';
  }

  private unwrapResponse(parsed: unknown) {
    if (this.isStandardApiResponse(parsed)) {
      return (parsed as { data?: unknown }).data ?? {};
    }
    return parsed;
  }

  private isStandardApiResponse(parsed: unknown) {
    return Boolean(
      parsed &&
      typeof parsed === 'object' &&
      'status' in parsed &&
      'programCode' in parsed &&
      'message' in parsed &&
      'data' in parsed
    );
  }

  private readUser(): User | null {
    const value = this.readStorage(USER_KEY);
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value) as User;
    } catch {
      return null;
    }
  }

  private readStorage(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Browser storage can be disabled; keep the in-memory session.
    }
  }

  private removeStorage(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing else to clean up.
    }
  }
}
