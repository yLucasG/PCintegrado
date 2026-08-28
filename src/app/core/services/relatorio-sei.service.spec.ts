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
      turno: 'DIURNO',
      guarnicoes: [
        { id: 'g1', nome: 'GT 16111 - São José', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'São José', prefixos: ['16111'] },
        { id: 'g2', nome: 'GT 16112 - Santo Antônio', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'Santo Antônio', prefixos: ['16112'] },
        { id: 'g3', nome: 'GT 16333 - Santo Amaro', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'Santo Amaro', prefixos: ['16333'] },
        { id: 'g4', nome: 'CP 16221 - Ilha do Leite', tipo: 'CP', companhia_id: 'c1', area_atuacao: 'Ilha do Leite', prefixos: ['CP16221'] },
      ],
      policiais: [
        { matricula: '111-1', graduacao: 'SD', nome_guerra: 'ALFA', telefone: '81999990000', companhia_id: 'c1' },
        { matricula: '222-2', graduacao: 'CB', nome_guerra: 'BRAVO & <X>', telefone: null, companhia_id: 'c1' },
      ],
      roster: [
        // g1: início 05h → 1ª chamada diurna
        { escalaMensalId: 'e1', guarnicaoId: 'g1', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '05:00:00', horarioFim: '17:00:00', statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null },
        { escalaMensalId: 'e2', guarnicaoId: 'g1', policialMatricula: '222-2', funcao: 'MOT', horarioInicio: '05:00:00', horarioFim: '17:00:00', statusEfetivo: 'FALTA', detalhe: 'Atestado médico', detalheId: 'f1' },
        // g2: início 06h → 2ª chamada diurna
        { escalaMensalId: 'e3', guarnicaoId: 'g2', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null },
        // g4: início 13h → lançamento complementar (diurno)
        { escalaMensalId: 'e4', guarnicaoId: 'g4', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '13:00:00', horarioFim: '21:00:00', statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null },
        // g3: início 20h → só aparece no turno noturno
        { escalaMensalId: 'e5', guarnicaoId: 'g3', policialMatricula: '222-2', funcao: 'CMT', horarioInicio: '20:00:00', horarioFim: '08:00:00', statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null },
      ],
      baixas: [],
      osRows: [
        { id: 'o1', guarnicaoId: 'g1', horarioInicio: '05:00:00', numeroOs: 'OS 123/2026', situacao: 'Apoio a evento', local: 'Marco Zero' },
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

  it('usa o texto do turno escolhido na carta', () => {
    expect(montarRelatorioHtml(baseInput({ turno: 'DIURNO' }))).toContain('das 06:00h às 18:00h');
    expect(montarRelatorioHtml(baseInput({ turno: 'NOTURNO' }))).toContain('das 18:00h às 06:00h');
  });

  it('mapeia a hora de início para 1ª/2ª chamada e joga o resto em complementares', () => {
    const html = montarRelatorioHtml(baseInput({ turno: 'DIURNO' }));
    expect(html).toContain('1ª CHAMADA — 05:00');
    expect(html).toContain('2ª CHAMADA — 06:00');
    expect(html).not.toContain('3ª CHAMADA');
    expect(html).toContain('LANÇAMENTOS COMPLEMENTARES');
  });

  it('filtra as viaturas pelo turno: a GT das 20h só aparece no noturno', () => {
    expect(montarRelatorioHtml(baseInput({ turno: 'DIURNO' }))).not.toContain('GT 16333 - Santo Amaro');
    const noturno = montarRelatorioHtml(baseInput({ turno: 'NOTURNO' }));
    expect(noturno).toContain('GT 16333 - Santo Amaro');
    expect(noturno).toContain('4ª CHAMADA — 20:00');
  });

  it('a 1ª chamada usa célula amarela e texto vermelho; a 2ª usa o padrão', () => {
    const html = montarRelatorioHtml(baseInput({ turno: 'DIURNO' }));
    const linha1 = html.slice(html.indexOf('1ª CHAMADA'), html.indexOf('2ª CHAMADA'));
    expect(linha1).toContain('background-color:#ffff00');
    expect(linha1).toContain('color:#c00000');
    const linha2 = html.slice(html.indexOf('2ª CHAMADA'), html.indexOf('LANÇAMENTOS COMPLEMENTARES'));
    expect(linha2).toContain('background-color:#d9d9d9');
  });

  it('conta guarnições por rótulo do modelo na tabela ORDINÁRIO (GTS = 3)', () => {
    const html = montarRelatorioHtml(baseInput());
    expect(html).toMatch(/GTS<\/td>\s*<td[^>]*>3<\/td>/);
  });

  it('escapa HTML nos nomes', () => {
    const html = montarRelatorioHtml(baseInput({ turno: 'DIURNO' }));
    expect(html).toContain('BRAVO &amp; &lt;X&gt;');
    expect(html).not.toContain('BRAVO & <X>');
  });

  it('lista a FALTA na tabela de alterações com o motivo', () => {
    const html = montarRelatorioHtml(baseInput());
    const faltasSection = html.slice(html.indexOf('ALTERAÇÕES DE SERVIÇO ORDINÁRIO'));
    expect(faltasSection).toContain('222-2');
    expect(faltasSection).toContain('Atestado médico');
  });

  it('PJES/DIÁRIA vem como tabela pré-montada e FISCALIZAÇÃO com célula laranja', () => {
    const html = montarRelatorioHtml(baseInput());
    const pjes = html.slice(html.indexOf('PJES / DIÁRIA'));
    expect(pjes).toContain("GS'S EXTRA");
    expect(pjes).toContain('TOTAL DE LANÇAMENTOS');
    expect(html).toContain('background-color:#f4b183');
    expect(html).toContain('FISCAL DE XXXXX');
  });

  it('mantém POG como texto livre', () => {
    expect(montarRelatorioHtml(baseInput())).toContain('Pé Seguro no Marco Zero');
  });

  it('põe o número da OS na tabela da chamada da guarnição', () => {
    expect(montarRelatorioHtml(baseInput())).toContain('OS 123/2026');
  });

  it('renderiza a tabela GUARDA a partir das funções fixas', () => {
    const html = montarRelatorioHtml(baseInput());
    const guardaIdx = html.indexOf('>GUARDA<');
    expect(html.slice(guardaIdx)).toContain('Comandante da Guarda');
  });
});
