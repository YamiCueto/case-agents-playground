import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { SimulatorProjectionService } from './simulator-projection.service';
import { EventStoreService } from './event-store.service';
import { PresentationControllerService } from './presentation-controller.service';
import { StreamEvent } from '../models/agent.models';
import { getTopologyForVersion, getEventMapping, SIMULATOR_NODES } from '../models/simulator.models';

describe('SimulatorProjectionService', () => {
  let service: SimulatorProjectionService;
  let eventStore: EventStoreService;
  let controller: PresentationControllerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()]
    });
    service = TestBed.inject(SimulatorProjectionService);
    eventStore = TestBed.inject(EventStoreService);
    controller = TestBed.inject(PresentationControllerService);
  });

  it('starts closed and with initial defaults', () => {
    expect(service.isOpen()).toBe(false);
    expect(service.isFullscreen()).toBe(false);
    expect(service.events().length).toBe(0);
    expect(service.activeEvent()).toBeNull();
  });

  it('toggles open and fullscreen states correctly', () => {
    service.openSimulator();
    expect(service.isOpen()).toBe(true);

    service.toggleFullscreen();
    expect(service.isFullscreen()).toBe(true);

    service.toggleFullscreen();
    expect(service.isFullscreen()).toBe(false);

    service.closeSimulator();
    expect(service.isOpen()).toBe(false);
  });

  describe('Topology by version', () => {
    it('returns 4 nodes for v1 and v2', () => {
      const topoV1 = getTopologyForVersion('v1');
      expect(topoV1.nodes.map((n) => n.id)).toEqual(['USER', 'RUNTIME', 'LLM', 'TOOLS']);

      const topoV2 = getTopologyForVersion('v2');
      expect(topoV2.nodes.map((n) => n.id)).toEqual(['USER', 'RUNTIME', 'LLM', 'TOOLS']);
    });

    it('adds MEMORY in v3 topology', () => {
      const topoV3 = getTopologyForVersion('v3');
      expect(topoV3.nodes.map((n) => n.id)).toEqual(['USER', 'RUNTIME', 'LLM', 'TOOLS', 'MEMORY']);
      expect(topoV3.edges.some((e) => e.target === 'MEMORY')).toBe(true);
    });

    it('adds PLANNER and EXECUTOR in v4 topology', () => {
      const topoV4 = getTopologyForVersion('v4');
      const nodeIds = topoV4.nodes.map((n) => n.id);
      expect(nodeIds).toContain('PLANNER');
      expect(nodeIds).toContain('EXECUTOR');
      expect(nodeIds.length).toBe(7);
      expect(topoV4.edges.some((e) => e.source === 'PLANNER' && e.target === 'EXECUTOR')).toBe(true);
    });
  });

  describe('Event mapping to visual states', () => {
    it('maps USER_REQUEST to USER node active and RUNTIME target', () => {
      const m = getEventMapping('USER_REQUEST', { query: 'Consulta TICK-1001' });
      expect(m.activeNode).toBe('USER');
      expect(m.targetNode).toBe('RUNTIME');
      expect(m.nodeState).toBe('active');
    });

    it('maps LLM_INFERENCE_START to LLM node in waiting state', () => {
      const m = getEventMapping('LLM_INFERENCE_START', {});
      expect(m.activeNode).toBe('LLM');
      expect(m.nodeState).toBe('waiting');
    });

    it('maps CPU_TOOL_EXECUTION to TOOLS node in active state', () => {
      const m = getEventMapping('CPU_TOOL_EXECUTION', { tool_name: 'get_ticket_by_id' });
      expect(m.activeNode).toBe('TOOLS');
      expect(m.targetNode).toBe('RUNTIME');
      expect(m.nodeState).toBe('active');
    });

    it('maps MEMORY_HYDRATED to MEMORY node', () => {
      const m = getEventMapping('MEMORY_HYDRATED', { user_persona: 'usr_carlos' });
      expect(m.activeNode).toBe('MEMORY');
      expect(m.nodeState).toBe('active');
    });

    it('maps PLAN_GENERATED to PLANNER node', () => {
      const m = getEventMapping('PLAN_GENERATED', { steps_count: 3 });
      expect(m.activeNode).toBe('PLANNER');
      expect(m.nodeState).toBe('active');
    });

    it('maps ERROR to RUNTIME node in error state', () => {
      const m = getEventMapping('ERROR', { message: 'Fallo' });
      expect(m.activeNode).toBe('RUNTIME');
      expect(m.nodeState).toBe('error');
    });
  });

  describe('Event timeline scrubbing and replay synchronization', () => {
    beforeEach(() => {
      eventStore.startNewRun('v1');
      const events: StreamEvent[] = [
        {
          event_id: 'e1',
          agent_version: 'v1',
          type: 'USER_REQUEST',
          payload: { query: 'Hola' },
          timestamp: new Date().toISOString()
        },
        {
          event_id: 'e2',
          agent_version: 'v1',
          type: 'TOOL_PROPOSAL',
          payload: { tool_name: 'get_ticket_by_id' },
          timestamp: new Date().toISOString()
        },
        {
          event_id: 'e3',
          agent_version: 'v1',
          type: 'CPU_TOOL_EXECUTION',
          payload: { tool_name: 'get_ticket_by_id' },
          timestamp: new Date().toISOString()
        }
      ];
      events.forEach((e) => eventStore.addEvent(e));
    });

    it('observes events from EventStore without duplication', () => {
      expect(service.events().length).toBe(3);
      expect(service.totalEvents()).toBe(3);
    });

    it('scrubs through events and updates activeEvent', () => {
      service.selectEventIndex(1);
      expect(service.simulatorEventIndex()).toBe(1);
      expect(controller.mode()).toBe('replay');

      service.stepNextEvent();
      expect(service.simulatorEventIndex()).toBe(2);

      service.stepPrevEvent();
      expect(service.simulatorEventIndex()).toBe(1);

      service.resetEvents();
      expect(service.simulatorEventIndex()).toBe(0);
    });

    it('returns pedagogical markdown excerpt for nodes', () => {
      const excerpt = service.getNodeMarkdownExcerpt(SIMULATOR_NODES['RUNTIME']);
      expect(excerpt).toContain('Runtime Orquestador');
      expect(excerpt).toContain('Rol pedagógico');
    });
  });
});
