import { TestBed } from '@angular/core/testing';
import { AdminUsersService } from './admin-users.service';
import { SupabaseService } from './supabase.service';

describe('AdminUsersService', () => {
  it('lists perfis via a select on perfis_usuarios', async () => {
    const rows = [{ id: '1', role: 'ADMIN' }];
    const supabaseStub = {
      client: {
        from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
        functions: { invoke: vi.fn() },
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(AdminUsersService);
    const result = await service.listPerfis();
    expect(result).toEqual(rows as any);
  });

  it('creates a user via the create-user Edge Function', async () => {
    const invokeSpy = vi
      .fn()
      .mockResolvedValue({ data: { id: 'u1', email: 'a@b.com', role: 'ADMIN' }, error: null });
    const supabaseStub = {
      client: { functions: { invoke: invokeSpy } },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(AdminUsersService);
    const result = await service.createUser({ email: 'a@b.com', password: 'x', role: 'ADMIN' });

    expect(invokeSpy).toHaveBeenCalledWith('create-user', {
      body: { email: 'a@b.com', password: 'x', role: 'ADMIN' },
    });
    expect(result.id).toBe('u1');
  });
});
