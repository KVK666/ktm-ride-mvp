import { AfterViewInit, Component, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { RouteArtComponent } from '../../shared/route-art.component';
import { HeroCanvasComponent } from './hero-canvas.component';

type FeaturePanel = {
  icon: string;
  kicker: string;
  title: string;
  body: string;
};

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [HeroCanvasComponent, LucideAngularModule, RouterLink, RouteArtComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss'
})
export class LandingPageComponent implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly apkUrl = environment.apkUrl;

  readonly featurePanels: FeaturePanel[] = [
    {
      icon: 'sparkles',
      kicker: 'SMART JOURNAL',
      title: 'Every ride becomes a chapter.',
      body: 'RidePulse turns route traces into cinematic journal cards, highlights, memory prompts, and review cues.'
    },
    {
      icon: 'radio',
      kicker: 'RIDE COCKPIT',
      title: 'Record on mobile. Reflect on web.',
      body: 'The phone handles reliable GPS and background tracking; the website gives you a calmer command center afterward.'
    },
    {
      icon: 'chart-column-increasing',
      kicker: 'ANALYTICS',
      title: 'Distance, speed, time, and trendlines.',
      body: 'Daily, monthly, and yearly views help you understand the shape of your riding without drowning you in charts.'
    },
    {
      icon: 'user',
      kicker: 'PROFILE SYNC',
      title: 'Your rider identity follows you.',
      body: 'Name, motorcycle, synced avatar, and reports stay connected wherever you open RidePulse.'
    }
  ];

  ngAfterViewInit() {
    gsap.registerPlugin(ScrollTrigger);
    const root = this.host.nativeElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      return;
    }

    root.querySelectorAll('.reveal').forEach((element) => {
      gsap.from(element, {
        opacity: 0,
        y: 28,
        duration: 0.72,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 92%'
        }
      });
    });

    gsap.to(root.querySelector('.route-progress'), {
      strokeDashoffset: 0,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: root.querySelector('.story-band'),
        start: 'top 70%'
      }
    });
  }
}
