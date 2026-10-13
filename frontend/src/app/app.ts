import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { ChatPanelComponent } from './components/chat-panel/chat-panel.component';
import { RuntimeInspectorComponent } from './components/runtime-inspector/runtime-inspector.component';
import { V3MemoryInspectorComponent } from './components/runtime-inspector/v3-memory-inspector/v3-memory-inspector.component';
import { TicketsDrawerComponent } from './components/tickets-drawer/tickets-drawer.component';
import { LearnerGuideDrawerComponent } from './components/learner-guide-drawer/learner-guide-drawer.component';
import { WalkthroughOverlayComponent } from './components/walkthrough-overlay/walkthrough-overlay.component';
import { RuntimeSimulatorModalComponent } from './components/runtime-simulator/runtime-simulator-modal.component';
import { AgentStreamService, ChatStreamPayload } from './services/agent-stream.service';
import { TicketsService } from './services/tickets.service';
import { EventStoreService } from './services/event-store.service';
import { PresentationControllerService } from './services/presentation-controller.service';
import { WalkthroughService } from './services/walkthrough.service';
import { SimulatorProjectionService } from './services/simulator-projection.service';
import { RuntimeCompanionService } from './services/runtime-companion.service';
import { DemoModeService } from './services/demo-mode.service';
import { DemoRuntimeAdapterService } from './services/demo-runtime-adapter.service';
import { AgentMeta, PersonaInfo, StreamEvent, ChatMessage, TicketSummary, HealthStatus } from './models/agent.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    ChatPanelComponent,
    RuntimeInspectorComponent,
    V3MemoryInspectorComponent,
    TicketsDrawerComponent,
    LearnerGuideDrawerComponent,
    WalkthroughOverlayComponent,
    RuntimeSimulatorModalComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly streamService = inject(AgentStreamService);
  private readonly ticketsService = inject(TicketsService);
  readonly eventStore = inject(EventStoreService);
  readonly controller = inject(PresentationControllerService);
  readonly walkthrough = inject(WalkthroughService);
  readonly simulator = inject(SimulatorProjectionService);
  readonly companion = inject(RuntimeCompanionService);
  readonly demoMode = inject(DemoModeService);
  readonly demoAdapter = inject(DemoRuntimeAdapterService);

  readonly agents = signal<AgentMeta[]>([]);
  readonly personas = signal<PersonaInfo[]>([]);
  readonly selectedAgentId = signal<string>('v1');
  readonly selectedPersona = signal<string>('usr_carlos');
  readonly isDbDrawerOpen = signal<boolean>(false);
  readonly isGuideDrawerOpen = signal<boolean>(false);
  readonly selectedGuideDoc = signal<string | null>(null);
  readonly activeMobileTab = signal<'chat' | 'inspector' | 'memory'>('chat');
  readonly activeTabletRightTab = signal<'inspector' | 'memory'>('inspector');
  readonly health = signal<HealthStatus | null>(null);

  readonly chatRatio = signal<number>(50);
  private isDragging = false;

  readonly messages = signal<ChatMessage[]>([]);
  readonly currentRunEvents = this.eventStore.events;
  readonly tickets = signal<TicketSummary[]>([]);
  readonly activeConversationsByPersona = signal<Record<string, string>>({});
  readonly messagesByPersona = signal<Record<string, ChatMessage[]>>({});

  readonly isStreaming = computed(() => 
    this.streamService.isStreaming() || 
    this.demoAdapter.activePlaybackState() === 'playing' || 
    this.demoAdapter.activePlaybackState() === 'paused'
  );

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const savedRatio = sessionStorage.getItem('aep_split_ratio');
      if (savedRatio) {
        const parsed = parseInt(savedRatio, 10);
        if (!isNaN(parsed) && parsed >= 30 && parsed <= 70) {
          this.chatRatio.set(parsed);
        }
      }
    }
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.ticketsService.getAgents().subscribe({
      next: (data) => {
        this.agents.set(data);
        this.selectedAgentId.set('v1');
      },
      error: (err) => console.error('Error cargando agentes:', err)
    });

    this.ticketsService.getPersonas().subscribe({
      next: (data) => this.personas.set(data),
      error: (err) => console.error('Error cargando personas:', err)
    });

    this.streamService.checkHealth().then((h) => {
      if (h) this.health.set(h as HealthStatus);
    });

    this.refreshTickets();
  }

  refreshTickets(): void {
    this.ticketsService.getTickets(this.selectedPersona()).subscribe({
      next: (data) => this.tickets.set(data),
      error: (err) => console.error('Error cargando tickets:', err)
    });
  }

  onSelectAgent(agentId: string): void {
    if (this.selectedAgentId() === agentId) return;
    if (this.isStreaming()) {
      this.streamService.abortCurrentStream();
    }
    this.selectedAgentId.set(agentId);
    this.walkthrough.activeAgentId.set(agentId);
    this.eventStore.resetAll();
    this.eventStore.activeAgentId.set(agentId);
    this.controller.resetPlayback();
  }

  onSelectPersona(personaUsername: string): void {
    if (this.selectedPersona() === personaUsername) return;
    if (this.isStreaming()) {
      this.streamService.abortCurrentStream();
    }

    // Persistir mensajes del chat para la persona saliente
    const prevPersona = this.selectedPersona();
    this.messagesByPersona.update((prev) => ({
      ...prev,
      [prevPersona]: this.messages()
    }));

    // Cambiar persona activa
    this.selectedPersona.set(personaUsername);

    // Restaurar mensajes de la nueva persona activa
    const restored = this.messagesByPersona()[personaUsername] || [];
    this.messages.set(restored);

    // Reiniciar observabilidad e inspectores para aislamiento estricto
    this.eventStore.resetAll();
    this.controller.resetPlayback();
    this.refreshTickets();
  }

  onSelectTaskOption(payload: { decisionId: string; selectedValue: string }): void {
    if (this.isStreaming() || this.eventStore.v3State().hitlStatus === 'resuming_task') {
      return;
    }

    if (this.demoMode.isDemoMode()) {
      const userMsgId = `user-hitl-demo-${Date.now()}`;
      const agentMsgId = `agent-hitl-demo-${Date.now()}`;
      const userMsg: ChatMessage = {
        id: userMsgId,
        sender: 'user',
        persona: this.selectedPersona(),
        text: `[Decisión HITL]: Selección -> "${payload.selectedValue}"`,
        timestamp: new Date().toISOString()
      };
      const agentMsg: ChatMessage = {
        id: agentMsgId,
        sender: 'agent',
        text: `> **Modo Demo &bull; Simulación Estática**\n\nEn este modo estático, las decisiones Human-in-the-Loop son de observación pedagógica y no mutan el estado en un servidor backend. Para experimentar el ciclo completo HITL con reanudación en vivo, ejecuta AEP en modo local con FastAPI.`,
        timestamp: new Date().toISOString(),
        isLoading: false
      };
      this.messages.update((msgs) => [...msgs, userMsg, agentMsg]);
      return;
    }

    const persona = this.selectedPersona();
    const currentCid =
      this.activeConversationsByPersona()[persona] ||
      this.eventStore.getConfirmedConversationId() ||
      undefined;

    // 1. Marcar estado local de solicitud en tránsito (resuming_task)
    this.eventStore.markResumingTask(payload.decisionId);

    // 2. Reflejar acción humana en el Chat Panel
    const userMsgId = `user-hitl-${Date.now()}`;
    const agentMsgId = `agent-hitl-${Date.now()}`;
    const runId = `run-hitl-${Date.now()}`;

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      persona,
      text: `[Decisión HITL]: Selección confirmada -> "${payload.selectedValue}"`,
      timestamp: new Date().toISOString()
    };

    const agentPlaceholderMsg: ChatMessage = {
      id: agentMsgId,
      runId,
      sender: 'agent',
      text: 'Reanudando tarea con FastAPI...',
      timestamp: new Date().toISOString(),
      isLoading: true
    };

    this.messages.update((msgs) => [...msgs, userMsg, agentPlaceholderMsg]);
    this.controller.setMode('live');
    this.companion.startRun(
      runId,
      'v3',
      `Opción seleccionada: ${payload.selectedValue}`,
      persona
    );

    // 3. Despachar payload formal al runtime de FastAPI
    const streamPayload: ChatStreamPayload = {
      agent_version: 'v3',
      query: `Opción seleccionada: ${payload.selectedValue}`,
      user_persona: persona,
      conversation_id: currentCid,
      decision_id: payload.decisionId,
      selected_value: payload.selectedValue
    };

    this.streamService.streamChat(streamPayload, {
      onEvent: (event: StreamEvent) => {
        if (this.selectedPersona() !== persona) return;

        this.controller.onNewEvent(event);
        this.companion.appendEvent(runId, event);

        if (event.type === 'MEMORY_HYDRATED' || event.type === 'TURN_PERSISTED') {
          const confirmedCid = event.payload['conversation_id'];
          if (confirmedCid) {
            this.activeConversationsByPersona.update((prev) => ({
              ...prev,
              [persona]: confirmedCid
            }));
          }
        }

        if (event.type === 'FINAL_SYNTHESIS') {
          const content =
            event.payload['answer'] ||
            event.payload['content'] ||
            event.payload['message'] ||
            '';
          this.updateAgentMessageText(agentMsgId, content);
        } else if (event.type === 'ERROR' || event.type === 'RUN_FAILED') {
          const errDetail =
            event.payload['message'] ||
            event.payload['error_message'] ||
            'Error al reanudar tarea.';
          this.updateAgentMessageText(agentMsgId, `[Error de Reanudación]: ${errDetail}`);
          this.setAgentMessageLoading(agentMsgId, false);
          this.companion.failRun(runId, errDetail);
          this.eventStore.resumingTaskId.set(null);
        } else if (event.type === 'RUN_COMPLETED') {
          this.setAgentMessageLoading(agentMsgId, false);
          this.companion.completeRun(runId);
        }
      },
      onError: (error: Error) => {
        if (this.selectedPersona() !== persona) return;
        this.updateAgentMessageText(agentMsgId, `Error en comunicación SSE: ${error.message}`);
        this.setAgentMessageLoading(agentMsgId, false);
        this.companion.failRun(runId, error.message);
        this.eventStore.resumingTaskId.set(null);
      },
      onComplete: () => {
        if (this.selectedPersona() !== persona) return;
        this.setAgentMessageLoading(agentMsgId, false);
        this.companion.completeRun(runId);
        this.refreshTickets();
      }
    });
  }

  toggleDbDrawer(): void {
    this.isDbDrawerOpen.update((open) => !open);
    if (this.isDbDrawerOpen()) {
      this.refreshTickets();
    }
  }

  toggleGuideDrawer(): void {
    this.isGuideDrawerOpen.update((open) => !open);
  }

  startWalkthrough(): void {
    this.walkthrough.startTour(this.selectedAgentId());
  }

  toggleSimulator(): void {
    this.simulator.toggleSimulator();
  }

  onSplitterMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.isDragging = true;
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isDragging) return;
      const totalWidth = window.innerWidth;
      const newRatio = (moveEvent.clientX / totalWidth) * 100;
      const clamped = Math.max(30, Math.min(70, Math.round(newRatio)));
      this.chatRatio.set(clamped);
      sessionStorage.setItem('aep_split_ratio', String(clamped));
    };
    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  onSplitterTouchStart(e: TouchEvent): void {
    const onTouchMove = (moveEvent: TouchEvent) => {
      const touch = moveEvent.touches[0];
      if (!touch) return;
      const totalWidth = window.innerWidth;
      const newRatio = (touch.clientX / totalWidth) * 100;
      const clamped = Math.max(30, Math.min(70, Math.round(newRatio)));
      this.chatRatio.set(clamped);
      sessionStorage.setItem('aep_split_ratio', String(clamped));
    };
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  }

  resetSplitter(): void {
    this.chatRatio.set(50);
    sessionStorage.setItem('aep_split_ratio', '50');
  }

  onSplitterKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = Math.max(30, this.chatRatio() - 2);
      this.chatRatio.set(next);
      sessionStorage.setItem('aep_split_ratio', String(next));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(70, this.chatRatio() + 2);
      this.chatRatio.set(next);
      sessionStorage.setItem('aep_split_ratio', String(next));
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.resetSplitter();
    }
  }

  onSendMessage(query: string): void {
    if (this.demoMode.isDemoMode()) {
      const scenarios = this.demoAdapter.getAllScenarios();
      const match = scenarios.find(
        (s) =>
          s.suggestedPrompt.toLowerCase() === query.toLowerCase() ||
          s.title.toLowerCase() === query.toLowerCase() ||
          s.id.toLowerCase() === query.toLowerCase()
      );
      if (match) {
        this.onRunDemoScenario(match.id);
        return;
      }

      // Consulta libre en modo Demo: Explicación pedagógica sin inventar alucinaciones de LLM
      const userMsgId = `user-demo-query-${Date.now()}`;
      const agentMsgId = `agent-demo-query-${Date.now()}`;

      const userMsg: ChatMessage = {
        id: userMsgId,
        sender: 'user',
        persona: this.selectedPersona(),
        text: query,
        timestamp: new Date().toISOString()
      };

      const explanation = `> **Modo Demo &bull; Sin Servidor Backend Activo**\n\n` +
        `Has enviado: *"${query}"*\n\n` +
        `En este modo estático para GitHub Pages, no hay conexión de red con el runtime local (\`http://localhost:8000\`) para evitar inventar respuestas sintéticas o alucinaciones fuera de las trazas verificadas.\n\n` +
        `Para explorar el comportamiento determinista del runtime de **${this.selectedAgentId().toUpperCase()}**, selecciona uno de los **escenarios pedagógicos verificados** disponibles en el catálogo superior o en los botones inferiores.`;

      const agentMsg: ChatMessage = {
        id: agentMsgId,
        sender: 'agent',
        text: explanation,
        timestamp: new Date().toISOString(),
        isLoading: false
      };

      this.messages.update((msgs) => [...msgs, userMsg, agentMsg]);
      return;
    }

    const userMsgId = `user-${Date.now()}`;
    const agentMsgId = `agent-${Date.now()}`;
    const runId = `run-${Date.now()}`;

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      persona: this.selectedPersona(),
      text: query,
      timestamp: new Date().toISOString()
    };

    const agentPlaceholderMsg: ChatMessage = {
      id: agentMsgId,
      runId,
      sender: 'agent',
      text: '',
      timestamp: new Date().toISOString(),
      isLoading: true
    };

    this.messages.update((msgs) => [...msgs, userMsg, agentPlaceholderMsg]);
    this.eventStore.startNewRun(this.selectedAgentId());
    this.controller.setMode('live');
    this.companion.startRun(
      runId,
      this.selectedAgentId(),
      query,
      this.selectedPersona()
    );

    const persona = this.selectedPersona();
    const currentCid = this.activeConversationsByPersona()[persona];

    const payload: ChatStreamPayload = {
      agent_version: this.selectedAgentId(),
      query,
      user_persona: persona,
      conversation_id: currentCid || undefined
    };

    this.streamService.streamChat(payload, {
      onEvent: (event: StreamEvent) => {
        if (this.selectedPersona() !== persona) return;

        this.controller.onNewEvent(event);
        this.companion.appendEvent(runId, event);

        if (event.type === 'MEMORY_HYDRATED' || event.type === 'TURN_PERSISTED') {
          const confirmedCid = event.payload['conversation_id'];
          if (confirmedCid) {
            this.activeConversationsByPersona.update((prev) => ({
              ...prev,
              [persona]: confirmedCid
            }));
          }
        }

        if (event.type === 'AGENT_NOT_READY' || event.type === 'FINAL_SYNTHESIS' || event.type === 'DIRECT_ANSWER') {
          const content = event.payload['answer'] || event.payload['content'] || event.payload['message'] || event.payload['synthesis'] || event.payload['response_preview'] || '';
          this.updateAgentMessageText(agentMsgId, content);
        } else if (event.type === 'ERROR' || event.type === 'RUN_FAILED') {
          const errDetail = event.payload['message'] || event.payload['error_message'] || 'Ocurrió un error en la ejecución.';
          this.updateAgentMessageText(agentMsgId, `[Error]: ${errDetail}`);
          this.setAgentMessageLoading(agentMsgId, false);
          this.companion.failRun(runId, errDetail);
        } else if (event.type === 'LOOP_LIMIT_EXCEEDED' || event.type === 'LOOP_REPETITION_DETECTED' || event.type === 'LOOP_TIMEOUT_EXCEEDED') {
          const msg = event.payload['message'] || 'Condición de parada alcanzada.';
          this.updateAgentMessageText(agentMsgId, `[Límite del Agent Loop]: ${msg}`);
          this.companion.completeRun(runId);
        } else if (event.type === 'RUN_COMPLETED') {
          this.setAgentMessageLoading(agentMsgId, false);
          this.companion.completeRun(runId);
        }
      },
      onError: (error: Error) => {
        const target = this.messages().find((m) => m.id === agentMsgId);
        if (!target || !target.text.trim()) {
          this.updateAgentMessageText(agentMsgId, `Error en comunicación SSE: ${error.message}`);
        }
        this.setAgentMessageLoading(agentMsgId, false);
        this.companion.failRun(runId, error.message);
      },
      onComplete: () => {
        this.setAgentMessageLoading(agentMsgId, false);
        const target = this.messages().find((m) => m.id === agentMsgId);
        if (target && !target.text.trim()) {
          this.updateAgentMessageText(agentMsgId, 'Respuesta completada sin texto.');
        }
        this.companion.completeRun(runId);
        this.refreshTickets();
      }
    });
  }

  onRunDemoScenario(scenarioId: string): void {
    const scenario = this.demoAdapter.getScenarioById(scenarioId);
    if (!scenario) return;

    if (this.isStreaming()) {
      this.onStopStream();
    }

    if (this.selectedAgentId() !== scenario.version) {
      this.onSelectAgent(scenario.version);
    }

    const userMsgId = `user-demo-${Date.now()}`;
    const agentMsgId = `agent-demo-${Date.now()}`;
    const runId = `run-demo-${Date.now()}`;

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      persona: scenario.persona || this.selectedPersona(),
      text: scenario.suggestedPrompt,
      timestamp: new Date().toISOString()
    };

    const agentPlaceholderMsg: ChatMessage = {
      id: agentMsgId,
      runId,
      sender: 'agent',
      text: '',
      timestamp: new Date().toISOString(),
      isLoading: true
    };

    this.messages.update((msgs) => [...msgs, userMsg, agentPlaceholderMsg]);
    this.eventStore.startNewRun(scenario.version);
    this.controller.setMode('live');
    this.companion.startRun(
      runId,
      scenario.version,
      scenario.suggestedPrompt,
      scenario.persona || this.selectedPersona()
    );

    this.demoAdapter.streamScenario(scenario, {
      onEvent: (event: StreamEvent) => {
        this.controller.onNewEvent(event);
        this.companion.appendEvent(runId, event);

        if (event.type === 'FINAL_SYNTHESIS' || event.type === 'DIRECT_ANSWER') {
          const content =
            event.payload['answer'] ||
            event.payload['content'] ||
            event.payload['message'] ||
            event.payload['synthesis'] ||
            scenario.finalResponse;
          this.updateAgentMessageText(agentMsgId, content);
        } else if (event.type === 'RUN_COMPLETED') {
          this.setAgentMessageLoading(agentMsgId, false);
          this.companion.completeRun(runId);
          if (scenario.finalResponse) {
            this.updateAgentMessageText(agentMsgId, scenario.finalResponse);
          }
        }
      },
      onError: (error: Error) => {
        this.updateAgentMessageText(agentMsgId, `[Error Demo]: ${error.message}`);
        this.setAgentMessageLoading(agentMsgId, false);
        this.companion.failRun(runId, error.message);
      },
      onComplete: () => {
        this.setAgentMessageLoading(agentMsgId, false);
        if (scenario.finalResponse) {
          this.updateAgentMessageText(agentMsgId, scenario.finalResponse);
        }
        this.companion.completeRun(runId);
      }
    });
  }

  onStopStream(): void {
    if (this.demoMode.isDemoMode()) {
      this.demoAdapter.cancelStream();
    }
    this.streamService.abortCurrentStream();
    this.eventStore.markCancelled();
    const lastMsg = this.messages().at(-1);
    if (lastMsg && lastMsg.sender === 'agent' && lastMsg.isLoading) {
      this.updateAgentMessageText(lastMsg.id, '[Ejecución cancelada por el usuario]');
      this.setAgentMessageLoading(lastMsg.id, false);
      if (lastMsg.runId) {
        this.companion.cancelRun(lastMsg.runId);
      }
    }
  }

  onOpen3DSimulatorFromCompanion(runId: string): void {
    this.companion.open3DSimulator(runId);
  }

  onOpenDocumentationFromCompanion(docFile: string): void {
    this.selectedGuideDoc.set(docFile);
    this.isGuideDrawerOpen.set(true);
  }

  private updateAgentMessageText(msgId: string, text: string): void {
    this.messages.update((msgs) =>
      msgs.map((m) => (m.id === msgId ? { ...m, text: text || m.text } : m))
    );
  }

  private setAgentMessageLoading(msgId: string, isLoading: boolean): void {
    this.messages.update((msgs) =>
      msgs.map((m) => (m.id === msgId ? { ...m, isLoading } : m))
    );
  }
}
