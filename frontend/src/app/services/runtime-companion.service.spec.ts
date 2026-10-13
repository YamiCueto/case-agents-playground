import { TestBed } from '@angular/core/testing';
import { RuntimeCompanionService } from './runtime-companion.service';
import { SimulatorProjectionService } from './simulator-projection.service';
import { StreamEvent } from '../models/agent.models';

describe('RuntimeCompanionService', () => {
  let service: RuntimeCompanionService;
  let mockSimulator: any;

  beforeEach(() => {
    mockSimulator = {
      openSimulator: vi.fn(),
      isOpen: vi.fn().mockReturnValue(false)
    };

    TestBed.configureTestingModule({
      providers: [
        RuntimeCompanionService,
        { provide: SimulatorProjectionService, useValue: mockSimulator }
      ]
    });

    service = TestBed.inject(RuntimeCompanionService);
  });

  it('1. inicia una corrida en estado preparing sin eventos', () => {
    const run = service.startRun('run-101', 'v1', 'Consulta ticket', 'usr_carlos');
    expect(run.status).toBe('preparing');
    expect(run.events.length).toBe(0);
    expect(run.agentVersion).toBe('v1');
    expect(run.activeEvent).toBeNull();
    expect(service.getRun('run-101')).toBeDefined();
    expect(service.activeRunId()).toBe('run-101');
  });

  it('2. transiciona a running al recibir el primer evento observable', () => {
    service.startRun('run-102', 'v1', 'Consulta ticket', 'usr_carlos');
    const evt: StreamEvent = {
      event_id: 'evt-102-1',
      type: 'INFERENCE_STARTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 2,
      payload: { prompt_preview: 'Consultar TICK-1001' }
    };

    service.appendEvent('run-102', evt);
    const updated = service.getRun('run-102');
    expect(updated?.status).toBe('running');
    expect(updated?.events.length).toBe(1);
    expect(updated?.activeEvent?.type).toBe('INFERENCE_STARTED');
    expect(updated?.eventMapping?.activeNode).toBe('LLM');
  });

  it('3. transiciona a completed al finalizar la ejecución', () => {
    service.startRun('run-103', 'v1', 'Consulta ticket', 'usr_carlos');
    service.appendEvent('run-103', {
      event_id: 'evt-103-1',
      type: 'INFERENCE_STARTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 2,
      payload: {}
    });
    service.completeRun('run-103');

    const updated = service.getRun('run-103');
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBeDefined();
  });

  it('4. maneja estado failed cuando ocurre un error de ejecución', () => {
    service.startRun('run-104', 'v1', 'Consulta ticket', 'usr_carlos');
    service.failRun('run-104', 'Conexión rechazada con Qwen');

    const updated = service.getRun('run-104');
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toBe('Conexión rechazada con Qwen');
  });

  it('5. maneja estado cancelled cuando el usuario interrumpe el streaming', () => {
    service.startRun('run-105', 'v2', 'Ciclo largo', 'usr_carlos');
    service.cancelRun('run-105');

    const updated = service.getRun('run-105');
    expect(updated?.status).toBe('cancelled');
    expect(updated?.errorMessage).toContain('cancelada por el usuario');
  });

  it('6. correlaciona eventos por runId y mantiene dos corridas consecutivas aisladas sin contaminación', () => {
    service.startRun('run-A', 'v1', 'Consulta A', 'usr_carlos');
    service.appendEvent('run-A', {
      event_id: 'evt-a-1',
      type: 'TOOL_PROPOSED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 3,
      payload: { tool_name: 'get_ticket_by_id' }
    });
    service.completeRun('run-A');

    // Iniciar segunda corrida
    service.startRun('run-B', 'v3', 'Consulta B', 'usr_carlos');
    service.appendEvent('run-B', {
      event_id: 'evt-b-1',
      type: 'MEMORY_HYDRATED',
      timestamp: new Date().toISOString(),
      agent_version: 'v3',
      payload: { user_persona: 'usr_carlos' }
    });

    const runA = service.getRun('run-A');
    const runB = service.getRun('run-B');

    expect(runA?.status).toBe('completed');
    expect(runA?.events.length).toBe(1);
    expect(runA?.agentVersion).toBe('v1');
    expect(runA?.activeEvent?.type).toBe('TOOL_PROPOSED');

    expect(runB?.status).toBe('running');
    expect(runB?.events.length).toBe(1);
    expect(runB?.agentVersion).toBe('v3');
    expect(runB?.activeEvent?.type).toBe('MEMORY_HYDRATED');
  });

  it('7. permite alternar minimizar y expandir la tarjeta', () => {
    service.startRun('run-107', 'v1', 'Test', 'usr_carlos');
    expect(service.getRun('run-107')?.isMinimized).toBe(false);

    service.toggleMinimize('run-107');
    expect(service.getRun('run-107')?.isMinimized).toBe(true);

    service.toggleMinimize('run-107');
    expect(service.getRun('run-107')?.isMinimized).toBe(false);
  });

  it('7b. permite alternar detalles expandidos y activar modo replay', () => {
    service.startRun('run-107b', 'v1', 'Test', 'usr_carlos');
    expect(service.getRun('run-107b')?.isDetailsExpanded).toBe(false);

    service.toggleDetails('run-107b');
    expect(service.getRun('run-107b')?.isDetailsExpanded).toBe(true);

    service.appendEvent('run-107b', {
      event_id: 'e-1',
      type: 'RUN_STARTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      payload: {}
    });
    service.enableReplayMode('run-107b');
    expect(service.getRun('run-107b')?.isReplayMode).toBe(true);
    expect(service.getRun('run-107b')?.isDetailsExpanded).toBe(true);
  });

  it('8. soporta navegación por Replay Scrubber en eventos grabados', () => {
    service.startRun('run-108', 'v1', 'Test Replay', 'usr_carlos');
    service.appendEvent('run-108', {
      event_id: 'evt-108-1',
      type: 'RUN_STARTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 1,
      payload: {}
    });
    service.appendEvent('run-108', {
      event_id: 'evt-108-2',
      type: 'TOOL_PROPOSED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 3,
      payload: { tool_name: 'get_ticket' }
    });
    service.appendEvent('run-108', {
      event_id: 'evt-108-3',
      type: 'OBSERVATION_RECEIVED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 6,
      payload: { observation: { id: 'TICK-1001' } }
    });
    service.completeRun('run-108');

    // Desplazarse al evento 1 (TOOL_PROPOSED)
    service.setReplayIndex('run-108', 1);
    const at1 = service.getRun('run-108');
    expect(at1?.activeEventIndex).toBe(1);
    expect(at1?.activeEvent?.type).toBe('TOOL_PROPOSED');
    expect(at1?.isReplayMode).toBe(true);

    // Desplazarse al evento 0 (RUN_STARTED)
    service.setReplayIndex('run-108', 0);
    const at0 = service.getRun('run-108');
    expect(at0?.activeEventIndex).toBe(0);
    expect(at0?.activeEvent?.type).toBe('RUN_STARTED');
  });

  it('9. adapta topologías correctamente para v1, v2, v3 y v4', () => {
    service.startRun('rv1', 'v1', 'Q', 'usr');
    service.appendEvent('rv1', {
      event_id: 'e-1',
      type: 'TOOL_EXECUTION_COMPLETED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 5,
      payload: { tool_name: 'get_ticket' }
    });
    expect(service.getRun('rv1')?.eventMapping?.activeNode).toBe('TOOLS');

    service.startRun('rv3', 'v3', 'Q', 'usr');
    service.appendEvent('rv3', {
      event_id: 'e-3',
      type: 'PREFERENCE_DETECTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v3',
      payload: { key: 'lang', value: 'es' }
    });
    expect(service.getRun('rv3')?.eventMapping?.activeNode).toBe('MEMORY');

    service.startRun('rv4', 'v4', 'Q', 'usr');
    service.appendEvent('rv4', {
      event_id: 'e-4',
      type: 'TASK_DECOMPOSED',
      timestamp: new Date().toISOString(),
      agent_version: 'v4',
      payload: { steps: [{ id: 'S1' }] }
    });
    expect(service.getRun('rv4')?.eventMapping?.activeNode).toBe('PLANNER');
  });

  it('10. tolera eventos desconocidos sin lanzar excepciones', () => {
    service.startRun('run-unk', 'v1', 'Q', 'usr');
    expect(() => {
      service.appendEvent('run-unk', {
        event_id: 'e-unk',
        type: 'CUSTOM_UNKNOWN_EVENT_TYPE' as any,
        timestamp: new Date().toISOString(),
        agent_version: 'v1',
        payload: { extra: 123 }
      });
    }).not.toThrow();

    const run = service.getRun('run-unk');
    expect(run?.status).toBe('running');
    expect(run?.activeEvent?.type).toBe('CUSTOM_UNKNOWN_EVENT_TYPE');
    expect(run?.eventMapping?.stateBadge).toBe('CUSTOM_UNKNOWN_EVENT_TYPE');
  });

  it('11. abre el simulador 3D con los eventos específicos de la corrida seleccionada', () => {
    service.startRun('run-sim', 'v2', 'Consulta sim', 'usr');
    service.appendEvent('run-sim', {
      event_id: 'e-sim',
      type: 'LOOP_ITERATION_STARTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v2',
      iteration_index: 1,
      payload: {}
    });

    service.open3DSimulator('run-sim');
    expect(mockSimulator.openSimulator).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'LOOP_ITERATION_STARTED' })]),
      'v2'
    );
  });
});
