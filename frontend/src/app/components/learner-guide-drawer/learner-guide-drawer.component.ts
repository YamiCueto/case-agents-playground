import {
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LearnerGuideService } from '../../services/learner-guide.service';
import { GuideTab, VersionGuide } from '../../models/learner-guide.models';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-learner-guide-drawer',
  standalone: true,
  imports: [CommonModule, MarkdownPipe],
  template: `
    <div
      class="drawer-overlay"
      (click)="close.emit()"
      role="dialog"
      aria-modal="true"
      aria-label="Guía pedagógica del aprendiz"
    >
      <div class="drawer-card" (click)="$event.stopPropagation()">
        <!-- Encabezado del Drawer -->
        <header class="drawer-header">
          <div class="header-info">
            <div class="title-with-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="title-icon"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path
                  d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
                ></path>
              </svg>
              <h3>Guía del Aprendiz &bull; CASE OS M05</h3>
            </div>
            <span class="drawer-desc">
              Documentación pedagógica y laboratorios prácticos por versión del agente
            </span>
          </div>

          <div class="header-actions">
            <div class="version-badge-group" role="group" aria-label="Versión del agente">
              <button
                type="button"
                class="ver-btn"
                [class.active]="activeVersion() === 'v1'"
                (click)="setVersion('v1')"
              >
                v1
              </button>
              <button
                type="button"
                class="ver-btn"
                [class.active]="activeVersion() === 'v2'"
                (click)="setVersion('v2')"
              >
                v2
              </button>
              <button
                type="button"
                class="ver-btn"
                [class.active]="activeVersion() === 'v3'"
                (click)="setVersion('v3')"
              >
                v3
              </button>
              <button
                type="button"
                class="ver-btn"
                [class.active]="activeVersion() === 'v4'"
                (click)="setVersion('v4')"
              >
                v4
              </button>
            </div>

            <button
              type="button"
              class="btn-close"
              (click)="close.emit()"
              title="Cerrar guía (Esc)"
              aria-label="Cerrar guía"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        <!-- Barra de pestañas temáticas -->
        <nav class="guide-nav-tabs" role="tablist" aria-label="Secciones de la guía">
          <button
            type="button"
            class="tab-btn"
            role="tab"
            [class.active]="activeTab() === 'what'"
            (click)="activeTab.set('what')"
            [attr.aria-selected]="activeTab() === 'what'"
          >
            <span>¿Qué hace?</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            role="tab"
            [class.active]="activeTab() === 'prompts'"
            (click)="activeTab.set('prompts')"
            [attr.aria-selected]="activeTab() === 'prompts'"
          >
            <span>¿Qué puedo escribir?</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            role="tab"
            [class.active]="activeTab() === 'tools'"
            (click)="activeTab.set('tools')"
            [attr.aria-selected]="activeTab() === 'tools'"
          >
            <span>Herramientas</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            role="tab"
            [class.active]="activeTab() === 'limits'"
            (click)="activeTab.set('limits')"
            [attr.aria-selected]="activeTab() === 'limits'"
          >
            <span>¿Qué NO hace?</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            role="tab"
            [class.active]="activeTab() === 'labs'"
            (click)="activeTab.set('labs')"
            [attr.aria-selected]="activeTab() === 'labs'"
          >
            <span>Laboratorios (5)</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            role="tab"
            [class.active]="activeTab() === 'inspector'"
            (click)="activeTab.set('inspector')"
            [attr.aria-selected]="activeTab() === 'inspector'"
          >
            <span>Runtime Inspector</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            role="tab"
            [class.active]="activeTab() === 'full'"
            (click)="activeTab.set('full')"
            [attr.aria-selected]="activeTab() === 'full'"
          >
            <span>Documentación completa</span>
          </button>
        </nav>

        <!-- Contenido del Drawer -->
        <main class="drawer-body">
          @if (guideService.isLoading()) {
            <div class="loading-state">
              <div class="spinner"></div>
              <span>Cargando documentación pedagógica...</span>
            </div>
          } @else if (currentGuide(); as guide) {
            <!-- 1. PESTAÑA: ¿QUÉ HACE? -->
            @if (activeTab() === 'what') {
              <section class="tab-pane" aria-label="Objetivo y conceptos">
                <div class="version-hero-card">
                  <span class="hero-tag">VERSIÓN ACTIVA: {{ guide.versionId.toUpperCase() }}</span>
                  <h4>{{ guide.title }}</h4>
                </div>
                <div class="markdown-rendered" [innerHTML]="guide.whatItDoes | markdown"></div>
                <div class="before-box">
                  <h5>Antes de comenzar</h5>
                  <div class="markdown-rendered" [innerHTML]="guide.beforeStarting | markdown"></div>
                </div>
              </section>
            }

            <!-- 2. PESTAÑA: ¿QUÉ PUEDO ESCRIBIR? -->
            @if (activeTab() === 'prompts') {
              <section class="tab-pane" aria-label="Intenciones y prompts">
                <div class="section-intro">
                  <p>
                    A continuación encontrarás las intenciones verificadas para
                    <strong>{{ guide.versionId.toUpperCase() }}</strong>. Haz clic en
                    <strong>Copiar</strong> para llevar el prompt exacto a tu portapapeles y pegarlo en el chat.
                  </p>
                </div>

                <div class="intents-table-container">
                  <table class="guide-table">
                    <thead>
                      <tr>
                        <th>Intención</th>
                        <th>Qué escribir (Prompt)</th>
                        <th>Capacidad / Ejecutor</th>
                        <th>Qué debería ocurrir</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of guide.intents; track item.prompt; let idx = $index) {
                        <tr>
                          <td class="intent-cell">
                            <strong>{{ item.intention }}</strong>
                          </td>
                          <td class="prompt-cell">
                            <code>{{ item.prompt }}</code>
                          </td>
                          <td class="cap-cell">
                            <span class="tag-chip">{{ item.capability }}</span>
                          </td>
                          <td class="outcome-cell">{{ item.outcome }}</td>
                          <td class="action-cell">
                            <button
                              type="button"
                              class="btn-copy"
                              [class.copied]="copiedPromptKey() === 'prompt-' + idx"
                              (click)="copyPrompt(item.prompt, 'prompt-' + idx)"
                              [attr.aria-label]="'Copiar prompt: ' + item.prompt"
                            >
                              @if (copiedPromptKey() === 'prompt-' + idx) {
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                <span>¡Copiado!</span>
                              } @else {
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                                <span>Copiar</span>
                              }
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            }

            <!-- 3. PESTAÑA: HERRAMIENTAS DISPONIBLES -->
            @if (activeTab() === 'tools') {
              <section class="tab-pane" aria-label="Herramientas disponibles">
                <div class="section-intro">
                  <p>
                    Herramientas de tickets y ejecutores correspondientes a
                    <strong>{{ guide.versionId.toUpperCase() }}</strong>.
                  </p>
                </div>
                <div class="tools-summary-grid">
                  <div class="tool-card read">
                    <div class="tool-card-header">
                      <span class="badge-type">LECTURA</span>
                      <code>get_ticket_by_id</code>
                    </div>
                    <p class="tool-desc">Devuelve el detalle completo de un ticket por su código exacto (ej. <code>TICK-1001</code>).</p>
                    <div class="tool-meta">
                      <span>Argumentos: <code>ticket_code</code> (requerido)</span>
                      <span>Efecto: Ninguno (solo consulta MySQL)</span>
                    </div>
                  </div>

                  <div class="tool-card read">
                    <div class="tool-card-header">
                      <span class="badge-type">LECTURA</span>
                      <code>list_tickets</code>
                    </div>
                    <p class="tool-desc">Lista tickets registrados con filtros opcionales de estado, prioridad o categoría.</p>
                    <div class="tool-meta">
                      <span>Argumentos: <code>status</code>, <code>priority</code>, <code>limit</code></span>
                      <span>Efecto: Ninguno</span>
                    </div>
                  </div>

                  <div class="tool-card read">
                    <div class="tool-card-header">
                      <span class="badge-type">LECTURA</span>
                      <code>identify_overdue_tickets</code>
                    </div>
                    <p class="tool-desc">Identifica tickets cuyo plazo de SLA se encuentra vencido respecto a la fecha actual.</p>
                    <div class="tool-meta">
                      <span>Argumentos: Ninguno</span>
                      <span>Efecto: Ninguno</span>
                    </div>
                  </div>

                  <div class="tool-card write">
                    <div class="tool-card-header">
                      <span class="badge-type danger">ESCRITURA</span>
                      <code>create_ticket</code>
                    </div>
                    <p class="tool-desc">Inserta un nuevo ticket real en MySQL con cálculo de SLA según severidad.</p>
                    <div class="tool-meta danger-meta">
                      <span>¡Atención! Modifica la base de datos de producción local. No usar para pruebas inocuas.</span>
                    </div>
                  </div>
                </div>

                @if (guide.versionId === 'v4') {
                  <div class="v4-devops-banner">
                    <h5>Herramientas DevOps Simuladas (Solo v4)</h5>
                    <p>
                      <code>get_recent_incidents</code>, <code>get_latest_deployment</code> y <code>get_deployment_from_cache</code>
                      devuelven datos de laboratorio para ejercitar planes con dependencias complejas.
                    </p>
                  </div>
                }

                <div class="extra-doc-link-box">
                  <button type="button" class="btn-link" (click)="openExtraDoc('catalogo-herramientas.md')">
                    📖 Abrir Catálogo Completo de Herramientas &rarr;
                  </button>
                </div>
              </section>
            }

            <!-- 4. PESTAÑA: ¿QUÉ NO HACE? -->
            @if (activeTab() === 'limits') {
              <section class="tab-pane" aria-label="Limitaciones y fronteras">
                <div class="limits-banner">
                  <div class="banner-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
                  <div>
                    <h4>Fronteras y Limitaciones Reales de {{ guide.versionId.toUpperCase() }}</h4>
                    <p>
                      Esta versión tiene límites arquitectónicos definidos para aislar el objetivo de aprendizaje.
                    </p>
                  </div>
                </div>
                <div class="markdown-rendered" [innerHTML]="guide.whatItDoesNotDo | markdown"></div>
              </section>
            }

            <!-- 5. PESTAÑA: LABORATORIOS GUIADOS -->
            @if (activeTab() === 'labs') {
              <section class="tab-pane" aria-label="Laboratorios guiados">
                <div class="section-intro">
                  <p>
                    Cinco ejercicios progresivos diseñados para verificar capacidades reales, límites y observación en el inspector.
                  </p>
                </div>

                <div class="labs-accordion">
                  @for (lab of guide.labs; track lab.number; let lIdx = $index) {
                    <article class="lab-card">
                      <div class="lab-card-header">
                        <span class="lab-badge">LAB 0{{ lab.number }}</span>
                        <h4>{{ lab.title }}</h4>
                      </div>

                      <div class="lab-card-body">
                        @if (lab.objective) {
                          <div class="lab-field">
                            <span class="field-label">Objetivo:</span>
                            <span class="field-val">{{ lab.objective }}</span>
                          </div>
                        }

                        @if (lab.prompt) {
                          <div class="lab-prompt-box">
                            <div class="prompt-header">
                              <span class="prompt-tag">PROMPT EXACTO A ESCRIBIR</span>
                              <button
                                type="button"
                                class="btn-copy-small"
                                [class.copied]="copiedPromptKey() === 'lab-' + lIdx"
                                (click)="copyPrompt(lab.prompt, 'lab-' + lIdx)"
                                [attr.aria-label]="'Copiar prompt del laboratorio ' + lab.number"
                              >
                                @if (copiedPromptKey() === 'lab-' + lIdx) {
                                  <span>¡Copiado!</span>
                                } @else {
                                  <span>Copiar prompt</span>
                                }
                              </button>
                            </div>
                            <pre class="prompt-code"><code>{{ lab.prompt }}</code></pre>
                          </div>
                        }

                        @if (lab.preparation) {
                          <div class="lab-field">
                            <span class="field-label">Preparación:</span>
                            <span class="field-val">{{ lab.preparation }}</span>
                          </div>
                        }

                        @if (lab.reflection) {
                          <div class="lab-field reflection-field">
                            <span class="field-label">Pregunta de reflexión:</span>
                            <span class="field-val">{{ lab.reflection }}</span>
                          </div>
                        }

                        @if (lab.successCriteria) {
                          <div class="lab-field success-field">
                            <span class="field-label">Criterio de éxito:</span>
                            <span class="field-val">{{ lab.successCriteria }}</span>
                          </div>
                        }
                      </div>
                    </article>
                  }
                </div>
              </section>
            }

            <!-- 6. PESTAÑA: RUNTIME INSPECTOR -->
            @if (activeTab() === 'inspector') {
              <section class="tab-pane" aria-label="Observabilidad en Runtime Inspector">
                <div class="section-intro">
                  <p>
                    Aprende a interpretar los eventos, fases y componentes del Runtime Inspector para esta versión.
                  </p>
                </div>
                <div class="markdown-rendered" [innerHTML]="guide.runtimeInspector | markdown"></div>
                <div class="extra-doc-link-box">
                  <button type="button" class="btn-link" (click)="openExtraDoc('guia-runtime-inspector.md')">
                    🔬 Abrir Guía Visual Completa del Runtime Inspector &rarr;
                  </button>
                </div>
              </section>
            }

            <!-- 7. PESTAÑA: DOCUMENTACIÓN COMPLETA -->
            @if (activeTab() === 'full') {
              <section class="tab-pane" aria-label="Documentación completa en Markdown">
                <div class="extra-docs-selector">
                  <span class="selector-label">Documento a visualizar:</span>
                  <div class="selector-buttons">
                    <button
                      type="button"
                      class="doc-sel-btn"
                      [class.active]="selectedDocView() === 'guide'"
                      (click)="selectedDocView.set('guide')"
                    >
                      Guía {{ guide.versionId.toUpperCase() }}
                    </button>
                    <button
                      type="button"
                      class="doc-sel-btn"
                      [class.active]="selectedDocView() === 'catalog'"
                      (click)="selectedDocView.set('catalog')"
                    >
                      Catálogo Herramientas
                    </button>
                    <button
                      type="button"
                      class="doc-sel-btn"
                      [class.active]="selectedDocView() === 'inspector'"
                      (click)="selectedDocView.set('inspector')"
                    >
                      Guía Inspector
                    </button>
                    <button
                      type="button"
                      class="doc-sel-btn"
                      [class.active]="selectedDocView() === 'troubleshooting'"
                      (click)="selectedDocView.set('troubleshooting')"
                    >
                      Troubleshooting
                    </button>
                    <button
                      type="button"
                      class="doc-sel-btn"
                      [class.active]="selectedDocView() === 'readme'"
                      (click)="selectedDocView.set('readme')"
                    >
                      Índice General
                    </button>
                  </div>
                </div>

                <div class="full-doc-container">
                  @switch (selectedDocView()) {
                    @case ('guide') {
                      <div class="markdown-rendered" [innerHTML]="guide.fullMarkdown | markdown"></div>
                    }
                    @case ('catalog') {
                      <div class="markdown-rendered" [innerHTML]="guideService.getExtraDoc('catalogo-herramientas.md') | markdown"></div>
                    }
                    @case ('inspector') {
                      <div class="markdown-rendered" [innerHTML]="guideService.getExtraDoc('guia-runtime-inspector.md') | markdown"></div>
                    }
                    @case ('troubleshooting') {
                      <div class="markdown-rendered" [innerHTML]="guideService.getExtraDoc('troubleshooting.md') | markdown"></div>
                    }
                    @case ('readme') {
                      <div class="markdown-rendered" [innerHTML]="guideService.getExtraDoc('README.md') | markdown"></div>
                    }
                  }
                </div>
              </section>
            }
          } @else {
            <div class="empty-state">
              <p>No se encontró documentación para la versión seleccionada.</p>
            </div>
          }
        </main>
      </div>
    </div>
  `,
  styles: [`
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.78);
      backdrop-filter: blur(8px);
      z-index: 1100;
      display: flex;
      justify-content: flex-end;
    }

    .drawer-card {
      width: 100%;
      max-width: 900px;
      height: 100%;
      background: var(--bg-panel);
      border-left: 1px solid var(--border-default);
      display: flex;
      flex-direction: column;
      animation: slideInRight 0.24s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.6);
    }

    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      gap: 1rem;
      flex-wrap: wrap;
    }

    .title-with-icon {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .title-icon {
      color: var(--accent-cyan);
    }

    .drawer-header h3 {
      font-size: 0.96rem;
      font-weight: 700;
      margin: 0;
      color: var(--text-primary);
    }

    .drawer-desc {
      font-size: 0.72rem;
      color: var(--text-secondary);
      margin-top: 0.15rem;
      display: block;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .version-badge-group {
      display: flex;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }

    .ver-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.55rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .ver-btn:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.05);
    }

    .ver-btn.active {
      background: var(--accent-cyan);
      color: #020617;
      font-weight: 700;
    }

    .btn-close {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      border-radius: 6px;
      padding: 0.35rem;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-close:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
    }

    /* Navegación por pestañas */
    .guide-nav-tabs {
      display: flex;
      overflow-x: auto;
      background: rgba(10, 15, 30, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      padding: 0 0.75rem;
      scrollbar-width: thin;
      gap: 0.25rem;
    }

    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.65rem 0.85rem;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }

    .tab-btn:hover {
      color: var(--text-primary);
    }

    .tab-btn.active {
      color: var(--accent-cyan);
      border-bottom-color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.05);
    }

    /* Cuerpo del Drawer */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
    }

    .tab-pane {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .version-hero-card {
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(168, 85, 247, 0.05));
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 8px;
      padding: 1rem 1.25rem;
    }

    .hero-tag {
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--accent-cyan);
      display: block;
      margin-bottom: 0.25rem;
    }

    .version-hero-card h4 {
      margin: 0;
      font-size: 1.15rem;
      color: var(--text-primary);
    }

    .before-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem 1.25rem;
    }

    .before-box h5 {
      margin: 0 0 0.5rem 0;
      font-size: 0.9rem;
      color: var(--accent-emerald);
    }

    .section-intro p {
      margin: 0;
      font-size: 0.86rem;
      color: var(--text-secondary);
      line-height: 1.45;
    }

    /* Tabla de Prompts */
    .intents-table-container {
      overflow-x: auto;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--bg-surface);
    }

    .guide-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      text-align: left;
    }

    .guide-table th {
      background: rgba(15, 23, 42, 0.85);
      padding: 0.65rem 0.85rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .guide-table td {
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
      vertical-align: middle;
    }

    .intent-cell {
      white-space: nowrap;
      font-weight: 600;
    }

    .prompt-cell code {
      font-family: var(--font-mono);
      background: rgba(56, 189, 248, 0.1);
      color: var(--accent-cyan);
      padding: 0.2rem 0.45rem;
      border-radius: 4px;
      font-size: 0.8rem;
      display: inline-block;
    }

    .tag-chip {
      font-size: 0.72rem;
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-weight: 600;
      display: inline-block;
    }

    .btn-copy, .btn-copy-small {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-cyan);
      font-size: 0.74rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .btn-copy:hover, .btn-copy-small:hover {
      background: var(--accent-cyan);
      color: #020617;
    }

    .btn-copy.copied, .btn-copy-small.copied {
      background: var(--accent-emerald);
      border-color: var(--accent-emerald);
      color: #020617;
    }

    /* Grilla de Herramientas */
    .tools-summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
    }

    .tool-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .tool-card.write {
      border-color: rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.03);
    }

    .tool-card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .badge-type {
      font-size: 0.65rem;
      font-weight: 800;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }

    .badge-type.danger {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }

    .tool-card code {
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--accent-cyan);
    }

    .tool-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.4;
    }

    .tool-meta {
      font-size: 0.72rem;
      color: var(--text-secondary);
      border-top: 1px solid var(--border-subtle);
      padding-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .danger-meta {
      color: #fca5a5;
      font-weight: 600;
    }

    .v4-devops-banner {
      background: rgba(168, 85, 247, 0.08);
      border: 1px solid rgba(168, 85, 247, 0.3);
      border-radius: 8px;
      padding: 0.85rem 1.15rem;
    }

    .v4-devops-banner h5 {
      margin: 0 0 0.35rem 0;
      color: #c084fc;
      font-size: 0.85rem;
    }

    .v4-devops-banner p {
      margin: 0;
      font-size: 0.78rem;
      color: var(--text-secondary);
    }

    .extra-doc-link-box {
      margin-top: 0.5rem;
    }

    .btn-link {
      background: transparent;
      border: none;
      color: var(--accent-cyan);
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
    }

    .btn-link:hover {
      color: #38bdf8;
    }

    /* Límites */
    .limits-banner {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: 8px;
      padding: 1rem 1.25rem;
    }

    .banner-icon {
      color: #fbbf24;
      flex-shrink: 0;
    }

    .limits-banner h4 {
      margin: 0 0 0.2rem 0;
      font-size: 0.95rem;
      color: #fef3c7;
    }

    .limits-banner p {
      margin: 0;
      font-size: 0.8rem;
      color: #fde68a;
    }

    /* Laboratorios */
    .labs-accordion {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .lab-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }

    .lab-card-header {
      background: rgba(15, 23, 42, 0.7);
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .lab-badge {
      font-size: 0.68rem;
      font-weight: 800;
      background: var(--accent-cyan);
      color: #020617;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }

    .lab-card-header h4 {
      margin: 0;
      font-size: 0.9rem;
      color: var(--text-primary);
    }

    .lab-card-body {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      font-size: 0.82rem;
    }

    .lab-field {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .field-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .field-val {
      color: var(--text-primary);
      line-height: 1.4;
    }

    .reflection-field {
      background: rgba(168, 85, 247, 0.05);
      border-left: 3px solid #c084fc;
      padding: 0.5rem 0.75rem;
      border-radius: 0 4px 4px 0;
    }

    .reflection-field .field-label {
      color: #c084fc;
    }

    .success-field {
      background: rgba(16, 185, 129, 0.05);
      border-left: 3px solid #34d399;
      padding: 0.5rem 0.75rem;
      border-radius: 0 4px 4px 0;
    }

    .success-field .field-label {
      color: #34d399;
    }

    .lab-prompt-box {
      background: #050b18;
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 6px;
      overflow: hidden;
    }

    .prompt-header {
      background: rgba(56, 189, 248, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid rgba(56, 189, 248, 0.15);
    }

    .prompt-tag {
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--accent-cyan);
    }

    .prompt-code {
      margin: 0;
      padding: 0.65rem 0.75rem;
      font-family: var(--font-mono);
      font-size: 0.82rem;
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Pestaña Documentación Completa */
    .extra-docs-selector {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .selector-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .selector-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .doc-sel-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .doc-sel-btn:hover {
      color: var(--text-primary);
      border-color: var(--border-default);
    }

    .doc-sel-btn.active {
      background: var(--accent-cyan);
      color: #020617;
      border-color: var(--accent-cyan);
      font-weight: 700;
    }

    .full-doc-container {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.25rem;
    }

    /* Estilos para Markdown Renderizado */
    :host ::ng-deep .markdown-rendered {
      font-size: 0.84rem;
      line-height: 1.6;
      color: var(--text-primary);
    }

    :host ::ng-deep .markdown-rendered h1,
    :host ::ng-deep .markdown-rendered h2,
    :host ::ng-deep .markdown-rendered h3,
    :host ::ng-deep .markdown-rendered h4 {
      color: var(--text-primary);
      margin-top: 1rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }

    :host ::ng-deep .markdown-rendered h1 { font-size: 1.15rem; }
    :host ::ng-deep .markdown-rendered h2 { font-size: 1.05rem; }
    :host ::ng-deep .markdown-rendered h3 { font-size: 0.95rem; }
    :host ::ng-deep .markdown-rendered h4 { font-size: 0.88rem; }

    :host ::ng-deep .markdown-rendered table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.8rem;
    }

    :host ::ng-deep .markdown-rendered th,
    :host ::ng-deep .markdown-rendered td {
      border: 1px solid var(--border-subtle);
      padding: 0.5rem 0.75rem;
    }

    :host ::ng-deep .markdown-rendered th {
      background: rgba(15, 23, 42, 0.8);
      color: var(--text-secondary);
      font-weight: 600;
    }

    :host ::ng-deep .markdown-rendered blockquote {
      margin: 0.75rem 0;
      padding: 0.75rem 1rem;
      border-left: 4px solid var(--accent-cyan);
      background: rgba(56, 189, 248, 0.05);
      border-radius: 0 6px 6px 0;
    }

    :host ::ng-deep .markdown-rendered pre {
      background: #030712;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.75rem;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.78rem;
    }

    :host ::ng-deep .markdown-rendered code {
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.1);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      font-size: 0.8em;
    }

    .loading-state, .empty-state {
      padding: 3rem;
      text-align: center;
      color: var(--text-secondary);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(56, 189, 248, 0.2);
      border-top-color: var(--accent-cyan);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .drawer-card {
        max-width: 100%;
      }
      .guide-table th:nth-child(3),
      .guide-table td:nth-child(3) {
        display: none;
      }
    }
  `]
})
export class LearnerGuideDrawerComponent {
  readonly selectedAgentId = input<string>('v1');
  readonly initialDocName = input<string | null>(null);
  readonly close = output<void>();
  readonly selectAgent = output<string>();

  readonly guideService = inject(LearnerGuideService);

  readonly activeVersion = signal<string>('v1');
  readonly activeTab = signal<GuideTab>('what');
  readonly selectedDocView = signal<'guide' | 'catalog' | 'inspector' | 'troubleshooting' | 'readme'>('guide');
  readonly copiedPromptKey = signal<string | null>(null);

  readonly currentGuide = computed<VersionGuide | null>(() => {
    return this.guideService.getGuideForVersion(this.activeVersion());
  });

  constructor() {
    effect(() => {
      const v = this.selectedAgentId();
      if (['v1', 'v2', 'v3', 'v4'].includes(v)) {
        this.activeVersion.set(v);
      }
    });

    effect(() => {
      const doc = this.initialDocName();
      if (doc === 'catalogo-herramientas.md') {
        this.openExtraDoc('catalogo-herramientas.md');
      } else if (doc === 'guia-runtime-inspector.md') {
        this.openExtraDoc('guia-runtime-inspector.md');
      }
    });
  }

  setVersion(version: string): void {
    this.activeVersion.set(version);
    this.selectAgent.emit(version);
  }

  openExtraDoc(docName: 'catalogo-herramientas.md' | 'guia-runtime-inspector.md'): void {
    this.activeTab.set('full');
    if (docName === 'catalogo-herramientas.md') {
      this.selectedDocView.set('catalog');
    } else {
      this.selectedDocView.set('inspector');
    }
  }

  async copyPrompt(text: string, key: string): Promise<void> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.copiedPromptKey.set(key);
      setTimeout(() => {
        if (this.copiedPromptKey() === key) {
          this.copiedPromptKey.set(null);
        }
      }, 2000);
    } catch (e) {
      console.error('Error al copiar al portapapeles:', e);
    }
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}
