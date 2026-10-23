/**
 * Resolución de la URL base de la API en runtime.
 *
 * Cadena de prioridad:
 *   Navegador:  window.__STUDYFINDER_ENV__.apiUrl  (lo escribe /env.js, ver server.ts)
 *   Servidor:   process.env.API_URL               (SSR/prerender)
 *   Respaldo:   environment.apiUrl                (compilado; localhost:8000)
 *
 * Con esto se puede apuntar a otro backend sin reconstruir el frontend:
 * basta con definir `API_URL` en el host.
 *
 * CÓMO USARLA
 *   - En los servicios: `apiEndpoint('/auth/login')` para una URL absoluta.
 *   - Nunca escribas `http://localhost:8000` en un servicio nuevo.
 * CÓMO AÑADIR OTRA VARIABLE DE ENTORNO
 *   - Añádela a `RuntimeConfig`, léela en `fromBrowser`/`fromNode` y expón un
 *     helper (p. ej. `featureFlag()`).
 */

import { environment } from '../../environments/environment';

/** Forma de la configuración inyectada en `window` por /env.js. */
export interface RuntimeConfig {
  apiUrl?: string;
}

// Amplía el tipo global de `window` para que TypeScript conozca la propiedad.
declare global {
  interface Window {
    __STUDYFINDER_ENV__?: RuntimeConfig;
  }
}

/** Devuelve el primer valor no vacío (recortado) o '' si no hay ninguno. */
function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

/** Lee la configuración del navegador; undefined en SSR. */
function fromBrowser(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.__STUDYFINDER_ENV__?.apiUrl;
}

/**
 * Lee `API_URL` del proceso en el servidor.
 *
 * Se accede vía `globalThis` con un tipo mínimo para no depender de `@types/node`
 * en el bundle del navegador.
 */
function fromNode(): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.['API_URL'];
}

/**
 * URL base de la API. Prioridad:
 *   1. Configuracion de ejecucion: `window.__STUDYFINDER_ENV__.apiUrl` en el
 *      navegador o `API_URL` en el servidor (SSR).
 *   2. Valor por defecto de `environment.apiUrl`.
 */
export function apiBaseUrl(): string {
  const configured =
    typeof window === 'undefined'
      ? firstNonEmpty(fromNode(), environment.apiUrl)
      : firstNonEmpty(fromBrowser(), environment.apiUrl);
  // Sin barra final, para que `apiEndpoint` no genere "//".
  return configured.replace(/\/+$/, '');
}

/** Construye una URL absoluta de la API a partir de una ruta relativa. */
export function apiEndpoint(path: string): string {
  const base = apiBaseUrl();
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}
