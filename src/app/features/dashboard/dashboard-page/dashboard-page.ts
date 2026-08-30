import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BaixaRow,
  LancamentoService,
  RosterRow,
  StatusEfetivo,
  turnoAtivoEm,
} from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PjesService, PjesRosterRow } from '../../../core/services/pjes.service';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_LABELS: Record<StatusEfetivo, string> = {
  PREVISTO: 'Presentes',
  FALTA: 'Faltas',
  ATRASADO: 'Atrasos',
  SUBSTITUIDO: 'Substituições',
  FOLGA: 'Folgas',
  REMANEJADO: 'Remanejamentos',
  LICENCA: 'LTS/DTS',
  CURSO: 'Cursos',
  DISPENSA: 'Dispensas',
  EXPEDIENTE: 'Expediente',
  AUSENCIA: 'Ausências',
};

const STATUS_ORDER: StatusEfetivo[] = [
  'PREVISTO',
  'FALTA',
  'ATRASADO',
  'SUBSTITUIDO',
  'FOLGA',
  'REMANEJADO',
  'LICENCA',
];

const STATUS_CARD_CLASSES: Record<StatusEfetivo, string> = {
  PREVISTO: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FALTA: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ATRASADO: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  SUBSTITUIDO: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  FOLGA: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  REMANEJADO: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  LICENCA: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  CURSO: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  DISPENSA: 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  EXPEDIENTE: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  AUSENCIA: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

interface ViaturaDesativada {
  nome: string;
  horarioInicio: string;
  motivo: string | null;
}

interface CardChave {
  guarnicaoId: string;
  horarioInicio: string;
}

interface ViaturasPorBairro {
  bairro: string;
  total: number;
}

interface CardPjesDash {
  chave: string;
  gtRotulo: string;
  horario: string;
  rows: PjesRosterRow[];
}

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly pjesService = inject(PjesService);

  readonly hoje = hojeIso();
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly roster = signal<RosterRow[]>([]);
  /** Roster PJES (serviço extra) do dia. */
  readonly pjesRoster = signal<PjesRosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  /** Filtro por horário de início exato (chips "05:00", "06:00"...). */
  readonly filtroHorario = signal('');
  /** Filtro por momento ("HH:MM"): conta o que está ativo naquele instante. */
  readonly filtroMomento = signal('');

  readonly statusOrder = STATUS_ORDER;

  constructor() {
    void this.reload();
  }

  get horariosDisponiveis(): string[] {
    const horarios = new Set(this.roster().map((r) => r.horarioInicio));
    return Array.from(horarios).sort();
  }

  /** Fim do turno de cada card (guarnição + início), extraído do roster. */
  private get fimPorCard(): Map<string, string> {
    const mapa = new Map<string, string>();
    for (const r of this.roster()) {
      mapa.set(`${r.guarnicaoId}__${r.horarioInicio}`, r.horarioFim);
    }
    return mapa;
  }

  selecionarHorario(horario: string): void {
    this.filtroHorario.set(horario);
    this.filtroMomento.set('');
  }

  selecionarMomento(momento: string): void {
    this.filtroMomento.set(momento);
    this.filtroHorario.set('');
  }

  usarAgora(): void {
    const agora = new Date();
    const hh = String(agora.getHours()).padStart(2, '0');
    const mm = String(agora.getMinutes()).padStart(2, '0');
    this.selecionarMomento(`${hh}:${mm}`);
  }

  limparFiltro(): void {
    this.filtroHorario.set('');
    this.filtroMomento.set('');
  }

  get rosterFiltrado(): RosterRow[] {
    const momento = this.filtroMomento();
    if (momento) {
      return this.roster().filter((r) => turnoAtivoEm(r.horarioInicio, r.horarioFim, momento));
    }
    const horario = this.filtroHorario();
    return horario ? this.roster().filter((r) => r.horarioInicio === horario) : this.roster();
  }

  get pjesRosterFiltrado(): PjesRosterRow[] {
    const momento = this.filtroMomento();
    if (momento) {
      return this.pjesRoster().filter((r) => turnoAtivoEm(r.horarioInicio, r.horarioFim, momento));
    }
    const horario = this.filtroHorario();
    return horario ? this.pjesRoster().filter((r) => r.horarioInicio === horario) : this.pjesRoster();
  }

  get pjesCards(): CardPjesDash[] {
    const grupos = new Map<string, CardPjesDash>();
    for (const r of this.pjesRosterFiltrado) {
      const chave = `${r.gtRotulo}__${r.horarioInicio}`;
      if (!grupos.has(chave)) {
        grupos.set(chave, {
          chave,
          gtRotulo: r.gtRotulo,
          horario: `${r.horarioInicio.slice(0, 5)}–${r.horarioFim.slice(0, 5)}`,
          rows: [],
        });
      }
      grupos.get(chave)!.rows.push(r);
    }
    return Array.from(grupos.values()).sort((a, b) => a.gtRotulo.localeCompare(b.gtRotulo));
  }

  get baixasFiltradas(): BaixaRow[] {
    const momento = this.filtroMomento();
    if (momento) {
      const fimPorCard = this.fimPorCard;
      return this.baixas().filter((b) => {
        const fim = fimPorCard.get(`${b.guarnicaoId}__${b.horarioInicio}`);
        return fim ? turnoAtivoEm(b.horarioInicio, fim, momento) : false;
      });
    }
    const horario = this.filtroHorario();
    return horario ? this.baixas().filter((b) => b.horarioInicio === horario) : this.baixas();
  }

  get totalLancados(): number {
    return this.rosterFiltrado.length + this.pjesRosterFiltrado.length;
  }

  private get cardChaves(): CardChave[] {
    const chaves = new Map<string, CardChave>();
    for (const r of this.rosterFiltrado) {
      const chave = `${r.guarnicaoId}__${r.horarioInicio}`;
      if (!chaves.has(chave)) {
        chaves.set(chave, { guarnicaoId: r.guarnicaoId, horarioInicio: r.horarioInicio });
      }
    }
    return Array.from(chaves.values());
  }

  private get cardsAtivos(): CardChave[] {
    const baixadas = new Set(this.baixasFiltradas.map((b) => `${b.guarnicaoId}__${b.horarioInicio}`));
    return this.cardChaves.filter((c) => !baixadas.has(`${c.guarnicaoId}__${c.horarioInicio}`));
  }

  get totalAtivas(): number {
    return this.cardsAtivos.length + this.pjesCards.length;
  }

  get totalDesativadas(): number {
    return this.baixasFiltradas.length;
  }

  // Linhas PJES não possuem `guarnicaoId` (serviço extra, sem viatura), então
  // não entram em `viaturasPorBairro` nem em `viaturasDesativadas`.
  get viaturasDesativadas(): ViaturaDesativada[] {
    return this.baixasFiltradas
      .map((b) => ({
        nome: this.guarnicoes().find((g) => g.id === b.guarnicaoId)?.nome ?? '—',
        horarioInicio: b.horarioInicio,
        motivo: b.motivo,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  get viaturasPorBairro(): ViaturasPorBairro[] {
    const contagem = new Map<string, number>();
    for (const card of this.cardsAtivos) {
      const bairro = this.guarnicoes().find((g) => g.id === card.guarnicaoId)?.area_atuacao ?? 'Sem área definida';
      contagem.set(bairro, (contagem.get(bairro) ?? 0) + 1);
    }
    return Array.from(contagem.entries())
      .map(([bairro, total]) => ({ bairro, total }))
      .sort((a, b) => b.total - a.total || a.bairro.localeCompare(b.bairro));
  }

  contagemPorStatus(status: StatusEfetivo): number {
    let n = this.rosterFiltrado.filter((r) => r.statusEfetivo === status).length;
    if (status === 'PREVISTO') n += this.pjesRosterFiltrado.filter((r) => r.status === 'PREVISTO').length;
    if (status === 'FALTA') n += this.pjesRosterFiltrado.filter((r) => r.status === 'FALTA').length;
    if (status === 'ATRASADO') n += this.pjesRosterFiltrado.filter((r) => r.status === 'ATRASADO').length;
    return n;
  }

  statusLabel(status: StatusEfetivo): string {
    return STATUS_LABELS[status];
  }

  statusCardClasses(status: StatusEfetivo): string {
    return STATUS_CARD_CLASSES[status];
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [roster, baixas, guarnicoes, pjesRoster] = await Promise.all([
        this.lancamentoService.listRosterDoDia(this.hoje),
        this.lancamentoService.listBaixasDoDia(this.hoje),
        this.guarnicoesService.listGuarnicoes(),
        this.pjesService.listPjesRosterDoDia(this.hoje),
      ]);
      this.roster.set(roster);
      this.baixas.set(baixas);
      this.guarnicoes.set(guarnicoes);
      this.pjesRoster.set(pjesRoster);
    } catch {
      this.errorMessage.set('Não foi possível carregar o resumo do dia.');
    } finally {
      this.loading.set(false);
    }
  }
}
