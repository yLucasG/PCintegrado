import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GuarnicoesService, GuarnicaoRow, TipoGuarnicao } from '../../../core/services/guarnicoes.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';

@Component({
  selector: 'app-guarnicoes-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './guarnicoes-page.html',
  styleUrl: './guarnicoes-page.css',
})
export class GuarnicoesPage {
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly companhiasService = inject(CompanhiasService);

  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly tipos: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV'];

  readonly novoNome = signal('');
  readonly novoTipo = signal<TipoGuarnicao>('GT_TATICO');
  readonly novaCompanhiaId = signal('');
  readonly novaArea = signal('');
  readonly novosPrefixos = signal('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [guarnicoes, companhias] = await Promise.all([
        this.guarnicoesService.listGuarnicoes(),
        this.companhiasService.listCompanhias(),
      ]);
      this.guarnicoes.set(guarnicoes);
      this.companhias.set(companhias);
    } catch {
      this.errorMessage.set('Não foi possível carregar as guarnições.');
    } finally {
      this.loading.set(false);
    }
  }

  companhiaNome(id: string): string {
    return this.companhias().find((c) => c.id === id)?.nome ?? '—';
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const prefixos = this.novosPrefixos()
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      await this.guarnicoesService.createGuarnicao({
        nome: this.novoNome(),
        tipo: this.novoTipo(),
        companhia_id: this.novaCompanhiaId(),
        area_atuacao: this.novaArea() || null,
        prefixos: prefixos.length > 0 ? prefixos : null,
      });
      this.novoNome.set('');
      this.novaArea.set('');
      this.novosPrefixos.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar a guarnição.');
    }
  }

  async onRemove(id: string): Promise<void> {
    try {
      await this.guarnicoesService.removeGuarnicao(id);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover a guarnição.');
    }
  }
}
