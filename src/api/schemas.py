from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, model_validator


class ChatRequest(BaseModel):
    agent_version: str = Field(min_length=2, max_length=10)
    query: str = Field(default="")
    user_persona: str = Field(default="usr_carlos")
    conversation_id: Optional[str] = None
    turn_id: Optional[str] = None
    session_id: Optional[str] = None
    selected_value: Optional[str] = None
    decision_id: Optional[str] = None

    @model_validator(mode="after")
    def validate_query_or_decision(self) -> "ChatRequest":
        if not self.decision_id and (not self.query or not self.query.strip()):
            raise ValueError("El campo 'query' no puede estar vacío a menos que se especifique 'decision_id'.")
        if self.decision_id and (not self.query or not self.query.strip()):
            self.query = f"Selección HITL: {self.selected_value or self.decision_id}"
        return self


class AgentMeta(BaseModel):
    id: str
    name: str
    workshop: str
    enabled: bool
    status: str
    description: str
    badge: str
    hops_count: Optional[int] = None


class PersonaInfo(BaseModel):
    username: str
    full_name: str
    role: str
    description: str
    is_lab_simulation: bool = True


class StreamEvent(BaseModel):
    event_id: str
    agent_version: str
    hop_number: Optional[int] = None
    hop_title: Optional[str] = None
    execution_id: Optional[str] = None
    iteration_index: Optional[int] = None
    phase: Optional[str] = None
    correlation_id: Optional[str] = None
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class HealthResponse(BaseModel):
    status: str
    database: str
    llm_server: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
