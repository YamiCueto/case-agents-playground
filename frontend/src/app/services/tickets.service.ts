import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentMeta, PersonaInfo, TicketSummary, TicketDetail } from '../models/agent.models';

@Injectable({
  providedIn: 'root'
})
export class TicketsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8000/api';

  getAgents(): Observable<AgentMeta[]> {
    return this.http.get<AgentMeta[]>(`${this.baseUrl}/agents`);
  }

  getPersonas(): Observable<PersonaInfo[]> {
    return this.http.get<PersonaInfo[]>(`${this.baseUrl}/personas`);
  }

  getTickets(viewerUsername: string = 'usr_carlos'): Observable<TicketSummary[]> {
    return this.http.get<TicketSummary[]>(`${this.baseUrl}/tickets`, {
      params: { viewer_username: viewerUsername }
    });
  }

  getTicketDetail(ticketCode: string, viewerUsername: string = 'usr_carlos'): Observable<TicketDetail> {
    return this.http.get<TicketDetail>(`${this.baseUrl}/tickets/${ticketCode}`, {
      params: { viewer_username: viewerUsername }
    });
  }

  getHealth(): Observable<{ status: string; database: string; llm_server: string }> {
    return this.http.get<{ status: string; database: string; llm_server: string }>(`${this.baseUrl}/health`);
  }
}
