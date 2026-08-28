import { TestBed } from '@angular/core/testing';
import { RelatorioSeiService, montarRelatorioHtml, RelatorioSeiInput } from './relatorio-sei.service';
import { SupabaseService } from './supabase.service';

describe('RelatorioSeiService', () => {
  it('lists complementos for a given day', async () => {
    const rows = [{ campo: 'OBSERVACOES', conteudo: 'Nada a registrar' }];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(RelatorioSeiService);
    const result = await service.listComplementos('2026-08-04');

    expect(result).toEqual([{ campo: 'OBSERVACOES', conteudo: 'Nada a registrar' }]);
  });

  it('upserts a complemento keyed by data+campo', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ upsert: upsertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(RelatorioSeiService);
    await service.salvarComplemento('2026-08-04', 'POG', 'Pe Seguro no Marco Zero, 06h-18h');

    expect(upsertSpy).toHaveBeenCalledWith(
      { data: '2026-08-04', campo: 'POG', conteudo: 'Pe Seguro no Marco Zero, 06h-18h' },
      { onConflict: 'data,campo' },
    );
  });
});

describe('montarRelatorioHtml', () => {
  function baseInput(overrides: Partial<RelatorioSeiInput> = {}): RelatorioSeiInput {
    return {
      data: '2026-08-12',
      guarnicoes: [
        { id: 'g1', nome: 'GT 16111 - São José', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'São José', prefixos: ['16111'] },
        { id: 'g2', nome: 'GT 16112 - Santo Antônio', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'Santo Antônio', prefixos: ['16112'] },
      ],
      policiais: [
        { matricula: '111-1', graduacao: 'SD', nome_guerra: 'ALFA', telefone: '81999990000', companhia_id: 'c1' },
        { matricula: '222-2', graduacao: 'CB', nome_guerra: 'BRAVO & <X>', telefone: null, companhia_id: 'c1' },
      ],
      roster: [
        { escalaMensalId: 'e1', guarnicaoId: 'g1', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null },
        { escalaMensalId: 'e2', guarnicaoId: 'g1', policialMatricula: '222-2', funcao: 'MOT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'FALTA', detalhe: 'Atestado médico', detalheId: 'f1' },
        { escalaMensalId: 'e3', guarnicaoId: 'g2', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '07:00:00', horarioFim: '19:00:00', statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null },
      ],
      baixas: [],
      osRows: [
        { id: 'o1', guarnicaoId: 'g1', horarioInicio: '06:00:00', numeroOs: 'OS 123/2026', situacao: 'Apoio a evento', local: 'Marco Zero' },
      ],
      funcoesFixas: [
        { id: 'ff1', grupo: 'GUARDA', funcao: 'Comandante da Guarda', horarioInicio: '06:00:00', horarioFim: '06:00:00', policialMatricula: '111-1', foneCmt: '81988887777' },
      ],
      complementos: { PJES_DIARIA: '', FISCALIZACAO: '', POG: 'Pé Seguro no Marco Zero', DIRESP: '', OBSERVACOES: '' },
      ...overrides,
    };
  }

  it('renders a document with tables, the title and the date', () => {
    const html = montarRelatorioHtml(baseInput());
    expect(html).toContain('<table');
    expect(html).toContain('RELATÓRIO DE LANÇAMENTO');
    expect(html).toContain('2026-08-12');
  });

  it('counts guarnições by model label in the ORDINÁRIO table (GTS = 2)', () => {
    const html = montarRelatorioHtml(baseInput());
    expect(html).toMatch(/GTS<\/td>\s*<td[^>]*>2<\/td>/);
  });

  it('groups cards into chamadas by start time', () => {
    const html = montarRelatorioHtml(baseInput());
    expect(html).toContain('1ª CHAMADA');
    expect(html).toContain('2ª CHAMADA');
  });

  it('escapes HTML in policial names', () => {
    const html = montarRelatorioHtml(baseInput());
    expect(html).toContain('BRAVO &amp; &lt;X&gt;');
    expect(html).not.toContain('BRAVO & <X>');
  });

  it('lists a FALTA in the alterações FALTAS table with its motivo', () => {
    const html = montarRelatorioHtml(baseInput());
    const faltasSection = html.slice(html.indexOf('FALTAS'));
    expect(faltasSection).toContain('222-2');
    expect(faltasSection).toContain('Atestado médico');
  });

  it('renders free-text complementos under their heading, or "-" when empty', () => {
    const html = montarRelatorioHtml(baseInput());
    expect(html).toContain('Pé Seguro no Marco Zero');
    const fiscalIdx = html.indexOf('FISCALIZAÇÃO');
    expect(html.slice(fiscalIdx, fiscalIdx + 200)).toContain('-');
  });

  it('puts the OS number in the chamada table for the matching guarnição', () => {
    const html = montarRelatorioHtml(baseInput());
    expect(html).toContain('OS 123/2026');
  });

  it('renders the GUARDA table from funções fixas', () => {
    const html = montarRelatorioHtml(baseInput());
    const guardaIdx = html.indexOf('GUARDA');
    expect(html.slice(guardaIdx)).toContain('Comandante da Guarda');
  });
});
