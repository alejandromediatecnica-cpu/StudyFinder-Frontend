/**
 * Materias (ruta '/main/materias').
 *
 * Qué hace:
 *  - Lista las 6 materias predefinidas + las creadas por el usuario.
 *  - Al entrar en una materia muestra sus documentos (asociaciones reales en
 *    Mongo: `materia_documents`), permite añadir desde la Biblioteca, quitarlos
 *    y descargarlos.
 *  - Busca documentos académicos (OpenAlex) y permite guardarlos como enlace.
 *
 * DOS ALMACENES DISTINTOS
 *  - Materias propias y documentos guardados por búsqueda: localStorage
 *    (`StudyDataService.getMateriaChanges`, `addMateria`, `saveDocument`).
 *  - Documentos subidos y su asociación a materias: backend (`DocumentService`).
 *
 * IDs: las predefinidas son 1..6; las propias se derivan como `1000 + índice`
 * en el array de `StudyDataService`. Borrar una materia propia renumera las
 * siguientes para no desalinear ese cálculo (ver `eliminarMateria`).
 *
 * CÓMO AÑADIR UNA MATERIA PREDEFINIDA
 *  - Arrays `MATERIAS_PREDEFINIDAS` aquí, en `library.ts` y en `tareas.ts`
 *    (deben coincidir) + el array inicial de `materias`.
 * CÓMO QUITAR EL RENUMERADO
 *  - No lo hagas: rompería los ids de `StudyDataService` (ver comentario abajo).
 */

import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SearchService } from '../../../services/search.service';
import { StudyDataService, SavedDocument, CustomMateria } from '../../../services/study-data.service';
import { DocumentService, LibraryDocument } from '../../../services/document.service';

/** Documento tal como lo muestra la vista local (no se usa para peticiones). */
interface Documento {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/** Materia con sus documentos (los documentos casi siempre se cargan aparte). */
interface Materia {
  id: number;
  nombre: string;
  descripcion?: string;
  documentos: Documento[];
}

@Component({
  selector: 'app-materias',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './materias.html',
  styleUrl: './materias.css',
})
export class MateriasComponent {
  /** Lista visible; se amplía en el constructor con las materias propias. */
  materias = signal<Materia[]>([
    { id: 1, nombre: 'Ingeniería de Software', documentos: [] },
    { id: 2, nombre: 'Cálculo II', documentos: [] },
    { id: 3, nombre: 'Física', documentos: [] },
    { id: 4, nombre: 'Programación', documentos: [] },
    { id: 5, nombre: 'Inglés', documentos: [] },
    { id: 6, nombre: 'Matemáticas', documentos: [] },
  ]);

  /** Materia abierta (null = vista de lista). */
  materiaSeleccionada = signal<Materia | null>(null);
  searchTerm = '';
  searchResults: any[] = [];
  previewDocument: any = null;
  searching = false;
  searchError = '';
  showNewMateria = false;
  newMateriaName = '';
  newMateriaDescription = '';
  materiaError = '';
  selectorBibliotecaAbierto = false;
  documentosBiblioteca: LibraryDocument[] = [];
  documentosDeMateria: LibraryDocument[] = [];
  cargandoBiblioteca = false;
  guardandoDocumentoId: string | null = null;
  errorBiblioteca = '';

  constructor(private searchService: SearchService, private studyData: StudyDataService, private documentService: DocumentService) {
    // Aplica lo guardado en localStorage: quita las predefinidas borradas y
    // añade las propias con id 1000+índice (contrato con StudyDataService).
    const changes = this.studyData.getMateriaChanges();
    this.materias.update(items => [
      ...items.filter(item => !changes.deletedMateriaIds.includes(item.id)),
      ...changes.customMaterias.map((materia, index) => {
        // Compatibilidad: versiones antiguas guardaban solo el nombre.
        const custom = typeof materia === 'string' ? { name: materia, description: '' } : materia as CustomMateria;
        return { id: 1000 + index, nombre: custom.name, descripcion: custom.description, documentos: [] };
      })
    ]);
  }

  /** Abre una materia y carga sus documentos desde el backend. */
  seleccionarMateria(materia: Materia) {
    this.materiaSeleccionada.set(materia);
    this.cargarDocumentosDeMateria(materia);
  }

  /** Documentos asociados a la materia (`GET /documents?materia=...`). */
  private cargarDocumentosDeMateria(materia: Materia): void {
    this.documentService.list(materia.nombre).subscribe({
      next: documents => this.documentosDeMateria = documents,
      error: () => this.errorBiblioteca = 'No se pudieron cargar los documentos de esta materia.'
    });
  }

  /** Abre el selector con TODOS los documentos propios (sin filtrar por materia). */
  abrirSelectorBiblioteca(): void {
    this.selectorBibliotecaAbierto = true;
    this.cargandoBiblioteca = true;
    this.errorBiblioteca = '';
    this.documentService.list().subscribe({
      next: documents => {
        this.documentosBiblioteca = documents;
        this.cargandoBiblioteca = false;
      },
      error: () => {
        this.errorBiblioteca = 'No se pudo cargar la Biblioteca. Comprueba tu sesión.';
        this.cargandoBiblioteca = false;
      }
    });
  }

  /** ¿El documento ya está asociado a la materia abierta? */
  estaEnMateria(document: LibraryDocument): boolean {
    return this.documentosDeMateria.some(item => item.id === document.id);
  }

  /** Asocia un documento a la materia abierta (POST en `materia_documents`). */
  agregarDesdeBiblioteca(document: LibraryDocument): void {
    const materia = this.materiaSeleccionada();
    if (!materia || this.estaEnMateria(document)) return;
    this.guardandoDocumentoId = document.id;
    this.documentService.addToMateria(document.id, materia.nombre).subscribe({
      next: () => {
        this.documentosDeMateria = [...this.documentosDeMateria, document];
        this.guardandoDocumentoId = null;
      },
      error: () => {
        this.errorBiblioteca = 'No se pudo añadir el documento a la materia.';
        this.guardandoDocumentoId = null;
      }
    });
  }

  /** Desasocia el documento (no lo borra de la biblioteca). */
  quitarDeMateria(document: LibraryDocument): void {
    const materia = this.materiaSeleccionada();
    if (!materia) return;
    this.documentService.removeFromMateria(document.id, materia.nombre).subscribe({
      next: () => this.documentosDeMateria = this.documentosDeMateria.filter(item => item.id !== document.id),
      error: () => this.errorBiblioteca = 'No se pudo quitar el documento de la materia.'
    });
  }

  /**
   * Descarga un documento como blob y dispara la descarga del navegador.
   *
   * Se revoca la object URL en un `setTimeout(0)` (no en el mismo tick) porque
   * el navegador aún no ha leído el blob cuando `click()` retorna.
   */
  descargar(document: LibraryDocument): void {
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
      error: () => this.errorBiblioteca = 'No se pudo descargar el documento.'
    });
  }

  /** Tamaño legible: KB con mínimo 1, o MB con un decimal. */
  tamanoLegible(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Crea una materia propia (solo localStorage) con validación de duplicados. */
  crearMateria(): void {
    const nombre = this.newMateriaName.trim();
    if (!nombre) {
      this.materiaError = 'Escribe un nombre para la materia.';
      return;
    }
    if (this.materias().some(materia => materia.nombre.toLowerCase() === nombre.toLowerCase())) {
      this.materiaError = 'Ya existe una materia con ese nombre.';
      return;
    }
    // Id = 1000 + posición actual en el almacén (debe coincidir con lo guardado).
    const id = 1000 + this.studyData.getMateriaChanges().customMaterias.length;
    const descripcion = this.newMateriaDescription.trim();
    this.materias.update(items => [...items, { id, nombre, descripcion, documentos: [] }]);
    this.studyData.addMateria(nombre, descripcion);
    this.newMateriaName = '';
    this.newMateriaDescription = '';
    this.materiaError = '';
    this.showNewMateria = false;
  }

  /** Vuelve a la lista de materias y limpia paneles/búsqueda. */
  volver() {
    this.materiaSeleccionada.set(null);
    this.previewDocument = null;
    this.searchResults = [];
    this.selectorBibliotecaAbierto = false;
  }

  /** Busca documentos académicos en OpenAlex y registra la métrica de uso. */
  buscarDocumentos(): void {
    if (!this.searchTerm.trim()) return;
    this.studyData.recordSearch();
    this.searching = true;
    this.searchError = '';
    this.searchService.searchDocuments(this.searchTerm.trim()).subscribe({
      next: (response: any) => {
        // El backend devuelve {results}; se tolera un array directo.
        this.searchResults = Array.isArray(response) ? response : response?.results || response?.items || [];
        this.searching = false;
        if (!this.searchResults.length) this.searchError = 'No encontramos documentos.';
      },
      error: () => {
        this.searching = false;
        this.searchError = 'No se pudo realizar la búsqueda.';
      }
    });
  }

  /** Muestra el detalle de un resultado de búsqueda. */
  previsualizar(document: any): void {
    this.previewDocument = document;
  }

  /** Guarda un resultado de OpenAlex como enlace dentro de la materia. */
  guardarEnMateria(document: any): void {
    const materia = this.materiaSeleccionada();
    if (!materia) return;
    const saved: SavedDocument = {
      id: document.id || document.url || document.title,
      title: document.title || 'Sin título',
      url: document.url || '#',
      authors: document.authors,
      year: document.year,
      materia: materia.nombre,
      savedAt: new Date().toISOString()
    };
    this.studyData.saveDocument(saved);
    this.previewDocument = null;
  }

  /** Enlaces guardados (localStorage) de una materia. */
  documentosGuardados(materia: Materia): SavedDocument[] {
    return this.studyData.getSavedDocuments(materia.nombre);
  }

  /** Borra una materia: actualiza la vista, el almacén y renumera los ids. */
  eliminarMateria(materia: Materia, event: MouseEvent): void {
    event.stopPropagation();
    this.materias.update(items => {
      const sinBorrar = items.filter(item => item.id !== materia.id);
      const predefinidas = sinBorrar.filter(item => item.id < 1000);
      // Los ids de las materias propias equivalen a su posicion en el
      // almacenamiento (1000 + indice). Si no se renumeran aqui, borrar una
      // materia propia del medio desalinea los ids del almacen, la siguiente
      // materia creada repite un id vivo y removeMateria acabaria borrando la
      // materia equivocada.
      const propias = sinBorrar
        .filter(item => item.id >= 1000)
        .map((item, index) => ({ ...item, id: 1000 + index }));
      return [...predefinidas, ...propias];
    });
    this.studyData.removeMateria(materia.id);
    if (this.materiaSeleccionada()?.id === materia.id) this.volver();
  }

  /** Quita un enlace guardado (no toca documentos subidos). */
  eliminarGuardado(documento: SavedDocument, event: MouseEvent): void {
    event.stopPropagation();
    this.studyData.removeSavedDocument(documento.id);
  }
}
