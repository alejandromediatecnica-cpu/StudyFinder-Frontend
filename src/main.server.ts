/**
 * Punto de entrada del servidor (SSR).
 *
 * Angular lo importa y llama al `bootstrap` exportado con un `BootstrapContext`
 * (que contiene el `document`/DOM del render). Usa `app.config.server.ts`, que
 * añade el renderizado de servidor a la configuración común.
 *
 * No se toca al añadir funcionalidad; los proveedores de servidor van en
 * `app.config.server.ts`.
 */

import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

// Se ejecuta una vez por petición/render.
const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(App, config, context);

export default bootstrap;
