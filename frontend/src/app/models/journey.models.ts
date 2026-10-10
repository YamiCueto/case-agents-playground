import { StreamEvent } from './agent.models';

export type JourneyHopStatus = 'idle' | 'active' | 'completed' | 'skipped' | 'failed';

export type JourneyActorType =
  | 'user'
  | 'model'
  | 'proposal'
  | 'validator'
  | 'executor'
  | 'injector'
  | 'synthesis';

export type AvatarMood = 'idle' | 'running' | 'pointing' | 'completed' | 'failed' | 'skipped';

export interface AgentJourneyStep {
  id: string;
  hopNumber: number;
  title: string;
  shortName: string;
  actor: string;
  actorType: JourneyActorType;
  description: string;
  pedagogicalInsight: string;
  status: JourneyHopStatus;
  payload?: any;
  timestamp?: string;
  durationMs?: number;
  eventType: string;
}

export interface AgentExecutionJourney {
  runId: string;
  agentVersion: string;
  query: string;
  persona: string;
  startedAt: string;
  finishedAt?: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: AgentJourneyStep[];
  events: StreamEvent[];
  hasDirectAnswer: boolean;
  totalDurationMs?: number;
}
