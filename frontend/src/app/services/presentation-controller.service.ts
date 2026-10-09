import { Injectable, inject, signal, computed } from '@angular/core';
import { EventStoreService } from './event-store.service';
import { AgentJourneyStep, AvatarMood } from '../models/journey.models';
import { StreamEvent } from '../models/agent.models';

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
  readonly playbackSpeed = signal<PlaybackSpeed>(1);
  readonly isPlayingReplay = signal<boolean>(false);

  private replayTimer: any = null;

  readonly journey = this.eventStore.journey;
  readonly events = this.eventStore.events;
  readonly runStatus = this.eventStore.runStatus;

  readonly activeStep = computed<AgentJourneyStep | null>(() => {
    const steps = this.journey().steps;
    if (steps.length === 0) return null;

    if (this.mode() === 'replay') {
      const idx = Math.min(Math.max(0, this.selectedStepIndex()), steps.length - 1);
      return steps[idx] || null;
    }

    if (this.isVisualPaused()) {
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

  readonly avatarMood = computed<AvatarMood>(() => {
    const status = this.runStatus();
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
    const steps = this.journey().steps;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status === 'completed' || steps[i].status === 'active' || steps[i].status === 'failed') {
        this.selectedStepIndex.set(i);
        break;
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

  setMode(newMode: ExplorationMode): void {
    this.mode.set(newMode);
    this.stopReplayTimer();
    if (newMode === 'live') {
      this.jumpToLatest();
    } else {
      this.selectedStepIndex.set(0);
    }
  }

  startReplayMode(): void {
    this.setMode('replay');
    this.selectedStepIndex.set(0);
    this.playReplay();
  }

  playReplay(): void {
    this.isPlayingReplay.set(true);
    this.stopReplayTimer();

    const intervalMs = 1800 / this.playbackSpeed();
    this.replayTimer = setInterval(() => {
      const current = this.selectedStepIndex();
      const steps = this.journey().steps;
      if (current < steps.length - 1) {
        this.selectedStepIndex.set(current + 1);
      } else {
        this.pauseReplay();
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
    this.pauseReplay();
    const current = this.selectedStepIndex();
    const steps = this.journey().steps;
    if (current < steps.length - 1) {
      this.selectedStepIndex.set(current + 1);
    }
  }

  stepBackward(): void {
    this.pauseReplay();
    const current = this.selectedStepIndex();
    if (current > 0) {
      this.selectedStepIndex.set(current - 1);
    }
  }

  resetReplay(): void {
    this.pauseReplay();
    this.selectedStepIndex.set(0);
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
