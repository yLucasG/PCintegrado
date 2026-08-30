import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { GuarnicaoRow, TipoGuarnicao } from './guarnicoes.service';
import { PolicialRow } from './policiais.service';
import { AlteracaoRow, BaixaRow, RosterRow, TipoAlteracao } from './lancamento.service';
import { PjesRosterRow } from './pjes.service';

export type CampoComplementoAlt =
  | 'ALT_GRAD_MONITORAMENTO'
  | 'ALT_ESCALA_1CIA'
  | 'ALT_ESCALA_2CIA'
  | 'ALT_ESCALA_3CIA'
  | 'ALT_ESCALA_PJES'
  | 'ALT_OBSERVACOES';

export interface ComplementoAltRow {
  campo: CampoComplementoAlt;
  conteudo: string;
}

export interface RelatorioAlteracoesInput {
  data: string;
  guarnicoes: GuarnicaoRow[];
  policiais: PolicialRow[];
  roster: RosterRow[];
  alteracoes: AlteracaoRow[];
  baixas: BaixaRow[];
  complementos: Record<CampoComplementoAlt, string>;
  pjes: PjesRosterRow[];
}

@Injectable({ providedIn: 'root' })
export class RelatorioAlteracoesService {
  private readonly supabase = inject(SupabaseService);

  async listComplementos(data: string): Promise<ComplementoAltRow[]> {
    const { data: rows, error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .select('campo, conteudo')
      .eq('data', data);
    if (error) throw error;
    return (rows ?? []) as ComplementoAltRow[];
  }

  async salvarComplemento(data: string, campo: CampoComplementoAlt, conteudo: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .upsert({ data, campo, conteudo }, { onConflict: 'data,campo' });
    if (error) throw error;
  }
}

// --- HTML -----------------------------------------------------------------
// Estilos inline e esc() são intencionalmente duplicados de relatorio-sei.service.ts
// (o CKEditor do SEI descarta classes mas preserva tabelas e estilos inline).

const S_TABELA = 'border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:6pt 0;';
const S_CEL = 'border:1px solid #000;padding:3pt 5pt;vertical-align:top;';
const S_CEL_C = S_CEL + 'text-align:center;';
const S_TH = S_CEL + 'background-color:#e6e6e6;font-weight:bold;text-align:center;';
const S_TITULO = 'font-family:Calibri,Arial,sans-serif;font-size:12pt;font-weight:bold;text-transform:uppercase;text-align:center;margin:12pt 0 4pt;';
const S_PARAGRAFO = 'font-family:Calibri,Arial,sans-serif;font-size:12pt;text-align:justify;margin:4pt 0;';

/** Substituições de patrimônio de viaturas previstas (quadro fixo do 16º BPM). */
export const SUBSTITUICAO_PATRIMONIOS: { gt: string; patrimonio: string; horario: string }[] = [
  { gt: 'GT 16300', patrimonio: '710268', horario: '05h às 14h / 14h às 23h' },
  { gt: 'GT 16000', patrimonio: '710265', horario: '06h às 18h / 18h às 06h' },
  { gt: 'GT 16111', patrimonio: '710279', horario: '06h às 18h' },
  { gt: 'GT 16111', patrimonio: '710268', horario: '18h às 06h' },
  { gt: 'GT 16113', patrimonio: '710274', horario: '19h às 07h' },
  { gt: 'GG 16450', patrimonio: '710265', horario: '06h às 06h' },
  { gt: 'GG 16550', patrimonio: '710269', horario: '06h às 06h' },
  { gt: 'CR 16750', patrimonio: '710271', horario: '06h às 06h' },
  { gt: 'GT 16224', patrimonio: '710270', horario: '08h às 20h' },
  { gt: 'GT 16250', patrimonio: '710272', horario: '13h à 01h' },
  { gt: 'GT 16350', patrimonio: '710280', horario: '13h à 01h' },
  { gt: 'GV 16112', patrimonio: 'SNR 7E44', horario: '14h às 02h' },
  { gt: 'MP 16150', patrimonio: '71210', horario: '06h às 14h' },
  { gt: 'MO 16334', patrimonio: '710255', horario: '06h às 14h' },
  { gt: 'MO 16335', patrimonio: '710258', horario: '06h às 14h' },
  { gt: 'MO 16336', patrimonio: '710260', horario: '06h às 14h' },
  { gt: 'MO 16131', patrimonio: '710246', horario: '14h às 22h' },
  { gt: 'MO 16132', patrimonio: '710248', horario: '14h às 22h' },
  { gt: 'MO 16133', patrimonio: '710249', horario: '14h às 22h' },
  { gt: 'MO 16221', patrimonio: '710246', horario: '15h às 23h' },
  { gt: 'MO 16222', patrimonio: '710248', horario: '15h às 23h' },
  { gt: 'MO 16223', patrimonio: '710250', horario: '15h às 23h' },
  { gt: 'MO 16331', patrimonio: '710249', horario: '15h às 23h' },
  { gt: 'MO 16332', patrimonio: '710250', horario: '15h às 23h' },
  { gt: 'MO 16333', patrimonio: '710260', horario: '15h às 23h' },
  { gt: 'GT 16231', patrimonio: '710XXX', horario: '06h às 18h' },
  { gt: 'GT 16331', patrimonio: '710278', horario: '06h às 18h' },
  { gt: 'GT 16332', patrimonio: '710286', horario: '06h às 18h' },
  { gt: 'GT 16232', patrimonio: '710XXX', horario: '07h às 19h' },
  { gt: 'GT 16332', patrimonio: '710273', horario: '17h às 05h' },
  { gt: 'GT 16231', patrimonio: '710XXX', horario: '18h às 06h' },
  { gt: 'GT 16232', patrimonio: '710XXX', horario: '19h às 07h' },
  { gt: 'GT 16233', patrimonio: '710284', horario: '20h às 08h' },
  { gt: 'GT 16333', patrimonio: '710276', horario: '20h às 08h' },
  { gt: 'GT 16510', patrimonio: '710XXX', horario: '16h às 00h' },
];

/** Ordens de serviço permanentes do 16º BPM (lista fixa "O.S" cumpridas). */
export const OS_PERMANENTES: { numero: string; modalidade: string }[] = [
  { numero: 'OS Nº 1358/2025 – INT. POLICIAMENTO NOS TI DE JOANA BEZERRA, RECIFE E CAIS DE SANTA RITA – 31 DE OUTUBRO ATÉ ULTERIOR DELIBERAÇÃO', modalidade: 'GG 16450 / GG 16550' },
  { numero: 'OS Nº 1601/2025 - PBAC NO LOCAL EM FRENTE AO CTT – CENTRO DE TREINAMENTO TÁTICO PMPE – 18 DE DEZEMBRO A ULTERIOR DELIBERAÇÃO', modalidade: '01 PB/GT DISPONÍVEL' },
  { numero: 'OS Nº 28 - INT. POLICIAMENTO NOS BAIRROS DA BOA VISTA, ILHA DO LEITE, SÃO JOSÉ E SANTO ANTÔNIO – 13 DE JANEIRO ATÉ ULTERIOR DELIBERAÇÃO', modalidade: 'GT 16416' },
  { numero: 'OS Nº 160/2026 - Operação Impacto Integrado – Frei Caneca', modalidade: 'GT 16000 + 02 GTs OPS' },
  { numero: 'OS Nº 300 - INT.POL. EDF 13 DE MAIO/BOA VISTA - 24H', modalidade: '01 GT/PB EM RONDAS' },
  { numero: 'OS Nº 302 - INT.POL. NA PRAÇA SERGIO LORETO - 24H', modalidade: '01 GT/PB EM RONDAS' },
  { numero: 'OS 307 – OPERAÇÃO OCTOPUS - A PARTIR DE MARÇO DE 2026 ATÉ ULTERIOR DELIBERAÇÃO - 13H ÀS 21H', modalidade: 'GT 16000 + 01 GT DISPONÍVEL' },
  { numero: 'OS Nº 311 - INT.POL. NO CONSULADO GERAL DOS ESTADOS UNIDOS DA AMÉRICA - 03 DE MARÇO ATÉ ULTERIOR DELIBERAÇÃO - 24H', modalidade: 'GT 16000 + 01 GT DISPONÍVEL' },
  { numero: 'OS Nº 383/2026 – POLICIAMENTO PRAÇA ODÍLIA FREIRE', modalidade: 'PB ou 01 GT disponível' },
  { numero: 'OS Nº 441 – PROMOTORIAS (PAULO CAVALCANTI)', modalidade: 'RONDAS + PB (15min/hora)' },
  { numero: 'OS Nº 846 - INTENSIFICAÇÃO DO POLICIAMENTO PRAÇA DOM VITAL - 08 a 31JUL26', modalidade: 'CICLOPATRULHA - PEs do 01 ao 20 min de cada hora / 01 MO DISPONÍVEL - PEs do 20 ao 40 min de cada hora' },
  { numero: 'OS Nº 853 - INT. DO POLICIAMENTO NA RUA INCONFIDÊNCIA (JOANA BEZERRA) - DE 07 DE JULHO A 07 DE AGOSTO DE 2026', modalidade: 'PB JOANA BEZERRA / rondas no setor de origem com paradas de 10 minutos a cada duas horas na rua citada' },
  { numero: 'OS Nº 854 - INT. DO POLICIAMENTO NAS PROXIMIDADES DA DROGASIL (ILHA DO LEITE) - DE 07 DE JULHO A 07 DE AGOSTO DE 2026', modalidade: 'PB ILHA DO LEITE / rondas no setor de origem e abordagens a indivíduos em atitudes suspeitas na proximidade do local' },
  { numero: 'OS Nº 855 - INT. DO POLICIAMENTO NAS PROXIMIDADES DA CASA DA CULTURA - DE 07 DE JULHO A 07 DE AGOSTO DE 2026', modalidade: 'GT DISPONÍVEL OU PB SÃO JOSÉ / POG 25 RUA FLORIANO PEIXOTO (DA CASA DA CULTURA ATÉ TI DO RECIFE)' },
  { numero: 'OS Nº 887 - APOIO A CAMIL - AGENDA INSTITUCIONAL RELATIVO AO GOVERNO DO ESTADO DE PE - 13JUL2026 ATÉ ULTERIOR', modalidade: '01 GT DISPONÍVEL - permanecer no local até liberação pelo Responsável' },
  { numero: 'OS Nº 905 - APOIO A CAMIL - AGENDA INSTITUCIONAL RELATIVO AO GOVERNO DO ESTADO DE PE - 20JUL2026 ATÉ ULTERIOR DELIBERAÇÃO', modalidade: '01 GT DISPONÍVEL - permanecer no local até liberação pelo Responsável' },
  { numero: 'OS Nº 946 - PALÁCIO JOAQUIM NABUCO - 28JUL26 a 31AGO26', modalidade: 'GT 16000 / GT DISPONÍVEL / MO 16331 / CICLO PATRULHA (BOA VISTA)' },
  { numero: 'OS Nº 948 - OPERAÇÃO TRANSPORTE SEGURO (OTS) - AGOSTO 2026', modalidade: 'GT 16250 / GT 16350' },
  { numero: 'OS Nº 1046 - OPERAÇÃO OCTHOPUS', modalidade: 'MO 16131' },
  { numero: 'OS Nº 1077 - OPERAÇÃO FORÇA TOTAL', modalidade: 'GT 16550' },
];

const ROTULO_ALTERACAO: Record<TipoAlteracao, string> = {
  PERMUTA: 'PERMUTA',
  CURSO: 'CURSO',
  DISPENSA: 'DISPENSA',
  EXPEDIENTE: 'EXPEDIENTE',
  FOLGA: 'FOLGA',
  FALTA_LTS: 'LTS/DTS',
  AUSENCIA_SERVICO: 'AUSÊNCIA DO SERVIÇO',
};

// Rótulos do quadro PJES / DIÁRIA — duplicados verbatim de PJES_TOTAL / PJES_SERVICO
// em relatorio-sei.service.ts (Ruling 1 sanciona a duplicação).
const PJES_TOTAL_ALT = [
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

const PJES_SERVICO_ALT = [
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

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function dataPorExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES_PT[Number(m[2]) - 1]} de ${m[1]}`;
}

function esc(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "GT 16111 - São José" -> "GT 16111". */
function setorLabel(g: GuarnicaoRow | undefined): string {
  if (!g) return '';
  return g.nome.split(/\s[–-]\s/)[0].trim();
}

function tabela(cabecalhos: string[], linhas: string[][]): string {
  const thead = `<tr>${cabecalhos.map((h) => `<th style="${S_TH}">${esc(h)}</th>`).join('')}</tr>`;
  const tbody = linhas
    .map((l) => `<tr>${l.map((c) => `<td style="${S_CEL}">${c}</td>`).join('')}</tr>`)
    .join('');
  return `<table style="${S_TABELA}"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

/** Tabela 2 colunas (TOTAL DE LANÇAMENTOS | SERVIÇO EM GERAL) com valores em branco.
 * Modelada em tabelaDuasColunas de relatorio-sei.service.ts. */
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

export function montarRelatorioAlteracoesHtml(input: RelatorioAlteracoesInput): string {
  const guarnicaoPorId = new Map(input.guarnicoes.map((g) => [g.id, g]));
  const policialPorMatricula = new Map(input.policiais.map((p) => [p.matricula, p]));
  const grad = (m: string): string => policialPorMatricula.get(m)?.graduacao ?? '';
  const nomeGuerra = (m: string): string => policialPorMatricula.get(m)?.nome_guerra ?? m;

  const out: string[] = [];

  // 1-2. Cabeçalho -------------------------------------------------------
  out.push(`<p style="${S_TITULO}">SECRETARIA DE DEFESA SOCIAL</p>`);
  out.push(`<p style="${S_TITULO}">POLÍCIA MILITAR DE PERNAMBUCO</p>`);
  out.push(`<p style="${S_TITULO}">16º BATALHÃO DE POLÍCIA MILITAR — BATALHÃO FREI CANECA</p>`);
  out.push(`<p style="${S_TITULO}">RELATÓRIO DE ALTERAÇÕES DO SERVIÇO</p>`);
  out.push(
    `<p style="${S_PARAGRAFO}"><b>Data:</b> ${esc(dataPorExtenso(input.data))} &nbsp;&nbsp; ` +
      `<b>Graduado de monitoramento:</b> ${esc(input.complementos.ALT_GRAD_MONITORAMENTO)}</p>`,
  );

  // 3. Parágrafo de abertura ------------------------------------------
  out.push(
    `<p style="${S_PARAGRAFO}">Segue o relatório das alterações do serviço ordinário referente ao dia ` +
      `${esc(dataPorExtenso(input.data))}, para conhecimento e providências.</p>`,
  );

  // 4. ESCALAS ------------------------------------------------------
  out.push(`<p style="${S_TITULO}">ESCALAS</p>`);
  out.push(
    tabela(
      ['ESCALA', 'PROCESSO SEI'],
      [
        ['1ª CIA', esc(input.complementos.ALT_ESCALA_1CIA)],
        ['2ª CIA', esc(input.complementos.ALT_ESCALA_2CIA)],
        ['3ª CIA', esc(input.complementos.ALT_ESCALA_3CIA)],
        ['PJES', esc(input.complementos.ALT_ESCALA_PJES)],
      ],
    ),
  );

  // 5. ALTERAÇÕES DO EFETIVO ---------------------------------------
  out.push(`<p style="${S_TITULO}">ALTERAÇÕES DO EFETIVO</p>`);
  const linhasEfetivo = input.alteracoes.length
    ? input.alteracoes.map((a) => [
        esc(ROTULO_ALTERACAO[a.tipo]),
        esc(grad(a.policialMatricula)),
        esc(a.policialMatricula),
        esc(nomeGuerra(a.policialMatricula)),
        '16ºBPM',
        esc(setorLabel(guarnicaoPorId.get(a.guarnicaoId ?? ''))),
        esc(a.processoSei),
        esc(
          a.tipo === 'PERMUTA'
            ? `Substituído por ${a.policialSubstitutoMatricula}${a.observacao ? ' — ' + a.observacao : ''}`
            : a.observacao,
        ),
      ])
    : [['-', '-', '-', '-', '-', '-', '-', '-']];
  out.push(
    tabela(
      ['ALTERAÇÃO', 'GRAD.', 'MATRÍCULA', 'NOME', 'OME', 'SETOR', 'PROCESSO SEI', 'OBSERVAÇÃO'],
      linhasEfetivo,
    ),
  );

  // 6. ALTERAÇÕES OPERAÇÃO PATRULHA / REMANEJAMENTOS (pré-montado) ----
  for (const titulo of ['POG A PÉ', 'CICLOPATRULHA', 'PBS']) {
    out.push(`<p style="${S_TITULO}">${titulo}</p>`);
    out.push(
      tabela(
        ['SETOR', 'HORÁRIO', 'EFETIVO', 'OBS'],
        [['', '', '', ''], ['OBS:', '', '', '']],
      ),
    );
  }

  // 7. SUBSTITUIÇÃO DE PATRIMÔNIOS DE VIATURAS (pré-montado fixo) -----
  out.push(`<p style="${S_TITULO}">SUBSTITUIÇÃO DE PATRIMÔNIOS DE VIATURAS</p>`);
  out.push(
    tabela(
      ['GT', 'PATRI. INICIAL', 'HORÁRIO', 'PATRI. SUBSTITUTO', 'HORÁRIO', 'MOTIVO'],
      SUBSTITUICAO_PATRIMONIOS.map((p) => [esc(p.gt), esc(p.patrimonio), esc(p.horario), '', '', '']),
    ),
  );

  // 8. ORDINÁRIO — TOTAL DE LANÇAMENTOS (auto) ----------------------
  const baixados = new Set(input.baixas.map((b) => `${b.guarnicaoId}__${b.horarioInicio}`));
  const contaTipo = (t: TipoGuarnicao): number =>
    new Set(
      input.roster
        .filter((r) => guarnicaoPorId.get(r.guarnicaoId)?.tipo === t)
        .map((r) => `${r.guarnicaoId}__${r.horarioInicio}`)
        .filter((cardId) => !baixados.has(cardId)),
    ).size;
  const porStatus = (s: RosterRow['statusEfetivo']): number =>
    input.roster.filter((r) => r.statusEfetivo === s).length;

  const totalLanc: [string, number | string][] = [
    ["GS'S", contaTipo('GT_ORDINARIO')],
    ["GT'S", contaTipo('GT_TATICO')],
    ["PB'S", 0],
    ['GV', contaTipo('GV')],
    ["MO'S", contaTipo('MO')],
    ['CP', contaTipo('CP')],
    ['CR', contaTipo('CR')],
    ['GG', contaTipo('GG')],
    ['MP', 0],
    ['POG A PE NO TERRENO - 03 TURNOS', ''],
  ];
  const servicoGeral: [string, number | string][] = [
    ['FALTAS', porStatus('FALTA')],
    ['LTS / DTS', porStatus('LICENCA')],
    ['PERMUTAS', porStatus('SUBSTITUIDO')],
    ['AUSÊNCIA DO SERVIÇO', porStatus('AUSENCIA')],
    ['FOLGAS (TÁTICO/MO/GT/PB/CICLO)', porStatus('FOLGA')],
    ['LICENÇA PATERNIDADE', ''],
    ['REMANEJAMENTO GT/MO/PB - ORDINÁRIA', porStatus('REMANEJADO')],
    ["VT'S/MO'S/DESATIVADAS", input.baixas.length],
    ['VIATURA/MO FORA DA ÁREA EM MISSÃO', ''],
    ['QUANTIDADE DE "OS" CUMPRIDA', 0],
  ];
  out.push(`<p style="${S_TITULO}">ORDINÁRIO</p>`);
  const n = Math.max(totalLanc.length, servicoGeral.length);
  const corpo: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = totalLanc[i];
    const b = servicoGeral[i];
    corpo.push(
      `<tr>` +
        `<td style="${S_CEL_C}">${a ? esc(a[0]) : ''}</td>` +
        `<td style="${S_CEL_C}">${a ? esc(String(a[1])) : ''}</td>` +
        `<td style="${S_CEL_C}">${b ? esc(b[0]) : ''}</td>` +
        `<td style="${S_CEL_C}">${b ? esc(String(b[1])) : ''}</td>` +
        `</tr>`,
    );
  }
  out.push(
    `<table style="${S_TABELA}"><thead><tr>` +
      `<th style="${S_TH}" colspan="2">TOTAL DE LANÇAMENTOS</th>` +
      `<th style="${S_TH}" colspan="2">SERVIÇO EM GERAL</th>` +
      `</tr></thead><tbody>${corpo.join('')}</tbody></table>`,
  );

  // 10. PJES / DIÁRIA -------------------------------------------------
  out.push(`<p style="${S_TITULO}">PJES / DIÁRIA</p>`);
  if (input.pjes.length > 0) {
    const situacao = (s: PjesRosterRow['status']): string =>
      s === 'FALTA' ? 'FALTOU' : s === 'ATRASADO' ? 'ATRASADO' : 'PRESENTE';
    const linhasPjes = [...input.pjes]
      .sort((a, b) => a.gtRotulo.localeCompare(b.gtRotulo) || a.funcao.localeCompare(b.funcao))
      .map((p) => [
        esc(p.gtRotulo),
        esc(p.funcao),
        esc(p.graduacao),
        esc(p.matricula),
        esc(p.nomeGuerra),
        `${esc(p.horarioInicio.slice(0, 5))}–${esc(p.horarioFim.slice(0, 5))}`,
        situacao(p.status),
      ]);
    out.push(
      tabela(['GT', 'FUNÇÃO', 'GRAD', 'MATRÍCULA', 'NOME', 'HORÁRIO', 'SITUAÇÃO'], linhasPjes),
    );
    // Mantém também o quadro pré-montado dos totais EXTRA de PJES (não constam na escala do dia).
    out.push(tabelaDuasColunas(PJES_TOTAL_ALT, PJES_SERVICO_ALT));
  } else {
    out.push(tabelaDuasColunas(PJES_TOTAL_ALT, PJES_SERVICO_ALT));
  }

  // 11. "O.S" CUMPRIDAS (lista fixa) ------------------------------
  out.push(`<p style="${S_TITULO}">"O.S" CUMPRIDAS</p>`);
  out.push(
    tabela(
      ['QNT', 'Nº DA O.S', 'MODALIDADE DE POLICIAMENTO'],
      OS_PERMANENTES.map((o, i) => [String(i + 1), esc(o.numero), esc(o.modalidade)]),
    ),
  );

  // 9./12. OBSERVAÇÕES + assinatura -----------------------------
  out.push(`<p style="${S_TITULO}">OBSERVAÇÕES</p>`);
  out.push(`<p style="${S_PARAGRAFO}">${esc(input.complementos.ALT_OBSERVACOES) || '-'}</p>`);
  out.push(`<p style="${S_PARAGRAFO}text-align:center;font-weight:bold;">${esc(input.complementos.ALT_GRAD_MONITORAMENTO)}<br>GRADUADO DE MONITORAMENTO</p>`);

  return out.join('\n');
}
