import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BaixaRow,
  FuncaoFixaRow,
  GrupoFuncaoFixa,
  LancamentoService,
  OsRow,
  RosterRow,
} from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow, TipoGuarnicao } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CampoComplemento, RelatorioSeiService } from '../../../core/services/relatorio-sei.service';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface CardRelatorio {
  cardId: string;
  guarnicaoId: string;
  nome: string;
  areaAtuacao: string | null;
  horarioInicio: string;
  rows: RosterRow[];
}

interface Chamada {
  horarioInicio: string;
  cards: CardRelatorio[];
}

const TIPOS_ORDINARIO: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV', 'GG', 'CR'];

const COMPLEMENTOS: { campo: CampoComplemento; titulo: string }[] = [
  { campo: 'PJES_DIARIA', titulo: 'PJES / Diária' },
  { campo: 'FISCALIZACAO', titulo: 'Fiscalização' },
  { campo: 'POG', titulo: 'POG' },
  { campo: 'DIRESP', titulo: 'Viaturas DIRESP em apoio' },
  { campo: 'OBSERVACOES', titulo: 'Observações' },
];

@Component({
  selector: 'app-relatorio-sei-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorio-sei-page.html',
  styleUrl: './relatorio-sei-page.css',
})
export class RelatorioSeiPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);
  private readonly relatorioSeiService = inject(RelatorioSeiService);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly osRows = signal<OsRow[]>([]);
  readonly funcoesFixas = signal<FuncaoFixaRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly complementos = signal<Record<CampoComplemento, string>>({
    PJES_DIARIA: '',
    FISCALIZACAO: '',
    POG: '',
    DIRESP: '',
    OBSERVACOES: '',
  });
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly copiado = signal(false);

  readonly gruposFuncaoFixa: GrupoFuncaoFixa[] = ['GUARDA', 'PC_BPM', 'COPOM'];
  readonly camposComplemento = COMPLEMENTOS;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      const [roster, baixas, osRows, funcoesFixas, guarnicoes, policiais, complementoRows] = await Promise.all([
        this.lancamentoService.listRosterDoDia(data),
        this.lancamentoService.listBaixasDoDia(data),
        this.lancamentoService.listOsDoDia(data),
        this.lancamentoService.listFuncoesFixasDoDia(data),
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
        this.relatorioSeiService.listComplementos(data),
      ]);
      this.roster.set(roster);
      this.baixas.set(baixas);
      this.osRows.set(osRows);
      this.funcoesFixas.set(funcoesFixas);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
      const complementos = { PJES_DIARIA: '', FISCALIZACAO: '', POG: '', DIRESP: '', OBSERVACOES: '' };
      for (const row of complementoRows) {
        complementos[row.campo] = row.conteudo;
      }
      this.complementos.set(complementos);
    } catch {
      this.errorMessage.set('Não foi possível carregar os dados do relatório.');
    } finally {
      this.loading.set(false);
    }
  }

  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await this.reload();
  }

  guarnicao(id: string): GuarnicaoRow | undefined {
    return this.guarnicoes().find((g) => g.id === id);
  }

  policialNome(matricula: string): string {
    const p = this.policiais().find((x) => x.matricula === matricula);
    return p ? `${p.graduacao} ${p.nome_guerra}` : matricula;
  }

  get cardsOrdinarios(): CardRelatorio[] {
    const idsBaixados = new Set(this.baixas().map((b) => `${b.guarnicaoId}__${b.horarioInicio}`));
    const grupos = new Map<string, CardRelatorio>();
    for (const row of this.roster()) {
      const guarnicao = this.guarnicao(row.guarnicaoId);
      if (!guarnicao || !TIPOS_ORDINARIO.includes(guarnicao.tipo)) {
        continue;
      }
      const cardId = `${row.guarnicaoId}__${row.horarioInicio}`;
      if (idsBaixados.has(cardId)) {
        continue;
      }
      if (!grupos.has(cardId)) {
        grupos.set(cardId, {
          cardId,
          guarnicaoId: row.guarnicaoId,
          nome: guarnicao.nome,
          areaAtuacao: guarnicao.area_atuacao,
          horarioInicio: row.horarioInicio,
          rows: [],
        });
      }
      grupos.get(cardId)!.rows.push(row);
    }
    return Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  get chamadas(): Chamada[] {
    const porHorario = new Map<string, CardRelatorio[]>();
    for (const card of this.cardsOrdinarios) {
      if (!porHorario.has(card.horarioInicio)) {
        porHorario.set(card.horarioInicio, []);
      }
      porHorario.get(card.horarioInicio)!.push(card);
    }
    return Array.from(porHorario.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([horarioInicio, cards]) => ({ horarioInicio, cards }));
  }

  chamadaOrdinal(index: number): string {
    return ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª'][index] ?? `${index + 1}ª`;
  }

  get resumoPorTipo(): { tipo: TipoGuarnicao; total: number }[] {
    return TIPOS_ORDINARIO.map((tipo) => ({
      tipo,
      total: this.cardsOrdinarios.filter((c) => this.guarnicao(c.guarnicaoId)?.tipo === tipo).length,
    }));
  }

  get faltas(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'FALTA');
  }

  get atrasados(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'ATRASADO');
  }

  get substituidos(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'SUBSTITUIDO');
  }

  get folgas(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'FOLGA');
  }

  get licencas(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'LICENCA');
  }

  get remanejados(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'REMANEJADO');
  }

  get viaturasBaixadas(): BaixaRow[] {
    return this.baixas();
  }

  get osCumpridas(): OsRow[] {
    return this.osRows().filter((o) => o.numeroOs);
  }

  funcoesDoGrupo(grupo: GrupoFuncaoFixa): FuncaoFixaRow[] {
    return this.funcoesFixas().filter((f) => f.grupo === grupo);
  }

  async onSalvarComplemento(campo: CampoComplemento): Promise<void> {
    try {
      await this.relatorioSeiService.salvarComplemento(this.data(), campo, this.complementos()[campo]);
    } catch {
      this.errorMessage.set('Não foi possível salvar o texto complementar.');
    }
  }

  updateComplemento(campo: CampoComplemento, valor: string): void {
    this.complementos.update((atual) => ({ ...atual, [campo]: valor }));
  }

  private linhaTexto(...partes: (string | null)[]): string {
    return partes.filter((p) => p !== null && p !== '').join(' — ');
  }

  gerarTexto(): string {
    const linhas: string[] = [];
    linhas.push('RELATÓRIO DE LANÇAMENTO');
    linhas.push(`Data: ${this.data()}`);
    linhas.push('');
    linhas.push('ORDINÁRIO — RESUMO');
    for (const { tipo, total } of this.resumoPorTipo) {
      linhas.push(`${tipo}: ${total}`);
    }
    linhas.push('');

    this.chamadas.forEach((chamada, index) => {
      linhas.push(`${this.chamadaOrdinal(index)} CHAMADA — ${chamada.horarioInicio.slice(0, 5)}`);
      for (const card of chamada.cards) {
        linhas.push(`  ${card.nome}${card.areaAtuacao ? ` (${card.areaAtuacao})` : ''}`);
        for (const row of card.rows) {
          linhas.push(
            `    ${row.funcao} — ${row.policialMatricula} — ${this.policialNome(row.policialMatricula)}`,
          );
        }
      }
      linhas.push('');
    });

    linhas.push('FALTAS');
    for (const r of this.faltas) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('PERMUTAS/SUBSTITUIÇÃO');
    for (const r of this.substituidos) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('FOLGAS');
    for (const r of this.folgas) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('LTS/DTS');
    for (const r of this.licencas) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('REMANEJAMENTO DE EFETIVO');
    for (const r of this.remanejados) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — destino: ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('VIATURAS BAIXADAS');
    for (const b of this.viaturasBaixadas) {
      const nome = this.guarnicao(b.guarnicaoId)?.nome ?? b.guarnicaoId;
      linhas.push(`  ${this.linhaTexto(nome, b.motivo, b.seiNumero ? `SEI ${b.seiNumero}` : null)}`);
    }
    linhas.push('');

    linhas.push('"OS" CUMPRIDAS');
    for (const o of this.osCumpridas) {
      const nome = this.guarnicao(o.guarnicaoId)?.nome ?? o.guarnicaoId;
      linhas.push(`  ${this.linhaTexto(o.numeroOs, o.situacao, o.local, nome)}`);
    }
    linhas.push('');

    for (const grupo of this.gruposFuncaoFixa) {
      linhas.push(grupo);
      for (const f of this.funcoesDoGrupo(grupo)) {
        linhas.push(`  ${f.funcao} — ${this.policialNome(f.policialMatricula)} (${f.horarioInicio.slice(0, 5)}–${f.horarioFim.slice(0, 5)})`);
      }
      linhas.push('');
    }

    for (const { campo, titulo } of this.camposComplemento) {
      linhas.push(titulo.toUpperCase());
      linhas.push(this.complementos()[campo] || '(sem informação)');
      linhas.push('');
    }

    return linhas.join('\n');
  }

  async copiarTexto(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.gerarTexto());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.errorMessage.set('Não foi possível copiar o texto — copie manualmente.');
    }
  }
}
