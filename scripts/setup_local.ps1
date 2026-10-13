# ==============================================================================
# AEP — SCRIPT DE INSTALACIÓN Y PREPARACIÓN LOCAL (WINDOWS POWERSHELL)
# ==============================================================================
# Automatiza la creación del entorno virtual, dependencias, .env y diagnóstico.
# ==============================================================================

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   AGENT ENGINEERING PLAYGROUND (AEP) — PREPARACIÓN DEL ENTORNO LOCAL" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Verificar Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Python no fue encontrado en el PATH. Instala Python 3.10+ y agrégalo al PATH."
    exit 1
}
$pyVer = python --version
Write-Host "[OK] $pyVer detectado." -ForegroundColor Green

# 2. Entorno virtual (.venv)
if (-not (Test-Path ".venv")) {
    Write-Host "[*] Creando entorno virtual en .venv..." -ForegroundColor Yellow
    python -m venv .venv
}
Write-Host "[OK] Entorno virtual verificado en .venv." -ForegroundColor Green

# 3. Localizar ejecutable de Python
$pyExe = ".venv\Scripts\python.exe"
if (-not (Test-Path $pyExe)) {
    $pyExe = "python"
}

# 4. Instalar dependencias Python
Write-Host "[*] Verificando e instalando dependencias Python..." -ForegroundColor Yellow
& $pyExe -m pip install --upgrade pip -q
if (Test-Path "requirements.txt") {
    & $pyExe -m pip install -r requirements.txt -q
}
Write-Host "[OK] Dependencias Python instaladas." -ForegroundColor Green

# 5. Configurar .env si no existe
if (-not (Test-Path ".env")) {
    Write-Host "[*] Creando .env a partir de .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "[AVISO] Se generó .env con valores predeterminados. Edítalo si tu MySQL requiere contraseña para root." -ForegroundColor Magenta
} else {
    Write-Host "[OK] Archivo .env existente detectado." -ForegroundColor Green
}

# 6. Frontend: dependencias npm
if (Get-Command npm -ErrorAction SilentlyContinue) {
    if (-not (Test-Path "frontend\node_modules")) {
        Write-Host "[*] Instalando dependencias de Angular (npm ci)..." -ForegroundColor Yellow
        Push-Location frontend
        npm ci
        Pop-Location
    }
    Write-Host "[OK] Dependencias de Angular verificadas." -ForegroundColor Green
} else {
    Write-Host "[ADVERTENCIA] npm no está disponible en PATH. Instala Node.js 22 LTS para ejecutar el frontend." -ForegroundColor Yellow
}

# 7. Sincronizar guías Markdown
if (Test-Path "scripts\sync_docs.py") {
    Write-Host "[*] Sincronizando documentación pedagógica..." -ForegroundColor Yellow
    & $pyExe scripts\sync_docs.py
}

# 8. Ejecutar diagnóstico de salud
Write-Host "`n[*] Ejecutando diagnóstico del entorno con doctor.py..." -ForegroundColor Cyan
& $pyExe scripts\doctor.py
