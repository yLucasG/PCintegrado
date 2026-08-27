import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('applies the dark class when preference is dark', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class when preference is light', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    service.setPreference('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists the preference to localStorage', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    expect(localStorage.getItem('pcintegrado-theme')).toBe('dark');
  });
});
