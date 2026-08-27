import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViaturasService, ViaturaRow } from '../../../core/services/viaturas.service';

@Component({
  selector: 'app-viaturas-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './viaturas-page.html',
  styleUrl: './viaturas-page.css',
})
export class ViaturasPage {
  private readonly viaturasService = inject(ViaturasService);

  readonly viaturas = signal<ViaturaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly novoPrefixo = signal('');
  readonly novaArea = signal('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.viaturas.set(await this.viaturasService.listViaturas());
    } catch {
      this.errorMessage.set('Não foi possível carregar as viaturas.');
    } finally {
      this.loading.set(false);
    }
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.viaturasService.createViatura({
        prefixo: this.novoPrefixo(),
        area_atuacao: this.novaArea() || null,
      });
      this.novoPrefixo.set('');
      this.novaArea.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar a viatura.');
    }
  }

  async onRemove(prefixo: string): Promise<void> {
    try {
      await this.viaturasService.removeViatura(prefixo);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover a viatura.');
    }
  }
}
