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
          <div class="hologram-orb">
            <div class="orb-ring ring-outer"></div>
            <div class="orb-ring ring-inner"></div>
            <div class="orb-core">
              <span class="orb-eyes">&#x2022;&#x2022;</span>
            </div>
          </div>
          <span class="fallback-caption">AEP Guide (2D)</span>
        </div>
      } @else {
        <canvas #canvasRef class="three-canvas" aria-label="Avatar Guía 3D del Agent Playground"></canvas>
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
      height: 140px;
      position: relative;
    }
    .avatar-canvas-wrapper {
      width: 100%;
      height: 100%;
      position: relative;
      background: radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.8) 0%, rgba(2, 6, 23, 0.95) 100%);
      border-radius: 10px;
      border: 1px solid rgba(56, 189, 248, 0.2);
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
      bottom: 6px;
      right: 8px;
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(4px);
      border: 1px solid #334155;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      pointer-events: none;
      transition: all 0.2s ease;
    }
    .mood-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 6px #38bdf8;
    }
    .mood-pill.running .mood-indicator {
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
      animation: pulseMood 1s infinite alternate;
    }
    .mood-pill.completed .mood-indicator {
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }
    .mood-pill.failed .mood-indicator {
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }
    .mood-pill.pointing .mood-indicator {
      background: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }
    .mood-pill.skipped .mood-indicator {
      background: #94a3b8;
      box-shadow: 0 0 4px #94a3b8;
    }
    .mood-label {
      color: #e2e8f0;
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
      gap: 6px;
    }
    .hologram-orb {
      width: 60px;
      height: 60px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .orb-ring {
      position: absolute;
      border-radius: 50%;
      border: 2px dashed #38bdf8;
    }
    .ring-outer {
      width: 100%;
      height: 100%;
      animation: spin2d 8s linear infinite;
    }
    .ring-inner {
      width: 75%;
      height: 75%;
      border-color: #22c55e;
      animation: spin2dReverse 6s linear infinite;
    }
    .orb-core {
      width: 38px;
      height: 38px;
      background: radial-gradient(circle, #0284c7 0%, #0f172a 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
    }
    .orb-eyes {
      color: #38bdf8;
      font-size: 1rem;
      letter-spacing: 2px;
      font-weight: 900;
    }
    .fallback-caption {
      font-size: 0.7rem;
      color: #94a3b8;
      font-weight: 600;
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

  @ViewChild('containerRef') private containerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('canvasRef') private canvasRef?: ElementRef<HTMLCanvasElement>;

  readonly hasWebGLError = input<boolean>(false);

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private animFrameId?: number;
  private resizeObserver?: ResizeObserver;

  private avatarGroup?: THREE.Group;
  private headMesh?: THREE.Mesh;
  private eyeMesh?: THREE.Mesh;
  private ringOuter?: THREE.Mesh;
  private ringInner?: THREE.Mesh;
  private pointerArm?: THREE.Mesh;
  private particles?: THREE.Points;
  private pointLight?: THREE.PointLight;

  private clock = new THREE.Clock();
  private isReducedMotion = false;

  constructor() {
    effect(() => {
      const currentMood = this.mood();
      const currentHop = this.targetHop();
      this.updateAvatarColorsAndPose(currentMood, currentHop);
    });
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
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
      case 'running': return 'Observando Runtime';
      case 'pointing': return 'Señalando Hop Activo';
      case 'completed': return 'Ejecución Exitosa';
      case 'failed': return 'Alerta en Ejecución';
      case 'skipped': return 'Hop Omitido';
      default: return 'En Espera';
    }
  }

  private initThree(): void {
    if (!this.canvasRef?.nativeElement || !this.containerRef?.nativeElement) return;

    const width = this.containerRef.nativeElement.clientWidth || 300;
    const height = this.containerRef.nativeElement.clientHeight || 140;

    try {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      this.camera.position.set(0, 0, 4.2);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvasRef.nativeElement,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      this.scene.add(ambientLight);

      this.pointLight = new THREE.PointLight(0x38bdf8, 2.5, 10);
      this.pointLight.position.set(0, 1, 2);
      this.scene.add(this.pointLight);

      this.buildAvatar();
      this.buildParticles();

      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.containerRef.nativeElement);

      this.animate();
    } catch (err) {
      console.warn('WebGL no disponible, utilizando fallback 2D:', err);
    }
  }

  private buildAvatar(): void {
    this.avatarGroup = new THREE.Group();

    const headGeo = new THREE.IcosahedronGeometry(0.72, 2);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.2,
      wireframe: false
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.avatarGroup.add(this.headMesh);

    const eyeGeo = new THREE.BoxGeometry(0.55, 0.16, 0.45);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.2,
      roughness: 0.1
    });
    this.eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeMesh.position.set(0, 0.1, 0.52);
    this.avatarGroup.add(this.eyeMesh);

    const ringOuterGeo = new THREE.TorusGeometry(1.05, 0.025, 12, 48);
    const ringOuterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.8
    });
    this.ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
    this.ringOuter.rotation.x = Math.PI / 3;
    this.avatarGroup.add(this.ringOuter);

    const ringInnerGeo = new THREE.TorusGeometry(0.88, 0.02, 12, 48);
    const ringInnerMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 0.8
    });
    this.ringInner = new THREE.Mesh(ringInnerGeo, ringInnerMat);
    this.ringInner.rotation.x = -Math.PI / 4;
    this.avatarGroup.add(this.ringInner);

    const armGeo = new THREE.ConeGeometry(0.08, 0.45, 12);
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1
    });
    this.pointerArm = new THREE.Mesh(armGeo, armMat);
    this.pointerArm.rotation.z = -Math.PI / 2.2;
    this.pointerArm.position.set(0.9, -0.15, 0);
    this.avatarGroup.add(this.pointerArm);

    this.scene?.add(this.avatarGroup);
  }

  private buildParticles(): void {
    const particleCount = 40;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 5;
      positions[i + 1] = (Math.random() - 0.5) * 3;
      positions[i + 2] = (Math.random() - 0.5) * 3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.04,
      transparent: true,
      opacity: 0.6
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene?.add(this.particles);
  }

  private updateAvatarColorsAndPose(mood: AvatarMood, targetHop: number): void {
    if (!this.eyeMesh || !this.pointLight || !this.pointerArm) return;

    const eyeMat = this.eyeMesh.material as THREE.MeshStandardMaterial;
    const armMat = this.pointerArm.material as THREE.MeshStandardMaterial;

    switch (mood) {
      case 'running':
        eyeMat.emissive.setHex(0x38bdf8);
        this.pointLight.color.setHex(0x38bdf8);
        this.pointerArm.rotation.z = -Math.PI / 3;
        break;
      case 'pointing':
        eyeMat.emissive.setHex(0x38bdf8);
        this.pointLight.color.setHex(0x38bdf8);
        this.pointerArm.rotation.z = -Math.PI / 2.5 + (targetHop * 0.08);
        break;
      case 'completed':
        eyeMat.emissive.setHex(0x22c55e);
        this.pointLight.color.setHex(0x22c55e);
        armMat.emissive.setHex(0x22c55e);
        this.pointerArm.rotation.z = -Math.PI / 1.5;
        break;
      case 'failed':
        eyeMat.emissive.setHex(0xef4444);
        this.pointLight.color.setHex(0xef4444);
        armMat.emissive.setHex(0xef4444);
        this.pointerArm.rotation.z = -Math.PI / 4;
        break;
      case 'skipped':
        eyeMat.emissive.setHex(0x94a3b8);
        this.pointLight.color.setHex(0x94a3b8);
        armMat.emissive.setHex(0x94a3b8);
        break;
      default:
        eyeMat.emissive.setHex(0x0284c7);
        this.pointLight.color.setHex(0x38bdf8);
        armMat.emissive.setHex(0x0284c7);
        this.pointerArm.rotation.z = -Math.PI / 2.2;
        break;
    }
  }

  private animate(): void {
    this.animFrameId = requestAnimationFrame(() => this.animate());

    if (!this.avatarGroup || !this.renderer || !this.scene || !this.camera) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    const speed = this.isReducedMotion ? 0.3 : 1.0;

    const currentMood = this.mood();

    if (currentMood === 'completed') {
      this.avatarGroup.position.y = Math.sin(elapsed * 4 * speed) * 0.12;
      this.avatarGroup.rotation.y += 0.03 * speed;
    } else if (currentMood === 'failed') {
      this.avatarGroup.position.x = Math.sin(elapsed * 25) * 0.03;
      this.avatarGroup.position.y = 0;
    } else {
      this.avatarGroup.position.y = Math.sin(elapsed * 1.8 * speed) * 0.06;
      this.avatarGroup.rotation.y = Math.sin(elapsed * 0.8 * speed) * 0.15;
    }

    if (this.ringOuter) {
      this.ringOuter.rotation.z += 0.015 * speed;
      this.ringOuter.rotation.y += 0.01 * speed;
    }

    if (this.ringInner) {
      this.ringInner.rotation.z -= 0.02 * speed;
      this.ringInner.rotation.x += 0.012 * speed;
    }

    if (this.particles) {
      this.particles.rotation.y += 0.003 * speed;
    }

    this.renderer.render(this.scene, this.camera);
  }

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
    if (this.headMesh) {
      this.headMesh.geometry.dispose();
      (this.headMesh.material as THREE.Material).dispose();
    }
    if (this.eyeMesh) {
      this.eyeMesh.geometry.dispose();
      (this.eyeMesh.material as THREE.Material).dispose();
    }
    if (this.ringOuter) {
      this.ringOuter.geometry.dispose();
      (this.ringOuter.material as THREE.Material).dispose();
    }
    if (this.ringInner) {
      this.ringInner.geometry.dispose();
      (this.ringInner.material as THREE.Material).dispose();
    }
    if (this.pointerArm) {
      this.pointerArm.geometry.dispose();
      (this.pointerArm.material as THREE.Material).dispose();
    }
    if (this.particles) {
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
