import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  constructor() {
    marked.setOptions({
      gfm: true,
      breaks: true
    });
  }

  transform(value: string | null | undefined): SafeHtml {
    if (!value) {
      return '';
    }

    try {
      const rawHtml = marked.parse(value) as string;
      const cleanHtml = DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['target', 'rel', 'class'],
        USE_PROFILES: { html: true }
      });
      return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
    } catch {
      return value;
    }
  }
}
