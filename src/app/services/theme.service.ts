/**
 * Tema visual. La app solo tiene tema oscuro (decisión de producto).
 *
 * - Aplica `data-theme="dark"` en `<html>`, que activa las variables CSS de
 *   `src/styles.css`.
 * - Guarda `studyfinder_theme` en localStorage para coherencia, aunque hoy el
 *   valor siempre es 'dark'.
 *
 * CÓMO AÑADIR TEMA CLARO
 *  1. Amplía `Theme` a `'dark' | 'light'`.
 *  2. Añade el bloque `:root[data-theme='light']` en `styles.css`.
 *  3. Sustituye `apply('dark')` por `apply(this.theme())` y crea un
 *     `toggle()` que actualice el signal y el atributo.
 */

import { Injectable, signal } from '@angular/core';

// Hoy solo existe un tema; el tipo deja abierta la ampliación.
export type Theme = 'dark';

const STORAGE_KEY = 'studyfinder_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Tema activo (signal por si algún componente lo consume en plantilla). */
  readonly theme = signal<Theme>('dark');

  constructor() {
    // Se aplica en el constructor para que el atributo exista antes del primer
    // pintado. En SSR `document` no existe: `apply` lo comprueba.
    this.apply('dark');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'dark');
    }
  }

  /** Siempre true mientras solo exista el tema oscuro. */
  isDark(): boolean {
    return true;
  }

  /** Escribe `data-theme` en `<html>`; no hace nada en SSR. */
  private apply(theme: Theme): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.setAttribute('data-theme', theme);
  }
}
