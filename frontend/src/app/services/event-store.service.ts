import { Injectable, signal, computed } from '@angular/core';
import { StreamEvent } from '../models/agent.models';
import { AgentExecutionJourney, AgentJourneyStep } from '../models/journey.models';
import {
  AgentV2Execution,
  AgentV2Iteration,
  AgentV2Phase,
  AgentV2ToolExecution
} from '../models/v2-loop.models';
import { describeDecision } from '../models/v2-decision';
import { closeIteration, findPhase, setPhaseStatus, skipToolPhases } from './v2-iteration-state';

@Injectable({
  providedIn: 'root'
})
export class EventStoreService {
  readonly events = signal<StreamEvent[]>([]);
  readonly currentRunId = signal<string>('');
  readonly activeAgentId = signal<string>('v1');
  readonly runStatus = signal<'idle' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'>('idle');

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

  private createInitialV2Phases(iterationIndex: number): AgentV2Phase[] {
    return [
      {
        id: `iter-${iterationIndex}-phase-inference`,
        phaseType: 'inference',
        title: 'Inferencia del Modelo',
        shortName: 'Inferencia',
        actor: 'Qwen 3.5 4B (llama.cpp)',
        description: 'Envío del historial conversacional y esquemas de herramientas al modelo local.',
        pedagogicalInsight: 'El LLM analiza el contexto acumulado para decidir si invoca herramientas o responde directamente.',
        status: 'idle',
        tools: []
      },
      {
        id: `iter-${iterationIndex}-phase-proposal`,
        phaseType: 'proposal',
        title: 'Propuesta de Herramienta',
        shortName: 'Propuesta',
        actor: 'Decisión del LLM (Tool Call)',
        description: 'El modelo emite una o varias propuestas estructuradas de tool calls.',
        pedagogicalInsight: 'Paso causal: el modelo declara formalmente qué función ejecutar y con qué argumentos antes de cualquier efecto.',
        status: 'idle',
        tools: []
      },
      {
        id: `iter-${iterationIndex}-phase-validation`,
        phaseType: 'validation',
        title: 'Validación Pydantic',
        shortName: 'Validación',
        actor: 'Python Pydantic Validator',
        description: 'Validación estricta de tipos y contratos de argumentos antes de ejecución.',
        pedagogicalInsight: 'Barrera de contención: garantiza que argumentos alucinados o malformados se intercepten antes de llegar a la base de datos.',
        status: 'idle',
        tools: []
      },
      {
        id: `iter-${iterationIndex}-phase-execution`,
        phaseType: 'execution',
        title: 'Ejecución Soberana en CPU/DB',
        shortName: 'Ejecución',
        actor: 'TicketService (Python CPU + MySQL)',
        description: 'Ejecución controlada de la herramienta sobre MySQL con sesiones aisladas y timeouts.',
        pedagogicalInsight: 'Ejecución determinista: la base de datos es accedida únicamente por servicios soberanos en CPU con políticas de autorización.',
        status: 'idle',
        tools: []
      },
      {
        id: `iter-${iterationIndex}-phase-observation`,
        phaseType: 'observation',
        title: 'Inyección de Observación',
        shortName: 'Observación',
        actor: 'Runtime Context Injection',
        description: 'Inyección de la observación con role: tool en el historial de mensajes.',
        pedagogicalInsight: 'Fundamentación fáctica: la evidencia verificada de MySQL se incorpora al contexto para que la siguiente iteración razone sobre hechos reales.',
        status: 'idle',
        tools: []
      },
      {
        id: `iter-${iterationIndex}-phase-decision`,
        phaseType: 'decision',
        title: 'Decisión del Ciclo',
        shortName: 'Decisión',
        actor: 'Runtime Loop Controller',
        description: 'Evaluación de condiciones de parada, límites de iteración y detección de estancamiento.',
        pedagogicalInsight: 'Control del bucle: el motor evalúa si continuar con la siguiente iteración o emitir la síntesis final.',
        status: 'idle',
        tools: []
      },
      {
        id: `iter-${iterationIndex}-phase-synthesis`,
        phaseType: 'synthesis',
        title: 'Síntesis Final Grounded',
        shortName: 'Síntesis',
        actor: 'Qwen 3.5 4B (Síntesis)',
        description: 'Generación de respuesta final en lenguaje natural fundamentada en las observaciones.',
        pedagogicalInsight: 'Cierre del bucle: la respuesta final sintetiza toda la evidencia recopilada en las iteraciones previas.',
        status: 'idle',
        tools: []
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
      status: currentStatus === 'idle' ? 'idle' : currentStatus === 'timeout' ? 'failed' : currentStatus,
      steps,
      events: rawEvents,
      hasDirectAnswer
    };
  });

  readonly v2Execution = computed<AgentV2Execution>(() => {
    const rawEvents = this.events();
    let executionId = this.currentRunId();
    let query = '';
    let operator = '';
    let maxIterations = 5;
    let stopReason: string | undefined = undefined;
    let totalIterations = 0;
    let totalToolsExecuted = 0;
    let totalDurationMs: number | undefined = undefined;
    let finalAnswer: string | undefined = undefined;
    let errorMessage: string | undefined = undefined;
    let startedAt = '';
    let finishedAt: string | undefined = undefined;

    const iterationsMap = new Map<number, AgentV2Iteration>();

    for (let i = 0; i < rawEvents.length; i++) {
      const evt = rawEvents[i];
      if (i === 0) startedAt = evt.timestamp;

      if (evt.execution_id && !executionId) {
        executionId = evt.execution_id;
      }

      if (evt.type === 'RUN_STARTED') {
        query = evt.payload['query'] || '';
        operator = evt.payload['operator'] || '';
        maxIterations = evt.payload['max_iterations'] || 5;
      } else if (evt.type === 'ITERATION_STARTED') {
        const iterIdx = evt.iteration_index || evt.payload['iteration_index'] || 1;
        totalIterations = Math.max(totalIterations, iterIdx);
        if (!iterationsMap.has(iterIdx)) {
          const phases = this.createInitialV2Phases(iterIdx);
          phases[0].status = 'running';
          iterationsMap.set(iterIdx, {
            iterationIndex: iterIdx,
            status: 'running',
            phases,
            toolsCount: 0,
            toolsInvoked: [],
            elapsedSeconds: evt.payload['elapsed_seconds'],
            summary: `Iteración ${iterIdx} en progreso`
          });
        }
      } else if (evt.type === 'MODEL_INFERENCE_STARTED') {
        const iterIdx = evt.iteration_index || 1;
        let iter = iterationsMap.get(iterIdx);
        if (!iter) {
          iter = {
            iterationIndex: iterIdx,
            status: 'running',
            phases: this.createInitialV2Phases(iterIdx),
            toolsCount: 0,
            toolsInvoked: [],
            summary: `Iteración ${iterIdx} en progreso`
          };
          iterationsMap.set(iterIdx, iter);
        }
        iter.phases[0].status = 'running';
        iter.phases[0].payload = evt.payload;
        iter.phases[0].timestamp = evt.timestamp;
      } else if (evt.type === 'MODEL_INFERENCE_COMPLETED') {
        const iterIdx = evt.iteration_index || 1;
        const iter = iterationsMap.get(iterIdx);
        if (iter) {
          const inference = findPhase(iter, 'inference');
          inference.status = 'completed';
          inference.statusReason = undefined;
          inference.durationMs = evt.payload['duration_ms'];
          inference.payload = { ...inference.payload, ...evt.payload };
          const hasToolCalls = evt.payload['has_tool_calls'] === true;
          if (hasToolCalls) {
            setPhaseStatus(iter, 'proposal', 'running');
          } else {
            skipToolPhases(
              iter,
              'El modelo respondió directamente sin proponer herramientas (tool_calls_count = 0).'
            );
            setPhaseStatus(iter, 'decision', 'running');
          }
        }
      } else if (evt.type === 'TOOL_CALL_PROPOSED') {
        const iterIdx = evt.iteration_index || 1;
        const iter = iterationsMap.get(iterIdx);
        if (iter) {
          const proposal = findPhase(iter, 'proposal');
          setPhaseStatus(iter, 'proposal', 'completed');
          proposal.payload = evt.payload;
          setPhaseStatus(iter, 'validation', 'running');
          const toolExec: AgentV2ToolExecution = {
            toolCallId: evt.payload['tool_call_id'] || `call-${Date.now()}`,
            toolName: evt.payload['tool_name'] || '',
            arguments: evt.payload['arguments'] || {},
            isMutative: evt.payload['is_mutative'] === true
          };
          proposal.tools = [...(proposal.tools || []), toolExec];
          if (!iter.toolsInvoked.includes(toolExec.toolName)) {
            iter.toolsInvoked.push(toolExec.toolName);
          }
          iter.toolsCount = proposal.tools.length;
        }
      } else if (evt.type === 'ARGUMENTS_VALIDATED') {
        const iterIdx = evt.iteration_index || 1;
        const iter = iterationsMap.get(iterIdx);
        if (iter) {
          const isValid = evt.payload['is_valid'] !== false;
          const validationError = evt.payload['validation_error'];
          setPhaseStatus(
            iter,
            'validation',
            isValid ? 'completed' : 'failed',
            isValid ? undefined : `Argumentos inválidos: ${validationError || 'sin detalle'}`
          );
          findPhase(iter, 'validation').payload = evt.payload;
          setPhaseStatus(iter, 'execution', 'running');
          const toolCallId = evt.payload['tool_call_id'];
          const targetTool = findPhase(iter, 'proposal').tools?.find((t) => t.toolCallId === toolCallId);
          if (targetTool) {
            targetTool.isValid = isValid;
            targetTool.validationError = validationError;
          }
        }
      } else if (evt.type === 'TOOL_EXECUTION_STARTED') {
        const iterIdx = evt.iteration_index || 1;
        const iter = iterationsMap.get(iterIdx);
        if (iter) {
          setPhaseStatus(iter, 'execution', 'running');
          findPhase(iter, 'execution').payload = evt.payload;
          const toolCallId = evt.payload['tool_call_id'];
          const targetTool = findPhase(iter, 'proposal').tools?.find((t) => t.toolCallId === toolCallId);
          if (targetTool) {
            targetTool.policy = evt.payload['policy'];
          }
        }
      } else if (evt.type === 'TOOL_EXECUTION_COMPLETED') {
        const iterIdx = evt.iteration_index || 1;
        const iter = iterationsMap.get(iterIdx);
        if (iter) {
          const isSuccess = evt.payload['execution_status'] === 'success';
          const result = evt.payload['result'];
          const detail = result && typeof result['message'] === 'string' ? `: ${result['message']}` : '';
          const execution = findPhase(iter, 'execution');
          setPhaseStatus(
            iter,
            'execution',
            isSuccess ? 'completed' : 'failed',
            isSuccess ? undefined : `La herramienta ${evt.payload['tool_name']} terminó con estado ${evt.payload['execution_status']}${detail}`
          );
          execution.durationMs = evt.payload['duration_ms'];
          execution.payload = evt.payload;
          setPhaseStatus(iter, 'observation', 'running');
          const toolCallId = evt.payload['tool_call_id'];
          const targetTool = findPhase(iter, 'proposal').tools?.find((t) => t.toolCallId === toolCallId);
          if (targetTool) {
            targetTool.executionStatus = evt.payload['execution_status'];
            targetTool.durationMs = evt.payload['duration_ms'];
            targetTool.idempotencyHit = evt.payload['idempotency_hit'];
            targetTool.observation = result;
          }
          totalToolsExecuted++;
        }
      } else if (evt.type === 'OBSERVATION_APPENDED') {
        const iterIdx = evt.iteration_index || 1;
        const iter = iterationsMap.get(iterIdx);
        if (iter) {
          setPhaseStatus(iter, 'observation', 'completed');
          findPhase(iter, 'observation').payload = evt.payload;
          setPhaseStatus(iter, 'decision', 'running');
          const toolCallId = evt.payload['tool_call_id'];
          const targetTool = findPhase(iter, 'proposal').tools?.find((t) => t.toolCallId === toolCallId);
          if (targetTool && !targetTool.observation) {
            targetTool.observation = evt.payload['observation'];
          }
        }
      } else if (evt.type === 'FINAL_SYNTHESIS') {
        finalAnswer = evt.payload['answer'] || evt.payload['content'] || evt.payload['message'] || '';
        const iter = iterationsMap.get(evt.iteration_index || totalIterations || 1);
        if (iter) {
          const synthesis = findPhase(iter, 'synthesis');
          synthesis.status = 'completed';
          synthesis.statusReason = undefined;
          synthesis.payload = evt.payload;
          synthesis.timestamp = evt.timestamp;
        }
      } else if (evt.type === 'ITERATION_COMPLETED') {
        const iterIdx = evt.iteration_index || evt.payload['iteration_index'] || 1;
        const iter = iterationsMap.get(iterIdx);
        if (iter) {
          const decision: string = evt.payload['decision'];
          iter.durationMs = evt.payload['duration_ms'];
          iter.toolsCount = evt.payload['tool_calls_count'] || iter.toolsCount;
          iter.toolsInvoked = evt.payload['tools_invoked'] || iter.toolsInvoked;
          if (decision === 'stagnation_stopped') {
            setPhaseStatus(
              iter,
              'proposal',
              'skipped',
              'El modelo propuso herramientas repetidas; el runtime las bloqueó antes de registrar la propuesta.'
            );
          }
          closeIteration(iter, decision, iter.decisionReason);
          const decisionPhase = findPhase(iter, 'decision');
          decisionPhase.durationMs = evt.payload['duration_ms'];
          decisionPhase.payload = evt.payload;
          iter.summary = `Iteración ${iterIdx}: ${iter.toolsCount} herramientas. Decisión: ${describeDecision(decision).label}`;
        }
      } else if (evt.type === 'LOOP_REPETITION_DETECTED') {
        stopReason = evt.type.toLowerCase();
        errorMessage = evt.payload['message'];
        const iter = iterationsMap.get(evt.iteration_index || totalIterations);
        if (iter) {
          iter.decisionReason = evt.payload['message'];
        }
      } else if (evt.type === 'LOOP_LIMIT_EXCEEDED' || evt.type === 'LOOP_TIMEOUT_EXCEEDED') {
        stopReason = evt.type.toLowerCase();
        errorMessage = evt.payload['message'];
        const iter = iterationsMap.get(evt.iteration_index || totalIterations);
        if (iter) {
          const decision = evt.type === 'LOOP_TIMEOUT_EXCEEDED' ? 'timeout' : 'max_iterations';
          closeIteration(iter, decision, evt.payload['message']);
          findPhase(iter, 'decision').payload = evt.payload;
          iter.summary = `Iteración ${iter.iterationIndex}: ${iter.toolsCount} herramientas. Decisión: ${describeDecision(decision).label}`;
        }
      } else if (evt.type === 'RUN_COMPLETED') {
        finishedAt = evt.timestamp;
        stopReason = evt.payload['stop_reason'] || 'final_answer';
        totalDurationMs = evt.payload['total_duration_ms'];
      } else if (evt.type === 'RUN_FAILED') {
        finishedAt = evt.timestamp;
        stopReason = evt.payload['stop_reason'] || 'error';
        errorMessage = evt.payload['error_message'];
        const openIter = iterationsMap.get(totalIterations);
        if (openIter && openIter.status === 'running') {
          closeIteration(openIter, 'fatal_error', errorMessage);
        }
      } else if (evt.type === 'RUN_CANCELLED') {
        finishedAt = evt.timestamp;
        stopReason = 'client_cancelled';
        const openIter = iterationsMap.get(totalIterations);
        if (openIter && openIter.status === 'running') {
          closeIteration(openIter, 'cancelled', evt.payload['message']);
        }
      }
    }

    const iterationsList = Array.from(iterationsMap.values()).sort(
      (a, b) => a.iterationIndex - b.iterationIndex
    );

    const currentStatus = this.runStatus();

    return {
      executionId: executionId || `run-${Date.now()}`,
      agentVersion: 'v2',
      query,
      operator,
      maxIterations,
      status: currentStatus,
      stopReason,
      totalIterations: iterationsList.length,
      totalToolsExecuted,
      totalDurationMs,
      iterations: iterationsList,
      events: rawEvents,
      finalAnswer,
      errorMessage,
      startedAt: startedAt || new Date().toISOString(),
      finishedAt
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
    } else if (event.type === 'RUN_FAILED' || event.type === 'ERROR') {
      this.runStatus.set('failed');
    } else if (event.type === 'RUN_CANCELLED') {
      this.runStatus.set('cancelled');
    } else if (event.type === 'LOOP_TIMEOUT_EXCEEDED') {
      this.runStatus.set('timeout');
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
