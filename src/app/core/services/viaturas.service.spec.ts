import { TestBed } from '@angular/core/testing';
import { ViaturasService } from './viaturas.service';
import { SupabaseService } from './supabase.service';

describe('ViaturasService', () => {
  it('lists viaturas ordered by prefixo', async () => {
    const rows = [{ prefixo: '16331', area_atuacao: 'Santo Amaro' }];
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

    const service = TestBed.inject(ViaturasService);
    const result = await service.listViaturas();
    expect(result).toEqual(rows as any);
  });

  it('creates a viatura via insert', async () => {
    const created = { prefixo: '99999', area_atuacao: 'Teste' };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(ViaturasService);
    const result = await service.createViatura({ prefixo: '99999', area_atuacao: 'Teste' });

    expect(result.prefixo).toBe('99999');
  });
});
