import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Agent Engineering Playground');
  });

  describe('Fase 6.4: Continuidad conversacional y reanudación HITL', () => {
    it('should isolate conversation IDs and messages between personas', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;

      // Carlos inicia conversación y recibe confirmación de FastAPI
      app.selectedPersona.set('usr_carlos');
      app.activeConversationsByPersona.set({ usr_carlos: 'conv-carlos-123' });
      app.messages.set([
        { id: 'm1', sender: 'user', persona: 'usr_carlos', text: 'Hola de Carlos', timestamp: '2026-10-10T20:00:00Z' },
        { id: 'm2', sender: 'agent', text: 'Respuesta para Carlos', timestamp: '2026-10-10T20:00:01Z' }
      ]);

      // Cambiar a Laura
      app.onSelectPersona('usr_laura');
      expect(app.selectedPersona()).toBe('usr_laura');
      // Laura no debe ver los mensajes de Carlos
      expect(app.messages().length).toBe(0);
      // Ni compartir el conversation_id de Carlos
      expect(app.activeConversationsByPersona()['usr_laura']).toBeUndefined();
      expect(app.activeConversationsByPersona()['usr_carlos']).toBe('conv-carlos-123');

      // Laura agrega sus propios mensajes
      app.messages.set([
        { id: 'm3', sender: 'user', persona: 'usr_laura', text: 'Hola de Laura', timestamp: '2026-10-10T20:05:00Z' }
      ]);
      app.activeConversationsByPersona.update(prev => ({ ...prev, usr_laura: 'conv-laura-789' }));

      // Volver a Carlos: sus mensajes y conversación deben restaurarse intactos
      app.onSelectPersona('usr_carlos');
      expect(app.selectedPersona()).toBe('usr_carlos');
      expect(app.messages().length).toBe(2);
      expect(app.messages()[0].text).toBe('Hola de Carlos');
      expect(app.activeConversationsByPersona()['usr_carlos']).toBe('conv-carlos-123');
    });

    it('should handle onSelectTaskOption by marking task as resuming and updating chat', async () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      const streamService = (app as any).streamService;
      const eventStore = (app as any).eventStore;

      // Simular streamService.streamChat
      let capturedPayload: any = null;
      let capturedCallbacks: any = null;
      vi.spyOn(streamService, 'streamChat').mockImplementation(async (payload: any, callbacks: any) => {
        capturedPayload = payload;
        capturedCallbacks = callbacks;
      });

      app.selectedPersona.set('usr_carlos');
      app.activeConversationsByPersona.set({ usr_carlos: 'conv-confirmed-555' });

      // Usuario selecciona una opción HITL
      app.onSelectTaskOption({ decisionId: 'dec-priority-1', selectedValue: 'CRITICAL' });

      // 1. Debe haber marcado el estado local a resuming_task
      expect(eventStore.resumingTaskId()).toBe('dec-priority-1');
      expect(eventStore.v3State().hitlStatus).toBe('resuming_task');

      // 2. Chat debe mostrar la selección confirmada y placeholder de loading
      const msgs = app.messages();
      expect(msgs.length).toBe(2);
      expect(msgs[0].text).toContain('[Decisión HITL]: Selección confirmada -> "CRITICAL"');
      expect(msgs[1].isLoading).toBe(true);

      // 3. Payload debe contener decision_id, selected_value y conversation_id confirmado
      expect(capturedPayload).toEqual({
        agent_version: 'v3',
        query: 'Opción seleccionada: CRITICAL',
        user_persona: 'usr_carlos',
        conversation_id: 'conv-confirmed-555',
        decision_id: 'dec-priority-1',
        selected_value: 'CRITICAL'
      });

      // 4. Doble clic no debe disparar otra petición mientras esté en resuming_task
      capturedPayload = null;
      app.onSelectTaskOption({ decisionId: 'dec-priority-1', selectedValue: 'HIGH' });
      expect(capturedPayload).toBeNull();

      // 5. Simular confirmación desde SSE: FINAL_SYNTHESIS y RUN_COMPLETED
      capturedCallbacks.onEvent({
        event_id: 'evt-res-1',
        agent_version: 'v3',
        type: 'FINAL_SYNTHESIS',
        payload: { answer: 'Tarea resuelta con éxito en MySQL.' }
      });
      capturedCallbacks.onEvent({
        event_id: 'evt-res-2',
        agent_version: 'v3',
        type: 'RUN_COMPLETED',
        payload: { status: 'completed' }
      });

      const updatedMsgs = app.messages();
      expect(updatedMsgs[1].text).toBe('Tarea resuelta con éxito en MySQL.');
      expect(updatedMsgs[1].isLoading).toBe(false);
    });

    it('should revert resumingTaskId if stream error occurs so user can retry', async () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      const streamService = (app as any).streamService;
      const eventStore = (app as any).eventStore;

      let capturedCallbacks: any = null;
      vi.spyOn(streamService, 'streamChat').mockImplementation(async (_payload: any, callbacks: any) => {
        capturedCallbacks = callbacks;
      });

      app.onSelectTaskOption({ decisionId: 'dec-err-1', selectedValue: 'MEDIUM' });
      expect(eventStore.resumingTaskId()).toBe('dec-err-1');

      // Simular error de transporte SSE
      capturedCallbacks.onError(new Error('Network timeout'));

      // resumingTaskId debe haberse liberado para permitir reintento
      expect(eventStore.resumingTaskId()).toBeNull();
      const lastMsg = app.messages().at(-1);
      expect(lastMsg?.text).toContain('Error en comunicación SSE: Network timeout');
      expect(lastMsg?.isLoading).toBe(false);
    });
  });
});
