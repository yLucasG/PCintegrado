import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-top-bar',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  readonly authService = inject(AuthService);

  signOut(): void {
    void this.authService.signOut();
  }
}
