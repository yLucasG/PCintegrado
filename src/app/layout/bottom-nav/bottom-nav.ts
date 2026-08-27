import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-bottom-nav',
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.css',
})
export class BottomNav {
  readonly authService = inject(AuthService);
}
