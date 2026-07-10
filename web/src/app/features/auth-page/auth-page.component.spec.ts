import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LogIn, LucideAngularModule, Sparkles } from 'lucide-angular';
import { AuthPageComponent } from './auth-page.component';

describe('AuthPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthPageComponent],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick({ LogIn, Sparkles })),
      ],
    }).compileComponents();
  });

  it('exposes required login fields and password-manager metadata', () => {
    const fixture = TestBed.createComponent(AuthPageComponent);
    fixture.detectChanges();

    const email = fixture.nativeElement.querySelector('input[type="email"]') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;

    expect(email.required).toBe(true);
    expect(email.autocomplete).toBe('email');
    expect(password.required).toBe(true);
    expect(password.minLength).toBe(8);
    expect(password.autocomplete).toBe('current-password');
  });

  it('uses new-password metadata when registering', () => {
    const fixture = TestBed.createComponent(AuthPageComponent);
    fixture.componentInstance.setMode('register');
    fixture.detectChanges();

    const password = fixture.nativeElement.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    expect(password.autocomplete).toBe('new-password');
  });
});
