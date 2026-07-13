import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { AuthPageComponent } from './features/auth-page/auth-page.component';
import { ResetPasswordPageComponent } from './features/auth-page/reset-password-page.component';
import { AnalyticsPageComponent } from './features/companion/analytics-page.component';
import { CompanionShellComponent } from './features/companion/companion-shell.component';
import { HomePageComponent } from './features/companion/home-page.component';
import { JournalPageComponent } from './features/companion/journal-page.component';
import { NavigatePageComponent } from './features/companion/navigate-page.component';
import { ProfilePageComponent } from './features/companion/profile-page.component';
import { ReportsPageComponent } from './features/companion/reports-page.component';
import { SavedPlacesPageComponent } from './features/companion/saved-places-page.component';
import { RideDetailPageComponent } from './features/companion/ride-detail-page.component';
import { TripDetailPageComponent } from './features/companion/trip-detail-page.component';
import { TripsPageComponent } from './features/companion/trips-page.component';
import { YouPageComponent } from './features/companion/you-page.component';
import { LandingPageComponent } from './features/landing/landing-page.component';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, title: 'RidePulse | Smart ride journal' },
  { path: 'auth', component: AuthPageComponent, title: 'RidePulse sign in' },
  { path: 'reset-password', component: ResetPasswordPageComponent, title: 'Reset RidePulse password' },
  {
    path: 'app',
    component: CompanionShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', component: HomePageComponent, title: 'RidePulse home' },
      { path: 'journal', component: JournalPageComponent, title: 'RidePulse journal' },
      { path: 'journal/:id', component: RideDetailPageComponent, title: 'Ride details' },
      { path: 'trips', component: TripsPageComponent, title: 'RidePulse trip albums' },
      { path: 'trips/:id', component: TripDetailPageComponent, title: 'Trip album' },
      { path: 'navigate', component: NavigatePageComponent, title: 'RidePulse navigate' },
      { path: 'analytics', component: AnalyticsPageComponent, title: 'Ride analytics' },
      { path: 'reports', component: ReportsPageComponent, title: 'Ride reports' },
      { path: 'places', component: SavedPlacesPageComponent, title: 'RidePulse saved places' },
      { path: 'you', component: YouPageComponent, title: 'RidePulse you' },
      { path: 'profile', component: ProfilePageComponent, title: 'RidePulse profile' }
    ]
  },
  { path: '**', redirectTo: '' }
];
