import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  function runGuard() {
    return TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
  }

  it('allows navigation when there is a session', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { initialized$: of(true), currentSession: { user: { id: '1' } } },
        },
      ],
    });

    const result = await runGuard();
    expect(result).toBe(true);
  });

  it('redirects to /login when there is no session', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { initialized$: of(true), currentSession: null } },
      ],
    });

    const result = await runGuard();
    expect(result instanceof UrlTree).toBe(true);
  });
});
