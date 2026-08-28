import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  BaixaRow,
  LancamentoService,
  OsRow,
  RosterRow,
  StatusEfetivo,
} from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow, TipoGuarnicao } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';
import { EscalaMensalService } from '../../../core/services/escala-mensal.service';

type TipoLancamento = 'FALTA' | 'ATRASADO' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO' | 'LICENCA';

interface CardGuarnicao {
  cardId: string;
  guarnicaoId: string;
  nome: string;
  areaAtuacao: string | null;
  horarioInicio: string;
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
  LICENCA: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
};

const STATUS_LABELS: Record<StatusEfetivo, string> = {
  PREVISTO: 'Presente',
  FALTA: 'Falta',
  ATRASADO: 'Atrasado',
  SUBSTITUIDO: 'Substituído',
  FOLGA: 'Folga',
  REMANEJADO: 'Remanejado',
  LICENCA: 'LTS/DTS',
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
  private readonly companhiasService = inject(CompanhiasService);
  private readonly escalaMensalService = inject(EscalaMensalService);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly osRows = signal<OsRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly filtroHorario = signal('');
  readonly buscaPolicial = signal('');

  readonly novaViaturaAberta = signal(false);
  readonly tiposGuarnicao: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV'];
  readonly novaViaturaNome = signal('');
  readonly novaViaturaTipo = signal<TipoGuarnicao>('GT_TATICO');
  readonly novaViaturaCompanhiaId = signal('');
  readonly novaViaturaArea = signal('');
  readonly novaViaturaPrefixos = signal('');
  readonly novaViaturaHorarioInicio = signal('06:00');
  readonly novaViaturaHorarioFim = signal('18:00');
  readonly novaViaturaCmt = signal('');
  readonly novaViaturaMot = signal('');
  readonly novaViaturaPat = signal('');
  readonly novaViaturaPat2 = signal('');
  readonly criandoViatura = signal(false);

  readonly osModalCard = signal<CardGuarnicao | null>(null);
  readonly osTexto = signal('');
  readonly salvandoOs = signal(false);

  readonly modalRow = signal<RosterRow | null>(null);
  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'ATRASADO', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO', 'LICENCA'];
  readonly tipoLancamento = signal<TipoLancamento>('FALTA');
  readonly formSubstitutoMatricula = signal('');
  readonly formMotivo = signal('');
  readonly formSeiNumero = signal('');
  readonly formAutorizacao = signal('');
  readonly formDestino = signal('');
  readonly formHorarioChegada = signal('');
  readonly formLicencaInicio = signal('');
  readonly formLicencaFim = signal('');
  readonly registrando = signal(false);

  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
    void this.reloadBaixas();
    void this.reloadOs();
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
    // Grouped by guarnição *and* horário: a guarnição can have more than one
    // shift active on the same recorrência (e.g. a day shift and a night
    // shift both flagged ÍMPARES), and those are different postos — merging
    // them would show two "commanders" on one card.
    const grupos = new Map<string, CardGuarnicao>();
    const cardIdOrigem = new Map<RosterRow, string>();

    for (const row of this.rosterFiltrado) {
      const cardId = `${row.guarnicaoId}__${row.horarioInicio}`;
      cardIdOrigem.set(row, cardId);
      if (!grupos.has(cardId)) {
        grupos.set(cardId, {
          cardId,
          guarnicaoId: row.guarnicaoId,
          nome: this.guarnicaoNome(row.guarnicaoId),
          areaAtuacao: this.guarnicaoAreaAtuacao(row.guarnicaoId),
          horarioInicio: row.horarioInicio,
          horario: `${row.horarioInicio}–${row.horarioFim}`,
          rows: [],
        });
      }
    }

    // A REMANEJADO row is displayed on its destination card (matched by
    // guarnição nome, preferring the card sharing the same horário) instead
    // of its original card — otherwise it would look like the drag-and-drop
    // silently did nothing.
    for (const row of this.rosterFiltrado) {
      const cardOrigemId = cardIdOrigem.get(row)!;
      let cardAlvo = grupos.get(cardOrigemId)!;

      if (row.statusEfetivo === 'REMANEJADO' && row.detalhe) {
        const candidatos = Array.from(grupos.values()).filter((c) => c.nome === row.detalhe);
        const destino =
          candidatos.find((c) => c.horario === cardAlvo.horario) ?? candidatos[0];
        if (destino) {
          cardAlvo = destino;
        }
      }

      cardAlvo.rows.push(row);
    }

    return Array.from(grupos.values())
      .filter((c) => c.rows.length > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome) || a.horario.localeCompare(b.horario));
  }

  get dropListIds(): string[] {
    return this.cards.map((c) => c.cardId);
  }

  statusBadgeClasses(status: StatusEfetivo): string {
    return STATUS_BADGE_CLASSES[status];
  }

  statusLabel(status: StatusEfetivo): string {
    return STATUS_LABELS[status];
  }

  corBordaCard(card: CardGuarnicao): string {
    if (this.isBaixada(card)) {
      return 'border-l-slate-400 dark:border-l-slate-600';
    }
    const temProblema = card.rows.some((r) => r.statusEfetivo !== 'PREVISTO');
    return temProblema
      ? 'border-l-red-500 dark:border-l-red-400'
      : 'border-l-emerald-500 dark:border-l-emerald-400';
  }

  isBaixada(card: CardGuarnicao): boolean {
    return this.baixas().some(
      (b) => b.guarnicaoId === card.guarnicaoId && b.horarioInicio === card.horarioInicio,
    );
  }

  private baixaDoCard(card: CardGuarnicao): BaixaRow | undefined {
    return this.baixas().find(
      (b) => b.guarnicaoId === card.guarnicaoId && b.horarioInicio === card.horarioInicio,
    );
  }

  async toggleBaixa(card: CardGuarnicao): Promise<void> {
    try {
      const baixa = this.baixaDoCard(card);
      if (baixa) {
        await this.lancamentoService.removerBaixa(baixa.id);
      } else {
        await this.lancamentoService.registrarBaixa({
          data: this.data(),
          guarnicao_id: card.guarnicaoId,
          horario_inicio: card.horarioInicio,
        });
      }
      await this.reloadBaixas();
    } catch {
      this.errorMessage.set('Não foi possível atualizar o status da viatura.');
    }
  }

  resumoCard(card: CardGuarnicao): string {
    const total = card.rows.length;
    const desvios = card.rows.filter((r) => r.statusEfetivo !== 'PREVISTO');
    if (desvios.length === 0) {
      return `${total} presente${total === 1 ? '' : 's'}`;
    }
    const porStatus = new Map<StatusEfetivo, number>();
    for (const r of desvios) {
      porStatus.set(r.statusEfetivo, (porStatus.get(r.statusEfetivo) ?? 0) + 1);
    }
    const partes = Array.from(porStatus.entries()).map(
      ([status, count]) => `${count} ${this.statusLabel(status).toLowerCase()}`,
    );
    return `${total} no total · ${partes.join(', ')}`;
  }

  iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    const letras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
    return letras.join('') || '?';
  }

  async carregarListasBase(): Promise<void> {
    try {
      const [guarnicoes, policiais, companhias] = await Promise.all([
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
        this.companhiasService.listCompanhias(),
      ]);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
      this.companhias.set(companhias);
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

  async reloadBaixas(): Promise<void> {
    try {
      this.baixas.set(await this.lancamentoService.listBaixasDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar as viaturas baixadas.');
    }
  }

  async reloadOs(): Promise<void> {
    try {
      this.osRows.set(await this.lancamentoService.listOsDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar as ordens de serviço.');
    }
  }

  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await Promise.all([this.reloadRoster(), this.reloadBaixas(), this.reloadOs()]);
  }

  osDoCard(card: CardGuarnicao): OsRow | undefined {
    return this.osRows().find((o) => o.guarnicaoId === card.guarnicaoId && o.horarioInicio === card.horarioInicio);
  }

  abrirOs(card: CardGuarnicao): void {
    this.osModalCard.set(card);
    this.osTexto.set(this.osDoCard(card)?.numeroOs ?? '');
  }

  fecharOs(): void {
    this.osModalCard.set(null);
  }

  async onSalvarOs(): Promise<void> {
    const card = this.osModalCard();
    if (!card) {
      return;
    }
    this.salvandoOs.set(true);
    this.errorMessage.set(null);
    try {
      const existente = this.osDoCard(card);
      if (existente) {
        await this.lancamentoService.removerOs(existente.id);
      }
      const texto = this.osTexto().trim();
      if (texto) {
        await this.lancamentoService.registrarOs({
          data: this.data(),
          guarnicao_id: card.guarnicaoId,
          horario_inicio: card.horarioInicio,
          numero_os: texto,
        });
      }
      this.fecharOs();
      await this.reloadOs();
    } catch {
      this.errorMessage.set('Não foi possível salvar a OS.');
    } finally {
      this.salvandoOs.set(false);
    }
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

  policialGraduacao(matricula: string): string {
    return this.policiais().find((p) => p.matricula === matricula)?.graduacao ?? '';
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
    this.formLicencaInicio.set(this.data());
    this.formLicencaFim.set(this.data());
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
        case 'LICENCA':
          await this.lancamentoService.registrarLicenca({
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            data_inicio: this.formLicencaInicio() || data,
            data_fim: this.formLicencaFim() || data,
            sei_numero: this.formSeiNumero() || null,
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

  async toggleRemanejamento(row: RosterRow): Promise<void> {
    if (!row.detalheId) {
      return;
    }
    try {
      await this.lancamentoService.removerRemanejamento(row.detalheId);
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível desfazer o remanejamento.');
    }
  }

  async toggleLicenca(row: RosterRow): Promise<void> {
    if (!row.detalheId) {
      return;
    }
    try {
      await this.lancamentoService.removerLicenca(row.detalheId);
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível desfazer a LTS/DTS.');
    }
  }

  abrirNovaViatura(): void {
    this.novaViaturaAberta.set(true);
    this.novaViaturaNome.set('');
    this.novaViaturaTipo.set('GT_TATICO');
    this.novaViaturaCompanhiaId.set('');
    this.novaViaturaArea.set('');
    this.novaViaturaPrefixos.set('');
    this.novaViaturaHorarioInicio.set('06:00');
    this.novaViaturaHorarioFim.set('18:00');
    this.novaViaturaCmt.set('');
    this.novaViaturaMot.set('');
    this.novaViaturaPat.set('');
    this.novaViaturaPat2.set('');
  }

  fecharNovaViatura(): void {
    this.novaViaturaAberta.set(false);
  }

  async onCriarViatura(): Promise<void> {
    this.criandoViatura.set(true);
    this.errorMessage.set(null);
    try {
      const prefixos = this.novaViaturaPrefixos()
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const guarnicao = await this.guarnicoesService.createGuarnicao({
        nome: this.novaViaturaNome(),
        tipo: this.novaViaturaTipo(),
        companhia_id: this.novaViaturaCompanhiaId(),
        area_atuacao: this.novaViaturaArea() || null,
        prefixos: prefixos.length > 0 ? prefixos : null,
      });

      const data = this.data();
      const diaDoMes = Number(data.slice(8, 10));
      const atribuicoes: { funcao: 'CMT' | 'MOT' | 'PAT'; matricula: string }[] = [
        { funcao: 'CMT' as const, matricula: this.novaViaturaCmt() },
        { funcao: 'MOT' as const, matricula: this.novaViaturaMot() },
        { funcao: 'PAT' as const, matricula: this.novaViaturaPat() },
        { funcao: 'PAT' as const, matricula: this.novaViaturaPat2() },
      ].filter((a) => a.matricula);

      for (const atribuicao of atribuicoes) {
        await this.escalaMensalService.createEscalaMensal({
          guarnicao_id: guarnicao.id,
          policial_matricula: atribuicao.matricula,
          funcao: atribuicao.funcao,
          horario_inicio: this.novaViaturaHorarioInicio(),
          horario_fim: this.novaViaturaHorarioFim(),
          tipo_recorrencia: 'DIAS_ESPECIFICOS',
          dias_especificos: [diaDoMes],
          vigencia_inicio: data,
          vigencia_fim: data,
          escala_origem: 'Lançamento avulso via Painel do PC',
        });
      }

      this.fecharNovaViatura();
      this.guarnicoes.set(await this.guarnicoesService.listGuarnicoes());
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível criar a viatura.');
    } finally {
      this.criandoViatura.set(false);
    }
  }

  async onDrop(event: CdkDragDrop<RosterRow[], RosterRow[], RosterRow>): Promise<void> {
    if (event.previousContainer === event.container) {
      return;
    }
    const row = event.item.data;
    const cardDestino = this.cards.find((c) => c.cardId === event.container.id);
    if (!cardDestino) {
      return;
    }
    const destinoNome = cardDestino.nome;
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
