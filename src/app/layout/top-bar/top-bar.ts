import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-top-bar',
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  readonly authService = inject(AuthService);

  signOut(): void {
    void this.authService.signOut();
  }
}
