export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export type StepExecutor = 'tool' | 'runtime' | 'model';

export interface PlanStepModel {
  id: string;
  action: string;
  description: string;
  executor: StepExecutor;
  status: StepStatus;
  depends_on: string[];
  observation?: Record<string, any> | null;
  required: boolean;
  skip_reason?: string | null;
}

export interface PlanModel {
  goal: string;
  steps: PlanStepModel[];
  current_step_id?: string | null;
  revision: number;
  is_completed: boolean;
}

export interface PlanRevisionSnapshot {
  revision: number;
  goal: string;
  steps: PlanStepModel[];
  timestamp: string;
  triggerReason?: string;
  isArchived: boolean;
}

export interface AgentV4PlanningState {
  currentPlan: PlanModel | null;
  planHistory: PlanRevisionSnapshot[];
  selectedRevision: number;
  activeStepId?: string | null;
  selectedStep?: PlanStepModel | null;
  isStalled: boolean;
  blockedStepIds: string[];
  terminationReason?: string | null;
  isValidated: boolean;
  planProposedCount: number;
}

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En Ejecución',
  completed: 'Completado',
  failed: 'Fallido',
  skipped: 'Omitido (Autorizado)'
};

export const STEP_STATUS_BADGES: Record<StepStatus, { label: string; class: string; icon: string }> = {
  pending: { label: 'PENDIENTE', class: 'status-pending', icon: '⏳' },
  in_progress: { label: 'EJECUTANDO', class: 'status-in-progress', icon: '⚡' },
  completed: { label: 'COMPLETADO', class: 'status-completed', icon: '✓' },
  failed: { label: 'FALLIDO', class: 'status-failed', icon: '✕' },
  skipped: { label: 'OMITIDO', class: 'status-skipped', icon: '↷' }
};

export const EXECUTOR_BADGES: Record<StepExecutor, { label: string; class: string; description: string }> = {
  tool: {
    label: 'TOOL',
    class: 'exec-tool',
    description: 'Ejecuta herramienta externa registrada en el catálogo de software'
  },
  runtime: {
    label: 'RUNTIME',
    class: 'exec-runtime',
    description: 'Cruce algorítmico, transformación y validación determinista local en CPU'
  },
  model: {
    label: 'MODEL',
    class: 'exec-model',
    description: 'Inferencia o síntesis semántica realizada por el proveedor LLM'
  }
};
