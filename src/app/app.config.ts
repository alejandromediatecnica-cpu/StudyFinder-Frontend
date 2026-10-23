/**
 * Configuración de la aplicación en el navegador (no SSR).
 *
 * Proveedores:
 *  - `provideBrowserGlobalErrorListeners()`: envía errores no capturados al
 *    manejador global de Angular (equivalente a ErrorHandler en navegador).
 *  - `provideRouter(routes)`: activa el router con nuestra tabla de rutas.
 *  - `provideClientHydration()`: reutiliza el HTML prerenderizado en el cliente
 *    (evita parpadeo y re-render completo al hidratar).
 *  - `provideHttpClient()`: `HttpClient` para hablar con el backend.
 *
 * IMPORTANTE: aquí NO hay `provideZoneChangeDetection` ni zone.js; la app es
 * zoneless. Por eso el estado que cambia dentro de callbacks async debe ser
 * `signal()` (si no, la vista no se actualiza).
 *
 * CÓMO AÑADIR UN INTERCEPTOR HTTP (token, errores globales):
 *   `provideHttpClient(withInterceptors([miInterceptor]))` y define el
 *   interceptor con `HttpInterceptorFn`.
 */

import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes), 
    provideClientHydration(),
    provideHttpClient()
  ]
};
