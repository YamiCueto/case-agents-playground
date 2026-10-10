import { Component, ElementRef, ViewChild, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMessage } from '../../models/agent.models';
import { AgentJourneyStep } from '../../models/journey.models';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

interface QuickPromptCard {
  query: string;
  badge: string;
  typeBadge: string;
  description: string;
}

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  template: `
    <section class="chat-container">
      <div
        class="chat-messages"
        #scrollContainer
        tabindex="0"
        role="region"
        aria-label="Historial de conversación"
        (scroll)="onScroll()"
      >
        @if (messages().length === 0) {
          <div class="welcome-hero">
            <div class="hero-badge">
              <svg class="hero-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3"></path>
                <path d="M4.93 4.93l2.12 2.12m9.9 9.9l2.12 2.12M4.93 19.07l2.12-2.12m9.9-9.9l2.12-2.12"></path>
              </svg>
            </div>
            <h2 class="hero-title">Agent Engineering Playground</h2>
            <p class="hero-subtitle">
              Laboratorio de observabilidad para inspección determinista de flujos agénticos, llamadas a herramientas e inferencia local paso a paso.
            </p>

            <div class="prompt-cards-grid">
              @for (card of promptCards; track card.query) {
                <button 
                  type="button" 
                  class="prompt-card" 
                  (click)="selectQuickPrompt(card.query)"
                  [attr.aria-label]="card.badge + ': ' + card.query"
                >
                  <div class="card-header">
                    <span class="card-badge" [class.tool-badge]="card.typeBadge === 'tool'" [class.conceptual-badge]="card.typeBadge === 'conceptual'">
                      {{ card.badge }}
                    </span>
                    <span class="card-arrow">&rarr;</span>
                  </div>
                  <h3 class="card-query">{{ card.query }}</h3>
                  <p class="card-desc">{{ card.description }}</p>
                </button>
              }
            </div>
          </div>
        } @else {
          @for (msg of messages(); track msg.id) {
            <div class="message-row" [class.user-row]="msg.sender === 'user'" [class.agent-row]="msg.sender === 'agent'" [class.system-row]="msg.sender === 'system'">
              <div class="avatar" [attr.aria-label]="msg.sender === 'user' ? 'Usuario' : 'Agente'">
                @if (msg.sender === 'user') {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                } @else if (msg.sender === 'agent') {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                } @else {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                }
              </div>

              <div class="message-bubble">
                <div class="message-meta">
                  <span class="sender-name">
                    {{ msg.sender === 'user' ? (msg.persona || 'Operador') : msg.sender === 'agent' ? 'Agente de Soporte' : 'Sistema' }}
                  </span>
                  <span class="msg-time">{{ msg.timestamp | date:'shortTime' }}</span>
                </div>

                <div class="message-body">
                  @if (msg.sender === 'user') {
                    <p class="user-text">{{ msg.text }}</p>
                  } @else {
                    <div class="markdown-body" [innerHTML]="msg.text | markdown"></div>
                  }

                  @if (msg.isLoading) {
                    <div class="runtime-progress-badge" role="status" aria-live="polite">
                      <span class="pulse-indicator"></span>
                      <span class="phase-label">{{ getPhaseLabel(activeStep()) }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        }
      </div>

      <div class="chat-footer">
        <div class="input-card">
          <textarea
            id="chat-input"
            class="chat-input"
            rows="2"
            placeholder="Escribe tu consulta para el agente... (Enter para enviar, Shift+Enter para salto de línea)"
            [ngModel]="currentInput()"
            (ngModelChange)="currentInput.set($event)"
            (keydown)="onKeyDown($event)"
            [disabled]="isStreaming()"
            aria-label="Entrada de consulta para el agente"
          ></textarea>

          <div class="actions-row">
            <div class="chips-row">
              <button 
                type="button" 
                class="mini-chip" 
                (click)="selectQuickPrompt('Consulta el ticket TICK-1001 y dime su estado')"
                title="Consulta directa con Tool Calling get_ticket"
              >
                TICK-1001
              </button>
              <button 
                type="button" 
                class="mini-chip" 
                (click)="selectQuickPrompt('Identifica los tickets vencidos según SLA')"
                title="Filtro determinista de tickets con SLA vencido"
              >
                SLA Vencidos
              </button>
              <button 
                type="button" 
                class="mini-chip" 
                (click)="selectQuickPrompt('¿Cuál es el procedimiento general para atender un incidente?')"
                title="Consulta conceptual sin llamada a base de datos"
              >
                Conceptual (Sin Tools)
              </button>
            </div>

            <div class="button-group">
              @if (isStreaming()) {
                <button type="button" class="btn-stop" (click)="stopStream.emit()" aria-label="Detener ejecución actual">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                  </svg>
                  <span>Detener</span>
                </button>
              } @else {
                <button 
                  id="send-button"
                  type="button" 
                  class="btn-send" 
                  [disabled]="!currentInput().trim()"
                  (click)="handleSend()"
                  aria-label="Enviar consulta al agente"
                >
                  <span>Enviar</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      min-width: 0;
      width: 100%;
    }
    .chat-container {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      min-width: 0;
      background: var(--bg-surface);
      color: var(--text-primary);
      overflow: hidden;
    }
    .chat-messages {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.15rem;
    }
    .chat-messages > * {
      flex-shrink: 0;
    }
    .welcome-hero {
      margin: auto;
      max-width: 620px;
      padding: 2rem 1.5rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .hero-badge {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      background: var(--accent-cyan-bg);
      border: 1px solid rgba(56, 189, 248, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-cyan);
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.15);
    }
    .hero-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
      letter-spacing: -0.3px;
    }
    .hero-subtitle {
      font-size: 0.86rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0 0 1rem 0;
      max-width: 520px;
    }
    .prompt-cards-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
    }
    .prompt-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.85rem 1.1rem;
      text-align: left;
      cursor: pointer;
      transition: var(--transition-smooth);
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      color: var(--text-primary);
    }
    .prompt-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
      transform: translateY(-2px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-badge {
      font-size: 0.66rem;
      font-family: var(--font-mono);
      font-weight: 700;
      letter-spacing: 0.4px;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-sm);
    }
    .card-badge.tool-badge {
      background: var(--accent-emerald-bg);
      color: var(--accent-emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .card-badge.conceptual-badge {
      background: var(--accent-cyan-bg);
      color: var(--accent-cyan);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .card-arrow {
      color: var(--text-muted);
      font-size: 0.85rem;
      transition: var(--transition-fast);
    }
    .prompt-card:hover .card-arrow {
      color: var(--accent-cyan);
      transform: translateX(3px);
    }
    .card-query {
      font-size: 0.88rem;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary);
    }
    .card-desc {
      font-size: 0.76rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.4;
    }
    .message-row {
      display: flex;
      gap: 0.75rem;
      max-width: 88%;
    }
    .user-row {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
    .agent-row {
      align-self: flex-start;
    }
    .system-row {
      align-self: center;
      max-width: 90%;
    }
    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--bg-panel);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
    }
    .user-row .avatar {
      background: #0284c7;
      border-color: #38bdf8;
      color: #ffffff;
    }
    .agent-row .avatar {
      background: #0f172a;
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }
    .message-bubble {
      padding: 0.85rem 1.15rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-subtle);
      max-width: 100%;
    }
    .user-row .message-bubble {
      background: #0369a1;
      border-color: #0284c7;
      color: #ffffff;
      border-bottom-right-radius: 2px;
    }
    .agent-row .message-bubble {
      background: var(--bg-panel);
      border-color: var(--border-default);
      border-bottom-left-radius: 2px;
    }
    .system-row .message-bubble {
      background: var(--accent-amber-bg);
      border-color: rgba(245, 158, 11, 0.3);
      color: var(--accent-amber);
      text-align: center;
    }
    .message-meta {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }
    .user-row .message-meta {
      color: #bae6fd;
    }
    .sender-name {
      font-weight: 600;
    }
    .user-text {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .markdown-body {
      font-size: 0.9rem;
      line-height: 1.55;
      color: var(--text-primary);
      word-break: break-word;
    }
    .markdown-body p {
      margin: 0 0 0.65rem 0;
    }
    .markdown-body p:last-child {
      margin-bottom: 0;
    }
    .markdown-body strong {
      color: #ffffff;
      font-weight: 700;
    }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
      color: var(--text-primary);
      margin: 0.85rem 0 0.4rem 0;
      font-weight: 700;
    }
    .markdown-body h1 { font-size: 1.15rem; }
    .markdown-body h2 { font-size: 1.05rem; }
    .markdown-body h3 { font-size: 0.95rem; }
    .markdown-body h4 { font-size: 0.9rem; }
    .markdown-body ul, .markdown-body ol {
      margin: 0.4rem 0 0.75rem 1.4rem;
      padding: 0;
    }
    .markdown-body li {
      margin-bottom: 0.25rem;
    }
    .markdown-body table {
      width: 100%;
      min-width: 300px;
      border-collapse: collapse;
      margin: 0.75rem 0;
      font-size: 0.82rem;
      display: block;
      overflow-x: auto;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-default);
    }
    .markdown-body th, .markdown-body td {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border-subtle);
      text-align: left;
    }
    .markdown-body th {
      background: var(--bg-card);
      color: var(--accent-cyan);
      font-weight: 700;
    }
    .markdown-body tr:nth-child(even) {
      background: rgba(30, 41, 59, 0.4);
    }
    .markdown-body code {
      background: #090d16;
      color: var(--accent-cyan);
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.84em;
    }
    .markdown-body pre {
      background: #090d16;
      padding: 0.75rem;
      border-radius: var(--radius-sm);
      overflow-x: auto;
      border: 1px solid var(--border-subtle);
      margin: 0.65rem 0;
    }
    .markdown-body pre code {
      background: transparent;
      padding: 0;
      color: #cbd5e1;
      font-size: 0.82rem;
    }
    .markdown-body blockquote {
      border-left: 3px solid var(--accent-cyan);
      margin: 0.6rem 0;
      padding: 0.3rem 0 0.3rem 0.85rem;
      color: var(--text-secondary);
      background: var(--accent-cyan-bg);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }
    .runtime-progress-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.65rem;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 0.35rem 0.75rem;
      border-radius: 20px;
    }
    .pulse-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 8px var(--accent-cyan);
      animation: pulseDot 1s infinite alternate;
    }
    @keyframes pulseDot {
      from { transform: scale(0.85); opacity: 0.6; }
      to { transform: scale(1.15); opacity: 1; }
    }
    .phase-label {
      font-size: 0.76rem;
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      font-weight: 600;
    }
    .chat-footer {
      flex-shrink: 0;
      padding: 0.85rem 1.25rem;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-subtle);
    }
    .input-card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      background: var(--bg-panel);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 0.65rem 0.85rem;
    }
    .chat-input {
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 0.88rem;
      line-height: 1.45;
      resize: none;
      outline: none;
      width: 100%;
    }
    .chat-input::placeholder {
      color: var(--text-muted);
    }
    .chat-input:disabled {
      opacity: 0.6;
    }
    .actions-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .chips-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .mini-chip {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: 0.72rem;
      padding: 0.25rem 0.55rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .mini-chip:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }
    .button-group {
      display: flex;
      align-items: center;
      margin-left: auto;
    }
    .btn-send {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--accent-emerald);
      color: #022c22;
      border: none;
      padding: 0.45rem 0.95rem;
      border-radius: var(--radius-sm);
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-send:hover:not(:disabled) {
      background: var(--accent-emerald-hover);
    }
    .btn-send:disabled {
      background: var(--border-default);
      color: var(--text-muted);
      cursor: not-allowed;
    }
    .btn-stop {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--accent-crimson);
      color: #ffffff;
      border: none;
      padding: 0.45rem 0.95rem;
      border-radius: var(--radius-sm);
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-stop:hover {
      background: #dc2626;
    }
  `]
})
export class ChatPanelComponent {
  readonly messages = input<ChatMessage[]>([]);
  readonly isStreaming = input<boolean>(false);
  readonly activeStep = input<AgentJourneyStep | null>(null);

  readonly sendMessage = output<string>();
  readonly stopStream = output<void>();

  private static readonly NEAR_BOTTOM_PX = 80;

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  private stickToBottom = true;
  private lastMessageCount = 0;

  readonly currentInput = signal<string>('');

  readonly promptCards: QuickPromptCard[] = [
    {
      query: 'Consulta el ticket TICK-1001 y dime su estado',
      badge: 'TOOL CALLING • MySQL',
      typeBadge: 'tool',
      description: 'Invoca la herramienta get_ticket para leer el estado del ticket en base de datos.'
    },
    {
      query: 'Identifica los tickets vencidos según SLA',
      badge: 'FILTRO SLA • DATABASE',
      typeBadge: 'tool',
      description: 'Evalúa tickets con fecha límite superada y estado activo.'
    },
    {
      query: '¿Cuál es el procedimiento general para atender un incidente?',
      badge: 'CONCEPTUAL • RESPUESTA DIRECTA',
      typeBadge: 'conceptual',
      description: 'Respuesta directa del modelo local sin invocar base de datos.'
    }
  ];

  constructor() {
    effect(() => {
      const msgs = this.messages();
      const startedNewConversation = msgs.length < this.lastMessageCount;
      this.lastMessageCount = msgs.length;

      if (startedNewConversation) {
        this.stickToBottom = true;
      }
      if (this.stickToBottom) {
        requestAnimationFrame(() => this.scrollToBottom());
      }
    });
  }

  onScroll(): void {
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.stickToBottom = distanceFromBottom <= ChatPanelComponent.NEAR_BOTTOM_PX;
  }

  getPhaseLabel(step: AgentJourneyStep | null): string {
    if (!step) return 'Procesando flujo agéntico...';
    switch (step.hopNumber) {
      case 1: return 'Capturando solicitud y persona...';
      case 2: return 'Inferencia 1: Consultando modelo local...';
      case 3: return 'Evaluando propuesta de llamada a herramienta...';
      case 4: return 'Validando argumentos con Pydantic...';
      case 5: return 'Ejecutando tool sobre base de datos MySQL...';
      case 6: return 'Inyectando observación en contexto...';
      case 7: return 'Inferencia 2: Sintetizando respuesta final grounded...';
      default: return 'Ejecutando runtime...';
    }
  }

  handleSend(): void {
    const text = this.currentInput().trim();
    if (!text || this.isStreaming()) return;
    this.stickToBottom = true;
    this.sendMessage.emit(text);
    this.currentInput.set('');
  }

  selectQuickPrompt(promptText: string): void {
    if (this.isStreaming()) return;
    this.currentInput.set(promptText);
    this.handleSend();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleSend();
    }
  }

  private scrollToBottom(): void {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
