import { Component, input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-technical-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="technical-viewer-card">
      <div class="viewer-header">
        <div class="header-left">
          <svg class="header-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <span class="tech-tag">Payload Técnico</span>
          <span class="mode-indicator">{{ formatMode() | uppercase }}</span>
        </div>

        <div class="header-actions">
          <div class="format-toggle" role="radiogroup" aria-label="Modo de formateo JSON">
            <button
              type="button"
              class="toggle-btn"
              [class.active]="formatMode() === 'wrapped'"
              (click)="formatMode.set('wrapped')"
              title="Ajustar líneas al ancho disponible para evitar desplazamiento"
            >
              Wrapped
            </button>
            <button
              type="button"
              class="toggle-btn"
              [class.active]="formatMode() === 'raw'"
              (click)="formatMode.set('raw')"
              title="Formato crudo con desplazamiento horizontal interno"
            >
              Raw
            </button>
          </div>

          <button
            type="button"
            class="btn-copy"
            (click)="copyPayload()"
            [attr.aria-label]="isCopied() ? 'Copiado al portapapeles' : 'Copiar JSON'"
          >
            @if (isCopied()) {
              <span class="copied-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Copiado!</span>
              </span>
            } @else {
              <span class="copy-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copiar</span>
              </span>
            }
          </button>
        </div>
      </div>

      <div class="code-viewport" [ngClass]="formatMode()">
        <pre class="json-pre"><code class="json-code">{{ formattedJson() }}</code></pre>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .technical-viewer-card {
      background: #070b14;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .viewer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .header-icon {
      color: var(--accent-cyan);
    }
    .tech-tag {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-secondary);
    }
    .mode-indicator {
      font-size: 0.62rem;
      font-weight: 700;
      font-family: var(--font-mono);
      background: var(--accent-cyan-bg);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .format-toggle {
      display: flex;
      background: var(--bg-canvas);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-default);
      overflow: hidden;
    }
    .toggle-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.68rem;
      font-family: var(--font-mono);
      padding: 0.2rem 0.5rem;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .toggle-btn:hover {
      color: var(--text-primary);
    }
    .toggle-btn.active {
      background: var(--border-default);
      color: var(--accent-cyan);
      font-weight: 700;
    }
    .btn-copy {
      background: var(--bg-canvas);
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      font-size: 0.68rem;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: var(--transition-fast);
    }
    .btn-copy:hover {
      background: var(--border-default);
      color: var(--text-primary);
      border-color: var(--accent-cyan);
    }
    .copied-badge, .copy-label {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .copied-badge {
      color: var(--accent-emerald);
      font-weight: 700;
    }
    .code-viewport {
      padding: 0.75rem;
      max-height: 240px;
      overflow-y: auto;
      font-family: var(--font-mono);
      font-size: 0.76rem;
      line-height: 1.45;
      color: #93c5fd;
    }
    .code-viewport.wrapped {
      overflow-x: hidden;
      word-break: break-all;
      white-space: pre-wrap;
    }
    .code-viewport.raw {
      overflow-x: auto;
      white-space: pre;
    }
    .json-pre {
      margin: 0;
      font-family: inherit;
    }
    .json-code {
      font-family: inherit;
    }
  `]
})
export class TechnicalViewerComponent {
  readonly payload = input<any>(null);
  readonly formatMode = signal<'wrapped' | 'raw'>('wrapped');
  readonly isCopied = signal<boolean>(false);

  readonly formattedJson = computed<string>(() => {
    const data = this.payload();
    if (data === null || data === undefined) return '{}';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  });

  copyPayload(): void {
    const text = this.formattedJson();
    navigator.clipboard.writeText(text).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
  }
}
