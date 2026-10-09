import { Component, ElementRef, ViewChild, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMessage } from '../../models/agent.models';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  template: `
    <section class="chat-container">
      <div class="chat-messages" #scrollContainer>
        @if (messages().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">&#x1F916;</div>
            <h3>Agent Engineering Playground &bull; Turno de Conversación</h3>
            <p>Selecciona una consulta o escribe un requerimiento sobre tickets para observar la ejecución.</p>
            <div class="quick-prompts">
              @for (prompt of quickPrompts; track prompt) {
                <button class="chip-btn" (click)="selectQuickPrompt(prompt)">
                  {{ prompt }}
                </button>
              }
            </div>
          </div>
        } @else {
          @for (msg of messages(); track msg.id) {
            <div class="message-row" [class.user-row]="msg.sender === 'user'" [class.agent-row]="msg.sender === 'agent'" [class.system-row]="msg.sender === 'system'">
              <div class="avatar">
                @if (msg.sender === 'user') {
                  &#x1F464;
                } @else if (msg.sender === 'agent') {
                  &#x1F9E0;
                } @else {
                  &#x2699;
                }
              </div>
              <div class="message-bubble">
                <div class="message-meta">
                  <span class="sender-name">
                    {{ msg.sender === 'user' ? (msg.persona || 'Usuario') : msg.sender === 'agent' ? 'Agente de Soporte' : 'Sistema' }}
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
                    <div class="loading-dots">
                      <span></span><span></span><span></span>
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
          ></textarea>

          <div class="actions-row">
            <div class="chips-row">
              <button 
                type="button" 
                class="mini-chip" 
                (click)="selectQuickPrompt('Consulta el ticket TICK-1001 y dime su estado')"
              >
                TICK-1001
              </button>
              <button 
                type="button" 
                class="mini-chip" 
                (click)="selectQuickPrompt('Identifica los tickets vencidos según SLA')"
              >
                SLA Vencidos
              </button>
              <button 
                type="button" 
                class="mini-chip" 
                (click)="selectQuickPrompt('¿Cuál es el procedimiento general para atender un incidente?')"
              >
                Conceptual (Sin Tools)
              </button>
            </div>

            <div class="button-group">
              @if (isStreaming()) {
                <button type="button" class="btn-stop" (click)="stopStream.emit()">
                  <span class="stop-icon">&#x25A0;</span> Detener
                </button>
              } @else {
                <button 
                  id="send-button"
                  type="button" 
                  class="btn-send" 
                  [disabled]="!currentInput().trim()"
                  (click)="handleSend()"
                >
                  <span>Enviar</span> &rarr;
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .chat-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0b1329;
      color: #f1f5f9;
      overflow: hidden;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .empty-state {
      margin: auto;
      text-align: center;
      max-width: 500px;
      padding: 2rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px dashed #334155;
      border-radius: 12px;
    }
    .empty-icon {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    .empty-state h3 {
      font-size: 1.15rem;
      color: #38bdf8;
      margin-bottom: 0.5rem;
    }
    .empty-state p {
      font-size: 0.88rem;
      color: #94a3b8;
      margin-bottom: 1.5rem;
      line-height: 1.4;
    }
    .quick-prompts {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .chip-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-size: 0.82rem;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
    }
    .chip-btn:hover {
      background: #334155;
      border-color: #38bdf8;
      color: #38bdf8;
      transform: translateX(4px);
    }
    .message-row {
      display: flex;
      gap: 0.75rem;
      max-width: 85%;
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
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;
      border: 1px solid #334155;
    }
    .user-row .avatar {
      background: #0284c7;
      border-color: #38bdf8;
    }
    .agent-row .avatar {
      background: #059669;
      border-color: #34d399;
    }
    .message-bubble {
      background: #1e293b;
      padding: 0.85rem 1.15rem;
      border-radius: 12px;
      border: 1px solid #334155;
    }
    .user-row .message-bubble {
      background: #0369a1;
      border-color: #0284c7;
      color: #ffffff;
      border-bottom-right-radius: 2px;
    }
    .agent-row .message-bubble {
      background: #0f172a;
      border-color: #1e293b;
      border-bottom-left-radius: 2px;
    }
    .system-row .message-bubble {
      background: rgba(245, 158, 11, 0.1);
      border-color: rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      text-align: center;
    }
    .message-meta {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.72rem;
      color: #94a3b8;
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
      color: #e2e8f0;
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
      color: #f1f5f9;
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
      min-width: 320px;
      border-collapse: collapse;
      margin: 0.75rem 0;
      font-size: 0.82rem;
      display: block;
      overflow-x: auto;
      max-width: 100%;
      border-radius: 6px;
      border: 1px solid #334155;
      -webkit-overflow-scrolling: touch;
    }
    .markdown-body th, .markdown-body td {
      padding: 0.5rem 0.75rem;
      border: 1px solid #334155;
      text-align: left;
      white-space: nowrap;
      word-break: normal;
    }
    .markdown-body th {
      background: #1e293b;
      color: #38bdf8;
      font-weight: 700;
    }
    .markdown-body tr:nth-child(even) {
      background: rgba(30, 41, 59, 0.4);
    }
    .markdown-body tr:hover {
      background: rgba(56, 189, 248, 0.08);
    }
    .markdown-body code {
      background: #090d16;
      color: #38bdf8;
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.84em;
    }
    .markdown-body pre {
      background: #090d16;
      padding: 0.75rem;
      border-radius: 6px;
      overflow-x: auto;
      border: 1px solid #1e293b;
      margin: 0.65rem 0;
    }
    .markdown-body pre code {
      background: transparent;
      padding: 0;
      color: #cbd5e1;
      font-size: 0.82rem;
    }
    .markdown-body a {
      color: #38bdf8;
      text-decoration: underline;
    }
    .markdown-body a:hover {
      color: #7dd3fc;
    }
    .markdown-body blockquote {
      border-left: 3px solid #38bdf8;
      margin: 0.6rem 0;
      padding: 0.3rem 0 0.3rem 0.85rem;
      color: #94a3b8;
      background: rgba(56, 189, 248, 0.05);
      border-radius: 0 4px 4px 0;
    }
    .loading-dots {
      display: flex;
      gap: 4px;
      margin-top: 0.5rem;
    }
    .loading-dots span {
      width: 6px;
      height: 6px;
      background: #38bdf8;
      border-radius: 50%;
      animation: bounce 1.2s infinite;
    }
    .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
      40% { transform: scale(1); opacity: 1; }
    }
    .chat-footer {
      padding: 1rem 1.5rem;
      background: #0f172a;
      border-top: 1px solid #1e293b;
    }
    .input-card {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 0.75rem;
    }
    .chat-input {
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 0.92rem;
      resize: none;
      outline: none;
      font-family: inherit;
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
      background: #0f172a;
      border: 1px solid #334155;
      color: #94a3b8;
      font-size: 0.72rem;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .mini-chip:hover {
      color: #38bdf8;
      border-color: #38bdf8;
    }
    .btn-send {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #ffffff;
      border: none;
      padding: 0.5rem 1.2rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s ease;
    }
    .btn-send:hover:not(:disabled) {
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
    }
    .btn-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-stop {
      background: #ef4444;
      color: #ffffff;
      border: none;
      padding: 0.5rem 1.2rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .stop-icon {
      font-size: 0.75rem;
    }
  `]
})
export class ChatPanelComponent {
  readonly messages = input<ChatMessage[]>([]);
  readonly isStreaming = input<boolean>(false);
  readonly sendMessage = output<string>();
  readonly stopStream = output<void>();

  readonly currentInput = signal<string>('');

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  constructor() {
    effect(() => {
      this.messages();
      setTimeout(() => {
        if (this.scrollContainer?.nativeElement) {
          this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
        }
      }, 50);
    });
  }

  readonly quickPrompts = [
    'Consulta el ticket TICK-1001 y dime su estado',
    'Identifica los tickets vencidos según SLA y ordénalos',
    '¿Cuál es el procedimiento general para resolver incidentes técnicos?',
  ];

  selectQuickPrompt(promptText: string): void {
    this.currentInput.set(promptText);
  }

  handleSend(): void {
    const text = this.currentInput().trim();
    if (text && !this.isStreaming()) {
      this.sendMessage.emit(text);
      this.currentInput.set('');
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleSend();
    }
  }
}
