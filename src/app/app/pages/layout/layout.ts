/**
 * Shell de la aplicación autenticada (ruta '/main').
 *
 * Contiene la barra superior (buscador OpenAlex, campana/avatar, menú de
 * perfil) y el `<router-outlet>` donde se cargan tareas, calendario, mensajes,
 * materias, biblioteca, etc.
 *
 * Responsabilidades:
 *  - Conectar el SSE global (`RealtimeService.connect()`) mientras el usuario
 *    esté dentro de la app, para refrescar datos en vivo.
 *  - Cargar el perfil propio (`GET /users/me`) y su avatar, y aplicar el idioma
 *    guardado.
 *  - Buscador con debounce de 250 ms contra `SearchService` (OpenAlex, público).
 *  - Cerrar buscador/menú al hacer clic fuera.
 *
 * SIN ZONE.JS: todo lo que se asigna dentro de `subscribe` (searching,
 * showResults, error, searchResults, avatarUrl) debe ser signal. `user` y
 * `profileMenuOpen` se asignan de forma síncrona en clics/init, por eso no lo son.
 *
 * CÓMO CAMBIAR EL DEBOUNCE DEL BUSCADOR
 *  - `debounceTime(250)` en `ngOnInit`.
 * CÓMO CAMBIAR CUÁNTOS RESULTADOS SE PIDEN
 *  - Backend `app/api/search.py` (`per_page`, hoy 8).
 * CÓMO CAMBIAR EL MENÚ LATERAL / LINKS
 *  - `layout.html` (nav) y `app.routes.ts` (rutas hijas).
 */

import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SearchService } from '../../../services/search.service';
import { AuthService, AuthUser } from '../../../services/auth.service';
import { StudyDataService } from '../../../services/study-data.service';
import { ProfileService } from '../../../services/profile.service';
import { RealtimeService } from '../../../services/realtime.service';
import { TranslationService } from '../../../services/translation.service';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './layout.html',
  styleUrls: ['./layout.css']
})
export class LayoutComponent implements OnInit, OnDestroy {
  /** Contenedor del buscador: se usa para saber si el clic fue dentro. */
  @ViewChild('searchContainer') searchContainer!: ElementRef;

  private readonly profileService = inject(ProfileService);
  private readonly realtime = inject(RealtimeService);
  /** Servicio de traducciones (se expone para usarlo en la plantilla). */
  readonly t = inject(TranslationService);

  searchQuery: string = '';
  // Estados asincronos: deben ser signals porque la app corre sin zone.js.
  searching = signal(false);
  showResults = signal(false);
  error = signal<string | null>(null);
  searchResults = signal<any[]>([]);
  user: AuthUser | null = null;
  avatarUrl = signal<string | null>(null);
  profileMenuOpen = false;

  // Flujo de términos de búsqueda: el HTML emite, el pipeline hace debounce.
  private searchSubject = new Subject<string>();
  // Señal de destrucción para desuscribir SSE y búsquedas al salir de /main.
  private destroy$ = new Subject<void>();

  constructor(
    public searchService: SearchService,
    private authService: AuthService,
    private studyData: StudyDataService,
    private router: Router
  ) {}

  /**
   * Arranque del shell:
   *  1. Lee el usuario de localStorage.
   *  2. Abre la conexión SSE (`/events/stream`).
   *  3. Pide el perfil (avatar + idioma).
   *  4. Se suscribe a eventos `profile` para refrescar el avatar en vivo.
   *  5. Configura el buscador (debounce + cancelación).
   */
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.realtime.connect();
    if (this.user) {
      this.profileService.getMe().subscribe({
        next: (perfil) => {
          if (perfil.hasAvatar) {
            // `?t=` evita que el navegador reutilice un avatar cacheado viejo.
            this.avatarUrl.set(`${this.profileService.avatarUrl(perfil.id)}?t=${Date.now()}`);
          }
          this.t.setLanguage(perfil.language);
        }
      });
    }
    // El avatar se refresca en vivo cuando cambia desde otra pestaña o vista.
    // El backend publica `profile`; `data.hasAvatar` decide mostrar/quitar.
    this.realtime.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.entity === 'profile') {
          const perfil = event.data as { hasAvatar?: boolean; id?: string } | null;
          if (perfil?.hasAvatar && perfil.id) {
            this.avatarUrl.set(`${this.profileService.avatarUrl(perfil.id)}?t=${Date.now()}`);
          } else {
            this.avatarUrl.set(null);
          }
        }
      });
    // Pipeline del buscador:
    //  - debounce 250 ms para no llamar por cada tecla,
    //  - switchMap cancela la búsqueda anterior si llega otra,
    //  - término vacío limpia el estado sin llamar al backend.
    this.searchSubject.pipe(
      debounceTime(250),
      switchMap(term => {
        if (!term.trim()) {
          this.searching.set(false);
          this.showResults.set(false);
          this.searchResults.set([]);
          this.error.set(null);
          return of([]);
        }
        // Métrica local de uso (StudyDataService).
        this.studyData.recordSearch();
        this.searching.set(true);
        this.showResults.set(true);
        this.error.set(null);
        return this.searchService.searchDocuments(term).pipe(
          catchError(() => {
            this.searching.set(false);
            this.error.set('No se pudo realizar la búsqueda.');
            return of(null);
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: any) => {
        // `null` = ya se gestionó el error en catchError.
        if (response === null) return;
        // El backend devuelve {results:[...]}; se aceptan arrays por robustez.
        const list = Array.isArray(response) ? response : response?.results || response?.items || [];
        this.searchResults.set(list);
        this.searching.set(false);
        this.error.set(list.length === 0 ? 'No encontramos resultados.' : null);
      },
      error: (err: any) => {
        this.searching.set(false);
        this.error.set('No se pudo realizar la búsqueda.');
        this.searchResults.set([]);
      }
    });
  }

  /** Desuscribe SSE y búsquedas pendientes al destruir el shell. */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Cada pulsación en el buscador.
   *
   * Si el término está vacío se limpia al instante (sin esperar el debounce);
   * si no, se empuja al Subject y se muestra el panel de resultados.
   */
  onSearchInput(term: string): void {
    this.searchQuery = term;

    if (!term.trim()) {
      this.searching.set(false);
      this.showResults.set(false);
      this.searchResults.set([]);
      this.error.set(null);
      return;
    }

    this.searchSubject.next(term);
    this.searching.set(true);
    this.showResults.set(true);
  }

  // Cerrar resultados cuando se hace click fuera
  /**
   * Cierra el panel de resultados y el menú de perfil al hacer clic fuera.
   *
   * Se comprueba `searchContainer`, que envuelve ambos en el HTML.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (!this.searchContainer?.nativeElement.contains(target)) {
      this.showResults.set(false);
      this.profileMenuOpen = false;
    }
  }

  /**
   * Cierra sesión: corta el SSE, borra token/usuario y vuelve a la landing.
   * El backend revoca la sesión en `POST /auth/logout` (AuthService).
   */
  logout(): void {
    this.realtime.disconnect();
    this.authService.logout();
    this.router.navigate(['/']);
  }

  /** Abre/cierra el menú de perfil (stopPropagation evita que lo cierre el host). */
  toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen = !this.profileMenuOpen;
  }
}
