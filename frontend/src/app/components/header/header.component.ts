import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentMeta, PersonaInfo, HealthStatus } from '../../models/agent.models';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <div class="header-brand">
        <div class="logo-badge" aria-label="AEP Brand">
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
            <span class="lab-pill">Entorno Local</span>
          </div>
          @if (health()) {
            <div class="env-status-pill" [class.healthy]="health()?.status === 'healthy'" [class.degraded]="health()?.status !== 'healthy'">
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

      <div class="header-controls">
        <div class="control-group">
          <label for="persona-select">Persona Activa (Simulación):</label>
          <select 
            id="persona-select" 
            class="styled-select"
            [value]="selectedPersona()"
            (change)="onPersonaChange($event)"
          >
            @for (persona of personas(); track persona.username) {
              <option [value]="persona.username" [selected]="persona.username === selectedPersona()">
                {{ persona.full_name }} &bull; {{ persona.role }}
              </option>
            }
          </select>
        </div>

        <div class="control-group">
          <label for="agent-select">Versión Agéntica:</label>
          <div class="agent-selector-wrapper">
            <select 
              id="agent-select" 
              class="styled-select agent-select"
              [value]="selectedAgentId()"
              (change)="onAgentChange($event)"
            >
              @for (agent of agents(); track agent.id) {
                <option [value]="agent.id" [selected]="agent.id === selectedAgentId()">
                  {{ agent.id === 'v1' ? 'Agent v1 — Tool Calling' : agent.name }} [{{ agent.badge }}]
                </option>
              }
            </select>
          </div>
        </div>

        <button 
          class="btn-db-toggle" 
          [class.active]="isDbDrawerOpen()"
          (click)="toggleDbDrawer.emit()"
          title="Inspeccionar tickets en base de datos MySQL"
          aria-label="Abrir panel de tickets MySQL"
        >
          <svg class="btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          <span class="label">Tickets MySQL</span>
        </button>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 1.25rem;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
      flex-wrap: wrap;
      gap: 0.85rem;
      min-height: 58px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: var(--accent-emerald);
      padding: 0.35rem 0.65rem;
      border-radius: var(--radius-sm);
    }
    .logo-svg {
      color: var(--accent-emerald);
    }
    .logo-text {
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 1.2px;
    }
    .brand-info {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .brand-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .brand-title-row h1 {
      font-size: 0.98rem;
      font-weight: 700;
      margin: 0;
      color: var(--text-primary);
      letter-spacing: -0.2px;
    }
    .lab-pill {
      font-size: 0.68rem;
      color: var(--accent-cyan);
      background: var(--accent-cyan-bg);
      padding: 0.1rem 0.45rem;
      border-radius: 10px;
      border: 1px solid rgba(56, 189, 248, 0.25);
      font-weight: 600;
    }
    .env-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.68rem;
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
    .header-controls {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      flex-wrap: wrap;
    }
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .control-group label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .styled-select {
      background: var(--bg-panel);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      padding: 0.35rem 0.65rem;
      border-radius: var(--radius-sm);
      font-size: 0.82rem;
      outline: none;
      transition: var(--transition-fast);
      cursor: pointer;
    }
    .styled-select:focus-visible {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 2px var(--accent-cyan-bg);
    }
    .btn-db-toggle {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: var(--bg-panel);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      padding: 0.45rem 0.8rem;
      border-radius: var(--radius-sm);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition-fast);
      align-self: flex-end;
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
    @media (max-width: 768px) {
      .app-header {
        padding: 0.5rem 0.75rem;
      }
      .brand-title-row h1 {
        font-size: 0.88rem;
      }
      .header-controls {
        width: 100%;
        justify-content: flex-start;
      }
      .control-group {
        flex: 1;
        min-width: 140px;
      }
    }
  `]
})
export class HeaderComponent {
  readonly agents = input<AgentMeta[]>([]);
  readonly personas = input<PersonaInfo[]>([]);
  readonly selectedAgentId = input<string>('v1');
  readonly selectedPersona = input<string>('usr_carlos');
  readonly isDbDrawerOpen = input<boolean>(false);
  readonly health = input<HealthStatus | null>(null);

  readonly selectAgent = output<string>();
  readonly selectPersona = output<string>();
  readonly toggleDbDrawer = output<void>();

  onAgentChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectAgent.emit(target.value);
  }

  onPersonaChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectPersona.emit(target.value);
  }
}
