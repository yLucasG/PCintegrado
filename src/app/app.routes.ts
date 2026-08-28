import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page/dashboard-page').then(
            (m) => m.DashboardPage,
          ),
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('./features/admin/admin-users-page/admin-users-page').then(
            (m) => m.AdminUsersPage,
          ),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
      },
      {
        path: 'lancamento',
        loadComponent: () =>
          import('./features/painel-pc/painel-pc-page/painel-pc-page').then((m) => m.PainelPcPage),
      },
      {
        path: 'policiais',
        loadComponent: () =>
          import('./features/policiais/policiais-page/policiais-page').then((m) => m.PoliciaisPage),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT', 'PJES'] },
      },
      {
        path: 'escala-mensal',
        loadComponent: () =>
          import('./features/escala-mensal/escala-mensal-page/escala-mensal-page').then(
            (m) => m.EscalaMensalPage,
          ),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'] },
      },
      {
        path: 'relatorio-sei',
        loadComponent: () =>
          import('./features/relatorio-sei/relatorio-sei-page/relatorio-sei-page').then(
            (m) => m.RelatorioSeiPage,
          ),
        canActivate: [roleGuard],
        data: { roles: ['PC_LANCAMENTO', 'ADMIN'] },
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page/login-page').then((m) => m.LoginPage),
  },
  { path: '**', redirectTo: '' },
];
