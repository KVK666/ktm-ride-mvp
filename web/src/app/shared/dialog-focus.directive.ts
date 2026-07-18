import { AfterViewInit, Directive, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

@Directive({ selector: '[appDialogFocus]', standalone: true })
export class DialogFocusDirective implements AfterViewInit, OnDestroy {
  @Input({ required: true }) appDialogFocus!: () => void;

  private previousFocus: HTMLElement | null = null;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => this.focusFirst());
  }

  ngOnDestroy() {
    this.previousFocus?.focus?.();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.appDialogFocus();
      return;
    }
    if (event.key !== 'Tab') return;

    const elements = this.focusableElements();
    if (!elements.length) {
      event.preventDefault();
      return;
    }
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      elements[elements.length - 1].focus();
    } else if (!event.shiftKey && currentIndex === elements.length - 1) {
      event.preventDefault();
      elements[0].focus();
    }
  }

  private focusFirst() {
    this.focusableElements()[0]?.focus();
  }

  private focusableElements() {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
  }
}
