import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { EventStoreService } from './event-store.service';
import { StreamEvent } from '../models/agent.models';

describe('EventStoreService', () => {
  let service: EventStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EventStoreService);
  });

  it('should be created with initial state', () => {
    expect(service).toBeTruthy();
    expect(service.events().length).toBe(0);
    expect(service.runStatus()).toBe('idle');
    expect(service.activeAgentId()).toBe('v1');
  });

  it('should reset state on startNewRun', () => {
    service.addEvent({
      event_id: 'evt-1',
      agent_version: 'v1',
      type: 'USER_REQUEST',
      payload: { query: 'test' },
      timestamp: new Date().toISOString()
    });
    expect(service.events().length).toBe(1);

    service.startNewRun('v2');
    expect(service.events().length).toBe(0);
    expect(service.activeAgentId()).toBe('v2');
    expect(service.runStatus()).toBe('running');
  });

  it('should compute v1 journey correctly', () => {
    service.startNewRun('v1');
    service.addEvent({
      event_id: 'evt-1',
      agent_version: 'v1',
      hop_number: 1,
      type: 'USER_REQUEST',
      payload: { query: 'Consulta tickets', persona: 'usr_carlos' },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-2',
      agent_version: 'v1',
      hop_number: 2,
      type: 'MODEL_INFERENCE_1',
      payload: { model: 'qwen' },
      timestamp: new Date().toISOString()
    });

    const journey = service.journey();
    expect(journey.steps.length).toBe(7);
    expect(journey.steps[0].status).toBe('completed');
    expect(journey.steps[1].status).toBe('completed');
    expect(journey.query).toBe('Consulta tickets');
  });

  it('should compute v2 execution with iterations and phases', () => {
    service.startNewRun('v2');
    service.addEvent({
      event_id: 'evt-v2-1',
      agent_version: 'v2',
      execution_id: 'exec-123',
      type: 'RUN_STARTED',
      payload: { query: 'Tickets vencidos', operator: 'usr_carlos', max_iterations: 5 },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-v2-2',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'loop',
      type: 'ITERATION_STARTED',
      payload: { iteration_index: 1, max_iterations: 5 },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-v2-3',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'inference',
      type: 'MODEL_INFERENCE_COMPLETED',
      payload: { has_tool_calls: true, tool_calls_count: 1, duration_ms: 120 },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-v2-4',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'proposal',
      type: 'TOOL_CALL_PROPOSED',
      payload: { tool_call_id: 'call-1', tool_name: 'identify_overdue_tickets', arguments: {}, is_mutative: false },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-v2-5',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'validation',
      type: 'ARGUMENTS_VALIDATED',
      payload: { tool_call_id: 'call-1', is_valid: true },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-v2-6',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'execution',
      type: 'TOOL_EXECUTION_COMPLETED',
      payload: { tool_call_id: 'call-1', execution_status: 'success', duration_ms: 45, result: { tickets: ['TICK-1002'] } },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-v2-7',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'observation',
      type: 'OBSERVATION_APPENDED',
      payload: { tool_call_id: 'call-1', observation: { tickets: ['TICK-1002'] } },
      timestamp: new Date().toISOString()
    });
    service.addEvent({
      event_id: 'evt-v2-8',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'loop',
      type: 'ITERATION_COMPLETED',
      payload: { iteration_index: 1, duration_ms: 220, decision: 'continue', tool_calls_count: 1, tools_invoked: ['identify_overdue_tickets'] },
      timestamp: new Date().toISOString()
    });

    const v2 = service.v2Execution();
    expect(v2.iterations.length).toBe(1);
    expect(v2.iterations[0].iterationIndex).toBe(1);
    expect(v2.iterations[0].status).toBe('completed');
    expect(v2.iterations[0].decision).toBe('continue');
    expect(v2.iterations[0].toolsCount).toBe(1);
    expect(v2.totalToolsExecuted).toBe(1);

    const phases = v2.iterations[0].phases;
    expect(phases[0].status).toBe('completed');
    expect(phases[1].status).toBe('completed');
    expect(phases[2].status).toBe('completed');
    expect(phases[3].status).toBe('completed');
    expect(phases[4].status).toBe('completed');
    expect(phases[5].status).toBe('completed');
  });

  it('should handle terminal stop conditions and mark status correctly', () => {
    service.startNewRun('v2');
    service.addEvent({
      event_id: 'evt-stop-1',
      agent_version: 'v2',
      iteration_index: 1,
      phase: 'loop',
      type: 'LOOP_LIMIT_EXCEEDED',
      payload: { max_iterations: 5, message: 'Maximo alcanzado' },
      timestamp: new Date().toISOString()
    });

    const v2 = service.v2Execution();
    expect(v2.stopReason).toBe('loop_limit_exceeded');
    expect(v2.errorMessage).toBe('Maximo alcanzado');
  });
});
