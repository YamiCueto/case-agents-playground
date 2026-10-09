import { Component, input, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamEvent } from '../../models/agent.models';
import { EventStoreService } from '../../services/event-store.service';
import { PresentationControllerService, PlaybackSpeed } from '../../services/presentation-controller.service';
import { AgentAvatar3DComponent } from './avatar-3d/agent-avatar-3d.component';
import { JourneyFlowComponent } from './journey-flow/journey-flow.component';
import { TechnicalViewerComponent } from './technical-viewer/technical-viewer.component';

@Component({
  selector: 'app-runtime-inspector',
  standalone: true,
  imports: [
    CommonModule,
    AgentAvatar3DComponent,
    JourneyFlowComponent,
    TechnicalViewerComponent
  ],
  template: `
    <aside class="inspector-card">
      <header class="inspector-header">
        <div class="title-row">
          <div class="title-meta">
            <h2>&#x1F50E; Runtime Inspector</h2>
            <span class="version-tag">{{ activeAgentId().toUpperCase() }}</span>
          </div>

          <div class="mode-actions">
            @if (controller.mode() === 'live') {
              <div class="live-pill" [class.paused]="controller.isVisualPaused()">
                <span class="pulse-dot"></span>
                <span>{{ controller.isVisualPaused() ? 'PAUSA VISUAL' : 'EN VIVO' }}</span>
              </div>
              <button
                type="button"
                class="btn-pause-visual"
                [class.is-paused]="controller.isVisualPaused()"
                (click)="controller.toggleVisualPause()"
                title="Pausar o reanudar el seguimiento visual en pantalla sin afectar la ejecución en backend"
              >
                {{ controller.isVisualPaused() ? 'Reanudar ▶' : 'Pausar ⏸' }}
              </button>
              @if (journey().status === 'completed' || journey().events.length > 0) {
                <button
                  type="button"
                  class="btn-switch-replay"
                  (click)="controller.startReplayMode()"
                  title="Activar modo de reproducción interactiva"
                >
                  &#x1F3AC; Replay
                </button>
              }
            } @else {
              <div class="replay-pill">
                <span>&#x1F3AC; MODO REPLAY</span>
              </div>
              <button
                type="button"
                class="btn-switch-live"
                (click)="controller.setMode('live')"
                title="Regresar al modo de seguimiento en vivo"
              >
                Volver a Live &#x21B5;
              </button>
            }
          </div>
        </div>

        @if (controller.mode() === 'replay') {
          <div class="replay-toolbar" role="toolbar" aria-label="Controles de reproducción">
            <div class="transport-controls">
              <button
                type="button"
                class="btn-tool"
                (click)="controller.resetReplay()"
                title="Reiniciar reproducción"
                aria-label="Reiniciar"
              >
                &#x21BA;
              </button>
              <button
                type="button"
                class="btn-tool"
                (click)="controller.stepBackward()"
                title="Paso anterior"
                aria-label="Paso anterior"
              >
                &#x23EE;
              </button>
              <button
                type="button"
                class="btn-tool btn-play-pause"
                (click)="controller.togglePlayPauseReplay()"
                [title]="controller.isPlayingReplay() ? 'Pausar reproducción' : 'Reproducir'"
                [attr.aria-label]="controller.isPlayingReplay() ? 'Pausar' : 'Reproducir'"
              >
                {{ controller.isPlayingReplay() ? '⏸' : '▶' }}
              </button>
              <button
                type="button"
                class="btn-tool"
                (click)="controller.stepForward()"
                title="Paso siguiente"
                aria-label="Paso siguiente"
              >
                &#x23ED;
              </button>
            </div>

            <div class="speed-selector" role="radiogroup" aria-label="Velocidad de reproducción">
              <button
                type="button"
                class="btn-speed"
                [class.active]="controller.playbackSpeed() === 0.5"
                (click)="controller.setPlaybackSpeed(0.5)"
              >
                0.5x
              </button>
              <button
                type="button"
                class="btn-speed"
                [class.active]="controller.playbackSpeed() === 1"
                (click)="controller.setPlaybackSpeed(1)"
              >
                1x
              </button>
              <button
                type="button"
                class="btn-speed"
                [class.active]="controller.playbackSpeed() === 2"
                (click)="controller.setPlaybackSpeed(2)"
              >
                2x
              </button>
            </div>

            <span class="step-indicator">
              Hop {{ (controller.activeStep()?.hopNumber || 1) }} / 7
            </span>
          </div>
        }

        <nav class="tabs-bar" role="tablist">
          <button 
            class="tab-btn" 
            role="tab"
            [class.active]="activeTab() === 'journey'" 
            (click)="activeTab.set('journey')"
          >
            &#x1F680; Execution Journey
          </button>
          <button 
            class="tab-btn" 
            role="tab"
            [class.active]="activeTab() === 'events'" 
            (click)="activeTab.set('events')"
          >
            Eventos Raw ({{ events().length }})
          </button>
          <button 
            class="tab-btn future-tab" 
            role="tab"
            [class.active]="activeTab() === 'future'" 
            (click)="activeTab.set('future')"
          >
            Talleres v2..v6
          </button>
        </nav>
      </header>

      <div class="inspector-content">
        @if (activeTab() === 'journey') {
          <div class="journey-dashboard">
            <section class="avatar-hero-card">
              <div class="avatar-container">
                <app-agent-avatar-3d
                  [mood]="controller.avatarMood()"
                  [targetHop]="controller.activeStep()?.hopNumber || 1"
                ></app-agent-avatar-3d>
              </div>

              <div class="journey-flow-wrapper">
                <app-journey-flow
                  [steps]="journey().steps"
                  [selectedHopNumber]="controller.activeStep()?.hopNumber || 1"
                  (stepClick)="controller.selectStep($event)"
                ></app-journey-flow>
              </div>
            </section>

            @if (controller.activeStep(); as step) {
              <article class="step-detail-card" [ngClass]="step.status">
                <div class="card-headline">
                  <div class="headline-left">
                    <span class="hop-chip">HOP {{ step.hopNumber }}</span>
                    <h3 class="step-title">{{ step.title }}</h3>
                  </div>
                  <span class="status-pill {{ step.status }}">{{ step.status | uppercase }}</span>
                </div>

                <div class="actor-bar">
                  <span class="actor-icon">&#x1F527;</span>
                  <span class="actor-label">Componente Soberano:</span>
                  <span class="actor-value">{{ step.actor }}</span>
                </div>

                <div class="explanation-box">
                  <h4 class="section-title">&#x1F4D6; Qué está ocurriendo</h4>
                  <p class="explanation-text">{{ step.description }}</p>

                  <h4 class="section-title insight-title">&#x1F4A1; Por qué importa (Pedagogía Agéntica)</h4>
                  <p class="insight-text">{{ step.pedagogicalInsight }}</p>
                </div>

                <div class="tech-disclosure">
                  <button
                    type="button"
                    class="disclosure-toggle"
                    (click)="isTechOpen.set(!isTechOpen())"
                    [attr.aria-expanded]="isTechOpen()"
                  >
                    <span>{{ isTechOpen() ? '&#x25BC; Ocultar Detalles Técnicos' : '&#x25B6; Inspeccionar Payload JSON' }}</span>
                    <span class="disclosure-badge">{{ step.eventType }}</span>
                  </button>

                  @if (isTechOpen()) {
                    <div class="technical-viewer-wrapper">
                      <app-technical-viewer [payload]="step.payload"></app-technical-viewer>
                    </div>
                  }
                </div>
              </article>
            } @else {
              <div class="journey-empty-state">
                <span class="empty-icon">&#x23F3;</span>
                <h3>Esperando Ejecución Agéntica</h3>
                <p>Escribe una consulta en el chat. Observarás cómo cada hop del Agent Engineering Playground se activa en tiempo real con su componente responsable.</p>
              </div>
            }
          </div>
        } @else if (activeTab() === 'events') {
          <div class="raw-events-list">
            @if (events().length === 0) {
              <p class="no-events">No se han registrado eventos en este turno.</p>
            } @else {
              @for (evt of events(); track evt.event_id) {
                <div class="raw-event-card">
                  <div class="event-meta">
                    <span class="event-type-badge">{{ evt.type }}</span>
                    <span class="event-time">{{ evt.timestamp | date:'mediumTime' }}</span>
                  </div>
                  @if (evt.hop_number) {
                    <div class="event-hop-badge">
                      Hop {{ evt.hop_number }}: {{ evt.hop_title }}
                    </div>
                  }
                  <div class="json-wrapper">
                    <app-technical-viewer [payload]="evt.payload"></app-technical-viewer>
                  </div>
                </div>
              }
            }
          </div>
        } @else if (activeTab() === 'future') {
          <div class="future-workshops-grid">
            <div class="future-card">
              <h4>Agent v2 &bull; Agent Loop</h4>
              <p>Visualizador de bucle iterativo, contador de iteraciones y circuit breaker de <code>max_iterations</code>.</p>
              <span class="locked-badge">Pendiente Taller 03</span>
            </div>
            <div class="future-card">
              <h4>Agent v3 &bull; State & Memory</h4>
              <p>Inspección de <code>ExecutionState</code>, recuerdos de <code>MemoryStore</code> y bloque de hidratación.</p>
              <span class="locked-badge">Pendiente Taller 04</span>
            </div>
            <div class="future-card">
              <h4>Agent v4 &bull; Planning</h4>
              <p>Grafo DAG de <code>PlanStep</code>, ejecutores (TOOL, RUNTIME, MODEL) y snapshots de replanning.</p>
              <span class="locked-badge">Pendiente Taller 05</span>
            </div>
            <div class="future-card">
              <h4>Agent v5 &bull; Guardrails & HITL</h4>
              <p>Compuerta humana, decisión de política y validación criptográfica SHA-256 de <code>ActionProposal</code>.</p>
              <span class="locked-badge">Pendiente Taller 06</span>
            </div>
            <div class="future-card">
              <h4>Agent v6 &bull; Observability</h4>
              <p>Árbol de trazas estructuradas con <code>sequence_no</code> monotónico y evaluación de dataset golden.</p>
              <span class="locked-badge">Pendiente Taller 07</span>
            </div>
          </div>
        }
      </div>
    </aside>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    .inspector-card {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      min-width: 0;
      background: #0b1329;
      border-left: 1px solid #1e293b;
      color: #f8fafc;
      overflow: hidden;
      box-sizing: border-box;
    }
    .inspector-header {
      padding: 0.85rem 1rem 0.4rem 1rem;
      border-bottom: 1px solid #1e293b;
      background: #0f172a;
      flex-shrink: 0;
      min-width: 0;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }
    .title-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .title-meta h2 {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f1f5f9;
      margin: 0;
    }
    .version-tag {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      color: #34d399;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }
    .mode-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .live-pill, .replay-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 12px;
      letter-spacing: 0.04em;
    }
    .live-pill {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .live-pill.paused {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.4);
      color: #fbbf24;
    }
    .replay-pill {
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.4);
      color: #c084fc;
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
      animation: pulseLive 1.2s infinite alternate;
    }
    .live-pill.paused .pulse-dot {
      background: #fbbf24;
      box-shadow: 0 0 6px #fbbf24;
      animation: none;
    }
    @keyframes pulseLive {
      from { transform: scale(0.8); opacity: 0.6; }
      to { transform: scale(1.3); opacity: 1; }
    }
    .btn-pause-visual, .btn-switch-replay, .btn-switch-live {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.25rem 0.6rem;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-pause-visual:hover, .btn-switch-replay:hover, .btn-switch-live:hover {
      background: #334155;
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .btn-pause-visual.is-paused {
      background: rgba(245, 158, 11, 0.2);
      border-color: #f59e0b;
      color: #fbbf24;
    }

    .replay-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #090d16;
      border: 1px solid rgba(168, 85, 247, 0.25);
      border-radius: 6px;
      padding: 0.35rem 0.65rem;
      margin-bottom: 0.5rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .transport-controls {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .btn-tool {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.15s ease;
    }
    .btn-tool:hover {
      background: #334155;
      border-color: #a78bfa;
      color: #a78bfa;
    }
    .btn-play-pause {
      background: #7c3aed;
      border-color: #a78bfa;
      color: #ffffff;
      font-weight: 700;
    }
    .speed-selector {
      display: flex;
      background: #1e293b;
      border-radius: 4px;
      padding: 2px;
      border: 1px solid #334155;
    }
    .btn-speed {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 0.65rem;
      font-weight: 600;
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      cursor: pointer;
    }
    .btn-speed.active {
      background: #6d28d9;
      color: #ffffff;
      font-weight: 700;
    }
    .step-indicator {
      font-size: 0.7rem;
      font-weight: 700;
      color: #c084fc;
    }

    .tabs-bar {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      min-width: 0;
    }
    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #94a3b8;
      font-size: 0.76rem;
      font-weight: 600;
      padding: 0.4rem 0.6rem;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .tab-btn:hover {
      color: #f1f5f9;
    }
    .tab-btn.active {
      color: #38bdf8;
      border-bottom-color: #38bdf8;
    }
    .future-tab {
      color: #a78bfa;
    }

    .inspector-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 1rem;
      box-sizing: border-box;
      min-width: 0;
      width: 100%;
    }

    .journey-dashboard {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      min-width: 0;
      width: 100%;
    }
    .avatar-hero-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-width: 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }
    .avatar-container {
      width: 100%;
      height: 140px;
      min-width: 0;
    }
    .journey-flow-wrapper {
      width: 100%;
      min-width: 0;
      border-top: 1px solid #1e293b;
      padding-top: 0.4rem;
    }

    .step-detail-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 1rem;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
      transition: border-color 0.25s ease;
    }
    .step-detail-card.active {
      border-color: #38bdf8;
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.2);
    }
    .step-detail-card.completed {
      border-color: rgba(16, 185, 129, 0.5);
    }
    .step-detail-card.skipped {
      border-color: #475569;
      opacity: 0.85;
    }
    .step-detail-card.failed {
      border-color: #ef4444;
    }

    .card-headline {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.65rem;
      flex-wrap: wrap;
      min-width: 0;
    }
    .headline-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .hop-chip {
      background: #0284c7;
      color: #ffffff;
      font-size: 0.68rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }
    .step-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: #f1f5f9;
      margin: 0;
      word-break: break-word;
    }
    .status-pill {
      font-size: 0.64rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-pill.completed { background: #064e3b; color: #34d399; }
    .status-pill.active { background: #0369a1; color: #bae6fd; }
    .status-pill.skipped { background: #334155; color: #cbd5e1; }
    .status-pill.failed { background: #7f1d1d; color: #fca5a5; }
    .status-pill.idle { background: #1e293b; color: #64748b; }

    .actor-bar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: #1e293b;
      padding: 0.4rem 0.65rem;
      border-radius: 6px;
      margin-bottom: 0.85rem;
      border: 1px solid #334155;
      font-size: 0.75rem;
      min-width: 0;
      flex-wrap: wrap;
    }
    .actor-label {
      color: #94a3b8;
      font-weight: 500;
    }
    .actor-value {
      color: #38bdf8;
      font-weight: 700;
      word-break: break-word;
    }

    .explanation-box {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin-bottom: 0.85rem;
    }
    .section-title {
      font-size: 0.74rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin: 0.4rem 0 0.15rem 0;
    }
    .insight-title {
      color: #34d399;
    }
    .explanation-text, .insight-text {
      margin: 0;
      font-size: 0.82rem;
      line-height: 1.45;
      color: #e2e8f0;
      word-break: break-word;
    }
    .insight-text {
      color: #bae6fd;
    }

    .tech-disclosure {
      margin-top: 0.5rem;
      border-top: 1px dashed #334155;
      padding-top: 0.5rem;
      min-width: 0;
    }
    .disclosure-toggle {
      width: 100%;
      background: transparent;
      border: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #38bdf8;
      font-size: 0.76rem;
      font-weight: 600;
      padding: 0.35rem 0;
      cursor: pointer;
      transition: color 0.2s ease;
    }
    .disclosure-toggle:hover {
      color: #7dd3fc;
    }
    .disclosure-badge {
      font-size: 0.65rem;
      color: #64748b;
      font-family: monospace;
    }
    .technical-viewer-wrapper {
      margin-top: 0.5rem;
      min-width: 0;
      max-width: 100%;
    }

    .journey-empty-state {
      text-align: center;
      padding: 2.5rem 1rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px dashed #334155;
      border-radius: 10px;
    }
    .journey-empty-state .empty-icon {
      font-size: 2rem;
      display: block;
      margin-bottom: 0.5rem;
    }
    .journey-empty-state h3 {
      font-size: 0.95rem;
      color: #38bdf8;
      margin: 0 0 0.4rem 0;
    }
    .journey-empty-state p {
      font-size: 0.78rem;
      color: #94a3b8;
      line-height: 1.4;
      margin: 0;
    }

    .raw-events-list {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      min-width: 0;
    }
    .raw-event-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.75rem;
      min-width: 0;
    }
    .event-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.35rem;
    }
    .event-type-badge {
      background: #0284c7;
      color: #ffffff;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }
    .event-time {
      font-size: 0.68rem;
      color: #94a3b8;
    }
    .event-hop-badge {
      font-size: 0.74rem;
      color: #34d399;
      font-weight: 600;
      margin-bottom: 0.35rem;
    }
    .json-wrapper {
      min-width: 0;
    }

    .no-events {
      font-size: 0.8rem;
      color: #64748b;
      text-align: center;
      padding: 2rem 0;
    }

    .future-workshops-grid {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .future-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 0.9rem;
    }
    .future-card h4 {
      font-size: 0.86rem;
      color: #c084fc;
      margin: 0 0 0.35rem 0;
    }
    .future-card p {
      font-size: 0.76rem;
      color: #94a3b8;
      margin: 0 0 0.5rem 0;
      line-height: 1.4;
    }
    .locked-badge {
      display: inline-block;
      font-size: 0.68rem;
      color: #a78bfa;
      background: rgba(167, 139, 250, 0.12);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      border: 1px solid rgba(167, 139, 250, 0.3);
    }
  `]
})
export class RuntimeInspectorComponent {
  readonly events = input<StreamEvent[]>([]);
  readonly activeAgentId = input<string>('v1');

  readonly eventStore = inject(EventStoreService);
  readonly controller = inject(PresentationControllerService);

  readonly activeTab = signal<'journey' | 'events' | 'future'>('journey');
  readonly isTechOpen = signal<boolean>(false);

  readonly journey = this.eventStore.journey;
}
