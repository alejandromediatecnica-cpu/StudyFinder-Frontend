/**
 * Servidor Node de producción (SSR + estáticos + configuración en runtime).
 *
 * Orden de arranque:
 *  1. Carga `.env` (solo si existe) para desarrollo local.
 *  2. Crea la app de Express y el motor de Angular SSR.
 *  3. `GET /env.js`: expone `API_URL` al navegador como
 *     `window.__STUDYFINDER_ENV__.apiUrl` (ver `config/runtime-config.ts`).
 *     Debe ir ANTES del estático para tener prioridad y `no-store` para que un
 *     cambio de backend no quede cacheado.
 *  4. Sirve los estáticos de `dist/.../browser` con caché de 1 año (los
 *     nombres llevan hash, así que es seguro).
 *  5. Todo lo demás lo renderiza Angular (SSR/prerender).
 *  6. Escucha en `PORT` (4000 por defecto) si se ejecuta como programa
 *     principal o bajo PM2.
 *
 * CÓMO CAMBIAR LA URL DEL BACKEND EN PRODUCCIÓN
 *   - Define `API_URL` en el entorno del servidor; NO hace falta reconstruir.
 * CÓMO AÑADIR OTRA VARIABLE AL NAVEGADOR (p. ej. feature flags)
 *   - Añádela al objeto de `JSON.stringify` en `/env.js` y al tipo
 *     `RuntimeConfig`.
 */

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// En local se leen las variables de `.env`; en el hosting llegan del entorno del proceso,
// que tiene prioridad. Los hosts permitidos salen de NG_ALLOWED_HOSTS (ver .env.example).
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Carpeta de salida del build del navegador (assets y bundles con hash).
const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Configuración en tiempo de ejecución para el navegador (se explica arriba).
app.get('/env.js', (_req, res) => {
  const apiUrl = process.env['API_URL'] ?? '';
  res.type('application/javascript');
  // `no-store`: un despliegue nuevo debe verse inmediatamente.
  res.setHeader('Cache-Control', 'no-store');
  res.send(`window.__STUDYFINDER_ENV__ = ${JSON.stringify({ apiUrl })};`);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',        // assets con hash: cacheables un año
    index: false,        // nunca servir index.html desde aquí (lo hace Angular)
    redirect: false,     // sin redirecciones automáticas de directorios
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 *
 * `angularApp.handle(req)` devuelve una `Response` web o null. Si es null, se
 * pasa al siguiente middleware (`next`). Los errores van al manejador de
 * Express vía `catch(next)`.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Servidor SSR escuchando en el puerto ${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 * No arranca un puerto propio: lo reutiliza `ng serve` y el build de prerender.
 */
export const reqHandler = createNodeRequestHandler(app);
