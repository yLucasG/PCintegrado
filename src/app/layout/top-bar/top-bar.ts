import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

const PERFIS_COM_ACESSO_ESCALAS = ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'];
const PERFIS_COM_ACESSO_RELATORIO_SEI = ['ADMIN', 'PC_LANCAMENTO'];
const PERFIS_COM_ACESSO_POLICIAIS = ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT', 'PJES'];
const PERFIS_COM_ACESSO_ESCALA_PJES = ['PJES', 'ADMIN'];

@Component({
  selector: 'app-top-bar',
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  podeGerenciarEscalas(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_ESCALAS.includes(role);
  }

  podeGerarRelatorioSei(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_RELATORIO_SEI.includes(role);
  }

  podeVerPoliciais(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_POLICIAIS.includes(role);
  }

  podeVerEscalaPjes(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_ESCALA_PJES.includes(role);
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/login']);
  }
}
