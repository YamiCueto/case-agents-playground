import { StreamEvent } from './agent.models';

export type TraceCategory = 'modelo' | 'runtime' | 'memoria' | 'resultado';

export type TraceItemStatus = 'completed' | 'running' | 'failed' | 'skipped' | 'info';

export type TraceViewMode = 'summary' | 'technical';

export interface SanitizedParam {
  key: string;
  value: string | number | boolean;
  isCode?: boolean;
}

export interface DecisionTraceEntry {
  id: string;
  eventId: string;
  timestamp: string;
  category: TraceCategory;
  actor: string;
  actorBadge: string;
  title: string;
  eventType: string;
  status: TraceItemStatus;
  
  // Vista Resumen (Didáctica y conceptual para estudiantes)
  summaryHeadline: string;
  summaryPedagogy: string;
  evidenceText: string;
  
  // Vista Técnico (Datos verificables para ingenieros)
  iterationIndex?: number;
  hopNumber?: number;
  phase?: string;
  sanitizedParams: SanitizedParam[];
  technicalPayload?: Record<string, any>;
  executionDurationMs?: number;
  errorDetail?: string;
}

/**
 * Sanitiza recursivamente valores para prevenir fugas de secretos o credenciales
 * y evita saturación de tamaño en la interfaz gráfica.
 */
export function sanitizeTraceValue(key: string, val: unknown): string | number | boolean {
  const lowerKey = key.toLowerCase();
  if (
    lowerKey.includes('token') && !lowerKey.includes('count') && !lowerKey.includes('limit') && !lowerKey.includes('budget') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('password') ||
    lowerKey.includes('api_key') ||
    lowerKey.includes('auth') ||
    lowerKey.includes('bearer')
  ) {
    return '[PROTEGIDO / SANITIZADO]';
  }

  if (val === null || val === undefined) {
    return 'No disponible';
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }

  if (typeof val === 'string') {
    if (val.length > 250) {
      return val.slice(0, 247) + '...';
    }
    return val;
  }

  if (typeof val === 'object') {
    try {
      const json = JSON.stringify(val);
      return json.length > 200 ? json.slice(0, 197) + '...' : json;
    } catch {
      return '[Objeto estructurado]';
    }
  }

  return String(val);
}

/**
 * Proyecta los eventos reales SSE en una lista estrictamente cronológica y observable
 * de trazas de decisión, sin deducir razonamientos ocultos ni inventar información.
 */
export function buildDecisionTrace(events: StreamEvent[], agentVersion: string): DecisionTraceEntry[] {
  const entries: DecisionTraceEntry[] = [];

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const payload = evt.payload || {};
    const traceId = `trace-${evt.event_id || i}`;

    switch (evt.type) {
      // 1. Petición inicial del usuario / Inicio de ejecución
      case 'USER_REQUEST':
      case 'RUN_STARTED': {
        const query = payload['query'] || 'Consulta del usuario';
        const persona = payload['persona'] || payload['operator'] || 'Usuario';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Runtime API (FastAPI)',
          actorBadge: 'RUNTIME',
          title: 'Inicio de turno y recepción de consulta',
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Petición recibida de ${persona}`,
          summaryPedagogy: 'Punto de entrada: el sistema registra la intención del usuario y su rol antes de cualquier procesamiento con el LLM.',
          evidenceText: `Consulta: "${query.length > 80 ? query.slice(0, 77) + '...' : query}"`,
          iterationIndex: evt.iteration_index,
          hopNumber: evt.hop_number || 1,
          phase: evt.phase || 'init',
          sanitizedParams: [
            { key: 'query', value: sanitizeTraceValue('query', query) },
            { key: 'persona', value: sanitizeTraceValue('persona', persona) },
            { key: 'agent_version', value: agentVersion }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 2. Hidratación de memoria persistente en Agent v3
      case 'MEMORY_HYDRATED': {
        const convId = payload['conversation_id'] || 'No disponible';
        const turnsCount = payload['turns_count'] ?? 0;
        const decisionsCount = payload['decisions_count'] ?? (payload['active_decisions']?.length || 0);
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'memoria',
          actor: 'MemoryManager (MySQL)',
          actorBadge: 'MEMORIA',
          title: 'Hidratación de memoria conversacional y preferencias',
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Memoria cargada: ${turnsCount} turnos previos y ${decisionsCount} decisiones activas`,
          summaryPedagogy: 'Recuperación de estado: se reconstruye el contexto conversacional desde MySQL para mantener coherencia temporal.',
          evidenceText: `Conversación confirmada: ${convId}`,
          iterationIndex: evt.iteration_index,
          phase: 'hydration',
          sanitizedParams: [
            { key: 'conversation_id', value: convId },
            { key: 'turns_count', value: turnsCount },
            { key: 'decisions_count', value: decisionsCount }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 3. Inicio o finalización de inferencia observable
      case 'MODEL_INFERENCE_1':
      case 'MODEL_INFERENCE_STARTED': {
        const iter = evt.iteration_index || 1;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'modelo',
          actor: 'Qwen 3.5 4B (llama.cpp)',
          actorBadge: 'MODELO',
          title: `Inferencia observable — Iteración ${iter}`,
          eventType: evt.type,
          status: 'running',
          summaryHeadline: 'Envío de contexto y esquemas de herramientas al LLM',
          summaryPedagogy: 'El modelo procesa el historial acumulado para determinar si invoca herramientas o emite respuesta en lenguaje natural.',
          evidenceText: 'Inferencia activa en llama.cpp local (temperatura determinista 0.1)',
          iterationIndex: iter,
          hopNumber: evt.hop_number || 2,
          phase: 'inference',
          sanitizedParams: [
            { key: 'modelo', value: 'Qwen 3.5 4B Instruct GGUF' },
            { key: 'temperatura', value: 0.1 },
            { key: 'iteration_index', value: iter }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'MODEL_INFERENCE_COMPLETED': {
        const iter = evt.iteration_index || 1;
        const dur = payload['duration_ms'] ?? 'No disponible';
        const hasTools = payload['has_tool_calls'] === true;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'modelo',
          actor: 'Qwen 3.5 4B (llama.cpp)',
          actorBadge: 'MODELO',
          title: `Inferencia completada — Iteración ${iter}`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: hasTools ? 'El modelo emitió propuestas de herramientas estructuradas' : 'El modelo respondió directamente sin herramientas',
          summaryPedagogy: 'Evidencia observable: el modelo concluyó su cálculo de tokens y transmitió formalmente su respuesta al runtime.',
          evidenceText: `Duración observable: ${dur} ms | Herramientas propuestas: ${hasTools ? 'Sí' : 'No'}`,
          iterationIndex: iter,
          hopNumber: evt.hop_number || 2,
          phase: 'inference',
          executionDurationMs: typeof dur === 'number' ? dur : undefined,
          sanitizedParams: [
            { key: 'duration_ms', value: dur },
            { key: 'has_tool_calls', value: hasTools },
            { key: 'tool_calls_count', value: payload['tool_calls_count'] ?? 0 }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 4. Propuesta de herramienta emitida por el modelo
      case 'TOOL_PROPOSAL':
      case 'TOOL_CALL_PROPOSED': {
        const toolName = payload['tool_name'] || 'Herramienta';
        const args = payload['arguments'] || {};
        const iter = evt.iteration_index || 1;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'modelo',
          actor: 'Qwen 3.5 4B (Propuesta)',
          actorBadge: 'MODELO',
          title: `Propuesta de herramienta: ${toolName}`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `El modelo solicitó invocar "${toolName}"`,
          summaryPedagogy: 'Paso causal verificable: el modelo declara formalmente qué función requiere ejecutar y con qué parámetros.',
          evidenceText: `Herramienta: ${toolName} | Mutativa: ${payload['is_mutative'] ? 'Sí' : 'No'}`,
          iterationIndex: iter,
          hopNumber: evt.hop_number || 3,
          phase: 'proposal',
          sanitizedParams: [
            { key: 'tool_name', value: toolName },
            { key: 'arguments', value: JSON.stringify(args) },
            { key: 'is_mutative', value: payload['is_mutative'] === true }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 5. Validación de argumentos por el Runtime (Pydantic)
      case 'ARGUMENT_VALIDATION':
      case 'ARGUMENTS_VALIDATED': {
        const isValid = payload['is_valid'] !== false;
        const toolName = payload['tool_name'] || 'Herramienta';
        const validationError = payload['validation_error'];
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Validador Pydantic (Python)',
          actorBadge: 'RUNTIME',
          title: `Validación de contrato: ${toolName}`,
          eventType: evt.type,
          status: isValid ? 'completed' : 'failed',
          summaryHeadline: isValid ? `Argumentos de "${toolName}" validados con éxito` : `Validación fallida en "${toolName}"`,
          summaryPedagogy: 'Barrera de seguridad: código Python soberano verifica tipos y esquemas antes de tocar la base de datos MySQL.',
          evidenceText: isValid ? 'Contrato Pydantic conforme sin inconsistencias' : `Error de validación: ${validationError || 'Desconocido'}`,
          iterationIndex: evt.iteration_index,
          hopNumber: evt.hop_number || 4,
          phase: 'validation',
          errorDetail: isValid ? undefined : validationError,
          sanitizedParams: [
            { key: 'tool_name', value: toolName },
            { key: 'is_valid', value: isValid },
            { key: 'validation_error', value: validationError || 'Ninguno' }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 6. Ejecución soberana de herramienta en CPU/MySQL
      case 'CPU_TOOL_EXECUTION':
      case 'TOOL_EXECUTION_STARTED': {
        const toolName = payload['tool_name'] || 'Herramienta';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'TicketService (Python CPU + MySQL)',
          actorBadge: 'RUNTIME',
          title: `Ejecución de herramienta: ${toolName}`,
          eventType: evt.type,
          status: 'running',
          summaryHeadline: `Ejecución en curso de "${toolName}" en MySQL`,
          summaryPedagogy: 'Ejecución soberana: la IA jamás accede directamente a SQL; Python ejecuta el servicio con sesión aislada.',
          evidenceText: `Servicio soberano: TicketService | Política: ${payload['policy'] || 'default'}`,
          iterationIndex: evt.iteration_index,
          hopNumber: evt.hop_number || 5,
          phase: 'execution',
          sanitizedParams: [
            { key: 'tool_name', value: toolName },
            { key: 'policy', value: payload['policy'] || 'default' }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'TOOL_EXECUTION_COMPLETED': {
        const toolName = payload['tool_name'] || 'Herramienta';
        const isSuccess = payload['execution_status'] === 'success';
        const dur = payload['duration_ms'] ?? 'No disponible';
        const result = payload['result'];
        const message = result && typeof result['message'] === 'string' ? result['message'] : '';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'TicketService (Python CPU + MySQL)',
          actorBadge: 'RUNTIME',
          title: `Resultado de herramienta: ${toolName}`,
          eventType: evt.type,
          status: isSuccess ? 'completed' : 'failed',
          summaryHeadline: isSuccess ? `Ejecución exitosa de "${toolName}" en ${dur} ms` : `Fallo al ejecutar "${toolName}"`,
          summaryPedagogy: 'Hecho verificable: el servicio retornó datos fácticos estructurados desde MySQL.',
          evidenceText: message ? `Mensaje: ${message}` : `Estado: ${payload['execution_status'] || 'completado'}`,
          iterationIndex: evt.iteration_index,
          hopNumber: evt.hop_number || 5,
          phase: 'execution',
          executionDurationMs: typeof dur === 'number' ? dur : undefined,
          sanitizedParams: [
            { key: 'tool_name', value: toolName },
            { key: 'execution_status', value: payload['execution_status'] || 'success' },
            { key: 'duration_ms', value: dur },
            { key: 'idempotency_hit', value: payload['idempotency_hit'] === true }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 7. Inyección de observación de herramienta en contexto
      case 'TOOL_RESULT_INJECTION':
      case 'OBSERVATION_APPENDED': {
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Runtime Context Injection',
          actorBadge: 'RUNTIME',
          title: 'Inyección de observación en contexto',
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: 'Observación incorporada al historial como evidencia factual',
          summaryPedagogy: 'Grounded Context: los datos verificados de MySQL se entregan con rol "tool" para fundamentar las siguientes deducciones.',
          evidenceText: 'Evidencia documental agregada al contexto del LLM',
          iterationIndex: evt.iteration_index,
          hopNumber: evt.hop_number || 6,
          phase: 'observation',
          sanitizedParams: [
            { key: 'role', value: 'tool' },
            { key: 'tool_call_id', value: payload['tool_call_id'] || 'No disponible' }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 8. Control del ciclo y avance del Agent Loop (v2 / v3)
      case 'ITERATION_STARTED': {
        const iter = evt.iteration_index || payload['iteration_index'] || 1;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Agent Loop Controller',
          actorBadge: 'RUNTIME',
          title: `Avance del Agent Loop: Iteración ${iter}`,
          eventType: evt.type,
          status: 'running',
          summaryHeadline: `Inicio de la iteración ${iter} del bucle agéntico`,
          summaryPedagogy: 'Control de ciclo: el motor evalúa el progreso global y asigna presupuesto de computación para la nueva vuelta.',
          evidenceText: `Iteración ${iter} de ${payload['max_iterations'] || 5} máximas`,
          iterationIndex: iter,
          phase: 'loop',
          sanitizedParams: [
            { key: 'iteration_index', value: iter },
            { key: 'max_iterations', value: payload['max_iterations'] || 5 }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'ITERATION_COMPLETED': {
        const iter = evt.iteration_index || payload['iteration_index'] || 1;
        const decision = payload['decision'] || 'continue';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Agent Loop Controller',
          actorBadge: 'RUNTIME',
          title: `Cierre de iteración ${iter} — Decisión: ${decision}`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Evaluación de ciclo: decisión ${decision}`,
          summaryPedagogy: 'El runtime determina si el objetivo fue completado, si requiere más herramientas o si aplica un criterio de parada.',
          evidenceText: `Herramientas ejecutadas en este ciclo: ${payload['tool_calls_count'] || 0}`,
          iterationIndex: iter,
          phase: 'decision',
          sanitizedParams: [
            { key: 'iteration_index', value: iter },
            { key: 'decision', value: decision },
            { key: 'tools_count', value: payload['tool_calls_count'] || 0 }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'LOOP_REPETITION_DETECTED':
      case 'LOOP_LIMIT_EXCEEDED':
      case 'LOOP_TIMEOUT_EXCEEDED': {
        const reasonMsg = payload['message'] || 'Límite o repetición detectada en el bucle';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Loop Safety Guard',
          actorBadge: 'RUNTIME',
          title: 'Intervención de seguridad del bucle',
          eventType: evt.type,
          status: 'failed',
          summaryHeadline: `Parada de seguridad: ${evt.type}`,
          summaryPedagogy: 'Protección contra bucles infinitos: el runtime detiene la ejecución para evitar consumo descontrolado de tokens o estancamiento.',
          evidenceText: reasonMsg,
          iterationIndex: evt.iteration_index,
          phase: 'loop_safety',
          errorDetail: reasonMsg,
          sanitizedParams: [
            { key: 'tipo_intervencion', value: evt.type },
            { key: 'motivo', value: reasonMsg }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 9. Persistencia de decisiones en MySQL (Agent v3)
      case 'DECISION_SAVED': {
        const key = payload['key'] || 'clave_desconocida';
        const val = payload['value'] || '';
        const scope = payload['scope'] || 'persistent';
        const ver = payload['version'] || 1;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'memoria',
          actor: 'MemoryManager (MySQL)',
          actorBadge: 'MEMORIA',
          title: `Preferencia guardada: ${key}`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Preferencia "${key}" persistida con ámbito ${scope}`,
          summaryPedagogy: 'Gobernanza de preferencias: el agente almacena directrices explícitas del usuario que sobrevivirán entre sesiones.',
          evidenceText: `Clave: ${key} = "${sanitizeTraceValue(key, val)}" (v${ver})`,
          phase: 'memory_persistence',
          sanitizedParams: [
            { key: 'key', value: key },
            { key: 'value', value: sanitizeTraceValue(key, val) },
            { key: 'scope', value: scope },
            { key: 'version', value: ver }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'DECISION_REVOKED': {
        const key = payload['decision_key'] || 'clave';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'memoria',
          actor: 'MemoryManager (MySQL)',
          actorBadge: 'MEMORIA',
          title: `Preferencia revocada: ${key}`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Preferencia previa "${key}" revocada en base de datos`,
          summaryPedagogy: 'Control de estado: se actualiza el registro histórico en MySQL marcando la directriz como inactiva.',
          evidenceText: `Clave revocada: ${key}`,
          phase: 'memory_revocation',
          sanitizedParams: [
            { key: 'decision_key', value: key },
            { key: 'status', value: 'revoked' }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'TURN_PERSISTED': {
        const convId = payload['conversation_id'] || 'No disponible';
        const turnId = payload['turn_id'] || 'No disponible';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'memoria',
          actor: 'TurnHistoryManager (MySQL)',
          actorBadge: 'MEMORIA',
          title: 'Turno conversacional persistido en MySQL',
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Turno ${turnId} almacenado en base de datos`,
          summaryPedagogy: 'Persistencia transaccional: el mensaje del usuario y la respuesta del agente quedan registrados con aislamiento de usuario.',
          evidenceText: `Conversación: ${convId}`,
          phase: 'turn_persistence',
          sanitizedParams: [
            { key: 'conversation_id', value: convId },
            { key: 'turn_id', value: turnId }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 10. Respuestas finales y terminación
      case 'DIRECT_ANSWER':
      case 'FINAL_SYNTHESIS': {
        const ans = payload['answer'] || payload['content'] || payload['message'] || '';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'resultado',
          actor: 'Qwen 3.5 4B (Síntesis)',
          actorBadge: 'RESULTADO',
          title: evt.type === 'DIRECT_ANSWER' ? 'Respuesta conceptual directa' : 'Síntesis final fundamentada',
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: evt.type === 'DIRECT_ANSWER' ? 'El modelo respondió sin invocar herramientas' : 'Síntesis grounded completada',
          summaryPedagogy: 'Cierre del proceso: el LLM genera la explicación en lenguaje natural respaldada en las observaciones fácticas del runtime.',
          evidenceText: `Respuesta (${ans.length} caracteres emitidos)`,
          iterationIndex: evt.iteration_index,
          hopNumber: evt.hop_number || 7,
          phase: 'synthesis',
          sanitizedParams: [
            { key: 'tipo_respuesta', value: evt.type },
            { key: 'caracteres', value: ans.length }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'RUN_COMPLETED': {
        const dur = payload['total_duration_ms'] ?? 'No disponible';
        const stopReason = payload['stop_reason'] || 'final_answer';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'resultado',
          actor: 'Runtime Soberano AEP',
          actorBadge: 'RESULTADO',
          title: 'Ejecución finalizada con éxito',
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Turno agéntico finalizado (Razón: ${stopReason})`,
          summaryPedagogy: 'Ciclo cerrado: todos los pasos requeridos se completaron satisfactoriamente y el agente retorna a reposo.',
          evidenceText: `Duración total: ${dur} ms`,
          executionDurationMs: typeof dur === 'number' ? dur : undefined,
          sanitizedParams: [
            { key: 'stop_reason', value: stopReason },
            { key: 'total_duration_ms', value: dur }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'RUN_FAILED':
      case 'ERROR': {
        const errMsg = payload['error_message'] || payload['message'] || 'Error en ejecución de agente';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'resultado',
          actor: 'Runtime AEP (Manejador de Errores)',
          actorBadge: 'RESULTADO',
          title: 'Terminación por error en runtime',
          eventType: evt.type,
          status: 'failed',
          summaryHeadline: 'La ejecución se detuvo por un fallo en el runtime',
          summaryPedagogy: 'Recuperación de fallos: el runtime capturó la excepción y protegió el estado de la aplicación.',
          evidenceText: errMsg,
          errorDetail: errMsg,
          sanitizedParams: [
            { key: 'error', value: errMsg },
            { key: 'stop_reason', value: payload['stop_reason'] || 'error' }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'RUN_CANCELLED': {
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'resultado',
          actor: 'Cliente / Runtime AEP',
          actorBadge: 'RESULTADO',
          title: 'Ejecución cancelada por el usuario',
          eventType: evt.type,
          status: 'skipped',
          summaryHeadline: 'La inferencia fue cancelada manualmente',
          summaryPedagogy: 'Control de usuario: el stream SSE fue interrumpido a petición del operador.',
          evidenceText: 'Petición de cancelación procesada',
          sanitizedParams: [
            { key: 'status', value: 'cancelled' }
          ],
          technicalPayload: payload
        });
        break;
      }

      // 11. Eventos de Planificación y Descomposición de Tareas (Agent v4 - M05-L05)
      case 'PLAN_GENERATED': {
        const goal = payload['goal'] || 'Meta no especificada';
        const stepsCount = payload['steps_count'] || 0;
        const rev = payload['revision'] || 1;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'modelo',
          actor: 'Planner (Software Observable)',
          actorBadge: 'PLANNING',
          title: `Plan estructurado propuesto (Revisión ${rev})`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `DAG con ${stepsCount} pasos dependientes propuesto`,
          summaryPedagogy: 'Planning agéntico: la meta compleja es descompuesta en una estructura observable tipada en memoria.',
          evidenceText: `Meta: "${goal}" (${stepsCount} pasos)`,
          iterationIndex: evt.iteration_index,
          phase: 'planning',
          sanitizedParams: [
            { key: 'goal', value: goal },
            { key: 'revision', value: rev },
            { key: 'steps_count', value: stepsCount }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'PLAN_VALIDATED': {
        const rev = payload['revision'] || 1;
        const stepIds = (payload['step_ids'] || []).join(', ');
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'PlanValidator (Gobernanza Runtime)',
          actorBadge: 'VALIDADOR',
          title: `Plan validado por software (Revisión ${rev})`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: 'Grafo acíclico y dependencias verificadas antes de ejecutar',
          summaryPedagogy: 'Gobernanza de runtime: el software valida en validation-time que no existan ciclos estáticos ni dependencias inexistentes.',
          evidenceText: `Pasos validados: [${stepIds}]`,
          iterationIndex: evt.iteration_index,
          phase: 'validation',
          sanitizedParams: [
            { key: 'is_valid', value: true },
            { key: 'revision', value: rev },
            { key: 'step_ids', value: stepIds }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'STEP_STARTED': {
        const stepId = payload['step_id'] || '';
        const executor = payload['executor'] || 'tool';
        const desc = payload['description'] || '';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: `StepExecutor [${executor.toUpperCase()}]`,
          actorBadge: 'EJECUTOR',
          title: `Iniciando Paso [${stepId}] (${executor.toUpperCase()})`,
          eventType: evt.type,
          status: 'running',
          summaryHeadline: `Ejecutando "${desc}" con ejecutor tipado ${executor.toUpperCase()}`,
          summaryPedagogy: 'Diversidad de ejecutores: un paso no es solo una llamada a herramienta; puede ser TOOL, RUNTIME en CPU o MODEL.',
          evidenceText: `Acción: ${payload['action'] || stepId}`,
          iterationIndex: evt.iteration_index,
          phase: 'execution',
          sanitizedParams: [
            { key: 'step_id', value: stepId },
            { key: 'executor', value: executor },
            { key: 'action', value: payload['action'] || '' }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'STEP_COMPLETED': {
        const stepId = payload['step_id'] || '';
        const dur = payload['duration_ms'] ?? 0;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'resultado',
          actor: `StepExecutor [${(payload['executor'] || 'tool').toUpperCase()}]`,
          actorBadge: 'RESULTADO',
          title: `Paso [${stepId}] completado exitosamente`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Observación fáctica verificada para [${stepId}]`,
          summaryPedagogy: 'Avance del grafo: las dependencias posteriores de este paso quedan desbloqueadas para su ejecución.',
          evidenceText: `Duración: ${dur} ms`,
          executionDurationMs: typeof dur === 'number' ? dur : undefined,
          iterationIndex: evt.iteration_index,
          phase: 'execution',
          sanitizedParams: [
            { key: 'step_id', value: stepId },
            { key: 'status', value: 'completed' },
            { key: 'duration_ms', value: dur }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'STEP_FAILED': {
        const stepId = payload['step_id'] || '';
        const err = payload['error'] || 'Fallo de ejecución';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Runtime Contingency Handler',
          actorBadge: 'CONTINGENCIA',
          title: `Paso [${stepId}] falló: ${err}`,
          eventType: evt.type,
          status: 'failed',
          summaryHeadline: `Contingencia detectada en el paso [${stepId}]`,
          summaryPedagogy: 'Tolerancia a fallos: el runtime intercepta el error y activa replanning antes de continuar o abortar.',
          evidenceText: `Error: ${err}`,
          errorDetail: err,
          iterationIndex: evt.iteration_index,
          phase: 'execution',
          sanitizedParams: [
            { key: 'step_id', value: stepId },
            { key: 'status', value: 'failed' },
            { key: 'error', value: err }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'REPLANNING_TRIGGERED': {
        const prevRev = payload['previous_revision'] || 1;
        const failedId = payload['failed_step_id'] || '';
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Runtime Replanner',
          actorBadge: 'REPLANNING',
          title: `Replanning activado por fallo en [${failedId}]`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Revisión ${prevRev} archivada como snapshot inmutable`,
          summaryPedagogy: 'Invariante y memoria: las revisiones previas se preservan en plan_history y la meta original se mantiene intacta.',
          evidenceText: `Paso fallido: ${failedId}. Snapshot ${prevRev} congelado.`,
          iterationIndex: evt.iteration_index,
          phase: 'replanning',
          sanitizedParams: [
            { key: 'failed_step_id', value: failedId },
            { key: 'previous_revision', value: prevRev },
            { key: 'archived_count', value: payload['archived_snapshots_count'] || 1 }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'PLAN_REVISION_CREATED': {
        const newRev = payload['new_revision'] || 2;
        const stepsCount = payload['steps_count'] || 0;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'modelo',
          actor: 'Planner (Ruta Adaptativa)',
          actorBadge: 'REPLANNING',
          title: `Nueva Revisión ${newRev} del Plan activada`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: `Ruta alternativa configurada con ${stepsCount} pasos`,
          summaryPedagogy: 'Recuperación adaptativa: se reajustan dependencias sin repetir pasos completados ni perder la meta original.',
          evidenceText: `Revisión activa: ${newRev}`,
          iterationIndex: evt.iteration_index,
          phase: 'replanning',
          sanitizedParams: [
            { key: 'new_revision', value: newRev },
            { key: 'steps_count', value: stepsCount },
            { key: 'goal_preserved', value: true }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'PLAN_BLOCKED': {
        const blocked = (payload['blocked_step_ids'] || []).join(', ');
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'runtime',
          actor: 'Runtime Deadlock Detector',
          actorBadge: 'STALL',
          title: 'Runtime Stall detectado: no_executable_steps',
          eventType: evt.type,
          status: 'failed',
          summaryHeadline: 'Detención segura activada por dependencias insatisfechas sin ruta alternativa',
          summaryPedagogy: 'Detección de bloqueo: el agente evita bucles infinitos y reporta limpiamente termination_reason="no_executable_steps".',
          evidenceText: `Pasos bloqueados: [${blocked}]`,
          iterationIndex: evt.iteration_index,
          phase: 'stall',
          sanitizedParams: [
            { key: 'termination_reason', value: 'no_executable_steps' },
            { key: 'blocked_steps', value: blocked }
          ],
          technicalPayload: payload
        });
        break;
      }

      case 'PLAN_COMPLETED': {
        const rev = payload['revision'] || 1;
        entries.push({
          id: traceId,
          eventId: evt.event_id,
          timestamp: evt.timestamp,
          category: 'resultado',
          actor: 'Runtime Governance Engine',
          actorBadge: 'COMPLETADO',
          title: `Plan completado exitosamente (Revisión ${rev})`,
          eventType: evt.type,
          status: 'completed',
          summaryHeadline: 'Todos los pasos requeridos fueron resueltos',
          summaryPedagogy: 'Completitud derivada: se verifica que cada paso obligatorio esté resuelto sin omisiones arbitrarias.',
          evidenceText: `Revisión ${rev} completada`,
          iterationIndex: evt.iteration_index,
          phase: 'complete',
          sanitizedParams: [
            { key: 'is_completed', value: true },
            { key: 'revision', value: rev }
          ],
          technicalPayload: payload
        });
        break;
      }

      default:
        // Eventos no categorizados directamente: omitir para mantener la traza limpia con evidencia real
        break;
    }
  }

  return entries;
}
