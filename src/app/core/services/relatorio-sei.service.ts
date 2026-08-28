import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { GuarnicaoRow, TipoGuarnicao } from './guarnicoes.service';
import { PolicialRow } from './policiais.service';
import { BaixaRow, FuncaoFixaRow, GrupoFuncaoFixa, OsRow, RosterRow } from './lancamento.service';

export type CampoComplemento = 'PJES_DIARIA' | 'FISCALIZACAO' | 'POG' | 'DIRESP' | 'OBSERVACOES';

export interface ComplementoRow {
  campo: CampoComplemento;
  conteudo: string;
}

export type TurnoRelatorio = 'DIURNO' | 'NOTURNO';

export interface RelatorioSeiInput {
  data: string;
  turno: TurnoRelatorio;
  guarnicoes: GuarnicaoRow[];
  policiais: PolicialRow[];
  roster: RosterRow[];
  baixas: BaixaRow[];
  osRows: OsRow[];
  funcoesFixas: FuncaoFixaRow[];
  complementos: Record<CampoComplemento, string>;
}

@Injectable({ providedIn: 'root' })
export class RelatorioSeiService {
  private readonly supabase = inject(SupabaseService);

  async listComplementos(data: string): Promise<ComplementoRow[]> {
    const { data: rows, error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .select('campo, conteudo')
      .eq('data', data);
    if (error) throw error;
    return (rows ?? []) as ComplementoRow[];
  }

  async salvarComplemento(data: string, campo: CampoComplemento, conteudo: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .upsert({ data, campo, conteudo }, { onConflict: 'data,campo' });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Geração do relatório em HTML (tabelas com estilo inline, colável no editor
// CKEditor do SEI, que descarta classes mas preserva tabelas e estilos inline).
// ---------------------------------------------------------------------------

const ROTULO_TIPO: Record<TipoGuarnicao, string> = {
  GT_TATICO: 'GTS',
  GT_ORDINARIO: "GS'S",
  MO: "MO'S",
  CP: 'CP',
  GV: 'GV',
  GG: 'GG',
  CR: 'CR',
};

const GRUPOS_FIXOS: { grupo: GrupoFuncaoFixa; titulo: string }[] = [
  { grupo: 'GUARDA', titulo: 'GUARDA' },
  { grupo: 'PC_BPM', titulo: 'PC 16º BPM' },
  { grupo: 'COPOM', titulo: 'GRADUADO MONITORAMENTO COPOM' },
];

const CAMPOS_TEXTO: { campo: CampoComplemento; titulo: string }[] = [
  { campo: 'PJES_DIARIA', titulo: 'PJES / DIÁRIA' },
  { campo: 'FISCALIZACAO', titulo: 'FISCALIZAÇÃO' },
  { campo: 'POG', titulo: 'POG' },
  { campo: 'DIRESP', titulo: 'VIATURAS DIRESP ATIVADAS NA ÁREA EM APOIO A OPERAÇÕES DO 16º BPM' },
  { campo: 'OBSERVACOES', titulo: 'OBSERVAÇÕES' },
];

const S_TABELA = 'border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:6pt 0;';
const S_CEL = 'border:1px solid #000;padding:3pt 5pt;vertical-align:top;';
const S_CEL_C = S_CEL + 'text-align:center;';
const S_TH = S_CEL + 'background-color:#e6e6e6;font-weight:bold;text-align:center;';
const S_TH_LARANJA = S_CEL + 'background-color:#f4b183;font-weight:bold;text-align:center;color:#000;';
const S_SECAO = S_CEL + 'background-color:#d9d9d9;font-weight:bold;text-transform:uppercase;text-align:center;';
const S_SECAO_DESTAQUE = S_CEL + 'background-color:#ffff00;color:#c00000;font-weight:bold;text-transform:uppercase;text-align:center;';
const S_TITULO = 'font-family:Calibri,Arial,sans-serif;font-size:12pt;font-weight:bold;text-transform:uppercase;text-align:center;margin:12pt 0 4pt;';
const S_PARAGRAFO = 'font-family:Calibri,Arial,sans-serif;font-size:12pt;text-align:justify;margin:4pt 0;';
const S_VAZIO = 'font-family:Calibri,Arial,sans-serif;font-size:12pt;margin:0;';

const TURNO_TEXTO: Record<TurnoRelatorio, string> = {
  DIURNO: 'das 06:00h às 18:00h',
  NOTURNO: 'das 18:00h às 06:00h',
};

/** Hora (0–23) do início do card. */
function horaInicio(hhmmss: string): number {
  return Number(hhmmss.slice(0, 2));
}

/** DIURNO cobre início em [05h, 17h); NOTURNO o resto. */
function turnoDoCard(hhmmss: string): TurnoRelatorio {
  const h = horaInicio(hhmmss);
  return h >= 5 && h < 17 ? 'DIURNO' : 'NOTURNO';
}

/**
 * Índice da chamada (0–3) a partir da hora de início, ou null para
 * "lançamentos complementares". DIURNO: 05h→1ª 06h→2ª 07h→3ª 08h→4ª.
 * NOTURNO: 17h→1ª 18h→2ª 19h→3ª 20h→4ª.
 */
function indiceChamada(hhmmss: string, turno: TurnoRelatorio): number | null {
  const base = turno === 'DIURNO' ? 5 : 17;
  const i = horaInicio(hhmmss) - base;
  return i >= 0 && i <= 3 ? i : null;
}

function esc(valor: string | null | undefined): string {
  return (valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hhmm(hora: string | null | undefined): string {
  return (hora ?? '').slice(0, 5);
}

function turno(inicio: string, fim: string): string {
  return `${hhmm(inicio)}–${hhmm(fim)}`;
}

interface CardRelatorio {
  guarnicao: GuarnicaoRow;
  horarioInicio: string;
  horarioFim: string;
  rows: RosterRow[];
}

/** Serializa todos os dados do dia no HTML do relatório de lançamento. */
export function montarRelatorioHtml(input: RelatorioSeiInput): string {
  const guarnicaoPorId = new Map(input.guarnicoes.map((g) => [g.id, g]));
  const policialPorMatricula = new Map(input.policiais.map((p) => [p.matricula, p]));

  const nomeCompleto = (matricula: string): string => {
    const p = policialPorMatricula.get(matricula);
    return p ? `${p.graduacao} ${p.nome_guerra}` : matricula;
  };
  const guarnicaoNome = (id: string): string => guarnicaoPorId.get(id)?.nome ?? id;

  // --- Cards ordinários (viaturas motorizadas, exceto baixadas) --------------
  const baixados = new Set(input.baixas.map((b) => `${b.guarnicaoId}__${b.horarioInicio}`));
  const cardsPorId = new Map<string, CardRelatorio>();
  for (const row of input.roster) {
    const guarnicao = guarnicaoPorId.get(row.guarnicaoId);
    if (!guarnicao || !(guarnicao.tipo in ROTULO_TIPO)) continue;
    const cardId = `${row.guarnicaoId}__${row.horarioInicio}`;
    if (baixados.has(cardId)) continue;
    if (!cardsPorId.has(cardId)) {
      cardsPorId.set(cardId, {
        guarnicao,
        horarioInicio: row.horarioInicio,
        horarioFim: row.horarioFim,
        rows: [],
      });
    }
    cardsPorId.get(cardId)!.rows.push(row);
  }
  const cards = Array.from(cardsPorId.values()).sort((a, b) =>
    a.guarnicao.nome.localeCompare(b.guarnicao.nome),
  );

  // --- Contagem por tipo (rótulos do modelo) --------------------------------
  const resumo = (Object.keys(ROTULO_TIPO) as TipoGuarnicao[]).map((tipo) => ({
    rotulo: ROTULO_TIPO[tipo],
    total: cards.filter((c) => c.guarnicao.tipo === tipo).length,
  }));

  // --- Alterações a partir do roster ---------------------------------------
  const porStatus = (status: RosterRow['statusEfetivo']) =>
    input.roster.filter((r) => r.statusEfetivo === status);
  const faltas = porStatus('FALTA');
  const substituidos = porStatus('SUBSTITUIDO');
  const folgas = porStatus('FOLGA');
  const licencas = porStatus('LICENCA');
  const remanejados = porStatus('REMANEJADO');
  const osCumpridas = input.osRows.filter((o) => o.numeroOs);

  const osDaGuarnicao = (guarnicaoId: string, horarioInicio: string): string => {
    const os = input.osRows.find(
      (o) => o.guarnicaoId === guarnicaoId && o.horarioInicio === horarioInicio && o.numeroOs,
    );
    return os?.numeroOs ?? '';
  };
  const foneCmtDoCard = (card: CardRelatorio): string => {
    const cmt = card.rows.find((r) => r.funcao === 'CMT') ?? card.rows[0];
    return cmt ? policialPorMatricula.get(cmt.policialMatricula)?.telefone ?? '' : '';
  };

  const out: string[] = [];

  const linhaVazia = `<p style="${S_VAZIO}">&nbsp;</p>`;

  // Carta de encaminhamento -------------------------------------------------
  out.push(`<p style="${S_PARAGRAFO}">À Sr.ª SUBCOMANDANTE DO 16º BPM</p>`);
  out.push(linhaVazia);
  out.push(
    `<p style="${S_PARAGRAFO}"><b>Assunto:</b> Remessa de relatório de lançamento de viatura e efetivo.</p>`,
  );
  out.push(linhaVazia, linhaVazia, linhaVazia);
  out.push(
    `<p style="${S_PARAGRAFO}">Cumprimentando inicialmente V. S.ª, faço remessa do relatório de ` +
      `lançamento de serviço do dia ${esc(input.data)}, ${TURNO_TEXTO[input.turno]}, ` +
      `para conhecimento e providências que julgue necessárias.</p>`,
  );
  out.push(linhaVazia);
  out.push(
    `<p style="${S_PARAGRAFO}">Sem mais, aproveitamos o ensejo para renovar nossas elevadas estima e consideração.</p>`,
  );
  out.push(linhaVazia);

  out.push(`<p style="${S_TITULO}">RELATÓRIO DE LANÇAMENTO</p>`);

  // ORDINÁRIO -------------------------------------------------------------
  out.push(`<p style="${S_TITULO}">ORDINÁRIO</p>`);
  const servico: [string, number | string][] = [
    ['FALTAS', faltas.length],
    ['LTS / DTS', licencas.length],
    ['PERMUTAS', substituidos.length],
    ['FOLGAS', folgas.length],
    ['REMANEJAMENTO/SUBSTITUIÇÃO', remanejados.length + substituidos.length],
    ["VT'S/MO'S DESATIVADAS", input.baixas.length],
    ['VIATURA FORA DA ÁREA EM MISSÃO', ''],
    ['QUANTIDADE DE "OS" CUMPRIDA', osCumpridas.length],
  ];
  const linhasResumo = Math.max(resumo.length, servico.length);
  const corpoResumo: string[] = [];
  for (let i = 0; i < linhasResumo; i++) {
    const r = resumo[i];
    const s = servico[i];
    corpoResumo.push(
      `<tr>` +
        `<td style="${S_CEL_C}">${r ? esc(r.rotulo) : ''}</td>` +
        `<td style="${S_CEL_C}">${r ? r.total : ''}</td>` +
        `<td style="${S_CEL_C}">${s ? esc(s[0]) : ''}</td>` +
        `<td style="${S_CEL_C}">${s ? esc(String(s[1])) : ''}</td>` +
        `</tr>`,
    );
  }
  out.push(
    `<table style="${S_TABELA}"><thead><tr>` +
      `<th style="${S_TH}" colspan="2">TOTAL DE LANÇAMENTOS</th>` +
      `<th style="${S_TH}" colspan="2">SERVIÇO EM GERAL</th>` +
      `</tr></thead><tbody>${corpoResumo.join('')}</tbody></table>`,
  );

  // PJES / DIÁRIA (tabela pré-montada, preenchida manualmente no SEI) -----
  out.push(`<p style="${S_TITULO}">PJES / DIÁRIA</p>`);
  out.push(tabelaDuasColunas(PJES_TOTAL, PJES_SERVICO));

  // "OS" CUMPRIDAS -----------------------------------------------------
  out.push(`<p style="${S_TITULO}">"OS" CUMPRIDAS</p>`);
  out.push(
    tabela(
      ['Nº DA OS', 'SITUAÇÃO', 'LOCAL', 'VIATURA QUE CUMPRIU'],
      osCumpridas.length
        ? osCumpridas.map((o) => [
            esc(o.numeroOs),
            esc(o.situacao),
            esc(o.local),
            esc(guarnicaoNome(o.guarnicaoId)),
          ])
        : [['-', '-', '-', '-']],
    ),
  );

  // CHAMADAS (só o turno escolhido; 4 chamadas + complementares) ---------
  const cardsDoTurno = cards.filter((c) => turnoDoCard(c.horarioInicio) === input.turno);
  const gruposChamada: CardRelatorio[][] = [[], [], [], []]; // 1ª a 4ª
  const complementares: CardRelatorio[] = [];
  for (const card of cardsDoTurno) {
    const idx = indiceChamada(card.horarioInicio, input.turno);
    if (idx === null) complementares.push(card);
    else gruposChamada[idx].push(card);
  }
  // Cores por chamada: 1ª/3ª/4ª = vermelho+amarelo; 2ª = padrão (preto).
  const estiloSecao = (index: number): string => (index === 1 ? S_SECAO : S_SECAO_DESTAQUE);

  const tabelaCard = (card: CardRelatorio, estiloTitulo: string): string => {
    const fone = esc(foneCmtDoCard(card));
    const prefixos = esc((card.guarnicao.prefixos ?? []).join(' / '));
    const area = esc(card.guarnicao.area_atuacao);
    const os = esc(osDaGuarnicao(card.guarnicao.id, card.horarioInicio));
    const corpo = card.rows
      .map(
        (r) =>
          `<tr>` +
          `<td style="${S_CEL}"></td>` +
          `<td style="${S_CEL}">${prefixos}</td>` +
          `<td style="${S_CEL}">${turno(card.horarioInicio, card.horarioFim)}</td>` +
          `<td style="${S_CEL}">${area}</td>` +
          `<td style="${S_CEL}">${os}</td>` +
          `<td style="${S_CEL}">${esc(r.policialMatricula)}</td>` +
          `<td style="${S_CEL}">${esc(nomeCompleto(r.policialMatricula))}</td>` +
          `<td style="${S_CEL}">${fone}</td>` +
          `</tr>`,
      )
      .join('');
    return (
      `<table style="${S_TABELA}"><tbody>` +
      `<tr><td style="${estiloTitulo}" colspan="8">${esc(card.guarnicao.nome)}</td></tr>` +
      `<tr>` +
      ['PATRIMÔNIO', 'PREFIXO', 'HORÁRIO', 'ÁREA DE ATUAÇÃO', 'ORDEM DE SERVIÇO', 'MATRÍCULA', 'NOME', 'FONE DO CMT']
        .map((h) => `<td style="${S_TH}">${h}</td>`)
        .join('') +
      `</tr>${corpo}</tbody></table>`
    );
  };

  gruposChamada.forEach((cardsDaChamada, index) => {
    if (!cardsDaChamada.length) return;
    const hora = String(index + (input.turno === 'DIURNO' ? 5 : 17)).padStart(2, '0');
    out.push(`<p style="${S_TITULO}">${['1ª', '2ª', '3ª', '4ª'][index]} CHAMADA — ${hora}:00</p>`);
    for (const card of cardsDaChamada) out.push(tabelaCard(card, estiloSecao(index)));
  });

  if (complementares.length) {
    out.push(`<p style="${S_TITULO}">LANÇAMENTOS COMPLEMENTARES</p>`);
    for (const card of complementares) out.push(tabelaCard(card, S_SECAO));
  }

  // FISCALIZAÇÃO (tabela pré-montada) / POG (texto livre) -------------
  out.push(tabelaFiscalizacao());
  out.push(secaoTexto('POG', input.complementos.POG));

  // GUARDA / PC 16º BPM / COPOM --------------------------------------
  for (const { grupo, titulo } of GRUPOS_FIXOS) {
    const funcoes = input.funcoesFixas.filter((f) => f.grupo === grupo);
    out.push(`<p style="${S_TITULO}">${titulo}</p>`);
    out.push(
      tabela(
        ['FUNÇÃO', 'HORÁRIO', 'MAT', 'EFETIVO', 'FONE DO CMT'],
        funcoes.length
          ? funcoes.map((f) => [
              esc(f.funcao),
              turno(f.horarioInicio, f.horarioFim),
              esc(f.policialMatricula),
              esc(nomeCompleto(f.policialMatricula)),
              esc(f.foneCmt),
            ])
          : [['-', '-', '-', '-', '-']],
      ),
    );
  }

  // ALTERAÇÕES DE SERVIÇO ORDINÁRIO --------------------------------
  out.push(`<p style="${S_TITULO}">ALTERAÇÕES DE SERVIÇO ORDINÁRIO</p>`);

  out.push(`<p style="${S_TITULO}">FALTAS</p>`);
  out.push(
    tabela(
      ['QTD', 'MATRÍCULA', 'NOME', 'HORÁRIO', 'ESCALA', 'MOTIVO'],
      faltas.length
        ? faltas.map((r, i) => [
            String(i + 1),
            esc(r.policialMatricula),
            esc(nomeCompleto(r.policialMatricula)),
            turno(r.horarioInicio, r.horarioFim),
            esc(guarnicaoNome(r.guarnicaoId)),
            esc(r.detalhe),
          ])
        : [['-', '-', '-', '-', '-', '-']],
    ),
  );

  out.push(`<p style="${S_TITULO}">LTS / DTS</p>`);
  out.push(
    tabela(
      ['QTD', 'MATRÍCULA', 'NOME', 'PERÍODO', 'ESCALA', 'SEI Nº'],
      licencas.length
        ? licencas.map((r, i) => [
            String(i + 1),
            esc(r.policialMatricula),
            esc(nomeCompleto(r.policialMatricula)),
            esc(r.detalhe),
            esc(guarnicaoNome(r.guarnicaoId)),
            '',
          ])
        : [['-', '-', '-', '-', '-', '-']],
    ),
  );

  out.push(`<p style="${S_TITULO}">PERMUTAS / SUBSTITUIÇÃO DE SERVIÇO</p>`);
  out.push(
    tabela(
      ['QTD', 'MATRÍCULA', 'NOME', 'HORÁRIO', 'ESCALA', 'DETALHE', 'SEI Nº'],
      substituidos.length
        ? substituidos.map((r, i) => [
            String(i + 1),
            esc(r.policialMatricula),
            esc(nomeCompleto(r.policialMatricula)),
            turno(r.horarioInicio, r.horarioFim),
            esc(guarnicaoNome(r.guarnicaoId)),
            esc(r.detalhe),
            '',
          ])
        : [['-', '-', '-', '-', '-', '-', '-']],
    ),
  );

  out.push(`<p style="${S_TITULO}">FOLGAS</p>`);
  out.push(
    tabela(
      ['QTD', 'MATRÍCULA', 'NOME', 'HORÁRIO', 'ESCALA', 'AUTORIZAÇÃO'],
      folgas.length
        ? folgas.map((r, i) => [
            String(i + 1),
            esc(r.policialMatricula),
            esc(nomeCompleto(r.policialMatricula)),
            turno(r.horarioInicio, r.horarioFim),
            esc(guarnicaoNome(r.guarnicaoId)),
            esc(r.detalhe),
          ])
        : [['-', '-', '-', '-', '-', '-']],
    ),
  );

  out.push(`<p style="${S_TITULO}">REMANEJAMENTO DE EFETIVO</p>`);
  out.push(
    tabela(
      ['QTD', 'MATRÍCULA', 'NOME', 'ESCALA', 'HORÁRIO', 'DESTINO'],
      remanejados.length
        ? remanejados.map((r, i) => [
            String(i + 1),
            esc(r.policialMatricula),
            esc(nomeCompleto(r.policialMatricula)),
            esc(guarnicaoNome(r.guarnicaoId)),
            turno(r.horarioInicio, r.horarioFim),
            esc(r.detalhe),
          ])
        : [['-', '-', '-', '-', '-', '-']],
    ),
  );

  out.push(`<p style="${S_TITULO}">VIATURAS BAIXADAS / SETORES DESATIVADOS</p>`);
  out.push(
    tabela(
      ['QTD', 'VIATURA', 'MOTIVO', 'SEI Nº'],
      input.baixas.length
        ? input.baixas.map((b, i) => [
            String(i + 1),
            esc(guarnicaoNome(b.guarnicaoId)),
            esc(b.motivo),
            esc(b.seiNumero),
          ])
        : [['-', '-', '-', '-']],
    ),
  );

  // ALTERAÇÕES PJES/DIÁRIA, DIRESP, OBSERVAÇÕES (texto livre) ------
  out.push(secaoTexto('ALTERAÇÕES DE SERVIÇO PJES E DIÁRIA', input.complementos.PJES_DIARIA));
  out.push(secaoTexto(CAMPOS_TEXTO[3].titulo, input.complementos.DIRESP));
  out.push(secaoTexto('OBSERVAÇÕES', input.complementos.OBSERVACOES));

  // Assinatura ---------------------------------------------------
  out.push(`<p style="${S_PARAGRAFO}text-align:left;">Respeitosamente,</p>`);
  out.push(
    `<p style="${S_PARAGRAFO}text-align:center;font-weight:bold;">GRADUADO DE OPERAÇÕES / 16º BPM<br>(06h00 às 06h00)</p>`,
  );

  return out.join('\n');
}

function tabela(cabecalhos: string[], linhas: string[][]): string {
  const thead = `<tr>${cabecalhos.map((h) => `<th style="${S_TH}">${h}</th>`).join('')}</tr>`;
  const tbody = linhas
    .map((l) => `<tr>${l.map((c) => `<td style="${S_CEL}">${c}</td>`).join('')}</tr>`)
    .join('');
  return `<table style="${S_TABELA}"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function secaoTexto(titulo: string, conteudo: string): string {
  const texto = conteudo && conteudo.trim() ? esc(conteudo.trim()).replace(/\n/g, '<br>') : '-';
  return `<p style="${S_TITULO}">${esc(titulo)}</p><p style="${S_PARAGRAFO}">${texto}</p>`;
}

// --- Tabelas pré-montadas do modelo (preenchidas à mão no SEI) -------------

const PJES_TOTAL = [
  "GS'S EXTRA",
  "GP'S",
  'GTS EXTRA',
  'GV EXTRA',
  'VC',
  "MO'S EXTRA",
  'CP EXTRA',
  'GG EXTRA',
  'POG TI',
  'POG (COLOCAR OPERAÇÃO, PE SEGURO, CERNE, PAPAI NOEL, TEC...)',
];

const PJES_SERVICO = [
  'FALTAS',
  'LTS / DTS',
  'PERMUTAS',
  'FOLGAS',
  'REMANEJAMENTO/SUBSTITUIÇÃO',
  "VT'S/MO'S DESATIVADAS",
  'POG T.I DESATIVADOS',
  'POG (OUTRAS OPERAÇÕES) DESATIVADOS',
  'VIATURA FORA DA ÁREA EM MISSÃO',
  'QUANTIDADE DE "OS" CUMPRIDA',
];

/** Tabela 2 colunas (TOTAL DE LANÇAMENTOS | SERVIÇO EM GERAL) com valores em branco. */
function tabelaDuasColunas(esquerda: string[], direita: string[]): string {
  const n = Math.max(esquerda.length, direita.length);
  const linhas: string[] = [];
  for (let i = 0; i < n; i++) {
    linhas.push(
      `<tr>` +
        `<td style="${S_CEL_C}">${esquerda[i] ? esc(esquerda[i]) : ''}</td>` +
        `<td style="${S_CEL_C}"></td>` +
        `<td style="${S_CEL_C}">${direita[i] ? esc(direita[i]) : ''}</td>` +
        `<td style="${S_CEL_C}"></td>` +
        `</tr>`,
    );
  }
  return (
    `<table style="${S_TABELA}"><thead><tr>` +
    `<th style="${S_TH}" colspan="2">TOTAL DE LANÇAMENTOS</th>` +
    `<th style="${S_TH}" colspan="2">SERVIÇO EM GERAL</th>` +
    `</tr></thead><tbody>${linhas.join('')}</tbody></table>`
  );
}

function tabelaFiscalizacao(): string {
  const cab = ['PATRIMÔNIO', 'PREFIXO', 'HORÁRIO', 'ORDEM DE SERVIÇO', 'MATRÍCULA', 'EFETIVO', 'FONE']
    .map((h) => `<td style="${S_TH}">${h}</td>`)
    .join('');
  const linha = (prefixo: string, horario: string): string =>
    `<tr>` +
    `<td style="${S_CEL}"></td>` +
    `<td style="${S_CEL}">${prefixo}</td>` +
    `<td style="${S_CEL}">${horario}</td>` +
    `<td style="${S_CEL}">FISCAL DE XXXXX</td>` +
    `<td style="${S_CEL}"></td>` +
    `<td style="${S_CEL}"></td>` +
    `<td style="${S_CEL}"></td>` +
    `</tr>`;
  return (
    `<table style="${S_TABELA}"><tbody>` +
    `<tr><td style="${S_TH_LARANJA}" colspan="7">FISCALIZAÇÃO</td></tr>` +
    `<tr>${cab}</tr>` +
    linha('GP16100', '07h00 às 15h00') +
    linha('GP16100', '14h00 às 22h00') +
    `</tbody></table>`
  );
}
