import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { ProfilePhotoService } from '../../core/profile-photo.service';

@Component({
  selector: 'app-companion-shell',
  standalone: true,
  imports: [LucideAngularModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-shell" [class.menu-open]="mobileMenuOpen()">
      <header class="mobile-shell-bar">
        <a class="shell-brand" routerLink="/app/home" (click)="closeMobileMenu()">
          <img src="/ridepulse-logo.png" alt="" />
          <span>RidePulse</span>
        </a>
        <button
          type="button"
          class="mobile-menu-toggle"
          aria-controls="companion-menu"
          [attr.aria-expanded]="mobileMenuOpen()"
          [attr.aria-label]="mobileMenuOpen() ? 'Close companion menu' : 'Open companion menu'"
          (click)="toggleMobileMenu()"
        >
          <lucide-icon [name]="mobileMenuOpen() ? 'x' : 'menu'" size="22" />
        </button>
      </header>

      @if (mobileMenuOpen()) {
        <button type="button" class="menu-backdrop" aria-label="Close companion menu" (click)="closeMobileMenu()"></button>
      }

      <aside class="sidebar" id="companion-menu">
        <a class="shell-brand" routerLink="/app/home" (click)="closeMobileMenu()">
          <img src="/ridepulse-logo.png" alt="" />
          <span>RidePulse</span>
        </a>
        <nav aria-label="Companion">
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" (click)="closeMobileMenu()">
              <lucide-icon [name]="item.icon" size="18" />
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        </nav>
        <a class="sidebar-user" routerLink="/app/profile" (click)="closeMobileMenu()">
          <span class="shell-avatar">
            @if (photo.photoUrl()) {
              <img [src]="photo.photoUrl()" alt="" />
            } @else {
              {{ initials }}
            }
          </span>
          <span>
            <strong>{{ auth.user()?.name || 'Rider' }}</strong>
            <small>{{ auth.user()?.bikeModel || 'Motorcycle' }}</small>
          </span>
        </a>
        <button type="button" class="logout" (click)="logout()">
          <lucide-icon name="log-out" size="18" />
          Logout
        </button>
      </aside>

      <main class="app-main">
        <header class="app-topbar">
          <div>
            <p>{{ greeting }}</p>
            <h1>{{ auth.user()?.name || 'Rider' }}</h1>
          </div>
          <div class="app-actions">
            <a class="download-pill" href="https://github.com/KVK666/ride-pulse/releases/tag/latest" target="_blank" rel="noreferrer">
              <lucide-icon name="download" size="17" />
              Mobile APK
            </a>
            <a class="top-avatar" routerLink="/app/profile" aria-label="Open profile">
              @if (photo.photoUrl()) {
                <img [src]="photo.photoUrl()" alt="" />
              } @else {
                {{ initials }}
              }
            </a>
          </div>
        </header>
        <router-outlet />
      </main>
    </div>
  `
})
export class CompanionShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly photo = inject(ProfilePhotoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly mobileMenuOpen = signal(false);
  readonly greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  readonly nav = [
    { path: '/app/home', label: 'Home', icon: 'house' },
    { path: '/app/journal', label: 'Journal', icon: 'history' },
    { path: '/app/navigate', label: 'Navigate', icon: 'navigation' },
    { path: '/app/analytics', label: 'Analytics', icon: 'chart-column-increasing' },
    { path: '/app/reports', label: 'Reports', icon: 'file-text' },
    { path: '/app/you', label: 'You', icon: 'activity' },
    { path: '/app/profile', label: 'Profile', icon: 'user' }
  ];

  get initials() {
    return (this.auth.user()?.name || 'Rider')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'R';
  }

  ngOnInit() {
    void this.photo.load();
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.closeMobileMenu();
      }
    });
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  async logout() {
    this.closeMobileMenu();
    this.auth.logout();
    this.photo.clear();
    await this.router.navigate(['/']);
  }
}
