import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NodeExecutionState,
  SIMULATOR_NODES,
  SimulatorNodeConfig,
  SimulatorNodeId
} from '../../models/simulator.models';

interface GraphLayoutNode {
  id: SimulatorNodeId;
  config: SimulatorNodeConfig;
  cx: number;
  cy: number;
  state: NodeExecutionState;
}

interface GraphLayoutEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isActive: boolean;
}

@Component({
  selector: 'app-runtime-companion-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="companion-graph-wrapper" role="img" [attr.aria-label]="'Topología compacta ' + agentVersion()">
      <svg class="graph-svg" viewBox="0 0 540 80" preserveAspectRatio="xMidYMid meet">
        <defs>
          <!-- Filtro de resplandor para nodos activos -->
          <filter id="companion-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Aristas de Conexión -->
        @for (edge of layoutEdges(); track edge.id) {
          <line
            [attr.x1]="edge.x1"
            [attr.y1]="edge.y1"
            [attr.x2]="edge.x2"
            [attr.y2]="edge.y2"
            class="graph-edge"
            [class.active-edge]="edge.isActive"
          />
        }

        <!-- Nodos de la Topología -->
        @for (node of layoutNodes(); track node.id) {
          <g
            class="node-group"
            [class.is-active]="node.state === 'active'"
            [class.is-waiting]="node.state === 'waiting'"
            [class.is-completed]="node.state === 'completed'"
            [class.is-error]="node.state === 'error'"
          >
            <!-- Halo de pulso cuando está activo o esperando -->
            @if (node.state === 'active' || node.state === 'waiting') {
              <circle
                [attr.cx]="node.cx"
                [attr.cy]="node.cy"
                r="19"
                class="pulse-ring"
                [attr.stroke]="node.config.colorHex"
              />
            }

            <!-- Círculo base del nodo -->
            <circle
              [attr.cx]="node.cx"
              [attr.cy]="node.cy"
              r="13"
              class="node-circle"
              [attr.fill]="node.state === 'active' ? node.config.colorHex : 'rgba(15, 23, 42, 0.9)'"
              [attr.stroke]="node.config.colorHex"
              [attr.filter]="node.state === 'active' ? 'url(#companion-glow)' : null"
            />

            <!-- Punto central de estado -->
            <circle
              [attr.cx]="node.cx"
              [attr.cy]="node.cy"
              r="4.5"
              class="node-center-dot"
              [attr.fill]="node.state === 'active' ? '#020617' : node.config.colorHex"
            />

            <!-- Etiqueta del nodo -->
            <text
              [attr.x]="node.cx"
              [attr.y]="node.cy + 25"
              class="node-label"
              [attr.fill]="node.state === 'active' ? node.config.colorHex : 'var(--text-secondary)'"
            >
              {{ node.id }}
            </text>
          </g>
        }
      </svg>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .companion-graph-wrapper {
      width: 100%;
      height: 74px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(4, 9, 20, 0.65);
      border-radius: var(--radius-sm);
      border: 1px solid rgba(56, 189, 248, 0.12);
      overflow: hidden;
      padding: 2px 0;
    }

    .graph-svg {
      width: 100%;
      height: 100%;
      max-width: 540px;
    }

    /* Aristas */
    .graph-edge {
      stroke: rgba(148, 163, 184, 0.2);
      stroke-width: 2px;
      stroke-linecap: round;
      transition: all 0.2s ease;
    }

    .graph-edge.active-edge {
      stroke: var(--accent-cyan);
      stroke-width: 2.5px;
      stroke-dasharray: 6 3;
      animation: edgeFlow 1s linear infinite;
    }

    @keyframes edgeFlow {
      from { stroke-dashoffset: 18; }
      to { stroke-dashoffset: 0; }
    }

    /* Nodos */
    .node-circle {
      stroke-width: 2px;
      transition: all 0.25s ease;
    }

    .pulse-ring {
      fill: none;
      stroke-width: 1.5px;
      opacity: 0.6;
      animation: pulseAnimation 1.6s ease-out infinite;
    }

    @keyframes pulseAnimation {
      0% { r: 13; opacity: 0.8; }
      100% { r: 24; opacity: 0; }
    }

    .node-label {
      font-size: 9px;
      font-weight: 700;
      font-family: var(--font-mono);
      text-anchor: middle;
      letter-spacing: 0.04em;
    }

    .node-group.is-active .node-circle {
      stroke-width: 2.5px;
    }

    .node-group.is-waiting .pulse-ring {
      animation: pulseAnimation 1.1s ease-out infinite;
    }

    .node-group.is-error .node-circle {
      stroke: #ef4444 !important;
      fill: rgba(239, 68, 68, 0.25) !important;
    }

    .node-group.is-error .node-label {
      fill: #f87171 !important;
    }
  `]
})
export class RuntimeCompanionGraphComponent {
  readonly agentVersion = input<string>('v1');
  readonly nodeStates = input<Record<SimulatorNodeId, NodeExecutionState>>({
    USER: 'idle',
    RUNTIME: 'idle',
    LLM: 'idle',
    TOOLS: 'idle',
    MEMORY: 'idle',
    PLANNER: 'idle',
    EXECUTOR: 'idle'
  });
  readonly activeEdgeId = input<string | undefined>(undefined);

  readonly layoutNodes = computed<GraphLayoutNode[]>(() => {
    const version = this.agentVersion();
    const states = this.nodeStates();

    let nodeIds: SimulatorNodeId[] = ['USER', 'RUNTIME', 'LLM', 'TOOLS'];
    if (version === 'v3') {
      nodeIds = ['USER', 'RUNTIME', 'LLM', 'TOOLS', 'MEMORY'];
    } else if (version === 'v4') {
      nodeIds = ['USER', 'RUNTIME', 'PLANNER', 'EXECUTOR', 'TOOLS'];
    }

    const total = nodeIds.length;
    const startX = 50;
    const endX = 490;
    const stepX = (endX - startX) / (total - 1);
    const cy = 30;

    return nodeIds.map((id, index) => ({
      id,
      config: SIMULATOR_NODES[id],
      cx: Math.round(startX + index * stepX),
      cy,
      state: states[id] || 'idle'
    }));
  });

  readonly layoutEdges = computed<GraphLayoutEdge[]>(() => {
    const nodes = this.layoutNodes();
    const activeEdge = this.activeEdgeId();
    const edges: GraphLayoutEdge[] = [];

    for (let i = 0; i < nodes.length - 1; i++) {
      const src = nodes[i];
      const tgt = nodes[i + 1];
      const edgeId = `${src.id.toLowerCase()}-${tgt.id.toLowerCase()}`;
      const isActive =
        activeEdge === edgeId ||
        (src.state === 'active' && (tgt.state === 'waiting' || tgt.state === 'active')) ||
        (tgt.state === 'active' && src.state === 'waiting');

      edges.push({
        id: edgeId,
        x1: src.cx,
        y1: src.cy,
        x2: tgt.cx,
        y2: tgt.cy,
        isActive
      });
    }

    return edges;
  });
}
