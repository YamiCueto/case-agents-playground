# Guía de Instalación y Configuración del Entorno Local (Modo Live)
**Agent Engineering Playground (AEP) — Laboratorio Soberano de Ingeniería de Agentes**

Esta guía proporciona el procedimiento paso a paso, verificable e idempotente para configurar y ejecutar el entorno de desarrollo y laboratorio local de AEP en cualquier máquina con **Windows**, **Linux** o **macOS**, sin requerir modificar el código fuente de los agentes ni depender de infraestructura cloud de pago.

---

## 1. Distinción Fundamental: Modo Demo vs. Modo Live

| Característica | Modo Demo (Público) | Modo Live (Laboratorio Local) |
|---|---|---|
| **Alojamiento** | GitHub Pages: `https://yamicueto.github.io/case-agents-playground/` | Máquina del aprendiz (`localhost:4200` y `localhost:8000`) |
| **Infraestructura Requerida** | Ninguna (solo un navegador web moderno) | Python 3.10+, Node.js 22 LTS, MySQL/MariaDB, llama.cpp |
| **Costo** | **$0.00 USD** | **$0.00 USD** (Inferencia local en CPU/GPU) |
| **Naturaleza de los Eventos** | Reproducción determinista de trazas reales verificadas | Inferencia y ejecución en tiempo real mediante SSE |
| **Base de Datos** | Simulación in-memory estática | MySQL relacional con migraciones Alembic e historial vivo |

---

## 2. Requisitos Previos del Sistema

Antes de iniciar la instalación, asegúrate de contar con las siguientes herramientas instaladas:

1. **Python:** Versión `3.10` o superior (`3.11` o `3.12` recomendadas).
   - Verifica con: `python --version` (o `python3 --version`).
2. **Node.js & npm:** Versión `22 LTS` o superior (requerida por Angular 22 CLI).
   - Verifica con: `node -v` y `npm -v`.
3. **Servidor MySQL o MariaDB:** Versión 8.0+ de MySQL o 10.4+ de MariaDB (ej. XAMPP, MySQL Server nativo o Homebrew).
   - Verifica con: `mysql --version`.
4. **Motor de Inferencia LLM:** [llama.cpp](https://github.com/ggerganov/llama.cpp) (ejecutable `llama-server`).
   - Modelo recomendado para el laboratorio: **Qwen 3.5 4B Instruct** (cuantización `UD-Q5_K_XL` o `Q4_K_M` en formato GGUF).

---

## 3. Instalación Rápida Asistida

El repositorio incluye scripts de arranque rápido que configuran el entorno virtual, dependencias y variables automáticamente.

### En Windows (PowerShell):
```powershell
.\scripts\setup_local.ps1
```

### En Linux o macOS (Bash):
```bash
chmod +x scripts/setup_local.sh
./scripts/setup_local.sh
```

El script finalizará ejecutando el diagnóstico de salud `doctor.py`.

---

## 4. Instalación Manual Paso a Paso

Si prefieres realizar la configuración de manera manual o necesitas personalizar algún paso:

### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/YamiCueto/case-agents-playground.git
cd case-agents-playground
```

### Paso 2: Crear y Activar el Entorno Virtual de Python
- **Windows (PowerShell):**
  ```powershell
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  ```
- **Linux / macOS:**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

### Paso 3: Instalar Dependencias de Python
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Paso 4: Instalar Dependencias del Frontend (Angular 22)
```bash
cd frontend
npm ci
cd ..
```

### Paso 5: Configurar Variables de Entorno (`.env`)
Copia la plantilla `.env.example` para crear tu `.env` local:
- **Windows:** `Copy-Item .env.example .env`
- **Linux / macOS:** `cp .env.example .env`

Edita `.env` con los valores de tu entorno. Ejemplo típico para una instalación local estándar:
```ini
# Base de Datos
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=cfa_tickets
DB_ADMIN_USER=root
DB_ADMIN_PASSWORD=             # Dejar vacío si tu MySQL root local no tiene contraseña
DB_APP_USER=cfa_app_user
DB_APP_PASSWORD=mi_clave_local_segura

# LLM Local (llama.cpp)
LLM_BASE_URL=http://127.0.0.1:8080/v1
LLM_API_KEY=local-llama-cpp
LLM_MODEL=                     # Opcional; si está vacío, AEP auto-detecta el modelo activo

# Backend FastAPI
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200,http://localhost:3000,http://127.0.0.1:3000
```

> **Diferencia entre Usuario Administrador y Usuario de Aplicación:**
> - `DB_ADMIN_USER` (`root`): Requiere privilegios DDL para crear la base de datos y otorgar permisos.
> - `DB_APP_USER` (`cfa_app_user`): Cuenta con privilegios mínimos (DML: `SELECT, INSERT, UPDATE, DELETE`) para ejecutar las operaciones del agente bajo el principio de menor privilegio.

---

## 5. Inicialización de Base de Datos y Datos Semilla

Ejecuta secuencialmente los tres comandos del ciclo de vida relacional:

### 1. Aprovisionar Base de Datos y Usuario (`bootstrap_db.py`)
Crea la base de datos `cfa_tickets` y el usuario de aplicación si no existen:
```bash
python scripts/bootstrap_db.py
```

### 2. Aplicar Migraciones de Esquema (`alembic upgrade head`)
Aplica las migraciones versionadas para generar las tablas de usuarios, categorías, tickets, comentarios e historial:
```bash
alembic upgrade head
```

### 3. Cargar Datos Semilla Idempotentes (`seed_data.py`)
Siembra los 6 usuarios, 5 categorías y 5 tickets pedagógicos (`TICK-1001` a `TICK-1005`):
```bash
python scripts/seed_data.py
```
> **Nota de Idempotencia:** Este comando puede ejecutarse múltiples veces con total seguridad. Únicamente insertará las entidades faltantes y preservará las modificaciones realizadas durante las sesiones de prueba.

---

## 6. Configuración y Arranque del Servidor LLM (llama.cpp)

El laboratorio opera de forma soberana sin enviar datos a APIs externas de pago.

### 1. Obtener el Modelo GGUF
Descarga un modelo compatible con Function Calling (Tool Calling) en formato GGUF, por ejemplo **Qwen 3.5 4B Instruct**:
- Descarga desde Hugging Face (ej. `Qwen3.5-4B-Instruct-GGUF` o cuantización `Q4_K_M` / `UD-Q5_K_XL`).

### 2. Iniciar `llama-server`
Ejecuta el servidor de inferencia en una terminal dedicada:
```bash
llama-server \
  -m /ruta/hacia/tu/modelo/Qwen3.5-4B-UD-Q5_K_XL.gguf \
  --port 8080 \
  -c 8192 \
  --host 127.0.0.1
```
- Parámetros clave:
  - `-c 8192`: Ventana de contexto recomendada (mínimo 4096 tokens).
  - `--port 8080`: Puerto estándar compatible con la configuración predeterminada de AEP.

---

## 7. Verificación de Salud con `doctor.py`

Antes de arrancar los servicios, ejecuta la herramienta de diagnóstico:
```bash
python scripts/doctor.py
```

El reporte validará:
- [x] Runtime de Python y dependencias
- [x] Node.js y paquetes frontend
- [x] Configuración de `.env`
- [x] Conexión MySQL y permisos del usuario de aplicación
- [x] Migraciones Alembic al día
- [x] Completitud de datos canónicos de tickets
- [x] Conectividad y ventana de contexto del LLM local

---

## 8. Puesta en Marcha de los Servicios Locales

### Terminal 1: Backend FastAPI
```bash
uvicorn src.api.app:app --reload --port 8000
```
- Endpoint de verificación: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)
- Documentación OpenAPI interactiva: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### Terminal 2: Frontend Angular 22
```bash
cd frontend
npm start
```
- Abre en tu navegador: [http://localhost:4200/](http://localhost:4200/)
- Selecciona el agente deseado (v1, v2, v3 o v4) y conmutar a **Modo Live**.

---

## 9. Preguntas Frecuentes y Solución de Problemas

### 1. ¿Qué hago si mi MySQL `root` no tiene contraseña?
En `.env`, define simplemente:
```ini
DB_ADMIN_PASSWORD=
```
El sistema construirá automáticamente la URL sin contraseña y sin generar sintaxis errónea.

### 2. ¿Cómo elijo otro modelo o proveedor OpenAI-compatible?
AEP admite cualquier endpoint local compatible (Ollama, LM Studio, vLLM, etc.):
- En `.env`, configura:
  ```ini
  LLM_BASE_URL=http://127.0.0.1:11434/v1    # Para Ollama
  LLM_MODEL=qwen2.5:3b                      # Nombre del modelo en Ollama
  ```
- **Requisito obligatorio:** Para los agentes v1–v4, el modelo debe soportar Tool Calling estructurado.

### 3. ¿Cómo restablecer la base de datos de pruebas sin afectar datos de desarrollo?
Para reiniciar de forma segura la base de datos de pruebas:
```bash
python -m pytest tests/
```
El archivo [`tests/conftest.py`](../tests/conftest.py) gestiona de forma aislada una base de datos `cfa_tickets_test` con limpieza automática de mutaciones al finalizar cada prueba.

---

## 10. Resumen de Comandos Esenciales

| Acción | Comando |
|---|---|
| **Diagnóstico del Entorno** | `python scripts/doctor.py` |
| **Aprovisionamiento BD** | `python scripts/bootstrap_db.py` |
| **Migraciones Alembic** | `alembic upgrade head` |
| **Siembra Idempotente** | `python scripts/seed_data.py` |
| **Ejecutar Pruebas Backend** | `pytest -q` |
| **Ejecutar Pruebas Frontend** | `cd frontend && npm test` |
| **Iniciar Backend Live** | `uvicorn src.api.app:app --reload --port 8000` |
| **Iniciar Frontend Live** | `cd frontend && npm start` |
