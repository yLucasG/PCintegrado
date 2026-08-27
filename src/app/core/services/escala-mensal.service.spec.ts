import { TestBed } from '@angular/core/testing';
import { EscalaMensalService } from './escala-mensal.service';
import { SupabaseService } from './supabase.service';

describe('EscalaMensalService', () => {
  it('lists escala mensal rows', async () => {
    const rows = [
      {
        id: 'e1',
        guarnicao_id: 'g1',
        policial_matricula: '127934-3',
        funcao: 'CMT',
        horario_inicio: '06:00:00',
        horario_fim: '18:00:00',
        tipo_recorrencia: 'PARES',
        dias_especificos: null,
        vigencia_inicio: '2026-08-01',
        vigencia_fim: null,
        escala_origem: 'Escala 3ª CPM Agosto 2026',
      },
    ];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(EscalaMensalService);
    const result = await service.listEscalaMensal();
    expect(result).toEqual(rows as any);
  });

  it('creates an escala mensal row via insert', async () => {
    const created = {
      id: 'e2',
      guarnicao_id: 'g1',
      policial_matricula: '127934-3',
      funcao: 'CMT',
      horario_inicio: '06:00:00',
      horario_fim: '18:00:00',
      tipo_recorrencia: 'PARES',
      dias_especificos: null,
      vigencia_inicio: '2026-08-01',
      vigencia_fim: null,
      escala_origem: null,
    };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(EscalaMensalService);
    const result = await service.createEscalaMensal({
      guarnicao_id: 'g1',
      policial_matricula: '127934-3',
      funcao: 'CMT',
      horario_inicio: '06:00:00',
      horario_fim: '18:00:00',
      tipo_recorrencia: 'PARES',
      vigencia_inicio: '2026-08-01',
    });

    expect(result.id).toBe('e2');
  });
});
