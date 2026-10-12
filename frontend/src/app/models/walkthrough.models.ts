export interface WalkthroughStep {
  id: string;
  targetSelector?: string;
  title: string;
  description: string;
  pedagogicalInsight?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  versionSpecific?: 'v1' | 'v2' | 'v3' | 'v4';
}

export const GENERAL_WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'welcome',
    title: '¡Bienvenido a Agent Engineering Playground (AEP)!',
    description:
      'AEP es el laboratorio interactivo para el módulo M05 de CASE OS. Aquí no solo interactúas con un agente de IA, sino que observas cada hop, decisión y validación en tiempo real.',
    pedagogicalInsight:
      'Principio clave: AEP representa un único agente que evoluciona progresivamente a través de las lecciones, desde llamadas elementales a herramientas hasta planes estructurados.',
    placement: 'center'
  },
  {
    id: 'agent-select',
    targetSelector: '[data-tour="tour-agent-select"]',
    title: 'Selector de Versión Agéntica',
    description:
      'Elige la versión del agente a estudiar (v1 a v4). Cada versión añade una nueva capacidad arquitectónica de nivel industrial, conservando las anteriores.',
    pedagogicalInsight:
      'v1: Tool Calling • v2: Agent Loop • v3: State & Memory • v4: Planning & Task Decomposition. v5 y v6 son futuras.',
    placement: 'bottom'
  },
  {
    id: 'persona-select',
    targetSelector: '[data-tour="tour-persona-select"]',
    title: 'Identidad Simulada (Persona)',
    description:
      'Simula el rol con el que interactúas (ej. Carlos como usuario final, Laura, Soporte Técnico o Supervisor).',
    pedagogicalInsight:
      'En Agent v3 verás cómo la memoria conversacional y las preferencias se aíslan rigurosamente por usuario en la base de datos MySQL.',
    placement: 'bottom'
  },
  {
    id: 'connection',
    targetSelector: '[data-tour="tour-connection"]',
    title: 'Semáforo de Conectividad Soberana',
    description:
      'Muestra el estado de los tres componentes esenciales: el backend FastAPI (:8000), el modelo LLM local Qwen (:8080) y la base de datos MySQL.',
    pedagogicalInsight:
      'El agente no puede operar a ciegas: todos los servicios deben estar conectados para garantizar verificabilidad en el laboratorio.',
    placement: 'bottom'
  },
  {
    id: 'chat-panel',
    targetSelector: '[data-tour="tour-chat-panel"]',
    title: 'Panel de Conversación',
    description:
      'Escribe consultas para el agente y recibe la síntesis final generada en lenguaje natural.',
    pedagogicalInsight:
      'Una respuesta fluida no prueba por sí sola que hubo ejecución de herramientas. Para verificarlo, observa el Runtime Inspector.',
    placement: 'right'
  },
  {
    id: 'chat-suggestions',
    targetSelector: '[data-tour="tour-chat-suggestions"]',
    title: 'Atajos de Consulta Rápida',
    description:
      'Prompts preconfigurados y verificados para poner a prueba inmediatamente las capacidades de la versión seleccionada.',
    pedagogicalInsight:
      'Usa estos atajos para reproducir los laboratorios guiados de la documentación con un solo clic.',
    placement: 'top'
  },
  {
    id: 'inspector-header',
    targetSelector: '[data-tour="tour-inspector-header"]',
    title: 'Inspector de Ejecución',
    description:
      'El corazón de observabilidad de AEP. Muestra los eventos internos emitidos por el runtime en tiempo real.',
    pedagogicalInsight:
      'Aquí se verifica la regla de oro: el modelo LLM propone, mientras que el runtime valida y ejecuta en CPU.',
    placement: 'left'
  },
  {
    id: 'avatar-3d',
    targetSelector: '[data-tour="tour-avatar-3d"]',
    title: 'Robot Holográfico 3D (Three.js)',
    description:
      'Visualiza el estado cognitivo y la fase activa de ejecución (reposo, inferencia, herramienta en CPU, síntesis, error o planificación).',
    pedagogicalInsight:
      'Es un indicador de estado visual del sistema. Cuenta con fallback vectorial 2D si WebGL no está disponible.',
    placement: 'left'
  },
  {
    id: 'pipeline-stepper',
    targetSelector: '[data-tour="tour-pipeline-stepper"]',
    title: 'Timeline y Stepper de Hops',
    description:
      'Visualiza la secuencia cronológica de hops (en v1), iteraciones del bucle (en v2/v3) o el grafo de dependencias DAG (en v4).',
    pedagogicalInsight:
      'Haz clic en cualquier fase o nodo para inspeccionar sus argumentos validados y su observación fáctica.',
    placement: 'left'
  },
  {
    id: 'decision-trace',
    targetSelector: '[data-tour="tour-decision-trace"]',
    title: 'Traza de Decisiones Observables',
    description:
      'Registro cronológico de todas las bifurcaciones y decisiones tomadas por el runtime y el modelo.',
    pedagogicalInsight:
      'No es razonamiento privado oculto: son decisiones formalizadas como eventos auditables.',
    placement: 'left'
  },
  {
    id: 'live-controls',
    targetSelector: '[data-tour="tour-live-controls"]',
    title: 'Controles Live, Pausa y Replay',
    description:
      'Pausa la animación en pantalla sin detener la ejecución en backend, o reproduce paso a paso ejecuciones pasadas a diferentes velocidades.',
    pedagogicalInsight:
      'El modo Replay no vuelve a llamar al modelo ni a la base de datos: reanima los eventos registrados en el navegador.',
    placement: 'bottom'
  },
  {
    id: 'guide-btn',
    targetSelector: '[data-tour="tour-guide-btn"]',
    title: 'Guía del Aprendiz',
    description:
      'Abre la documentación pedagógica completa adaptada a la versión activa, con laboratorios paso a paso, límites y botones para copiar prompts.',
    pedagogicalInsight:
      'Contiene los 5 ejercicios progresivos de cada lección y el catálogo exhaustivo de herramientas.',
    placement: 'bottom'
  },
  {
    id: 'simulator-btn',
    targetSelector: '[data-tour="tour-simulator-btn"]',
    title: 'Simulador del Runtime de Agentes',
    description:
      'Abre la experiencia inmersiva Three.js con el grafo de nodos soberanos (USER, LLM, RUNTIME, TOOLS, MEMORY, PLANNER, EXECUTOR) y flujo de partículas en tiempo real.',
    pedagogicalInsight:
      'La herramienta definitiva para ver exactamente cómo viajan los datos entre el modelo, la CPU y MySQL.',
    placement: 'bottom'
  }
];

export const VERSION_SPECIFIC_WALKTHROUGH_STEPS: Record<string, WalkthroughStep[]> = {
  v1: [
    {
      id: 'v1-focus',
      targetSelector: '[data-tour="tour-pipeline-stepper"]',
      title: 'Enfoque Agent v1: Tool Calling y Contratos',
      description:
        'En v1 observa el ciclo de 7 hops: propuesta del modelo, validación de contrato Pydantic y ejecución soberana en MySQL.',
      pedagogicalInsight:
        'Limitación clave: v1 solo puede ejecutar una herramienta por consulta y carece de bucle iterativo.',
      placement: 'left',
      versionSpecific: 'v1'
    }
  ],
  v2: [
    {
      id: 'v2-focus',
      targetSelector: '[data-tour="tour-pipeline-stepper"]',
      title: 'Enfoque Agent v2: Agent Loop y Presupuesto',
      description:
        'En v2 el agente itera en un bucle reactivo. Observa el contador de iteraciones (máximo 5), el tiempo límite y la detección de ciclos repetitivos.',
      pedagogicalInsight:
        'Cada iteración aporta observaciones de herramientas hasta que el modelo decide emitir la síntesis final.',
      placement: 'left',
      versionSpecific: 'v2'
    }
  ],
  v3: [
    {
      id: 'v3-focus',
      targetSelector: '[data-tour="tour-memory-panel"]',
      title: 'Enfoque Agent v3: State & Memory en MySQL',
      description:
        'En v3 se activa la columna de Estado y Memoria. Observa la hidratación de turnos previos, el registro de decisiones explícitas y el presupuesto de contexto.',
      pedagogicalInsight:
        'Aislamiento de usuario: las preferencias guardadas por Carlos no son visibles cuando operas como Laura.',
      placement: 'left',
      versionSpecific: 'v3'
    }
  ],
  v4: [
    {
      id: 'v4-focus',
      targetSelector: '[data-tour="tour-pipeline-stepper"]',
      title: 'Enfoque Agent v4: Planificación Estructurada DAG',
      description:
        'En v4 el bucle reactivo es reemplazado por un grafo acíclico dirigido (DAG). Observa la meta invariante, ejecutores TOOL/RUNTIME/MODEL y revisiones de replanning.',
      pedagogicalInsight:
        'Tolerancia a fallos: ante tickets inexistentes o herramientas fallidas sin alternativa, el sistema entra en Runtime Stall seguro (no_executable_steps).',
      placement: 'left',
      versionSpecific: 'v4'
    }
  ]
};
