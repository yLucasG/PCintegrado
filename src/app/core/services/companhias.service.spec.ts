import { TestBed } from '@angular/core/testing';
import { CompanhiasService } from './companhias.service';
import { SupabaseService } from './supabase.service';

describe('CompanhiasService', () => {
  it('lists companhias ordered by name', async () => {
    const rows = [{ id: '1', nome: '1ª CPM' }];
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

    const service = TestBed.inject(CompanhiasService);
    const result = await service.listCompanhias();
    expect(result).toEqual(rows as any);
  });
});
