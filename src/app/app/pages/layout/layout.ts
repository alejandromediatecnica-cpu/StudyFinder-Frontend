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
  @ViewChild('searchContainer') searchContainer!: ElementRef;

  private readonly profileService = inject(ProfileService);
  private readonly realtime = inject(RealtimeService);
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

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    public searchService: SearchService,
    private authService: AuthService,
    private studyData: StudyDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.realtime.connect();
    if (this.user) {
      this.profileService.getMe().subscribe({
        next: (perfil) => {
          if (perfil.hasAvatar) {
            this.avatarUrl.set(`${this.profileService.avatarUrl(perfil.id)}?t=${Date.now()}`);
          }
          this.t.setLanguage(perfil.language);
        }
      });
    }
    // El avatar se refresca en vivo cuando cambia desde otra pestaña o vista.
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
        if (response === null) return;
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

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
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (!this.searchContainer?.nativeElement.contains(target)) {
      this.showResults.set(false);
      this.profileMenuOpen = false;
    }
  }

  logout(): void {
    this.realtime.disconnect();
    this.authService.logout();
    this.router.navigate(['/']);
  }

  toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen = !this.profileMenuOpen;
  }
}