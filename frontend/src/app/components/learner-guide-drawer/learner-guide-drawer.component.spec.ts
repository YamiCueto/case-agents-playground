import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LearnerGuideDrawerComponent } from './learner-guide-drawer.component';
import { LearnerGuideService } from '../../services/learner-guide.service';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { GuidesManifest } from '../../models/learner-guide.models';

describe('LearnerGuideDrawerComponent', () => {
  let component: LearnerGuideDrawerComponent;
  let fixture: ComponentFixture<LearnerGuideDrawerComponent>;

  const mockManifest: GuidesManifest = {
    versions: {
      v1: {
        versionId: 'v1',
        title: 'Agent v1 — Tool Calling',
        filename: 'agent-v1-tool-calling.md',
        whatItDoes: '### Objetivo\nEntender Tool Calling',
        beforeStarting: 'Revisa la conexión.',
        intents: [
          {
            intention: 'Consultar un ticket',
            prompt: 'Consulta el ticket TICK-1001 y dime su estado',
            capability: 'get_ticket_by_id',
            outcome: 'Devuelve estado OPEN'
          }
        ],
        labs: [
          {
            number: 1,
            title: 'Laboratorio 1 — Primer contacto',
            prompt: '¿Cuál es el procedimiento general para atender un incidente?',
            objective: 'Respuesta sin herramienta',
            context: 'Conocimiento general',
            preparation: 'Servicios conectados',
            reflection: '¿Qué diferencia observas?',
            successCriteria: 'No hubo llamadas a herramienta',
            fullContent: 'Cuerpo del laboratorio 1'
          }
        ],
        whatItDoesNotDo: 'No dispone de Agent Loop ni memoria.',
        runtimeInspector: 'Hasta 7 hops.',
        frequentErrors: 'entidad_no_encontrada.',
        challenge: 'Crea 3 prompts.',
        fullMarkdown: '# Agent v1 Completo'
      },
      v4: {
        versionId: 'v4',
        title: 'Agent v4 — Planning',
        filename: 'agent-v4-planning.md',
        whatItDoes: '### Objetivo\nPlanificación DAG',
        beforeStarting: 'Revisa MySQL.',
        intents: [
          {
            intention: 'Diagnosticar ticket',
            prompt: 'Diagnosticar ticket TICK-1001 y proponer plan',
            capability: 'S1 TOOL, S2 RUNTIME, S3 MODEL',
            outcome: 'Plan DAG completado'
          }
        ],
        labs: [],
        whatItDoesNotDo: 'Sin HITL v5.',
        runtimeInspector: 'Plan DAG Viewer.',
        frequentErrors: 'Runtime Stall.',
        challenge: 'Diseña un DAG.',
        fullMarkdown: '# Agent v4 Completo'
      }
    },
    extraDocs: {
      'catalogo-herramientas.md': '# Catálogo',
      'guia-runtime-inspector.md': '# Guía Inspector',
      'troubleshooting.md': '# Troubleshooting',
      'README.md': '# README'
    }
  };

  beforeEach(async () => {
    const mockHttp = {
      get: vi.fn().mockReturnValue(of(mockManifest))
    };

    await TestBed.configureTestingModule({
      imports: [LearnerGuideDrawerComponent],
      providers: [
        { provide: HttpClient, useValue: mockHttp }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LearnerGuideDrawerComponent);
    component = fixture.componentInstance;
    component.guideService.manifest.set(mockManifest);
    fixture.detectChanges();
  });

  it('renders learner guide header and version tabs', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.drawer-header h3')?.textContent).toContain('Guía del Aprendiz');
    expect(el.querySelectorAll('.ver-btn').length).toBe(4);
  });

  it('switches tabs properly between what, prompts, tools, limits, labs, inspector, full', () => {
    component.activeTab.set('prompts');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.intents-table-container')).toBeTruthy();
    expect(el.querySelector('.prompt-cell code')?.textContent).toContain('TICK-1001');

    component.activeTab.set('limits');
    fixture.detectChanges();
    expect(el.querySelector('.limits-banner')).toBeTruthy();

    component.activeTab.set('labs');
    fixture.detectChanges();
    expect(el.querySelector('.lab-card')).toBeTruthy();
  });

  it('changes active version and emits selectAgent', () => {
    const emitSpy = vi.spyOn(component.selectAgent, 'emit');
    component.setVersion('v4');
    expect(component.activeVersion()).toBe('v4');
    expect(emitSpy).toHaveBeenCalledWith('v4');
  });

  it('emits close event when escape key is pressed', () => {
    const closeSpy = vi.spyOn(component.close, 'emit');
    component.onEscape();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('copies prompt text and sets temporary copied state', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      writable: true,
      configurable: true
    });
    await component.copyPrompt('Consulta TICK-1001', 'prompt-0');
    expect(component.copiedPromptKey()).toBe('prompt-0');
  });
});
