import { Injectable, inject, signal, computed } from '@angular/core';
import { EventStoreService } from './event-store.service';
import { AgentJourneyStep, AvatarMood } from '../models/journey.models';
import { StreamEvent } from '../models/agent.models';
import { AgentV2Iteration, AgentV2Phase } from '../models/v2-loop.models';

export type ExplorationMode = 'live' | 'replay';
export type PlaybackSpeed = 0.5 | 1 | 2;

@Injectable({
  providedIn: 'root'
})
export class PresentationControllerService {
  private readonly eventStore = inject(EventStoreService);

  readonly mode = signal<ExplorationMode>('live');
  readonly isVisualPaused = signal<boolean>(false);
  readonly selectedStepIndex = signal<number>(0);
  readonly selectedIterationIndex = signal<number>(1);
  readonly selectedPhaseIndex = signal<number>(0);
  readonly playbackSpeed = signal<PlaybackSpeed>(1);
  readonly isPlayingReplay = signal<boolean>(false);

  private replayTimer: any = null;

  readonly journey = this.eventStore.journey;
  readonly v2Execution = this.eventStore.v2Execution;
  readonly events = this.eventStore.events;
  readonly runStatus = this.eventStore.runStatus;
  readonly activeAgentId = this.eventStore.activeAgentId;

  readonly activeStep = computed<AgentJourneyStep | null>(() => {
    const steps = this.journey().steps;
    if (steps.length === 0) return null;

    if (this.mode() === 'replay' || this.isVisualPaused()) {
      const idx = Math.min(Math.max(0, this.selectedStepIndex()), steps.length - 1);
      return steps[idx] || null;
    }

    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status === 'completed' || steps[i].status === 'active' || steps[i].status === 'failed') {
        return steps[i];
      }
    }
    return steps[0];
  });

  readonly activeV2Iteration = computed<AgentV2Iteration | null>(() => {
    const iterations = this.v2Execution().iterations;
    if (iterations.length === 0) return null;

    const targetIdx = this.selectedIterationIndex();
    const found = iterations.find((it) => it.iterationIndex === targetIdx);
    if (found) return found;

    return iterations[iterations.length - 1] || null;
  });

  readonly activeV2Phase = computed<AgentV2Phase | null>(() => {
    const iter = this.activeV2Iteration();
    if (!iter || iter.phases.length === 0) return null;

    const phaseIdx = Math.min(Math.max(0, this.selectedPhaseIndex()), iter.phases.length - 1);
    return iter.phases[phaseIdx] || iter.phases[0];
  });

  readonly avatarMood = computed<AvatarMood>(() => {
    const status = this.runStatus();
    if (this.activeAgentId() === 'v2') {
      const phase = this.activeV2Phase();
      if (status === 'failed' || phase?.status === 'failed') return 'failed';
      if (phase?.status === 'skipped') return 'skipped';
      if (status === 'running' || phase?.status === 'running') return 'running';
      if (status === 'completed') return 'completed';
      return 'idle';
    }

    const step = this.activeStep();
    if (status === 'failed' || step?.status === 'failed') return 'failed';
    if (step?.status === 'skipped') return 'skipped';
    if (status === 'running' || step?.status === 'active') return 'running';
    if (status === 'completed' && step?.hopNumber === 7) return 'completed';
    if (step && step.status === 'completed') return 'pointing';
    return 'idle';
  });

  onNewEvent(event: StreamEvent): void {
    this.eventStore.addEvent(event);

    if (this.mode() === 'live' && !this.isVisualPaused()) {
      if (event.hop_number) {
        this.selectedStepIndex.set(event.hop_number - 1);
      }
      if (event.iteration_index) {
        this.selectedIterationIndex.set(event.iteration_index);
        const phaseIdx = this.mapPhaseToIndex(event.phase);
        if (phaseIdx >= 0) {
          this.selectedPhaseIndex.set(phaseIdx);
        }
      }
    }
  }

  private mapPhaseToIndex(phase?: string): number {
    switch (phase) {
      case 'inference': return 0;
      case 'proposal': return 1;
      case 'validation': return 2;
      case 'execution': return 3;
      case 'observation': return 4;
      case 'decision':
      case 'loop': return 5;
      case 'synthesis': return 6;
      default: return -1;
    }
  }

  toggleVisualPause(): void {
    if (this.mode() !== 'live') return;
    const nextVal = !this.isVisualPaused();
    this.isVisualPaused.set(nextVal);
    if (!nextVal) {
      this.jumpToLatest();
    }
  }

  jumpToLatest(): void {
    if (this.activeAgentId() === 'v2') {
      const iters = this.v2Execution().iterations;
      if (iters.length > 0) {
        const lastIter = iters[iters.length - 1];
        this.selectedIterationIndex.set(lastIter.iterationIndex);
        let lastActivePhase = 0;
        for (let i = lastIter.phases.length - 1; i >= 0; i--) {
          if (lastIter.phases[i].status === 'running' || lastIter.phases[i].status === 'completed') {
            lastActivePhase = i;
            break;
          }
        }
        this.selectedPhaseIndex.set(lastActivePhase);
      }
    } else {
      const steps = this.journey().steps;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].status === 'completed' || steps[i].status === 'active' || steps[i].status === 'failed') {
          this.selectedStepIndex.set(i);
          break;
        }
      }
    }
    this.isVisualPaused.set(false);
  }

  selectStep(index: number): void {
    const steps = this.journey().steps;
    if (index >= 0 && index < steps.length) {
      this.selectedStepIndex.set(index);
      if (this.mode() === 'live') {
        this.isVisualPaused.set(true);
      }
    }
  }

  selectV2Iteration(iterationIndex: number): void {
    const iters = this.v2Execution().iterations;
    const found = iters.find((it) => it.iterationIndex === iterationIndex);
    if (found) {
      this.selectedIterationIndex.set(iterationIndex);
      this.selectedPhaseIndex.set(0);
      if (this.mode() === 'live') {
        this.isVisualPaused.set(true);
      }
    }
  }

  selectV2Phase(phaseIndex: number): void {
    const iter = this.activeV2Iteration();
    if (iter && phaseIndex >= 0 && phaseIndex < iter.phases.length) {
      this.selectedPhaseIndex.set(phaseIndex);
      if (this.mode() === 'live') {
        this.isVisualPaused.set(true);
      }
    }
  }

  setMode(newMode: ExplorationMode): void {
    this.mode.set(newMode);
    this.stopReplayTimer();
    if (newMode === 'live') {
      this.jumpToLatest();
    } else {
      this.selectedStepIndex.set(0);
      this.selectedIterationIndex.set(1);
      this.selectedPhaseIndex.set(0);
    }
  }

  startReplayMode(): void {
    this.setMode('replay');
    this.selectedStepIndex.set(0);
    this.selectedIterationIndex.set(1);
    this.selectedPhaseIndex.set(0);
    this.playReplay();
  }

  playReplay(): void {
    this.isPlayingReplay.set(true);
    this.stopReplayTimer();

    const intervalMs = 1800 / this.playbackSpeed();
    this.replayTimer = setInterval(() => {
      this.stepForward();
      if (!this.isPlayingReplay()) {
        this.stopReplayTimer();
      }
    }, intervalMs);
  }

  pauseReplay(): void {
    this.isPlayingReplay.set(false);
    this.stopReplayTimer();
  }

  togglePlayPauseReplay(): void {
    if (this.isPlayingReplay()) {
      this.pauseReplay();
    } else {
      this.playReplay();
    }
  }

  stepForward(): void {
    if (this.activeAgentId() === 'v2') {
      const iters = this.v2Execution().iterations;
      if (iters.length === 0) return;
      const currentIter = this.activeV2Iteration();
      const currentPhaseIdx = this.selectedPhaseIndex();

      if (currentIter && currentPhaseIdx < currentIter.phases.length - 1) {
        this.selectedPhaseIndex.set(currentPhaseIdx + 1);
      } else {
        const currentIterIdx = this.selectedIterationIndex();
        const nextIter = iters.find((it) => it.iterationIndex === currentIterIdx + 1);
        if (nextIter) {
          this.selectedIterationIndex.set(nextIter.iterationIndex);
          this.selectedPhaseIndex.set(0);
        } else {
          this.pauseReplay();
        }
      }
    } else {
      const current = this.selectedStepIndex();
      const steps = this.journey().steps;
      if (current < steps.length - 1) {
        this.selectedStepIndex.set(current + 1);
      } else {
        this.pauseReplay();
      }
    }
  }

  stepBackward(): void {
    this.pauseReplay();
    if (this.activeAgentId() === 'v2') {
      const iters = this.v2Execution().iterations;
      if (iters.length === 0) return;
      const currentPhaseIdx = this.selectedPhaseIndex();

      if (currentPhaseIdx > 0) {
        this.selectedPhaseIndex.set(currentPhaseIdx - 1);
      } else {
        const currentIterIdx = this.selectedIterationIndex();
        const prevIter = iters.find((it) => it.iterationIndex === currentIterIdx - 1);
        if (prevIter) {
          this.selectedIterationIndex.set(prevIter.iterationIndex);
          this.selectedPhaseIndex.set(Math.max(0, prevIter.phases.length - 1));
        }
      }
    } else {
      const current = this.selectedStepIndex();
      if (current > 0) {
        this.selectedStepIndex.set(current - 1);
      }
    }
  }

  resetReplay(): void {
    this.pauseReplay();
    this.selectedStepIndex.set(0);
    this.selectedIterationIndex.set(1);
    this.selectedPhaseIndex.set(0);
  }

  setPlaybackSpeed(speed: PlaybackSpeed): void {
    this.playbackSpeed.set(speed);
    if (this.isPlayingReplay()) {
      this.playReplay();
    }
  }

  private stopReplayTimer(): void {
    if (this.replayTimer) {
      clearInterval(this.replayTimer);
      this.replayTimer = null;
    }
  }
}
