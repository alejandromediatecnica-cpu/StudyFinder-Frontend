/**
 * Traducciones mínimas ES/EN.
 *
 * - El idioma activo es un `signal` (por eso las plantillas que usan `t(...)` se
 *   actualizan al cambiarlo, sin zone.js).
 * - Las claves son textos planos (`'nav.inicio'`); si falta una clave, `t()`
 *   devuelve la propia clave (útil para detectar olvidos).
 * - Se persiste la elección en `studyfinder_lang`.
 *
 * CÓMO AÑADIR UN TEXTO
 *   1. Añade la entrada en `TEXTS` con `es` y `en`.
 *   2. En la plantilla: `{{ t('mi.clave') }}` e inyecta `TranslationService`.
 * CÓMO AÑADIR UN IDIOMA
 *   - Amplía `Language`, añade la columna en cada entrada de `TEXTS` y el
 *     selector en `layout`.
 *
 * NOTA: no toda la UI usa este servicio; muchas páginas tienen textos en
 * español directamente en la plantilla.
 */

import { Injectable, signal } from '@angular/core';

export type Language = 'es' | 'en';

// Clave -> { es, en }.
type Translations = Record<string, Record<Language, string>>;

const TEXTS: Translations = {
  'nav.inicio': { es: 'Inicio', en: 'Home' },
  'nav.materias': { es: 'Materias', en: 'Subjects' },
  'nav.calendario': { es: 'Calendario', en: 'Calendar' },
  'nav.tareas': { es: 'Tareas', en: 'Tasks' },
  'nav.biblioteca': { es: 'Biblioteca', en: 'Library' },
  'nav.subir': { es: 'Subir', en: 'Upload' },
  'nav.mensajes': { es: 'Mensajes', en: 'Messages' },
  'nav.estadisticas': { es: 'Estadísticas', en: 'Statistics' },
  'landing.conoceEquipo': { es: 'Conoce al equipo', en: 'Meet the team' },
  'landing.equipo': { es: 'Equipo de desarrollo', en: 'Development team' },
  'landing.comenzar': { es: 'Comenzar ahora', en: 'Get started now' },
  'landing.entrar': { es: 'Entrar', en: 'Log in' },
  'landing.crearCuenta': { es: 'Crear cuenta', en: 'Create account' },
  'landing.irApp': { es: 'Ir a la aplicación', en: 'Go to app' },
};

@Injectable({ providedIn: 'root' })
export class TranslationService {
  /** Idioma activo; por defecto español. */
  readonly language = signal<Language>('es');

  /** Cambia el idioma y lo recuerda en localStorage. */
  setLanguage(language: Language): void {
    this.language.set(language);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('studyfinder_lang', language);
    }
  }

  /** Traduce una clave; si no existe, devuelve la clave tal cual. */
  t(key: string): string {
    return TEXTS[key]?.[this.language()] || key;
  }
}
