import { Injectable } from '@angular/core';
import { ItemTextoPdf } from './pjes-pdf.parser';

/**
 * Wrapper fino em torno de `pdfjs-dist` para uso no browser.
 *
 * O worker do pdf.js é servido como asset estático a partir de `public/`
 * (`public/pdf.worker.min.mjs`), copiado de
 * `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`. As abordagens de
 * resolução via bundler (`import '...?url'` e `new URL(..., import.meta.url)`)
 * não funcionam com o builder esbuild do Angular 21 — ver task-4-report.md.
 */
@Injectable({ providedIn: 'root' })
export class PjesPdfService {
  private workerConfigurado = false;

  private configurarWorker(pdfjs: typeof import('pdfjs-dist')): void {
    if (this.workerConfigurado) return;
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';
    this.workerConfigurado = true;
  }

  async extrairItens(file: File): Promise<ItemTextoPdf[]> {
    const pdfjs = await import('pdfjs-dist');
    this.configurarWorker(pdfjs);

    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const itens: ItemTextoPdf[] = [];

    try {
      for (let page = 1; page <= doc.numPages; page++) {
        const p = await doc.getPage(page);
        const content = await p.getTextContent();
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const t = item as { str: string; transform: number[] };
          itens.push({ str: t.str, x: t.transform[4], y: t.transform[5], page });
        }
      }
    } finally {
      await doc.destroy();
    }

    return itens;
  }
}
