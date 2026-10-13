import {
  Component,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RuntimeCompanionState } from '../../models/companion.models';
import { RuntimeCompanionGraphComponent } from './runtime-companion-graph.component';
import { RuntimeCompanionService } from '../../services/runtime-companion.service';

@Component({
  selector: 'app-runtime-companion',
  standalone: true,
  imports: [CommonModule, RuntimeCompanionGraphComponent],
  template: `
    @if (state(); as run) {
      <div
        class="companion-card"
        data-tour="tour-runtime-companion"
        [class.is-minimized]="run.isMinimized"
        [class.is-compact-summary]="isCompactSummary(run)"
        [class.status-preparing]="run.status === 'preparing'"
        [class.status-running]="run.status === 'running'"
        [class.status-completed]="run.status === 'completed'"
        [class.status-failed]="run.status === 'failed'"
        [class.status-cancelled]="run.status === 'cancelled'"
        role="region"
        aria-label="Runtime Companion - Estado de la ejecución"
      >
        @if (run.isMinimized) {
          <!-- Barra ultra compacta cuando el aprendiz la minimiza manualmente -->
          <div class="minimized-strip" (click)="onToggleMinimize(run.runId)">
            <span class="mini-event-text">
              {{ run.activeEvent?.type || 'Preparando' }} &bull; {{ run.eventMapping?.stateBadge || 'En curso' }}
            </span>
            <span class="expand-prompt">Haga clic para expandir &darr;</span>
          </div>
        } @else if (isCompactSummary(run)) {
          <!-- Resumen Compacto y Discreto al finalizar para no sobrecargar el chat -->
          <div class="compact-summary-bar">
            <div class="summary-left">
              <div class="status-indicator-icon">
                @if (run.status === 'completed') {
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                } @else if (run.status === 'failed') {
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                  </svg>
                } @else {
                  <span class="dot-core grey"></span>
                }
              </div>

              <div class="summary-meta">
                <div class="meta-title-row">
                  <span class="summary-title">Runtime Companion</span>
                  <span class="version-badge">{{ run.agentVersion.toUpperCase() }}</span>
                  <span class="status-pill" [ngClass]="run.status">{{ getStatusLabel(run.status) }}</span>
                </div>
                <div class="meta-desc-row">
                  <span class="summary-chip">{{ run.events.length }} eventos</span>
                  <span class="dot-sep">&bull;</span>
                  <span class="state-summary-text">{{ run.eventMapping?.stateBadge || 'Ejecución finalizada' }}</span>
                </div>
              </div>
            </div>

            <div class="summary-actions">
              <!-- Botón visible Ver Replay -->
              <button
                type="button"
                class="btn-replay-pill"
                (click)="onEnableReplay(run.runId)"
                title="Reproducir eventos históricos paso a paso"
                aria-label="Ver Replay"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>Ver Replay</span>
              </button>

              <!-- Botón Ver Detalles (Expande Grafo y Responsabilidades) -->
              <button
                type="button"
                class="btn-details-pill"
                (click)="onToggleDetails(run.runId)"
                title="Expandir topología SVG y responsabilidades"
                aria-label="Ver detalles"
              >
                <span>Detalles</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              <!-- Botón Simulador 3D -->
              <button
                type="button"
                class="btn-action-3d-compact"
                (click)="onOpen3DSimulator(run.runId)"
                title="Abrir simulación completa Three.js para esta ejecución"
                aria-label="Abrir simulador 3D"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                  <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
                <span class="btn-text-3d">3D</span>
              </button>
            </div>
          </div>
        } @else {
          <!-- Tarjeta Completa (En ejecución activa, Replay o Detalles expandidos) -->
          <header class="companion-header">
            <div class="header-left">
              <div class="icon-indicator">
                @if (run.status === 'running') {
                  <span class="pulse-radar"></span>
                  <span class="dot-core live"></span>
                } @else if (run.status === 'preparing') {
                  <span class="spinner-small"></span>
                } @else if (run.status === 'completed') {
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                } @else if (run.status === 'failed') {
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                } @else {
                  <span class="dot-core grey"></span>
                }
              </div>

              <div class="header-titles">
                <span class="companion-title">Runtime Companion</span>
                <span class="version-badge">{{ run.agentVersion.toUpperCase() }}</span>
              </div>

              <div class="status-pill" [ngClass]="run.status">
                {{ getStatusLabel(run.status) }}
                @if (run.isReplayMode) {
                  <span class="replay-tag">&bull; REPLAY</span>
                }
              </div>
            </div>

            <div class="header-actions">
              <!-- Botón Expandir al Simulador 3D -->
              <button
                type="button"
                class="btn-action-3d"
                (click)="onOpen3DSimulator(run.runId)"
                title="Abrir simulación completa Three.js para esta ejecución"
                aria-label="Abrir simulador 3D"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                  <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
                <span class="btn-text">Abrir simulador 3D</span>
              </button>

              @if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
                <!-- Botón para plegar detalles si la corrida ya terminó -->
                <button
                  type="button"
                  class="btn-toggle-details"
                  (click)="onToggleDetails(run.runId)"
                  title="Plegar a vista de resumen"
                  aria-label="Plegar detalles"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </button>
              }

              <!-- Botón Minimizar / Expandir -->
              <button
                type="button"
                class="btn-toggle-min"
                (click)="onToggleMinimize(run.runId)"
                [title]="run.isMinimized ? 'Expandir Runtime Companion' : 'Minimizar Runtime Companion'"
                [attr.aria-label]="run.isMinimized ? 'Expandir' : 'Minimizar'"
              >
                @if (run.isMinimized) {
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                } @else {
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                }
              </button>
            </div>
          </header>

          <div class="companion-body">
            <!-- 1. Grafo Compacto SVG -->
            <app-runtime-companion-graph
              [agentVersion]="run.agentVersion"
              [nodeStates]="run.nodeStates"
              [activeEdgeId]="run.eventMapping?.edgeId"
            ></app-runtime-companion-graph>

            <!-- 2. Tarjeta Pedagógica Contextual -->
            <div class="pedagogical-box">
              <div class="event-meta-row">
                <div class="event-type-badge">
                  <span class="event-name">{{ run.activeEvent?.type || 'INICIALIZANDO' }}</span>
                  @if (getHopLabel(run); as hopStr) {
                    <span class="hop-chip">{{ hopStr }}</span>
                  }
                </div>
                <span class="state-summary-text">{{ run.eventMapping?.stateBadge || 'Preparando contexto...' }}</span>
              </div>

              <p class="event-explanation-text">
                {{ run.eventMapping?.pedagogicalExplanation || 'Inicializando canal seguro con el orquestador FastAPI...' }}
              </p>

              <!-- Responsabilidades explícitas: LLM vs Runtime -->
              @if (run.eventMapping; as mapping) {
                <div class="responsibilities-grid">
                  <div class="resp-item llm-item">
                    <span class="resp-tag">LLM</span>
                    <span class="resp-desc">{{ mapping.whatLLMDid }}</span>
                  </div>
                  <div class="resp-item runtime-item">
                    <span class="resp-tag">Runtime</span>
                    <span class="resp-desc">{{ mapping.whatRuntimeDid }}</span>
                  </div>
                </div>
              }

              <!-- Mensaje de error si la ejecución falló -->
              @if (run.status === 'failed' && run.errorMessage) {
                <div class="error-notice" role="alert">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{{ run.errorMessage }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Pie de tarjeta: Documentación y Replay -->
          <footer class="companion-footer">
            <button
              type="button"
              class="btn-help-doc"
              (click)="onOpenDocumentation(run)"
              title="Abrir explicación didáctica en la Guía del Aprendiz"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>¿Qué significa este paso?</span>
            </button>

            <!-- Controles rápidos de replay cuando la ejecución ha terminado o en replay -->
            @if (run.status === 'completed' || run.status === 'failed' || run.isReplayMode) {
              <div class="mini-replay-controls" role="group" aria-label="Controles de reproducción paso a paso">
                <button
                  type="button"
                  class="btn-replay-step"
                  [disabled]="run.activeEventIndex <= 0"
                  (click)="onStepPrev(run)"
                  title="Paso anterior de la ejecución"
                  aria-label="Paso anterior"
                >
                  &larr;
                </button>

                <span class="replay-step-label">
                  Paso {{ run.activeEventIndex + 1 }} de {{ run.events.length }}
                </span>

                <button
                  type="button"
                  class="btn-replay-step"
                  [disabled]="run.activeEventIndex >= run.events.length - 1"
                  (click)="onStepNext(run)"
                  title="Paso siguiente de la ejecución"
                  aria-label="Paso siguiente"
                >
                  &rarr;
                </button>
              </div>
            }
          </footer>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      margin: 0.5rem 0;
    }

    .companion-card {
      width: 100%;
      background: rgba(10, 16, 30, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: var(--radius-md);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.08);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: fadeInCompanion 0.22s ease-out;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    @keyframes fadeInCompanion {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .companion-card.is-minimized {
      border-color: var(--border-default);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    .companion-card.is-compact-summary {
      border-color: rgba(56, 189, 248, 0.25);
      background: rgba(10, 16, 30, 0.85);
    }

    .companion-card.status-running {
      border-color: rgba(56, 189, 248, 0.45);
    }

    .companion-card.status-completed {
      border-color: rgba(16, 185, 129, 0.35);
    }

    .companion-card.status-failed {
      border-color: rgba(239, 68, 68, 0.4);
    }

    /* Barra de Resumen Compacto */
    .compact-summary-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.55rem 0.85rem;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .summary-left {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-width: 0;
    }

    .status-indicator-icon {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(56, 189, 248, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .summary-meta {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
    }

    .meta-title-row {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .summary-title {
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .meta-desc-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.7rem;
      color: var(--text-secondary);
    }

    .summary-chip {
      font-family: var(--font-mono);
      color: var(--accent-cyan);
    }

    .dot-sep {
      color: var(--text-muted);
      font-size: 0.6rem;
    }

    .summary-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-left: auto;
    }

    .btn-replay-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(14, 165, 233, 0.15);
      color: var(--accent-cyan);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: var(--radius-sm);
      padding: 0.25rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .btn-replay-pill:hover {
      background: rgba(14, 165, 233, 0.3);
      border-color: var(--accent-cyan);
    }

    .btn-details-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background: rgba(30, 41, 59, 0.7);
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.25rem 0.5rem;
      font-size: 0.72rem;
      cursor: pointer;
      transition: color 0.15s ease, border-color 0.15s ease;
    }

    .btn-details-pill:hover {
      color: var(--text-primary);
      border-color: var(--border-default);
    }

    .btn-action-3d-compact {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(129, 140, 248, 0.3);
      border-radius: var(--radius-sm);
      padding: 0.25rem 0.45rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .btn-action-3d-compact:hover {
      background: rgba(99, 102, 241, 0.3);
    }

    /* Encabezado */
    .companion-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.55rem 0.85rem;
      background: rgba(15, 23, 42, 0.65);
      border-bottom: 1px solid rgba(56, 189, 248, 0.15);
      gap: 0.5rem;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      flex-wrap: wrap;
    }

    .icon-indicator {
      position: relative;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .pulse-radar {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.4);
      animation: pulseRadar 1.6s infinite ease-out;
    }

    @keyframes pulseRadar {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }

    .dot-core {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
    }

    .dot-core.live {
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }

    .dot-core.grey {
      background: var(--text-muted);
    }

    .spinner-small {
      width: 10px;
      height: 10px;
      border: 2px solid rgba(56, 189, 248, 0.25);
      border-top-color: var(--accent-cyan);
      border-radius: 50%;
      animation: spinSmall 0.8s linear infinite;
    }

    @keyframes spinSmall {
      to { transform: rotate(360deg); }
    }

    .header-titles {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .companion-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.2px;
    }

    .version-badge {
      font-size: 0.64rem;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 0.1rem 0.35rem;
      border-radius: var(--radius-sm);
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-cyan);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }

    .status-pill {
      font-size: 0.65rem;
      font-weight: 600;
      padding: 0.1rem 0.45rem;
      border-radius: var(--radius-sm);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    .status-pill.preparing {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .status-pill.running {
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-cyan);
      border: 1px solid rgba(56, 189, 248, 0.35);
    }

    .status-pill.completed {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-pill.failed {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .status-pill.cancelled {
      background: rgba(100, 116, 139, 0.2);
      color: #cbd5e1;
      border: 1px solid rgba(100, 116, 139, 0.35);
    }

    .replay-tag {
      font-size: 0.6rem;
      color: #a78bfa;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .btn-action-3d {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(129, 140, 248, 0.35);
      border-radius: var(--radius-sm);
      padding: 0.25rem 0.6rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .btn-action-3d:hover {
      background: rgba(99, 102, 241, 0.3);
      border-color: #818cf8;
    }

    .btn-toggle-details,
    .btn-toggle-min {
      background: transparent;
      border: 1px solid rgba(148, 163, 184, 0.2);
      color: var(--text-muted);
      border-radius: var(--radius-sm);
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: color 0.15s ease, border-color 0.15s ease;
    }

    .btn-toggle-details:hover,
    .btn-toggle-min:hover {
      color: var(--text-primary);
      border-color: var(--border-default);
    }

    /* Cuerpo */
    .companion-body {
      padding: 0.65rem 0.85rem 0.75rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .pedagogical-box {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(56, 189, 248, 0.15);
      border-radius: var(--radius-sm);
      padding: 0.6rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    .event-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .event-type-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    .event-name {
      font-size: 0.72rem;
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--accent-cyan);
    }

    .hop-chip {
      font-size: 0.65rem;
      font-family: var(--font-mono);
      background: rgba(56, 189, 248, 0.12);
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      padding: 0.05rem 0.35rem;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }

    .state-summary-text {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .event-explanation-text {
      font-size: 0.78rem;
      line-height: 1.45;
      color: var(--text-secondary);
      margin: 0;
    }

    /* Responsabilidades explícitas */
    .responsibilities-grid {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.2rem;
    }

    .resp-item {
      flex: 1 1 0;
      background: rgba(2, 6, 23, 0.6);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.55rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .resp-tag {
      font-size: 0.62rem;
      font-weight: 700;
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .llm-item .resp-tag {
      color: #a78bfa;
    }

    .runtime-item .resp-tag {
      color: #38bdf8;
    }

    .resp-desc {
      font-size: 0.71rem;
      line-height: 1.35;
      color: var(--text-secondary);
    }

    .error-notice {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      border-radius: var(--radius-sm);
      padding: 0.35rem 0.55rem;
      color: #f87171;
      font-size: 0.72rem;
    }

    /* Pie */
    .companion-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.45rem 0.85rem;
      background: rgba(15, 23, 42, 0.5);
      border-top: 1px solid rgba(56, 189, 248, 0.1);
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .btn-help-doc {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.71rem;
      cursor: pointer;
      padding: 0.2rem 0;
      transition: color 0.15s ease;
    }

    .btn-help-doc:hover {
      color: var(--accent-cyan);
    }

    .mini-replay-controls {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
    }

    .btn-replay-step {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.75rem;
      transition: background 0.15s ease;
    }

    .btn-replay-step:hover:not(:disabled) {
      background: rgba(56, 189, 248, 0.2);
      border-color: var(--accent-cyan);
    }

    .btn-replay-step:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .replay-step-label {
      font-size: 0.68rem;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      padding: 0 0.2rem;
    }

    .minimized-strip {
      padding: 0.45rem 0.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      font-size: 0.72rem;
      color: var(--text-secondary);
      background: rgba(15, 23, 42, 0.7);
    }

    .minimized-strip:hover {
      background: rgba(15, 23, 42, 0.9);
      color: var(--text-primary);
    }

    .expand-prompt {
      font-size: 0.68rem;
      color: var(--accent-cyan);
    }

    /* Reducción de Movimiento */
    @media (prefers-reduced-motion: reduce) {
      .companion-card,
      .pulse-radar,
      .spinner-small {
        animation: none !important;
        transition: none !important;
      }
    }

    @media (max-width: 600px) {
      .responsibilities-grid {
        flex-direction: column;
      }
      .btn-action-3d .btn-text {
        display: none;
      }
      .summary-actions {
        width: 100%;
        justify-content: flex-end;
      }
    }
  `]
})
export class RuntimeCompanionComponent {
  readonly state = input<RuntimeCompanionState | undefined>(undefined);

  readonly expandTo3D = output<string>();
  readonly toggleMinimize = output<string>();
  readonly openDocumentation = output<string>();
  readonly selectReplayIndex = output<{ runId: string; index: number }>();

  private readonly companionService = inject(RuntimeCompanionService);

  isCompactSummary(run: RuntimeCompanionState): boolean {
    const isFinished = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
    return isFinished && !run.isReplayMode && !run.isDetailsExpanded;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'preparing':
        return 'Preparando';
      case 'running':
        return 'En ejecución';
      case 'completed':
        return 'Completado';
      case 'failed':
        return 'Fallo';
      case 'cancelled':
        return 'Cancelado';
      default:
        return 'En espera';
    }
  }

  getHopLabel(run: RuntimeCompanionState): string | null {
    const evt = run.activeEvent;
    if (!evt) return null;

    if (run.agentVersion === 'v4') {
      const stepId = evt.payload?.['step_id'] || evt.payload?.['current_step_id'];
      if (stepId) return `Paso ${stepId}`;
    } else if (run.agentVersion === 'v2' || run.agentVersion === 'v3') {
      if (evt.iteration_index !== undefined) {
        return `Iteración ${evt.iteration_index}`;
      }
    } else {
      if (evt.hop_number) {
        return `Hop ${evt.hop_number} / 7`;
      }
    }
    return null;
  }

  onOpen3DSimulator(runId: string): void {
    this.companionService.open3DSimulator(runId);
    this.expandTo3D.emit(runId);
  }

  onToggleMinimize(runId: string): void {
    this.companionService.toggleMinimize(runId);
    this.toggleMinimize.emit(runId);
  }

  onToggleDetails(runId: string): void {
    this.companionService.toggleDetails(runId);
  }

  onEnableReplay(runId: string): void {
    this.companionService.enableReplayMode(runId);
  }

  onOpenDocumentation(run: RuntimeCompanionState): void {
    const docFile = run.eventMapping?.activeNode
      ? 'catalogo-herramientas.md'
      : 'guia-runtime-inspector.md';
    this.openDocumentation.emit(docFile);
  }

  onStepPrev(run: RuntimeCompanionState): void {
    if (run.activeEventIndex > 0) {
      const prevIdx = run.activeEventIndex - 1;
      this.companionService.setReplayIndex(run.runId, prevIdx);
      this.selectReplayIndex.emit({ runId: run.runId, index: prevIdx });
    }
  }

  onStepNext(run: RuntimeCompanionState): void {
    if (run.activeEventIndex < run.events.length - 1) {
      const nextIdx = run.activeEventIndex + 1;
      this.companionService.setReplayIndex(run.runId, nextIdx);
      this.selectReplayIndex.emit({ runId: run.runId, index: nextIdx });
    }
  }
}
