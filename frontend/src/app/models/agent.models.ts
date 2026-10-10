export interface AgentMeta {
  id: string;
  name: string;
  workshop: string;
  enabled: boolean;
  status: string;
  description: string;
  badge: string;
  hops_count?: number;
}

export interface PersonaInfo {
  username: string;
  full_name: string;
  role: string;
  description: string;
  is_lab_simulation: boolean;
}

export interface StreamEvent {
  event_id: string;
  agent_version: string;
  hop_number?: number;
  hop_title?: string;
  execution_id?: string;
  iteration_index?: number;
  phase?: string;
  correlation_id?: string;
  type: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  persona?: string;
  text: string;
  timestamp: string;
  events?: StreamEvent[];
  isLoading?: boolean;
}

export interface TicketSummary {
  code: string;
  title: string;
  status: string;
  priority: string;
  category_code: string;
  creator_username: string;
  assignee_username?: string;
  sla_due_at: string;
  is_overdue: boolean;
}

export interface CommentItem {
  id?: number;
  author_username: string;
  content: string;
  is_internal: boolean;
  created_at?: string;
}

export interface HistoryItem {
  id?: number;
  operator_username: string;
  action: string;
  old_value?: string;
  new_value: string;
  created_at?: string;
}

export interface TicketDetail {
  code: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category_code: string;
  creator_username: string;
  assignee_username?: string;
  sla_due_at: string;
  resolved_at?: string;
  closed_at?: string;
  is_overdue: boolean;
  comments: CommentItem[];
  history: HistoryItem[];
}

export interface HealthStatus {
  status: string;
  database: string;
  llm_server: string;
  timestamp: string;
}
