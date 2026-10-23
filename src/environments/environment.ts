/**
 * Configuración por defecto del frontend (tiempo de compilación).
 *
 * `apiUrl` es SOLO el respaldo. En runtime se puede sobrescribir con la
 * variable de entorno `API_URL` (ver `src/server.ts` y
 * `src/app/config/runtime-config.ts`), de modo que no hay que reconstruir la
 * app al cambiar de backend.
 *
 * CÓMO CAMBIAR EL BACKEND POR DEFECTO (desarrollo)
 *   - Cambia `apiUrl` aquí. Debe coincidir con el puerto de uvicorn y con los
 *     orígenes CORS del backend.
 */

// `production: false` no se usa para activar optimizaciones: el build de
// Angular ya tiene sus propios modos. Se mantiene por convención.
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000',
};
