import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { ChatPanelComponent } from './components/chat-panel/chat-panel.component';
import { RuntimeInspectorComponent } from './components/runtime-inspector/runtime-inspector.component';
import { TicketsDrawerComponent } from './components/tickets-drawer/tickets-drawer.component';
import { AgentStreamService } from './services/agent-stream.service';
import { TicketsService } from './services/tickets.service';
import { EventStoreService } from './services/event-store.service';
import { PresentationControllerService } from './services/presentation-controller.service';
import { AgentMeta, PersonaInfo, StreamEvent, ChatMessage, TicketSummary } from './models/agent.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    ChatPanelComponent,
    RuntimeInspectorComponent,
    TicketsDrawerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly streamService = inject(AgentStreamService);
  private readonly ticketsService = inject(TicketsService);
  private readonly eventStore = inject(EventStoreService);
  private readonly controller = inject(PresentationControllerService);

  readonly agents = signal<AgentMeta[]>([]);
  readonly personas = signal<PersonaInfo[]>([]);
  readonly selectedAgentId = signal<string>('v1');
  readonly selectedPersona = signal<string>('usr_carlos');
  readonly isDbDrawerOpen = signal<boolean>(false);
  readonly activeMobileTab = signal<'chat' | 'inspector'>('chat');

  readonly messages = signal<ChatMessage[]>([]);
  readonly currentRunEvents = this.eventStore.events;
  readonly tickets = signal<TicketSummary[]>([]);

  readonly isStreaming = this.streamService.isStreaming;

  ngOnInit(): void {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.ticketsService.getAgents().subscribe({
      next: (data) => this.agents.set(data),
      error: (err) => console.error('Error cargando agentes:', err)
    });

    this.ticketsService.getPersonas().subscribe({
      next: (data) => this.personas.set(data),
      error: (err) => console.error('Error cargando personas:', err)
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
    this.selectedAgentId.set(agentId);
  }

  onSelectPersona(personaUsername: string): void {
    this.selectedPersona.set(personaUsername);
    this.refreshTickets();
  }

  toggleDbDrawer(): void {
    this.isDbDrawerOpen.update((open) => !open);
    if (this.isDbDrawerOpen()) {
      this.refreshTickets();
    }
  }

  onSendMessage(query: string): void {
    const userMsgId = `user-${Date.now()}`;
    const agentMsgId = `agent-${Date.now()}`;

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      persona: this.selectedPersona(),
      text: query,
      timestamp: new Date().toISOString()
    };

    const agentPlaceholderMsg: ChatMessage = {
      id: agentMsgId,
      sender: 'agent',
      text: '',
      timestamp: new Date().toISOString(),
      isLoading: true
    };

    this.messages.update((msgs) => [...msgs, userMsg, agentPlaceholderMsg]);
    this.eventStore.startNewRun(this.selectedAgentId());
    this.controller.setMode('live');

    const payload = {
      agent_version: this.selectedAgentId(),
      query,
      user_persona: this.selectedPersona()
    };

    this.streamService.streamChat(payload, {
      onEvent: (event: StreamEvent) => {
        this.controller.onNewEvent(event);

        if (event.type === 'AGENT_NOT_READY' || event.type === 'FINAL_SYNTHESIS' || event.type === 'DIRECT_ANSWER') {
          const content = event.payload['answer'] || event.payload['content'] || event.payload['message'] || event.payload['synthesis'] || event.payload['response_preview'] || '';
          this.updateAgentMessageText(agentMsgId, content);
        } else if (event.type === 'ERROR') {
          const errDetail = event.payload['message'] || 'Ocurrió un error en la ejecución.';
          this.updateAgentMessageText(agentMsgId, `[Error]: ${errDetail}`);
          this.setAgentMessageLoading(agentMsgId, false);
        } else if (event.type === 'RUN_COMPLETED') {
          this.setAgentMessageLoading(agentMsgId, false);
        }
      },
      onError: (error: Error) => {
        const target = this.messages().find((m) => m.id === agentMsgId);
        if (!target || !target.text.trim()) {
          this.updateAgentMessageText(agentMsgId, `Error en comunicación SSE: ${error.message}`);
        }
        this.setAgentMessageLoading(agentMsgId, false);
      },
      onComplete: () => {
        this.setAgentMessageLoading(agentMsgId, false);
        const target = this.messages().find((m) => m.id === agentMsgId);
        if (target && !target.text.trim()) {
          this.updateAgentMessageText(agentMsgId, 'Respuesta completada sin texto.');
        }
        this.refreshTickets();
      }
    });
  }

  onStopStream(): void {
    this.streamService.abortCurrentStream();
    this.eventStore.markCancelled();
    const lastMsg = this.messages().at(-1);
    if (lastMsg && lastMsg.sender === 'agent' && lastMsg.isLoading) {
      this.updateAgentMessageText(lastMsg.id, '[Ejecución cancelada por el usuario]');
      this.setAgentMessageLoading(lastMsg.id, false);
    }
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
