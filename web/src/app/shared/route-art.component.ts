import { Component, Input } from '@angular/core';
import { Coordinate } from '../core/models';

@Component({
  selector: 'app-route-art',
  standalone: true,
  template: `
    <svg viewBox="0 0 320 160" role="img" [attr.aria-label]="label" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="routeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#C8FF5A" />
          <stop offset="52%" stop-color="#67A7FF" />
          <stop offset="100%" stop-color="#FFC857" />
        </linearGradient>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d="M18 118 C58 92 76 56 112 70 S182 138 218 94 266 34 302 50" fill="none" stroke="#232830" stroke-width="18" stroke-linecap="round" />
      <polyline [attr.points]="polyline" fill="none" stroke="url(#routeGlow)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" filter="url(#softGlow)" />
      <circle [attr.cx]="start.x" [attr.cy]="start.y" r="7" fill="#080A0C" stroke="#C8FF5A" stroke-width="4" vector-effect="non-scaling-stroke" />
      <circle [attr.cx]="end.x" [attr.cy]="end.y" r="7" fill="#C8FF5A" stroke="#080A0C" stroke-width="4" vector-effect="non-scaling-stroke" />
    </svg>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
      aspect-ratio: 2 / 1;
      overflow: hidden;
    }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
  `]
})
export class RouteArtComponent {
  @Input() label = 'Ride route preview';
  @Input() set points(value: Coordinate[] | null | undefined) {
    this.polyline = this.buildPolyline(value || []);
    const parts = this.polyline.split(' ').map((item) => item.split(',').map(Number));
    this.start = { x: parts[0]?.[0] || 18, y: parts[0]?.[1] || 118 };
    const last = parts[parts.length - 1];
    this.end = { x: last?.[0] || 302, y: last?.[1] || 50 };
  }

  polyline = '18,118 58,92 112,70 182,138 218,94 266,34 302,50';
  start = { x: 18, y: 118 };
  end = { x: 302, y: 50 };

  private buildPolyline(points: Coordinate[]) {
    if (points.length < 2) {
      return this.polyline;
    }
    const lats = points.map((point) => Number(point.latitude)).filter(Number.isFinite);
    const lngs = points.map((point) => Number(point.longitude)).filter(Number.isFinite);
    if (lats.length < 2 || lngs.length < 2) {
      return this.polyline;
    }
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = Math.max(maxLat - minLat, 0.0001);
    const lngRange = Math.max(maxLng - minLng, 0.0001);

    return points
      .slice(0, 64)
      .map((point) => {
        const x = ((Number(point.longitude) - minLng) / lngRange) * 272 + 24;
        const y = 138 - ((Number(point.latitude) - minLat) / latRange) * 116;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
}
