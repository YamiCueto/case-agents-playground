import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketSummary } from '../../models/agent.models';

@Component({
  selector: 'app-tickets-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="drawer-overlay" (click)="close.emit()" role="dialog" aria-modal="true" aria-label="Base de datos de tickets MySQL">
      <div class="drawer-card" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <div class="header-info">
            <div class="title-with-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="title-icon">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
              <h3>Estado en Vivo &bull; MySQL <code>cfa_tickets</code></h3>
            </div>
            <span class="drawer-desc">Snapshots reales leídos mediante <code>TicketService</code></span>
          </div>
          <div class="header-actions">
            <button class="btn-refresh" (click)="refresh.emit()" title="Recargar tickets desde la base de datos" aria-label="Actualizar tickets">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              <span>Actualizar</span>
            </button>
            <button class="btn-close" (click)="close.emit()" title="Cerrar panel de tickets" aria-label="Cerrar panel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="drawer-body">
          <table class="tickets-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Estado</th>
                <th>Prioridad</th>
                <th>Categoría</th>
                <th>Responsable</th>
                <th>SLA Vencido</th>
              </tr>
            </thead>
            <tbody>
              @for (ticket of tickets(); track ticket.code) {
                <tr [class.overdue-row]="ticket.is_overdue">
                  <td class="code-cell">{{ ticket.code }}</td>
                  <td class="title-cell">{{ ticket.title }}</td>
                  <td>
                    <span class="badge status-{{ ticket.status.toLowerCase() }}">
                      {{ ticket.status }}
                    </span>
                  </td>
                  <td>
                    <span class="badge priority-{{ ticket.priority.toLowerCase() }}">
                      {{ ticket.priority }}
                    </span>
                  </td>
                  <td>{{ ticket.category_code }}</td>
                  <td>{{ ticket.assignee_username || 'Sin asignar' }}</td>
                  <td class="overdue-cell">
                    @if (ticket.is_overdue) {
                      <span class="overdue-pill">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                          <line x1="12" y1="9" x2="12" y2="13"></line>
                          <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <span>VENCIDO</span>
                      </span>
                    } @else {
                      <span class="ok-pill">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>En regla</span>
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.75);
      backdrop-filter: blur(6px);
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
    }
    .drawer-card {
      width: 100%;
      max-width: 820px;
      height: 100%;
      background: var(--bg-panel);
      border-left: 1px solid var(--border-default);
      display: flex;
      flex-direction: column;
      animation: slideIn 0.22s ease-out;
      box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5);
    }
    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      gap: 1rem;
    }
    .title-with-icon {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .title-icon {
      color: var(--accent-emerald);
    }
    .drawer-header h3 {
      font-size: 0.96rem;
      font-weight: 700;
      margin: 0;
      color: var(--text-primary);
    }
    .drawer-header h3 code {
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.1);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }
    .drawer-desc {
      font-size: 0.74rem;
      color: var(--text-secondary);
      margin-top: 0.2rem;
      display: block;
    }
    .drawer-desc code {
      font-family: var(--font-mono);
      color: var(--accent-emerald);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn-refresh {
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: var(--transition-fast);
    }
    .btn-refresh:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }
    .btn-close {
      background: transparent;
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-close:hover {
      background: var(--bg-card);
      color: var(--accent-crimson);
      border-color: var(--accent-crimson);
    }
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 1.25rem;
    }
    .tickets-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }
    .tickets-table th {
      background: var(--bg-surface);
      color: var(--accent-cyan);
      font-weight: 700;
      text-align: left;
      padding: 0.65rem 0.75rem;
      border-bottom: 2px solid var(--border-default);
      font-family: var(--font-sans);
    }
    .tickets-table td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
    }
    .tickets-table tr:hover {
      background: rgba(56, 189, 248, 0.04);
    }
    .overdue-row {
      background: rgba(239, 68, 68, 0.05);
    }
    .code-cell {
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--accent-cyan);
    }
    .title-cell {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-family: var(--font-mono);
    }
    .status-open { background: #0284c7; color: #ffffff; }
    .status-in_progress { background: #d97706; color: #ffffff; }
    .status-waiting_client { background: #7c3aed; color: #ffffff; }
    .status-resolved { background: #059669; color: #ffffff; }
    .status-closed { background: #475569; color: #ffffff; }

    .priority-critical { background: #dc2626; color: #ffffff; }
    .priority-high { background: #ea580c; color: #ffffff; }
    .priority-medium { background: #ca8a04; color: #ffffff; }
    .priority-low { background: #16a34a; color: #ffffff; }

    .overdue-cell {
      white-space: nowrap;
    }
    .overdue-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--accent-crimson-bg);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: var(--accent-crimson);
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 10px;
    }
    .ok-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--accent-emerald-bg);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: var(--accent-emerald);
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 10px;
    }
    @media (max-width: 768px) {
      .drawer-card {
        max-width: 100%;
      }
      .tickets-table {
        display: block;
        overflow-x: auto;
      }
    }
  `]
})
export class TicketsDrawerComponent {
  readonly tickets = input<TicketSummary[]>([]);
  readonly close = output<void>();
  readonly refresh = output<void>();
}
