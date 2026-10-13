import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CompanionStatus,
  RuntimeCompanionState,
  createInitialCompanionState,
  setCompanionReplayIndex,
  updateCompanionWithEvent
} from '../models/companion.models';
import { StreamEvent } from '../models/agent.models';
import { SimulatorProjectionService } from './simulator-projection.service';
import { PresentationControllerService } from './presentation-controller.service';

@Injectable({
  providedIn: 'root'
})
export class RuntimeCompanionService {
  private readonly simulator = inject(SimulatorProjectionService);
  private readonly presentationController = inject(PresentationControllerService);

  readonly runs = signal<Record<string, RuntimeCompanionState>>({});
  readonly activeRunId = signal<string | null>(null);

  readonly activeRun = computed<RuntimeCompanionState | null>(() => {
    const id = this.activeRunId();
    if (!id) return null;
    return this.runs()[id] || null;
  });

  getRun(runId?: string): RuntimeCompanionState | undefined {
    if (!runId) return undefined;
    return this.runs()[runId];
  }

  startRun(
    runId: string,
    agentVersion: string,
    userQuery: string,
    userPersona: string
  ): RuntimeCompanionState {
    const initialState = createInitialCompanionState(
      runId,
      agentVersion,
      userQuery,
      userPersona
    );

    this.runs.update((all) => ({
      ...all,
      [runId]: initialState
    }));
    this.activeRunId.set(runId);
    return initialState;
  }

  appendEvent(runId: string, event: StreamEvent): void {
    const current = this.runs()[runId];
    if (!current) return;

    const updated = updateCompanionWithEvent(current, event);
    this.runs.update((all) => ({
      ...all,
      [runId]: updated
    }));
  }

  completeRun(runId: string): void {
    const current = this.runs()[runId];
    if (!current) return;

    if (current.status !== 'failed' && current.status !== 'cancelled') {
      const updated: RuntimeCompanionState = {
        ...current,
        status: 'completed',
        completedAt: new Date().toISOString()
      };
      this.runs.update((all) => ({
        ...all,
        [runId]: updated
      }));
    }
  }

  failRun(runId: string, errorMessage?: string): void {
    const current = this.runs()[runId];
    if (!current) return;

    const updated: RuntimeCompanionState = {
      ...current,
      status: 'failed',
      errorMessage: errorMessage || current.errorMessage || 'Error en la ejecución',
      completedAt: new Date().toISOString()
    };
    this.runs.update((all) => ({
      ...all,
      [runId]: updated
    }));
  }

  cancelRun(runId: string): void {
    const current = this.runs()[runId];
    if (!current) return;

    const updated: RuntimeCompanionState = {
      ...current,
      status: 'cancelled',
      errorMessage: 'Ejecución cancelada por el usuario',
      completedAt: new Date().toISOString()
    };
    this.runs.update((all) => ({
      ...all,
      [runId]: updated
    }));
  }

  toggleMinimize(runId: string): void {
    const current = this.runs()[runId];
    if (!current) return;

    const updated: RuntimeCompanionState = {
      ...current,
      isMinimized: !current.isMinimized
    };
    this.runs.update((all) => ({
      ...all,
      [runId]: updated
    }));
  }

  toggleDetails(runId: string): void {
    const current = this.runs()[runId];
    if (!current) return;

    const updated: RuntimeCompanionState = {
      ...current,
      isDetailsExpanded: !current.isDetailsExpanded
    };
    this.runs.update((all) => ({
      ...all,
      [runId]: updated
    }));
  }

  enableReplayMode(runId: string): void {
    const current = this.runs()[runId];
    if (!current || current.events.length === 0) return;

    const updated = setCompanionReplayIndex(current, current.events.length - 1);
    this.runs.update((all) => ({
      ...all,
      [runId]: updated
    }));
  }

  setReplayIndex(runId: string, index: number): void {
    const current = this.runs()[runId];
    if (!current) return;

    const updated = setCompanionReplayIndex(current, index);
    this.runs.update((all) => ({
      ...all,
      [runId]: updated
    }));
  }

  open3DSimulator(runId: string): void {
    const run = this.runs()[runId];
    if (!run) {
      this.simulator.openSimulator();
      return;
    }

    // Opens 3D simulator populated with this specific run's events
    this.simulator.openSimulator(run.events, run.agentVersion);
  }
}
