#!/usr/bin/env bash
# ==============================================================================
# AEP — SCRIPT DE INSTALACIÓN Y PREPARACIÓN LOCAL (LINUX / MACOS BASH)
# ==============================================================================
# Automatiza la creación del entorno virtual, dependencias, .env y diagnóstico.
# ==============================================================================

set -e

echo "======================================================================"
echo "   AGENT ENGINEERING PLAYGROUND (AEP) — PREPARACIÓN DEL ENTORNO LOCAL"
echo "======================================================================"

# 1. Verificar Python 3
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 no fue encontrado en PATH. Instala Python 3.10 o superior."
    exit 1
fi
echo "[OK] $(python3 --version) detectado."

# 2. Entorno virtual (.venv)
if [ ! -d ".venv" ]; then
    echo "[*] Creando entorno virtual en .venv..."
    python3 -m venv .venv
fi
echo "[OK] Entorno virtual verificado en .venv."

# 3. Localizar binario de Python
if [ -f ".venv/bin/python" ]; then
    PY_BIN=".venv/bin/python"
else
    PY_BIN="python3"
fi

# 4. Instalar dependencias Python
echo "[*] Verificando e instalando dependencias Python..."
$PY_BIN -m pip install --upgrade pip -q
if [ -f "requirements.txt" ]; then
    $PY_BIN -m pip install -r requirements.txt -q
fi
echo "[OK] Dependencias Python instaladas."

# 5. Configurar .env si no existe
if [ ! -f ".env" ]; then
    echo "[*] Creando .env a partir de .env.example..."
    cp .env.example .env
    echo "[AVISO] Se generó .env con valores predeterminados. Edítalo si tu MySQL requiere contraseña para root."
else
    echo "[OK] Archivo .env existente detectado."
fi

# 6. Frontend: dependencias npm
if command -v npm &> /dev/null; then
    if [ ! -d "frontend/node_modules" ]; then
        echo "[*] Instalando dependencias de Angular (npm ci)..."
        (cd frontend && npm ci)
    fi
    echo "[OK] Dependencias de Angular verificadas."
else
    echo "[ADVERTENCIA] npm no está disponible en PATH. Instala Node.js 22 LTS para ejecutar el frontend."
fi

# 7. Sincronizar guías Markdown
if [ -f "scripts/sync_docs.py" ]; then
    echo "[*] Sincronizando documentación pedagógica..."
    $PY_BIN scripts/sync_docs.py
fi

# 8. Ejecutar diagnóstico de salud
echo ""
echo "[*] Ejecutando diagnóstico del entorno con doctor.py..."
$PY_BIN scripts/doctor.py
