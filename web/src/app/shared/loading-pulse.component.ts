import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-pulse',
  standalone: true,
  template: `
    <div class="loader" [class.compact]="compact" role="status" [attr.aria-label]="label || 'Loading'">
      <div class="mark">
        <img src="/ridepulse-logo.png" alt="" />
        <span></span>
      </div>
      <svg viewBox="0 0 220 72" aria-hidden="true">
        <path class="track" d="M8 54 C40 18 70 66 100 36 S156 8 212 28" />
        <path class="pulse" d="M8 54 C40 18 70 66 100 36 S156 8 212 28" />
      </svg>
      @if (label && !compact) {
        <p>{{ label }}</p>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .loader {
      min-height: 260px;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 18px;
      color: var(--text-soft);
    }

    .loader.compact {
      min-height: 0;
      display: inline-grid;
      grid-auto-flow: column;
      grid-auto-columns: auto;
      align-items: center;
      gap: 8px;
    }

    .mark {
      position: relative;
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
    }

    .compact .mark {
      width: 24px;
      height: 24px;
    }

    .mark img {
      width: 42px;
      height: 42px;
      border-radius: 15px;
      position: relative;
      z-index: 1;
    }

    .compact .mark img {
      width: 22px;
      height: 22px;
      border-radius: 8px;
    }

    .mark span {
      position: absolute;
      inset: 2px;
      border-radius: 999px;
      border: 2px solid rgba(200, 255, 90, 0.42);
      animation: loader-ring 1.2s ease-in-out infinite;
    }

    svg {
      width: min(260px, 70vw);
      height: 84px;
      overflow: visible;
    }

    .compact svg {
      display: none;
    }

    path {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .track {
      stroke: rgba(245, 242, 234, 0.1);
      stroke-width: 12;
    }

    .pulse {
      stroke: var(--accent);
      stroke-width: 5;
      stroke-dasharray: 82 220;
      animation: loader-route 1.45s ease-in-out infinite;
      filter: drop-shadow(0 0 16px rgba(200, 255, 90, 0.55));
    }

    p {
      margin: 0;
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    @keyframes loader-route {
      from { stroke-dashoffset: 260; }
      to { stroke-dashoffset: -42; }
    }

    @keyframes loader-ring {
      0%, 100% { transform: scale(0.86); opacity: 0.45; }
      50% { transform: scale(1.12); opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .pulse,
      .mark span {
        animation: none;
      }
    }
  `]
})
export class LoadingPulseComponent {
  @Input() label = '';
  @Input() compact = false;
}
