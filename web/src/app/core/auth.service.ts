import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { requestApiJson } from './http-client';
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
    return requestApiJson<T>({
      baseUrl: environment.apiBaseUrl,
      path,
      options,
      token: this.token(),
      fallbackErrorMessage: 'Authentication failed.',
    });
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
