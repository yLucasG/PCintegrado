import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService, RoleUsuario } from '../services/auth.service';

export const roleGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(authService.initialized$.pipe(filter(Boolean)));

  if (!authService.currentSession) {
    return router.createUrlTree(['/login']);
  }

  const allowedRoles = route.data['roles'] as RoleUsuario[] | undefined;
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  const perfil = authService.currentPerfil;
  if (perfil && allowedRoles.includes(perfil.role)) {
    return true;
  }

  return router.createUrlTree(['/']);
};
