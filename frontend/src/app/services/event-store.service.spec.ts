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
      payload: { iteration_index: 1, duration_ms: 220, decision: 'continue_next_iteration', tool_calls_count: 1, tools_invoked: ['identify_overdue_tickets'] },
      timestamp: new Date().toISOString()
    });

    const v2 = service.v2Execution();
    expect(v2.iterations.length).toBe(1);
    expect(v2.iterations[0].iterationIndex).toBe(1);
    expect(v2.iterations[0].status).toBe('completed');
    expect(v2.iterations[0].decision).toBe('continue_next_iteration');
    expect(v2.iterations[0].toolsCount).toBe(1);
    expect(v2.totalToolsExecuted).toBe(1);

    const phases = v2.iterations[0].phases;
    expect(phases[0].status).toBe('completed');
    expect(phases[1].status).toBe('completed');
    expect(phases[2].status).toBe('completed');
    expect(phases[3].status).toBe('completed');
    expect(phases[4].status).toBe('completed');
    expect(phases[5].status).toBe('completed');
    expect(phases[6].status).toBe('skipped');
    expect(phases[6].statusReason).toBeTruthy();
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

  describe('v2 phase semantics', () => {
    let seq = 0;
    const emit = (type: string, iteration: number, payload: Record<string, any> = {}, phase = 'loop'): void => {
      service.addEvent({
        event_id: `evt-${++seq}`,
        agent_version: 'v2',
        iteration_index: iteration,
        phase,
        type,
        payload,
        timestamp: new Date().toISOString()
      });
    };

    beforeEach(() => {
      seq = 0;
      service.startNewRun('v2');
      emit('RUN_STARTED', 0, { query: 'q', operator: 'usr', max_iterations: 3 }, 'init');
    });

    it('marks tool phases as skipped with a reason on a direct answer', () => {
      emit('ITERATION_STARTED', 1, { iteration_index: 1 });
      emit('MODEL_INFERENCE_STARTED', 1, {}, 'inference');
      emit('MODEL_INFERENCE_COMPLETED', 1, { has_tool_calls: false, tool_calls_count: 0, duration_ms: 10 }, 'inference');
      emit('FINAL_SYNTHESIS', 1, { answer: 'respuesta' }, 'synthesis');
      emit('ITERATION_COMPLETED', 1, { decision: 'final_answer', tool_calls_count: 0, tools_invoked: [] });
      emit('RUN_COMPLETED', 1, { stop_reason: 'final_answer' }, 'complete');

      const iter = service.v2Execution().iterations[0];
      const status = iter.phases.map((p) => p.status);
      expect(status).toEqual(['completed', 'skipped', 'skipped', 'skipped', 'skipped', 'completed', 'completed']);
      expect(iter.phases[1].statusReason).toContain('sin proponer herramientas');
      expect(iter.decision).toBe('final_answer');
      expect(iter.status).toBe('completed');
    });

    it('does not complete phases without evidence while the run is in progress', () => {
      emit('ITERATION_STARTED', 1, { iteration_index: 1 });
      emit('MODEL_INFERENCE_STARTED', 1, {}, 'inference');

      const status = service.v2Execution().iterations[0].phases.map((p) => p.status);
      expect(status).toEqual(['running', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle']);
    });

    it('reports stagnation as a safety stop with its own decision', () => {
      emit('ITERATION_STARTED', 1, { iteration_index: 1 });
      emit('MODEL_INFERENCE_COMPLETED', 1, { has_tool_calls: true, tool_calls_count: 1, duration_ms: 5 }, 'inference');
      emit('LOOP_REPETITION_DETECTED', 1, { message: 'Estancamiento detectado' });
      emit('ITERATION_COMPLETED', 1, { decision: 'stagnation_stopped', tool_calls_count: 1, tools_invoked: ['get_ticket'] });
      emit('RUN_FAILED', 1, { stop_reason: 'repetitive_tool_call', error_message: 'Estancamiento detectado' }, 'complete');

      const iter = service.v2Execution().iterations[0];
      expect(iter.decision).toBe('stagnation_stopped');
      expect(iter.decisionReason).toBe('Estancamiento detectado');
      expect(iter.status).toBe('failed');
      expect(iter.phases[5].status).toBe('failed');
      expect(iter.phases[1].status).toBe('skipped');
      expect(iter.phases[2].status).toBe('skipped');
    });

    it('marks inference as failed on inference timeout', () => {
      emit('ITERATION_STARTED', 1, { iteration_index: 1 });
      emit('MODEL_INFERENCE_STARTED', 1, {}, 'inference');
      emit('LOOP_TIMEOUT_EXCEEDED', 1, { reason: 'inference_timeout', message: 'Inferencia excedió el límite' });
      emit('RUN_FAILED', 1, { stop_reason: 'inference_timeout', error_message: 'Inferencia excedió el límite' }, 'complete');

      const iter = service.v2Execution().iterations[0];
      expect(iter.decision).toBe('timeout');
      expect(iter.status).toBe('timeout');
      expect(iter.phases[0].status).toBe('failed');
      expect(iter.phases[0].statusReason).toBe('Inferencia excedió el límite');
      expect(iter.phases[5].status).toBe('failed');
    });

    it('replaces continue with max_iterations when the limit is reached', () => {
      emit('ITERATION_STARTED', 1, { iteration_index: 1 });
      emit('ITERATION_COMPLETED', 1, { decision: 'continue_next_iteration', tool_calls_count: 1, tools_invoked: ['get_ticket'] });
      emit('LOOP_LIMIT_EXCEEDED', 1, { max_iterations: 1, message: 'Límite alcanzado' });

      const iter = service.v2Execution().iterations[0];
      expect(iter.decision).toBe('max_iterations');
      expect(iter.status).toBe('failed');
      expect(iter.phases[5].status).toBe('failed');
    });

    it('marks execution and validation failures from runtime evidence', () => {
      emit('ITERATION_STARTED', 1, { iteration_index: 1 });
      emit('MODEL_INFERENCE_COMPLETED', 1, { has_tool_calls: true, tool_calls_count: 1, duration_ms: 5 }, 'inference');
      emit('TOOL_CALL_PROPOSED', 1, { tool_call_id: 'c1', tool_name: 'get_ticket', arguments: {} }, 'proposal');
      emit('ARGUMENTS_VALIDATED', 1, { tool_call_id: 'c1', is_valid: false, validation_error: 'ticket_id requerido' }, 'validation');
      emit('TOOL_EXECUTION_COMPLETED', 1, { tool_call_id: 'c1', tool_name: 'get_ticket', execution_status: 'error', result: { message: 'argumentos inválidos' } }, 'execution');

      const phases = service.v2Execution().iterations[0].phases;
      expect(phases[2].status).toBe('failed');
      expect(phases[2].statusReason).toContain('ticket_id requerido');
      expect(phases[3].status).toBe('failed');
      expect(phases[3].statusReason).toContain('argumentos inválidos');
    });

    it('marks the running iteration as failed on fatal errors', () => {
      emit('ITERATION_STARTED', 1, { iteration_index: 1 });
      emit('MODEL_INFERENCE_STARTED', 1, {}, 'inference');
      emit('RUN_FAILED', 1, { stop_reason: 'fatal_error', error_message: 'Error en inferencia' }, 'complete');

      const iter = service.v2Execution().iterations[0];
      expect(iter.decision).toBe('fatal_error');
      expect(iter.phases[0].status).toBe('failed');
    });
  });
});
