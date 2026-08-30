import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  BaixaRow,
  FuncaoFixaRow,
  GrupoFuncaoFixa,
  LancamentoService,
  OsRow,
  RosterRow,
  StatusEfetivo,
  turnoAtivoEm,
} from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow, TipoGuarnicao } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';
import { EscalaMensalService } from '../../../core/services/escala-mensal.service';
import { AuthService } from '../../../core/services/auth.service';
import { PjesService, PjesRosterRow } from '../../../core/services/pjes.service';

type TipoLancamento =
  | 'ATRASADO'
  | 'REMANEJAMENTO'
  | 'PERMUTA'
  | 'CURSO'
  | 'DISPENSA'
  | 'EXPEDIENTE'
  | 'FOLGA'
  | 'FALTA_LTS'
  | 'AUSENCIA_SERVICO';

interface CardPjes {
  chave: string;
  gtRotulo: string;
  horario: string;
  rows: PjesRosterRow[];
}

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
  CURSO: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  DISPENSA: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  EXPEDIENTE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  AUSENCIA: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
};

const STATUS_LABELS: Record<StatusEfetivo, string> = {
  PREVISTO: 'Presente',
  FALTA: 'Falta',
  ATRASADO: 'Atrasado',
  SUBSTITUIDO: 'Substituído',
  FOLGA: 'Folga',
  REMANEJADO: 'Remanejado',
  LICENCA: 'LTS/DTS',
  CURSO: 'Curso',
  DISPENSA: 'Dispensa',
  EXPEDIENTE: 'Expediente',
  AUSENCIA: 'Ausência',
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
  private readonly authService = inject(AuthService);
  private readonly pjesService = inject(PjesService);

  /** Só o PC de Lançamento edita este painel; todos os outros perfis só veem. */
  podeEditar(): boolean {
    return this.authService.currentPerfil?.role === 'PC_LANCAMENTO';
  }

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly pjesRoster = signal<PjesRosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly osRows = signal<OsRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly filtroHorario = signal('');
  readonly filtroMomento = signal('');
  readonly buscaPolicial = signal('');

  readonly novaViaturaAberta = signal(false);
  readonly tiposGuarnicao: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV', 'GG', 'CR'];
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
  readonly osSituacao = signal('');
  readonly osLocal = signal('');
  readonly salvandoOs = signal(false);

  readonly baixaModalCard = signal<CardGuarnicao | null>(null);
  readonly baixaMotivo = signal('');
  readonly baixaSeiNumero = signal('');
  readonly salvandoBaixa = signal(false);

  readonly modalRow = signal<RosterRow | null>(null);
  readonly tiposLancamento: TipoLancamento[] = [
    'PERMUTA', 'CURSO', 'DISPENSA', 'EXPEDIENTE', 'FOLGA', 'FALTA_LTS', 'AUSENCIA_SERVICO', 'ATRASADO', 'REMANEJAMENTO',
  ];
  readonly rotulosTipoLancamento: Record<TipoLancamento, string> = {
    PERMUTA: 'Permuta',
    CURSO: 'Curso',
    DISPENSA: 'Dispensa',
    EXPEDIENTE: 'Expediente',
    FOLGA: 'Folga',
    FALTA_LTS: 'Falta (LTS/DTS)',
    AUSENCIA_SERVICO: 'Ausência do serviço',
    ATRASADO: 'Atrasado',
    REMANEJAMENTO: 'Remanejamento',
  };
  readonly tipoLancamento = signal<TipoLancamento>('PERMUTA');
  readonly formSubstitutoMatricula = signal('');
  readonly formMotivo = signal('');
  readonly formSeiNumero = signal('');
  readonly formDestino = signal('');
  readonly formHorarioChegada = signal('');
  readonly formObservacao = signal('');
  readonly formProcessoSei = signal('');
  readonly registrando = signal(false);

  readonly funcoesFixas = signal<FuncaoFixaRow[]>([]);
  readonly gruposFuncaoFixa: GrupoFuncaoFixa[] = ['GUARDA', 'PC_BPM', 'COPOM'];
  readonly novaFuncaoFixaGrupo = signal<GrupoFuncaoFixa>('GUARDA');
  readonly novaFuncaoFixaFuncao = signal('');
  readonly novaFuncaoFixaHorarioInicio = signal('06:00');
  readonly novaFuncaoFixaHorarioFim = signal('06:00');
  readonly novaFuncaoFixaMatricula = signal('');
  readonly novaFuncaoFixaFoneCmt = signal('');
  readonly criandoFuncaoFixa = signal(false);

  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
    void this.reloadBaixas();
    void this.reloadOs();
    void this.reloadFuncoesFixas();
    void this.reloadPjes();
  }

  get horariosDisponiveis(): string[] {
    const horarios = new Set(this.roster().map((r) => r.horarioInicio));
    return Array.from(horarios).sort();
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

  limparFiltroHorario(): void {
    this.filtroHorario.set('');
    this.filtroMomento.set('');
  }

  get rosterFiltrado(): RosterRow[] {
    let rows = this.roster();
    const momento = this.filtroMomento();
    const horario = this.filtroHorario();
    if (momento) {
      rows = rows.filter((r) => turnoAtivoEm(r.horarioInicio, r.horarioFim, momento));
    } else if (horario) {
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
    if (!this.podeEditar()) return;
    const baixa = this.baixaDoCard(card);
    if (baixa) {
      try {
        await this.lancamentoService.removerBaixa(baixa.id);
        await this.reloadBaixas();
      } catch {
        this.errorMessage.set('Não foi possível reativar a viatura.');
      }
      return;
    }
    this.baixaModalCard.set(card);
    this.baixaMotivo.set('');
    this.baixaSeiNumero.set('');
  }

  fecharBaixa(): void {
    this.baixaModalCard.set(null);
  }

  async onSalvarBaixa(): Promise<void> {
    if (!this.podeEditar()) return;
    const card = this.baixaModalCard();
    if (!card) {
      return;
    }
    this.salvandoBaixa.set(true);
    this.errorMessage.set(null);
    try {
      await this.lancamentoService.registrarBaixa({
        data: this.data(),
        guarnicao_id: card.guarnicaoId,
        horario_inicio: card.horarioInicio,
        motivo: this.baixaMotivo() || null,
        sei_numero: this.baixaSeiNumero() || null,
      });
      this.fecharBaixa();
      await this.reloadBaixas();
    } catch {
      this.errorMessage.set('Não foi possível desativar a viatura.');
    } finally {
      this.salvandoBaixa.set(false);
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
    await Promise.all([
      this.reloadRoster(),
      this.reloadBaixas(),
      this.reloadOs(),
      this.reloadFuncoesFixas(),
      this.reloadPjes(),
    ]);
  }

  async reloadPjes(): Promise<void> {
    try {
      this.pjesRoster.set(await this.pjesService.listPjesRosterDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar a escala PJES.');
    }
  }

  get pjesRosterFiltrado(): PjesRosterRow[] {
    let rows = this.pjesRoster();
    const momento = this.filtroMomento();
    const horario = this.filtroHorario();
    if (momento) {
      rows = rows.filter((r) => turnoAtivoEm(r.horarioInicio, r.horarioFim, momento));
    } else if (horario) {
      rows = rows.filter((r) => r.horarioInicio.slice(0, 5) === horario);
    }
    const busca = this.buscaPolicial().trim().toLowerCase();
    if (busca) {
      rows = rows.filter(
        (r) => (r.matricula ?? '').toLowerCase().includes(busca) || r.nomeGuerra.toLowerCase().includes(busca),
      );
    }
    return rows;
  }

  get pjesCards(): CardPjes[] {
    const grupos = new Map<string, CardPjes>();
    for (const row of this.pjesRosterFiltrado) {
      const chave = `${row.gtRotulo}__${row.horarioInicio}`;
      if (!grupos.has(chave)) {
        grupos.set(chave, {
          chave,
          gtRotulo: row.gtRotulo,
          horario: `${row.horarioInicio.slice(0, 5)}–${row.horarioFim.slice(0, 5)}`,
          rows: [],
        });
      }
      grupos.get(chave)!.rows.push(row);
    }
    return Array.from(grupos.values()).sort((a, b) => a.gtRotulo.localeCompare(b.gtRotulo));
  }

  async togglePjesFalta(row: PjesRosterRow): Promise<void> {
    if (!this.podeEditar()) return;
    try {
      if (row.status === 'FALTA') {
        await this.pjesService.limparPresencaPjes(row.escalaPjesId);
      } else {
        await this.pjesService.registrarPresencaPjes(row.escalaPjesId, 'FALTA');
      }
      await this.reloadPjes();
    } catch {
      this.errorMessage.set('Não foi possível atualizar a falta.');
    }
  }

  async togglePjesAtraso(row: PjesRosterRow): Promise<void> {
    if (!this.podeEditar()) return;
    try {
      if (row.status === 'ATRASADO') {
        await this.pjesService.limparPresencaPjes(row.escalaPjesId);
      } else {
        await this.pjesService.registrarPresencaPjes(row.escalaPjesId, 'ATRASADO');
      }
      await this.reloadPjes();
    } catch {
      this.errorMessage.set('Não foi possível atualizar o atraso.');
    }
  }

  async reloadFuncoesFixas(): Promise<void> {
    try {
      this.funcoesFixas.set(await this.lancamentoService.listFuncoesFixasDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar as funções fixas do dia.');
    }
  }

  funcoesFixasDoGrupo(grupo: GrupoFuncaoFixa): FuncaoFixaRow[] {
    return this.funcoesFixas().filter((f) => f.grupo === grupo);
  }

  async onCriarFuncaoFixa(): Promise<void> {
    if (!this.podeEditar()) return;
    this.criandoFuncaoFixa.set(true);
    this.errorMessage.set(null);
    try {
      await this.lancamentoService.registrarFuncaoFixa({
        data: this.data(),
        grupo: this.novaFuncaoFixaGrupo(),
        funcao: this.novaFuncaoFixaFuncao(),
        horario_inicio: this.novaFuncaoFixaHorarioInicio(),
        horario_fim: this.novaFuncaoFixaHorarioFim(),
        policial_matricula: this.novaFuncaoFixaMatricula(),
        fone_cmt: this.novaFuncaoFixaFoneCmt() || null,
      });
      this.novaFuncaoFixaFuncao.set('');
      this.novaFuncaoFixaMatricula.set('');
      this.novaFuncaoFixaFoneCmt.set('');
      await this.reloadFuncoesFixas();
    } catch {
      this.errorMessage.set('Não foi possível registrar a função fixa.');
    } finally {
      this.criandoFuncaoFixa.set(false);
    }
  }

  async onRemoverFuncaoFixa(id: string): Promise<void> {
    if (!this.podeEditar()) return;
    try {
      await this.lancamentoService.removerFuncaoFixa(id);
      await this.reloadFuncoesFixas();
    } catch {
      this.errorMessage.set('Não foi possível remover a função fixa.');
    }
  }

  osDoCard(card: CardGuarnicao): OsRow | undefined {
    return this.osRows().find((o) => o.guarnicaoId === card.guarnicaoId && o.horarioInicio === card.horarioInicio);
  }

  abrirOs(card: CardGuarnicao): void {
    if (!this.podeEditar()) return;
    this.osModalCard.set(card);
    const existente = this.osDoCard(card);
    this.osTexto.set(existente?.numeroOs ?? '');
    this.osSituacao.set(existente?.situacao ?? '');
    this.osLocal.set(existente?.local ?? '');
  }

  fecharOs(): void {
    this.osModalCard.set(null);
  }

  async onSalvarOs(): Promise<void> {
    if (!this.podeEditar()) return;
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
          situacao: this.osSituacao() || null,
          local: this.osLocal() || null,
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
    if (!this.podeEditar()) return;
    this.modalRow.set(row);
    this.tipoLancamento.set(row.statusEfetivo === 'ATRASADO' ? 'ATRASADO' : 'PERMUTA');
    this.formMotivo.set(row.statusEfetivo === 'ATRASADO' ? (row.detalhe ?? '') : '');
    this.formSubstitutoMatricula.set('');
    this.formSeiNumero.set('');
    this.formProcessoSei.set('');
    this.formObservacao.set('');
    this.formDestino.set('');
    this.formHorarioChegada.set('');
  }

  fecharModal(): void {
    this.modalRow.set(null);
  }

  async onRegistrarModal(): Promise<void> {
    if (!this.podeEditar()) return;
    const linha = this.modalRow();
    if (!linha) {
      return;
    }
    this.registrando.set(true);
    this.errorMessage.set(null);
    const data = this.data();
    const tipo = this.tipoLancamento();
    try {
      if (tipo === 'ATRASADO') {
        await this.lancamentoService.registrarAtraso({
          data,
          policial_matricula: linha.policialMatricula,
          escala_mensal_id: linha.escalaMensalId,
          horario_chegada: this.formHorarioChegada() || null,
          motivo: this.formMotivo() || null,
          sei_numero: this.formSeiNumero() || null,
        });
      } else if (tipo === 'REMANEJAMENTO') {
        await this.lancamentoService.registrarRemanejamento({
          data,
          policial_matricula: linha.policialMatricula,
          escala_mensal_id: linha.escalaMensalId,
          destino: this.formDestino(),
        });
      } else {
        await this.lancamentoService.registrarAlteracao({
          data,
          tipo,
          policial_matricula: linha.policialMatricula,
          policial_substituto_matricula: tipo === 'PERMUTA' ? this.formSubstitutoMatricula() : null,
          guarnicao_id: linha.guarnicaoId,
          escala_mensal_id: linha.escalaMensalId,
          horario_inicio: linha.horarioInicio,
          horario_fim: linha.horarioFim,
          processo_sei: this.formProcessoSei() || null,
          observacao: this.formObservacao() || null,
        });
      }
      this.fecharModal();
      await this.reloadRoster();
    } catch {
      this.errorMessage.set(
        tipo === 'ATRASADO' || tipo === 'REMANEJAMENTO'
          ? 'Não foi possível registrar a alteração.'
          : 'Não foi possível registrar — talvez já exista uma alteração para este policial hoje.',
      );
    } finally {
      this.registrando.set(false);
    }
  }

  async toggleFalta(row: RosterRow): Promise<void> {
    if (!this.podeEditar()) return;
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
    if (!this.podeEditar()) return;
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
    if (!this.podeEditar()) return;
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
    if (!this.podeEditar()) return;
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

  async removerAlteracaoDoCard(row: RosterRow): Promise<void> {
    if (!this.podeEditar() || !row.detalheId || row.detalheOrigem !== 'ALTERACAO') return;
    const tiposAlteracao: StatusEfetivo[] = ['SUBSTITUIDO', 'CURSO', 'DISPENSA', 'EXPEDIENTE', 'FOLGA', 'AUSENCIA', 'LICENCA'];
    if (!tiposAlteracao.includes(row.statusEfetivo)) return;
    try {
      await this.lancamentoService.removerAlteracao(row.detalheId);
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível remover a alteração.');
    }
  }

  abrirNovaViatura(): void {
    if (!this.podeEditar()) return;
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
    if (!this.podeEditar()) return;
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
    if (!this.podeEditar()) return;
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
