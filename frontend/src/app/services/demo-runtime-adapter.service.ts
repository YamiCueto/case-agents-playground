import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StreamEvent, AgentMeta, PersonaInfo, TicketSummary, HealthStatus } from '../models/agent.models';
import { StreamCallbacks } from './agent-stream.service';
import { DemoScenario, DemoCatalog, PlaybackSpeed, DemoPlaybackState } from '../models/demo.models';

const FALLBACK_AGENTS: AgentMeta[] = [
  { id: 'v1', name: 'Agent v1 — Single-Step Router', workshop: 'Workshop 01', enabled: true, status: 'ready', description: 'Enrutamiento determinista de herramientas en un solo paso', badge: 'v1', hops_count: 7 },
  { id: 'v2', name: 'Agent v2 — ReAct Loop', workshop: 'Workshop 02', enabled: true, status: 'ready', description: 'Ciclo iterativo de razonamiento y acción con límites de parada', badge: 'v2', hops_count: 14 },
  { id: 'v3', name: 'Agent v3 — Memoria & Estado', workshop: 'Workshop 03', enabled: true, status: 'ready', description: 'Persistencia de sesión, memoria conversacional y HITL', badge: 'v3', hops_count: 10 },
  { id: 'v4', name: 'Agent v4 — Plan-and-Solve DAG', workshop: 'Workshop 04', enabled: true, status: 'ready', description: 'Descomposición jerárquica en grafo acíclico dirigido', badge: 'v4', hops_count: 12 }
];

const FALLBACK_PERSONAS: PersonaInfo[] = [
  { username: 'usr_carlos', full_name: 'Carlos Martínez', role: 'Cliente', description: 'Usuario final reportando incidencias', is_lab_simulation: true },
  { username: 'usr_maria', full_name: 'María Gómez', role: 'Agente de Soporte', description: 'Operadora de soporte técnico de nivel 1', is_lab_simulation: true },
  { username: 'usr_admin', full_name: 'Admin Sistema', role: 'Administrador', description: 'Superusuario con acceso completo a auditoría', is_lab_simulation: true }
];

const FALLBACK_TICKETS: TicketSummary[] = [
  { code: 'TICK-1001', title: 'Fallo de autenticación en portal web', status: 'OPEN', priority: 'HIGH', category_code: 'AUTH', creator_username: 'usr_carlos', assignee_username: 'usr_maria', sla_due_at: '2026-10-15T12:00:00Z', is_overdue: true },
  { code: 'TICK-1002', title: 'Error al exportar reporte PDF mensual', status: 'IN_PROGRESS', priority: 'MEDIUM', category_code: 'REPORT', creator_username: 'usr_carlos', assignee_username: 'usr_maria', sla_due_at: '2026-10-20T12:00:00Z', is_overdue: false },
  { code: 'TICK-1003', title: 'Solicitud de reinicio de contraseña VPN', status: 'CLOSED', priority: 'LOW', category_code: 'VPN', creator_username: 'usr_carlos', assignee_username: 'usr_carlos', sla_due_at: '2026-10-10T12:00:00Z', is_overdue: false }
];

@Injectable({
  providedIn: 'root'
})
export class DemoRuntimeAdapterService {
  private readonly http = inject(HttpClient);

  readonly catalog = signal<DemoCatalog | null>(null);
  readonly isLoadingCatalog = signal<boolean>(false);
  readonly activePlaybackState = signal<DemoPlaybackState>('idle');
  readonly currentEventIndex = signal<number>(0);
  readonly totalEvents = signal<number>(0);
  readonly playbackSpeed = signal<PlaybackSpeed>(1);
  readonly activeScenarioId = signal<string | null>(null);

  private playbackTimer: any = null;
  private isPaused = false;
  private isCancelled = false;

  constructor() {
    this.loadCatalog();
  }

  async loadCatalog(): Promise<void> {
    if (this.catalog() || this.isLoadingCatalog()) return;
    this.isLoadingCatalog.set(true);

    try {
      const data = await firstValueFrom(
        this.http.get<DemoCatalog>('demo/scenarios.json')
      );
      this.catalog.set(data);
    } catch (err) {
      console.warn('No se pudo cargar demo/scenarios.json desde URL relativa, intentando /demo/scenarios.json:', err);
      try {
        const fallbackData = await firstValueFrom(
          this.http.get<DemoCatalog>('/demo/scenarios.json')
        );
        this.catalog.set(fallbackData);
      } catch (err2) {
        console.error('Error definitivo cargando catálogo demo:', err2);
      }
    } finally {
      this.isLoadingCatalog.set(false);
    }
  }

  getScenariosForVersion(version: string): DemoScenario[] {
    const scenarios = this.catalog()?.scenarios || [];
    return scenarios.filter((s) => s.version === version);
  }

  getScenarioById(scenarioId: string): DemoScenario | undefined {
    return this.catalog()?.scenarios.find((s) => s.id === scenarioId);
  }

  getAllScenarios(): DemoScenario[] {
    return this.catalog()?.scenarios || [];
  }

  getStaticAgents(): AgentMeta[] {
    return FALLBACK_AGENTS;
  }

  getStaticPersonas(): PersonaInfo[] {
    return FALLBACK_PERSONAS;
  }

  getStaticTickets(viewerUsername: string = 'usr_carlos'): TicketSummary[] {
    return FALLBACK_TICKETS;
  }

  getStaticHealth(): HealthStatus {
    return {
      status: 'demo',
      database: 'static_in_memory',
      llm_server: 'verified_traces',
      timestamp: new Date().toISOString()
    };
  }

  async streamScenario(
    scenario: DemoScenario,
    callbacks: StreamCallbacks,
    options: { speed?: PlaybackSpeed } = {}
  ): Promise<void> {
    this.cancelStream();

    this.activeScenarioId.set(scenario.id);
    this.activePlaybackState.set('playing');
    this.totalEvents.set(scenario.events.length);
    this.currentEventIndex.set(0);
    this.isPaused = false;
    this.isCancelled = false;

    if (options.speed) {
      this.playbackSpeed.set(options.speed);
    }

    const events = scenario.events;
    const baseInterval = 180; // ms por evento base

    for (let i = 0; i < events.length; i++) {
      if (this.isCancelled) {
        this.activePlaybackState.set('idle');
        return;
      }

      // Si está en pausa, esperar a que se reanude
      while (this.isPaused && !this.isCancelled) {
        await this.delay(100);
      }

      if (this.isCancelled) {
        this.activePlaybackState.set('idle');
        return;
      }

      const event = events[i];
      this.currentEventIndex.set(i + 1);

      try {
        callbacks.onEvent(event);
      } catch (err) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        this.activePlaybackState.set('idle');
        return;
      }

      // Esperar tiempo proporcional a la velocidad
      const delayTime = Math.max(30, Math.round(baseInterval / this.playbackSpeed()));
      await this.delay(delayTime);
    }

    this.activePlaybackState.set('completed');
    callbacks.onComplete();
  }

  pausePlayback(): void {
    if (this.activePlaybackState() === 'playing') {
      this.isPaused = true;
      this.activePlaybackState.set('paused');
    }
  }

  resumePlayback(): void {
    if (this.activePlaybackState() === 'paused') {
      this.isPaused = false;
      this.activePlaybackState.set('playing');
    }
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.playbackSpeed.set(speed);
  }

  cancelStream(): void {
    this.isCancelled = true;
    this.isPaused = false;
    this.activePlaybackState.set('idle');
    this.activeScenarioId.set(null);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
