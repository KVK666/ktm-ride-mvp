import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { LoadingPulseComponent } from '../../shared/loading-pulse.component';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [LoadingPulseComponent, LucideAngularModule, ReactiveFormsModule, RouterLink],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.scss'
})
export class AuthPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly passwordResetOpen = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  readonly form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    bikeModel: ['Motorcycle']
  });

  setMode(mode: 'login' | 'register') {
    this.error.set('');
    this.message.set('');
    this.passwordResetOpen.set(false);
    this.mode.set(mode);
    if (mode === 'register') {
      this.form.controls.name.addValidators(Validators.required);
    } else {
      this.form.controls.name.clearValidators();
    }
    this.form.controls.name.updateValueAndValidity();
  }

  showPasswordReset() {
    this.error.set('');
    this.message.set('');
    this.mode.set('login');
    this.passwordResetOpen.set(true);
    this.form.controls.name.clearValidators();
    this.form.controls.name.updateValueAndValidity();
  }

  async sendPasswordReset() {
    this.error.set('');
    this.message.set('');
    this.form.controls.email.markAsTouched();
    if (this.form.controls.email.invalid || this.loading()) {
      this.error.set('Enter the email for your RidePulse account.');
      return;
    }

    this.loading.set(true);
    try {
      const response = await this.auth.requestPasswordReset(this.form.controls.email.getRawValue());
      this.message.set(response.message);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to send reset link.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid || this.loading()) {
      return;
    }

    this.loading.set(true);
    const value = this.form.getRawValue();
    try {
      if (this.mode() === 'register') {
        await this.auth.register(value.name, value.email, value.password, value.bikeModel);
      } else {
        await this.auth.login(value.email, value.password);
      }
      await this.router.navigate(['/app/home']);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Unable to continue.');
    } finally {
      this.loading.set(false);
    }
  }
}
