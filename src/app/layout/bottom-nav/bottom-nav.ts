import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

const PERFIS_COM_ACESSO_ESCALAS = ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'];

@Component({
  selector: 'app-bottom-nav',
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.css',
})
export class BottomNav {
  readonly authService = inject(AuthService);

  podeGerenciarEscalas(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_ESCALAS.includes(role);
  }
}
