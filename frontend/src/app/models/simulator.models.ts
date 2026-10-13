export type SimulatorNodeId =
  | 'USER'
  | 'RUNTIME'
  | 'LLM'
  | 'TOOLS'
  | 'MEMORY'
  | 'PLANNER'
  | 'EXECUTOR';

export type NodeExecutionState = 'idle' | 'active' | 'waiting' | 'completed' | 'error';

export interface SimulatorNodeConfig {
  id: SimulatorNodeId;
  label: string;
  role: string;
  description: string;
  pedagogicalRole: string;
  colorHex: string;
  glowColorHex: string;
  position: { x: number; y: number; z: number };
  docSection: string;
  docFile: string;
  codeSnippetExample?: string;
}

export interface SimulatorEdgeConfig {
  id: string;
  source: SimulatorNodeId;
  target: SimulatorNodeId;
  label: string;
  description: string;
  isBidirectional?: boolean;
  versionIntroduced: 'v1' | 'v2' | 'v3' | 'v4';
}

export interface SimulatorEventMapping {
  activeNode: SimulatorNodeId;
  targetNode?: SimulatorNodeId;
  edgeId?: string;
  nodeState: NodeExecutionState;
  stateBadge: string;
  pedagogicalExplanation: string;
  whatLLMDid: string;
  whatRuntimeDid: string;
  technicalDetails?: string;
}

export const SIMULATOR_NODES: Record<SimulatorNodeId, SimulatorNodeConfig> = {
  USER: {
    id: 'USER',
    label: 'Usuario / Cliente',
    role: 'Emisor de la solicitud inicial y receptor de la síntesis final.',
    description:
      'Interactúa mediante lenguaje natural bajo una identidad (persona). En v3 y v4 aporta además confirmaciones o decisiones humanas (HITL).',
    pedagogicalRole:
      'Punto de origen y destino del flujo agéntico. Define el objetivo inicial y valida la respuesta recibida.',
    colorHex: '#38bdf8', // Ice Cyan
    glowColorHex: '#0284c7',
    position: { x: -4.0, y: 0, z: 0 },
    docSection: 'Identidad y Roles de Usuario',
    docFile: 'guia-runtime-inspector.md',
    codeSnippetExample: '{"query": "Consulta el ticket TICK-1001 y dime su estado", "persona": "usr_carlos"}'
  },
  RUNTIME: {
    id: 'RUNTIME',
    label: 'Runtime Orquestador (CPU)',
    role: 'Núcleo soberano de validación, control de flujo y emisión de eventos SSE.',
    description:
      'Orquesta el ciclo agéntico en CPU. Valida contratos Pydantic, verifica permisos, despacha herramientas deterministas y aplica condiciones de parada.',
    pedagogicalRole:
      '«El LLM propone, el runtime valida y ejecuta». El modelo NUNCA tiene acceso directo a la base de datos ni a la CPU.',
    colorHex: '#10b981', // Emerald
    glowColorHex: '#059669',
    position: { x: -1.2, y: 0, z: 0 },
    docSection: 'El Runtime Soberano',
    docFile: 'guia-runtime-inspector.md',
    codeSnippetExample: 'contract = ToolCallContract(name="get_ticket_by_id", args={"ticket_code": "TICK-1001"})\nvalidated_args = contract.validate()'
  },
  LLM: {
    id: 'LLM',
    label: 'Modelo LLM (Qwen :8080)',
    role: 'Motor de inferencia y comprensión de lenguaje natural.',
    description:
      'Evalúa el contexto y el catálogo de herramientas. Decide si emite una respuesta directa o propone una estructura de llamada a herramientas.',
    pedagogicalRole:
      'Generador probabilístico de texto y propuestas estructuradas. No ejecuta comandos ni altera el estado del sistema por sí mismo.',
    colorHex: '#c084fc', // Neon Violet
    glowColorHex: '#9333ea',
    position: { x: 1.6, y: 1.8, z: 0 },
    docSection: 'Inferencia y Propuestas de Herramientas',
    docFile: 'agent-v1-tool-calling.md',
    codeSnippetExample: '{\n  "tool": "get_ticket_by_id",\n  "arguments": {"ticket_code": "TICK-1001"}\n}'
  },
  TOOLS: {
    id: 'TOOLS',
    label: 'Herramientas (MySQL / CPU)',
    role: 'Funciones deterministas con contratos estrictos de entrada y salida.',
    description:
      'Ejecuta consultas parametrizadas en MySQL (ej. lectura de tickets, filtrado por SLA, inserción de notas).',
    pedagogicalRole:
      'Operaciones con contratos auditables. Aportan observaciones fácticas para que el modelo no alucine.',
    colorHex: '#f59e0b', // Amber
    glowColorHex: '#d97706',
    position: { x: 1.6, y: -1.8, z: 0 },
    docSection: 'Catálogo de Herramientas',
    docFile: 'catalogo-herramientas.md',
    codeSnippetExample: 'def get_ticket_by_id(ticket_code: str) -> dict:\n    # SELECT * FROM tickets WHERE code = ...\n    return {"ticket_id": 1001, "status": "OPEN", ...}'
  },
  MEMORY: {
    id: 'MEMORY',
    label: 'Memoria y Estado (MySQL)',
    role: 'Persistencia de turnos conversacionales, preferencias y decisiones.',
    description:
      'Almacena el historial conversacional aislado por persona, preferencias de usuario y decisiones explícitas en tablas relacionales.',
    pedagogicalRole:
      'Diferenciación crucial: la memoria no son "recuerdos mágicos", son registros en base de datos inyectados dentro de un presupuesto de tokens.',
    colorHex: '#6366f1', // Indigo
    glowColorHex: '#4f46e5',
    position: { x: -1.2, y: -2.6, z: 0 },
    docSection: 'Persistencia y Aislamiento de Memoria',
    docFile: 'agent-v3-state-memory.md',
    codeSnippetExample: 'cursor.execute("SELECT * FROM agent_memory WHERE user_id = %s", (user_id,))'
  },
  PLANNER: {
    id: 'PLANNER',
    label: 'Planificador DAG (Meta & Pasos)',
    role: 'Descomposición analítica de metas complejas en un Grafo Acíclico Dirigido.',
    description:
      'Genera y valida la lista de pasos requeridos, verificando dependencias estrictas, ejecutores asignados y ausencia de ciclos.',
    pedagogicalRole:
      'Reemplaza el bucle reactivo por un plan formal auditable con replanning estructurado.',
    colorHex: '#14b8a6', // Teal
    glowColorHex: '#0d9488',
    position: { x: 4.2, y: 1.8, z: 0 },
    docSection: 'Planificación Estructurada y DAG',
    docFile: 'agent-v4-planning.md',
    codeSnippetExample: 'plan = Plan(goal="Auditar tickets críticos", steps=[Step(id=1, deps=[]), Step(id=2, deps=[1])])'
  },
  EXECUTOR: {
    id: 'EXECUTOR',
    label: 'Ejecutor Especializado (Dispatch)',
    role: 'Despacho determinista de cada paso del plan según su tipo.',
    description:
      'Despacha pasos a TOOL (funciones en CPU/MySQL), RUNTIME (lógica interna agéntica) o MODEL (síntesis intermedia).',
    pedagogicalRole:
      'Garantiza que cada nodo del plan se procese con el motor adecuado sin saltarse dependencias.',
    colorHex: '#f43f5e', // Rose
    glowColorHex: '#e11d48',
    position: { x: 4.2, y: -1.8, z: 0 },
    docSection: 'Tipos de Ejecutores (TOOL / RUNTIME / MODEL)',
    docFile: 'agent-v4-planning.md',
    codeSnippetExample: 'match step.executor_type:\n    case "TOOL": execute_tool(step)\n    case "RUNTIME": execute_runtime_logic(step)'
  }
};

export const SIMULATOR_EDGES: SimulatorEdgeConfig[] = [
  {
    id: 'user-runtime',
    source: 'USER',
    target: 'RUNTIME',
    label: 'USER_REQUEST / FINAL_SYNTHESIS',
    description: 'Solicitud del usuario ingresa al runtime; síntesis final retorna al usuario.',
    isBidirectional: true,
    versionIntroduced: 'v1'
  },
  {
    id: 'runtime-llm',
    source: 'RUNTIME',
    target: 'LLM',
    label: 'PROMPT / INFERENCIA',
    description: 'Runtime envía prompt con catálogo; LLM procesa y devuelve propuesta o respuesta.',
    isBidirectional: true,
    versionIntroduced: 'v1'
  },
  {
    id: 'runtime-tools',
    source: 'RUNTIME',
    target: 'TOOLS',
    label: 'CPU_TOOL_EXECUTION',
    description: 'Runtime valida y ejecuta herramienta en MySQL; recibe observación estructurada.',
    isBidirectional: true,
    versionIntroduced: 'v1'
  },
  {
    id: 'runtime-memory',
    source: 'RUNTIME',
    target: 'MEMORY',
    label: 'HYDRATION / PERSISTENCE',
    description: 'Runtime recupera historial previo y persiste el nuevo turno en MySQL.',
    isBidirectional: true,
    versionIntroduced: 'v3'
  },
  {
    id: 'llm-planner',
    source: 'LLM',
    target: 'PLANNER',
    label: 'PLAN_GENERATED',
    description: 'El modelo propone la descomposición de la meta en un grafo acíclico.',
    versionIntroduced: 'v4'
  },
  {
    id: 'planner-executor',
    source: 'PLANNER',
    target: 'EXECUTOR',
    label: 'STEP_DISPATCH',
    description: 'El planificador alimenta pasos listos para ejecución respetando dependencias.',
    versionIntroduced: 'v4'
  },
  {
    id: 'executor-tools',
    source: 'EXECUTOR',
    target: 'TOOLS',
    label: 'TOOL_EXECUTION',
    description: 'El ejecutor despacha herramientas en MySQL.',
    versionIntroduced: 'v4'
  }
];

export function getTopologyForVersion(version: string): {
  nodes: SimulatorNodeConfig[];
  edges: SimulatorEdgeConfig[];
} {
  let allowedNodes: SimulatorNodeId[] = ['USER', 'RUNTIME', 'LLM', 'TOOLS'];
  let allowedEdges = ['user-runtime', 'runtime-llm', 'runtime-tools'];

  if (version === 'v2') {
    allowedNodes = ['USER', 'RUNTIME', 'LLM', 'TOOLS'];
    allowedEdges = ['user-runtime', 'runtime-llm', 'runtime-tools'];
  } else if (version === 'v3') {
    allowedNodes = ['USER', 'RUNTIME', 'LLM', 'TOOLS', 'MEMORY'];
    allowedEdges = ['user-runtime', 'runtime-llm', 'runtime-tools', 'runtime-memory'];
  } else if (version === 'v4') {
    allowedNodes = ['USER', 'RUNTIME', 'LLM', 'TOOLS', 'MEMORY', 'PLANNER', 'EXECUTOR'];
    allowedEdges = [
      'user-runtime',
      'runtime-llm',
      'runtime-tools',
      'runtime-memory',
      'llm-planner',
      'planner-executor',
      'executor-tools'
    ];
  }

  return {
    nodes: allowedNodes.map((id) => SIMULATOR_NODES[id]),
    edges: SIMULATOR_EDGES.filter((e) => allowedEdges.includes(e.id))
  };
}

export function getEventMapping(eventType: string, payload: any): SimulatorEventMapping {
  switch (eventType) {
    case 'USER_REQUEST':
    case 'RUN_STARTED':
      return {
        activeNode: 'USER',
        targetNode: 'RUNTIME',
        edgeId: 'user-runtime',
        nodeState: 'active',
        stateBadge: 'Solicitud del Usuario',
        pedagogicalExplanation:
          'El usuario envía su consulta en lenguaje natural junto con su contexto de persona simulada.',
        whatLLMDid: 'Aún no interviene. Espera a que el runtime le prepare el prompt.',
        whatRuntimeDid: 'Recibe la petición, registra la sesión y prepara el catálogo de herramientas.',
        technicalDetails: `Query: "${payload?.query || ''}"`
      };

    case 'LLM_INFERENCE_START':
    case 'INFERENCE_STARTED':
      return {
        activeNode: 'LLM',
        targetNode: 'RUNTIME',
        edgeId: 'runtime-llm',
        nodeState: 'waiting',
        stateBadge: 'Inferencia Activa',
        pedagogicalExplanation:
          'El modelo local Qwen está procesando los tokens del prompt. Puede tomar unos segundos.',
        whatLLMDid: 'Calcula probabilidades de los siguientes tokens en GPU/CPU.',
        whatRuntimeDid: 'Mantiene abierta la conexión SSE a la espera de la respuesta.',
        technicalDetails: 'Esperando respuesta del modelo local (:8080)...'
      };

    case 'TOOL_PROPOSAL':
    case 'TOOL_PROPOSED':
      return {
        activeNode: 'LLM',
        targetNode: 'RUNTIME',
        edgeId: 'runtime-llm',
        nodeState: 'active',
        stateBadge: 'Herramienta Propuesta',
        pedagogicalExplanation:
          'El LLM decidió que requiere información fáctica externa y propone ejecutar una función específica.',
        whatLLMDid: `Propone invocar "${payload?.tool_name || payload?.name || 'herramienta'}" con argumentos JSON.`,
        whatRuntimeDid: 'Valida esquema y permisos antes de ejecutar en base de datos.',
        technicalDetails: `Tool: ${payload?.tool_name || payload?.name} • Args: ${JSON.stringify(payload?.arguments || {})}`
      };

    case 'ARGUMENT_VALIDATION':
    case 'ARGUMENTS_VALIDATED':
      return {
        activeNode: 'RUNTIME',
        targetNode: 'TOOLS',
        edgeId: 'runtime-tools',
        nodeState: 'active',
        stateBadge: 'Validación de Contrato',
        pedagogicalExplanation:
          'El runtime valida estrictamente los argumentos propuestos contra el esquema Pydantic.',
        whatLLMDid: 'Esperando el resultado de validación.',
        whatRuntimeDid: 'Aplica el contrato formal. Si los tipos son incorrectos, rechaza la llamada.',
        technicalDetails: `Válido: ${payload?.is_valid !== false} • Esquema verificado`
      };

    case 'CPU_TOOL_EXECUTION':
    case 'TOOL_EXECUTION_COMPLETED':
    case 'TOOL_CALLED':
      return {
        activeNode: 'TOOLS',
        targetNode: 'RUNTIME',
        edgeId: 'runtime-tools',
        nodeState: 'active',
        stateBadge: 'Ejecución en MySQL',
        pedagogicalExplanation:
          'La herramienta se ejecuta de forma soberana en el servidor, consultando la base de datos MySQL.',
        whatLLMDid: 'Sin acceso a la base de datos. Permanece a la espera.',
        whatRuntimeDid: 'Ejecuta la función Python en CPU y captura el resultado estructurado.',
        technicalDetails: `Herramienta: ${payload?.tool_name || 'MySQL Query'}`
      };

    case 'TOOL_RESULT_INJECTION':
    case 'OBSERVATION_RECEIVED':
      return {
        activeNode: 'RUNTIME',
        targetNode: 'LLM',
        edgeId: 'runtime-llm',
        nodeState: 'active',
        stateBadge: 'Observación Incorporada',
        pedagogicalExplanation:
          'El resultado devuelto por la herramienta se inyecta en el contexto del modelo como observación fáctica.',
        whatLLMDid: 'Recibe la observación para redactar la síntesis final.',
        whatRuntimeDid: 'Serializa la salida de MySQL y actualiza el prompt del modelo.',
        technicalDetails: `Bytes devueltos o registros leídos correctamente`
      };

    case 'FINAL_SYNTHESIS':
    case 'DIRECT_ANSWER':
    case 'AGENT_NOT_READY':
      return {
        activeNode: 'LLM',
        targetNode: 'USER',
        edgeId: 'user-runtime',
        nodeState: 'active',
        stateBadge: 'Síntesis Final',
        pedagogicalExplanation:
          'El modelo redacta la respuesta al usuario apoyándose exclusivamente en los datos fácticos observados.',
        whatLLMDid: 'Genera texto fundamentado (grounded) en lenguaje natural.',
        whatRuntimeDid: 'Transmite la respuesta en tiempo real al panel de conversación.',
        technicalDetails: 'Respuesta transmitida al cliente'
      };

    case 'RUN_COMPLETED':
      return {
        activeNode: 'RUNTIME',
        nodeState: 'completed',
        stateBadge: 'Ejecución Completada',
        pedagogicalExplanation:
          'El ciclo agéntico finalizó exitosamente. Se registraron todas las métricas y eventos.',
        whatLLMDid: 'Inferencia concluida.',
        whatRuntimeDid: 'Cierra el flujo SSE y consolida la telemetría.',
        technicalDetails: `Duración y hops consolidados`
      };

    case 'MEMORY_HYDRATED':
    case 'PREFERENCE_DETECTED':
      return {
        activeNode: 'MEMORY',
        targetNode: 'RUNTIME',
        edgeId: 'runtime-memory',
        nodeState: 'active',
        stateBadge: 'Memoria Hidratada',
        pedagogicalExplanation:
          'El runtime cargó turnos previos y preferencias del usuario desde MySQL dentro del presupuesto de tokens.',
        whatLLMDid: 'Aún no recibe el prompt.',
        whatRuntimeDid: 'Consulta la tabla de memoria y filtra por usuario.',
        technicalDetails: `Turnos cargados para ${payload?.user_persona || 'usuario'}`
      };

    case 'TURN_PERSISTED':
      return {
        activeNode: 'RUNTIME',
        targetNode: 'MEMORY',
        edgeId: 'runtime-memory',
        nodeState: 'completed',
        stateBadge: 'Turno Persistido',
        pedagogicalExplanation:
          'La consulta y respuesta fueron guardadas en MySQL para mantener la continuidad en futuros turnos.',
        whatLLMDid: 'No interviene en el guardado.',
        whatRuntimeDid: 'Inserta registro relacional con aislamiento por usuario.',
        technicalDetails: `Conversation ID: ${payload?.conversation_id || 'N/A'}`
      };

    case 'PLAN_GENERATED':
    case 'DAG_VALIDATED':
    case 'TASK_DECOMPOSED':
    case 'REPLAN_TRIGGERED':
      return {
        activeNode: 'PLANNER',
        targetNode: 'RUNTIME',
        edgeId: 'llm-planner',
        nodeState: 'active',
        stateBadge: 'Plan DAG Validado',
        pedagogicalExplanation:
          'El planificador descompuso la solicitud en pasos estructurados con dependencias acíclicas.',
        whatLLMDid: 'Generó la estructura de pasos y dependencias.',
        whatRuntimeDid: 'Valida que el DAG sea acíclico y contenga pasos ejecutables.',
        technicalDetails: `Pasos: ${payload?.steps_count || payload?.total_steps || 'N/A'}`
      };

    case 'STEP_DISPATCHED':
      return {
        activeNode: 'EXECUTOR',
        targetNode: 'TOOLS',
        edgeId: 'planner-executor',
        nodeState: 'active',
        stateBadge: 'Paso Despachado',
        pedagogicalExplanation:
          'Un paso del plan cuyas dependencias ya finalizaron entra en ejecución determinista.',
        whatLLMDid: 'Espera el resultado del paso.',
        whatRuntimeDid: 'Despacha el ejecutor correspondiente (TOOL/RUNTIME/MODEL).',
        technicalDetails: `Step: ${payload?.step_id || 'N/A'} • Tipo: ${payload?.executor_type || 'TOOL'}`
      };

    case 'LOOP_ITERATION_STARTED':
      return {
        activeNode: 'RUNTIME',
        targetNode: 'LLM',
        edgeId: 'runtime-llm',
        nodeState: 'active',
        stateBadge: 'Iteración de Bucle',
        pedagogicalExplanation:
          'El runtime inicia una nueva iteración del Agent Loop para continuar resolviendo la meta.',
        whatLLMDid: 'Recibe el estado acumulado y decide la siguiente acción.',
        whatRuntimeDid: 'Verifica límites de iteración, repetición y tiempo.',
        technicalDetails: `Iteración: ${payload?.iteration_index ?? 'N/A'}`
      };

    case 'ERROR':
    case 'RUN_FAILED':
      return {
        activeNode: 'RUNTIME',
        nodeState: 'error',
        stateBadge: 'Fallo en Ejecución',
        pedagogicalExplanation:
          'Ocurrió un error en la inferencia o en la validación de contratos.',
        whatLLMDid: 'Generó una respuesta o estructura inválida.',
        whatRuntimeDid: 'Captura el fallo de forma segura para no corromper el sistema.',
        technicalDetails: `Error: ${payload?.message || payload?.error_message || 'Desconocido'}`
      };

    default:
      return {
        activeNode: 'RUNTIME',
        nodeState: 'active',
        stateBadge: eventType,
        pedagogicalExplanation:
          'Evento observable emitido por el runtime durante la ejecución.',
        whatLLMDid: 'Estado del modelo según el evento.',
        whatRuntimeDid: 'Procesa y propaga el evento SSE.',
        technicalDetails: JSON.stringify(payload || {})
      };
  }
}
