import { Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { ThemeService, ThemePreference } from '../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  imports: [NgClass],
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.css',
})
export class ThemeToggle {
  readonly themeService = inject(ThemeService);

  select(preference: ThemePreference): void {
    this.themeService.setPreference(preference);
  }
}
