import { describeDecision } from '../models/v2-decision';
import {
  AgentV2Iteration,
  AgentV2Phase,
  AgentV2PhaseStatus,
  AgentV2PhaseType
} from '../models/v2-loop.models';

const PHASE_ORDER: readonly AgentV2PhaseType[] = [
  'inference',
  'proposal',
  'validation',
  'execution',
  'observation',
  'decision',
  'synthesis'
];

const TOOL_PHASES: readonly AgentV2PhaseType[] = ['proposal', 'validation', 'execution', 'observation'];

export function findPhase(iter: AgentV2Iteration, type: AgentV2PhaseType): AgentV2Phase {
  return iter.phases[PHASE_ORDER.indexOf(type)];
}

export function setPhaseStatus(
  iter: AgentV2Iteration,
  type: AgentV2PhaseType,
  status: AgentV2PhaseStatus,
  reason?: string
): void {
  const phase = findPhase(iter, type);
  if (phase.status === 'failed' && status !== 'failed') return;
  if (phase.status === 'completed' && status === 'running') return;
  phase.status = status;
  phase.statusReason = reason;
}

export function skipToolPhases(iter: AgentV2Iteration, reason: string): void {
  for (const type of TOOL_PHASES) {
    setPhaseStatus(iter, type, 'skipped', reason);
  }
}

export function isOpenStatus(status: AgentV2PhaseStatus): boolean {
  return status === 'idle' || status === 'running';
}

function pendingPhaseReason(type: AgentV2PhaseType, decision: string, reason: string): string {
  if (type === 'synthesis') {
    return decision === 'continue_next_iteration'
      ? 'La síntesis solo ocurre en la iteración en la que el modelo responde sin herramientas.'
      : 'No hubo respuesta final: ' + reason;
  }
  if (decision === 'stagnation_stopped') {
    return 'El runtime detuvo la iteración por estancamiento antes de procesar esta fase.';
  }
  if (decision === 'cancelled') {
    return 'La ejecución se canceló antes de alcanzar esta fase.';
  }
  return 'La iteración terminó antes de alcanzar esta fase: ' + reason;
}

export function closeIteration(
  iter: AgentV2Iteration,
  decision: string,
  reason?: string
): void {
  const meta = describeDecision(decision);
  const resolvedReason = reason || meta.defaultReason;
  const interrupted = decision === 'fatal_error' || decision === 'cancelled';

  iter.decision = decision;
  iter.decisionReason = resolvedReason;
  iter.status = decision === 'timeout'
    ? 'timeout'
    : meta.tone === 'continue' || meta.tone === 'success'
      ? 'completed'
      : 'failed';

  for (const phase of iter.phases) {
    if (phase.phaseType === 'decision') continue;
    if (!isOpenStatus(phase.status)) continue;
    if (phase.status === 'running' && interrupted) {
      phase.status = 'failed';
      phase.statusReason = resolvedReason;
    } else if (phase.status === 'running' && decision === 'timeout') {
      phase.status = 'failed';
      phase.statusReason = resolvedReason;
    } else {
      phase.status = 'skipped';
      phase.statusReason = pendingPhaseReason(phase.phaseType, decision, resolvedReason);
    }
  }

  const decisionPhase = findPhase(iter, 'decision');
  decisionPhase.status = meta.isSafetyStop || meta.tone === 'danger' || decision === 'cancelled' ? 'failed' : 'completed';
  decisionPhase.statusReason = resolvedReason;
}
