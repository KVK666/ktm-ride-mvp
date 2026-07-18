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
      <a class="skip-link" href="#companion-content">Skip to page content</a>
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
          @for (group of nav; track group.label) {
            <section class="nav-group">
              <p>{{ group.label }}</p>
              @for (item of group.items; track item.path) {
                <a [routerLink]="item.path" routerLinkActive="active" (click)="closeMobileMenu()">
                  <lucide-icon [name]="item.icon" size="18" />
                  <span class="nav-label">{{ item.label }}</span>
                </a>
              }
            </section>
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

      <main class="app-main" id="companion-content" tabindex="-1">
        <header class="app-topbar">
          <div>
            <p>{{ pageEyebrow() }}</p>
          </div>
          <div class="app-actions">
            <a class="download-pill" href="https://github.com/KVK666/ride-pulse/releases/tag/latest" target="_blank" rel="noreferrer">
              <lucide-icon name="download" size="17" />
              Record in Android
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
  readonly pageEyebrow = signal('YOUR RIDEPULSE');
  readonly nav = [
    { label: 'RIDE', items: [
      { path: '/app/home', label: 'Home', icon: 'house' },
      { path: '/app/plan', label: 'Plan', icon: 'navigation' },
      { path: '/app/journal', label: 'Journal', icon: 'history' },
    ] },
    { label: 'REFLECT', items: [
      { path: '/app/analytics', label: 'Insights', icon: 'chart-column-increasing' },
      { path: '/app/profile', label: 'Account', icon: 'user' },
    ] }
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
        this.updatePageHeader(event.urlAfterRedirects);
      }
    });
    this.updatePageHeader(this.router.url);
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  private updatePageHeader(url: string) {
    const [path] = url.split('?');
    const match = [
      ['/app/plan', 'PLAN YOUR RIDE', 'Plan'],
      ['/app/navigate', 'PLAN YOUR RIDE', 'Plan'],
      ['/app/places', 'PLAN YOUR RIDE', 'Plan'],
      ['/app/journal', 'YOUR RIDE LIBRARY', 'Journal'],
      ['/app/trips', 'YOUR RIDE LIBRARY', 'Journal'],
      ['/app/analytics', 'RIDER PULSE', 'Insights'],
      ['/app/reports', 'RIDER PULSE', 'Insights'],
      ['/app/profile', 'YOUR RIDEPULSE', 'Account'],
      ['/app/you', 'YOUR RIDEPULSE', 'Account'],
    ].find(([prefix]) => path.startsWith(prefix));
    this.pageEyebrow.set(match?.[1] || 'YOUR RIDEPULSE');
  }

  async logout() {
    this.closeMobileMenu();
    this.auth.logout();
    this.photo.clear();
    await this.router.navigate(['/']);
  }
}
