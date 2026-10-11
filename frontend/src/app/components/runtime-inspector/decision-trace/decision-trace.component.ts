import {
  Component,
  input,
  output,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  DecisionTraceEntry,
  TraceCategory,
  TraceViewMode
} from '../../../models/decision-trace.models';

@Component({
  selector: 'app-decision-trace',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="decision-trace-panel" aria-label="Panel de Traza de Decisiones Observable">
      <!-- Barra superior de controles del panel -->
      <div class="trace-header">
        <div class="header-left">
          <div class="title-with-badge">
            <svg class="trace-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <h3 class="trace-title">Traza de decisiones observable</h3>
            <span class="count-chip" [attr.aria-label]="filteredEntries().length + ' decisiones observables'">
              {{ filteredEntries().length }} {{ filteredEntries().length === 1 ? 'evento' : 'eventos' }}
            </span>
          </div>
          <span class="trace-subtitle">Registro cronológico de evidencia observable del agente</span>
        </div>

        <div class="header-controls">
          <!-- Conmutador Resumen / Técnico -->
          <div class="view-mode-toggle" role="radiogroup" aria-label="Modo de vista de la traza">
            <button
              type="button"
              class="btn-mode-toggle"
              [class.active]="viewMode() === 'summary'"
              (click)="onToggleViewMode('summary')"
              role="radio"
              [attr.aria-checked]="viewMode() === 'summary'"
              title="Vista didáctica y comprensible para estudiantes"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span>Resumen</span>
            </button>
            <button
              type="button"
              class="btn-mode-toggle"
              [class.active]="viewMode() === 'technical'"
              (click)="onToggleViewMode('technical')"
              role="radio"
              [attr.aria-checked]="viewMode() === 'technical'"
              title="Vista técnica de eventos, parámetros sanitizados y datos verificables"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              <span>Técnico</span>
            </button>
          </div>

          <!-- Botón Ocultar Panel -->
          <button
            type="button"
            class="btn-close-trace"
            (click)="closeTrace.emit()"
            title="Ocultar traza de decisiones"
            aria-label="Ocultar traza de decisiones"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span class="hide-text">Ocultar</span>
          </button>
        </div>
      </div>

      <!-- Barra de filtros por categoría soberana -->
      <div class="category-filters-bar" role="tablist" aria-label="Filtro por categoría de decisión">
        <button
          type="button"
          class="cat-filter-btn"
          [class.active]="selectedCategory() === 'all'"
          (click)="selectedCategory.set('all')"
          role="tab"
          [attr.aria-selected]="selectedCategory() === 'all'"
        >
          <span>Todos ({{ entries().length }})</span>
        </button>
        <button
          type="button"
          class="cat-filter-btn modelo"
          [class.active]="selectedCategory() === 'modelo'"
          (click)="selectedCategory.set('modelo')"
          role="tab"
          [attr.aria-selected]="selectedCategory() === 'modelo'"
        >
          <span class="cat-dot modelo"></span>
          <span>Modelo ({{ countByCategory('modelo') }})</span>
        </button>
        <button
          type="button"
          class="cat-filter-btn runtime"
          [class.active]="selectedCategory() === 'runtime'"
          (click)="selectedCategory.set('runtime')"
          role="tab"
          [attr.aria-selected]="selectedCategory() === 'runtime'"
        >
          <span class="cat-dot runtime"></span>
          <span>Runtime ({{ countByCategory('runtime') }})</span>
        </button>
        <button
          type="button"
          class="cat-filter-btn memoria"
          [class.active]="selectedCategory() === 'memoria'"
          (click)="selectedCategory.set('memoria')"
          role="tab"
          [attr.aria-selected]="selectedCategory() === 'memoria'"
        >
          <span class="cat-dot memoria"></span>
          <span>Memoria ({{ countByCategory('memoria') }})</span>
        </button>
        <button
          type="button"
          class="cat-filter-btn resultado"
          [class.active]="selectedCategory() === 'resultado'"
          (click)="selectedCategory.set('resultado')"
          role="tab"
          [attr.aria-selected]="selectedCategory() === 'resultado'"
        >
          <span class="cat-dot resultado"></span>
          <span>Resultado ({{ countByCategory('resultado') }})</span>
        </button>
      </div>

      <!-- Aviso pedagógico de veracidad estricta -->
      <div class="pedagogy-alert" role="note">
        <svg class="alert-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <p class="alert-message">
          <strong>Evidencia técnica observable:</strong> Se reportan únicamente eventos y parámetros emitidos por el runtime. No se afirma revelar el razonamiento interno privado del LLM ni se simula Chain-of-Thought ficticio.
        </p>
      </div>

      <!-- Contenedor del Timeline de Decisiones -->
      <div class="trace-timeline-container" role="feed" aria-busy="false">
        @if (filteredEntries().length === 0) {
          <div class="empty-trace-card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p class="empty-title">Sin eventos observables en esta categoría</p>
            <p class="empty-desc">Inicia una consulta en el chat o ajusta los filtros para visualizar la secuencia de decisiones.</p>
          </div>
        } @else {
          <ol class="timeline-list">
            @for (item of filteredEntries(); track item.id) {
              <li
                class="timeline-card cat-{{ item.category }}"
                [class.is-active]="isItemActive(item)"
                [class.is-error]="item.status === 'failed'"
                [attr.aria-label]="item.title"
              >
                <!-- Indicador de nodo cronológico -->
                <div class="node-indicator">
                  <span class="node-dot cat-{{ item.category }}"></span>
                  <span class="node-line"></span>
                </div>

                <div class="card-inner">
                  <!-- Cabecera de la decisión -->
                  <div class="card-header-row">
                    <div class="badges-row">
                      <span class="category-pill cat-{{ item.category }}">
                        {{ item.category | uppercase }}
                      </span>
                      <span class="actor-chip">
                        <span class="actor-label">{{ item.actor }}</span>
                      </span>
                      @if (item.iterationIndex) {
                        <span class="iteration-chip">Iteración {{ item.iterationIndex }}</span>
                      }
                      @if (item.hopNumber) {
                        <span class="hop-chip">HOP {{ item.hopNumber }}</span>
                      }
                    </div>

                    <div class="meta-right">
                      @if (item.executionDurationMs !== undefined) {
                        <span class="duration-chip">{{ item.executionDurationMs }} ms</span>
                      }
                      <span class="status-pill status-{{ item.status }}">
                        {{ getStatusLabel(item.status) }}
                      </span>
                      <time class="timestamp-text">{{ item.timestamp | date:'HH:mm:ss.SSS' }}</time>
                    </div>
                  </div>

                  <!-- Título principal de la decisión -->
                  <h4 class="card-title">{{ item.title }}</h4>

                  <!-- CONTENIDO: Vista Resumen (Didáctica) -->
                  @if (viewMode() === 'summary') {
                    <div class="summary-view-content">
                      <p class="summary-headline">{{ item.summaryHeadline }}</p>
                      <div class="insight-box">
                        <span class="insight-label">Por qué importa:</span>
                        <p class="insight-text">{{ item.summaryPedagogy }}</p>
                      </div>
                      <div class="evidence-box">
                        <span class="evidence-label">Evidencia observable:</span>
                        <code class="evidence-code">{{ item.evidenceText }}</code>
                      </div>
                    </div>
                  }

                  <!-- CONTENIDO: Vista Técnico (Detalle Verificable) -->
                  @if (viewMode() === 'technical') {
                    <div class="technical-view-content">
                      <div class="tech-meta-grid">
                        <div class="meta-field">
                          <span class="f-key">Tipo de Evento:</span>
                          <span class="f-val font-mono text-cyan">{{ item.eventType }}</span>
                        </div>
                        <div class="meta-field">
                          <span class="f-key">Fase del Runtime:</span>
                          <span class="f-val font-mono">{{ item.phase || 'No disponible' }}</span>
                        </div>
                        <div class="meta-field">
                          <span class="f-key">ID de Evento:</span>
                          <span class="f-val font-mono text-muted">{{ item.eventId }}</span>
                        </div>
                      </div>

                      @if (item.errorDetail) {
                        <div class="error-banner">
                          <span class="err-tag">Detalle del Error:</span>
                          <span class="err-text font-mono">{{ item.errorDetail }}</span>
                        </div>
                      }

                      @if (item.sanitizedParams.length > 0) {
                        <div class="params-block">
                          <span class="params-heading">Parámetros Sanitizados (Sin Credenciales):</span>
                          <div class="params-table">
                            @for (param of item.sanitizedParams; track param.key) {
                              <div class="param-row">
                                <span class="param-name font-mono">{{ param.key }}</span>
                                <span class="param-value font-mono">{{ param.value }}</span>
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </li>
            }
          </ol>
        }
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .decision-trace-panel {
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-card);
      margin-bottom: var(--space-3);
      transition: border-color var(--transition-fast);
    }

    /* 1. Cabecera principal */
    .trace-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .trace-icon {
      color: var(--accent-cyan);
      flex-shrink: 0;
    }

    .trace-title {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }

    .count-chip {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      font-size: 0.65rem;
      font-weight: 600;
      font-family: var(--font-mono);
      padding: 1px 7px;
      border-radius: var(--radius-full);
    }

    .trace-subtitle {
      font-size: 0.70rem;
      color: var(--text-muted);
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Alternador Resumen / Técnico */
    .view-mode-toggle {
      display: flex;
      background: var(--bg-code);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 2px;
      gap: 2px;
    }

    .btn-mode-toggle {
      display: flex;
      align-items: center;
      gap: 5px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.70rem;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: var(--radius-xs);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .btn-mode-toggle:hover {
      color: var(--text-primary);
    }

    .btn-mode-toggle.active {
      background: rgba(56, 189, 248, 0.2);
      color: var(--accent-cyan);
      border: 1px solid rgba(56, 189, 248, 0.35);
    }

    .btn-close-trace {
      display: flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 0.70rem;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .btn-close-trace:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: var(--accent-crimson);
    }

    /* 2. Barra de filtros de categoría */
    .category-filters-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: rgba(13, 21, 39, 0.7);
      border-bottom: 1px solid var(--border-subtle);
      overflow-x: auto;
      white-space: nowrap;
    }

    .cat-filter-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: 0.68rem;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .cat-filter-btn:hover {
      border-color: var(--border-prominent);
      color: var(--text-primary);
    }

    .cat-filter-btn.active {
      background: var(--bg-card-hover);
      color: var(--text-primary);
      border-color: var(--accent-cyan);
    }

    .cat-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .cat-dot.modelo { background: var(--accent-cyan); box-shadow: 0 0 4px var(--accent-cyan); }
    .cat-dot.runtime { background: var(--accent-amber); box-shadow: 0 0 4px var(--accent-amber); }
    .cat-dot.memoria { background: var(--accent-violet); box-shadow: 0 0 4px var(--accent-violet); }
    .cat-dot.resultado { background: var(--accent-emerald); box-shadow: 0 0 4px var(--accent-emerald); }

    /* 3. Alerta pedagógica */
    .pedagogy-alert {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(56, 189, 248, 0.05);
      border-bottom: 1px solid rgba(56, 189, 248, 0.12);
    }

    .alert-icon {
      color: var(--accent-cyan);
      margin-top: 2px;
      flex-shrink: 0;
    }

    .alert-message {
      margin: 0;
      font-size: 0.68rem;
      line-height: 1.35;
      color: var(--text-secondary);
    }

    .alert-message strong {
      color: var(--accent-cyan);
    }

    /* 4. Lista del timeline */
    .trace-timeline-container {
      max-height: 380px;
      overflow-y: auto;
      padding: 12px 14px;
    }

    .timeline-list {
      list-style: none;
      margin: 0;
      padding: 0 0 0 10px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .timeline-card {
      position: relative;
      display: flex;
      gap: 12px;
    }

    /* Nodo vertical del timeline */
    .node-indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 14px;
      flex-shrink: 0;
      position: relative;
      padding-top: 4px;
    }

    .node-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid var(--bg-card);
      z-index: 2;
    }

    .node-dot.cat-modelo { background: var(--accent-cyan); box-shadow: 0 0 8px rgba(0, 240, 255, 0.6); }
    .node-dot.cat-runtime { background: var(--accent-amber); box-shadow: 0 0 8px rgba(245, 158, 11, 0.6); }
    .node-dot.cat-memoria { background: var(--accent-violet); box-shadow: 0 0 8px rgba(168, 85, 247, 0.6); }
    .node-dot.cat-resultado { background: var(--accent-emerald); box-shadow: 0 0 8px rgba(16, 185, 129, 0.6); }

    .node-line {
      position: absolute;
      top: 14px;
      bottom: -16px;
      width: 2px;
      background: var(--border-subtle);
      z-index: 1;
    }

    .timeline-card:last-child .node-line {
      display: none;
    }

    /* Tarjeta interior */
    .card-inner {
      flex: 1;
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 9px 12px;
      transition: all var(--transition-fast);
      overflow: hidden;
    }

    .timeline-card:hover .card-inner {
      border-color: var(--border-prominent);
      background: var(--bg-card-hover);
    }

    .timeline-card.is-active .card-inner {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.18);
    }

    .timeline-card.is-error .card-inner {
      border-color: var(--accent-crimson);
      background: rgba(239, 68, 68, 0.06);
    }

    /* Borde lateral según categoría */
    .timeline-card.cat-modelo .card-inner { border-left: 3px solid var(--accent-cyan); }
    .timeline-card.cat-runtime .card-inner { border-left: 3px solid var(--accent-amber); }
    .timeline-card.cat-memoria .card-inner { border-left: 3px solid var(--accent-violet); }
    .timeline-card.cat-resultado .card-inner { border-left: 3px solid var(--accent-emerald); }

    /* Fila de insignias */
    .card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }

    .badges-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .category-pill {
      font-size: 0.60rem;
      font-weight: 800;
      font-family: var(--font-mono);
      padding: 1px 6px;
      border-radius: var(--radius-xs);
      letter-spacing: 0.04em;
    }

    .category-pill.cat-modelo { background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan); border: 1px solid rgba(56, 189, 248, 0.3); }
    .category-pill.cat-runtime { background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); border: 1px solid rgba(245, 158, 11, 0.3); }
    .category-pill.cat-memoria { background: rgba(168, 85, 247, 0.15); color: var(--accent-violet); border: 1px solid rgba(168, 85, 247, 0.3); }
    .category-pill.cat-resultado { background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.3); }

    .actor-chip {
      font-size: 0.64rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-code);
      padding: 1px 6px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-subtle);
    }

    .iteration-chip, .hop-chip {
      font-size: 0.60rem;
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.04);
      padding: 1px 5px;
      border-radius: var(--radius-xs);
    }

    .meta-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .duration-chip {
      font-size: 0.62rem;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      background: var(--bg-code);
      padding: 1px 5px;
      border-radius: var(--radius-xs);
    }

    .status-pill {
      font-size: 0.60rem;
      font-weight: 700;
      text-transform: uppercase;
      font-family: var(--font-mono);
      padding: 1px 5px;
      border-radius: var(--radius-xs);
    }

    .status-pill.status-completed { color: var(--accent-emerald); background: rgba(16, 185, 129, 0.12); }
    .status-pill.status-running { color: var(--accent-cyan); background: rgba(56, 189, 248, 0.15); }
    .status-pill.status-failed { color: var(--accent-crimson); background: rgba(239, 68, 68, 0.15); }
    .status-pill.status-skipped { color: var(--text-muted); background: rgba(255, 255, 255, 0.05); }

    .timestamp-text {
      font-size: 0.62rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }

    .card-title {
      margin: 0 0 6px 0;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.3;
    }

    /* 5. Contenido Vista Resumen */
    .summary-view-content {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .summary-headline {
      margin: 0;
      font-size: 0.74rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .insight-box {
      background: rgba(255, 255, 255, 0.02);
      border-left: 2px solid var(--accent-cyan);
      padding: 4px 8px;
      border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
    }

    .insight-label {
      font-size: 0.62rem;
      font-weight: 700;
      color: var(--accent-cyan);
      display: block;
      margin-bottom: 2px;
    }

    .insight-text {
      margin: 0;
      font-size: 0.70rem;
      color: var(--text-secondary);
      line-height: 1.35;
    }

    .evidence-box {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 0.68rem;
      flex-wrap: wrap;
    }

    .evidence-label {
      font-weight: 600;
      color: var(--text-muted);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .evidence-code {
      font-family: var(--font-mono);
      color: var(--text-primary);
      background: var(--bg-code);
      padding: 1px 5px;
      border-radius: var(--radius-xs);
      font-size: 0.68rem;
      word-break: break-all;
    }

    /* 6. Contenido Vista Técnico */
    .technical-view-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tech-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 6px;
      background: var(--bg-code);
      padding: 6px 10px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-subtle);
    }

    .meta-field {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .f-key {
      font-size: 0.60rem;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .f-val {
      font-size: 0.68rem;
      color: var(--text-primary);
    }

    .error-banner {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 5px 8px;
      border-radius: var(--radius-xs);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .err-tag {
      font-size: 0.62rem;
      font-weight: 700;
      color: var(--accent-crimson);
      text-transform: uppercase;
    }

    .err-text {
      font-size: 0.68rem;
      color: #fca5a5;
    }

    .params-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .params-heading {
      font-size: 0.62rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .params-table {
      background: var(--bg-code);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xs);
      overflow: hidden;
    }

    .param-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 3px 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      font-size: 0.66rem;
    }

    .param-row:last-child {
      border-bottom: none;
    }

    .param-name {
      color: var(--accent-cyan);
      font-weight: 600;
      flex-shrink: 0;
    }

    .param-value {
      color: var(--text-primary);
      text-align: right;
      word-break: break-all;
    }

    /* Estado vacío */
    .empty-trace-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      text-align: center;
      color: var(--text-muted);
      gap: 6px;
    }

    .empty-title {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .empty-desc {
      margin: 0;
      font-size: 0.70rem;
      color: var(--text-muted);
      max-width: 320px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .trace-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .header-controls {
        width: 100%;
        justify-content: space-between;
      }
      .card-header-row {
        flex-direction: column;
        align-items: flex-start;
      }
      .meta-right {
        width: 100%;
        justify-content: space-between;
      }
    }
  `]
})
export class DecisionTraceComponent {
  readonly entries = input<DecisionTraceEntry[]>([]);
  readonly viewMode = input<TraceViewMode>('summary');
  readonly selectedIterationIndex = input<number | undefined>(undefined);
  readonly selectedHopNumber = input<number | undefined>(undefined);

  readonly toggleViewMode = output<TraceViewMode>();
  readonly closeTrace = output<void>();

  readonly selectedCategory = signal<TraceCategory | 'all'>('all');

  readonly filteredEntries = computed<DecisionTraceEntry[]>(() => {
    const list = this.entries();
    const cat = this.selectedCategory();
    if (cat === 'all') return list;
    return list.filter((e) => e.category === cat);
  });

  countByCategory(category: TraceCategory): number {
    return this.entries().filter((e) => e.category === category).length;
  }

  onToggleViewMode(mode: TraceViewMode): void {
    this.toggleViewMode.emit(mode);
  }

  isItemActive(item: DecisionTraceEntry): boolean {
    const iter = this.selectedIterationIndex();
    const hop = this.selectedHopNumber();
    if (iter && item.iterationIndex === iter) return true;
    if (hop && item.hopNumber === hop) return true;
    return false;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Hecho';
      case 'running': return 'En curso';
      case 'failed': return 'Fallo';
      case 'skipped': return 'Omitido';
      default: return 'Info';
    }
  }
}
