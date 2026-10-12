import { Injectable, computed, inject, signal } from '@angular/core';
import { EventStoreService } from './event-store.service';
import { PresentationControllerService } from './presentation-controller.service';
import { LearnerGuideService } from './learner-guide.service';
import {
  NodeExecutionState,
  SIMULATOR_NODES,
  SimulatorEventMapping,
  SimulatorNodeConfig,
  SimulatorNodeId,
  getEventMapping,
  getTopologyForVersion
} from '../models/simulator.models';
import { StreamEvent } from '../models/agent.models';

@Injectable({
  providedIn: 'root'
})
export class SimulatorProjectionService {
  private readonly eventStore = inject(EventStoreService);
  readonly controller = inject(PresentationControllerService);
  private readonly guideService = inject(LearnerGuideService);

  readonly isOpen = signal<boolean>(false);
  readonly isFullscreen = signal<boolean>(false);
  readonly selectedNodeId = signal<SimulatorNodeId | null>(null);

  // Replay scrubber index when inspecting inside the simulator
  readonly simulatorEventIndex = signal<number>(0);

  readonly activeAgentId = computed<string>(() => this.eventStore.activeAgentId() || 'v1');

  readonly events = computed<StreamEvent[]>(() => this.eventStore.events());

  readonly totalEvents = computed<number>(() => this.events().length);

  readonly topology = computed(() => getTopologyForVersion(this.activeAgentId()));

  readonly activeEvent = computed<StreamEvent | null>(() => {
    const evts = this.events();
    if (evts.length === 0) return null;

    if (this.controller.mode() === 'replay') {
      // In replay mode, look at the controller's active step or simulator index
      const idx = Math.min(this.simulatorEventIndex(), evts.length - 1);
      return evts[Math.max(0, idx)] || null;
    }

    // In live mode, the active event is the last received event
    return evts[evts.length - 1] || null;
  });

  readonly eventMapping = computed<SimulatorEventMapping | null>(() => {
    const evt = this.activeEvent();
    if (!evt) return null;
    return getEventMapping(evt.type, evt.payload);
  });

  readonly selectedNode = computed<SimulatorNodeConfig | null>(() => {
    const id = this.selectedNodeId();
    if (id && SIMULATOR_NODES[id]) {
      return SIMULATOR_NODES[id];
    }
    // Default to the active node from current event mapping
    const mapping = this.eventMapping();
    if (mapping && SIMULATOR_NODES[mapping.activeNode]) {
      return SIMULATOR_NODES[mapping.activeNode];
    }
    return SIMULATOR_NODES['RUNTIME'];
  });

  readonly nodeStates = computed<Record<SimulatorNodeId, NodeExecutionState>>(() => {
    const states: Record<SimulatorNodeId, NodeExecutionState> = {
      USER: 'idle',
      RUNTIME: 'idle',
      LLM: 'idle',
      TOOLS: 'idle',
      MEMORY: 'idle',
      PLANNER: 'idle',
      EXECUTOR: 'idle'
    };

    const mapping = this.eventMapping();
    if (!mapping) return states;

    states[mapping.activeNode] = mapping.nodeState;
    if (mapping.targetNode && mapping.nodeState === 'active') {
      states[mapping.targetNode] = 'waiting';
    }

    return states;
  });

  openSimulator(): void {
    const len = this.events().length;
    this.simulatorEventIndex.set(Math.max(0, len - 1));
    this.isOpen.set(true);
  }

  closeSimulator(): void {
    this.isOpen.set(false);
  }

  toggleSimulator(): void {
    if (this.isOpen()) {
      this.closeSimulator();
    } else {
      this.openSimulator();
    }
  }

  toggleFullscreen(): void {
    this.isFullscreen.update((f) => !f);
  }

  selectNode(id: SimulatorNodeId): void {
    this.selectedNodeId.set(id);
  }

  selectEventIndex(index: number): void {
    const evts = this.events();
    if (index >= 0 && index < evts.length) {
      this.simulatorEventIndex.set(index);
      // Switch controller to replay mode if it wasn't already
      if (this.controller.mode() === 'live') {
        this.controller.setMode('replay');
      }
    }
  }

  stepNextEvent(): void {
    const current = this.simulatorEventIndex();
    if (current < this.totalEvents() - 1) {
      this.selectEventIndex(current + 1);
    }
  }

  stepPrevEvent(): void {
    const current = this.simulatorEventIndex();
    if (current > 0) {
      this.selectEventIndex(current - 1);
    }
  }

  resetEvents(): void {
    this.selectEventIndex(0);
  }

  // Get pedagogical Markdown guide excerpt for the active/selected node
  getNodeMarkdownExcerpt(node: SimulatorNodeConfig): string {
    const version = this.activeAgentId();
    const guide = this.guideService.getGuideForVersion(version);
    if (!guide) {
      return `### ${node.label}\n\n${node.description}\n\n**Rol pedagógico:** ${node.pedagogicalRole}`;
    }

    return `### ${node.label} (${version.toUpperCase()})\n\n${node.description}\n\n> [!NOTE]\n> **Rol pedagógico:** ${node.pedagogicalRole}\n\n**Ejemplo en el runtime:**\n\`\`\`json\n${node.codeSnippetExample || ''}\n\`\`\``;
  }
}
