import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { V3MemoryInspectorComponent } from './v3-memory-inspector.component';
import { AgentV3State } from '../../../models/v3-memory.models';

describe('V3MemoryInspectorComponent (Phase 6.2)', () => {
  let component: V3MemoryInspectorComponent;
  let fixture: ComponentFixture<V3MemoryInspectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [V3MemoryInspectorComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(V3MemoryInspectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders initial empty/idle state when state is null', () => {
    expect(component).toBeTruthy();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.cid-badge.unconfirmed')?.textContent).toContain('Sin conversación activa');
    expect(compiled.querySelector('.budget-section .empty-placeholder')?.textContent).toContain('Sin métricas de presupuesto');
    expect(compiled.querySelector('.decisions-section .empty-placeholder')?.textContent).toContain('No hay preferencias activas');
    expect(compiled.querySelector('.timeline-section .empty-placeholder')?.textContent).toContain('Esperando ejecución del agente');
  });

  it('renders context budget bar with effective limit and explicit estimate tag', () => {
    const mockState: AgentV3State = {
      executionId: 'v3-exec-1',
      confirmedConversationId: 'conv-carlos-123',
      persona: 'usr_carlos',
      hydration: {
        conversationId: 'conv-carlos-123',
        hydratedTurnsCount: 2,
        decisionsCount: 1,
        activeDecisions: [],
        budget: {
          queryTokensEst: 30,
          systemPromptTokensEst: 350,
          decisionsTokensEst: 50,
          historyTokensEst: 400,
          totalInitialTokensEst: 830,
          availableHistoryBudget: 1500,
          historyTurnsCount: 2,
          decisionsCount: 1,
          maxContextLimit: 4096,
          isHeuristicEstimate: true
        },
        hydratedAt: new Date().toISOString()
      },
      activeDecisions: [],
      decisionsHistory: [],
      revokedKeys: [],
      pendingTask: null,
      hitlStatus: 'none',
      persistedTurns: [],
      isRecoveryRequired: false,
      recoveryAlert: null,
      rawV3Events: []
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.estimate-chip')?.textContent).toContain('ESTIMADO');
    expect(compiled.querySelector('.limit-chip')?.textContent).toContain('4096');
    expect(compiled.querySelector('.budget-total-text')?.textContent).toContain('~830');
    expect(compiled.querySelector('.budget-available-text')?.textContent).toContain('~1500');

    const progressTrack = compiled.querySelector('.budget-bar-track');
    expect(progressTrack?.getAttribute('aria-valuenow')).toBe('830');
    expect(progressTrack?.getAttribute('aria-valuemax')).toBe('4096');
  });

  it('renders active decisions and visually distinguishes revoked preferences in decision inspector', () => {
    const mockState: AgentV3State = {
      executionId: 'v3-exec-2',
      confirmedConversationId: 'conv-laura-456',
      persona: 'usr_laura',
      hydration: null,
      activeDecisions: [
        {
          key: 'default_priority',
          value: 'HIGH',
          scope: 'persistent',
          version: 1,
          status: 'active',
          rationale: 'Solicitud explícita de alta prioridad'
        },
        {
          key: 'theme_mode',
          value: 'dark',
          scope: 'session',
          version: 2,
          status: 'revoked'
        }
      ],
      decisionsHistory: [],
      revokedKeys: ['theme_mode'],
      pendingTask: null,
      hitlStatus: 'none',
      persistedTurns: [],
      isRecoveryRequired: false,
      recoveryAlert: null,
      rawV3Events: []
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.decision-chip-card');
    expect(cards.length).toBe(2);

    // Card 1: active persistent
    expect(cards[0].querySelector('.chip-key')?.textContent).toContain('default_priority');
    expect(cards[0].querySelector('.chip-value')?.textContent).toContain('HIGH');
    expect(cards[0].querySelector('.chip-scope')?.textContent).toContain('PERSISTENT');
    expect(cards[0].querySelector('.chip-version')?.textContent).toContain('v1');
    expect(cards[0].classList.contains('is-revoked')).toBe(false);

    // Card 2: revoked session
    expect(cards[1].querySelector('.chip-key')?.textContent).toContain('theme_mode');
    expect(cards[1].querySelector('.chip-scope')?.textContent).toContain('SESSION');
    expect(cards[1].querySelector('.chip-status-revoked')?.textContent).toContain('REVOCADO');
    expect(cards[1].classList.contains('is-revoked')).toBe(true);
  });

  it('renders pending task card and emits typed selectTaskOption event on option click', () => {
    let emittedPayload: { decisionId: string; selectedValue: string } | null = null;
    component.selectTaskOption.subscribe((payload) => {
      emittedPayload = payload;
    });

    const mockState: AgentV3State = {
      executionId: 'v3-exec-3',
      confirmedConversationId: 'conv-carlos-123',
      persona: 'usr_carlos',
      hydration: null,
      activeDecisions: [],
      decisionsHistory: [],
      revokedKeys: [],
      pendingTask: {
        decisionId: 'task-assign-999',
        question: '¿A quién deseas asignar el ticket TICK-1001?',
        options: ['usr_carlos', 'usr_laura'],
        targetToolName: 'assign_ticket',
        missingParameterName: 'assignee_username',
        status: 'pending',
        timestamp: new Date().toISOString()
      },
      hitlStatus: 'waiting_human_decision',
      persistedTurns: [],
      isRecoveryRequired: false,
      recoveryAlert: null,
      rawV3Events: []
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const taskCard = compiled.querySelector('.task-card');
    expect(taskCard).not.toBeNull();
    expect(taskCard?.querySelector('.task-question')?.textContent).toContain('¿A quién deseas asignar el ticket TICK-1001?');

    const buttons = compiled.querySelectorAll<HTMLButtonElement>('.btn-option');
    expect(buttons.length).toBe(2);
    expect(buttons[1].textContent).toContain('usr_laura');

    // Click on option
    buttons[1].click();
    expect(emittedPayload).toEqual({
      decisionId: 'task-assign-999',
      selectedValue: 'usr_laura'
    });
  });

  it('disables option buttons during resuming_task, resolved, and recovery_required states', () => {
    let emittedPayload: { decisionId: string; selectedValue: string } | null = null;
    component.selectTaskOption.subscribe((payload) => {
      emittedPayload = payload;
    });

    const mockState: AgentV3State = {
      executionId: 'v3-exec-4',
      confirmedConversationId: 'conv-carlos-123',
      persona: 'usr_carlos',
      hydration: null,
      activeDecisions: [],
      decisionsHistory: [],
      revokedKeys: [],
      pendingTask: {
        decisionId: 'task-assign-999',
        question: '¿A quién deseas asignar el ticket?',
        options: ['usr_carlos', 'usr_laura'],
        targetToolName: 'assign_ticket',
        missingParameterName: 'assignee_username',
        status: 'pending',
        timestamp: new Date().toISOString()
      },
      hitlStatus: 'resuming_task', // Reanudación en tránsito
      persistedTurns: [],
      isRecoveryRequired: false,
      recoveryAlert: null,
      rawV3Events: []
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll<HTMLButtonElement>('.btn-option');
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);

    // Clicking disabled button must not emit
    buttons[0].click();
    expect(emittedPayload).toBeNull();
  });

  it('renders recovery alert when isRecoveryRequired is true', () => {
    const mockState: AgentV3State = {
      executionId: 'v3-exec-5',
      confirmedConversationId: 'conv-carlos-123',
      persona: 'usr_carlos',
      hydration: null,
      activeDecisions: [],
      decisionsHistory: [],
      revokedKeys: [],
      pendingTask: null,
      hitlStatus: 'recovery_required',
      persistedTurns: [],
      isRecoveryRequired: true,
      recoveryAlert: {
        decisionId: 'task-mut-fail-1',
        targetToolName: 'update_ticket_status',
        status: 'recovery_required',
        recoveryReason: 'Timeout transaccional incierto en commit MySQL',
        timestamp: new Date().toISOString()
      },
      rawV3Events: []
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const alert = compiled.querySelector('.recovery-alert-card');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Reconciliación Requerida');
    expect(alert?.textContent).toContain('Timeout transaccional incierto en commit MySQL');
    expect(alert?.textContent).toContain('update_ticket_status');
  });

  it('renders memory timeline with confirmed turns without fabricating text', () => {
    const mockState: AgentV3State = {
      executionId: 'v3-exec-6',
      confirmedConversationId: 'conv-carlos-101',
      persona: 'usr_carlos',
      hydration: {
        conversationId: 'conv-carlos-101',
        hydratedTurnsCount: 3,
        decisionsCount: 1,
        activeDecisions: [],
        budget: {
          queryTokensEst: 20,
          systemPromptTokensEst: 350,
          decisionsTokensEst: 40,
          historyTokensEst: 500,
          totalInitialTokensEst: 910,
          availableHistoryBudget: 1200,
          historyTurnsCount: 3,
          decisionsCount: 1,
          maxContextLimit: 4096,
          isHeuristicEstimate: true
        },
        hydratedAt: '2026-10-10T12:00:00Z'
      },
      activeDecisions: [],
      decisionsHistory: [],
      revokedKeys: [],
      pendingTask: null,
      hitlStatus: 'none',
      persistedTurns: [
        { turnId: 'turn-001', conversationId: 'conv-carlos-101', status: 'stored_in_mysql', timestamp: '2026-10-10T12:01:00Z' },
        { turnId: 'turn-002', conversationId: 'conv-carlos-101', status: 'stored_in_mysql', timestamp: '2026-10-10T12:02:00Z' }
      ],
      isRecoveryRequired: false,
      recoveryAlert: null,
      rawV3Events: []
    };

    fixture.componentRef.setInput('state', mockState);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.hydration-node .node-title')?.textContent).toContain('MEMORY_HYDRATED');
    expect(compiled.querySelector('.hydration-node .node-desc')?.textContent).toContain('3 turnos');

    const turnNodes = compiled.querySelectorAll('.persistence-node');
    expect(turnNodes.length).toBe(2);
    expect(turnNodes[0].querySelector('.node-title')?.textContent).toContain('Turno #1');
    expect(turnNodes[0].querySelector('.node-details')?.textContent).toContain('turn-001');
    expect(turnNodes[1].querySelector('.node-title')?.textContent).toContain('Turno #2');
    expect(turnNodes[1].querySelector('.node-details')?.textContent).toContain('turn-002');
  });
});
