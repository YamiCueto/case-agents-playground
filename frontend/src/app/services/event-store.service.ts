import { Injectable, signal, computed } from '@angular/core';
import { StreamEvent } from '../models/agent.models';
import { AgentExecutionJourney, AgentJourneyStep, JourneyHopStatus } from '../models/journey.models';

@Injectable({
  providedIn: 'root'
})
export class EventStoreService {
  readonly events = signal<StreamEvent[]>([]);
  readonly currentRunId = signal<string>('');
  readonly activeAgentId = signal<string>('v1');
  readonly runStatus = signal<'idle' | 'running' | 'completed' | 'failed' | 'cancelled'>('idle');

  private createInitialSteps(): AgentJourneyStep[] {
    return [
      {
        id: 'step-1',
        hopNumber: 1,
        title: 'HOP 1 - USER REQUEST',
        shortName: 'Consulta',
        actor: 'Usuario / Cliente',
        actorType: 'user',
        description: 'Captura de la consulta y persona en el runtime de la aplicación.',
        pedagogicalInsight: 'Punto de entrada: el sistema registra la intención del usuario y su rol antes de cualquier procesamiento de IA.',
        status: 'idle',
        eventType: 'USER_REQUEST'
      },
      {
        id: 'step-2',
        hopNumber: 2,
        title: 'HOP 2 - MODEL INFERENCE 1',
        shortName: 'Inferencia 1',
        actor: 'Qwen 3.5 4B (llama.cpp)',
        actorType: 'model',
        description: 'Envío de contexto y Tool Schemas hacia llama.cpp.',
        pedagogicalInsight: 'El LLM razona sobre los esquemas de funciones disponibles para decidir si requiere invocar herramientas externas.',
        status: 'idle',
        eventType: 'MODEL_INFERENCE_1'
      },
      {
        id: 'step-3',
        hopNumber: 3,
        title: 'HOP 3 - TOOL PROPOSAL',
        shortName: 'Propuesta Tool',
        actor: 'Decisión del LLM',
        actorType: 'proposal',
        description: 'El modelo propone invocar una herramienta o responde directamente.',
        pedagogicalInsight: 'Bifurcación clave: el modelo emite un Tool Call estructurado o una respuesta directa si la consulta es conceptual.',
        status: 'idle',
        eventType: 'TOOL_PROPOSAL'
      },
      {
        id: 'step-4',
        hopNumber: 4,
        title: 'HOP 4 - ARGUMENT VALIDATION',
        shortName: 'Validación Pydantic',
        actor: 'Python Pydantic Validator',
        actorType: 'validator',
        description: 'Validación estricta de tipos de argumentos mediante esquemas Pydantic.',
        pedagogicalInsight: 'Barrera de seguridad: el código Python valida tipos y formatos antes de que cualquier parámetro llegue a la base de datos.',
        status: 'idle',
        eventType: 'ARGUMENT_VALIDATION'
      },
      {
        id: 'step-5',
        hopNumber: 5,
        title: 'HOP 5 - CPU TOOL EXECUTION',
        shortName: 'Ejecución MySQL',
        actor: 'TicketService (Python CPU + MySQL)',
        actorType: 'executor',
        description: 'Ejecución soberana en CPU dentro de TicketService sobre MySQL.',
        pedagogicalInsight: 'Ejecución real en base de datos: la IA nunca accede directamente a SQL, sino a través de servicios soberanos en Python.',
        status: 'idle',
        eventType: 'CPU_TOOL_EXECUTION'
      },
      {
        id: 'step-6',
        hopNumber: 6,
        title: 'HOP 6 - TOOL RESULT INJECTION',
        shortName: 'Inyección Contexto',
        actor: 'Runtime Context Injection',
        actorType: 'injector',
        description: 'Inyección de observación con role: tool en el historial de mensajes.',
        pedagogicalInsight: 'Retorno de hechos: el resultado verificado de MySQL se entrega como evidencia documental en el contexto del modelo.',
        status: 'idle',
        eventType: 'TOOL_RESULT_INJECTION'
      },
      {
        id: 'step-7',
        hopNumber: 7,
        title: 'HOP 7 - FINAL SYNTHESIS',
        shortName: 'Síntesis Final',
        actor: 'Qwen 3.5 4B (Síntesis)',
        actorType: 'synthesis',
        description: 'Segunda llamada explícita al modelo para sintetizar la respuesta final.',
        pedagogicalInsight: 'Síntesis grounded: el modelo genera la respuesta en lenguaje natural respaldado estrictamente en los datos de la herramienta.',
        status: 'idle',
        eventType: 'FINAL_SYNTHESIS'
      }
    ];
  }

  readonly journey = computed<AgentExecutionJourney>(() => {
    const rawEvents = this.events();
    const steps = this.createInitialSteps();
    let hasDirectAnswer = false;
    let query = '';
    let persona = '';
    let startedAt = '';
    let finishedAt: string | undefined = undefined;

    for (let i = 0; i < rawEvents.length; i++) {
      const evt = rawEvents[i];
      if (i === 0) startedAt = evt.timestamp;

      if (evt.type === 'USER_REQUEST') {
        query = evt.payload['query'] || '';
        persona = evt.payload['persona'] || '';
        steps[0].status = 'completed';
        steps[0].payload = evt.payload;
        steps[0].timestamp = evt.timestamp;
      } else if (evt.type === 'MODEL_INFERENCE_1') {
        steps[1].status = 'completed';
        steps[1].payload = evt.payload;
        steps[1].timestamp = evt.timestamp;
      } else if (evt.type === 'TOOL_PROPOSAL') {
        steps[2].status = 'completed';
        steps[2].payload = evt.payload;
        steps[2].timestamp = evt.timestamp;
      } else if (evt.type === 'DIRECT_ANSWER') {
        hasDirectAnswer = true;
        steps[2].title = 'HOP 3 - DIRECT ANSWER';
        steps[2].shortName = 'Respuesta Directa';
        steps[2].description = 'El modelo resolvió la consulta directamente sin requerir herramientas.';
        steps[2].pedagogicalInsight = 'Consulta conceptual: Qwen detectó que la pregunta no requería consultar la base de datos de tickets.';
        steps[2].status = 'completed';
        steps[2].payload = evt.payload;
        steps[2].timestamp = evt.timestamp;
      } else if (evt.type === 'ARGUMENT_VALIDATION') {
        const isValid = evt.payload['is_valid'] !== false;
        steps[3].status = isValid ? 'completed' : 'failed';
        steps[3].payload = evt.payload;
        steps[3].timestamp = evt.timestamp;
      } else if (evt.type === 'CPU_TOOL_EXECUTION') {
        const isSuccess = evt.payload['execution_status'] === 'success';
        steps[4].status = isSuccess ? 'completed' : 'failed';
        steps[4].payload = evt.payload;
        steps[4].timestamp = evt.timestamp;
      } else if (evt.type === 'TOOL_RESULT_INJECTION') {
        steps[5].status = 'completed';
        steps[5].payload = evt.payload;
        steps[5].timestamp = evt.timestamp;
      } else if (evt.type === 'FINAL_SYNTHESIS') {
        steps[6].status = 'completed';
        steps[6].payload = evt.payload;
        steps[6].timestamp = evt.timestamp;
      } else if (evt.type === 'RUN_COMPLETED') {
        finishedAt = evt.timestamp;
      }
    }

    if (hasDirectAnswer) {
      steps[3].status = 'skipped';
      steps[3].description = 'Omitido: Sin argumentos de herramientas para validar.';
      steps[4].status = 'skipped';
      steps[4].description = 'Omitido: Sin ejecución de consultas en MySQL.';
      steps[5].status = 'skipped';
      steps[5].description = 'Omitido: Sin resultado de herramienta para inyectar.';
    }

    const currentStatus = this.runStatus();
    if (currentStatus === 'running') {
      const firstIdle = steps.find((s) => s.status === 'idle');
      if (firstIdle) {
        firstIdle.status = 'active';
      }
    }

    return {
      runId: this.currentRunId(),
      agentVersion: this.activeAgentId(),
      query,
      persona,
      startedAt: startedAt || new Date().toISOString(),
      finishedAt,
      status: currentStatus === 'idle' ? 'idle' : currentStatus,
      steps,
      events: rawEvents,
      hasDirectAnswer
    };
  });

  startNewRun(agentVersion: string = 'v1'): void {
    this.currentRunId.set(`run-${Date.now()}`);
    this.activeAgentId.set(agentVersion);
    this.events.set([]);
    this.runStatus.set('running');
  }

  addEvent(event: StreamEvent): void {
    this.events.update((prev) => [...prev, event]);
    if (event.type === 'RUN_COMPLETED') {
      this.runStatus.set('completed');
    } else if (event.type === 'ERROR') {
      this.runStatus.set('failed');
    }
  }

  markCancelled(): void {
    this.runStatus.set('cancelled');
  }

  resetAll(): void {
    this.events.set([]);
    this.runStatus.set('idle');
  }
}
