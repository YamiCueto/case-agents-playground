import { Component, input, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamEvent } from '../../models/agent.models';
import { EventStoreService } from '../../services/event-store.service';
import { PresentationControllerService, PlaybackSpeed } from '../../services/presentation-controller.service';
import { AgentAvatar3DComponent } from './avatar-3d/agent-avatar-3d.component';
import { JourneyFlowComponent } from './journey-flow/journey-flow.component';
import { V2LoopFlowComponent } from './v2-loop-flow/v2-loop-flow.component';
import { TechnicalViewerComponent } from './technical-viewer/technical-viewer.component';

@Component({
  selector: 'app-runtime-inspector',
  standalone: true,
  imports: [
    CommonModule,
    AgentAvatar3DComponent,
    JourneyFlowComponent,
    V2LoopFlowComponent,
    TechnicalViewerComponent
  ],
  template: `
    <aside class="inspector-card">
      <header class="inspector-header">
        <div class="title-row">
          <div class="title-meta">
            <svg class="title-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <h2>Runtime Inspector</h2>
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
                title="Pausar o reanudar el seguimiento visual en pantalla sin detener la ejecución en backend"
                aria-label="Alternar pausa visual"
              >
                {{ controller.isVisualPaused() ? 'Reanudar ▶' : 'Pausar ⏸' }}
              </button>
              @if (journey().status === 'completed' || v2Execution().status === 'completed' || events().length > 0) {
                <button
                  type="button"
                  class="btn-switch-replay"
                  (click)="controller.startReplayMode()"
                  title="Activar modo de reproducción interactiva paso a paso"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>Replay</span>
                </button>
              }
            } @else {
              <div class="replay-pill">
                <span class="pulse-dot-purple"></span>
                <span>MODO REPLAY</span>
              </div>
              <button
                type="button"
                class="btn-switch-live"
                (click)="controller.setMode('live')"
                title="Regresar al modo de seguimiento en vivo"
              >
                <span>Volver a Live</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 14 4 9 9 4"></polyline>
                  <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                </svg>
              </button>
            }
          </div>
        </div>

        @if (controller.mode() === 'replay') {
          <div class="replay-toolbar" role="toolbar" aria-label="Controles de reproducción histórica">
            <div class="transport-controls">
              <button
                type="button"
                class="btn-tool"
                (click)="controller.resetReplay()"
                title="Reiniciar reproducción desde el primer paso"
                aria-label="Reiniciar"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
              </button>
              <button
                type="button"
                class="btn-tool"
                (click)="controller.stepBackward()"
                title="Paso anterior"
                aria-label="Paso anterior"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="19 20 9 12 19 4 19 20"></polygon>
                  <line x1="5" y1="12" x2="5" y2="5"></line>
                </svg>
              </button>
              <button
                type="button"
                class="btn-tool btn-play-pause"
                (click)="controller.togglePlayPauseReplay()"
                [title]="controller.isPlayingReplay() ? 'Pausar reproducción' : 'Reproducir automáticamente'"
                [attr.aria-label]="controller.isPlayingReplay() ? 'Pausar' : 'Reproducir'"
              >
                @if (controller.isPlayingReplay()) {
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                } @else {
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                }
              </button>
              <button
                type="button"
                class="btn-tool"
                (click)="controller.stepForward()"
                title="Paso siguiente"
                aria-label="Paso siguiente"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 4 15 12 5 20 5 4"></polygon>
                  <line x1="19" y1="5" x2="19" y2="19"></line>
                </svg>
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
              @if (activeAgentId() === 'v2') {
                Iteración {{ controller.selectedIterationIndex() }} &bull; Fase {{ controller.selectedPhaseIndex() + 1 }}
              } @else {
                Hop {{ (controller.activeStep()?.hopNumber || 1) }} / 7
              }
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
            <svg class="tab-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <span>{{ activeAgentId() === 'v2' ? 'Agent Loop Journey' : 'Execution Journey' }}</span>
          </button>
          <button 
            class="tab-btn" 
            role="tab"
            [class.active]="activeTab() === 'events'" 
            (click)="activeTab.set('events')"
          >
            <svg class="tab-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            <span>Eventos Raw ({{ events().length }})</span>
          </button>
          <button 
            class="tab-btn future-tab" 
            role="tab"
            [class.active]="activeTab() === 'future'" 
            (click)="activeTab.set('future')"
          >
            <svg class="tab-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="12 6 12 12 16 14"></polygon>
            </svg>
            <span>Hoja de Ruta v3..v6</span>
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
                  [targetHop]="activeAgentId() === 'v2' ? (controller.selectedPhaseIndex() + 1) : (controller.activeStep()?.hopNumber || 1)"
                ></app-agent-avatar-3d>
              </div>

              @if (activeAgentId() === 'v2') {
                <div class="loop-flow-wrapper">
                  <app-v2-loop-flow
                    [iterations]="v2Execution().iterations"
                    [selectedIterationIndex]="controller.selectedIterationIndex()"
                    [selectedPhaseIndex]="controller.selectedPhaseIndex()"
                    (iterationClick)="controller.selectV2Iteration($event)"
                    (phaseClick)="controller.selectV2Phase($event)"
                  ></app-v2-loop-flow>
                </div>
              } @else {
                <div class="journey-flow-wrapper">
                  <app-journey-flow
                    [steps]="journey().steps"
                    [selectedHopNumber]="controller.activeStep()?.hopNumber || 1"
                    (stepClick)="controller.selectStep($event)"
                  ></app-journey-flow>
                </div>
              }
            </section>

            @if (activeAgentId() === 'v2') {
              @if (controller.activeV2Phase(); as phase) {
                <article class="step-detail-card" [ngClass]="phase.status">
                  <div class="card-headline">
                    <div class="headline-left">
                      <span class="hop-chip">FASE {{ controller.selectedPhaseIndex() + 1 }}</span>
                      <h3 class="step-title">{{ phase.title }}</h3>
                    </div>
                    <span class="status-pill {{ phase.status }}">{{ phase.status | uppercase }}</span>
                  </div>

                  <div class="actor-bar">
                    <svg class="actor-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                      <rect x="9" y="9" width="6" height="6"></rect>
                      <line x1="9" y1="1" x2="9" y2="4"></line>
                      <line x1="15" y1="1" x2="15" y2="4"></line>
                      <line x1="9" y1="20" x2="9" y2="23"></line>
                      <line x1="15" y1="20" x2="15" y2="23"></line>
                      <line x1="20" y1="9" x2="23" y2="9"></line>
                      <line x1="20" y1="14" x2="23" y2="14"></line>
                      <line x1="1" y1="9" x2="4" y2="9"></line>
                      <line x1="1" y1="14" x2="4" y2="14"></line>
                    </svg>
                    <span class="actor-label">Componente Soberano:</span>
                    <span class="actor-value">{{ phase.actor }}</span>
                  </div>

                  <div class="pedagogical-grid">
                    <div class="pedagogical-item">
                      <div class="item-header">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                        <span class="item-title">Qué está ocurriendo</span>
                      </div>
                      <p class="item-body">{{ phase.description }}</p>
                    </div>

                    <div class="pedagogical-item insight-item">
                      <div class="item-header insight-header">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                        <span class="item-title">Por qué importa (Arquitectura Agéntica Loop)</span>
                      </div>
                      <p class="item-body">{{ phase.pedagogicalInsight }}</p>
                    </div>
                  </div>

                  @if (phase.tools && phase.tools.length > 0) {
                    <div class="v2-tools-section">
                      <div class="tools-section-title">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                          <polyline points="2 17 12 22 22 17"></polyline>
                          <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                        <span>Herramientas Involucradas ({{ phase.tools.length }})</span>
                      </div>

                      @for (tool of phase.tools; track tool.toolCallId) {
                        <div class="tool-item-card">
                          <div class="tool-item-header">
                            <span class="tool-item-name">{{ tool.toolName }}</span>
                            <span class="tool-item-id">{{ tool.toolCallId }}</span>
                          </div>

                          <div class="tool-meta-row">
                            @if (tool.executionStatus) {
                              <span class="tool-status-badge {{ tool.executionStatus }}">
                                Estado: {{ tool.executionStatus | uppercase }}
                              </span>
                            }
                            @if (tool.durationMs) {
                              <span>Duración: {{ tool.durationMs }}ms</span>
                            }
                            @if (tool.isMutative) {
                              <span class="mutative-tag">MUTATIVA</span>
                            }
                            @if (tool.idempotencyHit) {
                              <span class="idempotent-tag">IDEMPOTENCIA HIT</span>
                            }
                          </div>

                          <div class="tool-detail-group">
                            <span class="detail-group-label">Argumentos Validados:</span>
                            <pre class="json-inline-viewer">{{ tool.arguments | json }}</pre>
                          </div>

                          @if (tool.observation) {
                            <div class="tool-detail-group">
                              <span class="detail-group-label">Observación Obtenida (MySQL):</span>
                              <pre class="json-inline-viewer">{{ tool.observation | json }}</pre>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }

                  <div class="tech-disclosure">
                    <button
                      type="button"
                      class="disclosure-toggle"
                      (click)="isTechOpen.set(!isTechOpen())"
                      [attr.aria-expanded]="isTechOpen()"
                    >
                      <div class="disclosure-left">
                        <svg class="chevron-icon" [class.rotated]="isTechOpen()" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <span>{{ isTechOpen() ? 'Ocultar Evidencia Técnica' : 'Inspeccionar Evidencia Técnica (JSON)' }}</span>
                      </div>
                      <span class="disclosure-badge">{{ phase.phaseType | uppercase }}</span>
                    </button>

                    @if (isTechOpen()) {
                      <div class="technical-viewer-wrapper">
                        <app-technical-viewer [payload]="phase.payload || phase"></app-technical-viewer>
                      </div>
                    }
                  </div>
                </article>
              } @else {
                <div class="journey-empty-state">
                  <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <h3>Esperando Ejecución del Agent Loop</h3>
                  <p>Inicia una consulta en el chat para observar las dimensiones macro y micro de Agent v2 en tiempo real.</p>
                </div>
              }
            } @else {
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
                    <svg class="actor-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                      <rect x="9" y="9" width="6" height="6"></rect>
                      <line x1="9" y1="1" x2="9" y2="4"></line>
                      <line x1="15" y1="1" x2="15" y2="4"></line>
                      <line x1="9" y1="20" x2="9" y2="23"></line>
                      <line x1="15" y1="20" x2="15" y2="23"></line>
                      <line x1="20" y1="9" x2="23" y2="9"></line>
                      <line x1="20" y1="14" x2="23" y2="14"></line>
                      <line x1="1" y1="9" x2="4" y2="9"></line>
                      <line x1="1" y1="14" x2="4" y2="14"></line>
                    </svg>
                    <span class="actor-label">Componente Soberano:</span>
                    <span class="actor-value">{{ step.actor }}</span>
                  </div>

                  <div class="pedagogical-grid">
                    <div class="pedagogical-item">
                      <div class="item-header">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                        <span class="item-title">Qué está ocurriendo</span>
                      </div>
                      <p class="item-body">{{ step.description }}</p>
                    </div>

                    <div class="pedagogical-item insight-item">
                      <div class="item-header insight-header">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                        <span class="item-title">Por qué importa (Arquitectura Agéntica)</span>
                      </div>
                      <p class="item-body">{{ step.pedagogicalInsight }}</p>
                    </div>
                  </div>

                  <div class="tech-disclosure">
                    <button
                      type="button"
                      class="disclosure-toggle"
                      (click)="isTechOpen.set(!isTechOpen())"
                      [attr.aria-expanded]="isTechOpen()"
                    >
                      <div class="disclosure-left">
                        <svg class="chevron-icon" [class.rotated]="isTechOpen()" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <span>{{ isTechOpen() ? 'Ocultar Evidencia Técnica' : 'Inspeccionar Evidencia Técnica (JSON)' }}</span>
                      </div>
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
                  <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <h3>Esperando Ejecución Agéntica</h3>
                  <p>Escribe una consulta en el chat para observar el encadenamiento de hops en tiempo real con su componente responsable.</p>
                </div>
              }
            }
          </div>
        } @else if (activeTab() === 'events') {
          <div class="raw-events-list">
            @if (events().length === 0) {
              <p class="no-events">No se han registrado eventos SSE en este turno.</p>
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
                  @if (evt.iteration_index) {
                    <div class="event-hop-badge">
                      Iteración {{ evt.iteration_index }} &bull; Fase: {{ evt.phase }}
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
            <div class="future-card active-card">
              <div class="future-card-header">
                <h4>Agent v2 &bull; Agent Loop</h4>
                <span class="active-badge">Operativo (Taller 03)</span>
              </div>
              <p>Bucle iterativo con control de max_iterations, circuit breaker y decisiones dependientes multi-step.</p>
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
              <p>Compuerta humana, decisión de política y validación criptográfica de <code>ActionProposal</code>.</p>
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
      background: var(--bg-surface);
      border-left: 1px solid var(--border-subtle);
      color: var(--text-primary);
      overflow: hidden;
      box-sizing: border-box;
    }
    .inspector-header {
      padding: 0.75rem 1rem 0.35rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-panel);
      flex-shrink: 0;
      min-width: 0;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.45rem;
    }
    .title-meta {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .title-icon {
      color: var(--accent-cyan);
    }
    .title-meta h2 {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }
    .version-tag {
      background: var(--accent-emerald-bg);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: var(--accent-emerald);
      font-size: 0.65rem;
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 0.1rem 0.35rem;
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
      font-size: 0.64rem;
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 0.2rem 0.5rem;
      border-radius: 12px;
      letter-spacing: 0.04em;
    }
    .live-pill {
      background: var(--accent-emerald-bg);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: var(--accent-emerald);
    }
    .live-pill.paused {
      background: var(--accent-amber-bg);
      border-color: rgba(245, 158, 11, 0.4);
      color: var(--accent-amber);
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
      background: var(--accent-emerald);
      box-shadow: 0 0 6px var(--accent-emerald);
      animation: pulseLive 1.2s infinite alternate;
    }
    .live-pill.paused .pulse-dot {
      background: var(--accent-amber);
      box-shadow: 0 0 6px var(--accent-amber);
      animation: none;
    }
    .pulse-dot-purple {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #c084fc;
      box-shadow: 0 0 6px #c084fc;
    }
    @keyframes pulseLive {
      from { transform: scale(0.8); opacity: 0.6; }
      to { transform: scale(1.3); opacity: 1; }
    }
    .btn-pause-visual, .btn-switch-replay, .btn-switch-live {
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.25rem 0.55rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: var(--transition-fast);
    }
    .btn-pause-visual:hover, .btn-switch-replay:hover, .btn-switch-live:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }
    .btn-pause-visual.is-paused {
      background: var(--accent-amber-bg);
      border-color: var(--accent-amber);
      color: var(--accent-amber);
    }

    .replay-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #090d16;
      border: 1px solid rgba(168, 85, 247, 0.25);
      border-radius: var(--radius-sm);
      padding: 0.3rem 0.6rem;
      margin-bottom: 0.45rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .transport-controls {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .btn-tool {
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      width: 26px;
      height: 26px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-tool:hover {
      background: var(--bg-card-hover);
      border-color: #a78bfa;
      color: #a78bfa;
    }
    .btn-play-pause {
      background: #7c3aed;
      border-color: #a78bfa;
      color: #ffffff;
    }
    .speed-selector {
      display: flex;
      background: var(--bg-card);
      border-radius: 4px;
      padding: 2px;
      border: 1px solid var(--border-default);
    }
    .btn-speed {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.64rem;
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
      font-size: 0.68rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: #c084fc;
    }

    .tabs-bar {
      display: flex;
      gap: 0.4rem;
      overflow-x: auto;
      min-width: 0;
    }
    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      font-size: 0.74rem;
      font-weight: 600;
      padding: 0.35rem 0.55rem;
      cursor: pointer;
      transition: var(--transition-fast);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .tab-btn:hover {
      color: var(--text-primary);
    }
    .tab-btn.active {
      color: var(--accent-cyan);
      border-bottom-color: var(--accent-cyan);
    }
    .future-tab {
      color: #a78bfa;
    }

    .inspector-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0.85rem;
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
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.65rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      min-width: 0;
    }
    .avatar-container {
      width: 100%;
      height: 160px;
      min-width: 0;
    }
    .journey-flow-wrapper, .loop-flow-wrapper {
      width: 100%;
      min-width: 0;
      border-top: 1px solid var(--border-subtle);
      padding-top: 0.35rem;
    }

    .step-detail-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.85rem;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
      transition: border-color 0.2s ease;
    }
    .step-detail-card.active, .step-detail-card.running {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.15);
    }
    .step-detail-card.completed {
      border-color: rgba(16, 185, 129, 0.4);
    }
    .step-detail-card.skipped {
      border-color: var(--border-default);
      opacity: 0.85;
    }
    .step-detail-card.failed {
      border-color: var(--accent-crimson);
    }
    .step-detail-card.timeout {
      border-color: var(--accent-amber);
    }

    .card-headline {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.55rem;
      flex-wrap: wrap;
      min-width: 0;
    }
    .headline-left {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
    }
    .hop-chip {
      background: #0284c7;
      color: #ffffff;
      font-size: 0.65rem;
      font-weight: 800;
      font-family: var(--font-mono);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }
    .step-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
      word-break: break-word;
    }
    .status-pill {
      font-size: 0.62rem;
      font-weight: 800;
      font-family: var(--font-mono);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-pill.completed { background: #064e3b; color: #34d399; }
    .status-pill.active, .status-pill.running { background: #0369a1; color: #bae6fd; }
    .status-pill.skipped { background: #334155; color: #cbd5e1; }
    .status-pill.failed { background: #7f1d1d; color: #fca5a5; }
    .status-pill.timeout { background: #78350f; color: #fde68a; }
    .status-pill.idle { background: #1e293b; color: #64748b; }

    .actor-bar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--bg-card);
      padding: 0.35rem 0.6rem;
      border-radius: var(--radius-sm);
      margin-bottom: 0.75rem;
      border: 1px solid var(--border-subtle);
      font-size: 0.74rem;
      min-width: 0;
      flex-wrap: wrap;
    }
    .actor-icon {
      color: var(--accent-cyan);
    }
    .actor-label {
      color: var(--text-secondary);
      font-weight: 500;
    }
    .actor-value {
      color: var(--accent-cyan);
      font-weight: 700;
      word-break: break-word;
    }

    .pedagogical-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 0.85rem;
    }
    .pedagogical-item {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-left: 3px solid var(--accent-cyan);
      border-radius: var(--radius-sm);
      padding: 0.75rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .pedagogical-item.insight-item {
      border-left-color: var(--accent-emerald);
      border-color: rgba(16, 185, 129, 0.3);
      background: rgba(16, 185, 129, 0.04);
    }
    .item-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--accent-cyan);
    }
    .insight-header {
      color: var(--accent-emerald);
    }
    .item-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: var(--font-mono);
    }
    .item-body {
      margin: 0;
      font-size: 0.84rem;
      line-height: 1.55;
      color: var(--text-primary);
      word-break: break-word;
    }
    .insight-item .item-body {
      color: #e2e8f0;
    }

    .v2-tools-section {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      margin-bottom: 0.85rem;
    }
    .tools-section-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .tool-item-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.65rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .tool-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .tool-item-name {
      font-size: 0.82rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--accent-emerald);
    }
    .tool-item-id {
      font-size: 0.64rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .tool-meta-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.68rem;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      flex-wrap: wrap;
    }
    .tool-status-badge {
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-weight: 700;
    }
    .tool-status-badge.success { background: #064e3b; color: #34d399; }
    .tool-status-badge.error, .tool-status-badge.failed { background: #7f1d1d; color: #fca5a5; }
    .mutative-tag {
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent-amber);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-weight: 700;
    }
    .idempotent-tag {
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-cyan);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-weight: 700;
    }
    .tool-detail-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .detail-group-label {
      font-size: 0.64rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }
    .json-inline-viewer {
      background: #020617;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xs);
      padding: 0.45rem;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: #e2e8f0;
      overflow-x: auto;
      max-height: 180px;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .tech-disclosure {
      margin-top: 0.45rem;
      border-top: 1px dashed var(--border-default);
      padding-top: 0.45rem;
      min-width: 0;
    }
    .disclosure-toggle {
      width: 100%;
      background: transparent;
      border: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--accent-cyan);
      font-size: 0.74rem;
      font-weight: 600;
      padding: 0.3rem 0;
      cursor: pointer;
      transition: color 0.15s ease;
    }
    .disclosure-toggle:hover {
      color: var(--accent-cyan-hover);
    }
    .disclosure-left {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .chevron-icon {
      transition: transform 0.2s ease;
    }
    .chevron-icon.rotated {
      transform: rotate(90deg);
    }
    .disclosure-badge {
      font-size: 0.64rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .technical-viewer-wrapper {
      margin-top: 0.45rem;
      min-width: 0;
      max-width: 100%;
    }

    .journey-empty-state {
      text-align: center;
      padding: 2.25rem 1rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
    }
    .journey-empty-state .empty-icon {
      color: var(--accent-cyan);
      margin-bottom: 0.25rem;
    }
    .journey-empty-state h3 {
      font-size: 0.92rem;
      color: var(--accent-cyan);
      margin: 0;
    }
    .journey-empty-state p {
      font-size: 0.78rem;
      color: var(--text-secondary);
      line-height: 1.4;
      margin: 0;
      max-width: 380px;
    }

    .raw-events-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-width: 0;
    }
    .raw-event-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.65rem;
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
      font-size: 0.66rem;
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }
    .event-time {
      font-size: 0.66rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .event-hop-badge {
      font-size: 0.72rem;
      color: var(--accent-emerald);
      font-weight: 600;
      margin-bottom: 0.35rem;
    }
    .json-wrapper {
      min-width: 0;
    }
    .no-events {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-align: center;
      padding: 2rem 0;
    }

    .future-workshops-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .future-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.85rem;
    }
    .future-card.active-card {
      border-color: rgba(16, 185, 129, 0.4);
      background: rgba(16, 185, 129, 0.05);
    }
    .future-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.3rem;
    }
    .future-card h4 {
      font-size: 0.84rem;
      color: #c084fc;
      margin: 0;
    }
    .active-card h4 {
      color: var(--accent-emerald);
    }
    .future-card p {
      font-size: 0.76rem;
      color: var(--text-secondary);
      margin: 0 0 0.45rem 0;
      line-height: 1.4;
    }
    .active-badge {
      font-size: 0.66rem;
      color: var(--accent-emerald);
      background: var(--accent-emerald-bg);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      border: 1px solid rgba(16, 185, 129, 0.3);
      font-weight: 700;
    }
    .locked-badge {
      display: inline-block;
      font-size: 0.66rem;
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
  readonly v2Execution = this.eventStore.v2Execution;
}
