import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalkthroughService } from './walkthrough.service';

describe('WalkthroughService', () => {
  let service: WalkthroughService;

  beforeEach(() => {
    localStorage.clear();
    service = new WalkthroughService();
  });

  it('starts inactive and with step index 0', () => {
    expect(service.isActive()).toBe(false);
    expect(service.currentStepIndex()).toBe(0);
    expect(service.isFirstStep()).toBe(true);
  });

  it('activates tour and sets step index on startTour', () => {
    service.startTour('v1');
    expect(service.isActive()).toBe(true);
    expect(service.currentStepIndex()).toBe(0);
    expect(service.activeAgentId()).toBe('v1');
    expect(service.currentStep()).not.toBeNull();
  });

  it('navigates next and previous steps correctly', () => {
    service.startTour('v1');
    const total = service.totalSteps();
    expect(total).toBeGreaterThan(1);

    service.nextStep();
    expect(service.currentStepIndex()).toBe(1);
    expect(service.isFirstStep()).toBe(false);

    service.prevStep();
    expect(service.currentStepIndex()).toBe(0);
    expect(service.isFirstStep()).toBe(true);
  });

  it('finishes tour on the last step and marks completed in localStorage', () => {
    service.startTour('v1');
    const total = service.totalSteps();

    // Jump to the end
    for (let i = 0; i < total - 1; i++) {
      service.nextStep();
    }
    expect(service.isLastStep()).toBe(true);

    service.nextStep(); // Advance past last step
    expect(service.isActive()).toBe(false);
    expect(service.hasCompletedTour()).toBe(true);
  });

  it('skips tour and records completion', () => {
    service.startTour('v2');
    expect(service.isActive()).toBe(true);

    service.skipTour();
    expect(service.isActive()).toBe(false);
    expect(service.hasCompletedTour()).toBe(true);
  });

  it('adjusts version-specific steps according to agent version', () => {
    service.startTour('v1');
    const v1Steps = service.steps();
    const hasV1Step = v1Steps.some((s) => s.versionSpecific === 'v1');
    const hasV4StepInV1 = v1Steps.some((s) => s.versionSpecific === 'v4');
    expect(hasV1Step).toBe(true);
    expect(hasV4StepInV1).toBe(false);

    service.startTour('v4');
    const v4Steps = service.steps();
    const hasV4Step = v4Steps.some((s) => s.versionSpecific === 'v4');
    expect(hasV4Step).toBe(true);
  });
});
