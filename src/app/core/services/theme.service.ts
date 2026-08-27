import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pcintegrado-theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable (e.g. private mode) — fall back to system
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(readStoredPreference());

  constructor() {
    this.applyTheme();

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener('change', () => {
          if (this.preference() === 'system') {
            this.applyTheme();
          }
        });
      } catch {
        // matchMedia not fully supported here — system preference just won't auto-update
      }
    }
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.applyTheme();
  }

  private applyTheme(): void {
    const preference = this.preference();
    const isDark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore
    }
  }
}
