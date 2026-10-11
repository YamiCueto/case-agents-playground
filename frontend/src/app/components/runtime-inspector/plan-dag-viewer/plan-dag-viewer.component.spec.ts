import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlanDAGViewerComponent } from './plan-dag-viewer.component';
import { AgentV4PlanningState } from '../../../models/plan.models';

describe('PlanDAGViewerComponent (Phase Agent v4)', () => {
  let component: PlanDAGViewerComponent;
  let fixture: ComponentFixture<PlanDAGViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanDAGViewerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PlanDAGViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders waiting state when no plan is present', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.dag-empty-state')).not.toBeNull();
    expect(compiled.querySelector('.dag-empty-state h5')?.textContent).toContain('Esperando propuesta de Plan');
  });

  it('renders DAG graph, goal invariant, and nodes when plan is provided', () => {
    const mockState: AgentV4PlanningState = {
      currentPlan: {
        goal: 'Diagnosticar base de datos de producción',
        revision: 1,
        current_step_id: 'step_2',
        is_completed: false,
        steps: [
          {
            id: 'step_1',
            action: 'check_metrics',
            description: 'Verificar métricas de latencia de MySQL',
            executor: 'tool',
            status: 'completed',
            depends_on: [],
            observation: { latency_ms: 450, status: 'degraded' },
            required: true,
            skip_reason: null
          },
          {
            id: 'step_2',
            action: 'analyze_logs',
            description: 'Analizar logs de consultas lentas',
            executor: 'runtime',
            status: 'in_progress',
            depends_on: ['step_1'],
            observation: null,
            required: true,
            skip_reason: null
          },
          {
            id: 'step_3',
            action: 'synthesize_report',
            description: 'Generar recomendación para DBA',
            executor: 'model',
            status: 'pending',
            depends_on: ['step_2'],
            observation: null,
            required: true,
            skip_reason: null
          }
        ]
      },
      planHistory: [],
      selectedRevision: 1,
      activeStepId: 'step_2',
      isStalled: false,
      blockedStepIds: [],
      terminationReason: null,
      isValidated: true,
      planProposedCount: 1
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.dag-empty-state')).toBeNull();
    expect(compiled.querySelector('.goal-text')?.textContent).toContain('Diagnosticar base de datos de producción');
    expect(compiled.querySelector('.goal-label')?.textContent).toContain('Invariante Inviolable');

    // 3 nodes rendered in SVG
    const nodes = compiled.querySelectorAll('.dag-node-group');
    expect(nodes.length).toBe(3);

    // Active status pill
    expect(compiled.querySelector('.pill-status')?.textContent).toContain('PLAN VALIDADO');
  });

  it('displays blocked stall banner when isStalled is true (G3 no_executable_steps)', () => {
    const blockedState: AgentV4PlanningState = {
      currentPlan: {
        goal: 'Desplegar versión 4.2',
        revision: 1,
        current_step_id: 'step_deploy',
        is_completed: false,
        steps: [
          {
            id: 'step_build',
            action: 'build_artifact',
            description: 'Construir binario',
            executor: 'runtime',
            status: 'failed',
            depends_on: [],
            observation: { error: 'Build error 137' },
            required: true,
            skip_reason: null
          },
          {
            id: 'step_deploy',
            action: 'deploy_service',
            description: 'Desplegar servicio',
            executor: 'tool',
            status: 'pending',
            depends_on: ['step_build'],
            observation: null,
            required: true,
            skip_reason: null
          }
        ]
      },
      planHistory: [],
      selectedRevision: 1,
      activeStepId: 'step_deploy',
      isStalled: true,
      blockedStepIds: ['step_deploy'],
      terminationReason: 'no_executable_steps: dependencia no satisfecha sin ruta alternativa',
      isValidated: true,
      planProposedCount: 1
    };

    fixture.componentRef.setInput('state', blockedState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.stall-alert-box')).not.toBeNull();
    expect(compiled.querySelector('.stall-text')?.textContent).toContain('no_executable_steps');
  });

  it('selects node and displays step observation drawer', () => {
    const mockState: AgentV4PlanningState = {
      currentPlan: {
        goal: 'Verificar estado del servicio',
        revision: 1,
        current_step_id: 'step_1',
        is_completed: true,
        steps: [
          {
            id: 'step_1',
            action: 'ping_service',
            description: 'Comprobar disponibilidad',
            executor: 'runtime',
            status: 'completed',
            depends_on: [],
            observation: { status: 'OK', ping_ms: 200 },
            required: true,
            skip_reason: null
          }
        ]
      },
      planHistory: [],
      selectedRevision: 1,
      activeStepId: 'step_1',
      isStalled: false,
      blockedStepIds: [],
      terminationReason: null,
      isValidated: true,
      planProposedCount: 1
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    component.onNodeClick(mockState.currentPlan!.steps[0]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.step-detail-card')).not.toBeNull();
    expect(compiled.querySelector('.step-badge-id')?.textContent).toContain('step_1');
    expect(compiled.querySelector('.obs-pre')?.textContent).toContain('200');
  });

  it('supports revision selection when plan history exists (G2 replanning)', () => {
    const historyState: AgentV4PlanningState = {
      currentPlan: {
        goal: 'Despliegue con contingencia',
        revision: 2,
        current_step_id: 'step_fallback',
        is_completed: false,
        steps: [
          {
            id: 'step_fallback',
            action: 'deploy_canary',
            description: 'Ruta alternativa canario',
            executor: 'tool',
            status: 'in_progress',
            depends_on: [],
            observation: null,
            required: true,
            skip_reason: null
          }
        ]
      },
      planHistory: [
        {
          revision: 1,
          goal: 'Despliegue con contingencia',
          steps: [
            {
              id: 'step_direct',
              action: 'deploy_direct',
              description: 'Despliegue directo fallido',
              executor: 'tool',
              status: 'failed',
              depends_on: [],
              observation: { error: 'Connection timeout' },
              required: true,
              skip_reason: null
            }
          ],
          timestamp: '2026-10-11T12:00:00Z',
          triggerReason: 'Replanning por fallo de paso crítico',
          isArchived: true
        }
      ],
      selectedRevision: 2,
      activeStepId: 'step_fallback',
      isStalled: false,
      blockedStepIds: [],
      terminationReason: null,
      isValidated: true,
      planProposedCount: 2
    };

    fixture.componentRef.setInput('state', historyState);
    component.selectedRevisionNum.set(2);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const revButtons = compiled.querySelectorAll('.rev-btn');
    expect(revButtons.length).toBe(2);

    // Switch to Rev 1
    component.selectedRevisionNum.set(1);
    fixture.detectChanges();

    expect(component.displayedPlan()?.revision).toBe(1);
    expect(compiled.querySelector('.replanning-notice')).not.toBeNull();
    expect(compiled.querySelector('.archived-tag')?.textContent).toContain('Archivada');
  });
});
