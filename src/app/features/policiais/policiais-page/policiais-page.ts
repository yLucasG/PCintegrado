import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { LancamentoService } from '../../../core/services/lancamento.service';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-policiais-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './policiais-page.html',
  styleUrl: './policiais-page.css',
})
export class PoliciaisPage {
  private readonly policiaisService = inject(PoliciaisService);
  private readonly companhiasService = inject(CompanhiasService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly lancamentoService = inject(LancamentoService);

  readonly policiais = signal<PolicialRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly funcaoHojePorMatricula = signal<Map<string, string>>(new Map());
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly novaMatricula = signal('');
  readonly novaGraduacao = signal('');
  readonly novoNomeGuerra = signal('');
  readonly novoTelefone = signal('');
  readonly novaCompanhiaId = signal('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [policiais, companhias, guarnicoes, roster] = await Promise.all([
        this.policiaisService.listPoliciais(),
        this.companhiasService.listCompanhias(),
        this.guarnicoesService.listGuarnicoes(),
        this.lancamentoService.listRosterDoDia(hojeIso()),
      ]);
      this.policiais.set(policiais);
      this.companhias.set(companhias);

      const tipoPorGuarnicao = new Map<string, GuarnicaoRow['tipo']>(guarnicoes.map((g) => [g.id, g.tipo]));
      const funcaoHoje = new Map<string, string>();
      for (const linha of roster) {
        const tipo = tipoPorGuarnicao.get(linha.guarnicaoId);
        if (tipo) {
          funcaoHoje.set(linha.policialMatricula, tipo);
        }
      }
      this.funcaoHojePorMatricula.set(funcaoHoje);
    } catch {
      this.errorMessage.set('Não foi possível carregar os policiais.');
    } finally {
      this.loading.set(false);
    }
  }

  companhiaNome(id: string | null): string {
    return this.companhias().find((c) => c.id === id)?.nome ?? '—';
  }

  funcaoHoje(matricula: string): string {
    return this.funcaoHojePorMatricula().get(matricula) ?? 'P.O.';
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.policiaisService.createPolicial({
        matricula: this.novaMatricula(),
        graduacao: this.novaGraduacao(),
        nome_guerra: this.novoNomeGuerra(),
        telefone: this.novoTelefone() || null,
        companhia_id: this.novaCompanhiaId() || null,
      });
      this.novaMatricula.set('');
      this.novaGraduacao.set('');
      this.novoNomeGuerra.set('');
      this.novoTelefone.set('');
      this.novaCompanhiaId.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar o policial.');
    }
  }

  async onRemove(matricula: string): Promise<void> {
    try {
      await this.policiaisService.removePolicial(matricula);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover o policial.');
    }
  }
}
