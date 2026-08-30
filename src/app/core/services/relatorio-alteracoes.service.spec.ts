import { TestBed } from '@angular/core/testing';
import {
  RelatorioAlteracoesService,
  montarRelatorioAlteracoesHtml,
  RelatorioAlteracoesInput,
  OS_PERMANENTES,
} from './relatorio-alteracoes.service';
import { SupabaseService } from './supabase.service';

function baseInput(over: Partial<RelatorioAlteracoesInput> = {}): RelatorioAlteracoesInput {
  return {
    data: '2026-08-12',
    guarnicoes: [
      { id: 'g1', nome: 'GT 16111 - São José', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'São José', prefixos: ['16111'] },
      { id: 'g2', nome: 'GT 16112 - Santo Antônio', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'Santo Antônio', prefixos: ['16112'] },
      { id: 'g3', nome: 'MO 16334 - Área 3', tipo: 'MO', companhia_id: 'c1', area_atuacao: null, prefixos: ['16334'] },
    ],
    policiais: [
      { matricula: '111-1', graduacao: 'SD', nome_guerra: 'ALFA', telefone: null, companhia_id: 'c1' },
      { matricula: '222-2', graduacao: 'CB', nome_guerra: 'BRAVO & <X>', telefone: null, companhia_id: 'c1' },
    ],
    roster: [
      { escalaMensalId: 'e1', guarnicaoId: 'g1', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'FALTA', detalhe: null, detalheId: 'f1', detalheOrigem: 'LEGADO', substituindoMatricula: null },
      { escalaMensalId: 'e2', guarnicaoId: 'g2', policialMatricula: '222-2', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'SUBSTITUIDO', detalhe: 'Substituído por 111-1', detalheId: 'p1', detalheOrigem: 'ALTERACAO', substituindoMatricula: null },
      { escalaMensalId: 'e3', guarnicaoId: 'g3', policialMatricula: '111-1', funcao: 'PAT', horarioInicio: '06:00:00', horarioFim: '14:00:00', statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null, detalheOrigem: null, substituindoMatricula: null },
    ],
    alteracoes: [
      { id: 'a1', data: '2026-08-12', tipo: 'CURSO', policialMatricula: '222-2', policialSubstitutoMatricula: null, guarnicaoId: 'g2', escalaMensalId: 'e2', horarioInicio: '06:00:00', horarioFim: '18:00:00', processoSei: '44900123', observacao: 'CFSD' },
    ],
    baixas: [],
    complementos: { ALT_GRAD_MONITORAMENTO: 'SGT SILVA', ALT_ESCALA_1CIA: '', ALT_ESCALA_2CIA: '', ALT_ESCALA_3CIA: '', ALT_ESCALA_PJES: '', ALT_OBSERVACOES: '' },
    pjes: [],
    ...over,
  };
}

describe('RelatorioAlteracoesService', () => {
  it('salva complemento com onConflict data,campo', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ upsert: upsertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(RelatorioAlteracoesService);
    await service.salvarComplemento('2026-08-12', 'ALT_GRAD_MONITORAMENTO', 'SGT SILVA');
    expect(upsertSpy).toHaveBeenCalledWith(
      { data: '2026-08-12', campo: 'ALT_GRAD_MONITORAMENTO', conteudo: 'SGT SILVA' },
      { onConflict: 'data,campo' },
    );
  });
});

describe('montarRelatorioAlteracoesHtml', () => {
  it('renderiza título, data e o graduado de monitoramento', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    expect(html).toContain('RELATÓRIO DE ALTERAÇÕES DO SERVIÇO');
    expect(html).toContain('12 de agosto de 2026');
    expect(html).toContain('SGT SILVA');
  });

  it('lista a alteração CURSO na tabela ALTERAÇÕES DO EFETIVO com matrícula, SETOR e processo SEI', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    const secao = html.slice(html.indexOf('ALTERAÇÕES DO EFETIVO'));
    expect(secao).toContain('CURSO');
    expect(secao).toContain('222-2');
    expect(secao).toContain('BRAVO &amp; &lt;X&gt;'); // coluna NOME
    expect(secao).toContain('>CB<'); // coluna GRAD.
    expect(secao).toContain('GT 16112'); // coluna SETOR (nome antes de " - ")
    expect(secao).toContain('44900123');
    expect(secao).toContain('CFSD');
  });

  it('escapa HTML nos nomes', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    expect(html).not.toContain('BRAVO & <X>');
  });

  it('conta guarnições no TOTAL DE LANÇAMENTOS (GT\'S = 2, MO\'S = 1)', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    const secao = html.slice(html.indexOf('TOTAL DE LANÇAMENTOS'));
    expect(secao).toMatch(/GT'S<\/td>\s*<td[^>]*>2<\/td>/);
    expect(secao).toMatch(/MO'S<\/td>\s*<td[^>]*>1<\/td>/);
  });

  it('exclui guarnições baixadas do TOTAL DE LANÇAMENTOS (GT\'S cai de 2 para 1)', () => {
    const html = montarRelatorioAlteracoesHtml(
      baseInput({
        baixas: [
          { id: 'b1', guarnicaoId: 'g1', horarioInicio: '06:00:00', motivo: null, seiNumero: null },
        ],
      }),
    );
    const secao = html.slice(html.indexOf('TOTAL DE LANÇAMENTOS'));
    expect(secao).toMatch(/GT'S<\/td>\s*<td[^>]*>1<\/td>/);
  });

  it('renderiza os rótulos PJES / DIÁRIA e a linha OBS: nos quadros de patrulha', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    expect(html).toContain("GS'S EXTRA");
    expect(html).toContain('OBS:');
  });

  it('conta SERVIÇO EM GERAL a partir do roster (FALTAS = 1, PERMUTAS = 1)', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    const secao = html.slice(html.indexOf('SERVIÇO EM GERAL'));
    expect(secao).toMatch(/FALTAS<\/td>\s*<td[^>]*>1<\/td>/);
    expect(secao).toMatch(/PERMUTAS<\/td>\s*<td[^>]*>1<\/td>/);
  });

  it('inclui a lista fixa OS_PERMANENTES (1358/2025 e 948)', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    const secao = html.slice(html.indexOf('"O.S" CUMPRIDAS'));
    expect(secao).toContain('1358/2025');
    expect(secao).toContain('OPERAÇÃO TRANSPORTE SEGURO');
    expect(OS_PERMANENTES).toHaveLength(20);
  });

  it('inclui o quadro fixo SUBSTITUIÇÃO DE PATRIMÔNIOS DE VIATURAS', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    const secao = html.slice(html.indexOf('SUBSTITUIÇÃO DE PATRIMÔNIOS'));
    expect(secao).toContain('GT 16300');
    expect(secao).toContain('710268');
  });

  it('inclui os quadros pré-montados PJES / DIÁRIA e POG A PÉ', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    expect(html).toContain('PJES / DIÁRIA');
    expect(html).toContain('POG A PÉ');
  });

  it('preenche PJES / DIÁRIA com a escala PJES quando há linhas', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput({
      pjes: [
        { escalaPjesId: 'e1', gtRotulo: 'GT 16100 - SUPERVISÃO', funcao: 'CMT', graduacao: 'TC', matricula: '102505-8', nomeGuerra: 'GRISI', telefone: null, horarioInicio: '16:00:00', horarioFim: '00:00:00', status: 'PREVISTO', horarioChegada: null, motivo: null },
        { escalaPjesId: 'e2', gtRotulo: 'GT 16141 - 1º CPM', funcao: 'MOT', graduacao: 'SD', matricula: '130253-1', nomeGuerra: 'DIOGO', telefone: null, horarioInicio: '23:59:00', horarioFim: '05:59:00', status: 'FALTA', horarioChegada: null, motivo: null },
      ],
    }));
    const secao = html.slice(html.indexOf('PJES / DIÁRIA'));
    expect(secao).toContain('GT 16100 - SUPERVISÃO');
    expect(secao).toContain('102505-8');
    expect(secao).toContain('GRISI');
    expect(secao).toContain('PRESENTE');
    expect(secao).toContain('FALTOU');
  });

  it('mantém o quadro pré-montado PJES / DIÁRIA quando não há linhas PJES', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput({ pjes: [] }));
    const secao = html.slice(html.indexOf('PJES / DIÁRIA'));
    expect(secao).toContain("GS'S EXTRA");
  });
});
