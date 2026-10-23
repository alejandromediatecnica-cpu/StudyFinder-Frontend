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

const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.createUrlTree(['/main']) : true;
};

export const routes: Routes = [
  { path: '', component: LandingComponent, pathMatch: 'full' },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'signup', component: SignupComponent, canActivate: [guestGuard] },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'main', component: MainComponent },
      { path: 'materias', component: MateriasComponent },
      { path: 'calendario', component: CalendarioComponent },
      { path: 'tareas', component: TareasComponent },
      { path: 'subir', component: UploadComponent },
      { path: 'biblioteca', component: LibraryComponent },
      { path: 'mensajes', component: MensajesComponent },
      { path: 'estadisticas', component: EstadisticasComponent },
    ]
  },
  { path: '**', redirectTo: '' }
];