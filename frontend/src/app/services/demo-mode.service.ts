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

  private initMode(): void {
    if (typeof window === 'undefined') {
      this.isDemoMode.set(Boolean(environment.demoMode));
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const demoParam = urlParams.get('demo');
    const isGhPages = window.location.hostname.includes('github.io');
    const storedPref = sessionStorage.getItem('aep_demo_mode');

    if (demoParam === 'true' || demoParam === '1') {
      this.setDemoMode(true);
    } else if (demoParam === 'false' || demoParam === '0') {
      this.setDemoMode(false);
    } else if (isGhPages) {
      // En GitHub Pages siempre activamos demo por defecto
      this.setDemoMode(true);
    } else if (storedPref !== null) {
      this.isDemoMode.set(storedPref === 'true');
    } else {
      this.isDemoMode.set(Boolean(environment.demoMode));
    }
  }

  setDemoMode(enabled: boolean): void {
    this.isDemoMode.set(enabled);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('aep_demo_mode', String(enabled));
    }
  }

  toggleDemoMode(): void {
    this.setDemoMode(!this.isDemoMode());
  }

  isGitHubPages(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.hostname.includes('github.io');
  }
}
