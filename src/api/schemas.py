from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    agent_version: str = Field(min_length=2, max_length=10)
    query: str = Field(min_length=1)
    user_persona: str = Field(default="usr_carlos")


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
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class HealthResponse(BaseModel):
    status: str
    database: str
    llm_server: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
