import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { GuarnicaoRow } from './guarnicoes.service';
import { PolicialRow } from './policiais.service';
import { AlteracaoRow, BaixaRow, RosterRow, TipoAlteracao } from './lancamento.service';

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

/** Ordens de serviço permanentes do 16º BPM (preenchidas em tarefas posteriores). */
export const OS_PERMANENTES: { numero: string; modalidade: string }[] = [];

/** Substituições de patrimônio previstas (preenchidas em tarefas posteriores). */
export const SUBSTITUICAO_PATRIMONIOS: { gt: string; patrimonio: string; horario: string }[] = [];

const ROTULO_ALTERACAO: Record<TipoAlteracao, string> = {
  PERMUTA: 'PERMUTA',
  CURSO: 'CURSO',
  DISPENSA: 'DISPENSA',
  EXPEDIENTE: 'EXPEDIENTE',
  FOLGA: 'FOLGA',
  FALTA_LTS: 'LTS/DTS',
  AUSENCIA_SERVICO: 'AUSÊNCIA DO SERVIÇO',
};

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
    `<p style="${S_PARAGRAFO}"><b>Data:</b> ${esc(input.data)} &nbsp;&nbsp; ` +
      `<b>Graduado de monitoramento:</b> ${esc(input.complementos.ALT_GRAD_MONITORAMENTO)}</p>`,
  );

  // 3. Parágrafo de abertura ------------------------------------------
  out.push(
    `<p style="${S_PARAGRAFO}">Segue o relatório das alterações do serviço ordinário referente ao dia ` +
      `${esc(input.data)}, para conhecimento e providências.</p>`,
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

  return out.join('\n');
}
