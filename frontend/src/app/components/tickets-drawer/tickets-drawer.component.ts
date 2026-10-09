import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketSummary } from '../../models/agent.models';

@Component({
  selector: 'app-tickets-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="drawer-overlay" (click)="close.emit()">
      <div class="drawer-card" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <div>
            <h3>&#x1F5C4; Estado en Vivo &bull; MySQL <code>cfa_tickets</code></h3>
            <span class="drawer-desc">Snapshots reales obtenidos vía <code>TicketService</code></span>
          </div>
          <div class="header-actions">
            <button class="btn-refresh" (click)="refresh.emit()" title="Recargar tickets">&#x21BB; Actualizar</button>
            <button class="btn-close" (click)="close.emit()" title="Cerrar">&times;</button>
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
                      <span class="overdue-pill">&#x26A0; VENCIDO</span>
                    } @else {
                      <span class="ok-pill">&#x2713; En regla</span>
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
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
    }
    .drawer-card {
      width: 100%;
      max-width: 820px;
      height: 100%;
      background: #0f172a;
      border-left: 1px solid #334155;
      display: flex;
      flex-direction: column;
      animation: slideIn 0.25s ease-out;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #1e293b;
      background: #0b1329;
    }
    .drawer-header h3 {
      margin: 0;
      font-size: 1.1rem;
      color: #f1f5f9;
    }
    .drawer-desc {
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }
    .btn-refresh {
      background: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .btn-refresh:hover {
      background: #334155;
    }
    .btn-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
    }
    .btn-close:hover {
      color: #f8fafc;
    }
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 1.5rem;
    }
    .tickets-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }
    .tickets-table th {
      text-align: left;
      padding: 0.75rem 0.5rem;
      border-bottom: 1px solid #334155;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.7rem;
    }
    .tickets-table td {
      padding: 0.75rem 0.5rem;
      border-bottom: 1px solid #1e293b;
      color: #e2e8f0;
    }
    .code-cell {
      font-family: monospace;
      font-weight: 700;
      color: #38bdf8;
    }
    .title-cell {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-open { background: #0284c7; color: #ffffff; }
    .status-in_progress { background: #d97706; color: #ffffff; }
    .status-resolved { background: #059669; color: #ffffff; }
    .status-closed { background: #475569; color: #cbd5e1; }
    .priority-critical { background: #dc2626; color: #ffffff; }
    .priority-high { background: #ea580c; color: #ffffff; }
    .priority-medium { background: #2563eb; color: #ffffff; }
    .priority-low { background: #475569; color: #cbd5e1; }
    .overdue-pill {
      color: #ef4444;
      font-weight: 700;
      font-size: 0.72rem;
    }
    .ok-pill {
      color: #10b981;
      font-size: 0.72rem;
    }
    .overdue-row {
      background: rgba(239, 68, 68, 0.05);
    }
  `]
})
export class TicketsDrawerComponent {
  readonly tickets = input<TicketSummary[]>([]);
  readonly close = output<void>();
  readonly refresh = output<void>();
}
