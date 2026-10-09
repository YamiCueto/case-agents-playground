import { Injectable, signal } from '@angular/core';
import { StreamEvent } from '../models/agent.models';

export interface StreamCallbacks {
  onEvent: (event: StreamEvent) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class AgentStreamService {
  private activeAbortController: AbortController | null = null;
  readonly isStreaming = signal<boolean>(false);
  readonly currentStreamError = signal<string | null>(null);

  async streamChat(
    payload: { agent_version: string; query: string; user_persona: string },
    callbacks: StreamCallbacks,
    apiBaseUrl: string = 'http://localhost:8000'
  ): Promise<void> {
    this.abortCurrentStream();

    this.activeAbortController = new AbortController();
    this.isStreaming.set(true);
    this.currentStreamError.set(null);

    const signal = this.activeAbortController.signal;

    try {
      const response = await fetch(`${apiBaseUrl}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) {
        throw new Error(`Error en servidor SSE: HTTP ${response.status} (${response.statusText})`);
      }

      if (!response.body) {
        throw new Error('La respuesta HTTP no contiene un flujo de datos legible (ReadableStream vacío).');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const rawJson = trimmed.substring(5).trim();
            if (rawJson) {
              try {
                const parsedEvent: StreamEvent = JSON.parse(rawJson);
                callbacks.onEvent(parsedEvent);
              } catch (parseErr) {
                console.warn('Error parseando fragmento SSE:', parseErr, rawJson);
              }
            }
          }
        }
      }

      if (buffer.trim().startsWith('data:')) {
        const rawJson = buffer.trim().substring(5).trim();
        if (rawJson) {
          try {
            const parsedEvent: StreamEvent = JSON.parse(rawJson);
            callbacks.onEvent(parsedEvent);
          } catch (parseErr) {
            console.warn('Error parseando remanente de buffer SSE:', parseErr);
          }
        }
      }

      callbacks.onComplete();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.currentStreamError.set('Ejecución cancelada por el usuario.');
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this.currentStreamError.set(message);
        callbacks.onError(err instanceof Error ? err : new Error(message));
      }
    } finally {
      this.isStreaming.set(false);
      this.activeAbortController = null;
    }
  }

  abortCurrentStream(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      this.isStreaming.set(false);
    }
  }
}
