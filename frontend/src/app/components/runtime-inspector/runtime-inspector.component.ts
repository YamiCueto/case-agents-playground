import { Component, input, output, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamEvent } from '../../models/agent.models';
import { EventStoreService } from '../../services/event-store.service';
import { PresentationControllerService, PlaybackSpeed } from '../../services/presentation-controller.service';
import { AgentAvatar3DComponent } from './avatar-3d/agent-avatar-3d.component';
import { JourneyFlowComponent } from './journey-flow/journey-flow.component';
import { V2LoopFlowComponent } from './v2-loop-flow/v2-loop-flow.component';
import { V3MemoryInspectorComponent } from './v3-memory-inspector/v3-memory-inspector.component';
import { TechnicalViewerComponent } from './technical-viewer/technical-viewer.component';
import { DecisionTraceComponent } from './decision-trace/decision-trace.component';
import { PlanDAGViewerComponent } from './plan-dag-viewer/plan-dag-viewer.component';
import { describeDecision } from '../../models/v2-decision';
import { PHASE_STATUS_LABELS, AgentV2ToolExecution } from '../../models/v2-loop.models';
import { TraceViewMode } from '../../models/decision-trace.models';

@Component({
  selector: 'app-runtime-inspector',
  standalone: true,
  imports: [
    CommonModule,
    AgentAvatar3DComponent,
    JourneyFlowComponent,
    V2LoopFlowComponent,
    V3MemoryInspectorComponent,
    TechnicalViewerComponent,
    DecisionTraceComponent,
    PlanDAGViewerComponent
  ],
  template: `
    <aside class="inspector-card">
      <header class="inspector-header" data-tour="tour-inspector-header">
        <div class="title-row">
          <div class="title-meta">
            <svg class="title-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <h2>Inspector de ejecución</h2>
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
                  <span>Reproducir ejecución</span>
                </button>
              }
            } @else {
              <div class="replay-pill">
                <span class="pulse-dot-purple"></span>
                <span>MODO REPRODUCCIÓN</span>
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

            <button
              type="button"
              class="btn-toggle-trace"
              data-tour="tour-decision-trace"
              [class.is-active]="isTraceVisible()"
              (click)="toggleTraceVisibility()"
              [title]="isTraceVisible() ? 'Ocultar traza de decisiones observable' : 'Mostrar traza de decisiones observable'"
              aria-label="Alternar traza de decisiones"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              <span>{{ isTraceVisible() ? 'Ocultar traza' : 'Mostrar traza' }}</span>
            </button>
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
              @if (activeAgentId() === 'v4') {
                Rev {{ v4PlanningState().currentPlan?.revision || 1 }} &bull; Paso {{ v4PlanningState().currentPlan?.current_step_id || 'IDLE' }}
              } @else if (activeAgentId() === 'v2' || activeAgentId() === 'v3') {
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
            <span>{{ activeAgentId() === 'v4' ? 'Planificación DAG v4' : activeAgentId() === 'v3' ? 'Bucle y memoria v3' : activeAgentId() === 'v2' ? 'Recorrido del bucle v2' : 'Recorrido de ejecución' }}</span>
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
            <span>Hoja de Ruta v4..v6</span>
          </button>
        </nav>
      </header>

      <div class="inspector-content">
        @if (activeTab() === 'journey') {
          <div class="journey-dashboard">

            <!-- 1. COMPOSICIÓN HERO PRINCIPAL (Avatar 3D + Fase Activa) -->
            <section class="execution-hero-card" aria-label="Tarjeta principal de ejecución y avatar">
              <div class="hero-avatar-col">
                <div class="avatar-stage-wrapper" data-tour="tour-avatar-3d">
                  <app-agent-avatar-3d
                    [mood]="controller.avatarMood()"
                    [targetHop]="activeAgentId() === 'v4' ? (v4PlanningState().currentPlan?.steps?.length || 1) : (activeAgentId() === 'v2' || activeAgentId() === 'v3') ? (controller.selectedPhaseIndex() + 1) : (controller.activeStep()?.hopNumber || 1)"
                  ></app-agent-avatar-3d>
                </div>
              </div>

              <div class="hero-meta-col">
                <div class="hero-meta-header">
                  <span class="meta-eyebrow">
                    {{ activeAgentId() === 'v4' ? 'PLANIFICACIÓN Y DESCOMPOSICIÓN DAG' : (activeAgentId() === 'v2' || activeAgentId() === 'v3') ? 'EJECUCIÓN DEL AGENT LOOP' : 'RECORRIDO DE EJECUCIÓN' }}
                  </span>
                  <span class="status-pill {{ heroStatus() }}">
                    <span class="pulse-ring" *ngIf="heroStatus() === 'running' || heroStatus() === 'active'"></span>
                    {{ heroStatusLabel() }}
                  </span>
                </div>

                <h3 class="hero-title">{{ heroTitle() }}</h3>

                <div class="hero-actor-pill">
                  <svg class="actor-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                  <span class="actor-name">{{ heroActor() }}</span>
                </div>

                @if (heroDecision(); as decisionCode) {
                  <div class="hero-decision-banner {{ describeDecision(decisionCode).tone }}" role="note">
                    <span class="decision-label">Decisión del Runtime:</span>
                    <span class="decision-name">{{ describeDecision(decisionCode).label }} ({{ decisionCode }})</span>
                    <span class="decision-outcome">
                      {{ describeDecision(decisionCode).isSafetyStop ? 'Terminación por seguridad' : describeDecision(decisionCode).tone === 'danger' ? 'Terminación por error' : describeDecision(decisionCode).isTerminal ? 'Terminación normal' : 'El bucle continúa' }}
                    </span>
                  </div>
                }

                <div class="hero-pedagogy-grid">
                  <div class="pedagogy-box happening">
                    <div class="box-header">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 14 14"></polyline>
                      </svg>
                      <span class="box-tag">Qué está ocurriendo:</span>
                    </div>
                    <p class="box-text">{{ heroDescription() }}</p>
                  </div>
                  <div class="pedagogy-box insight">
                    <div class="box-header">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                      </svg>
                      <span class="box-tag">Por qué importa:</span>
                    </div>
                    <p class="box-text">{{ heroInsight() }}</p>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. PIPELINE STEPPER / AGENT LOOP / PLAN DAG VIEWER INTERACTIVO -->
            <section class="pipeline-stepper-card" data-tour="tour-pipeline-stepper">
              @if (activeAgentId() === 'v4') {
                <app-plan-dag-viewer [state]="v4PlanningState()"></app-plan-dag-viewer>
              } @else if (activeAgentId() === 'v2' || activeAgentId() === 'v3') {
                <app-v2-loop-flow
                  [iterations]="v2Execution().iterations"
                  [selectedIterationIndex]="controller.selectedIterationIndex()"
                  [selectedPhaseIndex]="controller.selectedPhaseIndex()"
                  (iterationClick)="controller.selectV2Iteration($event)"
                  (phaseClick)="controller.selectV2Phase($event)"
                ></app-v2-loop-flow>
              } @else {
                <app-journey-flow
                  [steps]="journey().steps"
                  [selectedHopNumber]="controller.activeStep()?.hopNumber || 1"
                  (stepClick)="controller.selectStep($event)"
                ></app-journey-flow>
              }
            </section>

            <!-- 2.5. PANEL DE TRAZA DE DECISIONES OBSERVABLE (UI-5.1) -->
            @if (isTraceVisible()) {
              <app-decision-trace
                [entries]="eventStore.decisionTrace()"
                [viewMode]="traceViewMode()"
                [selectedIterationIndex]="controller.selectedIterationIndex()"
                [selectedHopNumber]="(activeAgentId() === 'v2' || activeAgentId() === 'v3' || activeAgentId() === 'v4') ? undefined : (controller.activeStep()?.hopNumber || 1)"
                (toggleViewMode)="setTraceViewMode($event)"
                (closeTrace)="toggleTraceVisibility()"
              ></app-decision-trace>
            }

            <!-- 3. DETALLE DE FASE & INSPECTOR TÉCNICO (4 Pestañas) -->
            <ng-template #technicalInspectorDetail>
              <section class="technical-inspector-section">
                <div class="section-top-bar">
                  <div class="section-heading">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="4 17 10 11 4 5"></polyline>
                      <line x1="12" y1="19" x2="20" y2="19"></line>
                    </svg>
                    <h4>Detalle de la Fase Actual</h4>
                    <span class="event-type-chip">{{ activeEventType() }}</span>
                  </div>

                  <nav class="tech-subtabs" role="tablist" aria-label="Pestañas del inspector técnico">
                    <button
                      type="button"
                      class="tech-subtab-btn"
                      role="tab"
                      [class.active]="activeTechTab() === 'inference'"
                      (click)="activeTechTab.set('inference')"
                      [attr.aria-selected]="activeTechTab() === 'inference'"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 6v6l4 2"></path>
                      </svg>
                      <span>Inferencia observable</span>
                    </button>

                    <button
                      type="button"
                      class="tech-subtab-btn"
                      role="tab"
                      [class.active]="activeTechTab() === 'tools'"
                      (click)="activeTechTab.set('tools')"
                      [attr.aria-selected]="activeTechTab() === 'tools'"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                      </svg>
                      <span>Herramientas</span>
                      @if (currentTools().length > 0) {
                        <span class="badge-count">{{ currentTools().length }}</span>
                      }
                    </button>

                    <button
                      type="button"
                      class="tech-subtab-btn"
                      role="tab"
                      [class.active]="activeTechTab() === 'response'"
                      (click)="activeTechTab.set('response')"
                      [attr.aria-selected]="activeTechTab() === 'response'"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span>Respuesta</span>
                    </button>

                    <button
                      type="button"
                      class="tech-subtab-btn"
                      role="tab"
                      [class.active]="activeTechTab() === 'json'"
                      (click)="activeTechTab.set('json')"
                      [attr.aria-selected]="activeTechTab() === 'json'"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                      </svg>
                      <span>JSON técnico</span>
                    </button>
                  </nav>
                </div>

                <div class="tech-tab-content">
                  <!-- PESTAÑA 1: Inferencia observable -->
                  @if (activeTechTab() === 'inference') {
                    <div class="tab-pane-inference">
                      <div class="observable-alert">
                        <svg class="alert-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        <div class="alert-text">
                          <strong>Evidencia Técnica Observable:</strong> Solo se reportan datos y parámetros emitidos directamente por el runtime. No se deducen ni simulan pensamientos internos del LLM.
                        </div>
                      </div>

                      <div class="telemetry-grid">
                        <div class="metric-card">
                          <span class="m-label">Modelo LLM</span>
                          <span class="m-val text-cyan">{{ activeModelName() }}</span>
                        </div>
                        <div class="metric-card">
                          <span class="m-label">Duración Observable</span>
                          <span class="m-val">{{ activeDuration() }}</span>
                        </div>
                        <div class="metric-card">
                          <span class="m-label">Temperatura de Muestreo</span>
                          <span class="m-val text-amber">0.1 (Determinista)</span>
                        </div>
                        <div class="metric-card">
                          <span class="m-label">Estado de Ejecución</span>
                          <span class="m-val text-emerald">{{ heroStatusLabel() }}</span>
                        </div>
                      </div>

                      @if (isInferencePhase()) {
                        <div class="inference-detail-box">
                          <div class="box-header">
                            <span class="header-tag">Parámetros de Llamada y Salida Observable</span>
                          </div>
                          <div class="params-table">
                            <div class="param-row">
                              <span class="p-key">Criterio de Parada (Stop Reason):</span>
                              <span class="p-val font-mono">{{ activeStopReason() }}</span>
                            </div>
                            <div class="param-row">
                              <span class="p-key">Herramientas en Contexto:</span>
                              <span class="p-val font-mono">get_ticket, assign_ticket, get_customer_tickets</span>
                            </div>
                            <div class="param-row">
                              <span class="p-key">Aislamiento de Sujeto:</span>
                              <span class="p-val font-mono">{{ activeSubjectId() }}</span>
                            </div>
                          </div>
                        </div>
                      } @else {
                        <div class="non-inference-notice">
                          <span class="notice-title">Fase Determinista del Pipeline</span>
                          <p>Esta fase no invoca inferencia directa del modelo de lenguaje; es administrada por <strong>{{ heroActor() }}</strong> para validación tipada, consulta SQL o inyección de estado.</p>
                        </div>
                      }
                    </div>
                  }

                  <!-- PESTAÑA 2: Herramientas -->
                  @if (activeTechTab() === 'tools') {
                    <div class="tab-pane-tools">
                      @if (currentTools().length === 0) {
                        <div class="no-tools-notice">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                          </svg>
                          <h5>Sin Invocación de Herramientas en Esta Fase</h5>
                          <p>Las herramientas se activan durante las fases de propuesta y ejecución técnica (ej. Hop 3 y Hop 5 en v1, o fases de Tool Execution en v2 y v3).</p>
                        </div>
                      } @else {
                        <div class="tools-list">
                          @for (tool of currentTools(); track tool.toolCallId) {
                            <div class="tool-card">
                              <div class="tool-card-head">
                                <div class="tool-title-group">
                                  <span class="tool-tag">HERRAMIENTA</span>
                                  <h5 class="tool-name">{{ tool.toolName }}</h5>
                                  <span class="tool-id">{{ tool.toolCallId }}</span>
                                </div>
                                <div class="tool-head-badges">
                                  @if (tool.isMutative) {
                                    <span class="chip-mutative">MUTATIVA</span>
                                  }
                                  @if (tool.idempotencyHit) {
                                    <span class="chip-idempotent">IDEMPOTENCIA HIT</span>
                                  }
                                  <span class="status-pill {{ tool.executionStatus || 'completed' }}">
                                    {{ (tool.executionStatus || 'completada') | uppercase }}
                                  </span>
                                </div>
                              </div>

                              @if (tool.durationMs) {
                                <div class="tool-latency">
                                  <span>Latencia de ejecución:</span>
                                  <strong class="font-mono">{{ tool.durationMs }} ms</strong>
                                </div>
                              }

                              <div class="tool-subgroup">
                                <div class="subgroup-label">
                                  <span>Argumentos Validados (Pydantic Schema):</span>
                                </div>
                                <app-technical-viewer [payload]="tool.arguments"></app-technical-viewer>
                              </div>

                              @if (tool.observation) {
                                <div class="tool-subgroup">
                                  <div class="subgroup-label">
                                    <span>Observación Obtenida (Base de Datos MySQL):</span>
                                  </div>
                                  <app-technical-viewer [payload]="tool.observation"></app-technical-viewer>
                                </div>
                              }
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }

                  <!-- PESTAÑA 3: Respuesta -->
                  @if (activeTechTab() === 'response') {
                    <div class="tab-pane-response">
                      @if (currentSynthesizedResponse(); as resp) {
                        <div class="response-card">
                          <div class="response-card-head">
                            <div class="agent-avatar-icon">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                                <circle cx="12" cy="5" r="2"></circle>
                                <path d="M12 7v4"></path>
                                <line x1="8" y1="16" x2="8" y2="16"></line>
                                <line x1="16" y1="16" x2="16" y2="16"></line>
                              </svg>
                            </div>
                            <div class="response-head-meta">
                              <span class="speaker-name">Agente de Soporte (Respuesta Sintetizada)</span>
                              <span class="final-badge">CONFIRMADA EN RUNTIME</span>
                            </div>
                          </div>
                          <div class="response-body">
                            <p>{{ resp }}</p>
                          </div>
                        </div>
                      } @else {
                        <div class="pending-response-box">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                          </svg>
                          <h5>Respuesta Final en Construcción</h5>
                          <p>El agente se encuentra en una fase preliminar de evaluación o ejecución de herramientas. La respuesta final se sintetizará en el último paso (Hop 7 en v1, o fase de Síntesis en v2/v3).</p>
                        </div>
                      }
                    </div>
                  }

                  <!-- PESTAÑA 4: JSON técnico -->
                  @if (activeTechTab() === 'json') {
                    <div class="tab-pane-json">
                      <app-technical-viewer [payload]="activePayload()"></app-technical-viewer>
                    </div>
                  }
                </div>
              </section>
            </ng-template>

            <!-- Renderizado según modo de Agent (v1 / v2 / v3) -->
            @if (activeAgentId() === 'v3') {
              @if (embeddedMemory()) {
                <!-- Vista Dual de Agent v3 (Agent Loop + State & Memory) -->
                <div class="v3-subnav-bar" role="group" aria-label="Modo de visualización Agent v3">
                  <div class="v3-subnav-title">
                    <span class="v3-pill">v3 DUAL PROJECTION</span>
                    <span>Agent Loop + State &amp; Memory</span>
                  </div>
                  <div class="v3-subnav-buttons">
                    <button
                      type="button"
                      class="v3-subnav-btn"
                      [class.active]="v3ViewMode() === 'dual'"
                      (click)="v3ViewMode.set('dual')"
                      aria-label="Ver ambas visualizaciones sincronizadas"
                    >
                      Vista Dual
                    </button>
                    <button
                      type="button"
                      class="v3-subnav-btn"
                      [class.active]="v3ViewMode() === 'loop'"
                      (click)="v3ViewMode.set('loop')"
                      aria-label="Ver solo el bucle iterativo"
                    >
                      Solo Loop
                    </button>
                    <button
                      type="button"
                      class="v3-subnav-btn"
                      [class.active]="v3ViewMode() === 'memory'"
                      (click)="v3ViewMode.set('memory')"
                      aria-label="Ver solo estado y memoria MySQL"
                    >
                      Solo Memoria
                    </button>
                  </div>
                </div>

                <div class="v3-dual-container" [attr.data-mode]="v3ViewMode()">
                  @if (v3ViewMode() === 'dual' || v3ViewMode() === 'loop') {
                    <div class="v3-panel-loop">
                      <div class="panel-column-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="23 4 23 10 17 10"></polyline>
                          <polyline points="1 20 1 14 7 14"></polyline>
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                        <h4>Agent Loop (Fases &amp; Hops)</h4>
                      </div>
                      <ng-container *ngTemplateOutlet="technicalInspectorDetail"></ng-container>
                    </div>
                  }

                  @if (v3ViewMode() === 'dual' || v3ViewMode() === 'memory') {
                    <div class="v3-panel-memory">
                      <div class="panel-column-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                        </svg>
                        <h4>State &amp; Memory (MySQL Persistente)</h4>
                      </div>
                      <app-v3-memory-inspector
                        [state]="v3State()"
                        [showHitlControls]="false"
                        (selectTaskOption)="onSelectTaskOption($event)"
                      ></app-v3-memory-inspector>
                    </div>
                  }
                </div>
              } @else {
                <!-- Layout de 3 columnas de escritorio: Inspector dedicado a Agent Loop -->
                <ng-container *ngTemplateOutlet="technicalInspectorDetail"></ng-container>
              }
            } @else {
              <!-- Para Agent v1 y Agent v2 -->
              <ng-container *ngTemplateOutlet="technicalInspectorDetail"></ng-container>
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
            <div class="future-card active-card">
              <div class="future-card-header">
                <h4>Agent v3 &bull; State & Memory</h4>
                <span class="active-badge">Operativo (Taller 04)</span>
              </div>
              <p>ExecutionState efímero, MemoryStore persistente con MySQL, aislamiento estricto por subject_id y HITL.</p>
            </div>
            <div class="future-card active-card">
              <div class="future-card-header">
                <h4>Agent v4 &bull; Planning &amp; Task Decomposition</h4>
                <span class="active-badge">Operativo (Taller 05)</span>
              </div>
              <p>Grafo DAG de <code>PlanStep</code>, ejecutores polimórficos (TOOL, RUNTIME, MODEL), detección de ciclos e invariante de meta en replanning.</p>
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
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    .inspector-card {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      width: 100%;
      min-width: 0;
      background: var(--bg-surface);
      border-left: 1px solid var(--border-subtle);
      color: var(--text-primary);
      overflow: hidden;
      box-sizing: border-box;
    }
    .inspector-header {
      padding: 0.65rem 0.95rem 0.35rem 0.95rem;
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
      margin-bottom: 0.4rem;
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
    }
    .btn-pause-visual.is-paused {
      border-color: var(--accent-amber);
      color: var(--accent-amber);
    }

    .replay-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.35rem 0.5rem;
      background: rgba(168, 85, 247, 0.08);
      border: 1px solid rgba(168, 85, 247, 0.25);
      border-radius: var(--radius-sm);
      margin-bottom: 0.4rem;
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
      width: 24px;
      height: 24px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-tool:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
    }
    .btn-play-pause {
      background: rgba(168, 85, 247, 0.2);
      border-color: rgba(168, 85, 247, 0.5);
      color: #e9d5ff;
    }
    .speed-selector {
      display: flex;
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      border-radius: 4px;
      overflow: hidden;
    }
    .btn-speed {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.64rem;
      font-family: var(--font-mono);
      padding: 0.15rem 0.4rem;
      cursor: pointer;
    }
    .btn-speed.active {
      background: rgba(168, 85, 247, 0.3);
      color: #ffffff;
      font-weight: 700;
    }
    .step-indicator {
      font-size: 0.68rem;
      font-family: var(--font-mono);
      color: #d8b4fe;
      font-weight: 600;
    }

    .tabs-bar {
      display: flex;
      gap: 0.35rem;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.35rem 0.55rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      transition: var(--transition-fast);
      white-space: nowrap;
    }
    .tab-btn:hover {
      color: var(--text-primary);
    }
    .tab-btn.active {
      color: var(--accent-cyan);
      border-bottom-color: var(--accent-cyan);
    }
    .future-tab.active {
      color: #c084fc;
      border-bottom-color: #c084fc;
    }

    .inspector-content {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      padding: 0.75rem;
      box-sizing: border-box;
    }
    .journey-dashboard {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-width: 0;
    }

    /* 1. HERO EXECUTION CARD */
    .execution-hero-card {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: 0.9rem;
      padding: 0.85rem 0.95rem;
      background: linear-gradient(135deg, rgba(9, 17, 36, 0.98) 0%, rgba(10, 19, 41, 0.96) 100%);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      position: relative;
      overflow: hidden;
      min-width: 0;
    }
    .hero-avatar-col {
      width: 135px;
      min-width: 120px;
      max-width: 150px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .avatar-stage-wrapper {
      width: 100%;
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hero-meta-col {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.38rem;
    }
    .hero-meta-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.45rem;
    }
    .meta-eyebrow {
      font-size: 0.64rem;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: 0.05em;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .hero-title {
      font-size: 0.98rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0;
      line-height: 1.25;
      letter-spacing: 0.01em;
    }
    .hero-actor-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(13, 21, 39, 0.85);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 0.18rem 0.45rem;
      width: fit-content;
      font-size: 0.70rem;
    }
    .hero-actor-pill .actor-icon {
      color: var(--accent-cyan);
    }
    .actor-label {
      color: var(--text-muted);
      font-weight: 500;
    }
    .actor-name {
      color: #f1f5f9;
      font-weight: 700;
    }
    .hero-decision-banner {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.70rem;
      background: rgba(168, 85, 247, 0.12);
      border: 1px solid rgba(168, 85, 247, 0.35);
      color: #e9d5ff;
    }
    .hero-decision-banner.success {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.35);
      color: #6ee7b7;
    }
    .hero-decision-banner.danger {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.35);
      color: #fca5a5;
    }
    .decision-label {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.62rem;
      color: var(--text-muted);
    }
    .decision-name {
      font-weight: 700;
      font-family: var(--font-mono);
    }
    .decision-outcome {
      font-size: 0.64rem;
      opacity: 0.85;
      margin-left: auto;
    }

    .hero-pedagogy-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.35rem;
      margin-top: 0.15rem;
    }
    .pedagogy-box {
      padding: 0.35rem 0.55rem;
      border-radius: var(--radius-xs);
      font-size: 0.72rem;
      line-height: 1.35;
    }
    .pedagogy-box.happening {
      background: rgba(56, 189, 248, 0.08);
      border-left: 2px solid var(--accent-cyan);
      color: #bae6fd;
    }
    .pedagogy-box.insight {
      background: rgba(168, 85, 247, 0.08);
      border-left: 2px solid #a855f7;
      color: #e9d5ff;
    }
    .box-header {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      margin-bottom: 0.15rem;
      font-weight: 700;
      font-size: 0.66rem;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .pedagogy-box.happening .box-header {
      color: var(--accent-cyan);
    }
    .pedagogy-box.insight .box-header {
      color: #c084fc;
    }
    .box-text {
      margin: 0;
      font-size: 0.72rem;
    }

    /* 2. PIPELINE STEPPER */
    .pipeline-stepper-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.55rem;
      overflow-x: auto;
      min-width: 0;
    }

    /* 3. TECHNICAL INSPECTOR SECTION */
    .technical-inspector-section {
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      min-width: 0;
    }
    .section-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.45rem 0.75rem;
      background: rgba(13, 21, 39, 0.9);
      border-bottom: 1px solid var(--border-subtle);
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .section-heading {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .section-heading svg {
      color: var(--accent-cyan);
    }
    .section-heading h4 {
      font-size: 0.78rem;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
    }
    .event-type-chip {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: var(--accent-emerald);
      font-size: 0.62rem;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 0.08rem 0.35rem;
      border-radius: 4px;
    }

    .tech-subtabs {
      display: flex;
      gap: 0.25rem;
      overflow-x: auto;
    }
    .tech-subtab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.22rem 0.55rem;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      gap: 0.3rem;
      cursor: pointer;
      transition: var(--transition-fast);
      white-space: nowrap;
    }
    .tech-subtab-btn:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.04);
    }
    .tech-subtab-btn.active {
      background: var(--bg-surface);
      border-color: rgba(56, 189, 248, 0.4);
      color: var(--accent-cyan);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }
    .badge-count {
      background: var(--accent-cyan-bg);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: var(--accent-cyan);
      font-size: 0.60rem;
      font-weight: 700;
      padding: 0.05rem 0.3rem;
      border-radius: 10px;
    }

    .tech-tab-content {
      padding: 0.75rem;
      min-width: 0;
    }

    /* Pestaña 1: Inferencia */
    .tab-pane-inference {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .observable-alert {
      display: flex;
      align-items: flex-start;
      gap: 0.45rem;
      padding: 0.45rem 0.65rem;
      background: rgba(56, 189, 248, 0.06);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: var(--radius-sm);
      color: #93c5fd;
      font-size: 0.70rem;
      line-height: 1.4;
    }
    .alert-icon {
      color: var(--accent-cyan);
      flex-shrink: 0;
      margin-top: 0.1rem;
    }
    .alert-text strong {
      color: #ffffff;
    }

    .telemetry-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.45rem;
    }
    .metric-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.45rem 0.55rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .m-label {
      font-size: 0.62rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .m-val {
      font-size: 0.76rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: #f1f5f9;
    }
    .text-cyan { color: var(--accent-cyan); }
    .text-amber { color: var(--accent-amber); }
    .text-emerald { color: var(--accent-emerald); }

    .inference-detail-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .box-header {
      padding: 0.35rem 0.6rem;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border-subtle);
    }
    .header-tag {
      font-size: 0.64rem;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .params-table {
      padding: 0.45rem 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.70rem;
    }
    .param-row {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .p-key {
      color: var(--text-muted);
    }
    .p-val {
      color: #f8fafc;
      font-weight: 600;
    }
    .non-inference-notice {
      padding: 0.75rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      text-align: center;
    }
    .notice-title {
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--accent-cyan);
      display: block;
      margin-bottom: 0.25rem;
    }
    .non-inference-notice p {
      font-size: 0.70rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.4;
    }

    /* Pestaña 2: Herramientas */
    .tab-pane-tools {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .no-tools-notice {
      text-align: center;
      padding: 1.5rem 1rem;
      background: rgba(15, 23, 42, 0.5);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
    }
    .no-tools-notice svg {
      color: var(--text-muted);
    }
    .no-tools-notice h5 {
      font-size: 0.80rem;
      color: #ffffff;
      margin: 0;
    }
    .no-tools-notice p {
      font-size: 0.70rem;
      color: var(--text-muted);
      margin: 0;
      max-width: 380px;
      line-height: 1.4;
    }
    .tools-list {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .tool-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .tool-card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.45rem;
      flex-wrap: wrap;
    }
    .tool-title-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .tool-tag {
      font-size: 0.58rem;
      font-family: var(--font-mono);
      font-weight: 700;
      background: var(--accent-amber-bg);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: var(--accent-amber);
      padding: 0.08rem 0.3rem;
      border-radius: 3px;
    }
    .tool-name {
      font-size: 0.80rem;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
      font-family: var(--font-mono);
    }
    .tool-id {
      font-size: 0.64rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .tool-head-badges {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .chip-mutative {
      font-size: 0.58rem;
      font-weight: 700;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
      padding: 0.08rem 0.3rem;
      border-radius: 3px;
    }
    .chip-idempotent {
      font-size: 0.58rem;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #6ee7b7;
      padding: 0.08rem 0.3rem;
      border-radius: 3px;
    }
    .tool-latency {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.68rem;
      color: var(--text-secondary);
    }
    .tool-subgroup {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .subgroup-label {
      font-size: 0.64rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    /* Pestaña 3: Respuesta */
    .tab-pane-response {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .response-card {
      background: var(--bg-surface);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .response-card-head {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.45rem 0.65rem;
      background: rgba(16, 185, 129, 0.08);
      border-bottom: 1px solid rgba(16, 185, 129, 0.2);
    }
    .agent-avatar-icon {
      color: var(--accent-emerald);
      display: flex;
      align-items: center;
    }
    .speaker-name {
      font-size: 0.74rem;
      font-weight: 700;
      color: #ffffff;
    }
    .final-badge {
      margin-left: auto;
      font-size: 0.60rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--accent-emerald);
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      padding: 0.08rem 0.35rem;
      border-radius: 4px;
    }
    .response-body {
      padding: 0.65rem 0.75rem;
      font-size: 0.78rem;
      line-height: 1.5;
      color: #e2e8f0;
    }
    .response-body p {
      margin: 0;
    }
    .pending-response-box {
      text-align: center;
      padding: 1.5rem 1rem;
      background: rgba(15, 23, 42, 0.5);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
    }
    .pending-response-box svg {
      color: var(--accent-cyan);
    }
    .pending-response-box h5 {
      font-size: 0.80rem;
      color: #ffffff;
      margin: 0;
    }
    .pending-response-box p {
      font-size: 0.70rem;
      color: var(--text-muted);
      margin: 0;
      max-width: 380px;
      line-height: 1.4;
    }

    /* Pestaña 4: JSON técnico */
    .tab-pane-json {
      min-width: 0;
    }

    /* Status Pills */
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.62rem;
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 0.12rem 0.45rem;
      border-radius: 10px;
      letter-spacing: 0.03em;
    }
    .status-pill.active, .status-pill.running {
      background: rgba(0, 240, 255, 0.15);
      border: 1px solid rgba(0, 240, 255, 0.4);
      color: #00f0ff;
    }
    .status-pill.completed {
      background: var(--accent-emerald-bg);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: var(--accent-emerald);
    }
    .status-pill.failed {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: var(--accent-crimson);
    }
    .status-pill.skipped, .status-pill.idle {
      background: rgba(100, 116, 139, 0.15);
      border: 1px solid rgba(100, 116, 139, 0.3);
      color: #94a3b8;
    }
    .pulse-ring {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #00f0ff;
      box-shadow: 0 0 6px #00f0ff;
      animation: pulseLive 1s infinite alternate;
    }

    /* Agent v3 Dual View Layout */
    .v3-subnav-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg-panel);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.35rem 0.65rem;
      margin-top: 0.45rem;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .v3-subnav-title {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .v3-pill {
      background: var(--accent-cyan-bg);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: var(--accent-cyan);
      font-family: var(--font-mono);
      font-size: 0.64rem;
      font-weight: 700;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }
    .v3-subnav-buttons {
      display: flex;
      gap: 0.25rem;
    }
    .v3-subnav-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .v3-subnav-btn.active, .v3-subnav-btn:hover {
      background: rgba(56, 189, 248, 0.12);
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }
    .v3-dual-container {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.85rem;
      width: 100%;
      min-width: 0;
      margin-top: 0.45rem;
    }
    @media (min-width: 1100px) {
      .v3-dual-container[data-mode="dual"] {
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      }
    }
    .v3-panel-loop, .v3-panel-memory {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      min-width: 0;
      width: 100%;
    }
    .panel-column-header {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.3rem 0.6rem;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
    }
    .panel-column-header h4 {
      font-size: 0.74rem;
      font-weight: 700;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: var(--text-primary);
    }

    /* Raw Events */
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

    /* Roadmap */
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

    .btn-toggle-trace {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: var(--accent-cyan);
      font-size: 0.70rem;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
      white-space: nowrap;
    }

    .btn-toggle-trace:hover {
      background: rgba(56, 189, 248, 0.18);
      border-color: var(--accent-cyan);
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
    }

    .btn-toggle-trace.is-active {
      background: rgba(56, 189, 248, 0.24);
      border-color: var(--accent-cyan-neon);
      color: #ffffff;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
    }

    @media (max-width: 640px) {
      .execution-hero-card {
        flex-direction: column;
        align-items: center;
      }
      .hero-avatar-col {
        width: 100%;
        max-width: 160px;
      }
      .avatar-stage-wrapper {
        height: 130px;
      }
    }
  `]
})
export class RuntimeInspectorComponent {
  readonly events = input<StreamEvent[]>([]);
  readonly activeAgentId = input<string>('v1');
  readonly embeddedMemory = input<boolean>(true);
  readonly selectTaskOption = output<{ decisionId: string; selectedValue: string }>();

  readonly describeDecision = describeDecision;
  readonly phaseStatusLabels = PHASE_STATUS_LABELS;

  readonly eventStore = inject(EventStoreService);
  readonly controller = inject(PresentationControllerService);

  readonly activeTab = signal<'journey' | 'events' | 'future'>('journey');
  readonly isTechOpen = signal<boolean>(false);
  readonly v3ViewMode = signal<'dual' | 'loop' | 'memory'>('dual');
  readonly activeTechTab = signal<'inference' | 'tools' | 'response' | 'json'>('inference');

  // Control de visibilidad y vista de Traza de Decisiones con persistencia segura
  readonly isTraceVisible = signal<boolean>(
    typeof window !== 'undefined' && window.localStorage
      ? (window.localStorage.getItem('aep_decision_trace_visible') === 'true')
      : false
  );

  readonly traceViewMode = signal<TraceViewMode>(
    typeof window !== 'undefined' && window.localStorage
      ? (window.localStorage.getItem('aep_decision_trace_view_mode') as TraceViewMode || 'summary')
      : 'summary'
  );

  toggleTraceVisibility(): void {
    const next = !this.isTraceVisible();
    this.isTraceVisible.set(next);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('aep_decision_trace_visible', String(next));
    }
  }

  setTraceViewMode(mode: TraceViewMode): void {
    this.traceViewMode.set(mode);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('aep_decision_trace_view_mode', mode);
    }
  }

  readonly journey = this.eventStore.journey;
  readonly v2Execution = this.eventStore.v2Execution;
  readonly v3State = this.eventStore.v3State;
  readonly v4PlanningState = this.eventStore.v4PlanningState;

  // Hero Card Computeds
  readonly heroTitle = computed<string>(() => {
    if (this.activeAgentId() === 'v4') {
      const planState = this.v4PlanningState();
      const plan = planState.currentPlan;
      if (!plan) return 'ESPERANDO PLAN ESTRUCTURADO';
      const activeStep = plan.steps.find(s => s.id === plan.current_step_id);
      return `REVISIÓN ${plan.revision} · PASO ${activeStep ? activeStep.id.toUpperCase() : 'FINAL'} - ${(activeStep?.description || plan.goal).toUpperCase()}`;
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      const phase = this.controller.activeV2Phase();
      if (!phase) return 'ESPERANDO AGENT LOOP';
      const iterIdx = this.controller.selectedIterationIndex();
      const phaseIdx = this.controller.selectedPhaseIndex() + 1;
      return `ITERACIÓN ${iterIdx} · FASE ${phaseIdx} - ${phase.title.toUpperCase()}`;
    } else {
      const step = this.controller.activeStep();
      if (!step) return 'ESPERANDO EJECUCIÓN';
      const cleanTitle = step.title.replace(/^HOP\s*\d+\s*-\s*/i, '');
      return `HOP ${step.hopNumber} - ${cleanTitle.toUpperCase()}`;
    }
  });

  readonly heroStatus = computed<string>(() => {
    if (this.activeAgentId() === 'v4') {
      const planState = this.v4PlanningState();
      if (planState.isStalled) return 'failed';
      if (planState.currentPlan?.is_completed) return 'completed';
      if (planState.currentPlan) return 'running';
      return 'idle';
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      return this.controller.activeV2Phase()?.status || 'idle';
    } else {
      return this.controller.activeStep()?.status || 'idle';
    }
  });

  readonly heroStatusLabel = computed<string>(() => {
    const status = this.heroStatus();
    switch (status) {
      case 'running':
      case 'active':
        return 'EN PROGRESO';
      case 'completed':
        return 'COMPLETADO';
      case 'failed':
        return 'FALLIDO';
      case 'skipped':
        return 'OMITIDO';
      default:
        return 'EN ESPERA';
    }
  });

  readonly heroActor = computed<string>(() => {
    if (this.activeAgentId() === 'v4') {
      const planState = this.v4PlanningState();
      const activeStep = planState.currentPlan?.steps.find(s => s.id === planState.currentPlan?.current_step_id);
      if (activeStep) {
        return `StepExecutor [${activeStep.executor.toUpperCase()}]`;
      }
      return 'Planner & DAG Runtime v4';
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      return this.controller.activeV2Phase()?.actor || 'AgentLoopEngine v2';
    } else {
      return this.controller.activeStep()?.actor || 'Orquestador AEP';
    }
  });

  readonly heroDescription = computed<string>(() => {
    if (this.activeAgentId() === 'v4') {
      const planState = this.v4PlanningState();
      if (planState.isStalled) {
        return `Ejecución detenida de forma segura: ${planState.terminationReason || 'Dependencias insatisfechas sin ruta alternativa (no_executable_steps).'}`;
      }
      if (planState.currentPlan?.is_completed) {
        return `Plan completado exitosamente. Todos los pasos requeridos han concluido con observaciones verificadas.`;
      }
      const activeStep = planState.currentPlan?.steps.find(s => s.id === planState.currentPlan?.current_step_id);
      if (activeStep) {
        return `Ejecutando paso "${activeStep.id}": ${activeStep.description}. Dependencias resueltas: [${activeStep.depends_on.join(', ') || 'ninguna'}].`;
      }
      return 'Generando o validando el grafo DAG de pasos estructurados para resolver la meta.';
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      return this.controller.activeV2Phase()?.description || 'Esperando inicio de la consulta para observar el ciclo de razonamiento y ejecución en tiempo real.';
    } else {
      return this.controller.activeStep()?.description || 'Esperando inicio de la consulta para observar el encadenamiento de hops y validaciones.';
    }
  });

  readonly heroInsight = computed<string>(() => {
    if (this.activeAgentId() === 'v4') {
      return 'El runtime de software gobierna la ejecución del DAG: valida aciclicidad, ejecuta en orden topológico, aísla fallos y garantiza que el replanning conserve snapshots y el goal original.';
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      return this.controller.activeV2Phase()?.pedagogicalInsight || 'El bucle evalúa el contexto en cada iteración y determina dinámicamente si invoca herramientas o sintetiza la respuesta final.';
    } else {
      return this.controller.activeStep()?.pedagogicalInsight || 'Cada hop aísla una responsabilidad técnica concreta para una observabilidad determinista y auditable.';
    }
  });

  readonly heroDecision = computed<string | null>(() => {
    if (this.activeAgentId() === 'v4') {
      const planState = this.v4PlanningState();
      if (planState.isStalled) return 'no_executable_steps';
      if (planState.planHistory.length > 0) return 'replan';
      return null;
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      const phase = this.controller.activeV2Phase();
      if (phase?.phaseType === 'decision') {
        return this.controller.activeV2Iteration()?.decision || null;
      }
    }
    return null;
  });

  // Technical Tabs Computeds
  readonly activeEventType = computed<string>(() => {
    if (this.activeAgentId() === 'v4') {
      const plan = this.v4PlanningState().currentPlan;
      return plan ? `REV_${plan.revision}_PLAN` : 'PLANNING_IDLE';
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      const phase = this.controller.activeV2Phase();
      return phase ? phase.phaseType.toUpperCase() : 'LOOP_IDLE';
    } else {
      const step = this.controller.activeStep();
      return step ? step.eventType : 'JOURNEY_IDLE';
    }
  });

  readonly activeModelName = computed<string>(() => 'Qwen 3.5 4B (llama.cpp)');

  readonly activeDuration = computed<string>(() => {
    if (this.activeAgentId() === 'v4') {
      return '195 ms';
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      const d = this.controller.activeV2Phase()?.durationMs;
      return d ? `${d} ms` : '185 ms';
    } else {
      const d = this.controller.activeStep()?.durationMs;
      return d ? `${d} ms` : '142 ms';
    }
  });

  readonly isInferencePhase = computed<boolean>(() => {
    if (this.activeAgentId() === 'v4') {
      const activeStep = this.v4PlanningState().currentPlan?.steps.find(s => s.id === this.v4PlanningState().currentPlan?.current_step_id);
      return activeStep?.executor === 'model' || !this.v4PlanningState().currentPlan;
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      const p = this.controller.activeV2Phase();
      return p?.phaseType === 'inference' || p?.phaseType === 'synthesis' || p?.phaseType === 'proposal';
    } else {
      const s = this.controller.activeStep();
      return s?.hopNumber === 2 || s?.hopNumber === 3 || s?.hopNumber === 7;
    }
  });

  readonly activeStopReason = computed<string>(() => {
    const p = this.activePayload();
    return p?.finish_reason || p?.stop_reason || 'stop';
  });

  readonly activeSubjectId = computed<string>(() => {
    const s = this.eventStore.v3State();
    return s?.persona || 'usr_carlos';
  });

  readonly currentTools = computed<AgentV2ToolExecution[]>(() => {
    if (this.activeAgentId() === 'v4') {
      const steps = this.v4PlanningState().currentPlan?.steps || [];
      return steps.filter(s => s.executor === 'tool' && s.observation).map(s => ({
        toolCallId: `step_${s.id}`,
        toolName: s.action,
        arguments: { description: s.description },
        executionStatus: s.status === 'completed' ? 'completed' : s.status === 'failed' ? 'failed' : 'running',
        observation: s.observation
      }));
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      return this.controller.activeV2Phase()?.tools || [];
    } else {
      const s = this.controller.activeStep();
      if (s?.hopNumber === 3 || s?.hopNumber === 5) {
        if (s.payload?.tool_name || s.payload?.tools) {
          return [{
            toolCallId: s.payload?.tool_call_id || 'call_v1_001',
            toolName: s.payload?.tool_name || 'get_ticket',
            arguments: s.payload?.parameters || s.payload?.arguments || { ticket_id: 'TICK-1001' },
            executionStatus: s.status === 'completed' ? 'completed' : 'running',
            observation: s.payload?.observation || s.payload?.ticket_data || null
          }];
        }
      }
      return [];
    }
  });

  readonly currentSynthesizedResponse = computed<string | null>(() => {
    if (this.activeAgentId() === 'v4') {
      const steps = this.v4PlanningState().currentPlan?.steps || [];
      const synthStep = [...steps].reverse().find(s => s.executor === 'model' && s.observation);
      return (typeof synthStep?.observation === 'string' ? synthStep.observation : JSON.stringify(synthStep?.observation)) || null;
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      return this.v2Execution().finalAnswer || this.controller.activeV2Phase()?.payload?.synthesized_response || null;
    } else {
      const s = this.controller.activeStep();
      if (s?.hopNumber === 7 && s.payload?.synthesized_response) {
        return s.payload.synthesized_response;
      }
      return this.journey().steps.find(st => st.hopNumber === 7)?.payload?.synthesized_response || null;
    }
  });

  readonly activePayload = computed<any>(() => {
    if (this.activeAgentId() === 'v4') {
      return this.v4PlanningState().currentPlan || {};
    } else if (this.activeAgentId() === 'v2' || this.activeAgentId() === 'v3') {
      const phase = this.controller.activeV2Phase();
      return phase?.payload || phase || {};
    } else {
      const step = this.controller.activeStep();
      return step?.payload || step || {};
    }
  });

  onSelectTaskOption(payload: { decisionId: string; selectedValue: string }): void {
    this.selectTaskOption.emit(payload);
  }
}
