/**
 * Definición de rutas de la aplicación (SPA).
 *
 * Estructura:
 *   ''            -> Landing pública (con `pathMatch: 'full'`).
 *   'login'       -> Login (solo invitados: `guestGuard`).
 *   'signup'      -> Registro (solo invitados: `guestGuard`).
 *   '' + children -> Zona privada con `LayoutComponent` (barra lateral) y
 *                    `authGuard`: main, materias, calendario, tareas, subir,
 *                    biblioteca, mensajes, estadisticas.
 *   '**'          -> Cualquier ruta desconocida vuelve a la landing.
 *
 * CÓMO AÑADIR UNA PÁGINA PRIVADA
 *  1. Crea `src/app/app/pages/miPagina/miPagina.ts`.
 *  2. Importa el componente aquí y añade `{ path: 'mi-pagina', component: MiPaginaComponent }`
 *     dentro de `children`.
 *  3. Añade el enlace en `layout.html` (menú lateral).
 * CÓMO HACER UNA RUTA PÚBLICA
 *   - Declárala fuera del bloque con `LayoutComponent` y sin `authGuard`.
 * CÓMO CAMBIAR LOS GUARDS
 *   - `authGuard` (privado) y `guestGuard` (login/registro) están justo arriba.
 */

import { inject } from '@angular/core';
import { CanActivateFn, Routes, Router } from '@angular/router';
import { LayoutComponent } from './app/pages/layout/layout';
import { MainComponent } from './app/pages/main/main';
import { MateriasComponent } from './app/pages/materias/materias';
import { CalendarioComponent } from './app/pages/calendario/calendario';
import { TareasComponent } from './app/pages/tareas/tareas';
import { EstadisticasComponent } from './app/pages/estadisticas/estadisticas';
import { MensajesComponent } from './app/pages/mensajes/mensajes';
import { LoginComponent } from './app/pages/login/login';
import { SignupComponent } from './app/pages/signup/signup';
import { LandingComponent } from './app/pages/landing/landing';
import { UploadComponent } from './app/pages/upload/upload';
import { LibraryComponent } from './app/pages/library/library';
import { AuthService } from './services/auth.service';

/**
 * Guard de rutas privadas.
 *
 * `inject()` funciona en guards funcionales porque se ejecutan dentro del
 * contexto de inyección de Angular. Si no hay sesión, devuelve un `UrlTree`
 * (redirección a /login) en lugar de un booleano.
 * NOTA: la sesión es `localStorage`; en SSR siempre se considera deslogueado.
 */
const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

/**
 * Guard de rutas de invitado (login/registro).
 *
 * Evita que un usuario ya logueado vea el formulario de login: lo manda a /main.
 */
const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.createUrlTree(['/main']) : true;
};

// Tabla de rutas. El orden importa: `''` con `pathMatch: 'full'` va antes del
// bloque con hijos, y el comodín `'**'` siempre al final.
export const routes: Routes = [
  // Landing pública.
  { path: '', component: LandingComponent, pathMatch: 'full' },
  // Autenticación: solo accesible sin sesión.
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'signup', component: SignupComponent, canActivate: [guestGuard] },
  {
    // Zona privada: todas cuelgan del layout y exigen sesión.
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'main', component: MainComponent },            // Panel principal
      { path: 'materias', component: MateriasComponent },    // Materias y documentos
      { path: 'calendario', component: CalendarioComponent },// Eventos
      { path: 'tareas', component: TareasComponent },        // Tablero de tareas
      { path: 'subir', component: UploadComponent },         // Subida de documentos
      { path: 'biblioteca', component: LibraryComponent },   // Biblioteca compartida
      { path: 'mensajes', component: MensajesComponent },    // Chat y contactos
      { path: 'estadisticas', component: EstadisticasComponent }, // Estadísticas
    ]
  },
  // Fallback: cualquier URL desconocida -> landing.
  { path: '**', redirectTo: '' }
];
