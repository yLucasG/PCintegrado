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
      { escalaMensalId: 'e1', guarnicaoId: 'g1', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'FALTA', detalhe: null, detalheId: 'f1', substituindoMatricula: null },
      { escalaMensalId: 'e2', guarnicaoId: 'g2', policialMatricula: '222-2', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'SUBSTITUIDO', detalhe: 'Substituído por 111-1', detalheId: 'p1', substituindoMatricula: null },
    ],
    alteracoes: [
      { id: 'a1', data: '2026-08-12', tipo: 'CURSO', policialMatricula: '222-2', policialSubstitutoMatricula: null, guarnicaoId: 'g2', escalaMensalId: 'e2', horarioInicio: '06:00:00', horarioFim: '18:00:00', processoSei: '44900123', observacao: 'CFSD' },
    ],
    baixas: [],
    complementos: { ALT_GRAD_MONITORAMENTO: 'SGT SILVA', ALT_ESCALA_1CIA: '', ALT_ESCALA_2CIA: '', ALT_ESCALA_3CIA: '', ALT_ESCALA_PJES: '', ALT_OBSERVACOES: '' },
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
    expect(html).toContain('2026-08-12');
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
});
