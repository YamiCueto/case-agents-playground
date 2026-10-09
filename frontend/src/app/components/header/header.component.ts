import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentMeta, PersonaInfo } from '../../models/agent.models';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <div class="header-brand">
        <div class="logo-badge">AEP</div>
        <div class="brand-info">
          <h1>Agent Engineering Playground</h1>
          <span class="lab-pill">Modo Laboratorio &bull; Demostración Local</span>
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
              <option [value]="persona.username">
                {{ persona.full_name }} ({{ persona.role }})
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
                <option [value]="agent.id">
                  {{ agent.name }} &bull; [{{ agent.badge }}]
                </option>
              }
            </select>
          </div>
        </div>

        <button 
          class="btn-db-toggle" 
          [class.active]="isDbDrawerOpen()"
          (click)="toggleDbDrawer.emit()"
          title="Inspeccionar tickets en MySQL"
        >
          <span class="icon">&#x1F5C4;</span>
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
      padding: 0.75rem 1.5rem;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      color: #f8fafc;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .logo-badge {
      background: linear-gradient(135deg, #10b981, #047857);
      color: #ffffff;
      font-weight: 800;
      font-size: 1.1rem;
      padding: 0.35rem 0.75rem;
      border-radius: 8px;
      letter-spacing: 1px;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
    }
    .brand-info h1 {
      font-size: 1.05rem;
      font-weight: 700;
      margin: 0;
      color: #f1f5f9;
      letter-spacing: -0.2px;
    }
    .lab-pill {
      display: inline-block;
      font-size: 0.72rem;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      margin-top: 0.2rem;
      border: 1px solid rgba(56, 189, 248, 0.25);
    }
    .header-controls {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      flex-wrap: wrap;
    }
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .control-group label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
      font-weight: 600;
    }
    .styled-select {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 0.45rem 0.85rem;
      border-radius: 6px;
      font-size: 0.85rem;
      outline: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .styled-select:focus {
      border-color: #10b981;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
    }
    .btn-db-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: #1e293b;
      border: 1px solid #334155;
      color: #f1f5f9;
      padding: 0.5rem 0.9rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      align-self: flex-end;
    }
    .btn-db-toggle:hover {
      background: #334155;
      border-color: #64748b;
    }
    .btn-db-toggle.active {
      background: rgba(16, 185, 129, 0.15);
      border-color: #10b981;
      color: #34d399;
    }
  `]
})
export class HeaderComponent {
  readonly agents = input<AgentMeta[]>([]);
  readonly personas = input<PersonaInfo[]>([]);
  readonly selectedAgentId = input<string>('v1');
  readonly selectedPersona = input<string>('usr_carlos');
  readonly isDbDrawerOpen = input<boolean>(false);

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
