import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { LancamentoService, RosterRow, StatusEfetivo } from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';

type TipoLancamento = 'FALTA' | 'ATRASADO' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO';

interface CardGuarnicao {
  guarnicaoId: string;
  nome: string;
  areaAtuacao: string | null;
  horario: string;
  rows: RosterRow[];
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_BADGE_CLASSES: Record<StatusEfetivo, string> = {
  PREVISTO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  FALTA: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  ATRASADO: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  SUBSTITUIDO: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  FOLGA: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  REMANEJADO: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
};

@Component({
  selector: 'app-painel-pc-page',
  imports: [CommonModule, FormsModule, CdkDropList, CdkDrag],
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

  readonly filtroHorario = signal('');
  readonly buscaPolicial = signal('');

  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'ATRASADO', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO'];
  readonly tipoLancamento = signal<TipoLancamento>('FALTA');
  readonly formPolicialMatricula = signal('');
  readonly formSubstitutoMatricula = signal('');
  readonly formMotivo = signal('');
  readonly formSeiNumero = signal('');
  readonly formAutorizacao = signal('');
  readonly formDestino = signal('');
  readonly formHorarioChegada = signal('');
  readonly registrando = signal(false);

  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
  }

  get horariosDisponiveis(): string[] {
    const horarios = new Set(this.roster().map((r) => r.horarioInicio));
    return Array.from(horarios).sort();
  }

  get rosterFiltrado(): RosterRow[] {
    let rows = this.roster();
    const horario = this.filtroHorario();
    if (horario) {
      rows = rows.filter((r) => r.horarioInicio === horario);
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

  get cards(): CardGuarnicao[] {
    const grupos = new Map<string, CardGuarnicao>();
    for (const row of this.rosterFiltrado) {
      const existente = grupos.get(row.guarnicaoId);
      if (existente) {
        existente.rows.push(row);
      } else {
        grupos.set(row.guarnicaoId, {
          guarnicaoId: row.guarnicaoId,
          nome: this.guarnicaoNome(row.guarnicaoId),
          areaAtuacao: this.guarnicaoAreaAtuacao(row.guarnicaoId),
          horario: `${row.horarioInicio}–${row.horarioFim}`,
          rows: [row],
        });
      }
    }
    return Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  get dropListIds(): string[] {
    return this.cards.map((c) => c.guarnicaoId);
  }

  statusBadgeClasses(status: StatusEfetivo): string {
    return STATUS_BADGE_CLASSES[status];
  }

  corBordaCard(card: CardGuarnicao): string {
    const temProblema = card.rows.some((r) => r.statusEfetivo !== 'PREVISTO');
    return temProblema
      ? 'border-l-red-500 dark:border-l-red-400'
      : 'border-l-emerald-500 dark:border-l-emerald-400';
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

  guarnicaoAreaAtuacao(id: string): string | null {
    return this.guarnicoes().find((g) => g.id === id)?.area_atuacao ?? null;
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
    this.formHorarioChegada.set('');
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
        case 'ATRASADO':
          await this.lancamentoService.registrarAtraso({
            data,
            policial_matricula: this.formPolicialMatricula(),
            horario_chegada: this.formHorarioChegada() || null,
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

  async marcarFaltaRapido(row: RosterRow): Promise<void> {
    try {
      await this.lancamentoService.registrarFalta({
        data: this.data(),
        policial_matricula: row.policialMatricula,
        escala_mensal_id: row.escalaMensalId,
      });
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível marcar falta.');
    }
  }

  async marcarAtrasoRapido(row: RosterRow): Promise<void> {
    try {
      await this.lancamentoService.registrarAtraso({
        data: this.data(),
        policial_matricula: row.policialMatricula,
        escala_mensal_id: row.escalaMensalId,
      });
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível marcar atraso.');
    }
  }

  async onDrop(event: CdkDragDrop<RosterRow[], RosterRow[], RosterRow>): Promise<void> {
    if (event.previousContainer === event.container) {
      return;
    }
    const row = event.item.data;
    const destinoGuarnicaoId = event.container.id;
    const destinoNome = this.guarnicaoNome(destinoGuarnicaoId);
    try {
      await this.lancamentoService.registrarRemanejamento({
        data: this.data(),
        policial_matricula: row.policialMatricula,
        escala_mensal_id: row.escalaMensalId,
        destino: destinoNome,
      });
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível remanejar.');
    }
  }
}
