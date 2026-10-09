import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentJourneyStep } from '../../../models/journey.models';

@Component({
  selector: 'app-journey-flow',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="flow-track-wrapper" aria-label="Ruta de ejecución agéntica de 7 hops">
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
            <div class="node-circle">
              <span class="node-num">{{ step.hopNumber }}</span>

              @if (step.status === 'completed') {
                <span class="status-badge completed" title="Hop completado">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
              } @else if (step.status === 'active') {
                <span class="status-badge active" title="Hop ejecutándose activamente">
                  <span class="dot-inner"></span>
                </span>
              } @else if (step.status === 'skipped') {
                <span class="status-badge skipped" title="Hop omitido en consulta conceptual">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </span>
              } @else if (step.status === 'failed') {
                <span class="status-badge failed" title="Hop con error">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </span>
              }
            </div>

            <span class="node-title">{{ step.shortName }}</span>
          </div>

          @if (!isLast) {
            <div 
              class="flow-connector"
              [class.completed]="step.status === 'completed' && steps()[idx + 1]?.status !== 'idle'"
              [class.skipped]="step.status === 'skipped' || steps()[idx + 1]?.status === 'skipped'"
              [class.active]="step.status === 'active'"
              aria-hidden="true"
            >
              <div class="connector-line"></div>
              @if (step.status === 'active') {
                <div class="packet-stream"></div>
              }
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
      padding: 0.65rem 0.5rem;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      border: 1px solid var(--border-subtle);
      box-sizing: border-box;
    }
    .flow-track {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 0.15rem;
      box-sizing: border-box;
    }
    .flow-node-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      padding: 0.25rem 0.2rem;
      border-radius: var(--radius-sm);
      transition: var(--transition-smooth);
      outline: none;
      flex: 1 1 0;
      min-width: 0;
      text-align: center;
      position: relative;
    }
    .flow-node-item:hover {
      background: rgba(30, 41, 59, 0.6);
    }
    .flow-node-item:focus-visible {
      box-shadow: 0 0 0 2px var(--accent-cyan);
    }
    .node-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--bg-panel);
      border: 2px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      font-size: 0.72rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      transition: var(--transition-smooth);
      flex-shrink: 0;
    }
    .flow-node-item.is-selected .node-circle {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25), 0 0 10px rgba(56, 189, 248, 0.5);
      transform: scale(1.12);
    }
    .flow-node-item.is-executing .node-circle {
      border-color: var(--accent-cyan);
      background: #0284c7;
      color: #ffffff;
      animation: pulseExecuting 1.2s infinite alternate;
    }
    .flow-node-item.is-completed .node-circle {
      border-color: var(--accent-emerald);
      background: #064e3b;
      color: var(--accent-emerald-hover);
    }
    .flow-node-item.is-skipped .node-circle {
      border-color: var(--border-default);
      border-style: dashed;
      background: #1e293b;
      color: var(--text-muted);
      opacity: 0.7;
    }
    .flow-node-item.is-failed .node-circle {
      border-color: var(--accent-crimson);
      background: #7f1d1d;
      color: #fca5a5;
    }
    @keyframes pulseExecuting {
      from { box-shadow: 0 0 4px var(--accent-cyan); }
      to { box-shadow: 0 0 14px var(--accent-cyan); }
    }
    .status-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .status-badge.completed {
      background: var(--accent-emerald);
      color: #022c22;
    }
    .status-badge.active {
      background: var(--accent-cyan);
    }
    .status-badge.active .dot-inner {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #082f49;
    }
    .status-badge.skipped {
      background: var(--text-muted);
      color: #0f172a;
    }
    .status-badge.failed {
      background: var(--accent-crimson);
      color: #ffffff;
    }
    .node-title {
      font-size: 0.62rem;
      font-weight: 600;
      color: var(--text-secondary);
      line-height: 1.15;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
      transition: color 0.15s ease;
    }
    .flow-node-item.is-selected .node-title {
      color: var(--accent-cyan);
      font-weight: 700;
    }
    .flow-node-item.is-completed .node-title {
      color: var(--text-primary);
    }
    .flow-node-item.is-skipped .node-title {
      color: var(--text-muted);
    }
    .flow-connector {
      flex: 0 1 18px;
      height: 2px;
      min-width: 6px;
      position: relative;
      margin-top: -14px;
    }
    .connector-line {
      width: 100%;
      height: 100%;
      background: var(--border-subtle);
      transition: background 0.3s ease;
    }
    .flow-connector.completed .connector-line {
      background: var(--accent-emerald);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
    }
    .flow-connector.skipped .connector-line {
      background: var(--border-default);
      border-top: 1px dashed var(--text-muted);
    }
    .flow-connector.active .connector-line {
      background: var(--accent-cyan);
    }
    .packet-stream {
      position: absolute;
      top: -3px;
      left: 0;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
      animation: packetMotion 0.9s linear infinite;
    }
    @keyframes packetMotion {
      0% { left: 0%; opacity: 0; }
      50% { opacity: 1; }
      100% { left: 100%; opacity: 0; }
    }
    @media (max-width: 480px) {
      .flow-track {
        flex-wrap: wrap;
        row-gap: 0.75rem;
      }
      .flow-node-item {
        flex: 1 1 21%;
        min-width: 58px;
      }
      .flow-connector {
        flex: 0 1 8px;
      }
    }
  `]
})
export class JourneyFlowComponent {
  readonly steps = input<AgentJourneyStep[]>([]);
  readonly selectedHopNumber = input<number>(1);
  readonly stepClick = output<number>();

  onArrowKey(targetIndex: number, event: Event): void {
    event.preventDefault();
    const count = this.steps().length;
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(count - 1, targetIndex));
    this.stepClick.emit(clamped);
  }
}
