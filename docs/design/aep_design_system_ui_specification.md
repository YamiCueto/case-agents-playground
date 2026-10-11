# Agent Engineering Playground (AEP) — Design System & UI Specification

**Version:** 3.0-PROD  
**Target Architecture:** Angular 22 Standalone + Tailwind CSS + FastAPI SSE + Three.js Runtime Avatar + MySQL Memory Persistence  
**Design Role:** Principal Product Designer & AI Observability Systems Architect  

---

## 1. Executive Summary & Design Principles

The **Agent Engineering Playground (AEP)** is an educational and observability workbench where engineers, researchers, and students deconstruct agentic execution loops in real-time. The interface reconciles high-density developer telemetry with intuitive conceptual models.

### Core Tenets
1. **Observable Determinism vs. Dynamic Loops:** Clear visual bifurcation between deterministic 7-hop execution (v1), dynamic cyclical reasoning loops (v2), and stateful memory hydration & persistence (v3).
2. **Telemetry Integrity (Zero Decorative Fiction):** Every glow, node pulse, token bar segment, and timestamp reflects genuine backend state (FastAPI SSE events, token heuristics, MySQL commits).
3. **Ergonomic Information Density:** Strict 3-column desktop hierarchy with content-aware responsive collapsibility for tablet and mobile viewports.
4. **Accessible High-Tech Aesthetics:** Dark-glass surfaces, restrained neon accents (cyan for inference, amber for tool execution, violet for memory hydration, emerald for confirmation), meeting WCAG 2.1 AA contrast standards.

---

## 2. Design Tokens

### 2.1 Color Palette
```css
:root {
  /* Surface Foundations */
  --aep-canvas: #070B14;
  --aep-panel: #0D1527;
  --aep-card: #131D35;
  --aep-card-elevated: #172340;
  --aep-code-surface: #0A0F1D;
  --aep-border-subtle: rgba(255, 255, 255, 0.08);
  --aep-border-focus: rgba(0, 240, 255, 0.4);

  /* Semantic Accents */
  --aep-cyan: #00F0FF;          /* Inference, active LLM cognition, streaming */
  --aep-cyan-glow: rgba(0, 240, 255, 0.25);
  --aep-emerald: #10B981;       /* Validation, success, persistence confirmed, live */
  --aep-emerald-glow: rgba(16, 185, 129, 0.2);
  --aep-amber: #F59E0B;         /* Tool proposal, tool calling, pending evaluation */
  --aep-amber-glow: rgba(245, 158, 11, 0.25);
  --aep-violet: #A855F7;        /* State, persistent memory, session hydration */
  --aep-violet-glow: rgba(168, 85, 247, 0.25);
  --aep-rose: #F43F5E;          /* Errors, tool failures, budget overflow */
  --aep-muted: #64748B;         /* Disabled states, inactive hops, secondary metadata */

  /* Text & Readability */
  --aep-text-primary: #F8FAFC;
  --aep-text-secondary: #94A3B8;
  --aep-text-muted: #475569;
}
```

### 2.2 Typography Scale
- **Primary Font:** Inter / system-ui (UI, Labels, Buttons, Navigation)
- **Monospace Font:** JetBrains Mono / Fira Code (Prompts, Token Counts, Hop Statuses, JSON Payloads, Code Editor)

| Level | Size | Weight | Tracking | Line Height | Usage |
|---|---|---|---|---|---|
| **Display Header** | 20px | 700 | -0.02em | 28px | App Brand, Major Inspector Phase |
| **Section Title** | 15px | 600 | -0.01em | 22px | Column Headers, Inspector Subsections |
| **Card Title / Hop** | 13px | 600 | 0.00em | 18px | Hop Names, Card Titles |
| **Body UI** | 13px | 400 | 0.00em | 19px | Chat Messages, Explanations |
| **Code & JSON** | 12px | 400/500 | +0.01em | 18px | Technical JSON Viewers, Token Breakdown |
| **Badges & Meta** | 11px | 600 | +0.03em | 14px | Status Badges, Timestamps, Versions |

### 2.3 Spacing, Radii & Shadows
- **Spacing Grid:** 4px baseline (`4px, 8px, 12px, 16px, 20px, 24px, 32px`)
- **Border Radii:**
  - Cards & Panels: `12px`
  - Inner Badges & Buttons: `8px`
  - Compact Tags & Pill Selectors: `6px` / `9999px` (fully rounded)
- **Glass Elevation Shadows:**
  - Base Card: `0 4px 20px -2px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)`
  - Active Glow (Cyan): `0 0 25px -5px rgba(0, 240, 255, 0.3), inset 0 1px 1px rgba(0, 240, 255, 0.2)`
  - Active Glow (Amber): `0 0 25px -5px rgba(245, 158, 11, 0.3), inset 0 1px 1px rgba(245, 158, 11, 0.2)`

---

## 3. Responsive Multi-Column Architecture

### 3.1 Desktop Layout (1440px+ & 1280px)
- **Column 1 — Conversación (30% / min-w: 380px):**
  - Session metadata header, simulated user badge (`Carlos Mario Restrepo`), conversation history stream.
  - Floating/fixed bottom prompt composer with one-click contextual test chips (`TICK-1001`, `Ver comentarios`, `Asignar a técnico`).
- **Column 2 — Runtime Inspector (43% / min-w: 520px):**
  - Mascot Hologram Stage (Three.js WebGL canvas overlaying luminous pedestal rings).
  - Current Hop Card: Displays active phase (`HOP 3 - PROPUESTA TOOL`), LLM model engine (`Qwen 3.5 4B (llama.cpp)`), and plain-language explanation (`Qué está ocurriendo`).
  - Interactive Stepper / Hop Timeline: 7 distinct phases with verified checkmarks and active amber/cyan status.
  - Live Inspector Tabs: Reasoning stream, Tool Call parameters, Synthesized response, and Raw JSON evidence.
- **Column 3 — State & Memory Inspector (27% / min-w: 340px):**
  - **Context Budget Gauge:** Multi-color segmented breakdown (System 482, Decisions 312, Hydrated Memory 1,120, Query 270, Available 1,912) vs. 4,096 max window. Explicit `[ESTIMADO]` heuristic indicator.
  - **Decisiones Persistentes:** Displays persistent key-values loaded from MySQL (`idioma_respuesta: es-ES`, `nivel_detalle: technical`).
  - **Memoria Conversacional Timeline:** Step-by-step hydration logs with timestamps.

### 3.2 Tablet (768px - 1024px)
- Responsive 2-column mode: Left column displays Conversation, Right column pairs Runtime Inspector with tabbed access to State & Memory.
- Floating toggle switch to expand the Memory Inspector into an overlay slide-out panel.

### 3.3 Mobile (360px - 390px)
- Single-column high-density layout with accessible segmented top navigation bar:
  `[💬 Chat (2)] | [⚡ Runtime (Hop 3)] | [🧠 Memoria (2.1k Tok)]`
- Persistent bottom action bar maintaining quick tool triggers and message input.

---

## 4. Agent Architecture Modes

### Agent v1 — Deterministic 7-Hop Tool Calling
- **Layout:** 2-column workspace (`Conversation` + `Expanded 7-Hop Inspector`).
- **Hops:**
  1. `Consulta (User Request)`
  2. `Inferencia 1 (LLM Reasoning)`
  3. `Propuesta Tool (Tool Declaration & Args)`
  4. `Validación Pydantic (Schema Check)`
  5. `Ejecución Backend (MySQL / API execution)`
  6. `Inyección Contexto (Observation feed)`
  7. `Síntesis Final (Final Assistant response)`

### Agent v2 — Dynamic Cyclical Reasoning Loop
- **Layout:** 2-column workspace (`Conversation` + `Dynamic Agent Loop Inspector`).
- Dynamic loop stepper displaying Iteration 1 → Tool Execution → Observation → Iteration 2 → Exit Criteria met → Response.

### Agent v3 — State & Memory (Primary Production Screen)
- **Layout:** Full 3-column workspace integrating persistent storage, token budget telemetry, and preference hydration.

---

## 5. Angular 22 Developer Handoff & Component Anatomy

```typescript
// Component Blueprint: AEP Workspace Container
@Component({
  selector: 'aep-workspace',
  standalone: true,
  imports: [
    AepHeaderComponent,
    AepChatColumnComponent,
    AepRuntimeInspectorComponent,
    AepStateMemoryComponent,
    AsyncPipe,
    NgIf
  ],
  template: `
    <div class="h-screen w-screen bg-[#070B14] text-slate-100 flex flex-col overflow-hidden font-sans">
      <aep-header [liveStatus]="streamStatus$ | async" (onControlChange)="handleControl($event)" />
      <main class="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        <aep-chat-column class="col-span-12 lg:col-span-4 xl:col-span-3 h-full" />
        <aep-runtime-inspector class="col-span-12 lg:col-span-8 xl:col-span-6 h-full" />
        <aep-state-memory class="hidden xl:block xl:col-span-3 h-full" />
      </main>
    </div>
  `
})
export class AepWorkspaceComponent { ... }
```

---

## 6. Acceptance Criteria Checklist
- [x] **Visual Fidelity:** Matches the dark navy, cyan/amber glowing theme, and 3-column topology of the reference image.
- [x] **Mascot Presentation:** 3D robot stage with luminous pedestal and status badge overlay.
- [x] **7-Hop Stepper:** Distinct checkmarks, active hop glow, and disabled future steps.
- [x] **State & Memory Gauge:** Multi-color segmented token budget with explicit `ESTIMADO` tag.
- [x] **Educational Clarity:** Clear visual cues explaining active execution state without deceptive SaaS decoration.