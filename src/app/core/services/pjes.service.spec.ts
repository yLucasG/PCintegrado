import { TestBed } from '@angular/core/testing';
import { PjesService } from './pjes.service';
import { SupabaseService } from './supabase.service';

describe('PjesService', () => {
  it('lists escala pjes for a day, mapping snake_case to camelCase', async () => {
    const rows = [
      {
        id: 'e1', data: '2026-08-19', gt_rotulo: 'GT 16100 - SUPERVISÃO', funcao: 'CMT',
        graduacao: 'TC', matricula: '102505-8', nome_guerra: 'GRISI', telefone: '81986631816',
        horario_inicio: '16:00:00', horario_fim: '00:00:00', origem: 'PDF', observacao: null,
      },
    ];
    const eqSpy = vi.fn().mockResolvedValue({ data: rows, error: null });
    const supabaseStub = {
      client: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: eqSpy }) }) }) }) },
    };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    const result = await service.listEscalaPjesDoDia('2026-08-19');
    expect(result[0]).toEqual({
      id: 'e1', data: '2026-08-19', gtRotulo: 'GT 16100 - SUPERVISÃO', funcao: 'CMT',
      graduacao: 'TC', matricula: '102505-8', nomeGuerra: 'GRISI', telefone: '81986631816',
      horarioInicio: '16:00:00', horarioFim: '00:00:00', origem: 'PDF', observacao: null,
    });
  });

  it('inserts a batch of linhas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.inserirLinhas([
      { data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', nome_guerra: 'GRISI', horario_inicio: '16:00', horario_fim: '00:00', origem: 'MANUAL' },
    ]);
    expect(insertSpy).toHaveBeenCalledWith([
      expect.objectContaining({ data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', nome_guerra: 'GRISI', origem: 'MANUAL', graduacao: null, matricula: null, telefone: null, observacao: null }),
    ]);
  });

  it('substituirDiaImportado deletes PDF rows for the day then inserts', async () => {
    const eqOrigem = vi.fn().mockResolvedValue({ error: null });
    const eqData = vi.fn().mockReturnValue({ eq: eqOrigem });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqData });
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy, insert: insertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.substituirDiaImportado('2026-08-19', [
      { data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', nome_guerra: 'GRISI', horario_inicio: '16:00', horario_fim: '00:00', origem: 'PDF' },
    ]);
    expect(eqData).toHaveBeenCalledWith('data', '2026-08-19');
    expect(eqOrigem).toHaveBeenCalledWith('origem', 'PDF');
    expect(insertSpy).toHaveBeenCalled();
  });

  it('registrarPresencaPjes upserts on escala_pjes_id', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ upsert: upsertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.registrarPresencaPjes('e1', 'FALTA');
    expect(upsertSpy).toHaveBeenCalledWith(
      { escala_pjes_id: 'e1', status: 'FALTA', horario_chegada: null, motivo: null, atualizado_em: expect.any(String) },
      { onConflict: 'escala_pjes_id' },
    );
  });

  it('listPjesRosterDoDia joins presenca status onto escala rows', async () => {
    const escalaRows = [
      { id: 'e1', data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', graduacao: 'TC', matricula: '1', nome_guerra: 'GRISI', telefone: null, horario_inicio: '16:00:00', horario_fim: '00:00:00', origem: 'PDF', observacao: null },
      { id: 'e2', data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'MOT', graduacao: 'SD', matricula: '2', nome_guerra: 'DIAS', telefone: null, horario_inicio: '16:00:00', horario_fim: '00:00:00', origem: 'PDF', observacao: null },
    ];
    const presRows = [{ escala_pjes_id: 'e1', status: 'FALTA', horario_chegada: null, motivo: 'x' }];
    let call = 0;
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => {
            call++;
            if (call === 1) return { eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: escalaRows, error: null }) }) }) };
            return { in: () => Promise.resolve({ data: presRows, error: null }) };
          },
        }),
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    const result = await service.listPjesRosterDoDia('2026-08-19');
    expect(result.find((r) => r.escalaPjesId === 'e1')?.status).toBe('FALTA');
    expect(result.find((r) => r.escalaPjesId === 'e2')?.status).toBe('PREVISTO');
  });

  it('removerLinha deletes by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.removerLinha('e1');
    expect(eqSpy).toHaveBeenCalledWith('id', 'e1');
  });
});
