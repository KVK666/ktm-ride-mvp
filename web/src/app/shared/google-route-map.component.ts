import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Coordinate, RideAlbumPhoto } from '../core/models';
import { GoogleMapsService, googleMapsRouteUrl, validCoordinate } from '../core/google-maps.service';
import { RouteArtComponent } from './route-art.component';

declare const google: any;

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d6d6d6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1f' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#33343a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c4730' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101827' }] }
];

@Component({
  selector: 'app-google-route-map',
  standalone: true,
  imports: [LucideAngularModule, RouteArtComponent],
  template: `
    <div class="map-shell" [class.fullscreen]="fullscreen()">
      @if (maps.configured && !error()) {
        <div #map class="map-canvas"></div>
      } @else {
        <div class="map-fallback">
          <app-route-art [points]="points" />
          <div>
            <strong>{{ error() || 'Google Maps key is not configured' }}</strong>
            <span>Route artwork is shown here until Maps is available.</span>
          </div>
        </div>
      }
      <div class="map-actions">
        <a [href]="mapUrl()" target="_blank" rel="noreferrer" title="Open in Google Maps">
          <lucide-icon name="map" size="18" />
        </a>
        <button type="button" (click)="fullscreen.set(true)" title="Open full screen">
          <lucide-icon name="expand" size="18" />
        </button>
      </div>
    </div>

    @if (fullscreen()) {
      <div class="map-modal" role="dialog" aria-modal="true" [attr.aria-label]="title">
        <div class="map-modal-panel">
          <button type="button" class="modal-close" (click)="fullscreen.set(false)" title="Close map">
            <lucide-icon name="x" size="22" />
          </button>
          <app-google-route-map [points]="points" [photos]="photos" [title]="title" />
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .map-shell {
      position: relative;
      min-height: 360px;
      border: 1px solid rgba(245, 242, 234, 0.1);
      border-radius: 26px;
      overflow: hidden;
      background: var(--surface);
    }
    .map-shell.fullscreen { min-height: 70vh; }
    .map-canvas,
    .map-fallback {
      position: absolute;
      inset: 0;
    }
    .map-fallback {
      display: grid;
      place-items: center;
      gap: 16px;
      padding: 22px;
      text-align: center;
      color: var(--muted);
    }
    .map-fallback app-route-art {
      width: min(520px, 90%);
    }
    .map-fallback strong,
    .map-fallback span {
      display: block;
    }
    .map-fallback strong {
      color: var(--text);
      margin-bottom: 4px;
    }
    .map-actions {
      position: absolute;
      right: 12px;
      bottom: 12px;
      display: inline-flex;
      gap: 8px;
      z-index: 2;
    }
    .map-actions a,
    .map-actions button,
    .modal-close {
      width: 42px;
      height: 42px;
      border: 1px solid rgba(245, 242, 234, 0.12);
      border-radius: 999px;
      display: grid;
      place-items: center;
      color: var(--text);
      background: rgba(8, 10, 12, 0.8);
      cursor: pointer;
      text-decoration: none;
      backdrop-filter: blur(14px);
    }
    .map-modal {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.76);
      padding: 24px;
      display: grid;
      place-items: center;
    }
    .map-modal-panel {
      width: min(1180px, 100%);
      height: min(760px, 92vh);
      position: relative;
    }
    .modal-close {
      position: absolute;
      right: 14px;
      top: 14px;
      z-index: 4;
    }
    .map-modal-panel app-google-route-map {
      height: 100%;
    }
    .map-modal-panel .map-shell {
      height: 100%;
      min-height: 100%;
      border-radius: 30px;
    }
  `]
})
export class GoogleRouteMapComponent implements AfterViewInit, OnChanges {
  readonly maps = inject(GoogleMapsService);
  @ViewChild('map') private readonly mapElement?: ElementRef<HTMLDivElement>;
  @Input() points: Coordinate[] = [];
  @Input() photos: RideAlbumPhoto[] = [];
  @Input() title = 'Ride route';

  readonly error = signal('');
  readonly fullscreen = signal(false);
  private viewReady = false;

  ngAfterViewInit() {
    this.viewReady = true;
    void this.render();
  }

  ngOnChanges() {
    void this.render();
  }

  mapUrl() {
    return googleMapsRouteUrl(this.points);
  }

  private async render() {
    if (!this.viewReady || !this.maps.configured || !this.mapElement) {
      return;
    }
    const points = this.points.filter(validCoordinate);
    if (points.length < 2) {
      this.error.set('Route points unavailable');
      return;
    }

    try {
      await this.maps.load();
      this.error.set('');
      const map = new google.maps.Map(this.mapElement.nativeElement, {
        backgroundColor: '#080A0C',
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: false,
        mapTypeControl: false,
        styles: darkMapStyle
      });
      const path = points.map((point) => ({ lat: point.latitude, lng: point.longitude }));
      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      new google.maps.Polyline({
        path,
        map,
        strokeColor: '#C8FF5A',
        strokeOpacity: 0.94,
        strokeWeight: 5
      });
      new google.maps.Marker({ position: path[0], map, title: 'Start' });
      new google.maps.Marker({ position: path[path.length - 1], map, title: 'End' });
      this.photos.filter((photo) => photo.hasLocation && validCoordinate(photo)).forEach((photo, index) => {
        new google.maps.Marker({
          position: { lat: photo.latitude, lng: photo.longitude },
          map,
          title: `Photo stop ${index + 1}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#67A7FF',
            fillOpacity: 1,
            strokeColor: '#F5F2EA',
            strokeWeight: 2
          }
        });
      });
      map.fitBounds(bounds, 48);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Google Maps failed to load');
    }
  }
}
