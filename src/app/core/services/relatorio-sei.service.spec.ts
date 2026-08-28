import { TestBed } from '@angular/core/testing';
import { RelatorioSeiService } from './relatorio-sei.service';
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
