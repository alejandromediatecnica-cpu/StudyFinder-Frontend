/**
 * Punto de entrada del navegador.
 *
 * Arranca el componente raíz con la configuración de `app.config.ts`. Si el
 * arranque falla (p. ej. un error en un provider), se registra en consola.
 *
 * No se toca al añadir funcionalidad: los cambios van en `app.config.ts`
 * (providers) o en `app.ts` (raíz).
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
