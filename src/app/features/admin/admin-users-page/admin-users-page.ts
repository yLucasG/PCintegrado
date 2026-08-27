import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminUsersService, PerfilUsuarioRow } from '../../../core/services/admin-users.service';
import { RoleUsuario } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-users-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users-page.html',
  styleUrl: './admin-users-page.css',
})
export class AdminUsersPage {
  private readonly adminUsersService = inject(AdminUsersService);

  readonly perfis = signal<PerfilUsuarioRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly creating = signal(false);

  readonly roles: RoleUsuario[] = [
    'ADMIN',
    'CIA_1',
    'CIA_2',
    'CIA_3',
    'PCTAT',
    'PJES',
    'PC_LANCAMENTO',
  ];

  readonly newEmail = signal('');
  readonly newPassword = signal('');
  readonly newRole = signal<RoleUsuario>('CIA_1');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.perfis.set(await this.adminUsersService.listPerfis());
    } catch {
      this.errorMessage.set('Não foi possível carregar os usuários.');
    } finally {
      this.loading.set(false);
    }
  }

  async onCreateUser(): Promise<void> {
    this.creating.set(true);
    this.errorMessage.set(null);
    try {
      await this.adminUsersService.createUser({
        email: this.newEmail(),
        password: this.newPassword(),
        role: this.newRole(),
      });
      this.newEmail.set('');
      this.newPassword.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar o usuário.');
    } finally {
      this.creating.set(false);
    }
  }
}
