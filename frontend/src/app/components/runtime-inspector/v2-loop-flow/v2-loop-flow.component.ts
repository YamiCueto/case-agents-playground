import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentV2Iteration, AgentV2Phase } from '../../../models/v2-loop.models';

@Component({
  selector: 'app-v2-loop-flow',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="v2-loop-container">
      <div class="macro-section">
        <div class="dimension-header">
          <span class="dimension-label">Dimensión Macro</span>
          <span class="dimension-sub">Iteraciones del Agent Loop ({{ iterations().length }})</span>
        </div>

        <nav class="iterations-track" aria-label="Línea de tiempo de iteraciones del Agent Loop" role="list">
          @if (iterations().length === 0) {
            <div class="iterations-placeholder">
              <span>Esperando primera iteración del agente...</span>
            </div>
          } @else {
            @for (iter of iterations(); track iter.iterationIndex; let idx = $index; let isLast = $last) {
              <div
                class="iteration-card"
                role="listitem"
                tabindex="0"
                [class.is-selected]="selectedIterationIndex() === iter.iterationIndex"
                [class.is-running]="iter.status === 'running'"
                [class.is-completed]="iter.status === 'completed'"
                [class.is-failed]="iter.status === 'failed'"
                [class.is-timeout]="iter.status === 'timeout'"
                [attr.aria-label]="'Iteración ' + iter.iterationIndex + ', estado ' + iter.status + (selectedIterationIndex() === iter.iterationIndex ? ', seleccionada' : '')"
                (click)="iterationClick.emit(iter.iterationIndex)"
                (keydown.enter)="iterationClick.emit(iter.iterationIndex)"
                (keydown.space)="iterationClick.emit(iter.iterationIndex)"
              >
                <div class="iter-card-top">
                  <span class="iter-badge">Iteración {{ iter.iterationIndex }}</span>
                  <span class="iter-status-pill {{ iter.status }}">{{ iter.status | uppercase }}</span>
                </div>

                <div class="iter-card-middle">
                  <div class="metric-row">
                    <svg class="metric-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                      <polyline points="2 17 12 22 22 17"></polyline>
                      <polyline points="2 12 12 17 22 12"></polyline>
                    </svg>
                    <span class="metric-text">{{ iter.toolsCount }} {{ iter.toolsCount === 1 ? 'herramienta' : 'herramientas' }}</span>
                  </div>
                  @if (iter.durationMs) {
                    <span class="metric-duration">{{ iter.durationMs }}ms</span>
                  }
                </div>

                @if (iter.decision) {
                  <div class="iter-card-bottom">
                    <span class="decision-pill" [class.continue]="iter.decision === 'continue'" [class.stop]="iter.decision !== 'continue'">
                      {{ iter.decision === 'continue' ? 'Continuar ciclo' : 'Respuesta final' }}
                    </span>
                  </div>
                }
              </div>

              @if (!isLast) {
                <div class="iter-connector" aria-hidden="true">
                  <div class="iter-connector-line"></div>
                </div>
              }
            }
          }
        </nav>
      </div>

      @if (currentIteration(); as activeIter) {
        <div class="micro-section">
          <div class="dimension-header">
            <span class="dimension-label">Dimensión Micro</span>
            <span class="dimension-sub">Fases de la Iteración {{ activeIter.iterationIndex }}</span>
          </div>

          <nav class="phases-track" aria-label="Fases internas de la iteración" role="list">
            @for (phase of activeIter.phases; track phase.id; let pIdx = $index; let isLastPhase = $last) {
              <div
                class="phase-node"
                role="listitem"
                tabindex="0"
                [class.is-selected]="selectedPhaseIndex() === pIdx"
                [class.is-running]="phase.status === 'running'"
                [class.is-completed]="phase.status === 'completed'"
                [class.is-failed]="phase.status === 'failed'"
                [class.is-skipped]="phase.status === 'skipped'"
                [class.is-idle]="phase.status === 'idle'"
                [attr.aria-label]="'Fase ' + phase.shortName + ', estado ' + phase.status + (selectedPhaseIndex() === pIdx ? ', seleccionada' : '')"
                (click)="phaseClick.emit(pIdx)"
                (keydown.enter)="phaseClick.emit(pIdx)"
                (keydown.space)="phaseClick.emit(pIdx)"
              >
                <div class="phase-circle">
                  <span class="phase-idx">{{ pIdx + 1 }}</span>
                  @if (phase.status === 'completed') {
                    <span class="phase-indicator completed" title="Fase completada">
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  } @else if (phase.status === 'running') {
                    <span class="phase-indicator running" title="Fase en ejecución">
                      <span class="dot-inner"></span>
                    </span>
                  } @else if (phase.status === 'skipped') {
                    <span class="phase-indicator skipped" title="Fase omitida">
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </span>
                  } @else if (phase.status === 'failed') {
                    <span class="phase-indicator failed" title="Fase con error">
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </span>
                  }
                </div>
                <span class="phase-name">{{ phase.shortName }}</span>
              </div>

              @if (!isLastPhase) {
                <div 
                  class="phase-connector"
                  [class.completed]="phase.status === 'completed'"
                  [class.running]="phase.status === 'running'"
                  [class.skipped]="phase.status === 'skipped'"
                  aria-hidden="true"
                >
                  <div class="phase-connector-line"></div>
                </div>
              }
            }
          </nav>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .v2-loop-container {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
      min-width: 0;
    }
    .dimension-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }
    .dimension-label {
      font-size: 0.65rem;
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--accent-cyan-bg);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }
    .dimension-sub {
      font-size: 0.68rem;
      color: var(--text-secondary);
      font-weight: 500;
    }
    .macro-section {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.65rem;
      box-sizing: border-box;
      min-width: 0;
    }
    .iterations-track {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      overflow-x: auto;
      padding-bottom: 0.2rem;
      min-width: 0;
    }
    .iterations-placeholder {
      padding: 0.75rem;
      font-size: 0.72rem;
      color: var(--text-muted);
      text-align: center;
      width: 100%;
    }
    .iteration-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 0.45rem 0.6rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 130px;
      flex-shrink: 0;
      transition: var(--transition-fast);
      outline: none;
    }
    .iteration-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
    }
    .iteration-card:focus-visible {
      box-shadow: 0 0 0 2px var(--accent-cyan);
    }
    .iteration-card.is-selected {
      border-color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.08);
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
    }
    .iteration-card.is-running {
      border-color: var(--accent-cyan);
      animation: pulseBorder 1.2s infinite alternate;
    }
    .iteration-card.is-completed {
      border-color: rgba(16, 185, 129, 0.4);
    }
    .iteration-card.is-failed {
      border-color: var(--accent-crimson);
    }
    .iteration-card.is-timeout {
      border-color: var(--accent-amber);
    }
    @keyframes pulseBorder {
      from { box-shadow: 0 0 4px var(--accent-cyan); }
      to { box-shadow: 0 0 12px var(--accent-cyan); }
    }
    .iter-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.35rem;
    }
    .iter-badge {
      font-size: 0.68rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text-primary);
    }
    .iter-status-pill {
      font-size: 0.58rem;
      font-weight: 800;
      font-family: var(--font-mono);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
    }
    .iter-status-pill.completed { background: #064e3b; color: #34d399; }
    .iter-status-pill.running { background: #0369a1; color: #bae6fd; }
    .iter-status-pill.failed { background: #7f1d1d; color: #fca5a5; }
    .iter-status-pill.timeout { background: #78350f; color: #fde68a; }
    .iter-status-pill.idle { background: #1e293b; color: #64748b; }
    .iter-card-middle {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.35rem;
    }
    .metric-row {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .metric-icon {
      color: var(--accent-cyan);
    }
    .metric-text {
      font-size: 0.64rem;
      color: var(--text-secondary);
    }
    .metric-duration {
      font-size: 0.62rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .iter-card-bottom {
      display: flex;
      align-items: center;
    }
    .decision-pill {
      font-size: 0.58rem;
      font-weight: 600;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
    }
    .decision-pill.continue {
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-cyan);
    }
    .decision-pill.stop {
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-emerald);
    }
    .iter-connector {
      flex: 0 0 14px;
      height: 2px;
    }
    .iter-connector-line {
      width: 100%;
      height: 100%;
      background: var(--border-default);
    }
    .micro-section {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.65rem;
      box-sizing: border-box;
      min-width: 0;
    }
    .phases-track {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 0.15rem;
      box-sizing: border-box;
      overflow-x: auto;
      padding-bottom: 0.2rem;
    }
    .phase-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
      padding: 0.2rem;
      border-radius: var(--radius-sm);
      transition: var(--transition-fast);
      outline: none;
      flex: 1 1 0;
      min-width: 50px;
      text-align: center;
    }
    .phase-node:hover {
      background: rgba(30, 41, 59, 0.6);
    }
    .phase-node:focus-visible {
      box-shadow: 0 0 0 2px var(--accent-cyan);
    }
    .phase-circle {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--bg-panel);
      border: 2px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      font-size: 0.65rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      flex-shrink: 0;
      transition: var(--transition-fast);
    }
    .phase-node.is-selected .phase-circle {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25), 0 0 8px rgba(56, 189, 248, 0.4);
      transform: scale(1.1);
    }
    .phase-node.is-running .phase-circle {
      border-color: var(--accent-cyan);
      background: #0284c7;
      color: #ffffff;
      animation: pulseBorder 1.2s infinite alternate;
    }
    .phase-node.is-completed .phase-circle {
      border-color: var(--accent-emerald);
      background: #064e3b;
      color: var(--accent-emerald-hover);
    }
    .phase-node.is-skipped .phase-circle {
      border-color: var(--border-default);
      border-style: dashed;
      background: #1e293b;
      color: var(--text-muted);
      opacity: 0.7;
    }
    .phase-node.is-failed .phase-circle {
      border-color: var(--accent-crimson);
      background: #7f1d1d;
      color: #fca5a5;
    }
    .phase-indicator {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .phase-indicator.completed {
      background: var(--accent-emerald);
      color: #022c22;
    }
    .phase-indicator.running {
      background: var(--accent-cyan);
    }
    .phase-indicator.running .dot-inner {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #082f49;
    }
    .phase-indicator.skipped {
      background: var(--text-muted);
      color: #0f172a;
    }
    .phase-indicator.failed {
      background: var(--accent-crimson);
      color: #ffffff;
    }
    .phase-name {
      font-size: 0.58rem;
      font-weight: 600;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .phase-node.is-selected .phase-name {
      color: var(--accent-cyan);
      font-weight: 700;
    }
    .phase-connector {
      flex: 0 1 14px;
      height: 2px;
      min-width: 4px;
      margin-top: -10px;
    }
    .phase-connector-line {
      width: 100%;
      height: 100%;
      background: var(--border-subtle);
    }
    .phase-connector.completed .phase-connector-line {
      background: var(--accent-emerald);
    }
    .phase-connector.running .phase-connector-line {
      background: var(--accent-cyan);
    }
    .phase-connector.skipped .phase-connector-line {
      background: var(--border-default);
      border-top: 1px dashed var(--text-muted);
    }
    @media (max-width: 480px) {
      .iteration-card {
        min-width: 110px;
      }
      .phases-track {
        flex-wrap: wrap;
        row-gap: 0.5rem;
      }
      .phase-node {
        flex: 1 1 28%;
        min-width: 46px;
      }
      .phase-connector {
        display: none;
      }
    }
  `]
})
export class V2LoopFlowComponent {
  readonly iterations = input<AgentV2Iteration[]>([]);
  readonly selectedIterationIndex = input<number>(1);
  readonly selectedPhaseIndex = input<number>(0);

  readonly iterationClick = output<number>();
  readonly phaseClick = output<number>();

  get currentIteration(): () => AgentV2Iteration | undefined {
    return () => {
      const iters = this.iterations();
      const targetIdx = this.selectedIterationIndex();
      return iters.find((it) => it.iterationIndex === targetIdx) || iters[iters.length - 1];
    };
  }
}
