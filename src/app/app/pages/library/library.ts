/**
 * Biblioteca (ruta '/main/library').
 *
 * Dos pestañas con la misma lógica de filtrado:
 *  - "Mis documentos": `GET /documents` (propios del token).
 *  - "Compartidos": `GET /documents/public` (de todos los usuarios).
 *
 * Acciones: descargar (blob con Bearer), eliminar (solo dueño) y asignar a una
 * materia. La cuota se calcula en cliente sumando `size` de los propios, pero
 * quien la hace cumplir es el backend (413 al superar 3 MB).
 *
 * SIN ZONE.JS: todos los campos que se escriben dentro de `subscribe` o del SSE
 * son signals; `filtered*` y `storage*` son `computed` que reaccionan solos.
 *
 * CÓMO CAMBIAR LA CUOTA MOSTRADA
 *  - `MAX_STORAGE_PER_USER` aquí Y `MAX_STORAGE_PER_USER` en
 *    `app/api/documents.py` (deben coincidir; el backend manda).
 * CÓMO AÑADIR COLUMNAS/ACCIONES
 *  - `library.html` + los métodos de este archivo.
 */

import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { DocumentService, LibraryDocument } from '../../../services/document.service';
import { RealtimeService, RealtimeEvent } from '../../../services/realtime.service';
import { StudyDataService } from '../../../services/study-data.service';

/** Materias que se ofrecen para asignar (deben coincidir con Materias/Tareas). */
const MATERIAS_PREDEFINIDAS = [
  'Ingeniería de Software',
  'Cálculo II',
  'Física',
  'Programación',
  'Inglés',
  'Matemáticas',
];
// Debe coincidir con MAX_STORAGE_PER_USER del backend.
const MAX_STORAGE_PER_USER = 3 * 1024 * 1024;

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './library.html',
  styleUrl: './library.css'
})
export class LibraryComponent implements OnInit, OnDestroy {
  // Todo estado que cambia dentro de subscribe (asincrono) debe ser signal:
  // la app corre sin zone.js y, si no, el DOM no se re-renderiza.
  documentos = signal<LibraryDocument[]>([]);   // propios
  publicos = signal<LibraryDocument[]>([]);     // de otros usuarios
  filter = signal('');
  loading = signal(true);
  loadingPublic = signal(true);
  error = signal('');
  errorPublic = signal('');
  deletingId = signal<string | null>(null);     // id en proceso de borrado
  assigningId = signal<string | null>(null);    // id en proceso de asignación
  // id del documento -> materia a la que está asignado.
  asignadoA = signal<Record<string, string>>({});
  materias = signal<string[]>(MATERIAS_PREDEFINIDAS);

  /** Documentos propios que coinciden con el filtro (sin acentos en mayúsculas). */
  filteredDocuments = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase();
    return this.documentos().filter(document => document.filename.toLocaleLowerCase().includes(term));
  });

  /** Documentos compartidos que coinciden con el filtro. */
  filteredPublic = computed(() => {
    const term = this.filter().trim().toLocaleLowerCase();
    return this.publicos().filter(document => document.filename.toLocaleLowerCase().includes(term));
  });

  // Tenencia: suma los tamaños de los documentos propios.
  storageUsed = computed(() => this.documentos().reduce((total, document) => total + document.size, 0));
  storageRemaining = computed(() => Math.max(0, MAX_STORAGE_PER_USER - this.storageUsed()));
  storagePercent = computed(() => Math.min(100, (this.storageUsed() / MAX_STORAGE_PER_USER) * 100));

  constructor(private documentService: DocumentService, private studyData: StudyDataService) {}

  private readonly destroy$ = new Subject<void>();
  private readonly realtime = inject(RealtimeService);

  /**
   * Carga materias (localStorage), ambas listas y se suscribe a `documents`
   * por SSE: si otro usuario sube/borra/asocia un documento, se refresca.
   */
  ngOnInit(): void {
    this.cargarMaterias();
    this.refresh();
    this.refreshPublic();
    this.realtime.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: RealtimeEvent) => {
        if (event.entity === 'documents') {
          this.refresh();
          this.refreshPublic();
        }
      });
  }

  /** Desuscribe el SSE al salir de la página. */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Combina predefinidas no borradas + materias propias del usuario. */
  private cargarMaterias(): void {
    const { customMaterias, deletedMateriaIds } = this.studyData.getMateriaChanges();
    // `deletedMateriaIds` guarda ids 1..6; el array empieza en 0.
    const predefinidas = MATERIAS_PREDEFINIDAS.filter((_, index) => !deletedMateriaIds.includes(index + 1));
    const propias = customMaterias.map(materia => (typeof materia === 'string' ? materia : materia.name));
    this.materias.set([...predefinidas, ...propias]);
  }

  /** Recarga los documentos propios. */
  refresh(): void {
    this.loading.set(true);
    this.error.set('');
    this.documentService.list().subscribe({
      next: documents => {
        this.documentos.set(documents);
        this.loading.set(false);
      },
      error: response => {
        this.error.set(this.mensajeDeError(response));
        this.loading.set(false);
      }
    });
  }

  /** Recarga los documentos compartidos por el resto de usuarios. */
  refreshPublic(): void {
    this.loadingPublic.set(true);
    this.errorPublic.set('');
    this.documentService.listPublic().subscribe({
      next: documents => {
        this.publicos.set(documents);
        this.loadingPublic.set(false);
      },
      error: () => {
        this.errorPublic.set('No se pudieron cargar los documentos de otros usuarios.');
        this.loadingPublic.set(false);
      }
    });
  }

  /**
   * Descarga como blob (la petición lleva Bearer) y fuerza la descarga local.
   * La object URL se revoca en el siguiente tick, no antes (ver comentario).
   */
  download(document: LibraryDocument): void {
    this.documentService.download(document.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = document.filename;
        anchor.click();
        // Revocar la URL en el mismo tick cancela la descarga en curso: el
        // navegador todavia no ha leido el blob cuando click() retorna.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      },
      error: () => this.error.set('No se pudo descargar este documento.')
    });
  }

  /** Elimina un documento propio (el backend rechaza si no eres el dueño). */
  remove(document: LibraryDocument): void {
    if (!window.confirm(`¿Eliminar “${document.filename}” de tu biblioteca?`)) return;
    this.deletingId.set(document.id);
    this.documentService.delete(document.id).subscribe({
      next: () => {
        // Actualización local; el servidor ya borró también las asociaciones.
        this.documentos.set(this.documentos().filter(item => item.id !== document.id));
        this.deletingId.set(null);
      },
      error: () => {
        this.error.set('No se pudo eliminar el documento.');
        this.deletingId.set(null);
      }
    });
  }

  /**
   * Asocia un documento a una materia.
   *
   * `assigningId` bloquea dobles clics mientras la petición está en vuelo.
   * El backend no comprueba propiedad: cualquiera puede asignar un documento
   * compartido a sus materias.
   */
  asignar(materia: string, document: LibraryDocument): void {
    if (!materia || this.assigningId()) return;
    this.assigningId.set(document.id);
    this.documentService.addToMateria(document.id, materia).subscribe({
      next: () => {
        this.asignadoA.update(prev => ({ ...prev, [document.id]: materia }));
        this.assigningId.set(null);
      },
      error: () => {
        this.error.set('No se pudo asignar el documento a la materia.');
        this.assigningId.set(null);
      }
    });
  }

  /** Mensaje según el tipo de fallo al cargar la biblioteca. */
  private mensajeDeError(response: any): string {
    if (response.status === 401) {
      return 'Tu sesión anterior ya no es válida. Cierra sesión, vuelve a entrar y recarga la Biblioteca.';
    }
    if (response.name === 'TimeoutError') {
      return 'La API tardó demasiado en responder. Comprueba que el backend esté activo e inténtalo de nuevo.';
    }
    return 'No se pudo cargar tu biblioteca. Comprueba que la API esté iniciada e inténtalo de nuevo.';
  }

  /** Formatea bytes (B / KB / MB) para la tabla. */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /** Fecha legible en español (día/mes/año). */
  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value));
  }
}
