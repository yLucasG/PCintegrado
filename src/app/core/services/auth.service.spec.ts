import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

describe('AuthService', () => {
  function buildSupabaseStub(sessionUserId: string | null) {
    const session = sessionUserId ? { user: { id: sessionUserId } } : null;
    return {
      client: {
        auth: {
          getSession: () => Promise.resolve({ data: { session } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
          signOut: vi.fn().mockResolvedValue({ error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: sessionUserId ? { id: sessionUserId, role: 'ADMIN' } : null,
                }),
            }),
          }),
        }),
      },
    };
  }

  it('marks itself initialized with no session when getSession resolves empty', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: buildSupabaseStub(null) }],
    });
    const service = TestBed.inject(AuthService);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.currentSession).toBeNull();
    expect(service.currentPerfil).toBeNull();
  });

  it('loads the perfil for an existing session', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: buildSupabaseStub('user-1') }],
    });
    const service = TestBed.inject(AuthService);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.currentSession?.user.id).toBe('user-1');
    expect(service.currentPerfil?.role).toBe('ADMIN');
  });
});
