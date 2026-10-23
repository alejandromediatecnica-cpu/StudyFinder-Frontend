/**
 * Configuración del lado servidor (SSR).
 *
 * `mergeApplicationConfig` combina la configuración del navegador
 * (`appConfig`) con los proveedores exclusivos de servidor. Así ambos entornos
 * comparten router, HttpClient y hidratación, y el servidor añade el motor de
 * renderizado.
 *
 * `withRoutes(serverRoutes)` aplica el modo de render por ruta definido en
 * `app.routes.server.ts` (hoy: prerender de todas las rutas).
 *
 * Este archivo lo consume `main.server.ts`, no `main.ts`.
 */

import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes))
  ]
};

// Configuración final usada al arrancar en el servidor.
export const config = mergeApplicationConfig(appConfig, serverConfig);
