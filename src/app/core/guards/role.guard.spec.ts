import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';

describe('roleGuard', () => {
  function runGuard(roles: string[] | undefined) {
    const route = { data: { roles } } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => roleGuard(route, {} as any));
  }

  it('allows navigation when the perfil role is in the allowed list', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            initialized$: of(true),
            currentSession: { user: { id: '1' } },
            currentPerfil: { id: '1', role: 'ADMIN' },
          },
        },
      ],
    });

    const result = await runGuard(['ADMIN']);
    expect(result).toBe(true);
  });

  it('redirects to / when the perfil role is not allowed', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            initialized$: of(true),
            currentSession: { user: { id: '1' } },
            currentPerfil: { id: '1', role: 'PJES' },
          },
        },
      ],
    });

    const result = await runGuard(['ADMIN']);
    expect(result instanceof UrlTree).toBe(true);
  });

  it('redirects to /login when there is no session', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { initialized$: of(true), currentSession: null, currentPerfil: null },
        },
      ],
    });

    const result = await runGuard(['ADMIN']);
    expect(result instanceof UrlTree).toBe(true);
  });
});
