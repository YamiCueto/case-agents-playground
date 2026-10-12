import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalkthroughService } from '../../services/walkthrough.service';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

@Component({
  selector: 'app-walkthrough-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (walkthrough.isActive()) {
      <div
        class="walkthrough-container"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="currentStep()?.title || 'Recorrido interactivo de AEP'"
      >
        <!-- Overlay semitransparente con máscara de recorte/spotlight -->
        <div class="spotlight-overlay" (click)="onBackdropClick($event)">
          @if (targetRect(); as rect) {
            <div
              class="spotlight-hole"
              [style.top.px]="rect.top - 6"
              [style.left.px]="rect.left - 6"
              [style.width.px]="rect.width + 12"
              [style.height.px]="rect.height + 12"
            >
              <div class="spotlight-pulse-border"></div>
            </div>
          }
        </div>

        <!-- Tarjeta flotante pedagógica -->
        @if (currentStep(); as step) {
          <div
            class="walkthrough-card"
            [ngClass]="cardPlacementClass()"
            [style.top]="cardPositionStyle().top"
            [style.left]="cardPositionStyle().left"
            [style.transform]="cardPositionStyle().transform"
            (click)="$event.stopPropagation()"
          >
            <!-- Cabecera de la tarjeta -->
            <div class="card-header">
              <div class="badge-group">
                <span class="step-badge">Paso {{ walkthrough.currentStepIndex() + 1 }} de {{ walkthrough.totalSteps() }}</span>
                @if (step.versionSpecific) {
                  <span class="version-badge">{{ step.versionSpecific.toUpperCase() }}</span>
                }
              </div>
              <button
                type="button"
                class="btn-close-tour"
                (click)="walkthrough.skipTour()"
                title="Cerrar recorrido (Esc)"
                aria-label="Cerrar recorrido"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <!-- Contenido pedagógico -->
            <div class="card-body">
              <h3 class="step-title">{{ step.title }}</h3>
              <p class="step-description">{{ step.description }}</p>

              @if (step.pedagogicalInsight) {
                <div class="insight-box">
                  <div class="insight-header">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                    <span>Insight Pedagógico</span>
                  </div>
                  <p class="insight-text">{{ step.pedagogicalInsight }}</p>
                </div>
              }
            </div>

            <!-- Barra de acciones y navegación -->
            <div class="card-footer">
              <button
                type="button"
                class="btn-tour-secondary"
                (click)="walkthrough.skipTour()"
              >
                Omitir
              </button>

              <div class="nav-btn-group">
                <button
                  type="button"
                  class="btn-tour-secondary"
                  [disabled]="walkthrough.isFirstStep()"
                  (click)="walkthrough.prevStep()"
                  title="Paso anterior (Flecha izquierda)"
                >
                  &larr; Anterior
                </button>

                <button
                  type="button"
                  class="btn-tour-primary"
                  (click)="walkthrough.nextStep()"
                  title="Paso siguiente (Flecha derecha / Enter)"
                >
                  @if (walkthrough.isLastStep()) {
                    <span>Finalizar tour</span>
                  } @else {
                    <span>Siguiente &rarr;</span>
                  }
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .walkthrough-container {
      position: fixed;
      inset: 0;
      z-index: 2000;
      overflow: hidden;
      pointer-events: auto;
    }

    .spotlight-overlay {
      position: absolute;
      inset: 0;
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(3px);
      transition: background 0.2s ease;
    }

    .spotlight-hole {
      position: absolute;
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.75), 0 0 25px rgba(56, 189, 248, 0.5);
      pointer-events: none;
      transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .spotlight-pulse-border {
      position: absolute;
      inset: 0;
      border: 2px solid var(--accent-cyan);
      border-radius: 8px;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.6);
      animation: pulseBorder 1.5s infinite alternate;
    }

    @keyframes pulseBorder {
      from { opacity: 0.65; transform: scale(0.99); }
      to { opacity: 1; transform: scale(1.01); }
    }

    /* Tarjeta flotante del Walkthrough */
    .walkthrough-card {
      position: absolute;
      width: 90%;
      max-width: 440px;
      background: var(--bg-surface);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.15);
      z-index: 2010;
      display: flex;
      flex-direction: column;
      animation: fadeInCard 0.22s ease-out;
      pointer-events: auto;
    }

    @keyframes fadeInCard {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1rem 0.5rem 1rem;
    }

    .badge-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .step-badge {
      font-size: 0.7rem;
      font-weight: 800;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-cyan);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      letter-spacing: 0.04em;
    }

    .version-badge {
      font-size: 0.68rem;
      font-weight: 800;
      background: rgba(168, 85, 247, 0.2);
      color: #c084fc;
      padding: 0.2rem 0.45rem;
      border-radius: 4px;
    }

    .btn-close-tour {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .btn-close-tour:hover {
      color: #f87171;
      background: rgba(239, 68, 68, 0.12);
    }

    .card-body {
      padding: 0.5rem 1rem 1rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .step-title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.3;
    }

    .step-description {
      margin: 0;
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .insight-box {
      background: rgba(15, 23, 42, 0.85);
      border-left: 3px solid var(--accent-cyan);
      border-radius: 0 6px 6px 0;
      padding: 0.65rem 0.85rem;
      margin-top: 0.25rem;
    }

    .insight-header {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--accent-cyan);
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }

    .insight-text {
      margin: 0;
      font-size: 0.78rem;
      color: #cbd5e1;
      line-height: 1.45;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border-subtle);
      background: rgba(10, 15, 30, 0.6);
      border-radius: 0 0 12px 12px;
    }

    .nav-btn-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-tour-secondary {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-tour-secondary:hover:not(:disabled) {
      color: var(--text-primary);
      border-color: var(--border-default);
      background: rgba(255, 255, 255, 0.05);
    }

    .btn-tour-secondary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-tour-primary {
      background: var(--accent-cyan);
      border: 1px solid var(--accent-cyan);
      color: #020617;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.35rem 0.85rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    }

    .btn-tour-primary:hover {
      background: #7dd3fc;
      border-color: #7dd3fc;
    }

    @media (max-width: 768px) {
      .walkthrough-card {
        width: calc(100% - 24px);
        left: 12px !important;
        right: 12px !important;
        bottom: 16px !important;
        top: auto !important;
        transform: none !important;
      }
    }
  `]
})
export class WalkthroughOverlayComponent implements OnInit, OnDestroy {
  readonly walkthrough = inject(WalkthroughService);

  readonly currentStep = this.walkthrough.currentStep;
  readonly targetRect = signal<TargetRect | null>(null);

  private resizeObserver: ResizeObserver | null = null;
  private updateInterval: any = null;

  constructor() {
    effect(() => {
      const active = this.walkthrough.isActive();
      const step = this.currentStep();
      if (active && step) {
        // Run update after microtask for DOM query
        setTimeout(() => this.updateTargetPosition(), 30);
      } else {
        this.targetRect.set(null);
      }
    });
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.updateInterval = setInterval(() => {
        if (this.walkthrough.isActive()) {
          this.updateTargetPosition();
        }
      }, 500);
    }
  }

  ngOnDestroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateTargetPosition();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.walkthrough.isActive()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.walkthrough.skipTour();
    } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault();
      this.walkthrough.nextStep();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.walkthrough.prevStep();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    // Si hace clic en el backdrop fuera de la tarjeta, avanzar al siguiente paso
    this.walkthrough.nextStep();
  }

  private updateTargetPosition(): void {
    if (typeof document === 'undefined') return;

    const step = this.currentStep();
    if (!step || !step.targetSelector) {
      this.targetRect.set(null);
      return;
    }

    const el = document.querySelector(step.targetSelector) as HTMLElement;
    if (!el) {
      this.targetRect.set(null);
      return;
    }

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      this.targetRect.set(null);
      return;
    }

    this.targetRect.set({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom
    });
  }

  cardPlacementClass(): string {
    const step = this.currentStep();
    return step?.placement || 'center';
  }

  cardPositionStyle(): { top?: string; left?: string; transform?: string } {
    if (typeof window === 'undefined') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    // En móviles menores a 768px se ubica siempre en la parte inferior fijada por CSS
    if (window.innerWidth <= 768) {
      return {};
    }

    const rect = this.targetRect();
    const step = this.currentStep();

    if (!rect || step?.placement === 'center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const placement = step?.placement || 'bottom';
    const cardWidth = 440;
    const cardHeight = 280;
    const gap = 16;

    if (placement === 'bottom') {
      const top = Math.min(rect.bottom + gap, window.innerHeight - cardHeight - 20);
      const left = Math.max(20, Math.min(rect.left, window.innerWidth - cardWidth - 20));
      return { top: `${top}px`, left: `${left}px`, transform: 'none' };
    }

    if (placement === 'top') {
      const top = Math.max(20, rect.top - cardHeight - gap);
      const left = Math.max(20, Math.min(rect.left, window.innerWidth - cardWidth - 20));
      return { top: `${top}px`, left: `${left}px`, transform: 'none' };
    }

    if (placement === 'left') {
      const left = Math.max(20, rect.left - cardWidth - gap);
      const top = Math.max(20, Math.min(rect.top, window.innerHeight - cardHeight - 20));
      return { top: `${top}px`, left: `${left}px`, transform: 'none' };
    }

    if (placement === 'right') {
      const left = Math.min(rect.right + gap, window.innerWidth - cardWidth - 20);
      const top = Math.max(20, Math.min(rect.top, window.innerHeight - cardHeight - 20));
      return { top: `${top}px`, left: `${left}px`, transform: 'none' };
    }

    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
}
