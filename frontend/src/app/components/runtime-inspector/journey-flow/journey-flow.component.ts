import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentJourneyStep } from '../../../models/journey.models';

@Component({
  selector: 'app-journey-flow',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="flow-track-wrapper" aria-label="Ruta de ejecución agéntica determinista de 7 hops">
      <div class="flow-track" role="list">
        @for (step of steps(); track step.id; let idx = $index; let isLast = $last) {
          <div
            class="flow-node-item"
            role="listitem"
            [class.is-selected]="selectedHopNumber() === step.hopNumber"
            [class.is-executing]="step.status === 'active'"
            [class.is-completed]="step.status === 'completed'"
            [class.is-skipped]="step.status === 'skipped'"
            [class.is-failed]="step.status === 'failed'"
            [class.is-idle]="step.status === 'idle'"
            tabindex="0"
            role="button"
            [attr.aria-label]="'Hop ' + step.hopNumber + ': ' + step.shortName + ', estado ' + step.status + (selectedHopNumber() === step.hopNumber ? ', seleccionado' : '')"
            (click)="stepClick.emit(idx)"
            (keydown.enter)="stepClick.emit(idx)"
            (keydown.space)="stepClick.emit(idx)"
            (keydown.arrowright)="onArrowKey(idx + 1, $event)"
            (keydown.arrowleft)="onArrowKey(idx - 1, $event)"
          >
            <!-- Círculo del Nodo de Hop -->
            <div class="node-circle" [ngClass]="step.status">
              @if (step.status === 'completed') {
                <svg class="check-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              } @else if (step.status === 'failed') {
                <svg class="fail-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              } @else if (step.status === 'skipped') {
                <svg class="skip-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              } @else {
                <span class="node-num">{{ step.hopNumber }}</span>
              }
            </div>

            <!-- Título del Hop debajo del nodo -->
            <span class="node-title" [class.active-title]="step.status === 'active' || selectedHopNumber() === step.hopNumber">
              {{ step.hopNumber }}. {{ step.shortName }}
            </span>
          </div>

          <!-- Conector horizontal entre Hops -->
          @if (!isLast) {
            <div 
              class="flow-connector"
              [class.completed]="step.status === 'completed' && steps()[idx + 1]?.status !== 'idle'"
              [class.active]="step.status === 'active'"
              [class.skipped]="step.status === 'skipped' || steps()[idx + 1]?.status === 'skipped'"
              aria-hidden="true"
            >
              <div class="connector-line"></div>
            </div>
          }
        }
      </div>
    </nav>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }

    .flow-track-wrapper {
      width: 100%;
      padding: 0.65rem 0.75rem;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      border: 1px solid var(--border-default);
      box-sizing: border-box;
      overflow-x: auto;
    }

    .flow-track {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-width: 480px;
      gap: 0.25rem;
      padding: 0.2rem 0.25rem;
    }

    .flow-node-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      padding: 0.25rem 0.35rem;
      border-radius: var(--radius-sm);
      transition: var(--transition-smooth);
      outline: none;
      min-width: 54px;
      text-align: center;
      position: relative;
    }

    .flow-node-item:hover {
      background: var(--bg-card-hover);
    }

    .flow-node-item:focus-visible {
      box-shadow: 0 0 0 2px var(--accent-cyan);
    }

    /* Esfera del nodo */
    .node-circle {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.72rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text-muted);
      transition: var(--transition-smooth);
      flex-shrink: 0;
    }

    /* 1. Hop Activo con resplandor neón Stitch */
    .flow-node-item.is-executing .node-circle,
    .node-circle.active {
      border: 2px solid var(--accent-cyan-neon);
      background: rgba(0, 240, 255, 0.25);
      color: var(--accent-cyan-neon);
      box-shadow: 0 0 15px #00F0FF, inset 0 0 8px #00F0FF;
      animation: pulseActiveHop 1.4s infinite alternate;
      transform: scale(1.08);
    }

    /* 2. Hop Completado con checkmark esmeralda */
    .flow-node-item.is-completed .node-circle,
    .node-circle.completed {
      border: 1px solid var(--accent-emerald);
      background: rgba(16, 185, 129, 0.2);
      color: var(--accent-emerald-bright);
    }

    .check-icon {
      color: var(--accent-emerald-bright);
    }

    /* 3. Hop Seleccionado */
    .flow-node-item.is-selected .node-circle {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.35);
    }

    /* 4. Hop con Fallo */
    .flow-node-item.is-failed .node-circle,
    .node-circle.failed {
      border-color: var(--accent-crimson);
      background: rgba(239, 68, 68, 0.25);
      color: var(--accent-crimson-bright);
    }

    .fail-icon {
      color: var(--accent-crimson-bright);
    }

    /* 5. Hop Omitido (Skipped) */
    .flow-node-item.is-skipped .node-circle,
    .node-circle.skipped {
      border: 1px dashed var(--border-default);
      background: rgba(100, 116, 139, 0.15);
      color: var(--text-muted);
    }

    .skip-icon {
      color: var(--text-muted);
    }

    /* Título del hop */
    .node-title {
      font-size: 0.65rem;
      font-weight: 500;
      color: var(--text-secondary);
      white-space: nowrap;
      transition: var(--transition-fast);
    }

    .node-title.active-title {
      color: var(--text-primary);
      font-weight: 700;
    }

    .flow-node-item.is-executing .node-title {
      color: var(--accent-cyan-neon);
      font-weight: 700;
    }

    /* Conectores entre nodos */
    .flow-connector {
      flex: 1 1 0;
      display: flex;
      align-items: center;
      min-width: 16px;
      margin-bottom: 1rem;
    }

    .connector-line {
      width: 100%;
      height: 2px;
      background: var(--border-subtle);
      border-radius: 1px;
      transition: var(--transition-smooth);
    }

    .flow-connector.completed .connector-line {
      background: var(--accent-emerald);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
    }

    .flow-connector.active .connector-line {
      background: var(--accent-cyan);
      box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
    }

    .flow-connector.skipped .connector-line {
      background: var(--border-default);
      border-top: 1px dashed var(--border-default);
    }

    @keyframes pulseActiveHop {
      from { box-shadow: 0 0 8px #00F0FF, inset 0 0 4px #00F0FF; }
      to { box-shadow: 0 0 18px #00F0FF, inset 0 0 10px #00F0FF; }
    }
  `]
})
export class JourneyFlowComponent {
  readonly steps = input<AgentJourneyStep[]>([]);
  readonly selectedHopNumber = input<number>(1);
  readonly stepClick = output<number>();

  onArrowKey(targetIndex: number, event: Event): void {
    const list = this.steps();
    if (targetIndex >= 0 && targetIndex < list.length) {
      event.preventDefault();
      this.stepClick.emit(targetIndex);
    }
  }
}
