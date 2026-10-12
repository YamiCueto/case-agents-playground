import { Injectable, computed, signal } from '@angular/core';
import {
  GENERAL_WALKTHROUGH_STEPS,
  VERSION_SPECIFIC_WALKTHROUGH_STEPS,
  WalkthroughStep
} from '../models/walkthrough.models';

@Injectable({
  providedIn: 'root'
})
export class WalkthroughService {
  readonly isActive = signal<boolean>(false);
  readonly currentStepIndex = signal<number>(0);
  readonly activeAgentId = signal<string>('v1');

  readonly steps = computed<WalkthroughStep[]>(() => {
    const version = this.activeAgentId();
    const versionSteps = VERSION_SPECIFIC_WALKTHROUGH_STEPS[version] || [];
    // Insert version specific steps right before the final tools/simulator steps or at the end
    return [...GENERAL_WALKTHROUGH_STEPS, ...versionSteps];
  });

  readonly currentStep = computed<WalkthroughStep | null>(() => {
    const s = this.steps();
    const idx = this.currentStepIndex();
    return s[idx] || null;
  });

  readonly totalSteps = computed<number>(() => this.steps().length);
  readonly isFirstStep = computed<boolean>(() => this.currentStepIndex() === 0);
  readonly isLastStep = computed<boolean>(() => this.currentStepIndex() === this.steps().length - 1);

  startTour(agentVersion?: string): void {
    if (agentVersion) {
      this.activeAgentId.set(agentVersion);
    }
    this.currentStepIndex.set(0);
    this.isActive.set(true);
  }

  nextStep(): void {
    if (this.currentStepIndex() < this.steps().length - 1) {
      this.currentStepIndex.update((i) => i + 1);
    } else {
      this.finishTour();
    }
  }

  prevStep(): void {
    if (this.currentStepIndex() > 0) {
      this.currentStepIndex.update((i) => i - 1);
    }
  }

  skipTour(): void {
    this.isActive.set(false);
    this.markCompleted();
  }

  finishTour(): void {
    this.isActive.set(false);
    this.markCompleted();
  }

  resetTour(agentVersion?: string): void {
    this.startTour(agentVersion);
  }

  private markCompleted(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('aep_walkthrough_completed', 'true');
      }
    } catch {
      // LocalStorage fallback
    }
  }

  hasCompletedTour(): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem('aep_walkthrough_completed') === 'true';
      }
    } catch {
      // LocalStorage fallback
    }
    return false;
  }
}
