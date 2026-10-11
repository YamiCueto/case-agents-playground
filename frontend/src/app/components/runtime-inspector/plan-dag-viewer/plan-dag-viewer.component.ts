import { Component, input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AgentV4PlanningState,
  PlanModel,
  PlanStepModel,
  PlanRevisionSnapshot,
  StepStatus,
  StepExecutor,
  STEP_STATUS_BADGES,
  EXECUTOR_BADGES
} from '../../../models/plan.models';

interface DAGNodePosition {
  step: PlanStepModel;
  x: number;
  y: number;
  level: number;
  isBlocked: boolean;
  isReady: boolean;
}

interface DAGEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromId: string;
  toId: string;
  isActive: boolean;
  isResolved: boolean;
}

@Component({
  selector: 'app-plan-dag-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dag-viewer-container" role="region" aria-label="Visualizador de Planificación DAG">
      <!-- 1. HEADER DE PLANIFICACIÓN: META ORIGINAL, REVISIÓN Y ESTADO -->
      <header class="dag-header">
        <div class="goal-row">
          <div class="goal-meta">
            <span class="badge-plan-version">AGENT v4 &bull; DAG</span>
            <div class="status-indicator-group">
              @if (isStalled()) {
                <span class="pill-status pill-stalled" title="Detención segura por dependencias insatisfechas">
                  <span class="dot-stall"></span> RUNTIME STALL (no_executable_steps)
                </span>
              } @else if (isCompleted()) {
                <span class="pill-status pill-completed">
                  <span class="dot-completed"></span> PLAN COMPLETADO
                </span>
              } @else if (isValidated()) {
                <span class="pill-status pill-active">
                  <span class="dot-active"></span> PLAN VALIDADO &bull; EN EJECUCIÓN
                </span>
              } @else {
                <span class="pill-status pill-idle">
                  <span class="dot-idle"></span> ESPERANDO PLAN
                </span>
              }
            </div>
          </div>

          <!-- Selector de revisiones (Revisión actual vs Historial de Replanning) -->
          @if (allRevisions().length > 1) {
            <div class="revision-selector" role="tablist" aria-label="Revisiones del plan">
              <span class="rev-label">Revisiones:</span>
              @for (rev of allRevisions(); track rev.revision) {
                <button
                  type="button"
                  class="rev-btn"
                  [class.active]="selectedRevisionNum() === rev.revision"
                  [class.is-archived]="rev.isArchived"
                  (click)="selectedRevisionNum.set(rev.revision)"
                  [title]="rev.isArchived ? 'Snapshot inmutable archivado en plan_history' : 'Revisión activa en ejecución'"
                >
                  Rev {{ rev.revision }}
                  @if (rev.isArchived) {
                    <span class="archived-tag">Archivada</span>
                  } @else {
                    <span class="active-tag">Activa</span>
                  }
                </button>
              }
            </div>
          }
        </div>

        <div class="goal-content">
          <span class="goal-label">Meta del Agente (Invariante Inviolable):</span>
          <p class="goal-text">{{ displayedPlan()?.goal || 'Esperando formulación de meta...' }}</p>
        </div>

        <!-- Alerta didáctica de contingencia / replanning si aplica -->
        @if (selectedSnapshot()?.triggerReason; as reason) {
          <div class="replanning-notice" role="alert">
            <svg class="notice-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
            <div class="notice-body">
              <strong>Motivo de Contingencia en esta Revisión:</strong> {{ reason }}
              <span class="subtext">El estado quedó congelado en plan_history para auditoría sin mutaciones retroactivas.</span>
            </div>
          </div>
        }

        <!-- Alerta de Bloqueo por Deadlock / Runtime Stall (Caso G3) -->
        @if (isStalled() && selectedRevisionNum() === activeRevisionNum()) {
          <div class="stall-alert-box" role="alert">
            <svg class="stall-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div class="stall-text">
              <strong>Runtime Stall Detectado (no_executable_steps):</strong>
              <p>
                Un paso previo obligatorio falló y los pasos siguientes ([{{ blockedIdsFormatted() }}]) 
                tienen dependencias insatisfechas sin ruta alternativa de replanning. 
                El runtime activó la detención segura para prevenir bucles infinitos.
              </p>
            </div>
          </div>
        }
      </header>

      <!-- 2. CANVAS DEL GRAFO ACÍCLICO DIRIGIDO (DAG) -->
      <div class="dag-canvas-card">
        <div class="dag-canvas-top-bar">
          <div class="legend-group">
            <span class="legend-title">Ejecutores:</span>
            <span class="legend-chip exec-tool"><span class="badge-dot"></span> TOOL (Catálogo)</span>
            <span class="legend-chip exec-runtime"><span class="badge-dot"></span> RUNTIME (CPU/Local)</span>
            <span class="legend-chip exec-model"><span class="badge-dot"></span> MODEL (LLM)</span>
          </div>

          <div class="zoom-meta">
            <span class="step-count-badge">
              {{ displayedSteps().length }} Pasos en Grafo
            </span>
          </div>
        </div>

        <div class="dag-svg-wrapper">
          @if (displayedSteps().length === 0) {
            <div class="dag-empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <h5>Esperando propuesta de Plan del Planner...</h5>
              <p>Cuando el agente procese la consulta, verás aquí el DAG de tareas estructurado y validado.</p>
            </div>
          } @else {
            <svg 
              class="dag-svg" 
              [attr.viewBox]="svgViewBox()"
              preserveAspectRatio="xMidYMid meet"
            >
              <!-- Flechas conectoras SVG -->
              <defs>
                <marker
                  id="dag-arrow-normal"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="4"
                  orient="auto"
                >
                  <path d="M1,1 L7,4 L1,7 Z" fill="#64748b" />
                </marker>
                <marker
                  id="dag-arrow-resolved"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="4"
                  orient="auto"
                >
                  <path d="M1,1 L7,4 L1,7 Z" fill="#10b981" />
                </marker>
                <marker
                  id="dag-arrow-active"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="4"
                  orient="auto"
                >
                  <path d="M1,1 L7,4 L1,7 Z" fill="#00f0ff" />
                </marker>
              </defs>

              <!-- Conexiones / Aristas de Dependencia -->
              @for (edge of dagEdges(); track edge.fromId + '-' + edge.toId) {
                <path
                  [attr.d]="renderEdgePath(edge)"
                  class="dag-edge"
                  [class.is-resolved]="edge.isResolved"
                  [class.is-active]="edge.isActive"
                  [attr.marker-end]="edge.isResolved ? 'url(#dag-arrow-resolved)' : edge.isActive ? 'url(#dag-arrow-active)' : 'url(#dag-arrow-normal)'"
                />
              }

              <!-- Nodos del DAG -->
              @for (node of dagNodes(); track node.step.id) {
                <g 
                  class="dag-node-group" 
                  [class.is-active]="isNodeActive(node.step)"
                  [class.is-selected]="selectedStepId() === node.step.id"
                  [class.is-blocked]="node.isBlocked"
                  [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
                  (click)="onNodeClick(node.step)"
                  tabindex="0"
                  (keydown.enter)="onNodeClick(node.step)"
                  [attr.aria-label]="'Paso ' + node.step.id + ': ' + node.step.description"
                >
                  <!-- Fondo de tarjeta de nodo -->
                  <rect
                    x="0"
                    y="0"
                    width="170"
                    height="76"
                    rx="8"
                    class="node-rect"
                    [ngClass]="[node.step.status, node.step.executor]"
                  />

                  <!-- Barra de estado lateral -->
                  <rect
                    x="0"
                    y="0"
                    width="5"
                    height="76"
                    rx="3"
                    class="node-indicator-bar"
                    [ngClass]="node.step.status"
                  />

                  <!-- ID del paso y Badge de Ejecutor -->
                  <text x="14" y="20" class="node-id-text font-mono">{{ node.step.id }}</text>
                  <text 
                    x="50" 
                    y="20" 
                    class="node-executor-text font-mono"
                    [ngClass]="node.step.executor"
                  >
                    {{ node.step.executor.toUpperCase() }}
                  </text>

                  <!-- Badge de Estado (COMPLETED, FAILED, PENDING, SKIPPED) -->
                  <text 
                    x="160" 
                    y="20" 
                    text-anchor="end" 
                    class="node-status-text font-mono"
                    [ngClass]="node.step.status"
                  >
                    {{ getStatusBadge(node.step.status).label }}
                  </text>

                  <!-- Acción / Nombre técnico -->
                  <text x="14" y="40" class="node-action-text font-mono">
                    {{ truncateText(node.step.action, 22) }}
                  </text>

                  <!-- Breve descripción -->
                  <text x="14" y="58" class="node-desc-text">
                    {{ truncateText(node.step.description, 26) }}
                  </text>

                  <!-- Anillo pulsante si está activo en ejecución -->
                  @if (isNodeActive(node.step)) {
                    <rect
                      x="-3"
                      y="-3"
                      width="176"
                      height="82"
                      rx="11"
                      class="node-pulse-ring"
                    />
                  }

                  <!-- Indicador visual si está bloqueado por runtime stall -->
                  @if (node.isBlocked) {
                    <text x="14" y="70" class="node-blocked-warning font-mono">
                      BLOQUEADO (DEP FAILED)
                    </text>
                  }
                </g>
              }
            </svg>
          }
        </div>
      </div>

      <!-- 3. DETALLE DEL PASO SELECCIONADO (INSPECTOR DE EVIDENCIA) -->
      @if (activeSelectedStep(); as step) {
        <section class="step-detail-card" aria-label="Detalle del Paso del Plan">
          <div class="step-detail-header">
            <div class="step-meta-left">
              <span class="step-badge-id font-mono">PASO {{ step.id }}</span>
              <span class="step-badge-exec" [ngClass]="step.executor">{{ step.executor.toUpperCase() }}</span>
              <span class="step-badge-status" [ngClass]="step.status">{{ getStatusBadge(step.status).label }}</span>
            </div>

            <button
              type="button"
              class="btn-close-detail"
              (click)="selectedStepId.set(null)"
              aria-label="Cerrar detalle"
            >
              &times;
            </button>
          </div>

          <h4 class="step-detail-title">{{ step.description }}</h4>
          <span class="step-detail-action font-mono">Acción: {{ step.action }}</span>

          <!-- Dependencias requeridas -->
          <div class="dependencies-row">
            <span class="dep-label">Depende de:</span>
            @if (step.depends_on.length === 0) {
              <span class="dep-pill root-pill">Paso Raíz (Sin dependencias previas)</span>
            } @else {
              @for (dep of step.depends_on; track dep) {
                <span class="dep-pill">{{ dep }}</span>
              }
            }
          </div>

          <!-- Si el paso fue omitido (SKIPPED) justificadamente -->
          @if (step.skip_reason) {
            <div class="skip-reason-box">
              <span class="skip-label">Justificación de Omisión (Runtime / Replanning):</span>
              <p class="skip-text">{{ step.skip_reason }}</p>
            </div>
          }

          <!-- Observación fáctica / Resultado verificado -->
          @if (step.observation) {
            <div class="observation-box">
              <div class="obs-header">
                <span class="obs-tag">Evidencia Fáctica Verificada (Observación):</span>
                <span class="obs-status">{{ step.observation['status'] || 'OK' }}</span>
              </div>
              <pre class="obs-pre font-mono">{{ formatObservation(step.observation) }}</pre>
            </div>
          } @else if (step.status === 'pending') {
            <div class="pending-notice-box">
              <p>Paso aún no ejecutado. En espera de resolución de dependencias previas en el DAG.</p>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .dag-viewer-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }

    /* 1. Header */
    .dag-header {
      background: rgba(13, 21, 39, 0.75);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-default, #1e293b);
      border-radius: var(--radius-md, 8px);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .goal-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    .goal-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge-plan-version {
      font-size: 0.65rem;
      font-family: var(--font-mono, monospace);
      font-weight: 700;
      color: #a855f7;
      background: rgba(168, 85, 247, 0.12);
      border: 1px solid rgba(168, 85, 247, 0.4);
      padding: 2px 7px;
      border-radius: 4px;
      letter-spacing: 0.05em;
    }

    .pill-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.68rem;
      font-weight: 700;
      font-family: var(--font-mono, monospace);
      padding: 2px 9px;
      border-radius: 12px;
    }

    .pill-active {
      color: var(--accent-cyan, #00f0ff);
      background: rgba(0, 240, 255, 0.1);
      border: 1px solid rgba(0, 240, 255, 0.3);
    }
    .pill-completed {
      color: var(--accent-emerald, #10b981);
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .pill-stalled {
      color: var(--accent-crimson, #ef4444);
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.4);
      animation: pulseStall 1.5s infinite alternate;
    }
    .pill-idle {
      color: var(--text-muted, #94a3b8);
      background: rgba(148, 163, 184, 0.1);
      border: 1px solid rgba(148, 163, 184, 0.2);
    }

    .dot-active, .dot-completed, .dot-stall, .dot-idle {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .dot-active { background: #00f0ff; box-shadow: 0 0 6px #00f0ff; }
    .dot-completed { background: #10b981; box-shadow: 0 0 6px #10b981; }
    .dot-stall { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
    .dot-idle { background: #94a3b8; }

    /* Selector de Revisiones */
    .revision-selector {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .rev-label {
      font-size: 0.68rem;
      color: var(--text-muted, #94a3b8);
      font-family: var(--font-mono, monospace);
    }

    .rev-btn {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-default, #1e293b);
      color: var(--text-secondary, #cbd5e1);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.68rem;
      font-family: var(--font-mono, monospace);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .rev-btn:hover {
      border-color: #a855f7;
      color: #fff;
    }
    .rev-btn.active {
      background: rgba(168, 85, 247, 0.18);
      border-color: #a855f7;
      color: #c084fc;
      font-weight: 700;
    }

    .archived-tag {
      font-size: 0.58rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.08);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .active-tag {
      font-size: 0.58rem;
      color: #10b981;
      background: rgba(16, 185, 129, 0.15);
      padding: 1px 4px;
      border-radius: 3px;
    }

    /* Meta text */
    .goal-content {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .goal-label {
      font-size: 0.65rem;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .goal-text {
      margin: 0;
      font-size: 0.84rem;
      font-weight: 600;
      color: #f8fafc;
      line-height: 1.35;
    }

    .replanning-notice {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: rgba(168, 85, 247, 0.1);
      border: 1px solid rgba(168, 85, 247, 0.35);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 0.72rem;
      color: #e2e8f0;
    }
    .notice-icon {
      color: #c084fc;
      margin-top: 1px;
      flex-shrink: 0;
    }
    .subtext {
      display: block;
      color: #94a3b8;
      font-size: 0.65rem;
      margin-top: 2px;
    }

    .stall-alert-box {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.45);
      border-radius: 6px;
      padding: 9px 11px;
      font-size: 0.72rem;
      color: #fca5a5;
    }
    .stall-icon {
      color: #ef4444;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .stall-text p {
      margin: 3px 0 0 0;
      color: #fecaca;
      line-height: 1.35;
    }

    /* 2. DAG Canvas Card */
    .dag-canvas-card {
      background: rgba(10, 16, 31, 0.85);
      border: 1px solid var(--border-default, #1e293b);
      border-radius: var(--radius-md, 8px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .dag-canvas-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.6);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.68rem;
    }

    .legend-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .legend-title {
      color: #94a3b8;
      font-weight: 600;
    }
    .legend-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-mono, monospace);
      font-weight: 600;
    }
    .badge-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }
    .exec-tool .badge-dot { background: #f59e0b; }
    .exec-runtime .badge-dot { background: #a855f7; }
    .exec-model .badge-dot { background: #38bdf8; }

    .step-count-badge {
      font-family: var(--font-mono, monospace);
      color: #94a3b8;
      font-size: 0.65rem;
    }

    .dag-svg-wrapper {
      position: relative;
      width: 100%;
      min-height: 220px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.03) 0%, rgba(10, 16, 31, 0.95) 100%);
      padding: 10px;
    }

    .dag-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      color: #94a3b8;
      padding: 30px;
      text-align: center;
    }
    .dag-empty-state h5 {
      margin: 0;
      color: #cbd5e1;
      font-size: 0.85rem;
    }
    .dag-empty-state p {
      margin: 0;
      font-size: 0.72rem;
      max-width: 320px;
    }

    .dag-svg {
      width: 100%;
      height: 100%;
      max-height: 380px;
    }

    /* Aristas / Flechas SVG */
    .dag-edge {
      fill: none;
      stroke: #475569;
      stroke-width: 2;
      stroke-dasharray: 4, 3;
      transition: all 0.3s ease;
    }
    .dag-edge.is-resolved {
      stroke: #10b981;
      stroke-width: 2.2;
      stroke-dasharray: none;
    }
    .dag-edge.is-active {
      stroke: #00f0ff;
      stroke-width: 2.5;
      stroke-dasharray: 6, 3;
      animation: dashEdge 1s linear infinite;
    }

    @keyframes dashEdge {
      to { stroke-dashoffset: -9; }
    }

    /* Nodos SVG */
    .dag-node-group {
      cursor: pointer;
      outline: none;
      transition: transform 0.2s ease;
    }
    .dag-node-group:hover {
      transform: scale(1.02);
    }
    .dag-node-group:focus-visible .node-rect {
      stroke: #00f0ff;
      stroke-width: 2;
    }

    .node-rect {
      fill: rgba(15, 23, 42, 0.92);
      stroke: #334155;
      stroke-width: 1;
      transition: all 0.2s ease;
    }
    .dag-node-group.is-selected .node-rect {
      stroke: #00f0ff;
      stroke-width: 2;
      filter: drop-shadow(0 0 6px rgba(0, 240, 255, 0.4));
    }

    /* Bordes según estado */
    .node-rect.completed { stroke: rgba(16, 185, 129, 0.5); }
    .node-rect.in_progress { stroke: #00f0ff; }
    .node-rect.failed { stroke: rgba(239, 68, 68, 0.7); }
    .node-rect.skipped { stroke: rgba(148, 163, 184, 0.4); stroke-dasharray: 4, 2; }

    .node-indicator-bar.completed { fill: #10b981; }
    .node-indicator-bar.in_progress { fill: #00f0ff; }
    .node-indicator-bar.failed { fill: #ef4444; }
    .node-indicator-bar.skipped { fill: #94a3b8; }
    .node-indicator-bar.pending { fill: #475569; }

    .node-id-text {
      fill: #f8fafc;
      font-size: 11px;
      font-weight: 700;
    }

    .node-executor-text {
      font-size: 9px;
      font-weight: 700;
    }
    .node-executor-text.tool { fill: #f59e0b; }
    .node-executor-text.runtime { fill: #c084fc; }
    .node-executor-text.model { fill: #38bdf8; }

    .node-status-text {
      font-size: 8.5px;
      font-weight: 700;
    }
    .node-status-text.completed { fill: #10b981; }
    .node-status-text.in_progress { fill: #00f0ff; }
    .node-status-text.failed { fill: #ef4444; }
    .node-status-text.skipped { fill: #94a3b8; }
    .node-status-text.pending { fill: #64748b; }

    .node-action-text {
      fill: #cbd5e1;
      font-size: 9.5px;
      font-weight: 600;
    }

    .node-desc-text {
      fill: #94a3b8;
      font-size: 8.5px;
    }

    .node-pulse-ring {
      fill: none;
      stroke: #00f0ff;
      stroke-width: 2;
      animation: pulseNode 1s infinite alternate;
    }

    .node-blocked-warning {
      fill: #ef4444;
      font-size: 7.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    @keyframes pulseNode {
      0% { opacity: 0.4; }
      100% { opacity: 1; }
    }

    @keyframes pulseStall {
      0% { opacity: 0.7; }
      100% { opacity: 1; }
    }

    /* 3. Detalle del Paso */
    .step-detail-card {
      background: rgba(13, 21, 39, 0.9);
      border: 1px solid var(--border-default, #1e293b);
      border-radius: var(--radius-md, 8px);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      animation: fadeIn 0.2s ease;
    }

    .step-detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .step-meta-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .step-badge-id {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
    }

    .step-badge-exec {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-family: var(--font-mono, monospace);
    }
    .step-badge-exec.tool { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .step-badge-exec.runtime { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    .step-badge-exec.model { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }

    .step-badge-status {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-family: var(--font-mono, monospace);
    }
    .step-badge-status.completed { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .step-badge-status.in_progress { background: rgba(0, 240, 255, 0.15); color: #00f0ff; }
    .step-badge-status.failed { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .step-badge-status.skipped { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .step-badge-status.pending { background: rgba(71, 85, 105, 0.15); color: #94a3b8; }

    .btn-close-detail {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }
    .btn-close-detail:hover { color: #fff; }

    .step-detail-title {
      margin: 0;
      font-size: 0.88rem;
      color: #f8fafc;
      font-weight: 600;
    }

    .step-detail-action {
      font-size: 0.72rem;
      color: #94a3b8;
    }

    .dependencies-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      font-size: 0.68rem;
    }
    .dep-label {
      color: #64748b;
      font-weight: 600;
    }
    .dep-pill {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-default, #1e293b);
      color: #cbd5e1;
      padding: 1px 6px;
      border-radius: 4px;
      font-family: var(--font-mono, monospace);
    }
    .root-pill {
      color: #10b981;
      border-color: rgba(16, 185, 129, 0.3);
    }

    .skip-reason-box {
      background: rgba(148, 163, 184, 0.08);
      border-left: 3px solid #94a3b8;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 0.72rem;
    }
    .skip-label {
      font-weight: 700;
      color: #cbd5e1;
      display: block;
      margin-bottom: 2px;
    }
    .skip-text {
      margin: 0;
      color: #94a3b8;
    }

    .observation-box {
      background: rgba(10, 16, 31, 0.95);
      border: 1px solid var(--border-default, #1e293b);
      border-radius: 6px;
      padding: 8px 10px;
    }
    .obs-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 0.68rem;
    }
    .obs-tag {
      color: #94a3b8;
      font-weight: 600;
    }
    .obs-status {
      color: #10b981;
      font-weight: 700;
      font-family: var(--font-mono, monospace);
    }
    .obs-pre {
      margin: 0;
      font-size: 0.68rem;
      color: #38bdf8;
      white-space: pre-wrap;
      max-height: 140px;
      overflow-y: auto;
    }

    .pending-notice-box {
      padding: 6px 8px;
      font-size: 0.72rem;
      color: #94a3b8;
      font-style: italic;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Responsive */
    @media (max-width: 768px) {
      .goal-row {
        flex-direction: column;
        align-items: flex-start;
      }
      .revision-selector {
        width: 100%;
        overflow-x: auto;
      }
    }
  `]
})
export class PlanDAGViewerComponent {
  readonly state = input<AgentV4PlanningState | null>(null);

  readonly selectedRevisionNum = signal<number>(1);
  readonly selectedStepId = signal<string | null>(null);

  readonly activeRevisionNum = computed<number>(() => {
    return this.state()?.currentPlan?.revision ?? 1;
  });

  readonly isStalled = computed<boolean>(() => {
    return this.state()?.isStalled ?? false;
  });

  readonly isCompleted = computed<boolean>(() => {
    return this.state()?.currentPlan?.is_completed ?? false;
  });

  readonly isValidated = computed<boolean>(() => {
    return this.state()?.isValidated ?? false;
  });

  readonly blockedIdsFormatted = computed<string>(() => {
    return (this.state()?.blockedStepIds || []).join(', ');
  });

  readonly allRevisions = computed<PlanRevisionSnapshot[]>(() => {
    const s = this.state();
    if (!s) return [];
    const currentRev = s.currentPlan?.revision ?? 1;
    // Filtrar snapshots archivados: solo aquellos estrictamente anteriores a la revisión activa
    // y deduplicar por número de revisión para garantizar integridad visual e invariantes de historial
    const seenRevs = new Set<number>();
    const list: PlanRevisionSnapshot[] = [];

    for (const snap of s.planHistory) {
      if (snap.revision < currentRev && !seenRevs.has(snap.revision)) {
        seenRevs.add(snap.revision);
        list.push(snap);
      }
    }

    if (s.currentPlan) {
      list.push({
        revision: s.currentPlan.revision,
        goal: s.currentPlan.goal,
        steps: s.currentPlan.steps,
        timestamp: new Date().toISOString(),
        isArchived: false
      });
    }
    return list;
  });

  readonly displayedPlan = computed<PlanModel | PlanRevisionSnapshot | null>(() => {
    const s = this.state();
    if (!s) return null;
    const revNum = this.selectedRevisionNum();
    if (s.currentPlan && s.currentPlan.revision === revNum) {
      return s.currentPlan;
    }
    const snap = s.planHistory.find(h => h.revision === revNum);
    return snap || s.currentPlan;
  });

  readonly selectedSnapshot = computed<PlanRevisionSnapshot | null>(() => {
    const s = this.state();
    if (!s) return null;
    return s.planHistory.find(h => h.revision === this.selectedRevisionNum()) || null;
  });

  readonly displayedSteps = computed<PlanStepModel[]>(() => {
    return this.displayedPlan()?.steps ?? [];
  });

  readonly activeSelectedStep = computed<PlanStepModel | null>(() => {
    const id = this.selectedStepId();
    if (!id) return null;
    return this.displayedSteps().find(s => s.id === id) || null;
  });

  /**
   * Calcula posiciones visuales en capas (Topological Sort / Layering) para el DAG.
   */
  readonly dagNodes = computed<DAGNodePosition[]>(() => {
    const steps = this.displayedSteps();
    if (steps.length === 0) return [];

    const levels = new Map<string, number>();

    // Asignación de niveles basada en dependencias
    for (const step of steps) {
      if (step.depends_on.length === 0) {
        levels.set(step.id, 0);
      } else {
        let maxDep = 0;
        for (const depId of step.depends_on) {
          maxDep = Math.max(maxDep, (levels.get(depId) ?? 0) + 1);
        }
        levels.set(step.id, maxDep);
      }
    }

    // Agrupar pasos por nivel
    const levelBuckets = new Map<number, PlanStepModel[]>();
    for (const step of steps) {
      const lvl = levels.get(step.id) ?? 0;
      const bucket = levelBuckets.get(lvl) || [];
      bucket.push(step);
      levelBuckets.set(lvl, bucket);
    }

    const nodeWidth = 170;
    const nodeHeight = 76;
    const xGap = 70;
    const yGap = 35;
    const startX = 30;
    const startY = 30;

    const positions: DAGNodePosition[] = [];
    const stalledBlockedIds = new Set(this.state()?.blockedStepIds || []);

    // Calcular x, y según el nivel y el índice en el nivel
    for (const [lvl, bucket] of levelBuckets.entries()) {
      const x = startX + lvl * (nodeWidth + xGap);
      const totalH = bucket.length * nodeHeight + (bucket.length - 1) * yGap;
      const baseTop = startY;

      for (let i = 0; i < bucket.length; i++) {
        const step = bucket[i];
        const y = baseTop + i * (nodeHeight + yGap);
        const isBlocked = stalledBlockedIds.has(step.id);
        const isReady = step.status === 'in_progress';

        positions.push({
          step,
          x,
          y,
          level: lvl,
          isBlocked,
          isReady
        });
      }
    }

    return positions;
  });

  readonly dagEdges = computed<DAGEdge[]>(() => {
    const nodes = this.dagNodes();
    const nodeMap = new Map<string, DAGNodePosition>();
    for (const n of nodes) {
      nodeMap.set(n.step.id, n);
    }

    const edges: DAGEdge[] = [];
    const nodeWidth = 170;
    const nodeHeight = 76;

    for (const targetNode of nodes) {
      for (const depId of targetNode.step.depends_on) {
        const sourceNode = nodeMap.get(depId);
        if (sourceNode) {
          const fromX = sourceNode.x + nodeWidth;
          const fromY = sourceNode.y + nodeHeight / 2;
          const toX = targetNode.x;
          const toY = targetNode.y + nodeHeight / 2;
          const isResolved = sourceNode.step.status === 'completed';
          const isActive = targetNode.step.status === 'in_progress';

          edges.push({
            fromX,
            fromY,
            toX,
            toY,
            fromId: sourceNode.step.id,
            toId: targetNode.step.id,
            isActive,
            isResolved
          });
        }
      }
    }

    return edges;
  });

  readonly svgViewBox = computed<string>(() => {
    const nodes = this.dagNodes();
    if (nodes.length === 0) return '0 0 500 220';
    let maxX = 500;
    let maxY = 220;
    for (const n of nodes) {
      maxX = Math.max(maxX, n.x + 220);
      maxY = Math.max(maxY, n.y + 110);
    }
    return `0 0 ${maxX} ${maxY}`;
  });

  isNodeActive(step: PlanStepModel): boolean {
    return step.id === this.state()?.activeStepId && step.status === 'in_progress';
  }

  onNodeClick(step: PlanStepModel): void {
    this.selectedStepId.set(step.id);
  }

  getStatusBadge(status: StepStatus) {
    return STEP_STATUS_BADGES[status] || STEP_STATUS_BADGES.pending;
  }

  getExecutorBadge(executor: StepExecutor) {
    return EXECUTOR_BADGES[executor] || EXECUTOR_BADGES.tool;
  }

  renderEdgePath(edge: DAGEdge): string {
    const dx = edge.toX - edge.fromX;
    const cx1 = edge.fromX + dx * 0.5;
    const cy1 = edge.fromY;
    const cx2 = edge.fromX + dx * 0.5;
    const cy2 = edge.toY;
    return `M ${edge.fromX} ${edge.fromY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${edge.toX} ${edge.toY}`;
  }

  truncateText(text: string, len: number): string {
    if (!text) return '';
    return text.length > len ? text.slice(0, len - 2) + '...' : text;
  }

  formatObservation(obs: any): string {
    try {
      return JSON.stringify(obs, null, 2);
    } catch {
      return String(obs);
    }
  }
}
