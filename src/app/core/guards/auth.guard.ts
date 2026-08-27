import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(authService.initialized$.pipe(filter(Boolean)));

  if (authService.currentSession) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
