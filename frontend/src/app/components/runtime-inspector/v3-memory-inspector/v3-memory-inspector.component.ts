import { Component, input, output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AgentV3State,
  ActiveDecisionItem,
  PendingTaskState,
  TurnPersistedState,
  ContextBudgetTokens
} from '../../../models/v3-memory.models';

@Component({
  selector: 'app-v3-memory-inspector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="v3-inspector-container">
      <!-- 1. Encabezado de Sesión y Memoria -->
      <section class="section-card session-meta-card">
        <div class="section-header">
          <div class="header-title-group">
            <svg class="header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <h3 class="section-title">Estado y Memoria (MySQL)</h3>
            <span class="v3-badge">v3</span>
          </div>

          <div class="session-badges">
            @if (state()?.confirmedConversationId; as cid) {
              <div class="cid-badge confirmed" title="Identificador de conversación confirmado por FastAPI en MySQL">
                <span class="db-dot"></span>
                <span class="badge-label">CONV:</span>
                <span class="badge-value">{{ abbreviateConvId(cid) }}</span>
              </div>
            } @else {
              <div class="cid-badge unconfirmed" title="Esperando primer turno o confirmación del backend">
                <span class="badge-label">CONV:</span>
                <span class="badge-value">Sin conversación activa</span>
              </div>
            }

            @if (showHitlControls() && hitlStatusBadge(); as hitl) {
              <div class="hitl-status-pill {{ hitl.tone }}">
                <span class="status-dot"></span>
                <span>{{ hitl.label }}</span>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- 2. Distinción Pedagógica: Tríada de Memoria -->
      <section class="pedagogy-triad-card" aria-label="Diferenciación conceptual de memoria">
        <div class="triad-header" (click)="togglePedagogy()" role="button" tabindex="0" (keydown.enter)="togglePedagogy()">
          <div class="triad-title-row">
            <svg class="triad-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span class="triad-title">Tríada Pedagógica: Estado ≠ Memoria Conversacional ≠ Decisiones</span>
          </div>
          <span class="toggle-hint">{{ isPedagogyExpanded() ? 'Ocultar' : 'Ver detalle' }}</span>
        </div>

        @if (isPedagogyExpanded()) {
          <div class="triad-grid">
            <div class="triad-item ram-item">
              <div class="item-tag-row">
                <span class="dot ram-dot"></span>
                <span class="item-tag">1. Estado de Ejecución (RAM)</span>
              </div>
              <p class="item-desc">Efímero del Agent Loop. Descartado al culminar el stream SSE.</p>
            </div>

            <div class="triad-item conv-item">
              <div class="item-tag-row">
                <span class="dot conv-dot"></span>
                <span class="item-tag">2. Memoria Conversacional</span>
              </div>
              <p class="item-desc">Historial en MySQL por conversación. Hidratado y persistido por turnos.</p>
            </div>

            <div class="triad-item dec-item">
              <div class="item-tag-row">
                <span class="dot dec-dot"></span>
                <span class="item-tag">3. Memoria de Decisiones</span>
              </div>
              <p class="item-desc">Preferencias y reglas gobernadas por persona. Persisten entre conversaciones.</p>
            </div>
          </div>
        }
      </section>

      <!-- 3. Context Budget Bar (Presupuesto de Tokens - Stitch Multi-Color) -->
      <section class="section-card budget-section" aria-labelledby="budget-heading">
        <div class="section-header">
          <div class="header-title-group">
            <svg class="header-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            <h4 id="budget-heading" class="section-subtitle">Presupuesto de Contexto</h4>
          </div>

          @if (budget(); as b) {
            <div class="budget-meta-tag">
              <span class="estimate-chip" title="Estimación heurística determinista del TokenBudgetManager">
                ESTIMADO
              </span>
              <span class="limit-chip">
                Límite: {{ b.maxContextLimit }} tokens
              </span>
            </div>
          }
        </div>

        @if (budget(); as b) {
          <div class="budget-bar-wrapper">
            <!-- Barra horizontal segmentada multi-color según referencia Stitch -->
            <div
              class="budget-bar-track"
              role="progressbar"
              [attr.aria-valuenow]="b.totalInitialTokensEst"
              [attr.aria-valuemin]="0"
              [attr.aria-valuemax]="b.maxContextLimit"
              [attr.aria-label]="'Uso estimado de contexto: ' + b.totalInitialTokensEst + ' de ' + b.maxContextLimit + ' tokens'"
            >
              <!-- Sistema (cyan) -->
              <div
                class="budget-segment seg-system"
                [style.width.%]="calcPercentage(b.systemPromptTokensEst, b.maxContextLimit)"
                [attr.title]="'Sistema (Prompt): ~' + b.systemPromptTokensEst + ' tokens est. (' + (calcPercentage(b.systemPromptTokensEst, b.maxContextLimit) | number:'1.1-1') + '%)'"
              ></div>
              <!-- Decisiones (violet) -->
              <div
                class="budget-segment seg-decisions"
                [style.width.%]="calcPercentage(b.decisionsTokensEst, b.maxContextLimit)"
                [attr.title]="'Decisiones y Preferencias: ~' + b.decisionsTokensEst + ' tokens est. (' + (calcPercentage(b.decisionsTokensEst, b.maxContextLimit) | number:'1.1-1') + '%)'"
              ></div>
              <!-- Historial hidratado (azul) -->
              <div
                class="budget-segment seg-history"
                [style.width.%]="calcPercentage(b.historyTokensEst, b.maxContextLimit)"
                [attr.title]="'Historial de Turnos Hidratado: ~' + b.historyTokensEst + ' tokens est. (' + (calcPercentage(b.historyTokensEst, b.maxContextLimit) | number:'1.1-1') + '%)'"
              ></div>
              <!-- Consulta actual (emerald) -->
              <div
                class="budget-segment seg-query"
                [style.width.%]="calcPercentage(b.queryTokensEst, b.maxContextLimit)"
                [attr.title]="'Consulta de Usuario: ~' + b.queryTokensEst + ' tokens est. (' + (calcPercentage(b.queryTokensEst, b.maxContextLimit) | number:'1.1-1') + '%)'"
              ></div>
              <!-- Espacio disponible / Margen de bucle -->
              <div
                class="budget-segment seg-available"
                [style.width.%]="calcAvailablePercentage(b)"
                [attr.title]="'Espacio Disponible para Bucle: ~' + b.availableHistoryBudget + ' tokens est.'"
              ></div>
            </div>

            <!-- Fila de total utilizado -->
            <div class="budget-total-row">
              <span class="budget-total-text">
                Ocupación Inicial: <strong>~{{ b.totalInitialTokensEst }}</strong> / {{ b.maxContextLimit }} tokens
                ({{ calcPercentage(b.totalInitialTokensEst, b.maxContextLimit) | number:'1.1-1' }}%)
              </span>
              <span class="budget-available-text">
                Margen Disponible Bucle: <strong>~{{ b.availableHistoryBudget }}</strong> tokens
              </span>
            </div>

            <!-- Desglose en cuadrícula visual con badges de color -->
            <div class="budget-metrics-grid">
              <div class="metric-card card-system">
                <div class="metric-top">
                  <span class="metric-dot dot-cyan"></span>
                  <span class="metric-label seg-system-label">Sistema</span>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">~{{ b.systemPromptTokensEst }} est.</span>
                  <span class="metric-pct">{{ calcPercentage(b.systemPromptTokensEst, b.maxContextLimit) | number:'1.1-1' }}%</span>
                </div>
              </div>

              <div class="metric-card card-decisions">
                <div class="metric-top">
                  <span class="metric-dot dot-violet"></span>
                  <span class="metric-label seg-decisions-label">Decisiones ({{ b.decisionsCount }})</span>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">~{{ b.decisionsTokensEst }} est.</span>
                  <span class="metric-pct">{{ calcPercentage(b.decisionsTokensEst, b.maxContextLimit) | number:'1.1-1' }}%</span>
                </div>
              </div>

              <div class="metric-card card-history">
                <div class="metric-top">
                  <span class="metric-dot dot-blue"></span>
                  <span class="metric-label seg-history-label">Historial ({{ b.historyTurnsCount }} turnos)</span>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">~{{ b.historyTokensEst }} est.</span>
                  <span class="metric-pct">{{ calcPercentage(b.historyTokensEst, b.maxContextLimit) | number:'1.1-1' }}%</span>
                </div>
              </div>

              <div class="metric-card card-query">
                <div class="metric-top">
                  <span class="metric-dot dot-emerald"></span>
                  <span class="metric-label seg-query-label">Consulta</span>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">~{{ b.queryTokensEst }} est.</span>
                  <span class="metric-pct">{{ calcPercentage(b.queryTokensEst, b.maxContextLimit) | number:'1.1-1' }}%</span>
                </div>
              </div>
            </div>
          </div>
        } @else {
          <div class="empty-placeholder">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Sin métricas de presupuesto. Se inicializará con el evento de hidratación.</span>
          </div>
        }
      </section>

      <!-- 4. Decision Inspector (Preferencias y Decisiones Persistidas en MySQL) -->
      <section class="section-card decisions-section" aria-labelledby="decisions-heading">
        <div class="section-header">
          <div class="header-title-group">
            <svg class="header-icon icon-violet" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <path d="m9 12 2 2 4-4"></path>
            </svg>
            <h4 id="decisions-heading" class="section-subtitle">
              Decisiones Persistentes ({{ (state()?.activeDecisions)?.length || 0 }})
            </h4>
          </div>
          <span class="provenance-tag" title="Decisiones autorizadas y aisladas por persona">Aislamiento por Persona</span>
        </div>

        @if (state()?.activeDecisions && (state()?.activeDecisions)!.length > 0) {
          <div class="decisions-list" role="list">
            @for (dec of state()?.activeDecisions; track dec.key) {
              <div class="decision-chip-card" [class.is-revoked]="dec.status === 'revoked'" role="listitem">
                <div class="chip-top-row">
                  <div class="chip-key-group">
                    <span class="chip-key">{{ dec.key }}</span>
                  </div>
                  <div class="chip-badges">
                    <span class="chip-scope {{ dec.scope }}" [attr.data-scope]="dec.scope">{{ scopeLabel(dec.scope) }}</span>
                    <span class="chip-version">v{{ dec.version }}</span>
                    @if (dec.status === 'revoked') {
                      <span class="chip-status-revoked">REVOCADO</span>
                    } @else {
                      <span class="chip-status-active">ACTIVO</span>
                    }
                  </div>
                </div>

                <div class="chip-value-row">
                  <span class="value-label">Valor:</span>
                  <code class="chip-value">{{ formatDecisionValue(dec.value) }}</code>
                </div>

                @if (dec.rationale) {
                  <p class="chip-rationale">{{ dec.rationale }}</p>
                }

                <div class="chip-footer">
                  <span class="chip-provenance">Origen: MySQL (Gobernanza autorizada)</span>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="empty-placeholder">
            <span>No hay preferencias activas registradas para esta persona en MySQL.</span>
          </div>
        }
      </section>

      <!-- 5. Memory Timeline (Persistencia e Hidratación de Turnos) -->
      <section class="section-card timeline-section" aria-labelledby="timeline-heading">
        <div class="section-header">
          <div class="header-title-group">
            <svg class="header-icon icon-emerald" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 14 14"></polyline>
            </svg>
            <h4 id="timeline-heading" class="section-subtitle">Memoria Conversacional</h4>
          </div>

          <div class="timeline-meta-counts">
            <span class="timeline-stat">Turnos Hidratados: {{ state()?.hydration?.hydratedTurnsCount || 0 }}</span>
            <span class="timeline-stat">Persistidos Sesión: {{ state()?.persistedTurns?.length || 0 }}</span>
          </div>
        </div>

        <div class="timeline-events-container">
          <!-- Hito 1: Hidratación desde MySQL (MEMORY_HYDRATED) -->
          @if (state()?.hydration; as hyd) {
            <div class="timeline-node hydration-node">
              <div class="node-indicator">
                <span class="indicator-dot cyan"></span>
                <span class="connector-line"></span>
              </div>
              <div class="node-content">
                <div class="node-header">
                  <div class="node-title-group">
                    <span class="node-title">MEMORY_HYDRATED</span>
                    <span class="mysql-badge">Origen: MySQL</span>
                  </div>
                  <span class="node-time">{{ hyd.hydratedAt | date:'HH:mm:ss' }}</span>
                </div>
                <p class="node-desc">
                  Se recuperaron <strong>{{ hyd.hydratedTurnsCount }} turnos</strong> previos y
                  <strong>{{ hyd.decisionsCount }} decisiones</strong> autorizadas en MySQL.
                </p>
              </div>
            </div>
          }

          <!-- Hitos 2: Turnos Persistidos en la Sesión Viva (TURN_PERSISTED) -->
          @for (turn of state()?.persistedTurns; track turn.turnId; let idx = $index; let isLast = $last) {
            <div class="timeline-node persistence-node">
              <div class="node-indicator">
                <span class="indicator-dot emerald"></span>
                @if (!isLast) {
                  <span class="connector-line"></span>
                }
              </div>
              <div class="node-content">
                <div class="node-header">
                  <div class="node-title-group">
                    <span class="node-title">TURN_PERSISTED &bull; Turno #{{ idx + 1 }}</span>
                    <span class="confirmed-badge">Confirmado</span>
                  </div>
                  <span class="node-time">{{ turn.timestamp | date:'HH:mm:ss' }}</span>
                </div>
                <div class="node-details">
                  <span class="turn-id-tag">ID: <code>{{ abbreviateTurnId(turn.turnId) }}</code></span>
                  <span class="status-badge-inline {{ turn.status }}">Guardado en MySQL</span>
                  <span class="conv-rel-tag">Conv: <code>{{ abbreviateConvId(turn.conversationId) }}</code></span>
                </div>
              </div>
            </div>
          }

          @if (!state()?.hydration && (!state()?.persistedTurns || state()?.persistedTurns?.length === 0)) {
            <div class="empty-placeholder">
              <span>Esperando ejecución del agente para registrar eventos de persistencia.</span>
            </div>
          }
        </div>
      </section>

      <!-- 6. Alerta de Recuperación (Mutación Incierta Bloqueada) -->
      @if (state()?.recoveryAlert; as alert) {
        <section class="section-card recovery-alert-card" role="alert" aria-live="assertive">
          <div class="alert-header">
            <svg class="alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <h4>Reconciliación Requerida (Mutación Incierta Bloqueada)</h4>
          </div>
          <p class="alert-reason">{{ alert.recoveryReason || 'La tarea mutativa quedó en estado no determinista y se bloqueó su reejecución automática.' }}</p>
          <div class="alert-meta-row">
            <span>Herramienta: <code>{{ alert.targetToolName }}</code></span>
            <span>ID Decisión: <code>{{ alert.decisionId }}</code></span>
          </div>
        </section>
      }

      <!-- 7. Tarea Pendiente / Human-in-the-Loop (HITL) - Secundario / No Intrusivo -->
      @if (showHitlControls()) {
        @if (state()?.pendingTask; as task) {
          <section class="section-card task-card" [class.resolved]="task.status === 'resolved'" [class.waiting]="state()?.hitlStatus === 'waiting_human_decision'">
            <div class="section-header">
              <div class="header-title-group">
                <svg class="header-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 14 14"></polyline>
                </svg>
                <h4 class="section-subtitle">Intervención Humana (HITL)</h4>
              </div>
              <span class="task-status-badge {{ task.status }}">
                {{ task.status | uppercase }}
              </span>
            </div>

            <div class="task-body">
              <p class="task-question">{{ task.question || 'Se requiere confirmación de un parámetro faltante para ejecutar la herramienta.' }}</p>
              <div class="task-info-grid">
                <div><span class="info-label">Herramienta:</span> <code>{{ task.targetToolName }}</code></div>
                <div><span class="info-label">Parámetro faltante:</span> <code>{{ task.missingParameterName }}</code></div>
              </div>

              @if (task.options && task.options.length > 0) {
                <div class="task-options-section">
                  <span class="options-title">Opciones Disponibles para Reanudación:</span>
                  <div class="options-button-group" role="group" aria-label="Opciones para reanudar la tarea">
                    @for (opt of task.options; track opt) {
                      <button
                        type="button"
                        class="btn-option"
                        [class.selected]="task.selectedValue === opt"
                        [disabled]="isOptionsDisabled()"
                        (click)="onSelectOption(task.decisionId, opt)"
                        [attr.aria-label]="'Seleccionar opción ' + opt"
                      >
                        <span class="opt-bullet">&bull;</span>
                        <span class="opt-text">{{ opt }}</span>
                        @if (task.selectedValue === opt) {
                          <span class="opt-check">&check;</span>
                        }
                      </button>
                    }
                  </div>
                </div>
              }

              @if (state()?.hitlStatus === 'resuming_task') {
                <div class="resuming-notice" role="status">
                  <span class="pulse-dot-cyan"></span>
                  <span>Enviando opción seleccionada al runtime de FastAPI...</span>
                </div>
              } @else if (task.status === 'resolved' && task.selectedValue) {
                <div class="resolved-notice">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>Reanudación ejecutada y confirmada con valor: <strong>{{ task.selectedValue }}</strong></span>
                </div>
              }
            </div>
          </section>
        } @else {
          <!-- Placeholder discreto según Stitch -->
          <section class="section-card task-card-empty">
            <div class="section-header">
              <div class="header-title-group">
                <svg class="header-icon text-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <h4 class="section-subtitle-muted">Tareas Pendientes (0)</h4>
              </div>
            </div>
            <div class="hitl-empty-notice">
              <span>No hay tareas pendientes en este momento.</span>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
      color: var(--text-primary);
      font-family: var(--font-sans);
    }

    .v3-inspector-container {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      width: 100%;
      min-width: 0;
      padding-bottom: 0.85rem;
    }

    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      transition: var(--transition-fast);
      min-width: 0;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .header-title-group {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .header-icon {
      color: var(--accent-cyan);
      flex-shrink: 0;
    }
    .header-icon.icon-violet {
      color: var(--accent-violet);
    }
    .header-icon.icon-emerald {
      color: var(--accent-emerald);
    }
    .header-icon.text-muted {
      color: var(--text-muted);
    }

    .section-title {
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: -0.2px;
      margin: 0;
      color: var(--text-primary);
    }

    .v3-badge {
      font-size: 0.65rem;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.35);
      color: var(--accent-violet-bright);
    }

    .section-subtitle {
      font-size: 0.82rem;
      font-weight: 600;
      margin: 0;
      color: var(--text-secondary);
    }

    .section-subtitle-muted {
      font-size: 0.76rem;
      font-weight: 500;
      margin: 0;
      color: var(--text-muted);
    }

    .session-badges {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .cid-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border-radius: var(--radius-sm);
      padding: 0.2rem 0.55rem;
      font-size: 0.72rem;
      font-family: var(--font-mono);
    }

    .cid-badge.confirmed {
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.28);
    }

    .cid-badge.unconfirmed {
      background: rgba(148, 163, 184, 0.08);
      border: 1px solid var(--border-default);
      color: var(--text-muted);
    }

    .db-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }

    .badge-label {
      color: var(--accent-cyan);
      font-weight: 700;
    }

    .badge-value {
      color: var(--text-primary);
    }

    .hitl-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border-radius: 12px;
      padding: 0.15rem 0.55rem;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .hitl-status-pill.amber {
      background: var(--accent-amber-bg);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--accent-amber);
    }
    .hitl-status-pill.cyan {
      background: var(--accent-cyan-bg);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
    }
    .hitl-status-pill.emerald {
      background: var(--accent-emerald-bg);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--accent-emerald);
    }
    .hitl-status-pill.crimson {
      background: var(--accent-crimson-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--accent-crimson);
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    /* 2. Banner de Distinción Pedagógica */
    .pedagogy-triad-card {
      background: rgba(13, 21, 39, 0.8);
      border: 1px solid rgba(56, 189, 248, 0.15);
      border-radius: var(--radius-md);
      padding: 0.65rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .triad-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }

    .triad-title-row {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .triad-icon {
      color: var(--accent-cyan);
    }

    .triad-title {
      font-size: 0.74rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .toggle-hint {
      font-size: 0.68rem;
      color: var(--accent-cyan);
      text-decoration: underline;
    }

    .triad-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      padding-top: 0.35rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .triad-item {
      background: rgba(7, 11, 20, 0.5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.55rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .item-tag-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .ram-dot { background: #f59e0b; }
    .conv-dot { background: #3b82f6; }
    .dec-dot { background: #a855f7; }

    .item-tag {
      font-size: 0.66rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .item-desc {
      font-size: 0.66rem;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.3;
    }

    /* 3. Presupuesto de Contexto (Stitch Multi-Color Bar) */
    .budget-meta-tag {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .estimate-chip {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-family: var(--font-mono);
    }

    .limit-chip {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .budget-bar-track {
      height: 12px;
      border-radius: 9999px;
      background: #090d16;
      border: 1px solid var(--border-default);
      display: flex;
      overflow: hidden;
      width: 100%;
      margin: 0.35rem 0 0.55rem 0;
      padding: 1px;
      box-sizing: border-box;
    }

    .budget-segment {
      height: 100%;
      transition: width 0.3s ease;
    }

    /* Colores oficiales de Stitch */
    .seg-system {
      background: var(--accent-cyan);
    }
    .seg-decisions {
      background: var(--accent-violet);
    }
    .seg-history {
      background: #3b82f6;
    }
    .seg-query {
      background: var(--accent-emerald);
    }
    .seg-available {
      background: #1e293b;
      flex-grow: 1;
    }

    .budget-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.74rem;
      color: var(--text-secondary);
      border-top: 1px solid var(--border-subtle);
      padding-top: 0.45rem;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .budget-total-text strong {
      color: var(--text-primary);
      font-family: var(--font-mono);
    }

    .budget-available-text strong {
      color: var(--accent-emerald);
      font-family: var(--font-mono);
    }

    .budget-metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.45rem;
      margin-top: 0.45rem;
    }

    .metric-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.55rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .metric-top {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .metric-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-cyan { background: var(--accent-cyan); }
    .dot-violet { background: var(--accent-violet); }
    .dot-blue { background: #3b82f6; }
    .dot-emerald { background: var(--accent-emerald); }

    .metric-label {
      font-size: 0.68rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .seg-system-label { color: #7dd3fc; }
    .seg-decisions-label { color: #c084fc; }
    .seg-history-label { color: #93c5fd; }
    .seg-query-label { color: #6ee7b7; }

    .metric-value-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.3rem;
    }

    .metric-val {
      font-size: 0.76rem;
      font-family: var(--font-mono);
      color: var(--text-primary);
    }

    .metric-pct {
      font-size: 0.64rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }

    /* 4. Decision Inspector */
    .provenance-tag {
      font-size: 0.65rem;
      color: var(--accent-violet-bright);
      background: rgba(168, 85, 247, 0.1);
      border: 1px solid rgba(168, 85, 247, 0.25);
      border-radius: 3px;
      padding: 0.1rem 0.35rem;
    }

    .decisions-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .decision-chip-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.55rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      transition: var(--transition-fast);
    }

    .decision-chip-card.is-revoked {
      opacity: 0.65;
      border-color: rgba(239, 68, 68, 0.35);
      background: rgba(239, 68, 68, 0.04);
    }

    .chip-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .chip-key {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--accent-cyan);
      font-family: var(--font-mono);
    }

    .chip-badges {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .chip-scope {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-family: var(--font-mono);
    }
    .chip-scope.persistent {
      background: var(--accent-emerald-bg);
      color: var(--accent-emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .chip-scope.session {
      background: rgba(168, 85, 247, 0.12);
      color: var(--accent-violet-bright);
      border: 1px solid rgba(168, 85, 247, 0.3);
    }
    .chip-scope.ephemeral {
      background: rgba(148, 163, 184, 0.1);
      color: var(--text-muted);
      border: 1px solid var(--border-default);
    }

    .chip-version {
      font-size: 0.62rem;
      font-weight: 700;
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-secondary);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-family: var(--font-mono);
    }

    .chip-status-active {
      font-size: 0.62rem;
      font-weight: 700;
      color: var(--accent-emerald);
    }

    .chip-status-revoked {
      font-size: 0.62rem;
      font-weight: 700;
      background: var(--accent-crimson-bg);
      color: var(--accent-crimson);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .chip-value-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.74rem;
    }

    .value-label {
      color: var(--text-muted);
    }

    .chip-value {
      color: var(--text-primary);
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 0.15rem 0.45rem;
      border-radius: 3px;
      font-family: var(--font-mono);
      font-size: 0.74rem;
    }

    .chip-rationale {
      font-size: 0.7rem;
      color: var(--text-secondary);
      margin: 0;
      font-style: italic;
      line-height: 1.35;
    }

    .chip-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.2rem;
    }

    .chip-provenance {
      font-size: 0.64rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    /* 5. Memory Timeline */
    .timeline-meta-counts {
      display: flex;
      gap: 0.6rem;
      font-size: 0.7rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .timeline-events-container {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      margin-top: 0.25rem;
    }

    .timeline-node {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      position: relative;
    }

    .node-indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 14px;
      flex-shrink: 0;
    }

    .indicator-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 4px;
    }
    .indicator-dot.cyan {
      background: var(--accent-cyan);
      box-shadow: 0 0 8px var(--accent-cyan);
    }
    .indicator-dot.emerald {
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
    }

    .connector-line {
      width: 1px;
      height: calc(100% + 0.65rem);
      background: var(--border-default);
      margin-top: 3px;
    }

    .node-content {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.45rem 0.65rem;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .node-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .node-title-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .node-title {
      font-size: 0.74rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text-primary);
    }

    .mysql-badge {
      font-size: 0.62rem;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: var(--accent-cyan);
      padding: 0.05rem 0.35rem;
      border-radius: 3px;
    }

    .confirmed-badge {
      font-size: 0.62rem;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--accent-emerald);
      padding: 0.05rem 0.35rem;
      border-radius: 3px;
    }

    .node-time {
      font-size: 0.66rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .node-desc {
      font-size: 0.72rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.35;
    }

    .node-details {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--text-secondary);
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .turn-id-tag code, .conv-rel-tag code {
      font-family: var(--font-mono);
      color: var(--text-primary);
      background: rgba(0, 0, 0, 0.3);
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
    }

    .status-badge-inline {
      color: var(--accent-emerald);
      font-size: 0.68rem;
      font-weight: 600;
    }

    /* 6. Recovery Alert */
    .recovery-alert-card {
      background: rgba(239, 68, 68, 0.08);
      border-color: rgba(239, 68, 68, 0.35);
    }
    .alert-header {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      color: var(--accent-crimson);
    }
    .alert-header h4 {
      font-size: 0.82rem;
      font-weight: 700;
      margin: 0;
    }
    .alert-reason {
      font-size: 0.78rem;
      color: var(--text-primary);
      margin: 0;
      line-height: 1.4;
    }
    .alert-meta-row {
      display: flex;
      gap: 0.75rem;
      font-size: 0.72rem;
      color: var(--text-secondary);
    }

    /* 7. Task Card (HITL) */
    .task-card.waiting {
      border-color: rgba(245, 158, 11, 0.4);
      box-shadow: 0 0 14px rgba(245, 158, 11, 0.08);
    }
    .task-card.resolved {
      border-color: rgba(16, 185, 129, 0.35);
    }
    .task-status-badge {
      font-size: 0.66rem;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: var(--radius-sm);
    }
    .task-status-badge.pending {
      background: var(--accent-amber-bg);
      color: var(--accent-amber);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .task-status-badge.resolved {
      background: var(--accent-emerald-bg);
      color: var(--accent-emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .task-body {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .task-question {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }
    .task-info-grid {
      display: flex;
      gap: 1rem;
      font-size: 0.74rem;
      color: var(--text-secondary);
      flex-wrap: wrap;
    }
    .info-label {
      color: var(--text-muted);
    }
    .task-options-section {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .options-title {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .options-button-group {
      display: flex;
      gap: 0.45rem;
      flex-wrap: wrap;
    }
    .btn-option {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      padding: 0.4rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-family: var(--font-mono);
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-option:hover:not(:disabled) {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
      transform: translateY(-1px);
    }
    .btn-option.selected {
      background: var(--accent-emerald-bg);
      border-color: var(--accent-emerald);
      color: var(--accent-emerald);
    }
    .btn-option:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .resuming-notice {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.74rem;
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.2);
      padding: 0.35rem 0.65rem;
      border-radius: var(--radius-sm);
    }
    .pulse-dot-cyan {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
      animation: pulseAnim 1s infinite alternate;
    }
    .resolved-notice {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.74rem;
      color: var(--accent-emerald);
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 0.3rem 0.6rem;
      border-radius: var(--radius-sm);
    }

    .task-card-empty {
      background: transparent;
      border: 1px dashed var(--border-subtle);
      padding: 0.55rem 0.85rem;
    }

    .hitl-empty-notice {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-style: italic;
    }

    /* Common Empty Placeholder */
    .empty-placeholder {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.75rem 0.85rem;
      background: var(--bg-surface);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: 0.74rem;
    }

    @keyframes pulseAnim {
      from { transform: scale(0.85); opacity: 0.6; }
      to { transform: scale(1.15); opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    }

    @media (max-width: 768px) {
      .triad-grid {
        grid-template-columns: 1fr;
      }
      .budget-metrics-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 480px) {
      .section-card {
        padding: 0.65rem 0.75rem;
      }
      .budget-metrics-grid {
        grid-template-columns: 1fr;
      }
      .budget-total-row {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `]
})
export class V3MemoryInspectorComponent {
  readonly state = input<AgentV3State | null>(null);

  /**
   * Enfoque pedagógico: en la lección de State & Memory se muestran los controles
   * interactivos únicamente cuando existan tareas pendientes.
   */
  readonly showHitlControls = input<boolean>(true);

  /**
   * Control para desplegar/contraer la tarjeta pedagógica.
   */
  readonly isPedagogyExpanded = signal<boolean>(true);

  /**
   * Evento emitido cuando el usuario selecciona una opción de una tarea HITL.
   */
  readonly selectTaskOption = output<{ decisionId: string; selectedValue: string }>();

  readonly budget = computed<ContextBudgetTokens | null>(() => {
    return this.state()?.hydration?.budget || null;
  });

  readonly hitlStatusBadge = computed<{ label: string; tone: string } | null>(() => {
    const s = this.state();
    if (!s) return null;
    switch (s.hitlStatus) {
      case 'waiting_human_decision':
        return { label: 'Acción Humana Requerida', tone: 'amber' };
      case 'resuming_task':
        return { label: 'Reanudando Tarea...', tone: 'cyan' };
      case 'resolved':
        return { label: 'HITL Resuelta', tone: 'emerald' };
      case 'recovery_required':
        return { label: 'Reconciliación Requerida', tone: 'crimson' };
      default:
        return null;
    }
  });

  togglePedagogy(): void {
    this.isPedagogyExpanded.update((v) => !v);
  }

  calcPercentage(value: number | undefined, max: number | undefined): number {
    if (typeof value !== 'number' || typeof max !== 'number' || isNaN(value) || isNaN(max) || max <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (value / max) * 100));
  }

  calcAvailablePercentage(b: ContextBudgetTokens | null): number {
    if (!b || !b.maxContextLimit || b.maxContextLimit <= 0) return 0;
    const used = (b.systemPromptTokensEst || 0) +
                 (b.decisionsTokensEst || 0) +
                 (b.historyTokensEst || 0) +
                 (b.queryTokensEst || 0);
    const available = Math.max(0, b.maxContextLimit - used);
    return Math.min(100, Math.max(0, (available / b.maxContextLimit) * 100));
  }

  scopeLabel(scope: string | undefined): string {
    switch (scope?.toLowerCase()) {
      case 'persistent':
        return 'PERSISTENTE';
      case 'session':
        return 'SESIÓN';
      case 'ephemeral':
        return 'EFÍMERO';
      default:
        return (scope || 'PERSISTENTE').toUpperCase();
    }
  }

  abbreviateConvId(id: string | null | undefined): string {
    if (!id) return 'Sin conversación activa';
    if (id.length <= 16) return id;
    return id.substring(0, 14) + '...';
  }

  abbreviateTurnId(id: string | null | undefined): string {
    if (!id) return '';
    if (id.length <= 14) return id;
    return id.substring(0, 12) + '...';
  }

  isOptionsDisabled(): boolean {
    const s = this.state();
    if (!s) return false;
    return (
      s.hitlStatus === 'resuming_task' ||
      s.hitlStatus === 'resolved' ||
      s.hitlStatus === 'recovery_required' ||
      s.isRecoveryRequired
    );
  }

  onSelectOption(decisionId: string, selectedValue: string): void {
    if (this.isOptionsDisabled()) return;
    this.selectTaskOption.emit({ decisionId, selectedValue });
  }

  formatDecisionValue(val: any): string {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  }
}
