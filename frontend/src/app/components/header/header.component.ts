import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentMeta, PersonaInfo, HealthStatus } from '../../models/agent.models';
import { PresentationControllerService } from '../../services/presentation-controller.service';
import { DemoModeService } from '../../services/demo-mode.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <!-- Izquierda: Identidad de Marca y Telemetría del Sistema Local -->
      <div class="header-brand">
        <div class="logo-badge" aria-label="Marca AEP">
          <svg class="logo-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          <span class="logo-text">AEP</span>
        </div>

        <div class="brand-info">
          <div class="brand-title-row">
            <h1>Agent Engineering Playground</h1>
            @if (demoMode.isDemoMode()) {
              <span class="lab-pill demo-pill">Modo Demo &bull; Sin backend</span>
            } @else {
              <span class="lab-pill">Entorno Local</span>
            }
          </div>

          @if (demoMode.isDemoMode()) {
            <div 
              class="env-status-pill demo-status-pill" 
              data-tour="tour-connection"
              aria-label="Modo Demo estático para GitHub Pages"
            >
              <span class="status-dot demo-dot"></span>
              <span class="env-item">Static Demo</span>
              <span class="dot-sep">&bull;</span>
              <span class="env-item">Trazas Reales</span>
              <span class="dot-sep">&bull;</span>
              <span class="env-item">Sin servidor backend</span>
            </div>
          } @else if (health()) {
            <div 
              class="env-status-pill" 
              data-tour="tour-connection"
              [class.healthy]="health()?.status === 'healthy'" 
              [class.degraded]="health()?.status !== 'healthy'"
              aria-label="Estado de los servicios de backend"
            >
              <span class="status-dot"></span>
              <span class="env-item">FastAPI :8000</span>
              <span class="dot-sep">&bull;</span>
              <span class="env-item">Modelo: {{ health()?.llm_server === 'connected' ? 'Conectado' : 'Sin conexión' }}</span>
              <span class="dot-sep">&bull;</span>
              <span class="env-item">MySQL: {{ health()?.database === 'connected' ? 'Conectado' : 'Sin conexión' }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Centro: Selectores de Simulación de Persona y Versión Agéntica -->
      <div class="header-selectors">
        <div class="selector-field">
          <label for="persona-select">Persona (Simulación)</label>
          <div class="select-container">
            <span class="persona-avatar-chip">
              {{ selectedPersona().includes('carlos') ? 'C' : selectedPersona().includes('laura') ? 'L' : 'U' }}
            </span>
            <select 
              id="persona-select" 
              data-tour="tour-persona-select"
              class="styled-select"
              [value]="selectedPersona()"
              (change)="onPersonaChange($event)"
              aria-label="Seleccionar persona activa"
            >
              @for (persona of personas(); track persona.username) {
                <option [value]="persona.username" [selected]="persona.username === selectedPersona()">
                  {{ persona.full_name }} &bull; {{ persona.role }}
                </option>
              }
            </select>
            <svg class="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>

        <div class="selector-field">
          <label for="agent-select">Versión Agéntica</label>
          <div class="select-container">
            <svg class="agent-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"></rect>
              <circle cx="12" cy="5" r="2"></circle>
              <path d="M12 7v4"></path>
              <line x1="8" y1="16" x2="8" y2="16"></line>
              <line x1="16" y1="16" x2="16" y2="16"></line>
            </svg>
            <select 
              id="agent-select" 
              data-tour="tour-agent-select"
              class="styled-select agent-select"
              [value]="selectedAgentId()"
              (change)="onAgentChange($event)"
              aria-label="Seleccionar versión del agente"
            >
              @for (agent of agents(); track agent.id) {
                <option [value]="agent.id" [selected]="agent.id === selectedAgentId()">
                  {{ agent.id === 'v1' ? 'Agent v1 — Tool Calling' : agent.name }} [{{ agent.badge }}]
                </option>
              }
            </select>
            <svg class="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
      </div>

      <!-- Derecha: Controles de Reproducción Unificados y Panel MySQL -->
      <div class="header-actions">
        <!-- Controles de Reproducción y Estado del Runtime (Fase UI-3) -->
        <div class="runtime-controls" data-tour="tour-live-controls" role="group" aria-label="Controles de ejecución en vivo y reproducción">
          @if (controller.mode() === 'live') {
            <div 
              class="header-status-pill" 
              [class.paused]="controller.isVisualPaused()"
              [title]="controller.isVisualPaused() ? 'Pausa visual activa (el backend continúa ejecutando)' : 'Seguimiento visual en vivo activo'"
            >
              <span class="status-pulse-dot"></span>
              <span class="status-text">{{ controller.isVisualPaused() ? 'PAUSA VISUAL' : 'EN VIVO' }}</span>
            </div>

            <button
              type="button"
              class="btn-header-action btn-pause-ctrl"
              [class.active-pause]="controller.isVisualPaused()"
              (click)="controller.toggleVisualPause()"
              title="Pausar o reanudar el seguimiento visual en pantalla sin detener la ejecución en backend"
              aria-label="Alternar pausa visual"
            >
              @if (controller.isVisualPaused()) {
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>Reanudar</span>
              } @else {
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <span>Pausar</span>
              }
            </button>

            <button
              type="button"
              class="btn-header-action btn-replay-ctrl"
              (click)="controller.startReplayMode()"
              title="Activar modo de reproducción interactiva paso a paso"
              aria-label="Activar modo de reproducción"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
              <span>Reproducir</span>
            </button>
          } @else {
            <div class="header-status-pill replay-active" title="Modo de reproducción histórica activo">
              <span class="status-pulse-dot purple"></span>
              <span class="status-text">MODO REPRODUCCIÓN</span>
            </div>

            <button
              type="button"
              class="btn-header-action btn-live-ctrl"
              (click)="controller.setMode('live')"
              title="Regresar al modo de seguimiento en vivo"
              aria-label="Regresar al modo en vivo"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"></polyline>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
              </svg>
              <span>Volver a Live</span>
            </button>
          }
        </div>

        <!-- Botón Explorar Playground (Walkthrough Interactivo) -->
        <button
          type="button"
          class="btn-tour-toggle"
          data-tour="tour-walkthrough-btn"
          (click)="startWalkthrough.emit()"
          title="Iniciar recorrido guiado por la interfaz y arquitectura de AEP"
          aria-label="Explorar Playground"
        >
          <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="12 8 8 12 12 16 12 13 16 13 16 11 12 11 12 8"></polygon>
          </svg>
          <span class="label">Explorar Playground</span>
        </button>

        <!-- Botón Abrir Simulador del Runtime (Three.js Graph) -->
        <button
          type="button"
          class="btn-simulator-toggle"
          data-tour="tour-simulator-btn"
          [class.active]="isSimulatorOpen()"
          (click)="toggleSimulator.emit()"
          title="Abrir simulador visual interactivo Three.js de hops y flujo agéntico"
          aria-label="Abrir simulador del runtime"
        >
          <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          <span class="label">Abrir simulador</span>
        </button>

        <!-- Acceso a la Guía del Aprendiz -->
        <button 
          type="button"
          class="btn-guide-toggle" 
          data-tour="tour-guide-btn"
          [class.active]="isGuideDrawerOpen()"
          (click)="toggleGuideDrawer.emit()"
          title="Abrir Guía del Aprendiz para la versión seleccionada"
          aria-label="Abrir Guía del Aprendiz"
        >
          <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span class="label">Guía del aprendiz</span>
        </button>

        <!-- Acceso al Inspector de Base de Datos / Tickets -->
        <button 
          type="button"
          class="btn-db-toggle" 
          data-tour="tour-db-btn"
          [class.active]="isDbDrawerOpen()"
          (click)="toggleDbDrawer.emit()"
          [title]="demoMode.isDemoMode() ? 'Ver catálogo de tickets simulado en modo Demo' : 'Inspeccionar tickets en base de datos MySQL'"
          aria-label="Abrir panel de tickets"
        >
          <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          <span class="label">{{ demoMode.isDemoMode() ? 'Tickets (Demo)' : 'Tickets MySQL' }}</span>
        </button>

        <!-- Selector Rápido de Modo Demo / Live -->
        <button
          type="button"
          class="btn-mode-toggle"
          [class.active-demo]="demoMode.isDemoMode()"
          (click)="demoMode.toggleDemoMode()"
          [title]="demoMode.isDemoMode() ? 'Modo Demo activo (offline). Clic para cambiar a Live local.' : 'Modo Live local activo. Clic para activar Modo Demo estático.'"
          aria-label="Alternar entre Modo Demo y Live local"
        >
          <span class="mode-indicator-dot" [class.dot-demo]="demoMode.isDemoMode()"></span>
          <span class="mode-label">{{ demoMode.isDemoMode() ? 'Modo Demo' : 'Local Live' }}</span>
        </button>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-default);
      color: var(--text-primary);
      flex-wrap: wrap;
      gap: 0.75rem;
      min-height: 56px;
      z-index: 30;
      position: relative;
    }

    /* Brand e Identidad */
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--accent-emerald-bg);
      border: 1px solid var(--accent-emerald-border);
      color: var(--accent-emerald);
      padding: 0.35rem 0.6rem;
      border-radius: var(--radius-sm);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
    }
    .logo-svg {
      color: var(--accent-emerald);
    }
    .logo-text {
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 1.2px;
      font-family: var(--font-mono);
    }
    .brand-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .brand-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .brand-title-row h1 {
      font-size: 0.95rem;
      font-weight: 700;
      margin: 0;
      color: var(--text-primary);
      letter-spacing: -0.2px;
    }
    .lab-pill {
      font-size: 0.65rem;
      color: var(--accent-cyan);
      background: var(--accent-cyan-bg);
      padding: 0.1rem 0.45rem;
      border-radius: var(--radius-full);
      border: 1px solid var(--accent-cyan-border);
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .env-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.66rem;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .env-status-pill.healthy .status-dot {
      background: var(--accent-emerald);
      box-shadow: 0 0 6px var(--accent-emerald);
    }
    .env-status-pill.degraded .status-dot {
      background: var(--accent-amber);
      box-shadow: 0 0 6px var(--accent-amber);
    }
    .dot-sep {
      color: var(--border-default);
    }

    /* Selectores Centrales */
    .header-selectors {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      flex-wrap: wrap;
    }
    .selector-field {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .selector-field label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-muted);
      font-weight: 600;
      padding-left: 0.2rem;
    }
    .select-container {
      position: relative;
      display: flex;
      align-items: center;
      background: var(--bg-panel);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 0 0.5rem 0 0.45rem;
      transition: var(--transition-fast);
    }
    .select-container:hover {
      border-color: var(--accent-cyan);
    }
    .select-container:focus-within {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px var(--accent-cyan-bg);
    }
    .persona-avatar-chip {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent-violet-bg);
      border: 1px solid var(--accent-violet-border);
      color: var(--accent-violet-bright);
      font-size: 0.62rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-right: 0.35rem;
      flex-shrink: 0;
    }
    .agent-icon {
      color: var(--accent-cyan);
      margin-right: 0.35rem;
      flex-shrink: 0;
    }
    .styled-select {
      background: transparent;
      border: none;
      color: var(--text-primary);
      padding: 0.35rem 1.4rem 0.35rem 0;
      font-size: 0.8rem;
      font-weight: 500;
      outline: none;
      cursor: pointer;
      appearance: none;
      font-family: inherit;
    }
    .styled-select option {
      background: var(--bg-surface);
      color: var(--text-primary);
    }
    .select-chevron {
      position: absolute;
      right: 0.5rem;
      pointer-events: none;
      color: var(--text-muted);
    }

    /* Acciones y Controles a la Derecha */
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      flex-wrap: wrap;
    }
    .runtime-controls {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(13, 21, 39, 0.6);
      padding: 0.2rem 0.35rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-subtle);
    }
    .header-status-pill {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.68rem;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: 0.04em;
      padding: 0.25rem 0.55rem;
      border-radius: var(--radius-sm);
      background: var(--accent-emerald-bg);
      border: 1px solid var(--accent-emerald-border);
      color: var(--accent-emerald);
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
    }
    .header-status-pill.paused {
      background: var(--accent-amber-bg);
      border-color: var(--accent-amber-border);
      color: var(--accent-amber);
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
    }
    .header-status-pill.replay-active {
      background: var(--accent-violet-bg);
      border-color: var(--accent-violet-border);
      color: var(--accent-violet-bright);
      box-shadow: 0 0 10px rgba(168, 85, 247, 0.2);
    }
    .status-pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 6px var(--accent-emerald);
      animation: pulseLive 1.2s infinite alternate;
    }
    .header-status-pill.paused .status-pulse-dot {
      background: var(--accent-amber);
      box-shadow: 0 0 6px var(--accent-amber);
      animation: none;
    }
    .status-pulse-dot.purple {
      background: var(--accent-violet-bright);
      box-shadow: 0 0 6px var(--accent-violet-bright);
    }
    @keyframes pulseLive {
      from { transform: scale(0.85); opacity: 0.65; }
      to { transform: scale(1.25); opacity: 1; }
    }

    .btn-header-action {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      font-size: 0.74rem;
      font-weight: 600;
      padding: 0.3rem 0.65rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-header-action:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }
    .btn-pause-ctrl.active-pause {
      background: var(--accent-amber-bg);
      border-color: var(--accent-amber-border);
      color: var(--accent-amber);
    }
    .btn-live-ctrl {
      background: var(--accent-violet-bg);
      border-color: var(--accent-violet-border);
      color: var(--accent-violet-bright);
    }

    .btn-tour-toggle {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fbbf24;
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-tour-toggle:hover {
      background: rgba(245, 158, 11, 0.18);
      border-color: #fbbf24;
    }

    .btn-simulator-toggle {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(168, 85, 247, 0.1);
      border: 1px solid rgba(168, 85, 247, 0.35);
      color: #c084fc;
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-simulator-toggle:hover {
      background: rgba(168, 85, 247, 0.22);
      border-color: #c084fc;
    }
    .btn-simulator-toggle.active {
      background: #a855f7;
      color: #020617;
      border-color: #a855f7;
      font-weight: 700;
    }

    .btn-guide-toggle {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-guide-toggle:hover {
      background: rgba(56, 189, 248, 0.18);
      border-color: var(--accent-cyan);
    }
    .btn-guide-toggle.active {
      background: var(--accent-cyan);
      color: #020617;
      border-color: var(--accent-cyan);
      font-weight: 700;
    }

    .btn-db-toggle {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: var(--bg-panel);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-db-toggle:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
    }
    .btn-db-toggle.active {
      background: var(--accent-emerald-bg);
      border-color: var(--accent-emerald);
      color: var(--accent-emerald);
    }
    .btn-icon {
      flex-shrink: 0;
    }

    /* Reglas de adaptación responsiva */
    @media (max-width: 1024px) {
      .app-header {
        padding: 0.5rem 0.85rem;
      }
      .header-brand {
        flex: 1 1 auto;
      }
      .brand-title-row h1 {
        font-size: 0.88rem;
      }
    }

    @media (max-width: 768px) {
      .app-header {
        gap: 0.5rem;
        padding: 0.5rem 0.65rem;
      }
      .header-selectors {
        width: 100%;
        justify-content: flex-start;
      }
      .selector-field {
        flex: 1;
        min-width: 140px;
      }
      .header-actions {
        width: 100%;
        justify-content: space-between;
      }
    }

    .demo-pill {
      background: rgba(168, 85, 247, 0.16) !important;
      color: #d8b4fe !important;
      border: 1px solid rgba(168, 85, 247, 0.35) !important;
      font-weight: 600;
    }

    .demo-status-pill {
      background: rgba(147, 51, 234, 0.08) !important;
      border: 1px solid rgba(168, 85, 247, 0.3) !important;
    }

    .demo-dot {
      background: #c084fc !important;
      box-shadow: 0 0 8px rgba(192, 132, 252, 0.8) !important;
    }

    .btn-mode-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.65rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-default);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-mode-toggle:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-mode-toggle.active-demo {
      background: rgba(168, 85, 247, 0.15);
      border-color: rgba(168, 85, 247, 0.45);
      color: #e9d5ff;
    }

    .mode-indicator-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      display: inline-block;
    }

    .mode-indicator-dot.dot-demo {
      background: #a855f7;
      box-shadow: 0 0 6px rgba(168, 85, 247, 0.9);
    }
  `]
})
export class HeaderComponent {
  readonly agents = input<AgentMeta[]>([]);
  readonly personas = input<PersonaInfo[]>([]);
  readonly selectedAgentId = input<string>('v1');
  readonly selectedPersona = input<string>('usr_carlos');
  readonly isDbDrawerOpen = input<boolean>(false);
  readonly isGuideDrawerOpen = input<boolean>(false);
  readonly isSimulatorOpen = input<boolean>(false);
  readonly health = input<HealthStatus | null>(null);

  readonly selectAgent = output<string>();
  readonly selectPersona = output<string>();
  readonly toggleDbDrawer = output<void>();
  readonly toggleGuideDrawer = output<void>();
  readonly startWalkthrough = output<void>();
  readonly toggleSimulator = output<void>();

  readonly controller = inject(PresentationControllerService);
  readonly demoMode = inject(DemoModeService);

  onAgentChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectAgent.emit(target.value);
  }

  onPersonaChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectPersona.emit(target.value);
  }
}


