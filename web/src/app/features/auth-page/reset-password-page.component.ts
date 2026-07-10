import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [LoadingPulseComponent, LucideAngularModule, ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <a class="brand" routerLink="/">
        <img src="/ridepulse-logo.png" alt="" />
        <span>RidePulse</span>
      </a>

      <section class="auth-card">
        <div class="copy">
          <p class="eyebrow">ACCOUNT RECOVERY</p>
          <h1>Choose a new password.</h1>
          <p>Reset links expire after 30 minutes and can be used only once.</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>
            New password
            <input
              formControlName="password"
              type="password"
              autocomplete="new-password"
              placeholder="8+ characters"
              minlength="8"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              formControlName="confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Repeat password"
              required
            />
          </label>

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          @if (message()) {
            <p class="success" role="status">{{ message() }}</p>
          }

          <button class="submit" type="submit" [disabled]="loading() || !!message()">
            @if (loading()) {
              <app-loading-pulse [compact]="true" label="Updating password" />
              Updating password
            } @else {
              <lucide-icon name="key-round" size="18" />
              Update password
            }
          </button>

          <a class="text-action as-link" routerLink="/auth">Back to sign in</a>
        </form>
      </section>
    </main>
  `,
  styleUrl: './auth-page.component.scss',
})
export class ResetPasswordPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly token = this.route.snapshot.queryParamMap.get('token') || '';

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  });

  async submit() {
    this.error.set('');
    this.message.set('');
    this.form.markAllAsTouched();

    if (!this.token) {
      this.error.set('Reset link is invalid or expired.');
      return;
    }
    if (this.form.invalid || this.loading()) {
      this.error.set('Enter a password with at least 8 characters.');
      return;
    }

    const value = this.form.getRawValue();
    if (value.password !== value.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);
    try {
      const response = await this.auth.resetPassword(this.token, value.password);
      this.message.set(response.message);
      this.form.reset();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      this.loading.set(false);
    }
  }
}
