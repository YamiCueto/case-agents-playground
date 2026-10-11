import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AgentAvatar3DComponent } from './agent-avatar-3d.component';

describe('AgentAvatar3DComponent (Phase UI-5.1 Reactive 3D Avatar)', () => {
  let component: AgentAvatar3DComponent;
  let fixture: ComponentFixture<AgentAvatar3DComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentAvatar3DComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AgentAvatar3DComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes in IDLE state by default with proper Spanish label', () => {
    expect(component.normalizedMood()).toBe('idle');
    expect(component.getMoodText('idle')).toBe('En Reposo');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.mood-pill')?.classList.contains('idle')).toBe(true);
    expect(compiled.querySelector('.mood-label')?.textContent).toBe('En Reposo');
  });

  it('correctly maps all 8 official visual states and Spanish labels', () => {
    // 1. INFERENCE
    fixture.componentRef.setInput('mood', 'inference');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('inference');
    expect(component.getMoodText('inference')).toBe('Inferencia Activa');

    // running backward compatibility
    fixture.componentRef.setInput('mood', 'running');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('inference');

    // 2. TOOL_PROPOSED
    fixture.componentRef.setInput('mood', 'tool_proposed');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('tool_proposed');
    expect(component.getMoodText('tool_proposed')).toBe('Llamada Propuesta');

    // pointing backward compatibility
    fixture.componentRef.setInput('mood', 'pointing');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('tool_proposed');

    // 3. TOOL_EXECUTING
    fixture.componentRef.setInput('mood', 'tool_executing');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('tool_executing');
    expect(component.getMoodText('tool_executing')).toBe('Ejecución en CPU / DB');

    // 4. TOOL_COMPLETED
    fixture.componentRef.setInput('mood', 'tool_completed');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('tool_completed');
    expect(component.getMoodText('tool_completed')).toBe('Retorno de Datos');

    // 5. STREAMING
    fixture.componentRef.setInput('mood', 'streaming');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('streaming');
    expect(component.getMoodText('streaming')).toBe('Síntesis Grounded');

    // 6. COMPLETED
    fixture.componentRef.setInput('mood', 'completed');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('completed');
    expect(component.getMoodText('completed')).toBe('Grounded & Listo');

    // 7. ERROR
    fixture.componentRef.setInput('mood', 'error');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('error');
    expect(component.getMoodText('error')).toBe('Fallo en Runtime');

    // failed backward compatibility
    fixture.componentRef.setInput('mood', 'failed');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('error');

    // 8. IDLE
    fixture.componentRef.setInput('mood', 'idle');
    fixture.detectChanges();
    expect(component.normalizedMood()).toBe('idle');
  });

  it('renders 2D high-fidelity vector fallback when hasWebGLError is true', () => {
    fixture.componentRef.setInput('hasWebGLError', true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.avatar-2d-fallback')).not.toBeNull();
    expect(compiled.querySelector('.three-canvas')).toBeNull();
    expect(compiled.querySelector('.fallback-caption')?.textContent).toContain('Robot AEP • Modo Vectorial');
  });

  it('cleans up resources gracefully on destroy without throwing', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
