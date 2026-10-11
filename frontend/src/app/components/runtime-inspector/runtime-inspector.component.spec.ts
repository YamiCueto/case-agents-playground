import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RuntimeInspectorComponent } from './runtime-inspector.component';
import { EventStoreService } from '../../services/event-store.service';
import { PresentationControllerService } from '../../services/presentation-controller.service';
import { StreamEvent } from '../../models/agent.models';

describe('RuntimeInspectorComponent (Phase 6.3 Integration)', () => {
  let component: RuntimeInspectorComponent;
  let fixture: ComponentFixture<RuntimeInspectorComponent>;
  let eventStore: EventStoreService;
  let controller: PresentationControllerService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RuntimeInspectorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(RuntimeInspectorComponent);
    component = fixture.componentInstance;
    eventStore = TestBed.inject(EventStoreService);
    controller = TestBed.inject(PresentationControllerService);
    fixture.detectChanges();
  });

  it('renders default v1 view with Execution Journey and linear steps', () => {
    fixture.componentRef.setInput('activeAgentId', 'v1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.version-tag')?.textContent).toContain('V1');
    expect(compiled.querySelector('.tabs-bar')?.textContent).toContain('Recorrido de ejecución');
    expect(compiled.querySelector('app-journey-flow')).not.toBeNull();
    expect(compiled.querySelector('app-v2-loop-flow')).toBeNull();
    expect(compiled.querySelector('app-v3-memory-inspector')).toBeNull();
  });

  it('renders v2 view with Agent Loop Journey and V2LoopFlowComponent', () => {
    fixture.componentRef.setInput('activeAgentId', 'v2');
    eventStore.activeAgentId.set('v2');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.version-tag')?.textContent).toContain('V2');
    expect(compiled.querySelector('.tabs-bar')?.textContent).toContain('Recorrido del bucle v2');
    expect(compiled.querySelector('app-v2-loop-flow')).not.toBeNull();
    expect(compiled.querySelector('app-journey-flow')).toBeNull();
    expect(compiled.querySelector('app-v3-memory-inspector')).toBeNull();
  });

  it('renders v3 dual projection with V2LoopFlowComponent and V3MemoryInspectorComponent', () => {
    fixture.componentRef.setInput('activeAgentId', 'v3');
    eventStore.activeAgentId.set('v3');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.version-tag')?.textContent).toContain('V3');
    expect(compiled.querySelector('.tabs-bar')?.textContent).toContain('Bucle y memoria v3');

    // Requirement 2: Reuses V2LoopFlowComponent
    expect(compiled.querySelector('app-v2-loop-flow')).not.toBeNull();

    // Requirement 3: Integrates V3MemoryInspectorComponent
    expect(compiled.querySelector('app-v3-memory-inspector')).not.toBeNull();

    // V3 Dual Subnav exists
    expect(compiled.querySelector('.v3-subnav-bar')).not.toBeNull();
    expect(compiled.querySelector('.v3-pill')?.textContent).toContain('v3 DUAL PROJECTION');
  });

  it('toggles v3 view mode between dual, loop and memory', () => {
    fixture.componentRef.setInput('activeAgentId', 'v3');
    eventStore.activeAgentId.set('v3');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.v3-panel-loop')).not.toBeNull();
    expect(compiled.querySelector('.v3-panel-memory')).not.toBeNull();

    // Switch to Solo Loop
    component.v3ViewMode.set('loop');
    fixture.detectChanges();
    expect(compiled.querySelector('.v3-panel-loop')).not.toBeNull();
    expect(compiled.querySelector('.v3-panel-memory')).toBeNull();

    // Switch to Solo Memoria
    component.v3ViewMode.set('memory');
    fixture.detectChanges();
    expect(compiled.querySelector('.v3-panel-loop')).toBeNull();
    expect(compiled.querySelector('.v3-panel-memory')).not.toBeNull();
  });

  it('propagates selectTaskOption output when emitted from child V3MemoryInspectorComponent', () => {
    fixture.componentRef.setInput('activeAgentId', 'v3');
    eventStore.activeAgentId.set('v3');
    fixture.detectChanges();

    let emittedPayload: { decisionId: string; selectedValue: string } | null = null;
    component.selectTaskOption.subscribe((payload) => {
      emittedPayload = payload;
    });

    // Simulate emission from child
    component.onSelectTaskOption({ decisionId: 'task-opt-42', selectedValue: 'opcion_confirmada' });
    expect(emittedPayload).toEqual({
      decisionId: 'task-opt-42',
      selectedValue: 'opcion_confirmada'
    });
  });

  it('shows Agent v3 as Operativo (Taller 04) in future/roadmap tab', () => {
    component.activeTab.set('future');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.future-card');
    const v3Card = Array.from(cards).find((c) => c.textContent?.includes('Agent v3'));
    expect(v3Card).toBeDefined();
    expect(v3Card?.textContent).toContain('Operativo (Taller 04)');
    expect(v3Card?.classList.contains('active-card')).toBe(true);
  });
});
