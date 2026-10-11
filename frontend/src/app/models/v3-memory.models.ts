import { StreamEvent } from './agent.models';

/**
 * Metadatos y estimaciones del presupuesto de contexto (Context Budget).
 * Diferencia explícitamente entre valores estimados heurísticamente,
 * reservas configuradas y límites de la ventana de contexto.
 */
export interface ContextBudgetTokens {
  queryTokensEst: number;
  systemPromptTokensEst: number;
  decisionsTokensEst: number;
  historyTokensEst: number;
  totalInitialTokensEst: number;
  availableHistoryBudget: number;
  historyTurnsCount: number;
  decisionsCount: number;
  maxContextLimit: number;
  /** Indica explícitamente que los tokens son estimaciones heurísticas del TokenBudgetManager y no mediciones de hardware */
  isHeuristicEstimate: boolean;
}

/**
 * Preferencia o decisión activa autorizada en MySQL.
 */
export interface ActiveDecisionItem {
  key: string;
  value: any;
  scope: 'ephemeral' | 'session' | 'persistent';
  version: number;
  rationale?: string;
  status?: string;
}

/**
 * Registro de evento de guardado de decisión.
 */
export interface DecisionRecordEvent {
  decisionId: string;
  key: string;
  value: any;
  scope: string;
  version: number;
  status: string;
  rationale: string;
  timestamp: string;
}

/**
 * Metadatos recibidos en el evento MEMORY_HYDRATED.
 * IMPORTANTE (Ajuste 1): Representa el resumen de turnos y decisiones hidratadas
 * desde MySQL en la memoria de trabajo del agente, no el arreglo completo de textos históricos.
 */
export interface MemoryHydrationState {
  conversationId: string;
  hydratedTurnsCount: number;
  decisionsCount: number;
  activeDecisions: ActiveDecisionItem[];
  budget: ContextBudgetTokens;
  hydratedAt: string;
}

/**
 * Estados formales de Human-in-the-Loop (Ajuste 3):
 * - none: Sin tarea pendiente.
 * - waiting_human_decision: Espera humana persistida en MySQL (PENDING_TASK_PROPOSED).
 * - resuming_task: Reanudación en tránsito con selected_value y decision_id.
 * - resolved: Tarea resuelta atómicamente y ejecutada (PENDING_TASK_RESOLVED).
 * - recovery_required: Mutación incierta bloqueada por seguridad (TASK_RECOVERY_REQUIRED).
 */
export type HitlExecutionStatus =
  | 'none'
  | 'waiting_human_decision'
  | 'resuming_task'
  | 'resolved'
  | 'recovery_required';

/**
 * Tarea pendiente con intervención humana (HITL).
 */
export interface PendingTaskState {
  decisionId: string;
  question: string;
  options: string[];
  targetToolName: string;
  missingParameterName: string;
  requiredRole?: string;
  status: 'pending' | 'resolving' | 'resolved' | 'failed' | 'recovery_required';
  selectedValue?: string;
  recoveryReason?: string;
  executionCheckpoint?: Record<string, any>;
  timestamp: string;
}

/**
 * Alerta de reconciliación requerida para tareas con resultado incierto.
 */
export interface TaskRecoveryAlert {
  decisionId: string;
  targetToolName: string;
  status: string;
  recoveryReason: string;
  executionCheckpoint?: Record<string, any>;
  timestamp: string;
}

/**
 * Turno individual confirmado y persistido en MySQL (TURN_PERSISTED).
 */
export interface TurnPersistedState {
  turnId: string;
  conversationId: string;
  status: string;
  timestamp: string;
}

/**
 * Proyección reactiva completa de State & Memory para Agent v3.
 * Almacena el estado persistente, el presupuesto y las decisiones
 * alimentados concurrentemente desde el mismo flujo SSE.
 */
export interface AgentV3State {
  executionId: string;
  /** Identificador de conversación confirmado autoritativamente por FastAPI (Ajuste 4) */
  confirmedConversationId: string | null;
  persona: string;
  hydration: MemoryHydrationState | null;
  activeDecisions: ActiveDecisionItem[];
  decisionsHistory: DecisionRecordEvent[];
  revokedKeys: string[];
  pendingTask: PendingTaskState | null;
  hitlStatus: HitlExecutionStatus;
  persistedTurns: TurnPersistedState[];
  isRecoveryRequired: boolean;
  recoveryAlert: TaskRecoveryAlert | null;
  rawV3Events: StreamEvent[];
}
