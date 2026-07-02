import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import {
  Activity,
  ArrowRight,
  Bike,
  Camera,
  ChartColumnIncreasing,
  CheckCircle,
  CircleGauge,
  Copy,
  Download,
  Expand,
  FileText,
  History,
  House,
  Image,
  ImagePlus,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Map,
  Menu,
  Navigation,
  PlayCircle,
  Radio,
  Route,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  X,
  LucideAngularModule
} from 'lucide-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withHashLocation(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      withViewTransitions()
    ),
    importProvidersFrom(
      LucideAngularModule.pick({
        Activity,
        ArrowRight,
        Bike,
        Camera,
        ChartColumnIncreasing,
        CheckCircle,
        CircleGauge,
        Copy,
        Download,
        Expand,
        FileText,
        History,
        House,
        Image,
        ImagePlus,
        KeyRound,
        LogIn,
        LogOut,
        Mail,
        Map,
        Menu,
        Navigation,
        PlayCircle,
        Radio,
        Route,
        Save,
        Settings,
        ShieldCheck,
        Sparkles,
        Trash2,
        User,
        X
      })
    )
  ]
};
