/**
 * Landing pública (ruta '').
 *
 * Qué hace:
 *  - Muestra la presentación del producto y el equipo de desarrollo (carrusel
 *    simple con `activeProfile`).
 *  - Si hay sesión guardada, muestra el menú de cuenta (Ir a la app / Salir) en
 *    lugar de los botones de login/registro.
 *  - "Conoce al equipo" hace scroll suave a la sección `#equipo`.
 *
 * NOTA: `user` y `accountMenuOpen` son signals porque la plantilla los usa y
 * pueden cambiar sin recargar (login/logout en otra pestaña no, pero el flujo
 * de logout sí). `activeProfile` es un número normal: solo cambia por clic
 * (síncrono), no dentro de un subscribe, así que no necesita signal.
 *
 * CÓMO CAMBIAR LOS BOTONES DE LA CABECERA
 *  - `landing.html` (`.nav-links`) y sus estilos en `landing.css`.
 * CÓMO AÑADIR UN MIEMBRO DEL EQUIPO
 *  - Añade un objeto a `team` (initials, name, role, quote, accent).
 * CÓMO CAMBIAR EL DESTINO DE "IR A LA APP"
 *  - `landing.html` (routerLink="/main") y el guard de rutas.
 */

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService, AuthUser } from '../../../services/auth.service';

/** Miembro del equipo mostrado en la landing. */
interface TeamMember {
  initials: string;
  name: string;
  role: string;
  quote: string;
  accent: string; // clase de color usada por el CSS (cyan, blue, violet, green)
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css'
})
export class LandingComponent implements OnInit {
  /** Usuario logueado o null (decide qué botones mostrar). */
  user = signal<AuthUser | null>(null);
  /** Menú de cuenta (avatar/nombre) abierto. */
  accountMenuOpen = signal(false);

  /** Datos del equipo mostrados en la sección #equipo. */
  readonly team: TeamMember[] = [
    {
      initials: 'AQ',
      name: 'Alejandro Quintero',
      role: 'Full Stack',
      quote: 'Arquitectura, integración y experiencia unificada.',
      accent: 'cyan'
    },
    {
      initials: 'MV',
      name: 'Matias Valencia',
      role: 'Backend',
      quote: 'Seguridad, lógica de negocio y APIs robustas.',
      accent: 'blue'
    },
    {
      initials: 'SM',
      name: 'Samuel Muñoz',
      role: 'Backend',
      quote: 'Persistencia, validaciones y fiabilidad del sistema.',
      accent: 'violet'
    },
    {
      initials: 'SME',
      name: 'Sebastian Melendez',
      role: 'Base de datos',
      quote: 'Modelado, integridad y optimización de datos.',
      accent: 'green'
    }
  ];

  /** Índice del perfil destacado en el carrusel del equipo. */
  activeProfile = 0;

  constructor(private authService: AuthService, private router: Router) {
    // Lectura síncrona de localStorage: se puede hacer en el constructor.
    this.user.set(this.authService.getUser());
  }

  ngOnInit(): void {
    // Eliminar cualquier vestigio de "El colegio" si existiera en el DOM.
  }

  /** Miembro actualmente destacado (lo usa la plantilla). */
  get activeStudent(): TeamMember {
    return this.team[this.activeProfile];
  }

  /** Selecciona un miembro por índice (clic en un punto del carrusel). */
  selectProfile(index: number): void {
    this.activeProfile = index;
  }

  /** Miembro anterior con vuelta circular. */
  previousProfile(): void {
    this.activeProfile = (this.activeProfile + this.team.length - 1) % this.team.length;
  }

  /** Miembro siguiente con vuelta circular. */
  nextProfile(): void {
    this.activeProfile = (this.activeProfile + 1) % this.team.length;
  }

  /** Abre/cierra el menú de cuenta. */
  toggleAccountMenu(): void {
    this.accountMenuOpen.update(open => !open);
  }

  /**
   * Cierra sesión desde la landing.
   *
   * Limpia el estado local de la vista, cierra el menú y vuelve a '/' (que ya es
   * esta página; se hace para resetear la navegación). El SSE global lo cierra
   * `App.ngOnDestroy` solo al destruir la app; aquí `AuthService.logout` borra
   * el token y el backend revoca la sesión.
   */
  logout(): void {
    this.authService.logout();
    this.user.set(null);
    this.accountMenuOpen.set(false);
    this.router.navigate(['/']);
  }

  /** Scroll suave hasta la sección del equipo (`id="equipo"` en el HTML). */
  scrollToTeam(): void {
    const element = document.getElementById('equipo');
    element?.scrollIntoView({ behavior: 'smooth' });
  }
}
