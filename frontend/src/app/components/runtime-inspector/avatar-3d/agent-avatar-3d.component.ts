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
        <div class="avatar-2d-fallback" [ngClass]="mood()">
          <div class="orbital-reactor-2d">
            <div class="ring-2d ring-outer"></div>
            <div class="ring-2d ring-middle"></div>
            <div class="core-2d"></div>
          </div>
          <span class="fallback-caption">Núcleo AEP &bull; Fallback 2D</span>
        </div>
      } @else {
        <canvas #canvasRef class="three-canvas" aria-label="Núcleo Orbital Cinético del Runtime Agéntico"></canvas>
      }
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
      height: 160px;
      position: relative;
    }
    .avatar-canvas-wrapper {
      width: 100%;
      height: 100%;
      position: relative;
      background: radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.08) 0%, rgba(15, 23, 42, 0.75) 45%, rgba(2, 6, 23, 0.98) 100%);
      border-radius: var(--radius-md);
      border: 1px solid rgba(56, 189, 248, 0.22);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .three-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .mood-pill {
      position: absolute;
      bottom: 8px;
      right: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(6px);
      border: 1px solid var(--border-default);
      padding: 3px 9px;
      border-radius: 12px;
      font-size: 0.65rem;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: 0.04em;
      pointer-events: none;
      transition: var(--transition-fast);
    }
    .mood-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-cyan);
      box-shadow: 0 0 6px var(--accent-cyan);
    }
    .mood-pill.running .mood-indicator {
      background: var(--accent-cyan);
      box-shadow: 0 0 10px var(--accent-cyan);
      animation: pulseMood 0.9s infinite alternate;
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
      to { transform: scale(1.2); opacity: 1; }
    }

    .avatar-2d-fallback {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .orbital-reactor-2d {
      width: 54px;
      height: 54px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ring-2d {
      position: absolute;
      border-radius: 50%;
      border: 1.5px dashed var(--accent-cyan);
    }
    .ring-outer {
      width: 100%;
      height: 100%;
      animation: spin2d 10s linear infinite;
    }
    .ring-middle {
      width: 74%;
      height: 74%;
      border-color: var(--accent-emerald);
      animation: spin2dReverse 7s linear infinite;
    }
    .core-2d {
      width: 24px;
      height: 24px;
      background: radial-gradient(circle, var(--accent-cyan) 0%, #0f172a 100%);
      border-radius: 50%;
      box-shadow: 0 0 12px var(--accent-cyan);
    }
    .fallback-caption {
      font-size: 0.68rem;
      font-family: var(--font-mono);
      color: var(--text-secondary);
    }
    @keyframes spin2d {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes spin2dReverse {
      from { transform: rotate(360deg); }
      to { transform: rotate(0deg); }
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

  private reactorGroup?: THREE.Group;
  private coreMesh?: THREE.Mesh;
  private wireframeMesh?: THREE.Mesh;
  private ringOuter?: THREE.Mesh;
  private ringInner?: THREE.Mesh;
  private particleCloud?: THREE.Points;
  private pointLight?: THREE.PointLight;

  private lastTime = 0;
  private isReducedMotion = false;

  constructor() {
    effect(() => {
      const currentMood = this.mood();
      const currentHop = this.targetHop();
      this.updateReactorColors(currentMood, currentHop);
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
      case 'pointing': return 'Hop Seleccionado';
      case 'completed': return 'Ejecución Grounded';
      case 'failed': return 'Error en Runtime';
      case 'skipped': return 'Hop Omitido';
      default: return 'Runtime en Espera';
    }
  }

  private initThree(): void {
    if (!this.canvasRef?.nativeElement || !this.containerRef?.nativeElement) return;

    const width = this.containerRef.nativeElement.clientWidth || 300;
    const height = this.containerRef.nativeElement.clientHeight || 136;

    try {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      this.camera.position.set(0, 0, 4.4);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvasRef.nativeElement,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      this.scene.add(ambientLight);

      this.pointLight = new THREE.PointLight(0x38bdf8, 3, 12);
      this.pointLight.position.set(0, 0.8, 2);
      this.scene.add(this.pointLight);

      this.buildReactor();
      this.buildParticleCloud();

      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.containerRef.nativeElement);

      this.animate();
    } catch (err) {
      console.warn('WebGL initialization failed, falling back to 2D vector core:', err);
    }
  }

  private buildReactor(): void {
    this.reactorGroup = new THREE.Group();

    const sphereGeo = new THREE.SphereGeometry(0.48, 32, 32);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.5,
      roughness: 0.12,
      metalness: 0.85
    });
    this.coreMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.reactorGroup.add(this.coreMesh);

    const wireGeo = new THREE.IcosahedronGeometry(0.78, 1);
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.7,
      wireframe: true
    });
    this.wireframeMesh = new THREE.Mesh(wireGeo, wireMat);
    this.reactorGroup.add(this.wireframeMesh);

    const ringOuterGeo = new THREE.TorusGeometry(1.22, 0.024, 16, 64);
    const ringOuterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.95,
      metalness: 0.9
    });
    this.ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
    this.ringOuter.rotation.x = Math.PI / 3;
    this.ringOuter.rotation.y = Math.PI / 8;
    this.reactorGroup.add(this.ringOuter);

    const ringInnerGeo = new THREE.TorusGeometry(0.98, 0.020, 16, 64);
    const ringInnerMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.85,
      metalness: 0.9
    });
    this.ringInner = new THREE.Mesh(ringInnerGeo, ringInnerMat);
    this.ringInner.rotation.x = -Math.PI / 3.5;
    this.ringInner.rotation.z = Math.PI / 6;
    this.reactorGroup.add(this.ringInner);

    this.scene?.add(this.reactorGroup);
  }

  private buildParticleCloud(): void {
    const particleCount = 64;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      const radius = 1.4 + Math.random() * 1.1;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;

      positions[i] = radius * Math.cos(phi) * Math.sin(theta);
      positions[i + 1] = radius * Math.sin(phi);
      positions[i + 2] = radius * Math.cos(phi) * Math.cos(theta);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.038,
      transparent: true,
      opacity: 0.75
    });

    this.particleCloud = new THREE.Points(geometry, material);
    this.scene?.add(this.particleCloud);
  }

  private updateReactorColors(mood: AvatarMood, targetHop: number): void {
    if (!this.coreMesh || !this.wireframeMesh || !this.pointLight) return;

    const coreMat = this.coreMesh.material as THREE.MeshStandardMaterial;
    const wireMat = this.wireframeMesh.material as THREE.MeshStandardMaterial;

    switch (mood) {
      case 'running':
        coreMat.emissive.setHex(0x38bdf8);
        coreMat.emissiveIntensity = 2.0;
        wireMat.emissive.setHex(0x0ea5e9);
        this.pointLight.color.setHex(0x38bdf8);
        this.pointLight.intensity = 4.0;
        break;
      case 'pointing':
        coreMat.emissive.setHex(0x38bdf8);
        coreMat.emissiveIntensity = 1.4;
        wireMat.emissive.setHex(0x38bdf8);
        this.pointLight.color.setHex(0x38bdf8);
        this.pointLight.intensity = 3.0;
        break;
      case 'completed':
        coreMat.emissive.setHex(0x10b981);
        coreMat.emissiveIntensity = 1.8;
        wireMat.emissive.setHex(0x34d399);
        this.pointLight.color.setHex(0x10b981);
        this.pointLight.intensity = 3.5;
        break;
      case 'failed':
        coreMat.emissive.setHex(0xef4444);
        coreMat.emissiveIntensity = 2.0;
        wireMat.emissive.setHex(0xef4444);
        this.pointLight.color.setHex(0xef4444);
        this.pointLight.intensity = 4.0;
        break;
      case 'skipped':
        coreMat.emissive.setHex(0x64748b);
        coreMat.emissiveIntensity = 0.5;
        wireMat.emissive.setHex(0x475569);
        this.pointLight.color.setHex(0x64748b);
        this.pointLight.intensity = 1.2;
        break;
      default:
        coreMat.emissive.setHex(0x0284c7);
        coreMat.emissiveIntensity = 1.0;
        wireMat.emissive.setHex(0x38bdf8);
        this.pointLight.color.setHex(0x38bdf8);
        this.pointLight.intensity = 2.5;
        break;
    }
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);

    if (!this.isReducedMotion && this.reactorGroup) {
      const now = performance.now();
      const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.1) : 0.016;
      this.lastTime = now;
      const speedMultiplier = this.mood() === 'running' ? 2.4 : 1.0;

      this.reactorGroup.rotation.y += delta * 0.4 * speedMultiplier;
      this.wireframeMesh!.rotation.x += delta * 0.25 * speedMultiplier;
      this.wireframeMesh!.rotation.z += delta * 0.2 * speedMultiplier;

      if (this.ringOuter) {
        this.ringOuter.rotation.z += delta * 0.6 * speedMultiplier;
      }
      if (this.ringInner) {
        this.ringInner.rotation.y -= delta * 0.5 * speedMultiplier;
      }
      if (this.particleCloud) {
        this.particleCloud.rotation.y += delta * 0.15 * speedMultiplier;
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

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
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
