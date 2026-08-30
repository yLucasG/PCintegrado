import { FuncaoPjes } from './pjes.service';

export interface ItemTextoPdf {
  str: string;
  x: number;
  y: number;
  page: number;
}

export interface LinhaPjesExtraida {
  data: string;
  gtRotulo: string;
  funcao: FuncaoPjes;
  graduacao: string | null;
  matricula: string | null;
  nomeGuerra: string;
  telefone: string | null;
  horarioInicio: string;
  horarioFim: string;
}

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12',
};

const FUNCOES: FuncaoPjes[] = ['CMT', 'MOT', 'PAT'];

/** "16h às 0h" | "23:59 às 05:59" | "05h à 14h" | "14h às 00h" -> ["HH:MM","HH:MM"] ou null */
function parseHorario(texto: string): [string, string] | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*h?\s*(?:às|as|à|a)\s*(\d{1,2})(?::(\d{2}))?\s*h?/i.exec(texto);
  if (!m) return null;
  const hh = (h: string, mm?: string) => `${h.padStart(2, '0')}:${(mm ?? '00').padStart(2, '0')}`;
  return [hh(m[1], m[2]), hh(m[3], m[4])];
}

function normalizarData(texto: string): string | null {
  const m = /(\d{1,2})\s*\/\s*([a-zç]+)\s*\/\s*(\d{4})/i.exec(texto);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`;
}

/** Agrupa itens de uma página em linhas visuais (mesmo y ~3pt), ordenadas topo->baixo. */
function agruparLinhas(itens: ItemTextoPdf[]): ItemTextoPdf[][] {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: ItemTextoPdf[][] = [];
  for (const item of ordenados) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0].y - item.y) <= 3) {
      ultima.push(item);
    } else {
      linhas.push([item]);
    }
  }
  for (const l of linhas) l.sort((a, b) => a.x - b.x);
  return linhas;
}

const RE_GT = /^GT ?\d{4,5}$/i;
const RE_MATRICULA = /^\d{5,6}-?\d?$/;
const RE_TELEFONE = /^\d{10,11}$/;
const RE_NUM5 = /^\d{5}$/;
const RE_OME = /(^|\s)(BPM|CIPM|CIPMOTO|CIA|COMPANHIA|GATI|RPMON|BPRV|BPTRAN|BPGD|CPRAIA)(\s|$)/i;
const RE_ORDINAL = /^\d{1,3}[ºª]$/;

export function extrairEscalaPjes(itens: ItemTextoPdf[]): LinhaPjesExtraida[] {
  const paginas = new Map<number, ItemTextoPdf[]>();
  for (const it of itens) {
    if (!paginas.has(it.page)) paginas.set(it.page, []);
    paginas.get(it.page)!.push(it);
  }

  const resultado: LinhaPjesExtraida[] = [];

  for (const page of [...paginas.keys()].sort((a, b) => a - b)) {
    const linhas = agruparLinhas(paginas.get(page)!);
    let data: string | null = null;
    let gtRotulo: string | null = null;
    let horarioBloco: [string, string] | null = null;

    for (const linha of linhas) {
      const textos = linha.map((i) => i.str.trim()).filter(Boolean);
      if (textos.length === 0) continue;
      const joined = textos.join(' ');

      if (!data) {
        const d = normalizarData(joined);
        if (d) { data = d; continue; }
      }

      // Cabeçalho de seção: "GT 16100" | "GT16141" | "MO"
      const primeiro = textos[0].toUpperCase();
      if (RE_GT.test(primeiro) || primeiro === 'MO') {
        const rotulo = textos.slice(1).join(' ').toUpperCase();
        gtRotulo = !rotulo || rotulo === primeiro ? primeiro : `${primeiro} - ${rotulo}`;
        horarioBloco = null;
        continue;
      }

      // Cabeçalho de colunas
      if (/^GRAD\.?$/i.test(textos[0]) && joined.toUpperCase().includes('NOME DE GUERRA')) {
        continue;
      }

      // Linha de dados: primeiro token é função (CMT/MOT/PAT) ou número de 5 dígitos
      const tok0 = textos[0].toUpperCase();
      const ehFuncao = (FUNCOES as string[]).includes(tok0);
      const ehNum5 = RE_NUM5.test(textos[0]);
      if (!data || !gtRotulo || (!ehFuncao && !ehNum5)) continue;

      const funcao: FuncaoPjes = ehFuncao ? (tok0 as FuncaoPjes) : 'OUTRO';
      const resto = textos.slice(1);

      // horário: último token que casa parseHorario
      let horario: [string, string] | null = null;
      let idxHorario = -1;
      for (let i = resto.length - 1; i >= 0; i--) {
        const h = parseHorario(resto[i]);
        if (h) { horario = h; idxHorario = i; break; }
      }
      const campos = idxHorario >= 0 ? resto.slice(0, idxHorario) : resto;
      if (horario) horarioBloco = horario;

      // telefone: token que casa RE_TELEFONE
      const idxTel = campos.findIndex((c) => RE_TELEFONE.test(c));
      const telefone = idxTel >= 0 ? campos[idxTel] : null;
      const semTel = idxTel >= 0 ? campos.slice(0, idxTel) : campos;

      // OME "16º BPM" — remover ocorrências
      const semOme = semTel.filter((c) => !RE_OME.test(c) && !RE_ORDINAL.test(c));

      // matrícula
      const idxMat = semOme.findIndex((c) => RE_MATRICULA.test(c));
      const matricula = idxMat >= 0 ? semOme[idxMat] : null;

      // graduação = tudo antes da matrícula; nome = tudo depois
      const graduacao = idxMat > 0 ? semOme.slice(0, idxMat).join(' ') : null;
      const nomeGuerra = (idxMat >= 0 ? semOme.slice(idxMat + 1) : semOme).join(' ').trim();

      const hFinal = horario ?? horarioBloco;
      resultado.push({
        data,
        gtRotulo,
        funcao,
        graduacao,
        matricula,
        nomeGuerra: nomeGuerra || (matricula ?? ''),
        telefone,
        horarioInicio: hFinal ? hFinal[0] : '',
        horarioFim: hFinal ? hFinal[1] : '',
      });
    }
  }

  return resultado;
}
