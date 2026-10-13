import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DemoModeService {
  readonly isDemoMode = signal<boolean>(false);

  constructor() {
    this.initMode();
  }

  isEnforcedDemoMode(): boolean {
    return Boolean(environment.demoMode) || this.isGitHubPages();
  }

  canToggleMode(): boolean {
    return !this.isEnforcedDemoMode();
  }

  private initMode(): void {
    if (this.isEnforcedDemoMode()) {
      // En GitHub Pages o compilación demo, el modo Demo es 100% obligatorio
      this.isDemoMode.set(true);
      return;
    }

    if (typeof window === 'undefined') {
      this.isDemoMode.set(false);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const demoParam = urlParams.get('demo');
    const storedPref = sessionStorage.getItem('aep_demo_mode');

    if (demoParam === 'true' || demoParam === '1') {
      this.setDemoMode(true);
    } else if (demoParam === 'false' || demoParam === '0') {
      this.setDemoMode(false);
    } else if (storedPref !== null) {
      this.isDemoMode.set(storedPref === 'true');
    } else {
      this.isDemoMode.set(false);
    }
  }

  setDemoMode(enabled: boolean): void {
    if (this.isEnforcedDemoMode()) {
      // Protección de seguridad: impedir desactivar el modo demo en entornos estáticos
      this.isDemoMode.set(true);
      return;
    }

    this.isDemoMode.set(enabled);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('aep_demo_mode', String(enabled));
    }
  }

  toggleDemoMode(): void {
    if (!this.canToggleMode()) {
      console.warn('El modo Demo es obligatorio en esta compilación estática / GitHub Pages.');
      return;
    }
    this.setDemoMode(!this.isDemoMode());
  }

  isGitHubPages(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.hostname.includes('github.io');
  }
}
