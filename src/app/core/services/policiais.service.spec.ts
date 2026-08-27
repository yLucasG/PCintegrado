import { TestBed } from '@angular/core/testing';
import { PoliciaisService } from './policiais.service';
import { SupabaseService } from './supabase.service';

describe('PoliciaisService', () => {
  it('lists policiais ordered by nome_guerra', async () => {
    const rows = [{ matricula: '127934-3', graduacao: 'SD', nome_guerra: 'CARLOS MATIAS', telefone: null, companhia_id: null }];
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

    const service = TestBed.inject(PoliciaisService);
    const result = await service.listPoliciais();
    expect(result).toEqual(rows as any);
  });

  it('creates a policial via insert', async () => {
    const created = { matricula: '999999-9', graduacao: 'SD', nome_guerra: 'TESTE', telefone: null, companhia_id: null };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(PoliciaisService);
    const result = await service.createPolicial({
      matricula: '999999-9',
      graduacao: 'SD',
      nome_guerra: 'TESTE',
    });

    expect(insertSpy).toHaveBeenCalledWith({
      matricula: '999999-9',
      graduacao: 'SD',
      nome_guerra: 'TESTE',
      telefone: null,
      companhia_id: null,
    });
    expect(result.matricula).toBe('999999-9');
  });

  it('removes a policial by matricula', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(PoliciaisService);
    await service.removePolicial('999999-9');

    expect(eqSpy).toHaveBeenCalledWith('matricula', '999999-9');
  });
});
