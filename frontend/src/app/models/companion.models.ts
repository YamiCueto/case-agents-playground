import { StreamEvent } from './agent.models';
import {
  NodeExecutionState,
  SimulatorEventMapping,
  SimulatorNodeId,
  getEventMapping
} from './simulator.models';

export type CompanionStatus =
  | 'idle'
  | 'preparing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RuntimeCompanionState {
  runId: string;
  agentVersion: string;
  userQuery: string;
  userPersona: string;
  status: CompanionStatus;
  isMinimized: boolean;
  isDetailsExpanded: boolean;
  events: StreamEvent[];
  activeEventIndex: number;
  activeEvent: StreamEvent | null;
  eventMapping: SimulatorEventMapping | null;
  nodeStates: Record<SimulatorNodeId, NodeExecutionState>;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  isReplayMode: boolean;
}

export function createInitialCompanionState(
  runId: string,
  agentVersion: string,
  userQuery: string,
  userPersona: string
): RuntimeCompanionState {
  const initialNodeStates: Record<SimulatorNodeId, NodeExecutionState> = {
    USER: 'active',
    RUNTIME: 'waiting',
    LLM: 'idle',
    TOOLS: 'idle',
    MEMORY: 'idle',
    PLANNER: 'idle',
    EXECUTOR: 'idle'
  };

  const initialMapping: SimulatorEventMapping = {
    activeNode: 'USER',
    targetNode: 'RUNTIME',
    edgeId: 'user-runtime',
    nodeState: 'active',
    stateBadge: 'Preparando Ejecución',
    pedagogicalExplanation:
      'La solicitud fue enviada por el usuario. El runtime está inicializando el contexto.',
    whatLLMDid: 'A la espera del prompt estructurado y el catálogo de herramientas.',
    whatRuntimeDid: 'Registrando la sesión y preparando el canal SSE.'
  };

  return {
    runId,
    agentVersion,
    userQuery,
    userPersona,
    status: 'preparing',
    isMinimized: false,
    isDetailsExpanded: false,
    events: [],
    activeEventIndex: -1,
    activeEvent: null,
    eventMapping: initialMapping,
    nodeStates: initialNodeStates,
    startedAt: new Date().toISOString(),
    isReplayMode: false
  };
}

export function updateCompanionWithEvent(
  state: RuntimeCompanionState,
  event: StreamEvent
): RuntimeCompanionState {
  const newEvents = [...state.events, event];
  const newIndex = newEvents.length - 1;
  const mapping = getEventMapping(event.type, event.payload);

  const newNodeStates: Record<SimulatorNodeId, NodeExecutionState> = {
    USER: 'idle',
    RUNTIME: 'idle',
    LLM: 'idle',
    TOOLS: 'idle',
    MEMORY: 'idle',
    PLANNER: 'idle',
    EXECUTOR: 'idle'
  };

  newNodeStates[mapping.activeNode] = mapping.nodeState;
  if (mapping.targetNode && mapping.nodeState === 'active') {
    newNodeStates[mapping.targetNode] = 'waiting';
  }

  let newStatus: CompanionStatus = state.status;
  if (state.status === 'preparing') {
    newStatus = 'running';
  }
  if (event.type === 'RUN_COMPLETED') {
    newStatus = 'completed';
  } else if (event.type === 'ERROR' || event.type === 'RUN_FAILED') {
    newStatus = 'failed';
  }

  return {
    ...state,
    status: newStatus,
    events: newEvents,
    activeEventIndex: newIndex,
    activeEvent: event,
    eventMapping: mapping,
    nodeStates: newNodeStates,
    errorMessage:
      newStatus === 'failed'
        ? event.payload?.['message'] || event.payload?.['error_message'] || 'Error en ejecución'
        : state.errorMessage
  };
}

export function toggleCompanionDetails(state: RuntimeCompanionState): RuntimeCompanionState {
  return {
    ...state,
    isDetailsExpanded: !state.isDetailsExpanded
  };
}

export function setCompanionReplayIndex(
  state: RuntimeCompanionState,
  index: number
): RuntimeCompanionState {
  if (index < 0 || index >= state.events.length) {
    return state;
  }
  const event = state.events[index];
  const mapping = getEventMapping(event.type, event.payload);

  const newNodeStates: Record<SimulatorNodeId, NodeExecutionState> = {
    USER: 'idle',
    RUNTIME: 'idle',
    LLM: 'idle',
    TOOLS: 'idle',
    MEMORY: 'idle',
    PLANNER: 'idle',
    EXECUTOR: 'idle'
  };

  newNodeStates[mapping.activeNode] = mapping.nodeState;
  if (mapping.targetNode && mapping.nodeState === 'active') {
    newNodeStates[mapping.targetNode] = 'waiting';
  }

  return {
    ...state,
    isReplayMode: true,
    isDetailsExpanded: true,
    activeEventIndex: index,
    activeEvent: event,
    eventMapping: mapping,
    nodeStates: newNodeStates
  };
}
