import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  input,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { AvatarMood, AvatarVisualState } from '../../../models/journey.models';

@Component({
  selector: 'app-agent-avatar-3d',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="avatar-canvas-wrapper" #containerRef>
      @if (hasWebGLError()) {
        <!-- Fallback 2D de alta fidelidad cuando WebGL no está disponible -->
        <div class="avatar-2d-fallback" [ngClass]="normalizedMood()">
          <div class="robot-stage-2d">
            <div class="halo-ring-2d halo-pulse"></div>
            <div class="halo-ring-2d halo-dashed"></div>
            <div class="pedestal-glow-2d"></div>

            <div class="robot-mascot-2d">
              <div class="antenna-2d"></div>
              <div class="visor-2d">
                <span class="eye-2d eye-left"></span>
                <span class="eye-2d eye-right"></span>
              </div>
              <div class="chest-badge-2d">AEP</div>
            </div>
          </div>
          <span class="fallback-caption">Robot AEP &bull; Modo Vectorial</span>
        </div>
      } @else {
        <canvas #canvasRef class="three-canvas" aria-label="Robot Holográfico 3D del Runtime AEP"></canvas>
      }

      <!-- Pastilla de Estado Reactivo de la Inferencia (8 Estados) -->
      <div class="mood-pill" [ngClass]="normalizedMood()">
        <span class="mood-indicator"></span>
        <span class="mood-label">{{ getMoodText(mood()) }}</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 150px;
      position: relative;
    }

    .avatar-canvas-wrapper {
      width: 100%;
      height: 100%;
      min-height: 150px;
      position: relative;
      background: radial-gradient(circle at 50% 55%, rgba(0, 240, 255, 0.08) 0%, rgba(13, 21, 39, 0.8) 50%, rgba(7, 11, 20, 0.98) 100%);
      border-radius: var(--radius-md);
      border: 1px solid var(--border-default);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.4);
    }

    .three-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Pastilla flotante con el estado cognitivo real */
    .mood-pill {
      position: absolute;
      bottom: 8px;
      right: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(13, 21, 39, 0.88);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-default);
      padding: 3px 9px;
      border-radius: var(--radius-full);
      font-size: 0.64rem;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: 0.04em;
      pointer-events: none;
      transition: var(--transition-fast);
      z-index: 10;
    }

    .mood-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }

    /* 8 Estados reactivos sincronizados con Stitch y DESIGN.md */
    .mood-pill.idle .mood-indicator {
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }

    .mood-pill.inference .mood-indicator {
      background: var(--accent-cyan-neon);
      box-shadow: 0 0 10px var(--accent-cyan-neon);
      animation: pulseMood 0.75s infinite alternate;
    }

    .mood-pill.planning .mood-indicator {
      background: var(--accent-violet);
      box-shadow: 0 0 10px var(--accent-violet);
      animation: pulseMood 0.65s infinite alternate;
    }

    .mood-pill.tool_proposed .mood-indicator {
      background: var(--accent-amber);
      box-shadow: 0 0 8px var(--accent-amber);
      animation: pulseMood 0.85s infinite alternate;
    }

    .mood-pill.tool_executing .mood-indicator {
      background: var(--accent-violet);
      box-shadow: 0 0 10px var(--accent-violet);
      animation: pulseMood 0.55s infinite alternate;
    }

    .mood-pill.tool_completed .mood-indicator {
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
    }

    .mood-pill.streaming .mood-indicator {
      background: var(--accent-cyan);
      box-shadow: 0 0 10px var(--accent-cyan);
      animation: pulseMood 0.6s infinite alternate;
    }

    .mood-pill.completed .mood-indicator {
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
    }

    .mood-pill.error .mood-indicator {
      background: var(--accent-crimson);
      box-shadow: 0 0 8px var(--accent-crimson);
    }

    .mood-label {
      color: var(--text-primary);
      text-transform: uppercase;
    }

    @keyframes pulseMood {
      from { transform: scale(0.85); opacity: 0.7; }
      to { transform: scale(1.3); opacity: 1; }
    }

    /* Fallback 2D cuando WebGL no está disponible */
    .avatar-2d-fallback {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0.5rem;
    }

    .robot-stage-2d {
      position: relative;
      width: 100px;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .halo-ring-2d {
      position: absolute;
      border-radius: 50%;
    }

    .halo-pulse {
      inset: 0;
      border: 1px solid rgba(0, 240, 255, 0.35);
      animation: pulseHalo 2s infinite ease-in-out;
    }

    .halo-dashed {
      inset: 6px;
      border: 1px dashed rgba(0, 240, 255, 0.45);
    }

    .pedestal-glow-2d {
      position: absolute;
      bottom: 4px;
      width: 72px;
      height: 12px;
      border-radius: 50%;
      background: rgba(0, 240, 255, 0.25);
      filter: blur(4px);
    }

    .robot-mascot-2d {
      position: relative;
      z-index: 2;
      width: 70px;
      height: 70px;
      background: #0d1b36;
      border-radius: 50%;
      border: 2px solid var(--accent-cyan);
      box-shadow: 0 0 18px rgba(0, 240, 255, 0.45);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .antenna-2d {
      position: absolute;
      top: -3px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan-neon);
      box-shadow: 0 0 6px var(--accent-cyan-neon);
    }

    .visor-2d {
      width: 44px;
      height: 24px;
      background: #060a14;
      border-radius: 8px;
      border: 1px solid rgba(0, 240, 255, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.8);
    }

    .eye-2d {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan-neon);
      box-shadow: 0 0 6px var(--accent-cyan-neon);
      transition: all 0.2s ease;
    }

    .avatar-2d-fallback.completed .eye-2d {
      background: var(--accent-emerald);
      box-shadow: 0 0 6px var(--accent-emerald);
    }

    .avatar-2d-fallback.error .eye-2d {
      background: var(--accent-crimson);
      box-shadow: 0 0 6px var(--accent-crimson);
    }

    .avatar-2d-fallback.tool_proposed .eye-2d {
      background: var(--accent-amber);
      box-shadow: 0 0 6px var(--accent-amber);
    }

    .avatar-2d-fallback.planning .eye-2d {
      background: var(--accent-violet);
      box-shadow: 0 0 8px var(--accent-violet);
    }

    .avatar-2d-fallback.tool_executing .eye-2d {
      background: var(--accent-violet);
      box-shadow: 0 0 6px var(--accent-violet);
    }

    .chest-badge-2d {
      margin-top: 4px;
      font-size: 8px;
      font-weight: 800;
      color: var(--accent-cyan);
      background: rgba(0, 240, 255, 0.12);
      border: 1px solid rgba(0, 240, 255, 0.4);
      padding: 1px 6px;
      border-radius: 10px;
      font-family: var(--font-mono);
    }

    .fallback-caption {
      font-size: 0.62rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }

    @keyframes pulseHalo {
      0%, 100% { transform: scale(0.96); opacity: 0.6; }
      50% { transform: scale(1.04); opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    }
  `]
})
export class AgentAvatar3DComponent implements OnInit, OnDestroy {
  readonly mood = input<AvatarMood>('idle');
  readonly targetHop = input<number>(1);
  readonly hasWebGLError = input<boolean>(false);

  @ViewChild('containerRef') private containerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('canvasRef') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private animFrameId?: number;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private isVisible = true;

  // Grupos 3D principales del Robot
  private robotRoot?: THREE.Group;
  private pedestalGroup?: THREE.Group;
  private bodyGroup?: THREE.Group;
  private headGroup?: THREE.Group;

  // Componentes de luz y materiales
  private pedestalRing1?: THREE.Mesh;
  private pedestalRing2?: THREE.Mesh;
  private particles?: THREE.Points;
  private pedestalLight?: THREE.PointLight;
  private visorMesh?: THREE.Mesh;
  private dynamicCanvasTexture?: THREE.CanvasTexture;
  private eyeCanvas?: HTMLCanvasElement;
  private eyeCtx?: CanvasRenderingContext2D | null;

  private lastTime = 0;
  private blinkTimer = 0;
  private isBlinking = false;
  private isReducedMotion = false;
  private streamWaveTimer = 0;

  constructor() {
    effect(() => {
      const currentMood = this.mood();
      const currentHop = this.targetHop();
      this.updateRobotAppearance(currentMood, currentHop);
    });
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  ngAfterViewInit(): void {
    this.initThree();
    this.setupIntersectionObserver();
  }

  ngOnDestroy(): void {
    this.cleanupThree();
  }

  /**
   * Normaliza la entrada de mood a uno de los 8 estados visuales canónicos
   */
  normalizedMood(): AvatarVisualState {
    const m = this.mood();
    switch (m) {
      case 'planning':
        return 'planning';
      case 'inference':
      case 'running':
        return 'inference';
      case 'tool_proposed':
      case 'pointing':
        return 'tool_proposed';
      case 'tool_executing':
        return 'tool_executing';
      case 'tool_completed':
        return 'tool_completed';
      case 'streaming':
        return 'streaming';
      case 'completed':
        return 'completed';
      case 'error':
      case 'failed':
        return 'error';
      case 'skipped':
      case 'idle':
      default:
        return 'idle';
    }
  }

  getMoodText(mood: AvatarMood): string {
    const state = this.normalizedMood();
    switch (state) {
      case 'planning': return 'Planificación (DAG)';
      case 'inference': return 'Inferencia Activa';
      case 'tool_proposed': return 'Llamada Propuesta';
      case 'tool_executing': return 'Ejecución en CPU / DB';
      case 'tool_completed': return 'Retorno de Datos';
      case 'streaming': return 'Síntesis Grounded';
      case 'completed': return 'Grounded & Listo';
      case 'error': return 'Fallo en Runtime';
      case 'idle':
      default:
        return 'En Reposo';
    }
  }

  private initThree(): void {
    if (!this.canvasRef?.nativeElement || !this.containerRef?.nativeElement) return;

    const width = this.containerRef.nativeElement.clientWidth || 300;
    const height = this.containerRef.nativeElement.clientHeight || 150;

    try {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
      this.camera.position.set(0, 0.35, 3.8);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvasRef.nativeElement,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));

      // 1. Iluminación
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(ambientLight);

      const topLight = new THREE.DirectionalLight(0xffffff, 0.85);
      topLight.position.set(1, 3, 2);
      this.scene.add(topLight);

      this.pedestalLight = new THREE.PointLight(0x00f0ff, 3.2, 8);
      this.pedestalLight.position.set(0, -0.65, 0.8);
      this.scene.add(this.pedestalLight);

      // 2. Construcción matemática del Robot y Pedestal (<2,000 polígonos)
      this.buildRobotAndPedestal();

      // 3. Observer de redimensionamiento
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.containerRef.nativeElement);

      this.animate();
    } catch (err) {
      console.warn('WebGL initialization failed, falling back to 2D vector core:', err);
    }
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver !== 'undefined' && this.containerRef?.nativeElement) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        this.isVisible = entry.isIntersecting;
        if (this.isVisible && !this.animFrameId) {
          this.lastTime = performance.now();
          this.animate();
        }
      }, { threshold: 0.1 });

      this.intersectionObserver.observe(this.containerRef.nativeElement);
    }
  }

  private buildRobotAndPedestal(): void {
    this.robotRoot = new THREE.Group();

    // -------------------------------------------------------------------------
    // A. PLATAFORMA LUMÍNICA (Pedestal Stage)
    // -------------------------------------------------------------------------
    this.pedestalGroup = new THREE.Group();
    this.pedestalGroup.position.set(0, -0.85, 0);

    // Base cilíndrica oscura metálica
    const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.14, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x090f1e,
      roughness: 0.28,
      metalness: 0.85
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.pedestalGroup.add(baseMesh);

    // Anillo toroidal lumínico exterior (Cyan neón)
    const ring1Geo = new THREE.TorusGeometry(0.82, 0.02, 16, 48);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95
    });
    this.pedestalRing1 = new THREE.Mesh(ring1Geo, ring1Mat);
    this.pedestalRing1.rotation.x = Math.PI / 2;
    this.pedestalRing1.position.y = 0.08;
    this.pedestalGroup.add(this.pedestalRing1);

    // Anillo toroidal lumínico interior
    const ring2Geo = new THREE.TorusGeometry(0.64, 0.016, 16, 48);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75
    });
    this.pedestalRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
    this.pedestalRing2.rotation.x = Math.PI / 2;
    this.pedestalRing2.position.y = 0.08;
    this.pedestalGroup.add(this.pedestalRing2);

    // Nube de partículas ascendentes (48 partículas)
    const particleCount = 48;
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.25 + Math.random() * 0.45;
      positions[i] = Math.cos(angle) * radius;
      positions[i + 1] = Math.random() * 1.4;
      positions[i + 2] = Math.sin(angle) * radius;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.035,
      transparent: true,
      opacity: 0.7
    });
    this.particles = new THREE.Points(pGeo, pMat);
    this.pedestalGroup.add(this.particles);

    this.robotRoot.add(this.pedestalGroup);

    // -------------------------------------------------------------------------
    // B. CUERPO DEL ROBOT (Pod Capsule & Placa AEP)
    // -------------------------------------------------------------------------
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.set(0, -0.15, 0);

    // Torso cápsula blanco perla suave PBR
    const torsoGeo = new THREE.CapsuleGeometry(0.26, 0.3, 16, 24);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.18,
      metalness: 0.12
    });
    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    this.bodyGroup.add(torsoMesh);

    // Placa pectoral circular con emblema AEP
    const badgeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20);
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x0d1b36,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.4,
      roughness: 0.2,
      metalness: 0.8
    });
    const badgeMesh = new THREE.Mesh(badgeGeo, badgeMat);
    badgeMesh.rotation.x = Math.PI / 2;
    badgeMesh.position.set(0, 0.04, 0.26);
    this.bodyGroup.add(badgeMesh);

    // Brazos compactos en reposo a los costados
    const armGeo = new THREE.CapsuleGeometry(0.05, 0.2, 12, 16);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2 });

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.31, 0.02, 0);
    leftArm.rotation.z = 0.12;
    this.bodyGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.31, 0.02, 0);
    rightArm.rotation.z = -0.12;
    this.bodyGroup.add(rightArm);

    this.robotRoot.add(this.bodyGroup);

    // -------------------------------------------------------------------------
    // C. CABEZA Y VISOR INTERACTIVO CON CANVAS TEXTURE
    // -------------------------------------------------------------------------
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.38, 0);

    // Cabeza ovoide
    const headGeo = new THREE.SphereGeometry(0.3, 24, 24);
    headGeo.scale(1.0, 0.92, 1.0);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.18,
      metalness: 0.12
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    this.headGroup.add(headMesh);

    // Auriculares cilíndricos laterales
    const earGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 16);
    const earMat = new THREE.MeshStandardMaterial({
      color: 0x0d1b36,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.5
    });

    const leftEar = new THREE.Mesh(earGeo, earMat);
    leftEar.rotation.z = Math.PI / 2;
    leftEar.position.set(-0.32, 0, 0);
    this.headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, earMat);
    rightEar.rotation.z = Math.PI / 2;
    rightEar.position.set(0.32, 0, 0);
    this.headGroup.add(rightEar);

    // Antena superior
    const antGeo = new THREE.SphereGeometry(0.035, 16, 16);
    const antMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const antMesh = new THREE.Mesh(antGeo, antMat);
    antMesh.position.set(0, 0.3, 0);
    this.headGroup.add(antMesh);

    // CanvasTexture para el Visor Expresivo Procedural
    this.setupDynamicVisorTexture();

    const visorGeo = new THREE.SphereGeometry(0.23, 20, 20);
    visorGeo.scale(1.0, 0.72, 0.58);
    const visorMat = new THREE.MeshStandardMaterial({
      roughness: 0.05,
      metalness: 0.9,
      map: this.dynamicCanvasTexture,
      emissive: 0xffffff,
      emissiveMap: this.dynamicCanvasTexture,
      emissiveIntensity: 1.2
    });
    this.visorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.visorMesh.position.set(0, 0.02, 0.16);
    this.headGroup.add(this.visorMesh);

    this.robotRoot.add(this.headGroup);

    this.scene?.add(this.robotRoot);
  }

  private setupDynamicVisorTexture(): void {
    if (typeof document === 'undefined') return;

    this.eyeCanvas = document.createElement('canvas');
    this.eyeCanvas.width = 256;
    this.eyeCanvas.height = 128;
    this.eyeCtx = this.eyeCanvas.getContext('2d');

    this.drawVisorFace(this.normalizedMood(), false);

    this.dynamicCanvasTexture = new THREE.CanvasTexture(this.eyeCanvas);
    this.dynamicCanvasTexture.needsUpdate = true;
  }

  private drawVisorFace(state: AvatarVisualState, isBlinking: boolean): void {
    if (!this.eyeCtx || !this.eyeCanvas) return;
    const ctx = this.eyeCtx;
    const w = this.eyeCanvas.width;
    const h = this.eyeCanvas.height;

    // Fondo negro azabache profundo
    ctx.fillStyle = '#050914';
    ctx.fillRect(0, 0, w, h);

    // Borde curvo tenue del visor con el acento del estado
    let accentColor = '#00f0ff';
    if (state === 'completed') accentColor = '#10b981';
    else if (state === 'error') accentColor = '#ef4444';
    else if (state === 'tool_proposed') accentColor = '#f59e0b';
    else if (state === 'tool_executing') accentColor = '#a855f7';
    else if (state === 'tool_completed') accentColor = '#34d399';
    else if (state === 'streaming') accentColor = '#38bdf8';

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;

    const leftX = 75;
    const rightX = 181;
    const centerY = 64;

    if (isBlinking && state !== 'error') {
      // Ojos cerrados por parpadeo: líneas horizontales suaves
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(leftX - 16, centerY);
      ctx.lineTo(leftX + 16, centerY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rightX - 16, centerY);
      ctx.lineTo(rightX + 16, centerY);
      ctx.stroke();
      return;
    }

    switch (state) {
      // 1. INFERENCE: pupila atenta brillante con scanning focal
      case 'inference': {
        ctx.beginPath();
        ctx.arc(leftX, centerY, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(rightX, centerY, 16, 0, Math.PI * 2);
        ctx.fill();

        // Destello central
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(leftX - 3, centerY - 3, 5, 0, Math.PI * 2);
        ctx.arc(rightX - 3, centerY - 3, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      // 1.5. PLANNING: descomposición gráfica en grafo DAG de tareas
      case 'planning': {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#c084fc';

        // Ojo izquierdo: nodo raíz hacia dos bifurcaciones
        ctx.beginPath();
        ctx.arc(leftX - 8, centerY - 4, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(leftX + 10, centerY - 12, 5, 0, Math.PI * 2);
        ctx.arc(leftX + 10, centerY + 8, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(leftX - 8, centerY - 4); ctx.lineTo(leftX + 10, centerY - 12);
        ctx.moveTo(leftX - 8, centerY - 4); ctx.lineTo(leftX + 10, centerY + 8);
        ctx.stroke();

        // Ojo derecho simétrico
        ctx.beginPath();
        ctx.arc(rightX - 8, centerY - 4, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rightX + 10, centerY - 12, 5, 0, Math.PI * 2);
        ctx.arc(rightX + 10, centerY + 8, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightX - 8, centerY - 4); ctx.lineTo(rightX + 10, centerY - 12);
        ctx.moveTo(rightX - 8, centerY - 4); ctx.lineTo(rightX + 10, centerY + 8);
        ctx.stroke();
        break;
      }

      // 2. TOOL_PROPOSED: corchetes de selección de herramienta [ • ]  [ • ]
      case 'tool_proposed': {
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f59e0b';
        // Corchete izquierdo
        ctx.beginPath();
        ctx.moveTo(leftX - 18, centerY - 14);
        ctx.lineTo(leftX - 22, centerY - 14);
        ctx.lineTo(leftX - 22, centerY + 14);
        ctx.lineTo(leftX - 18, centerY + 14);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(leftX + 18, centerY - 14);
        ctx.lineTo(leftX + 22, centerY - 14);
        ctx.lineTo(leftX + 22, centerY + 14);
        ctx.lineTo(leftX + 18, centerY + 14);
        ctx.stroke();

        // Corchete derecho
        ctx.beginPath();
        ctx.moveTo(rightX - 18, centerY - 14);
        ctx.lineTo(rightX - 22, centerY - 14);
        ctx.lineTo(rightX - 22, centerY + 14);
        ctx.lineTo(rightX - 18, centerY + 14);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightX + 18, centerY - 14);
        ctx.lineTo(rightX + 22, centerY - 14);
        ctx.lineTo(rightX + 22, centerY + 14);
        ctx.lineTo(rightX + 18, centerY + 14);
        ctx.stroke();

        // Puntos centrales
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(leftX, centerY, 9, 0, Math.PI * 2);
        ctx.arc(rightX, centerY, 9, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      // 3. TOOL_EXECUTING: arcos concéntricos giratorios de procesamiento en CPU
      case 'tool_executing': {
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#c084fc';
        ctx.beginPath();
        ctx.arc(leftX, centerY, 15, 0.4, Math.PI * 1.6);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rightX, centerY, 15, 0.4, Math.PI * 1.6);
        ctx.stroke();

        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(leftX, centerY, 7, 0, Math.PI * 2);
        ctx.arc(rightX, centerY, 7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      // 4. TOOL_COMPLETED: ojos brillantes de confirmación con halo esmeralda
      case 'tool_completed': {
        ctx.beginPath();
        ctx.arc(leftX, centerY, 14, 0, Math.PI * 2);
        ctx.arc(rightX, centerY, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(leftX, centerY, 5, 0, Math.PI * 2);
        ctx.arc(rightX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      // 5. STREAMING: barras de ecualizador de tokens en el centro
      case 'streaming': {
        const barHeights = [18, 28, 22, 32, 20];
        const barW = 8;
        const startX = (w - (5 * 14)) / 2;
        ctx.fillStyle = '#38bdf8';
        for (let i = 0; i < 5; i++) {
          const bh = barHeights[i];
          const bx = startX + i * 14;
          const by = centerY - bh / 2;
          ctx.beginPath();
          ctx.roundRect(bx, by, barW, bh, 3);
          ctx.fill();
        }
        break;
      }

      // 6. COMPLETED: arcos felices sonrientes (^ ^)
      case 'completed': {
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(leftX, centerY + 8, 16, Math.PI, 0, false);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rightX, centerY + 8, 16, Math.PI, 0, false);
        ctx.stroke();
        break;
      }

      // 7. ERROR: cruces discretas de advertencia (x x)
      case 'error': {
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ef4444';
        const s = 12;
        ctx.beginPath();
        ctx.moveTo(leftX - s, centerY - s); ctx.lineTo(leftX + s, centerY + s);
        ctx.moveTo(leftX + s, centerY - s); ctx.lineTo(leftX - s, centerY + s);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rightX - s, centerY - s); ctx.lineTo(rightX + s, centerY + s);
        ctx.moveTo(rightX + s, centerY - s); ctx.lineTo(rightX - s, centerY + s);
        ctx.stroke();
        break;
      }

      // 8. IDLE: dos círculos suaves simétricos
      case 'idle':
      default: {
        ctx.beginPath();
        ctx.arc(leftX, centerY, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(rightX, centerY, 13, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  private updateRobotAppearance(mood: AvatarMood, _targetHop: number): void {
    if (!this.pedestalLight) return;

    const state = this.normalizedMood();
    let hexColor = 0x00f0ff;
    let lightIntensity = 3.0;

    switch (state) {
      case 'planning':
        hexColor = 0xa855f7;
        lightIntensity = 4.6;
        break;
      case 'inference':
        hexColor = 0x00f0ff;
        lightIntensity = 4.5;
        break;
      case 'tool_proposed':
        hexColor = 0xf59e0b;
        lightIntensity = 3.8;
        break;
      case 'tool_executing':
        hexColor = 0xa855f7;
        lightIntensity = 4.8;
        break;
      case 'tool_completed':
        hexColor = 0x10b981;
        lightIntensity = 3.8;
        break;
      case 'streaming':
        hexColor = 0x38bdf8;
        lightIntensity = 4.2;
        break;
      case 'completed':
        hexColor = 0x10b981;
        lightIntensity = 3.0;
        break;
      case 'error':
        hexColor = 0xef4444;
        lightIntensity = 2.2;
        break;
      case 'idle':
      default:
        hexColor = 0x00f0ff;
        lightIntensity = 2.6;
        break;
    }

    this.pedestalLight.color.setHex(hexColor);
    this.pedestalLight.intensity = lightIntensity;

    if (this.pedestalRing1) {
      (this.pedestalRing1.material as THREE.MeshBasicMaterial).color.setHex(hexColor);
    }
    if (this.pedestalRing2) {
      (this.pedestalRing2.material as THREE.MeshBasicMaterial).color.setHex(
        state === 'tool_executing' ? 0xf59e0b : hexColor
      );
    }

    this.drawVisorFace(state, this.isBlinking);
    if (this.dynamicCanvasTexture) {
      this.dynamicCanvasTexture.needsUpdate = true;
    }
  }

  private animate = (): void => {
    if (!this.isVisible) {
      this.animFrameId = undefined;
      return;
    }

    this.animFrameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.1) : 0.016;
    this.lastTime = now;

    const state = this.normalizedMood();

    // Ciclo de parpadeo periódico determinista cada 4 segundos (solo en estados activos o de reposo)
    this.blinkTimer += delta;
    if (this.blinkTimer > 3.8 && !this.isBlinking && state !== 'error' && state !== 'completed') {
      this.isBlinking = true;
      this.drawVisorFace(state, true);
      if (this.dynamicCanvasTexture) this.dynamicCanvasTexture.needsUpdate = true;
    }
    if (this.blinkTimer > 4.0) {
      this.blinkTimer = 0;
      this.isBlinking = false;
      this.drawVisorFace(state, false);
      if (this.dynamicCanvasTexture) this.dynamicCanvasTexture.needsUpdate = true;
    }

    // Modo streaming: redibujo suave de onda de tokens cada 100ms
    if (state === 'streaming') {
      this.streamWaveTimer += delta;
      if (this.streamWaveTimer > 0.1) {
        this.streamWaveTimer = 0;
        this.drawVisorFace(state, false);
        if (this.dynamicCanvasTexture) this.dynamicCanvasTexture.needsUpdate = true;
      }
    }

    if (!this.isReducedMotion && this.robotRoot) {
      const time = now * 0.001;
      let speedMult = 1.0;
      if (state === 'inference') speedMult = 2.2;
      else if (state === 'planning') speedMult = 2.4;
      else if (state === 'tool_executing') speedMult = 2.8;
      else if (state === 'streaming') speedMult = 1.6;

      // 1. Respiración / Flotación vertical según estado
      if (this.bodyGroup && this.headGroup) {
        const floatAmplitude = state === 'inference' || state === 'tool_executing' || state === 'planning' ? 0.035 : 0.025;
        const floatY = Math.sin(time * 1.5 * speedMult) * floatAmplitude;
        this.bodyGroup.position.y = -0.15 + floatY;
        this.headGroup.position.y = 0.38 + floatY * 1.2;
      }

      // 2. Comportamiento cinético de la cabeza
      if (this.headGroup) {
        if (state === 'inference') {
          // Inferencia: la cabeza busca suavemente
          this.headGroup.rotation.y = Math.sin(time * 2.0) * 0.14;
          this.headGroup.rotation.x = 0;
        } else if (state === 'planning') {
          // Planning: cabeza con micro-escaneo orbital hacia el horizonte
          this.headGroup.rotation.y = Math.sin(time * 2.4) * 0.10;
          this.headGroup.rotation.x = 0.04;
        } else if (state === 'tool_proposed') {
          // Tool proposed: mirada fija hacia adelante con ligero avance
          this.headGroup.rotation.y = 0;
          this.headGroup.rotation.x = 0.06;
        } else if (state === 'tool_completed') {
          // Tool completed: asentimiento de confirmación
          this.headGroup.rotation.y = 0;
          this.headGroup.rotation.x = Math.sin(time * 3.0) * 0.05;
        } else if (state === 'error') {
          // Error: cabeza ligeramente baja en reposo de precaución
          this.headGroup.rotation.y = 0;
          this.headGroup.rotation.x = -0.06;
        } else {
          // Idle / Streaming / Completed: oscilación muy suave
          this.headGroup.rotation.y = Math.sin(time * 0.6) * 0.04;
          this.headGroup.rotation.x = 0;
        }
      }

      // 3. Giro de anillos lumínicos del pedestal
      if (this.pedestalRing1) {
        this.pedestalRing1.rotation.z += delta * 0.5 * speedMult;
      }
      if (this.pedestalRing2) {
        this.pedestalRing2.rotation.z -= delta * 0.7 * speedMult;
      }

      // 4. Haz de partículas ascendentes continuas
      if (this.particles) {
        const pos = this.particles.geometry.attributes['position'];
        const arr = pos.array as Float32Array;
        const pSpeed = delta * (0.35 * speedMult);
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] += pSpeed;
          if (arr[i] > 1.3) {
            arr[i] = 0.0;
          }
        }
        pos.needsUpdate = true;
      }
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private onResize(): void {
    if (!this.containerRef?.nativeElement || !this.renderer || !this.camera) return;
    const width = this.containerRef.nativeElement.clientWidth;
    const height = this.containerRef.nativeElement.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private cleanupThree(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = undefined;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    if (this.dynamicCanvasTexture) {
      this.dynamicCanvasTexture.dispose();
    }

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
    }

    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
