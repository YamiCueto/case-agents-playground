import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RuntimeCompanionComponent } from './runtime-companion.component';
import { RuntimeCompanionService } from '../../services/runtime-companion.service';
import { RuntimeCompanionState, createInitialCompanionState, updateCompanionWithEvent } from '../../models/companion.models';
import { StreamEvent } from '../../models/agent.models';

describe('RuntimeCompanionComponent', () => {
  let component: RuntimeCompanionComponent;
  let fixture: ComponentFixture<RuntimeCompanionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RuntimeCompanionComponent],
      providers: [RuntimeCompanionService]
    }).compileComponents();

    fixture = TestBed.createComponent(RuntimeCompanionComponent);
    component = fixture.componentInstance;
  });

  it('1. renderiza estado inicial preparing con badge correcto', () => {
    const state = createInitialCompanionState('run-test-1', 'v1', 'Consulta ticket', 'usr_carlos');
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.companion-title')?.textContent).toContain('Runtime Companion');
    expect(compiled.querySelector('.version-badge')?.textContent).toContain('V1');
    expect(compiled.querySelector('.status-pill')?.textContent).toContain('Preparando');
    expect(compiled.querySelector('.event-name')?.textContent).toContain('INICIALIZANDO');
    expect(compiled.querySelector('.state-summary-text')?.textContent).toContain('Preparando');
  });

  it('2. renderiza grafo SVG compacto con nodos según topología v1', () => {
    const state = createInitialCompanionState('run-test-2', 'v1', 'Consulta ticket', 'usr_carlos');
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const svg = compiled.querySelector('.graph-svg');
    expect(svg).toBeTruthy();

    const nodeLabels = Array.from(compiled.querySelectorAll('.node-label')).map((el) => el.textContent?.trim());
    expect(nodeLabels).toContain('USER');
    expect(nodeLabels).toContain('RUNTIME');
    expect(nodeLabels).toContain('LLM');
    expect(nodeLabels).toContain('TOOLS');
    expect(nodeLabels).not.toContain('PLANNER');
  });

  it('3. renderiza topología v4 con PLANNER y EXECUTOR', () => {
    const state = createInitialCompanionState('run-test-3', 'v4', 'Plan complejo', 'usr_carlos');
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const nodeLabels = Array.from(compiled.querySelectorAll('.node-label')).map((el) => el.textContent?.trim());
    expect(nodeLabels).toContain('PLANNER');
    expect(nodeLabels).toContain('EXECUTOR');
  });

  it('4. resalta nodo activo y responsabilidades LLM vs Runtime al recibir evento', () => {
    let state = createInitialCompanionState('run-test-4', 'v1', 'Consulta ticket', 'usr_carlos');
    const evt: StreamEvent = {
      event_id: 'evt-c-4',
      type: 'TOOL_PROPOSED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      hop_number: 3,
      payload: { tool_name: 'get_ticket_by_id' }
    };
    state = updateCompanionWithEvent(state, evt);

    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.event-name')?.textContent).toContain('TOOL_PROPOSED');
    expect(compiled.querySelector('.state-summary-text')?.textContent).toContain('Herramienta Propuesta');
    expect(compiled.querySelector('.llm-item .resp-desc')?.textContent).toContain('Propone invocar');
    expect(compiled.querySelector('.runtime-item .resp-desc')?.textContent).toContain('Valida esquema');
    expect(compiled.querySelector('.hop-chip')?.textContent).toContain('Hop 3 / 7');
  });

  it('5. emite evento expandTo3D al presionar el botón de simulador 3D', () => {
    const state = createInitialCompanionState('run-test-5', 'v1', 'Consulta ticket', 'usr_carlos');
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    let emittedRunId: string | null = null;
    component.expandTo3D.subscribe((id) => (emittedRunId = id));

    const btn3D = fixture.nativeElement.querySelector('.btn-action-3d') as HTMLButtonElement;
    expect(btn3D).toBeTruthy();
    btn3D.click();

    expect(emittedRunId).toBe('run-test-5');
  });

  it('6. conmuta vista compacta al minimizar', () => {
    const state: RuntimeCompanionState = {
      ...createInitialCompanionState('run-test-6', 'v1', 'Consulta', 'usr_carlos'),
      isMinimized: true
    };
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.minimized-strip')).toBeTruthy();
    expect(compiled.querySelector('.graph-svg')).toBeFalsy();
  });

  it('7. renderiza barra compacta de resumen al completar la ejecución', () => {
    let state = createInitialCompanionState('run-test-7', 'v1', 'Consulta', 'usr_carlos');
    state = updateCompanionWithEvent(state, {
      event_id: 'evt-r-1',
      type: 'INFERENCE_STARTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      payload: {}
    });
    state = { ...state, status: 'completed' };

    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.compact-summary-bar')).toBeTruthy();
    expect(compiled.querySelector('.btn-replay-pill')).toBeTruthy();
    expect(compiled.querySelector('.btn-details-pill')).toBeTruthy();
  });

  it('8. muestra Replay Scrubber cuando está en modo replay o detalles expandidos', () => {
    let state = createInitialCompanionState('run-test-8', 'v1', 'Consulta', 'usr_carlos');
    state = updateCompanionWithEvent(state, {
      event_id: 'evt-r-1',
      type: 'INFERENCE_STARTED',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      payload: {}
    });
    state = updateCompanionWithEvent(state, {
      event_id: 'evt-r-2',
      type: 'FINAL_SYNTHESIS',
      timestamp: new Date().toISOString(),
      agent_version: 'v1',
      payload: {}
    });
    state = { ...state, status: 'completed', isReplayMode: true, isDetailsExpanded: true };

    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.mini-replay-controls')).toBeTruthy();
    expect(compiled.querySelector('.replay-step-label')?.textContent).toContain('Paso 2 de 2');
  });
});
