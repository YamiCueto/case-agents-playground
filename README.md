# Agent Engineering Playground

> Entorno de ingeniería de agentes con arquitectura hexagonal, Server-Sent Events (SSE), modelo local Qwen mediante llama.cpp, persistencia en MySQL y un Runtime Inspector interactivo 3D construido con Angular 22 y Three.js.

---

## 🌟 Visión General

El **Agent Engineering Playground** es una plataforma diseñada para explorar, comprender y auditar la ejecución de agentes de inteligencia artificial paso a paso. 

A diferencia de los visores convencionales basados en volcados estáticos de JSON, este Playground ofrece una experiencia pedagógica e interactiva (**Agent Execution Journey**):
* **Identificación del Componente Soberano:** Revela con precisión qué subsistema actúa en cada instante (*Usuario*, *Qwen 3.5 4B*, *Validador Pydantic*, *Motor MySQL* o *Sintetizador*).
* **Guía Visual 3D:** Un avatar procedural interactivo desarrollado con Three.js que reacciona a los estados de ejecución (`idle`, `running`, `pointing`, `completed`, `failed`, `skipped`).
* **Desacoplamiento Reactivo:** Pipeline `SSE Stream → Event Store → Presentation Controller → UI / 3D Scene`.
* **Dos Modos de Exploración:**
  * **Live Mode:** Seguimiento en tiempo real con pausa visual no bloqueante (permite detener la vista para leer sin detener el runtime del backend).
  * **Replay Mode:** Reproducción paso a paso de turnos completados, velocidad ajustable (0.5x, 1x, 2x) y salto directo a cualquier hop sin invocar nuevamente a la base de datos ni al modelo.
* **Cero Desbordamiento Horizontal:** Visor técnico avanzado con alternancia instantánea entre modo **Wrapped** (ajuste adaptativo de líneas) y **Raw** (scroll horizontal interno aislado).

---

## 🏛️ Arquitectura del Sistema

El proyecto implementa una **Arquitectura Hexagonal (Ports & Adapters)** estricta, separando la lógica de negocio y las capacidades del agente de los adaptadores de infraestructura:

```
src/
├── domain/                    # Entidades puras y reglas de negocio del dominio de Tickets
│   ├── entities/              # Ticket, TicketEvent, Persona, etc.
│   └── ports/                 # Interfaces abstractas de repositorios y servicios LLM
├── application/               # Casos de uso y orquestación agéntica
│   ├── agents/                # Implementaciones agénticas (Agent v1)
│   ├── tools/                 # Herramientas tipadas y ejecutores
│   └── use_cases/             # Lógica de aplicación
├── infrastructure/            # Adaptadores tecnológicos
│   ├── database/              # SQLAlchemy 2.0, modelos ORM y conexión MySQL
│   ├── llm/                   # Cliente HTTP compatible OpenAI (llama.cpp)
│   └── config.py              # Configuración tipada y variables de entorno
└── api/                       # Adaptadores HTTP y SSE (FastAPI)
    ├── routes/                # Endpoints REST y stream SSE (/api/v1/agent/run)
    └── app.py                 # Aplicación FastAPI y middlewares CORS
```

---

## 🗺️ Hoja de Ruta: Evolución de Agent v1 a v6

El laboratorio evoluciona de manera incremental sobre un mismo dominio de negocio (gestión de tickets):

| Versión | Enfoque Principal | Estado | Capacidades Clave |
| :--- | :--- | :--- | :--- |
| **Agent v1** | **Tool Calling & Síntesis Grounded** | ✅ **Operativo** | 7 Hops estructurados, validación Pydantic, ejecución SQL segura, respuestas naturales y directas. |
| **Agent v2** | **Agent Loop** | ⏳ *Taller 03* | Bucle iterativo de inferencia y herramientas, circuit breaker de `max_iterations`, detección de convergencia. |
| **Agent v3** | **State & Memory** | ⏳ *Taller 04* | Context engineering, `ExecutionState`, memoria de corto/largo plazo con `MemoryStore`. |
| **Agent v4** | **Planning** | ⏳ *Taller 05* | Descomposición de objetivos, grafos de ejecución (DAG), replanning dinámico según observaciones. |
| **Agent v5** | **Guardrails & HITL** | ⏳ *Taller 06* | Compuerta humana para acciones destructivas, verificación SHA-256 de propuestas. |
| **Agent v6** | **Observability & Evals** | ⏳ *Taller 07* | Árbol de trazas estructuradas con `sequence_no` monotónico y evaluación factual con golden datasets. |

---

## 📋 Requisitos del Sistema

* **Python:** 3.12+ (compatible con 3.14)
* **Node.js:** 20.x o superior con `npm` 10+
* **Base de Datos:** MySQL 8.0+ o MariaDB 10.4+ (ej. XAMPP) en el puerto `3306`
* **Servidor LLM Local:** `llama.cpp` ejecutando Qwen 2.5/3.5 (endpoint `/v1` en puerto `8080`)
* **Navegador Web:** Navegador moderno con soporte WebGL para la experiencia 3D (Chromium, Firefox, Safari)

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el Repositorio
```bash
git clone https://github.com/YamiCueto/case-agents-playground.git
cd case-agents-playground
```

### 2. Configuración del Backend (Python)
```bash
# Crear entorno virtual
python -m venv .venv

# Activar entorno virtual
# En Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# En Linux / macOS:
source .venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
```

Configurar las variables de entorno:
```bash
cp .env.example .env
```
Editar `.env` según la configuración local de MySQL y llama.cpp (utilizar credenciales propias):
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=YOUR_DB_NAME
DB_ADMIN_USER=YOUR_DB_ADMIN_USER
DB_ADMIN_PASSWORD=YOUR_DB_ADMIN_PASSWORD
DB_APP_USER=YOUR_DB_APP_USER
DB_APP_PASSWORD=YOUR_DB_APP_PASSWORD

LLM_BASE_URL=http://127.0.0.1:8080/v1
LLM_API_KEY=YOUR_LLM_API_KEY
```

Inicializar base de datos y migraciones:
```bash
# Ejecutar migraciones Alembic
alembic upgrade head

# Sembrar datos de prueba iniciales
python scripts/seed_data.py
```

Iniciar el servidor FastAPI:
```bash
uvicorn src.api.app:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Configuración del Frontend (Angular 22)
En una nueva terminal:
```bash
cd frontend
npm install
npm start
```
La aplicación estará disponible en `http://127.0.0.1:4200`.

---

## 🧪 Pruebas y Validación

### Pruebas Unitarias y de Integración (Pytest)
```bash
pytest
```
Valida 49 pruebas de dominio, repositorios, casos de uso, fidelidad factual y contratos de herramientas con 100% de aprobación.

### Auditoría UX y Pruebas Multi-Viewport (Playwright)
```bash
python scripts/audit_runtime_inspector_ux.py
```
Ejecuta la suite visual y funcional en 5 resoluciones:
* Mobile Compact (360 × 800)
* Mobile Standard (390 × 844)
* Tablet (768 × 1024)
* Desktop (1440 × 900)
* Ultrawide (1920 × 1080)

---

## 🛡️ Naturaleza de los Datos, Independencia y Seguridad

* **Proyecto Independiente:** El **Agent Engineering Playground** es un proyecto técnico y experimental enteramente independiente.
* **Datos 100% Sintéticos y Emulados:** El sistema de tickets, sus códigos, categorías, usuarios simulados (`usr_carlos`, `usr_laura`, `supervisor_juan`) y registros históricos fueron generados de manera sintética para fines pedagógicos de evaluación y observabilidad de sistemas agénticos. No pertenecen a ninguna institución financiera, cooperativa, empresa ni entidad real.
* **Identificadores Técnicos Transitorios:** Los nombres técnicos `cfa_tickets` (base de datos MySQL) y `cfa_app_user` (cuenta de base de datos) se conservan temporalmente de forma exclusiva para mantener la compatibilidad operativa del entorno local. No constituyen asociación, marca ni propiedad institucional.
* **Gestión de Secretos:** Los archivos de documentación y plantillas emplean únicamente marcadores de posición genéricos (`YOUR_DB_PASSWORD`). El archivo de configuración real `.env` está estrictamente excluido del repositorio mediante `.gitignore`.
* **Modo Replay Seguro:** La reproducción del flujo opera en memoria sobre el `EventStore` del frontend; no realiza mutaciones en base de datos ni invoca al modelo de lenguaje.

---

## 📄 Licencia

Este proyecto está desarrollado con fines pedagógicos y de experimentación en ingeniería de agentes. Todos los derechos reservados.
