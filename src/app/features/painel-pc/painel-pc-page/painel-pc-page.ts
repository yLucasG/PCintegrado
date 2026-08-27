import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { LancamentoService, RosterRow, StatusEfetivo } from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow, TipoGuarnicao } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';

type TipoLancamento = 'FALTA' | 'ATRASADO' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO';

interface CardGuarnicao {
  guarnicaoId: string;
  nome: string;
  tipo: TipoGuarnicao;
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

const TIPO_BADGE_CLASSES: Record<TipoGuarnicao, string> = {
  GT_TATICO: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  GT_ORDINARIO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  MO: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  CP: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  GV: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
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
  readonly expandedCardIds = signal<Set<string>>(new Set());

  readonly modalRow = signal<RosterRow | null>(null);
  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'ATRASADO', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO'];
  readonly tipoLancamento = signal<TipoLancamento>('FALTA');
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
          tipo: this.guarnicaoTipo(row.guarnicaoId),
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

  tipoBadgeClasses(tipo: TipoGuarnicao): string {
    return TIPO_BADGE_CLASSES[tipo];
  }

  corBordaCard(card: CardGuarnicao): string {
    const temProblema = card.rows.some((r) => r.statusEfetivo !== 'PREVISTO');
    return temProblema
      ? 'border-l-red-500 dark:border-l-red-400'
      : 'border-l-emerald-500 dark:border-l-emerald-400';
  }

  resumoCard(card: CardGuarnicao): string {
    const total = card.rows.length;
    const desvios = card.rows.filter((r) => r.statusEfetivo !== 'PREVISTO');
    if (desvios.length === 0) {
      return `${total} previsto${total === 1 ? '' : 's'}`;
    }
    const porStatus = new Map<StatusEfetivo, number>();
    for (const r of desvios) {
      porStatus.set(r.statusEfetivo, (porStatus.get(r.statusEfetivo) ?? 0) + 1);
    }
    const partes = Array.from(porStatus.entries()).map(([status, count]) => `${count} ${status.toLowerCase()}`);
    return `${total} no total · ${partes.join(', ')}`;
  }

  isExpanded(guarnicaoId: string): boolean {
    return this.expandedCardIds().has(guarnicaoId);
  }

  toggleCard(guarnicaoId: string): void {
    const atual = new Set(this.expandedCardIds());
    if (atual.has(guarnicaoId)) {
      atual.delete(guarnicaoId);
    } else {
      atual.add(guarnicaoId);
    }
    this.expandedCardIds.set(atual);
  }

  iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    const letras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
    return letras.join('') || '?';
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

  guarnicaoTipo(id: string): TipoGuarnicao {
    return this.guarnicoes().find((g) => g.id === id)?.tipo ?? 'GT_ORDINARIO';
  }

  guarnicaoAreaAtuacao(id: string): string | null {
    return this.guarnicoes().find((g) => g.id === id)?.area_atuacao ?? null;
  }

  policialNome(matricula: string): string {
    return this.policiais().find((p) => p.matricula === matricula)?.nome_guerra ?? matricula;
  }

  policialTelefone(matricula: string): string | null {
    return this.policiais().find((p) => p.matricula === matricula)?.telefone ?? null;
  }

  abrirModal(row: RosterRow): void {
    this.modalRow.set(row);
    this.tipoLancamento.set(row.statusEfetivo === 'ATRASADO' ? 'ATRASADO' : 'FALTA');
    this.formMotivo.set(row.statusEfetivo === 'FALTA' || row.statusEfetivo === 'ATRASADO' ? (row.detalhe ?? '') : '');
    this.formSubstitutoMatricula.set('');
    this.formSeiNumero.set('');
    this.formAutorizacao.set('');
    this.formDestino.set('');
    this.formHorarioChegada.set('');
  }

  fecharModal(): void {
    this.modalRow.set(null);
  }

  async onRegistrarModal(): Promise<void> {
    const linha = this.modalRow();
    if (!linha) {
      return;
    }
    this.registrando.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      switch (this.tipoLancamento()) {
        case 'FALTA':
          await this.lancamentoService.registrarFalta({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            motivo: this.formMotivo() || null,
          });
          break;
        case 'ATRASADO':
          await this.lancamentoService.registrarAtraso({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            horario_chegada: this.formHorarioChegada() || null,
            motivo: this.formMotivo() || null,
          });
          break;
        case 'PERMUTA':
          await this.lancamentoService.registrarPermuta({
            data,
            policial_substituido_matricula: linha.policialMatricula,
            policial_substituto_matricula: this.formSubstitutoMatricula(),
            escala_mensal_id: linha.escalaMensalId,
            sei_numero: this.formSeiNumero() || null,
          });
          break;
        case 'FOLGA':
          await this.lancamentoService.registrarFolga({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            sei_numero: this.formSeiNumero() || null,
            autorizacao: this.formAutorizacao() || null,
          });
          break;
        case 'REMANEJAMENTO':
          await this.lancamentoService.registrarRemanejamento({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            destino: this.formDestino(),
          });
          break;
      }
      this.fecharModal();
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível registrar a alteração.');
    } finally {
      this.registrando.set(false);
    }
  }

  async toggleFalta(row: RosterRow): Promise<void> {
    try {
      if (row.statusEfetivo === 'FALTA' && row.detalheId) {
        await this.lancamentoService.removerFalta(row.detalheId);
      } else {
        await this.lancamentoService.registrarFalta({
          data: this.data(),
          policial_matricula: row.policialMatricula,
          escala_mensal_id: row.escalaMensalId,
        });
      }
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível atualizar a falta.');
    }
  }

  async toggleAtraso(row: RosterRow): Promise<void> {
    try {
      if (row.statusEfetivo === 'ATRASADO' && row.detalheId) {
        await this.lancamentoService.removerAtraso(row.detalheId);
      } else {
        await this.lancamentoService.registrarAtraso({
          data: this.data(),
          policial_matricula: row.policialMatricula,
          escala_mensal_id: row.escalaMensalId,
        });
      }
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível atualizar o atraso.');
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
