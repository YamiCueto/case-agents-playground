import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { AgentMeta, PersonaInfo, TicketSummary, TicketDetail } from '../models/agent.models';
import { DemoModeService } from './demo-mode.service';
import { DemoRuntimeAdapterService } from './demo-runtime-adapter.service';

@Injectable({
  providedIn: 'root'
})
export class TicketsService {
  private readonly http = inject(HttpClient);
  private readonly demoMode = inject(DemoModeService);
  private readonly demoAdapter = inject(DemoRuntimeAdapterService);
  private readonly baseUrl = 'http://localhost:8000/api';

  getAgents(): Observable<AgentMeta[]> {
    if (this.demoMode.isDemoMode()) {
      return of(this.demoAdapter.getStaticAgents());
    }
    return this.http.get<AgentMeta[]>(`${this.baseUrl}/agents`);
  }

  getPersonas(): Observable<PersonaInfo[]> {
    if (this.demoMode.isDemoMode()) {
      return of(this.demoAdapter.getStaticPersonas());
    }
    return this.http.get<PersonaInfo[]>(`${this.baseUrl}/personas`);
  }

  getTickets(viewerUsername: string = 'usr_carlos'): Observable<TicketSummary[]> {
    if (this.demoMode.isDemoMode()) {
      return of(this.demoAdapter.getStaticTickets(viewerUsername));
    }
    return this.http.get<TicketSummary[]>(`${this.baseUrl}/tickets`, {
      params: { viewer_username: viewerUsername }
    });
  }

  getTicketDetail(ticketCode: string, viewerUsername: string = 'usr_carlos'): Observable<TicketDetail> {
    if (this.demoMode.isDemoMode()) {
      const tickets = this.demoAdapter.getStaticTickets(viewerUsername);
      const match = tickets.find((t) => t.code === ticketCode) || tickets[0];
      return of({
        ...match,
        description: 'Detalle de ticket simulado en modo Demo estático sin base de datos MySQL.',
        comments: [],
        history: []
      });
    }
    return this.http.get<TicketDetail>(`${this.baseUrl}/tickets/${ticketCode}`, {
      params: { viewer_username: viewerUsername }
    });
  }

  getHealth(): Observable<{ status: string; database: string; llm_server: string }> {
    if (this.demoMode.isDemoMode()) {
      return of({ status: 'demo', database: 'static_in_memory', llm_server: 'verified_traces' });
    }
    return this.http.get<{ status: string; database: string; llm_server: string }>(`${this.baseUrl}/health`);
  }
}

