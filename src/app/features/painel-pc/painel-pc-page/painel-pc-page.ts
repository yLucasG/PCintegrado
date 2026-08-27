import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LancamentoService, RosterRow } from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';

type TipoLancamento = 'FALTA' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-painel-pc-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './painel-pc-page.html',
  styleUrl: './painel-pc-page.css',
})
export class PainelPcPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly filtroGuarnicaoId = signal('');
  readonly buscaPolicial = signal('');

  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO'];
  readonly tipoLancamento = signal<TipoLancamento>('FALTA');
  readonly formPolicialMatricula = signal('');
  readonly formSubstitutoMatricula = signal('');
  readonly formMotivo = signal('');
  readonly formSeiNumero = signal('');
  readonly formAutorizacao = signal('');
  readonly formDestino = signal('');
  readonly registrando = signal(false);

  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
  }

  get rosterFiltrado(): RosterRow[] {
    let rows = this.roster();
    const guarnicaoId = this.filtroGuarnicaoId();
    if (guarnicaoId) {
      rows = rows.filter((r) => r.guarnicaoId === guarnicaoId);
    }
    const busca = this.buscaPolicial().trim().toLowerCase();
    if (busca) {
      rows = rows.filter(
        (r) =>
          r.policialMatricula.toLowerCase().includes(busca) ||
          this.policialNome(r.policialMatricula).toLowerCase().includes(busca),
      );
    }
    return rows;
  }

  async carregarListasBase(): Promise<void> {
    try {
      const [guarnicoes, policiais] = await Promise.all([
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
      ]);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
    } catch {
      this.errorMessage.set('Não foi possível carregar guarnições/policiais.');
    }
  }

  async reloadRoster(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.roster.set(await this.lancamentoService.listRosterDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar o lançamento do dia.');
    } finally {
      this.loading.set(false);
    }
  }

  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await this.reloadRoster();
  }

  guarnicaoNome(id: string): string {
    return this.guarnicoes().find((g) => g.id === id)?.nome ?? '—';
  }

  policialNome(matricula: string): string {
    return this.policiais().find((p) => p.matricula === matricula)?.nome_guerra ?? matricula;
  }

  private limparFormulario(): void {
    this.formPolicialMatricula.set('');
    this.formSubstitutoMatricula.set('');
    this.formMotivo.set('');
    this.formSeiNumero.set('');
    this.formAutorizacao.set('');
    this.formDestino.set('');
  }

  async onRegistrar(): Promise<void> {
    this.registrando.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      switch (this.tipoLancamento()) {
        case 'FALTA':
          await this.lancamentoService.registrarFalta({
            data,
            policial_matricula: this.formPolicialMatricula(),
            motivo: this.formMotivo() || null,
          });
          break;
        case 'PERMUTA':
          await this.lancamentoService.registrarPermuta({
            data,
            policial_substituido_matricula: this.formPolicialMatricula(),
            policial_substituto_matricula: this.formSubstitutoMatricula(),
            sei_numero: this.formSeiNumero() || null,
          });
          break;
        case 'FOLGA':
          await this.lancamentoService.registrarFolga({
            data,
            policial_matricula: this.formPolicialMatricula(),
            sei_numero: this.formSeiNumero() || null,
            autorizacao: this.formAutorizacao() || null,
          });
          break;
        case 'REMANEJAMENTO':
          await this.lancamentoService.registrarRemanejamento({
            data,
            policial_matricula: this.formPolicialMatricula(),
            destino: this.formDestino(),
          });
          break;
      }
      this.limparFormulario();
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível registrar a alteração.');
    } finally {
      this.registrando.set(false);
    }
  }
}
