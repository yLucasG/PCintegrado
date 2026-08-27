import { TestBed } from '@angular/core/testing';
import { LancamentoService } from './lancamento.service';
import { SupabaseService } from './supabase.service';

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
          select: () => ({
            eq: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
          }),
        }),
      },
    };
  }

  it('marks a policial as FALTA when a matching lancamento_faltas row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [{ id: 'falta1', policial_matricula: '127934-3', motivo: 'Atestado médico' }],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
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
      lancamento_permutas: [
        { policial_substituido_matricula: '127934-3', policial_substituto_matricula: '999999-9' },
      ],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('SUBSTITUIDO');
    expect(result[0].detalhe).toContain('999999-9');
  });

  it('marks a policial as ATRASADO when a matching lancamento_atrasos row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [{ policial_matricula: '127934-3', motivo: 'Trânsito' }],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('ATRASADO');
    expect(result[0].detalhe).toBe('Trânsito');
  });

  it('defaults to PREVISTO with a null detalheId when there is no matching deviation row', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
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

  it('registers an atraso via insert on lancamento_atrasos', async () => {
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
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ policial_matricula: '127934-3', horario_chegada: '07:15' }),
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
});
