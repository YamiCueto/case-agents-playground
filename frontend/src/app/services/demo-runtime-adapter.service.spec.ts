import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DemoRuntimeAdapterService } from './demo-runtime-adapter.service';
import { DemoScenario } from '../models/demo.models';
import { StreamEvent } from '../models/agent.models';

describe('DemoRuntimeAdapterService', () => {
  let service: DemoRuntimeAdapterService;

  const mockScenario: DemoScenario = {
    id: 'test-v1-scenario',
    version: 'v1',
    title: 'Test Scenario',
    description: 'Testing demo stream playback',
    suggestedPrompt: 'Test Prompt',
    persona: 'usr_carlos',
    finalResponse: 'Resultado final de prueba',
    pedagogicalConcepts: ['Test Concept'],
    isSynthetic: false,
    eventsCount: 2,
    events: [
      {
        event_id: 'ev-1',
        agent_version: 'v1',
        type: 'RUN_STARTED',
        phase: 'REQUEST_RECEIVED',
        timestamp: '2026-10-12T12:00:00Z',
        payload: { agent_version: 'v1', query: 'Test Prompt' }
      },
      {
        event_id: 'ev-2',
        agent_version: 'v1',
        type: 'RUN_COMPLETED',
        phase: 'FINAL_SYNTHESIS',
        timestamp: '2026-10-12T12:00:01Z',
        payload: { message: 'Fin' }
      }
    ]
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(DemoRuntimeAdapterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return fallback agents, personas, and tickets offline', () => {
    const agents = service.getStaticAgents();
    expect(agents.length).toBeGreaterThanOrEqual(4);
    expect(agents.some((a) => a.id === 'v1')).toBe(true);

    const personas = service.getStaticPersonas();
    expect(personas.length).toBeGreaterThanOrEqual(3);

    const tickets = service.getStaticTickets();
    expect(tickets.length).toBeGreaterThanOrEqual(3);

    const health = service.getStaticHealth();
    expect(health.status).toBe('healthy');
  });

  it('should stream scenario events and trigger onEvent and onComplete callbacks', async () => {
    const receivedEvents: StreamEvent[] = [];
    let completed = false;

    await service.streamScenario(
      mockScenario,
      {
        onEvent: (event) => receivedEvents.push(event),
        onError: () => {},
        onComplete: () => { completed = true; }
      },
      { speed: 4 } // alta velocidad para pruebas rápidas
    );

    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents[0].type).toBe('RUN_STARTED');
    expect(receivedEvents[1].type).toBe('RUN_COMPLETED');
    expect(completed).toBe(true);
    expect(service.activePlaybackState()).toBe('completed');
  });

  it('should cancel playback when cancelStream is called', async () => {
    const receivedEvents: StreamEvent[] = [];

    const streamPromise = service.streamScenario(
      mockScenario,
      {
        onEvent: (event) => {
          receivedEvents.push(event);
          service.cancelStream();
        },
        onError: () => {},
        onComplete: () => {}
      },
      { speed: 1 }
    );

    await streamPromise;
    expect(service.activePlaybackState()).toBe('idle');
  });
});
