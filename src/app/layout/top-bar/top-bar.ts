import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

const PERFIS_COM_ACESSO_ESCALAS = ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'];
const PERFIS_COM_ACESSO_RELATORIO_SEI = ['ADMIN', 'PC_LANCAMENTO'];

@Component({
  selector: 'app-top-bar',
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  readonly authService = inject(AuthService);

  podeGerenciarEscalas(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_ESCALAS.includes(role);
  }

  podeGerarRelatorioSei(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_RELATORIO_SEI.includes(role);
  }

  signOut(): void {
    void this.authService.signOut();
  }
}
