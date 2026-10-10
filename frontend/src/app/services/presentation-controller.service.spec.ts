import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PresentationControllerService } from './presentation-controller.service';
import { EventStoreService } from './event-store.service';

describe('PresentationControllerService', () => {
  let controller: PresentationControllerService;
  let eventStore: EventStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    controller = TestBed.inject(PresentationControllerService);
    eventStore = TestBed.inject(EventStoreService);
  });

  it('should initialize with live mode and unpaused state', () => {
    expect(controller.mode()).toBe('live');
    expect(controller.isVisualPaused()).toBe(false);
    expect(controller.selectedStepIndex()).toBe(0);
    expect(controller.selectedIterationIndex()).toBe(1);
    expect(controller.selectedPhaseIndex()).toBe(0);
  });

  it('should toggle visual pause in live mode', () => {
    expect(controller.isVisualPaused()).toBe(false);
    controller.toggleVisualPause();
    expect(controller.isVisualPaused()).toBe(true);
    controller.toggleVisualPause();
    expect(controller.isVisualPaused()).toBe(false);
  });

  it('should update step on v1 event in live mode', () => {
    eventStore.startNewRun('v1');
    controller.onNewEvent({
      event_id: 'evt-1',
      agent_version: 'v1',
      hop_number: 3,
      type: 'TOOL_PROPOSAL',
      payload: {},
      timestamp: new Date().toISOString()
    });
    expect(controller.selectedStepIndex()).toBe(2);
  });

  it('should update iteration and phase on v2 event in live mode', () => {
    eventStore.startNewRun('v2');
    controller.onNewEvent({
      event_id: 'evt-v2-1',
      agent_version: 'v2',
      iteration_index: 2,
      phase: 'execution',
      type: 'TOOL_EXECUTION_STARTED',
      payload: {},
      timestamp: new Date().toISOString()
    });
    expect(controller.selectedIterationIndex()).toBe(2);
    expect(controller.selectedPhaseIndex()).toBe(3);
  });

  it('should navigate through replay mode', () => {
    controller.startReplayMode();
    expect(controller.mode()).toBe('replay');
    expect(controller.selectedStepIndex()).toBe(0);

    controller.setPlaybackSpeed(2);
    expect(controller.playbackSpeed()).toBe(2);

    controller.pauseReplay();
    expect(controller.isPlayingReplay()).toBe(false);

    controller.setMode('live');
    expect(controller.mode()).toBe('live');
  });
});
