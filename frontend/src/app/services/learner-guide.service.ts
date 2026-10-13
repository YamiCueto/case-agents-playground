import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GuidesManifest, VersionGuide } from '../models/learner-guide.models';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LearnerGuideService {
  private readonly http = inject(HttpClient);

  readonly manifest = signal<GuidesManifest | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  constructor() {
    this.loadManifest();
  }

  async loadManifest(): Promise<void> {
    if (this.manifest() || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const data = await firstValueFrom(
        this.http.get<GuidesManifest>('docs/aprendices/guides_manifest.json')
      );
      this.manifest.set(data);
    } catch (err: unknown) {
      try {
        const fallbackData = await firstValueFrom(
          this.http.get<GuidesManifest>('/docs/aprendices/guides_manifest.json')
        );
        this.manifest.set(fallbackData);
      } catch (fallbackErr: unknown) {
        console.warn('No se pudo cargar guides_manifest.json, intentando fallback:', fallbackErr);
        this.loadError.set(
          'No se pudo cargar el manifiesto de guías. Verifica que public/docs/aprendices/ esté disponible.'
        );
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  getGuideForVersion(versionId: string): VersionGuide | null {
    const m = this.manifest();
    if (!m) return null;
    return m.versions[versionId] || null;
  }

  getExtraDoc(filename: string): string | null {
    const m = this.manifest();
    if (!m) return null;
    return m.extraDocs[filename] || null;
  }
}
