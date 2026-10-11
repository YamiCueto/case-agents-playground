import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.infrastructure.database.connection import get_app_session_factory
from src.infrastructure.database.models import TicketModel, UserModel

print("=== FASE 1: VERIFICACIÓN DE SERVICIOS REALES ===")

# 1. Check MySQL
try:
    SessionFactory = get_app_session_factory()
    with SessionFactory() as db:
        user_count = db.query(UserModel).count()
        ticket_count = db.query(TicketModel).count()
        tickets = db.query(TicketModel).all()
        print(f"[MySQL Real DB] CONEXIÓN EXITOSA: {user_count} usuarios, {ticket_count} tickets.")
        for t in tickets[:5]:
            print(f"   - {t.code}: {t.title} | Estado={t.status} | Prioridad={t.priority} | SLA={t.sla_due_at}")
except Exception as e:
    print(f"[MySQL Real DB] ERROR: {e}")

# 2. Check llama.cpp Models
try:
    req = urllib.request.urlopen("http://127.0.0.1:8080/v1/models", timeout=5)
    models_data = json.loads(req.read().decode("utf-8"))
    model_name = models_data.get("models", [{}])[0].get("name", "Desconocido")
    print(f"[llama.cpp /v1/models] DISPONIBLE: Modelo cargado -> {model_name}")
except Exception as e:
    print(f"[llama.cpp /v1/models] ERROR: {e}")

# 3. Check llama.cpp Real Inference with OpenAICompatibleProvider
try:
    from src.agents.common.providers import OpenAICompatibleProvider
    from src.agents.tools.ticket_tools import TOOLS_SCHEMAS
    provider = OpenAICompatibleProvider()
    print(f"[llama.cpp Provider] Model Name resuelto: {provider.model_name}")
    resp = provider.generate(
        messages=[
            {"role": "system", "content": "Eres un asistente técnico en español."},
            {"role": "user", "content": "Di exactamente: INFERENCIA_LOCAL_OPERATIVA"}
        ],
        tools=[],
        timeout=15.0
    )
    print(f"[llama.cpp Inferencia Real] ÉXITO: content=\"{resp.content}\" | tool_calls={resp.tool_calls}")
except Exception as e:
    print(f"[llama.cpp Inferencia Real] ERROR: {e}")

# 4. Check FastAPI /api/agents
try:
    req = urllib.request.urlopen("http://127.0.0.1:8000/api/agents", timeout=5)
    agents_data = json.loads(req.read().decode("utf-8"))
    print(f"[FastAPI /api/agents] DISPONIBLE: {len(agents_data)} agentes registrados:")
    for a in agents_data:
        print(f"   - ID: {a['id']} | Nombre: {a['name']} | Enabled: {a['enabled']}")
except Exception as e:
    print(f"[FastAPI /api/agents] ERROR: {e}")

# 5. Check Angular frontend
try:
    req = urllib.request.urlopen("http://localhost:4200/", timeout=5)
    print(f"[Angular localhost:4200] DISPONIBLE: HTTP {req.status}")
except Exception as e:
    print(f"[Angular localhost:4200] ERROR: {e}")
