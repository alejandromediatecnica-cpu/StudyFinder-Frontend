/**
 * Modo de renderizado por ruta en el servidor.
 *
 * `'**'` + `RenderMode.Prerender` significa: TODAS las rutas se prerenderizan
 * en tiempo de build (se genera HTML estático en `dist/.../browser`). Es lo que
 * produce las 11 páginas estáticas de `npm run build`.
 *
 * CONSECUENCIA: durante el prerender no existe `localStorage`, así que el HTML
 * se genera como "deslogueado". El cliente hidrata y, con la sesión guardada,
 * `authGuard` decide si entra o redirige a /login.
 *
 * CÓMO RENDERIZAR UNA RUTA EN CADA PETICIÓN (SSR dinámico):
 *   { path: 'mensajes', renderMode: RenderMode.Server }
 * CÓMO DESACTIVAR EL SSR PARA UNA RUTA:
 *   { path: 'x', renderMode: RenderMode.Client }
 */

import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Comodín: aplica a cualquier ruta no listada antes.
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
