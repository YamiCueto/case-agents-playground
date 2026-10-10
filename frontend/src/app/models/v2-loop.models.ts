import { StreamEvent } from './agent.models';

export type AgentV2PhaseType =
  | 'init'
  | 'inference'
  | 'proposal'
  | 'validation'
  | 'execution'
  | 'observation'
  | 'decision'
  | 'synthesis';

export type AgentV2PhaseStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'skipped';

export interface AgentV2ToolExecution {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, any>;
  isValid?: boolean;
  validationError?: string;
  isMutative?: boolean;
  policy?: string;
  executionStatus?: string;
  durationMs?: number;
  idempotencyHit?: boolean;
  observation?: any;
}

export interface AgentV2Phase {
  id: string;
  phaseType: AgentV2PhaseType;
  title: string;
  shortName: string;
  actor: string;
  description: string;
  pedagogicalInsight: string;
  status: AgentV2PhaseStatus;
  durationMs?: number;
  payload?: any;
  timestamp?: string;
  tools?: AgentV2ToolExecution[];
}

export interface AgentV2Iteration {
  iterationIndex: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'timeout';
  decision?: string;
  durationMs?: number;
  elapsedSeconds?: number;
  phases: AgentV2Phase[];
  toolsCount: number;
  toolsInvoked: string[];
  summary: string;
}

export interface AgentV2Execution {
  executionId: string;
  agentVersion: string;
  query: string;
  operator: string;
  maxIterations: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  stopReason?: string;
  totalIterations: number;
  totalToolsExecuted: number;
  totalDurationMs?: number;
  iterations: AgentV2Iteration[];
  events: StreamEvent[];
  finalAnswer?: string;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}
