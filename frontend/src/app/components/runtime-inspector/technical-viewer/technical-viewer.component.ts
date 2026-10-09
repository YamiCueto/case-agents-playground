import { Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-technical-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="technical-viewer-card">
      <div class="viewer-header">
        <div class="header-left">
          <span class="tech-tag">&#x1F9E9; Payload Técnico</span>
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
              <span class="copied-badge">&#x2713; Copiado!</span>
            } @else {
              <span>&#x1F4CB; Copiar</span>
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
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 8px;
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
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .tech-tag {
      font-size: 0.72rem;
      font-weight: 700;
      color: #94a3b8;
    }
    .mode-indicator {
      font-size: 0.65rem;
      font-weight: 700;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .format-toggle {
      display: flex;
      background: #1e293b;
      border-radius: 4px;
      padding: 2px;
      border: 1px solid #334155;
    }
    .toggle-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.2rem 0.55rem;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .toggle-btn.active {
      background: #0284c7;
      color: #ffffff;
      font-weight: 700;
    }
    .btn-copy {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      font-size: 0.7rem;
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .btn-copy:hover {
      background: #334155;
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .copied-badge {
      color: #34d399;
      font-weight: 700;
    }
    .code-viewport {
      padding: 0.75rem;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      max-height: 220px;
      overflow-y: auto;
      box-sizing: border-box;
    }
    .code-viewport.raw {
      overflow-x: auto;
    }
    .code-viewport.wrapped {
      overflow-x: hidden;
    }
    .json-pre {
      margin: 0;
      padding: 0;
      font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
      font-size: 0.74rem;
      line-height: 1.5;
      color: #38bdf8;
      min-width: 0;
      max-width: 100%;
    }
    .code-viewport.wrapped .json-pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .code-viewport.raw .json-pre {
      white-space: pre;
    }
    .json-code {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
  `]
})
export class TechnicalViewerComponent {
  readonly payload = input<any>(null);
  readonly formatMode = signal<'wrapped' | 'raw'>('wrapped');
  readonly isCopied = signal<boolean>(false);

  formattedJson(): string {
    const val = this.payload();
    if (val === null || val === undefined) return '// Sin payload en este paso';
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }

  copyPayload(): void {
    const text = this.formattedJson();
    navigator.clipboard.writeText(text).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
  }
}
