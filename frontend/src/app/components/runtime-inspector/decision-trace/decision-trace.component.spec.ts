import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DecisionTraceComponent } from './decision-trace.component';
import { DecisionTraceEntry } from '../../../models/decision-trace.models';

describe('DecisionTraceComponent', () => {
  let component: DecisionTraceComponent;
  let fixture: ComponentFixture<DecisionTraceComponent>;

  const mockEntries: DecisionTraceEntry[] = [
    {
      id: 'trace-1',
      eventId: 'evt-001',
      timestamp: '2026-10-11T12:00:00Z',
      category: 'runtime',
      actor: 'Runtime API',
      actorBadge: 'RUNTIME',
      title: 'Inicio de turno y recepción de consulta',
      eventType: 'USER_REQUEST',
      status: 'completed',
      summaryHeadline: 'Petición recibida de Carlos Restrepo',
      summaryPedagogy: 'Punto de entrada: el sistema registra la intención.',
      evidenceText: 'Consulta: "Asignar ticket TICK-1001 a Sofia"',
      sanitizedParams: [
        { key: 'query', value: 'Asignar ticket TICK-1001 a Sofia' },
        { key: 'persona', value: 'Carlos Restrepo' }
      ]
    },
    {
      id: 'trace-2',
      eventId: 'evt-002',
      timestamp: '2026-10-11T12:00:01Z',
      category: 'memoria',
      actor: 'MemoryManager (MySQL)',
      actorBadge: 'MEMORIA',
      title: 'Hidratación de memoria conversacional y preferencias',
      eventType: 'MEMORY_HYDRATED',
      status: 'completed',
      summaryHeadline: 'Memoria cargada: 3 turnos previos',
      summaryPedagogy: 'Recuperación de estado desde base de datos.',
      evidenceText: 'Conversación confirmada: conv_test_42',
      sanitizedParams: [
        { key: 'conversation_id', value: 'conv_test_42' },
        { key: 'turns_count', value: 3 }
      ]
    },
    {
      id: 'trace-3',
      eventId: 'evt-003',
      timestamp: '2026-10-11T12:00:02Z',
      category: 'modelo',
      actor: 'Qwen 3.5 4B (Propuesta)',
      actorBadge: 'MODELO',
      title: 'Propuesta de herramienta: assign_ticket',
      eventType: 'TOOL_CALL_PROPOSED',
      status: 'completed',
      summaryHeadline: 'El modelo solicitó invocar "assign_ticket"',
      summaryPedagogy: 'Paso causal verificable: el modelo declara formalmente qué función ejecutar.',
      evidenceText: 'Herramienta: assign_ticket | Mutativa: Sí',
      iterationIndex: 1,
      hopNumber: 3,
      sanitizedParams: [
        { key: 'tool_name', value: 'assign_ticket' },
        { key: 'arguments', value: '{"ticket_id":"TICK-1001"}' },
        { key: 'is_mutative', value: true }
      ]
    },
    {
      id: 'trace-4',
      eventId: 'evt-004',
      timestamp: '2026-10-11T12:00:04Z',
      category: 'resultado',
      actor: 'Runtime Soberano AEP',
      actorBadge: 'RESULTADO',
      title: 'Ejecución finalizada con éxito',
      eventType: 'RUN_COMPLETED',
      status: 'completed',
      summaryHeadline: 'Turno agéntico finalizado (Razón: final_answer)',
      summaryPedagogy: 'Ciclo cerrado satisfactoriamente.',
      evidenceText: 'Duración total: 420 ms',
      executionDurationMs: 420,
      sanitizedParams: [
        { key: 'stop_reason', value: 'final_answer' },
        { key: 'total_duration_ms', value: 420 }
      ]
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionTraceComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DecisionTraceComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('entries', mockEntries);
    fixture.detectChanges();
  });

  it('renders the header with title, entry count and pedagogical notice', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.trace-title')?.textContent).toContain('Traza de decisiones observable');
    expect(compiled.querySelector('.count-chip')?.textContent).toContain('4 eventos');
    expect(compiled.querySelector('.pedagogy-alert')?.textContent).toContain('Evidencia técnica observable');
    expect(compiled.querySelector('.pedagogy-alert')?.textContent).toContain('No se afirma revelar el razonamiento interno privado del LLM');
  });

  it('filters entries by sovereign category tabs', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    // Filter by Modelo
    component.selectedCategory.set('modelo');
    fixture.detectChanges();
    expect(component.filteredEntries().length).toBe(1);
    expect(compiled.querySelectorAll('.timeline-card').length).toBe(1);
    expect(compiled.querySelector('.category-pill')?.textContent?.trim()).toBe('MODELO');

    // Filter by Memoria
    component.selectedCategory.set('memoria');
    fixture.detectChanges();
    expect(component.filteredEntries().length).toBe(1);
    expect(compiled.querySelector('.category-pill')?.textContent?.trim()).toBe('MEMORIA');

    // Filter by Runtime
    component.selectedCategory.set('runtime');
    fixture.detectChanges();
    expect(component.filteredEntries().length).toBe(1);
    expect(compiled.querySelector('.category-pill')?.textContent?.trim()).toBe('RUNTIME');

    // Filter by Resultado
    component.selectedCategory.set('resultado');
    fixture.detectChanges();
    expect(component.filteredEntries().length).toBe(1);
    expect(compiled.querySelector('.category-pill')?.textContent?.trim()).toBe('RESULTADO');

    // Back to All
    component.selectedCategory.set('all');
    fixture.detectChanges();
    expect(component.filteredEntries().length).toBe(4);
  });

  it('displays summary view details by default', () => {
    fixture.componentRef.setInput('viewMode', 'summary');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.summary-view-content')).not.toBeNull();
    expect(compiled.querySelector('.technical-view-content')).toBeNull();
    expect(compiled.textContent).toContain('Petición recibida de Carlos Restrepo');
    expect(compiled.textContent).toContain('Por qué importa:');
    expect(compiled.textContent).toContain('Evidencia observable:');
  });

  it('displays technical view with sanitized parameters and event metadata', () => {
    fixture.componentRef.setInput('viewMode', 'technical');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.technical-view-content')).not.toBeNull();
    expect(compiled.querySelector('.summary-view-content')).toBeNull();
    expect(compiled.textContent).toContain('Tipo de Evento:');
    expect(compiled.textContent).toContain('Parámetros Sanitizados (Sin Credenciales):');
    expect(compiled.textContent).toContain('USER_REQUEST');
    expect(compiled.textContent).toContain('assign_ticket');
  });

  it('emits toggleViewMode output when mode buttons are clicked', () => {
    let emittedMode: string | null = null;
    component.toggleViewMode.subscribe((mode) => {
      emittedMode = mode;
    });

    component.onToggleViewMode('technical');
    expect(emittedMode).toBe('technical');

    component.onToggleViewMode('summary');
    expect(emittedMode).toBe('summary');
  });

  it('emits closeTrace output when close button is clicked', () => {
    let closed = false;
    component.closeTrace.subscribe(() => {
      closed = true;
    });

    const closeBtn = fixture.nativeElement.querySelector('.btn-close-trace') as HTMLButtonElement;
    closeBtn.click();
    expect(closed).toBe(true);
  });

  it('shows empty state card when no entries exist in category', () => {
    fixture.componentRef.setInput('entries', []);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-trace-card')).not.toBeNull();
    expect(compiled.textContent).toContain('Sin eventos observables en esta categoría');
  });
});
