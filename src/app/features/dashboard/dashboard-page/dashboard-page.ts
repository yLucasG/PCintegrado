import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  BaixaRow,
  LancamentoService,
  RosterRow,
  StatusEfetivo,
} from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';

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

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);

  readonly hoje = hojeIso();
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly roster = signal<RosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly filtroHorario = signal('');

  readonly statusOrder = STATUS_ORDER;

  constructor() {
    void this.reload();
  }

  get horariosDisponiveis(): string[] {
    const horarios = new Set(this.roster().map((r) => r.horarioInicio));
    return Array.from(horarios).sort();
  }

  get rosterFiltrado(): RosterRow[] {
    const horario = this.filtroHorario();
    return horario ? this.roster().filter((r) => r.horarioInicio === horario) : this.roster();
  }

  get baixasFiltradas(): BaixaRow[] {
    const horario = this.filtroHorario();
    return horario ? this.baixas().filter((b) => b.horarioInicio === horario) : this.baixas();
  }

  get totalLancados(): number {
    return this.rosterFiltrado.length;
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
    return this.cardsAtivos.length;
  }

  get totalDesativadas(): number {
    return this.baixasFiltradas.length;
  }

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
    return this.rosterFiltrado.filter((r) => r.statusEfetivo === status).length;
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
      const [roster, baixas, guarnicoes] = await Promise.all([
        this.lancamentoService.listRosterDoDia(this.hoje),
        this.lancamentoService.listBaixasDoDia(this.hoje),
        this.guarnicoesService.listGuarnicoes(),
      ]);
      this.roster.set(roster);
      this.baixas.set(baixas);
      this.guarnicoes.set(guarnicoes);
    } catch {
      this.errorMessage.set('Não foi possível carregar o resumo do dia.');
    } finally {
      this.loading.set(false);
    }
  }
}
