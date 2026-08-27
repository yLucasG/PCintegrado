import { TestBed } from '@angular/core/testing';
import { GuarnicoesService } from './guarnicoes.service';
import { SupabaseService } from './supabase.service';

describe('GuarnicoesService', () => {
  it('lists guarnicoes ordered by nome', async () => {
    const rows = [
      { id: 'g1', nome: 'GT 16332 - Boa Vista', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'Boa Vista', prefixos: ['16332'] },
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

    const service = TestBed.inject(GuarnicoesService);
    const result = await service.listGuarnicoes();
    expect(result).toEqual(rows as any);
  });

  it('creates a guarnicao via insert', async () => {
    const created = { id: 'g2', nome: 'GT teste', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: null, prefixos: ['1'] };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(GuarnicoesService);
    const result = await service.createGuarnicao({
      nome: 'GT teste',
      tipo: 'GT_TATICO',
      companhia_id: 'c1',
      prefixos: ['1'],
    });

    expect(result.id).toBe('g2');
  });
});
