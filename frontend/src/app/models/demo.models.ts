import { StreamEvent } from './agent.models';

export interface DemoScenario {
  id: string;
  version: 'v1' | 'v2' | 'v3' | 'v4';
  title: string;
  description: string;
  suggestedPrompt: string;
  persona: string;
  finalResponse: string;
  pedagogicalConcepts: string[];
  isSynthetic: boolean;
  sourceNote?: string;
  eventsCount: number;
  events: StreamEvent[];
}

export interface DemoCatalog {
  generatedAt: string;
  version: string;
  totalScenarios: number;
  mode: string;
  scenarios: DemoScenario[];
}

export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2 | 4;

export type DemoPlaybackState = 'idle' | 'playing' | 'paused' | 'completed';
