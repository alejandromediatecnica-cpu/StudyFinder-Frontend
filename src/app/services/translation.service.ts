import { Injectable, signal } from '@angular/core';

export type Language = 'es' | 'en';

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
  readonly language = signal<Language>('es');

  setLanguage(language: Language): void {
    this.language.set(language);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('studyfinder_lang', language);
    }
  }

  t(key: string): string {
    return TEXTS[key]?.[this.language()] || key;
  }
}
