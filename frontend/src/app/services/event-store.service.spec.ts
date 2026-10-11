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

  describe('Agent v3 State & Memory Projection (Phase 6.1)', () => {
    it('projects a single SSE stream simultaneously to v2Execution and v3State (Dual Projection)', () => {
      service.startNewRun('v3');
      expect(service.activeAgentId()).toBe('v3');

      // 1. Memory Hydration
      service.addEvent({
        event_id: 'evt-v3-hyd',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        type: 'MEMORY_HYDRATED',
        phase: 'hydration',
        payload: {
          conversation_id: 'conv-carlos-101',
          turns_count: 2,
          decisions_count: 1,
          active_decisions: [
            { key: 'theme_mode', value: 'dark', scope: 'persistent', version: 1 }
          ],
          stats: {
            query_tokens: 25,
            system_prompt_tokens: 350,
            decisions_tokens: 40,
            available_history_budget: 1200,
            history_turns_count: 2,
            total_initial_tokens: 415
          }
        },
        timestamp: new Date().toISOString()
      });

      // 2. Loop Execution Events (emitted by v3 using v2 engine)
      service.addEvent({
        event_id: 'evt-v3-run-start',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        type: 'RUN_STARTED',
        payload: { query: '¿Quién lo tiene asignado?', operator: 'usr_carlos', max_iterations: 5 },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-iter-start',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        phase: 'loop',
        type: 'ITERATION_STARTED',
        payload: { iteration_index: 1, max_iterations: 5 },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-inf-done',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        phase: 'inference',
        type: 'MODEL_INFERENCE_COMPLETED',
        payload: { has_tool_calls: true, tool_calls_count: 1, duration_ms: 150 },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-prop',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        phase: 'proposal',
        type: 'TOOL_CALL_PROPOSED',
        payload: { tool_call_id: 'call-v3-1', tool_name: 'get_ticket', arguments: { ticket_code: 'TICK-1001' } },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-val',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        phase: 'validation',
        type: 'ARGUMENTS_VALIDATED',
        payload: { tool_call_id: 'call-v3-1', is_valid: true },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-exec',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        phase: 'execution',
        type: 'TOOL_EXECUTION_COMPLETED',
        payload: { tool_call_id: 'call-v3-1', execution_status: 'success', duration_ms: 30, result: { assignee: 'usr_carlos' } },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-obs',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        phase: 'observation',
        type: 'OBSERVATION_APPENDED',
        payload: { tool_call_id: 'call-v3-1', observation: { assignee: 'usr_carlos' } },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-synth',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        phase: 'synthesis',
        type: 'FINAL_SYNTHESIS',
        payload: { answer: 'El ticket TICK-1001 está asignado a Carlos Restrepo.' },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-iter-done',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        iteration_index: 1,
        type: 'ITERATION_COMPLETED',
        payload: { decision: 'final_answer', tool_calls_count: 1, duration_ms: 350 },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-persisted',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        type: 'TURN_PERSISTED',
        phase: 'persistence',
        payload: { turn_id: 'turn-999', conversation_id: 'conv-carlos-101', status: 'stored_in_mysql' },
        timestamp: new Date().toISOString()
      });
      service.addEvent({
        event_id: 'evt-v3-run-done',
        agent_version: 'v3',
        execution_id: 'v3-exec-001',
        type: 'RUN_COMPLETED',
        payload: { stop_reason: 'final_answer', total_duration_ms: 600 },
        timestamp: new Date().toISOString()
      });

      // Verification of Projection A: v2Execution is fully populated for V2LoopFlowComponent
      const v2Exec = service.v2Execution();
      expect(v2Exec.agentVersion).toBe('v3');
      expect(v2Exec.status).toBe('completed');
      expect(v2Exec.totalIterations).toBe(1);
      expect(v2Exec.totalToolsExecuted).toBe(1);
      expect(v2Exec.iterations[0].phases.length).toBe(7);
      expect(v2Exec.iterations[0].phases[0].status).toBe('completed');
      expect(v2Exec.iterations[0].phases[1].tools?.length).toBe(1);
      expect(v2Exec.iterations[0].phases[3].status).toBe('completed');
      expect(v2Exec.finalAnswer).toContain('Carlos Restrepo');

      // Verification of Projection B: v3State is fully populated for V3MemoryInspectorComponent
      const v3 = service.v3State();
      expect(v3.executionId).toBe('v3-exec-001');
      expect(v3.confirmedConversationId).toBe('conv-carlos-101');
      expect(v3.persona).toBe('usr_carlos');
      expect(v3.hydration).not.toBeNull();
      expect(v3.hydration?.hydratedTurnsCount).toBe(2);
      expect(v3.activeDecisions.length).toBe(1);
      expect(v3.activeDecisions[0].key).toBe('theme_mode');
      expect(v3.persistedTurns.length).toBe(1);
      expect(v3.persistedTurns[0].turnId).toBe('turn-999');
    });

    it('captures memory hydration and context budget with heuristic indicators (Ajustes 1 y 5)', () => {
      service.startNewRun('v3');
      service.addEvent({
        event_id: 'evt-hyd',
        agent_version: 'v3',
        type: 'MEMORY_HYDRATED',
        payload: {
          conversation_id: 'conv-laura-202',
          turns_count: 5,
          decisions_count: 2,
          active_decisions: [
            { key: 'preferred_channel', value: 'SLACK', scope: 'persistent', version: 2 },
            { key: 'default_priority', value: 'HIGH', scope: 'persistent', version: 1 }
          ],
          stats: {
            query_tokens: 30,
            system_prompt_tokens: 360,
            decisions_tokens: 75,
            available_history_budget: 1800,
            history_tokens: 520,
            history_turns_count: 5,
            total_initial_tokens: 985,
            max_context_budget: 4096
          }
        },
        timestamp: new Date().toISOString()
      });

      const v3 = service.v3State();
      expect(v3.confirmedConversationId).toBe('conv-laura-202');
      expect(v3.hydration?.hydratedTurnsCount).toBe(5);
      expect(v3.hydration?.budget.queryTokensEst).toBe(30);
      expect(v3.hydration?.budget.systemPromptTokensEst).toBe(360);
      expect(v3.hydration?.budget.decisionsTokensEst).toBe(75);
      expect(v3.hydration?.budget.historyTokensEst).toBe(520);
      expect(v3.hydration?.budget.totalInitialTokensEst).toBe(985);
      expect(v3.hydration?.budget.availableHistoryBudget).toBe(1800);
      expect(v3.hydration?.budget.maxContextLimit).toBe(4096);
      expect(v3.hydration?.budget.isHeuristicEstimate).toBe(true);
      expect(v3.activeDecisions.length).toBe(2);
      // Persisted turns in the current active session starts empty until TURN_PERSISTED
      expect(v3.persistedTurns.length).toBe(0);
    });

    it('handles explicit decision persistence and revocation lifecycle', () => {
      service.startNewRun('v3');

      // 1. Save decision
      service.addEvent({
        event_id: 'evt-dec-1',
        agent_version: 'v3',
        type: 'DECISION_SAVED',
        payload: {
          decision_id: 'dec-prio-001',
          key: 'default_priority',
          value: 'HIGH',
          scope: 'persistent',
          version: 1,
          status: 'active',
          rationale: 'Preferencia explícita del usuario'
        },
        timestamp: new Date().toISOString()
      });

      let v3 = service.v3State();
      expect(v3.activeDecisions.length).toBe(1);
      expect(v3.activeDecisions[0].key).toBe('default_priority');
      expect(v3.activeDecisions[0].value).toBe('HIGH');
      expect(v3.activeDecisions[0].status).toBe('active');
      expect(v3.decisionsHistory.length).toBe(1);

      // 2. Revoke decision
      service.addEvent({
        event_id: 'evt-dec-2',
        agent_version: 'v3',
        type: 'DECISION_REVOKED',
        payload: { decision_key: 'default_priority', status: 'revoked' },
        timestamp: new Date().toISOString()
      });

      v3 = service.v3State();
      expect(v3.revokedKeys).toContain('default_priority');
      expect(v3.activeDecisions[0].status).toBe('revoked');
    });

    it('strictly separates visual pause, human wait (HITL), and task resumption (Ajuste 3)', () => {
      service.startNewRun('v3');
      expect(service.v3State().hitlStatus).toBe('none');

      // 1. Proposal of pending task
      service.addEvent({
        event_id: 'evt-task-prop',
        agent_version: 'v3',
        type: 'PENDING_TASK_PROPOSED',
        phase: 'hitl_pause',
        payload: {
          decision_id: 'task-assign-123',
          question: '¿A quién deseas asignar el ticket TICK-1001?',
          options: ['usr_carlos', 'usr_laura'],
          target_tool_name: 'assign_ticket',
          missing_parameter_name: 'assignee_username'
        },
        timestamp: new Date().toISOString()
      });

      let v3 = service.v3State();
      expect(v3.hitlStatus).toBe('waiting_human_decision');
      expect(v3.pendingTask?.status).toBe('pending');
      expect(v3.pendingTask?.options).toEqual(['usr_carlos', 'usr_laura']);

      // 2. Mark resuming task in transit
      service.markResumingTask('task-assign-123');
      v3 = service.v3State();
      expect(v3.hitlStatus).toBe('resuming_task');

      // 3. Resolution confirmed by backend
      service.addEvent({
        event_id: 'evt-task-res',
        agent_version: 'v3',
        type: 'PENDING_TASK_RESOLVED',
        phase: 'resumption',
        payload: {
          decision_id: 'task-assign-123',
          selected_value: 'usr_laura',
          target_tool_name: 'assign_ticket',
          status: 'resolved'
        },
        timestamp: new Date().toISOString()
      });

      v3 = service.v3State();
      expect(v3.hitlStatus).toBe('resolved');
      expect(service.resumingTaskId()).toBeNull();
      expect(v3.pendingTask?.status).toBe('resolved');
      expect(v3.pendingTask?.selectedValue).toBe('usr_laura');
    });

    it('captures recovery alert on uncertain mutation failure', () => {
      service.startNewRun('v3');
      service.addEvent({
        event_id: 'evt-task-prop',
        agent_version: 'v3',
        type: 'PENDING_TASK_PROPOSED',
        payload: {
          decision_id: 'task-mut-404',
          question: 'Reintento de mutación',
          target_tool_name: 'update_ticket_status',
          missing_parameter_name: 'new_status'
        },
        timestamp: new Date().toISOString()
      });

      service.addEvent({
        event_id: 'evt-recovery-alert',
        agent_version: 'v3',
        type: 'TASK_RECOVERY_REQUIRED',
        phase: 'reconciliation',
        payload: {
          decision_id: 'task-mut-404',
          target_tool_name: 'update_ticket_status',
          status: 'recovery_required',
          recovery_reason: 'Lease expirado durante la mutación, resultado incierto',
          execution_checkpoint: { step: 'db_commit_timeout' }
        },
        timestamp: new Date().toISOString()
      });

      const v3 = service.v3State();
      expect(v3.isRecoveryRequired).toBe(true);
      expect(v3.hitlStatus).toBe('recovery_required');
      expect(v3.recoveryAlert?.recoveryReason).toContain('Lease expirado');
      expect(v3.pendingTask?.status).toBe('recovery_required');
    });

    it('treats FastAPI as authority on conversation_id and supports retrieval (Ajuste 4)', () => {
      service.startNewRun('v3');
      expect(service.getConfirmedConversationId()).toBeNull();

      service.addEvent({
        event_id: 'evt-hyd',
        agent_version: 'v3',
        type: 'MEMORY_HYDRATED',
        payload: { conversation_id: 'conv-backend-auth-777', stats: {} },
        timestamp: new Date().toISOString()
      });

      expect(service.getConfirmedConversationId()).toBe('conv-backend-auth-777');
      expect(service.v3State().confirmedConversationId).toBe('conv-backend-auth-777');
    });

    it('maintains visual idempotency and clean state on resetAll', () => {
      service.startNewRun('v3');
      service.addEvent({
        event_id: 'evt-dec',
        agent_version: 'v3',
        type: 'DECISION_SAVED',
        payload: { key: 'pref_1', value: 'val_1', version: 1 },
        timestamp: new Date().toISOString()
      });
      // Duplicate event with same key updates map in-place
      service.addEvent({
        event_id: 'evt-dec-dup',
        agent_version: 'v3',
        type: 'DECISION_SAVED',
        payload: { key: 'pref_1', value: 'val_1_updated', version: 2 },
        timestamp: new Date().toISOString()
      });

      expect(service.v3State().activeDecisions.length).toBe(1);
      expect(service.v3State().activeDecisions[0].value).toBe('val_1_updated');

      service.resetAll();
      expect(service.events().length).toBe(0);
      expect(service.v3State().activeDecisions.length).toBe(0);
      expect(service.v3State().hitlStatus).toBe('none');
      expect(service.resumingTaskId()).toBeNull();
    });
  });
});
