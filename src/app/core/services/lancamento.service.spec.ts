import { TestBed } from '@angular/core/testing';
import { LancamentoService, turnoAtivoEm } from './lancamento.service';
import { SupabaseService } from './supabase.service';

describe('turnoAtivoEm', () => {
  it('turno normal: ativo dentro de [inicio, fim), inativo no fim', () => {
    expect(turnoAtivoEm('06:00:00', '18:00:00', '06:00')).toBe(true);
    expect(turnoAtivoEm('06:00:00', '18:00:00', '17:10')).toBe(true);
    expect(turnoAtivoEm('06:00:00', '18:00:00', '18:00')).toBe(false);
    expect(turnoAtivoEm('06:00:00', '18:00:00', '05:59')).toBe(false);
    expect(turnoAtivoEm('06:00:00', '18:00:00', '22:00')).toBe(false);
  });

  it('a viatura das 05h já saiu às 17:10, a das 06h ainda está ativa', () => {
    expect(turnoAtivoEm('05:00', '17:00', '17:10')).toBe(false);
    expect(turnoAtivoEm('06:00', '18:00', '17:10')).toBe(true);
  });

  it('turno que vira a meia-noite: ativo antes e depois de 00h', () => {
    expect(turnoAtivoEm('18:00:00', '06:00:00', '18:00')).toBe(true);
    expect(turnoAtivoEm('18:00:00', '06:00:00', '23:00')).toBe(true);
    expect(turnoAtivoEm('18:00:00', '06:00:00', '02:00')).toBe(true);
    expect(turnoAtivoEm('18:00:00', '06:00:00', '05:59')).toBe(true);
    expect(turnoAtivoEm('18:00:00', '06:00:00', '06:00')).toBe(false);
    expect(turnoAtivoEm('18:00:00', '06:00:00', '12:00')).toBe(false);
  });

  it('turno de 24h (inicio === fim) está sempre ativo', () => {
    expect(turnoAtivoEm('06:00:00', '06:00:00', '03:00')).toBe(true);
    expect(turnoAtivoEm('06:00:00', '06:00:00', '15:00')).toBe(true);
  });
});

describe('LancamentoService', () => {
  const rosterRpcRow = {
    id: 'em1',
    guarnicao_id: 'g1',
    policial_matricula: '127934-3',
    funcao: 'CMT',
    horario_inicio: '06:00:00',
    horario_fim: '18:00:00',
  };

  function buildSupabaseStub(tables: Record<string, unknown[]>) {
    return {
      client: {
        rpc: vi.fn().mockResolvedValue({ data: [rosterRpcRow], error: null }),
        from: (table: string) => ({
          select: () => {
            const result = Promise.resolve({ data: tables[table] ?? [], error: null });
            return {
              eq: () => result,
              lte: () => ({ gte: () => result }),
            };
          },
        }),
      },
    };
  }

  it('marks a policial as FALTA when a matching lancamento_faltas row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [{ id: 'falta1', policial_matricula: '127934-3', motivo: 'Atestado médico' }],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('FALTA');
    expect(result[0].detalhe).toBe('Atestado médico');
    expect(result[0].detalheId).toBe('falta1');
  });

  it('marks a policial as SUBSTITUIDO when a matching lancamento_permutas row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [],
      lancamento_permutas: [
        { policial_substituido_matricula: '127934-3', policial_substituto_matricula: '999999-9' },
      ],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('SUBSTITUIDO');
    expect(result[0].detalhe).toContain('999999-9');
  });

  it('marks a policial as REMANEJADO with a detalheId when a matching lancamento_remanejamentos row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [{ id: 'remanejamento1', policial_matricula: '127934-3', destino: 'GT 16332' }],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('REMANEJADO');
    expect(result[0].detalhe).toBe('GT 16332');
    expect(result[0].detalheId).toBe('remanejamento1');
  });

  it('marks a policial as ATRASADO when a matching lancamento_atrasos row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [{ policial_matricula: '127934-3', motivo: 'Trânsito' }],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('ATRASADO');
    expect(result[0].detalhe).toBe('Trânsito');
  });

  it('marks a policial as LICENCA when a lancamento_licencas row overlaps the date, taking precedence over FALTA', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [{ id: 'falta1', policial_matricula: '127934-3', motivo: 'Não deveria aparecer' }],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [
        { id: 'licenca1', policial_matricula: '127934-3', data_inicio: '2026-08-01', data_fim: '2026-08-10' },
      ],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('LICENCA');
    expect(result[0].detalhe).toBe('2026-08-01 a 2026-08-10');
    expect(result[0].detalheId).toBe('licenca1');
  });

  it('defaults to PREVISTO with a null detalheId when there is no matching deviation row', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('PREVISTO');
    expect(result[0].detalhe).toBeNull();
    expect(result[0].detalheId).toBeNull();
  });

  it('registers a falta via insert on lancamento_faltas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarFalta({ data: '2026-08-04', policial_matricula: '127934-3', motivo: 'Doente' });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: '2026-08-04', policial_matricula: '127934-3', motivo: 'Doente' }),
    );
  });

  it('registers an atraso with an optional sei_numero via insert on lancamento_atrasos', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarAtraso({
      data: '2026-08-04',
      policial_matricula: '127934-3',
      horario_chegada: '07:15',
      sei_numero: '44900000',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ policial_matricula: '127934-3', horario_chegada: '07:15', sei_numero: '44900000' }),
    );
  });

  it('registers a permuta via insert on lancamento_permutas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarPermuta({
      data: '2026-08-04',
      policial_substituto_matricula: '999999-9',
      policial_substituido_matricula: '127934-3',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policial_substituto_matricula: '999999-9',
        policial_substituido_matricula: '127934-3',
      }),
    );
  });

  it('registers a folga via insert on lancamento_folgas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarFolga({ data: '2026-08-04', policial_matricula: '127934-3' });

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ policial_matricula: '127934-3' }));
  });

  it('registers a remanejamento via insert on lancamento_remanejamentos', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarRemanejamento({
      data: '2026-08-04',
      policial_matricula: '127934-3',
      destino: 'OP. Paz',
    });

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ destino: 'OP. Paz' }));
  });

  it('registers a licenca via insert on lancamento_licencas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarLicenca({
      policial_matricula: '127934-3',
      data_inicio: '2026-08-04',
      data_fim: '2026-08-06',
      sei_numero: '44965596',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policial_matricula: '127934-3',
        data_inicio: '2026-08-04',
        data_fim: '2026-08-06',
        sei_numero: '44965596',
      }),
    );
  });

  it('removes a falta by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerFalta('falta1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'falta1');
  });

  it('removes an atraso by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerAtraso('atraso1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'atraso1');
  });

  it('removes a remanejamento by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerRemanejamento('remanejamento1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'remanejamento1');
  });

  it('removes a licenca by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerLicenca('licenca1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'licenca1');
  });

  it('lists baixas for a given day, including seiNumero', async () => {
    const rows = [
      { id: 'baixa1', guarnicao_id: 'g1', horario_inicio: '06:00:00', motivo: 'Sem efetivo', sei_numero: null },
    ];
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

    const service = TestBed.inject(LancamentoService);
    const result = await service.listBaixasDoDia('2026-08-04');

    expect(result).toEqual([
      { id: 'baixa1', guarnicaoId: 'g1', horarioInicio: '06:00:00', motivo: 'Sem efetivo', seiNumero: null },
    ]);
  });

  it('registers a baixa with an optional sei_numero via insert on lancamento_baixas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarBaixa({
      data: '2026-08-04',
      guarnicao_id: 'g1',
      horario_inicio: '06:00:00',
      sei_numero: '44900001',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ guarnicao_id: 'g1', horario_inicio: '06:00:00', sei_numero: '44900001' }),
    );
  });

  it('removes a baixa by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerBaixa('baixa1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'baixa1');
  });

  it('lists OS entries for a given day, including situacao and local', async () => {
    const rows = [
      {
        id: 'os1',
        guarnicao_id: 'g1',
        horario_inicio: '06:00:00',
        numero_os: 'OS 123/2026',
        situacao: 'Apoio a ocorrência',
        local: 'Boa Vista',
      },
    ];
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

    const service = TestBed.inject(LancamentoService);
    const result = await service.listOsDoDia('2026-08-04');

    expect(result).toEqual([
      {
        id: 'os1',
        guarnicaoId: 'g1',
        horarioInicio: '06:00:00',
        numeroOs: 'OS 123/2026',
        situacao: 'Apoio a ocorrência',
        local: 'Boa Vista',
      },
    ]);
  });

  it('registers an OS with optional situacao/local via insert on lancamento_os', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarOs({
      data: '2026-08-04',
      guarnicao_id: 'g1',
      horario_inicio: '06:00:00',
      numero_os: 'OS 123/2026',
      situacao: 'Apoio a ocorrência',
      local: 'Boa Vista',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        guarnicao_id: 'g1',
        numero_os: 'OS 123/2026',
        situacao: 'Apoio a ocorrência',
        local: 'Boa Vista',
      }),
    );
  });

  it('removes an OS by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerOs('os1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'os1');
  });

  it('lists funcoes fixas for a given day, mapping snake_case fields to camelCase', async () => {
    const rows = [
      {
        id: 'ff1',
        grupo: 'GUARDA',
        funcao: 'Comandante',
        horario_inicio: '06:00:00',
        horario_fim: '06:00:00',
        policial_matricula: '127934-3',
        fone_cmt: '(81) 99999-0000',
      },
    ];
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

    const service = TestBed.inject(LancamentoService);
    const result = await service.listFuncoesFixasDoDia('2026-08-04');

    expect(result).toEqual([
      {
        id: 'ff1',
        grupo: 'GUARDA',
        funcao: 'Comandante',
        horarioInicio: '06:00:00',
        horarioFim: '06:00:00',
        policialMatricula: '127934-3',
        foneCmt: '(81) 99999-0000',
      },
    ]);
  });

  it('registers a funcao fixa via insert on lancamento_funcoes_fixas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarFuncaoFixa({
      data: '2026-08-04',
      grupo: 'PC_BPM',
      funcao: 'Despachante',
      horario_inicio: '06:00:00',
      horario_fim: '12:00:00',
      policial_matricula: '127934-3',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ grupo: 'PC_BPM', funcao: 'Despachante', policial_matricula: '127934-3' }),
    );
  });

  it('removes a funcao fixa by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerFuncaoFixa('ff1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'ff1');
  });
});
