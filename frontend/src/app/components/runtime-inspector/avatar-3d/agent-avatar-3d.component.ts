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
import { AvatarMood } from '../../../models/journey.models';

@Component({
  selector: 'app-agent-avatar-3d',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="avatar-canvas-wrapper" #containerRef>
      @if (hasWebGLError()) {
        <!-- Fallback 2D de alta fidelidad cuando WebGL no está disponible -->
        <div class="avatar-2d-fallback" [ngClass]="mood()">
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

      <!-- Pastilla de Estado Reactivo de la Inferencia -->
      <div class="mood-pill" [ngClass]="mood()">
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

    .mood-pill.running .mood-indicator {
      background: var(--accent-cyan-neon);
      box-shadow: 0 0 10px var(--accent-cyan-neon);
      animation: pulseMood 0.8s infinite alternate;
    }

    .mood-pill.completed .mood-indicator {
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
    }

    .mood-pill.failed .mood-indicator {
      background: var(--accent-crimson);
      box-shadow: 0 0 8px var(--accent-crimson);
    }

    .mood-pill.pointing .mood-indicator {
      background: var(--accent-amber);
      box-shadow: 0 0 8px var(--accent-amber);
    }

    .mood-pill.skipped .mood-indicator {
      background: var(--text-muted);
      box-shadow: 0 0 4px var(--text-muted);
    }

    .mood-label {
      color: var(--text-primary);
      text-transform: uppercase;
    }

    @keyframes pulseMood {
      from { transform: scale(0.85); opacity: 0.7; }
      to { transform: scale(1.25); opacity: 1; }
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

    .avatar-2d-fallback.failed .eye-2d {
      background: var(--accent-crimson);
      box-shadow: 0 0 6px var(--accent-crimson);
    }

    .avatar-2d-fallback.pointing .eye-2d {
      background: var(--accent-amber);
      box-shadow: 0 0 6px var(--accent-amber);
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
  }

  ngOnDestroy(): void {
    this.cleanupThree();
  }

  getMoodText(mood: AvatarMood): string {
    switch (mood) {
      case 'running': return 'Inferencia Activa';
      case 'pointing': return 'Llamada a Tool';
      case 'completed': return 'Grounded & Listo';
      case 'failed': return 'Fallo en Runtime';
      case 'skipped': return 'Fase Omitida';
      default: return 'En Espera';
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

      // 2. Construcción matemática del Robot y Pedestal (<2,000 vértices)
      this.buildRobotAndPedestal();

      // 3. Observer de redimensionamiento
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.containerRef.nativeElement);

      this.animate();
    } catch (err) {
      console.warn('WebGL initialization failed, falling back to 2D vector core:', err);
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

    this.drawVisorFace(this.mood(), false);

    this.dynamicCanvasTexture = new THREE.CanvasTexture(this.eyeCanvas);
    this.dynamicCanvasTexture.needsUpdate = true;
  }

  private drawVisorFace(mood: AvatarMood, isBlinking: boolean): void {
    if (!this.eyeCtx || !this.eyeCanvas) return;
    const ctx = this.eyeCtx;
    const w = this.eyeCanvas.width;
    const h = this.eyeCanvas.height;

    // Fondo negro azabache profundo
    ctx.fillStyle = '#050914';
    ctx.fillRect(0, 0, w, h);

    // Borde curvo tenue del visor
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    let eyeColor = '#00f0ff';
    if (mood === 'completed') eyeColor = '#10b981';
    else if (mood === 'failed') eyeColor = '#ef4444';
    else if (mood === 'pointing') eyeColor = '#f59e0b';
    else if (mood === 'skipped') eyeColor = '#64748b';

    ctx.fillStyle = eyeColor;
    ctx.strokeStyle = eyeColor;
    ctx.shadowColor = eyeColor;
    ctx.shadowBlur = 12;

    const leftX = 75;
    const rightX = 181;
    const centerY = 64;

    if (isBlinking) {
      // Ojos cerrados por parpadeo: líneas horizontales
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(leftX - 16, centerY);
      ctx.lineTo(leftX + 16, centerY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rightX - 16, centerY);
      ctx.lineTo(rightX + 16, centerY);
      ctx.stroke();
    } else if (mood === 'completed') {
      // Expresión feliz: arcos sonrientes (^ ^)
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(leftX, centerY + 8, 16, Math.PI, 0, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rightX, centerY + 8, 16, Math.PI, 0, false);
      ctx.stroke();
    } else if (mood === 'failed') {
      // Expresión de fallo: cruces (X X)
      ctx.lineWidth = 5;
      const size = 12;
      // Cruz izquierda
      ctx.beginPath();
      ctx.moveTo(leftX - size, centerY - size);
      ctx.lineTo(leftX + size, centerY + size);
      ctx.moveTo(leftX + size, centerY - size);
      ctx.lineTo(leftX - size, centerY + size);
      ctx.stroke();
      // Cruz derecha
      ctx.beginPath();
      ctx.moveTo(rightX - size, centerY - size);
      ctx.lineTo(rightX + size, centerY + size);
      ctx.moveTo(rightX + size, centerY - size);
      ctx.lineTo(rightX - size, centerY + size);
      ctx.stroke();
    } else if (mood === 'running') {
      // Expresión atenta con pulso: círculos grandes con pupila
      ctx.beginPath();
      ctx.arc(leftX, centerY, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(rightX, centerY, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(leftX - 4, centerY - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rightX - 4, centerY - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Expresión estándar / Idle: dos círculos suaves
      ctx.beginPath();
      ctx.arc(leftX, centerY, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(rightX, centerY, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private updateRobotAppearance(mood: AvatarMood, _targetHop: number): void {
    if (!this.pedestalLight) return;

    let hexColor = 0x00f0ff;
    if (mood === 'completed') hexColor = 0x10b981;
    else if (mood === 'failed') hexColor = 0xef4444;
    else if (mood === 'pointing') hexColor = 0xf59e0b;
    else if (mood === 'skipped') hexColor = 0x64748b;

    this.pedestalLight.color.setHex(hexColor);
    this.pedestalLight.intensity = mood === 'running' ? 4.5 : 3.0;

    if (this.pedestalRing1) {
      (this.pedestalRing1.material as THREE.MeshBasicMaterial).color.setHex(hexColor);
    }
    if (this.pedestalRing2) {
      (this.pedestalRing2.material as THREE.MeshBasicMaterial).color.setHex(hexColor);
    }

    this.drawVisorFace(mood, this.isBlinking);
    if (this.dynamicCanvasTexture) {
      this.dynamicCanvasTexture.needsUpdate = true;
    }
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.1) : 0.016;
    this.lastTime = now;

    // Ciclo de parpadeo periódico determinista cada 4 segundos
    this.blinkTimer += delta;
    if (this.blinkTimer > 3.8 && !this.isBlinking && this.mood() !== 'failed' && this.mood() !== 'completed') {
      this.isBlinking = true;
      this.drawVisorFace(this.mood(), true);
      if (this.dynamicCanvasTexture) this.dynamicCanvasTexture.needsUpdate = true;
    }
    if (this.blinkTimer > 4.0) {
      this.blinkTimer = 0;
      this.isBlinking = false;
      this.drawVisorFace(this.mood(), false);
      if (this.dynamicCanvasTexture) this.dynamicCanvasTexture.needsUpdate = true;
    }

    if (!this.isReducedMotion && this.robotRoot) {
      const time = now * 0.001;
      const isRunning = this.mood() === 'running';
      const speedMult = isRunning ? 2.2 : 1.0;

      // 1. Respiración / Flotación vertical suave
      if (this.bodyGroup && this.headGroup) {
        const floatY = Math.sin(time * 1.5 * speedMult) * 0.025;
        this.bodyGroup.position.y = -0.15 + floatY;
        this.headGroup.position.y = 0.38 + floatY * 1.2;
      }

      // 2. Giro sutil de cabeza cuando está en inferencia
      if (this.headGroup) {
        if (isRunning) {
          this.headGroup.rotation.y = Math.sin(time * 2.0) * 0.14;
        } else {
          this.headGroup.rotation.y = Math.sin(time * 0.6) * 0.04;
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
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] += delta * (0.35 * speedMult);
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
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
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
