export interface LearnerIntent {
  intention: string;
  prompt: string;
  capability: string;
  outcome: string;
}

export interface LearnerLab {
  number: number;
  title: string;
  prompt: string;
  objective: string;
  context: string;
  preparation: string;
  reflection: string;
  successCriteria: string;
  fullContent: string;
}

export interface VersionGuide {
  versionId: string;
  title: string;
  filename: string;
  whatItDoes: string;
  beforeStarting: string;
  intents: LearnerIntent[];
  labs: LearnerLab[];
  whatItDoesNotDo: string;
  runtimeInspector: string;
  frequentErrors: string;
  challenge: string;
  fullMarkdown: string;
}

export interface GuidesManifest {
  versions: Record<string, VersionGuide>;
  extraDocs: Record<string, string>;
}

export type GuideTab =
  | 'what'
  | 'prompts'
  | 'tools'
  | 'limits'
  | 'labs'
  | 'inspector'
  | 'full';
