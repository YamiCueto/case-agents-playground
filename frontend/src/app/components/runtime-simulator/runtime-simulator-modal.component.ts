import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { SimulatorProjectionService } from '../../services/simulator-projection.service';
import { PresentationControllerService, PlaybackSpeed } from '../../services/presentation-controller.service';
import {
  NodeExecutionState,
  SIMULATOR_NODES,
  SimulatorEdgeConfig,
  SimulatorNodeConfig,
  SimulatorNodeId
} from '../../models/simulator.models';

interface Node3DObject {
  config: SimulatorNodeConfig;
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  labelSprite: THREE.Sprite;
}

interface Edge3DObject {
  config: SimulatorEdgeConfig;
  curve: THREE.QuadraticBezierCurve3;
  lineMesh: THREE.Line;
}

@Component({
  selector: 'app-runtime-simulator-modal',
  standalone: true,
  imports: [CommonModule, MarkdownPipe],
  template: `
    @if (sim.isOpen()) {
      <div
        class="simulator-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Simulador del Runtime de Agentes"
        (click)="onBackdropClick($event)"
      >
        <div
          class="simulator-window"
          [class.fullscreen]="sim.isFullscreen()"
          (click)="$event.stopPropagation()"
        >
          <!-- Cabecera del Simulador -->
          <header class="simulator-header">
            <div class="header-left">
              <div class="header-badge">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                  <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
                <span>SIMULADOR 3D</span>
              </div>
              <div class="header-titles">
                <h2>Simulador del Runtime de Agentes</h2>
                <div class="header-meta-row">
                  <span class="version-tag">{{ sim.activeAgentId().toUpperCase() }}</span>
                  <span class="dot-sep">&bull;</span>
                  @if (sim.controller.mode() === 'live') {
                    <span class="status-pill live">
                      <span class="dot-live"></span>
                      <span>EN VIVO (Sincronizado)</span>
                    </span>
                  } @else {
                    <span class="status-pill replay">
                      <span class="dot-replay"></span>
                      <span>REPRODUCCIÓN HISTÓRICA</span>
                    </span>
                  }
                  @if (sim.activeEvent(); as evt) {
                    <span class="dot-sep">&bull;</span>
                    <span class="event-seq-pill">
                      Evento {{ sim.simulatorEventIndex() + 1 }} / {{ sim.totalEvents() }} [{{ evt.type }}]
                    </span>
                  }
                </div>
              </div>
            </div>

            <div class="header-actions">
              <button
                type="button"
                class="btn-header-ctrl"
                (click)="sim.toggleFullscreen()"
                [title]="sim.isFullscreen() ? 'Restaurar ventana' : 'Maximizar ventana'"
                aria-label="Alternar pantalla completa"
              >
                @if (sim.isFullscreen()) {
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="4 14 10 14 10 20"></polyline>
                    <polyline points="20 10 14 10 14 4"></polyline>
                    <line x1="14" y1="10" x2="21" y2="3"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                  </svg>
                } @else {
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <polyline points="9 21 3 21 3 15"></polyline>
                    <line x1="21" y1="3" x2="14" y2="10"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                  </svg>
                }
              </button>

              <button
                type="button"
                class="btn-close-modal"
                (click)="sim.closeSimulator()"
                title="Cerrar simulador (Esc)"
                aria-label="Cerrar modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </header>

          <!-- Cuerpo Principal (Split Responsivo) -->
          <div class="simulator-body">
            <!-- Columna Izquierda: Escena Three.js / Fallback Vectorial -->
            <div class="stage-container" #stageWrapper>
              @if (hasWebGLError()) {
                <!-- Fallback 2D Vectorial cuando WebGL no está disponible -->
                <div class="fallback-2d-topology" aria-label="Topología 2D del Runtime de Agentes">
                  <div class="fallback-header">
                    <span class="badge-2d">Modo Vectorial 2D (WebGL no disponible)</span>
                  </div>
                  <div class="nodes-grid-2d">
                    @for (node of sim.topology().nodes; track node.id) {
                      <div
                        class="node-card-2d"
                        [class.active]="node.id === sim.eventMapping()?.activeNode"
                        [class.selected]="node.id === sim.selectedNode()?.id"
                        [style.borderColor]="node.colorHex"
                        (click)="sim.selectNode(node.id)"
                      >
                        <div class="node-indicator-2d" [style.background]="node.colorHex"></div>
                        <h4 class="node-title-2d">{{ node.label }}</h4>
                        <span class="node-role-2d">{{ node.id }}</span>
                      </div>
                    }
                  </div>
                </div>
              } @else {
                <canvas #canvasRef class="three-viewport" aria-label="Visualizador 3D de Grafo de Hops"></canvas>
              }

              <!-- Barra flotante de nodos interactivos (Atajos rápidos de selección) -->
              <div class="node-chips-bar" aria-label="Nodos del Runtime">
                @for (node of sim.topology().nodes; track node.id) {
                  <button
                    type="button"
                    class="node-chip"
                    [class.is-active]="node.id === sim.eventMapping()?.activeNode"
                    [class.is-selected]="node.id === sim.selectedNode()?.id"
                    [style.--chip-color]="node.colorHex"
                    (click)="sim.selectNode(node.id)"
                    [title]="'Inspeccionar nodo ' + node.label"
                  >
                    <span class="chip-dot"></span>
                    <span class="chip-text">{{ node.id }}</span>
                  </button>
                }
              </div>

              <!-- Indicador flotante de Estado Observable -->
              @if (sim.eventMapping(); as mapping) {
                <div class="active-transition-pill" [class.waiting]="mapping.nodeState === 'waiting'">
                  @if (mapping.nodeState === 'waiting') {
                    <span class="spinner-dot"></span>
                    <span>Esperando respuesta del modelo local (:8080)...</span>
                  } @else {
                    <span class="state-indicator-dot"></span>
                    <span>Fase: {{ mapping.stateBadge }}</span>
                  }
                </div>
              }
            </div>

            <!-- Columna Derecha: Inspector Pedagógico y Documentación -->
            <aside class="explanation-panel">
              <!-- Pestañas de inspección -->
              <div class="panel-tabs">
                <button
                  type="button"
                  class="panel-tab-btn"
                  [class.active]="activeTab() === 'event'"
                  (click)="activeTab.set('event')"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                  </svg>
                  <span>Evento Observable</span>
                </button>
                <button
                  type="button"
                  class="panel-tab-btn"
                  [class.active]="activeTab() === 'node'"
                  (click)="activeTab.set('node')"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <span>Nodo: {{ sim.selectedNode()?.id }}</span>
                </button>
              </div>

              <!-- Contenido: Pestaña Evento Activo -->
              @if (activeTab() === 'event') {
                <div class="panel-content event-view">
                  @if (sim.eventMapping(); as mapping) {
                    <div class="event-badge-card">
                      <div class="card-top">
                        <span class="badge-type">{{ sim.activeEvent()?.type || 'EVENTO' }}</span>
                        <span class="badge-node" [style.color]="sim.selectedNode()?.colorHex">
                          Nodo Activo: {{ mapping.activeNode }}
                        </span>
                      </div>
                      <p class="event-desc">{{ mapping.pedagogicalExplanation }}</p>
                    </div>

                    <!-- Comparativa Pedagógica: LLM vs Runtime -->
                    <div class="roles-comparison-grid">
                      <div class="role-box llm-box">
                        <div class="role-header">
                          <span class="role-icon">🤖</span>
                          <span class="role-title">Qué hizo el LLM</span>
                        </div>
                        <p class="role-text">{{ mapping.whatLLMDid }}</p>
                      </div>

                      <div class="role-box runtime-box">
                        <div class="role-header">
                          <span class="role-icon">⚙️</span>
                          <span class="role-title">Qué hizo el Runtime</span>
                        </div>
                        <p class="role-text">{{ mapping.whatRuntimeDid }}</p>
                      </div>
                    </div>

                    <!-- Datos observables del evento (Payload) -->
                    <div class="payload-box">
                      <div class="payload-header">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="16 18 22 12 16 6"></polyline>
                          <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <span>Carga Útil Observable (JSON Real)</span>
                      </div>
                      <pre class="payload-code">{{ getFormattedPayload() }}</pre>
                    </div>
                  } @else {
                    <div class="empty-state">
                      <p>No hay eventos emitidos aún en esta sesión.</p>
                      <span class="empty-hint">Envía una consulta desde el chat para observar el flujo en tiempo real.</span>
                    </div>
                  }
                </div>
              }

              <!-- Contenido: Pestaña Nodo Seleccionado & Documentación -->
              @if (activeTab() === 'node') {
                <div class="panel-content node-view">
                  @if (sim.selectedNode(); as node) {
                    <div class="node-profile-header" [style.borderLeftColor]="node.colorHex">
                      <h3 class="node-main-title">{{ node.label }}</h3>
                      <span class="node-id-chip" [style.background]="node.colorHex + '25'" [style.color]="node.colorHex">
                        {{ node.id }}
                      </span>
                    </div>

                    <div class="node-markdown-section" [innerHTML]="sim.getNodeMarkdownExcerpt(node) | markdown"></div>

                    <!-- Acceso a la documentación completa de aprendices -->
                    <div class="doc-link-card">
                      <div class="doc-meta">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                        </svg>
                        <span>Documentación Pedagógica Relacionada</span>
                      </div>
                      <button
                        type="button"
                        class="btn-open-guide-link"
                        (click)="openFullGuide.emit()"
                        title="Abrir la Guía del Aprendiz en el panel lateral"
                      >
                        Abrir {{ node.docFile }} &rarr;
                      </button>
                    </div>
                  }
                </div>
              }
            </aside>
          </div>

          <!-- Barra Inferior: Scrubber Timeline & Controles de Reproducción -->
          <footer class="simulator-footer">
            <!-- Timeline Scrubber -->
            <div class="timeline-scrubber" role="region" aria-label="Línea temporal de eventos">
              <div class="scrubber-track">
                @for (evt of sim.events(); track evt.event_id || idx; let idx = $index) {
                  <button
                    type="button"
                    class="scrubber-marker"
                    [class.active]="idx === sim.simulatorEventIndex()"
                    (click)="sim.selectEventIndex(idx)"
                    [title]="'Paso ' + (idx + 1) + ': ' + evt.type"
                  >
                    <span class="marker-dot"></span>
                    <span class="marker-label">{{ evt.type.substring(0, 10) }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Controles de Reproducción -->
            <div class="transport-bar">
              <div class="transport-group">
                <button
                  type="button"
                  class="btn-tool"
                  (click)="sim.resetEvents()"
                  title="Reiniciar al primer evento"
                  aria-label="Reiniciar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                  </svg>
                </button>

                <button
                  type="button"
                  class="btn-tool"
                  [disabled]="sim.simulatorEventIndex() <= 0"
                  (click)="sim.stepPrevEvent()"
                  title="Evento anterior (Flecha izquierda)"
                  aria-label="Paso anterior"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="19 20 9 12 19 4 19 20"></polygon>
                    <line x1="5" y1="12" x2="5" y2="5"></line>
                  </svg>
                </button>

                <button
                  type="button"
                  class="btn-tool btn-play"
                  (click)="sim.controller.togglePlayPauseReplay()"
                  [title]="sim.controller.isPlayingReplay() ? 'Pausar reproducción' : 'Reproducir automáticamente'"
                  aria-label="Reproducir o pausar"
                >
                  @if (sim.controller.isPlayingReplay()) {
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="6" y="4" width="4" height="16"></rect>
                      <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                  } @else {
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                  }
                </button>

                <button
                  type="button"
                  class="btn-tool"
                  [disabled]="sim.simulatorEventIndex() >= sim.totalEvents() - 1"
                  (click)="sim.stepNextEvent()"
                  title="Siguiente evento (Flecha derecha)"
                  aria-label="Paso siguiente"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 4 15 12 5 20 5 4"></polygon>
                    <line x1="19" y1="5" x2="19" y2="19"></line>
                  </svg>
                </button>
              </div>

              <!-- Velocidades -->
              <div class="speed-group">
                <button
                  type="button"
                  class="btn-speed"
                  [class.active]="sim.controller.playbackSpeed() === 0.5"
                  (click)="sim.controller.setPlaybackSpeed(0.5)"
                >
                  0.5x
                </button>
                <button
                  type="button"
                  class="btn-speed"
                  [class.active]="sim.controller.playbackSpeed() === 1.0"
                  (click)="sim.controller.setPlaybackSpeed(1.0)"
                >
                  1x
                </button>
                <button
                  type="button"
                  class="btn-speed"
                  [class.active]="sim.controller.playbackSpeed() === 2.0"
                  (click)="sim.controller.setPlaybackSpeed(2.0)"
                >
                  2x
                </button>
              </div>

              <!-- Volver a Live -->
              @if (sim.controller.mode() === 'replay') {
                <button
                  type="button"
                  class="btn-return-live"
                  (click)="sim.controller.setMode('live')"
                  title="Regresar al seguimiento en tiempo real"
                >
                  <span>Volver a Live &bull;</span>
                </button>
              }
            </div>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .simulator-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.78);
      backdrop-filter: blur(6px);
      z-index: 1500;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      animation: fadeInModal 0.2s ease-out;
    }

    @keyframes fadeInModal {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .simulator-window {
      width: 95vw;
      max-width: 1320px;
      height: 88vh;
      background: var(--bg-surface);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 14px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .simulator-window.fullscreen {
      width: 99vw;
      max-width: none;
      height: 98vh;
      border-radius: 6px;
    }

    /* Cabecera */
    .simulator-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 1.2rem;
      background: rgba(13, 21, 39, 0.9);
      border-bottom: 1px solid var(--border-default);
      gap: 1rem;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .header-badge {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.4);
      color: #c084fc;
      padding: 0.3rem 0.6rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.05em;
    }

    .header-titles h2 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .header-meta-row {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.7rem;
      color: var(--text-secondary);
      margin-top: 0.15rem;
    }

    .version-tag {
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-cyan);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-weight: 700;
    }

    .dot-sep {
      color: var(--text-muted);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 600;
    }

    .status-pill.live {
      color: var(--accent-emerald);
    }

    .status-pill.replay {
      color: #c084fc;
    }

    .dot-live {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 6px var(--accent-emerald);
      animation: pulseLive 1.2s infinite alternate;
    }

    .dot-replay {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #c084fc;
      box-shadow: 0 0 6px #c084fc;
    }

    .event-seq-pill {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      color: #94a3b8;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .btn-header-ctrl,
    .btn-close-modal {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-header-ctrl:hover {
      background: var(--bg-card-hover);
      color: var(--text-primary);
    }

    .btn-close-modal:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
    }

    /* Cuerpo Principal (Split) */
    .simulator-body {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 400px;
      overflow: hidden;
      position: relative;
    }

    /* Contenedor Three.js */
    .stage-container {
      position: relative;
      background: radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.9) 0%, rgba(3, 7, 18, 0.98) 100%);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .three-viewport {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Fallback 2D */
    .fallback-2d-topology {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      gap: 1.5rem;
    }

    .badge-2d {
      font-size: 0.72rem;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      padding: 0.3rem 0.7rem;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .nodes-grid-2d {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: center;
      max-width: 600px;
    }

    .node-card-2d {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      min-width: 120px;
      transition: all 0.2s;
    }

    .node-card-2d.active {
      transform: scale(1.05);
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.4);
    }

    .node-title-2d {
      margin: 0;
      font-size: 0.82rem;
      color: var(--text-primary);
    }

    .node-role-2d {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--text-muted);
    }

    /* Barra flotante de nodos */
    .node-chips-bar {
      position: absolute;
      bottom: 12px;
      left: 14px;
      display: flex;
      gap: 0.35rem;
      background: rgba(13, 21, 39, 0.85);
      backdrop-filter: blur(8px);
      padding: 0.3rem 0.5rem;
      border-radius: var(--radius-full);
      border: 1px solid var(--border-subtle);
      z-index: 10;
      flex-wrap: wrap;
    }

    .node-chip {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-full);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s;
    }

    .chip-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--chip-color, var(--text-muted));
    }

    .node-chip:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.06);
    }

    .node-chip.is-active {
      border-color: var(--chip-color);
      color: var(--chip-color);
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
    }

    .node-chip.is-selected {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text-primary);
    }

    /* Indicador flotante superior */
    .active-transition-pill {
      position: absolute;
      top: 14px;
      left: 14px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(13, 21, 39, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(56, 189, 248, 0.4);
      padding: 0.35rem 0.8rem;
      border-radius: var(--radius-full);
      font-size: 0.74rem;
      font-weight: 600;
      color: var(--text-primary);
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
      z-index: 10;
    }

    .active-transition-pill.waiting {
      border-color: rgba(168, 85, 247, 0.5);
      color: #c084fc;
    }

    .spinner-dot {
      width: 8px;
      height: 8px;
      border: 2px solid #c084fc;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .state-indicator-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Columna Derecha (Inspector) */
    .explanation-panel {
      border-left: 1px solid var(--border-default);
      background: var(--bg-surface);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-tabs {
      display: flex;
      border-bottom: 1px solid var(--border-default);
      background: rgba(10, 15, 30, 0.6);
    }

    .panel-tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      font-size: 0.76rem;
      font-weight: 600;
      padding: 0.65rem 0.75rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      transition: all 0.15s;
    }

    .panel-tab-btn:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.03);
    }

    .panel-tab-btn.active {
      color: var(--accent-cyan);
      border-bottom-color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.06);
    }

    .panel-content {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .event-badge-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 0.75rem;
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.45rem;
    }

    .badge-type {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.12);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }

    .badge-node {
      font-size: 0.68rem;
      font-weight: 700;
    }

    .event-desc {
      margin: 0;
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.45;
    }

    .roles-comparison-grid {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .role-box {
      border-radius: 8px;
      padding: 0.7rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .llm-box {
      background: rgba(168, 85, 247, 0.08);
      border-left: 3px solid #c084fc;
    }

    .runtime-box {
      background: rgba(16, 185, 129, 0.08);
      border-left: 3px solid var(--accent-emerald);
    }

    .role-header {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.74rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .role-text {
      margin: 0;
      font-size: 0.78rem;
      color: #cbd5e1;
      line-height: 1.4;
    }

    .payload-box {
      background: rgba(8, 12, 22, 0.85);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 0.65rem 0.75rem;
    }

    .payload-header {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .payload-code {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: #38bdf8;
      max-height: 150px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .empty-state {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--text-secondary);
    }

    .empty-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* Pestaña Nodo */
    .node-profile-header {
      border-left: 4px solid var(--accent-cyan);
      padding-left: 0.65rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .node-main-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .node-id-chip {
      font-size: 0.7rem;
      font-weight: 800;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }

    .node-markdown-section {
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .doc-link-card {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: auto;
    }

    .doc-meta {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .btn-open-guide-link {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: var(--accent-cyan);
      font-size: 0.76rem;
      font-weight: 700;
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s;
    }

    .btn-open-guide-link:hover {
      background: rgba(56, 189, 248, 0.22);
      border-color: var(--accent-cyan);
    }

    /* Barra Inferior (Timeline + Transport) */
    .simulator-footer {
      background: rgba(10, 15, 30, 0.85);
      border-top: 1px solid var(--border-default);
      padding: 0.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .timeline-scrubber {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }

    .scrubber-track {
      display: flex;
      gap: 0.35rem;
      min-width: max-content;
    }

    .scrubber-marker {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 0.2rem 0.45rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.3rem;
      transition: all 0.15s;
    }

    .scrubber-marker:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--border-default);
    }

    .scrubber-marker.active {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--accent-cyan);
    }

    .marker-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
    }

    .scrubber-marker.active .marker-dot {
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }

    .marker-label {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--text-secondary);
    }

    .transport-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
    }

    .transport-group {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .btn-tool {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-tool:hover:not(:disabled) {
      background: var(--bg-card-hover);
      color: var(--text-primary);
      border-color: var(--accent-cyan);
    }

    .btn-tool:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .btn-play {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      color: var(--accent-cyan);
    }

    .speed-group {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      background: rgba(0, 0, 0, 0.3);
      padding: 0.15rem;
      border-radius: var(--radius-sm);
    }

    .btn-speed {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 3px;
      cursor: pointer;
    }

    .btn-speed.active {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text-primary);
    }

    .btn-return-live {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: var(--accent-emerald);
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.25rem 0.65rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s;
    }

    @media (max-width: 900px) {
      .simulator-body {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr 280px;
      }
      .explanation-panel {
        border-left: none;
        border-top: 1px solid var(--border-default);
      }
    }
  `]
})
export class RuntimeSimulatorModalComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly sim = inject(SimulatorProjectionService);

  readonly openFullGuide = output<void>();

  readonly activeTab = signal<'event' | 'node'>('event');
  readonly hasWebGLError = signal<boolean>(false);

  @ViewChild('canvasRef') canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('stageWrapper') stageWrapper?: ElementRef<HTMLDivElement>;

  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGLRenderer;
  private animFrameId?: number;
  private resizeObserver?: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private nodes3D: Node3DObject[] = [];
  private edges3D: Edge3DObject[] = [];
  private particlePacket?: THREE.Mesh;
  private particleProgress = 0;
  private particleSpeed = 0.015;

  private isReducedMotion = false;

  constructor() {
    effect(() => {
      // Re-synchronize node visuals whenever mapping, active event, or topology changes
      const isOpen = this.sim.isOpen();
      const mapping = this.sim.eventMapping();
      const states = this.sim.nodeStates();
      if (isOpen && this.scene) {
        this.updateNodesAppearance(states);
      }
    });

    effect(() => {
      if (this.sim.isOpen()) {
        setTimeout(() => this.initThreeScene(), 50);
      } else {
        this.cleanupThreeScene();
      }
    });
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  ngAfterViewInit(): void {
    // Initialized via effect in constructor
  }

  ngOnDestroy(): void {
    this.cleanupThreeScene();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.sim.isOpen()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.sim.closeSimulator();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.sim.stepNextEvent();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.sim.stepPrevEvent();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.sim.controller.togglePlayPauseReplay();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    this.sim.closeSimulator();
  }

  getFormattedPayload(): string {
    const payload = this.sim.activeEvent()?.payload;
    if (!payload) return 'Sin carga útil disponible';
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }

  private initThreeScene(): void {
    if (!this.canvasRef?.nativeElement || !this.stageWrapper?.nativeElement) return;

    const width = this.stageWrapper.nativeElement.clientWidth || 600;
    const height = this.stageWrapper.nativeElement.clientHeight || 450;

    try {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      this.camera.position.set(0, 0, 11);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvasRef.nativeElement,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));

      // Iluminación
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      this.scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
      dirLight.position.set(5, 8, 10);
      this.scene.add(dirLight);

      // Construcción del grafo de nodos y aristas según topología activa
      this.buildGraph3D();

      // Listener de click y mousemove para Raycaster
      this.canvasRef.nativeElement.addEventListener('click', this.onCanvasClick.bind(this));
      this.canvasRef.nativeElement.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));

      // Observador de Redimensionamiento
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.stageWrapper.nativeElement);
      }

      this.animate();
      this.hasWebGLError.set(false);
    } catch (err) {
      console.warn('WebGL no disponible en RuntimeSimulatorModalComponent, usando fallback 2D:', err);
      this.hasWebGLError.set(true);
    }
  }

  private buildGraph3D(): void {
    if (!this.scene) return;

    // Limpiar nodos anteriores si existían
    this.nodes3D = [];
    this.edges3D = [];

    const topology = this.sim.topology();

    // 1. Crear Nodos
    const sphereGeo = new THREE.SphereGeometry(0.55, 32, 32);
    const ringGeo = new THREE.RingGeometry(0.72, 0.85, 32);

    for (const nodeConfig of topology.nodes) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(nodeConfig.colorHex),
        emissive: new THREE.Color(nodeConfig.glowColorHex),
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.6
      });

      const sphereMesh = new THREE.Mesh(sphereGeo, mat);
      sphereMesh.position.set(nodeConfig.position.x, nodeConfig.position.y, nodeConfig.position.z);
      sphereMesh.userData = { nodeId: nodeConfig.id };

      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(nodeConfig.colorHex),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4
      });
      const haloMesh = new THREE.Mesh(ringGeo, ringMat);
      haloMesh.position.copy(sphereMesh.position);

      const labelSprite = this.createLabelSprite(nodeConfig.id, nodeConfig.colorHex);
      labelSprite.position.set(nodeConfig.position.x, nodeConfig.position.y + 0.95, nodeConfig.position.z);

      this.scene.add(sphereMesh);
      this.scene.add(haloMesh);
      this.scene.add(labelSprite);

      this.nodes3D.push({
        config: nodeConfig,
        mesh: sphereMesh,
        halo: haloMesh,
        labelSprite
      });
    }

    // 2. Crear Aristas Curvas
    for (const edgeConfig of topology.edges) {
      const srcNode = topology.nodes.find((n) => n.id === edgeConfig.source);
      const tgtNode = topology.nodes.find((n) => n.id === edgeConfig.target);
      if (!srcNode || !tgtNode) continue;

      const p1 = new THREE.Vector3(srcNode.position.x, srcNode.position.y, srcNode.position.z);
      const p2 = new THREE.Vector3(tgtNode.position.x, tgtNode.position.y, tgtNode.position.z);
      const mid = new THREE.Vector3()
        .addVectors(p1, p2)
        .multiplyScalar(0.5)
        .add(new THREE.Vector3(0, 0.5, 0));

      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const points = curve.getPoints(30);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.6
      });
      const lineMesh = new THREE.Line(lineGeo, lineMat);

      this.scene.add(lineMesh);
      this.edges3D.push({
        config: edgeConfig,
        curve,
        lineMesh
      });
    }

    // 3. Crear Partícula de Paquete de Datos
    const particleGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8
    });
    this.particlePacket = new THREE.Mesh(particleGeo, particleMat);
    this.particlePacket.visible = false;
    this.scene.add(this.particlePacket);
  }

  private createLabelSprite(text: string, colorHex: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
      ctx.roundRect(10, 8, 236, 48, 10);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = colorHex;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.4, 0.35, 1);
    return sprite;
  }

  private updateNodesAppearance(states: Record<SimulatorNodeId, NodeExecutionState>): void {
    for (const nodeObj of this.nodes3D) {
      const state = states[nodeObj.config.id] || 'idle';
      const mat = nodeObj.mesh.material as THREE.MeshStandardMaterial;
      const haloMat = nodeObj.halo.material as THREE.MeshBasicMaterial;

      if (state === 'active') {
        mat.emissiveIntensity = 0.95;
        nodeObj.mesh.scale.set(1.15, 1.15, 1.15);
        haloMat.opacity = 0.85;
      } else if (state === 'waiting') {
        mat.emissiveIntensity = 0.7;
        nodeObj.mesh.scale.set(1.05, 1.05, 1.05);
        haloMat.opacity = 0.6;
      } else if (state === 'completed') {
        mat.emissiveIntensity = 0.45;
        nodeObj.mesh.scale.set(1.0, 1.0, 1.0);
        haloMat.opacity = 0.3;
      } else if (state === 'error') {
        mat.color = new THREE.Color('#ef4444');
        mat.emissive = new THREE.Color('#b91c1c');
        mat.emissiveIntensity = 1.0;
        haloMat.color = new THREE.Color('#ef4444');
        haloMat.opacity = 0.9;
      } else {
        mat.color = new THREE.Color(nodeObj.config.colorHex);
        mat.emissive = new THREE.Color(nodeObj.config.glowColorHex);
        mat.emissiveIntensity = 0.25;
        nodeObj.mesh.scale.set(1.0, 1.0, 1.0);
        haloMat.opacity = 0.3;
      }
    }
  }

  private animate(): void {
    this.animFrameId = requestAnimationFrame(() => this.animate());

    if (!this.scene || !this.camera || !this.renderer) return;

    // Rotar anillos halo suavemente si motion no está reducido
    if (!this.isReducedMotion) {
      for (const node of this.nodes3D) {
        node.halo.rotation.z += 0.01;
      }

      // Animar flujo de partícula sobre arista activa
      const mapping = this.sim.eventMapping();
      if (mapping?.edgeId && this.particlePacket) {
        const activeEdge = this.edges3D.find((e) => e.config.id === mapping.edgeId);
        if (activeEdge) {
          this.particlePacket.visible = true;
          this.particleProgress += this.particleSpeed;
          if (this.particleProgress > 1) {
            this.particleProgress = 0;
          }
          const pt = activeEdge.curve.getPoint(this.particleProgress);
          this.particlePacket.position.copy(pt);
        } else {
          this.particlePacket.visible = false;
        }
      } else if (this.particlePacket) {
        this.particlePacket.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    if (!this.stageWrapper?.nativeElement || !this.renderer || !this.camera) return;
    const w = this.stageWrapper.nativeElement.clientWidth;
    const h = this.stageWrapper.nativeElement.clientHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onCanvasMouseMove(event: MouseEvent): void {
    if (!this.canvasRef?.nativeElement) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.camera && this.scene) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const meshes = this.nodes3D.map((n) => n.mesh);
      const intersects = this.raycaster.intersectObjects(meshes);
      this.canvasRef.nativeElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
    }
  }

  private onCanvasClick(event: MouseEvent): void {
    if (!this.camera || !this.scene || !this.canvasRef?.nativeElement) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = this.nodes3D.map((n) => n.mesh);
    const intersects = this.raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object as THREE.Mesh;
      const nodeId = clickedMesh.userData['nodeId'] as SimulatorNodeId;
      if (nodeId) {
        this.sim.selectNode(nodeId);
        this.activeTab.set('node');
      }
    }
  }

  private cleanupThreeScene(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = undefined;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      this.scene.clear();
      this.scene = undefined;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = undefined;
    }

    this.nodes3D = [];
    this.edges3D = [];
    this.particlePacket = undefined;
  }
}
