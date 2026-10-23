import { Injectable, signal } from '@angular/core';

export type Theme = 'dark';

const STORAGE_KEY = 'studyfinder_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('dark');

  constructor() {
    this.apply('dark');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'dark');
    }
  }

  isDark(): boolean {
    return true;
  }

  private apply(theme: Theme): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.setAttribute('data-theme', theme);
  }
}
