import { AgentV2DecisionCode } from './v2-loop.models';

export type AgentV2DecisionTone = 'continue' | 'success' | 'warning' | 'danger' | 'neutral';

export interface AgentV2DecisionMeta {
  label: string;
  tone: AgentV2DecisionTone;
  isTerminal: boolean;
  isSafetyStop: boolean;
  defaultReason: string;
}

const DECISION_META: Record<AgentV2DecisionCode, AgentV2DecisionMeta> = {
  continue_next_iteration: {
    label: 'Continuar bucle',
    tone: 'continue',
    isTerminal: false,
    isSafetyStop: false,
    defaultReason: 'El modelo ejecutó herramientas y el bucle continúa con una nueva iteración.'
  },
  final_answer: {
    label: 'Respuesta final',
    tone: 'success',
    isTerminal: true,
    isSafetyStop: false,
    defaultReason: 'El modelo respondió sin proponer nuevas herramientas; la ejecución terminó correctamente.'
  },
  timeout: {
    label: 'Tiempo agotado',
    tone: 'warning',
    isTerminal: true,
    isSafetyStop: true,
    defaultReason: 'Se superó un límite de tiempo y el runtime detuvo la ejecución.'
  },
  stagnation_stopped: {
    label: 'Estancamiento detectado',
    tone: 'warning',
    isTerminal: true,
    isSafetyStop: true,
    defaultReason: 'El agente repitió las mismas herramientas con los mismos argumentos y el runtime detuvo el bucle.'
  },
  max_iterations: {
    label: 'Límite de iteraciones',
    tone: 'warning',
    isTerminal: true,
    isSafetyStop: true,
    defaultReason: 'Se alcanzó el máximo de iteraciones sin una respuesta final.'
  },
  fatal_error: {
    label: 'Error de ejecución',
    tone: 'danger',
    isTerminal: true,
    isSafetyStop: false,
    defaultReason: 'La ejecución terminó por un error no recuperable.'
  },
  cancelled: {
    label: 'Cancelada',
    tone: 'neutral',
    isTerminal: true,
    isSafetyStop: false,
    defaultReason: 'La ejecución fue cancelada por desconexión del cliente.'
  }
};

export function isKnownDecision(code: string | undefined): code is AgentV2DecisionCode {
  return !!code && Object.prototype.hasOwnProperty.call(DECISION_META, code);
}

export function describeDecision(code: string | undefined): AgentV2DecisionMeta {
  if (isKnownDecision(code)) {
    return DECISION_META[code];
  }
  return {
    label: code ? code : 'Sin decisión',
    tone: 'neutral',
    isTerminal: false,
    isSafetyStop: false,
    defaultReason: code ? 'Decisión no reconocida emitida por el runtime.' : 'El runtime aún no emitió una decisión.'
  };
}
