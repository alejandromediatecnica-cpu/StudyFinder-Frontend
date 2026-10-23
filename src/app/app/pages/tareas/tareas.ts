/**
 * Tablero de tareas (ruta '/main/tareas').
 *
 * Qué hace:
 *  - Pinta 4 columnas (Hoy / Esta semana / Pendientes / Completadas) a partir de
 *    `TaskStoreService.tasks` (backend `GET /tasks`).
 *  - Alta/edición en un panel lateral, con fecha (app-date-picker), hora
 *    (app-styled-select) y varios documentos adjuntos.
 *  - Filtro de texto insensible a acentos y borrado masivo en dos pasos.
 *
 * INVARIANTES IMPORTANTES
 *  - El estado de columna NO se guarda: se deriva con `statusActual()` desde
 *    `completed` + `dueDate`. `Task.status` existe pero no manda.
 *  - Los documentos adjuntos van en `Task.documents[]` (varios permitidos).
 *  - Crear/editar/borrar pasa por `TaskStoreService`, que sincroniza el evento
 *    equivalente en el calendario; la página nunca toca el calendario.
 *
 * SIN ZONE.JS: todo lo que llega de un `subscribe` (showForm, docPickerOpen,
 * loading*, libraryDocuments, searchResults, errorDocuments, confirmandoBorrado)
 * es signal. Los campos del formulario son normales porque solo los escribe ngModel.
 *
 * CÓMO AÑADIR UNA COLUMNA
 *  - `columns` + `statusActual()` + `filteredTasks()` + el HTML.
 * CÓMO CAMBIAR LAS MATERIAS DEL DESPLEGABLE
 *  - `materias` (hoy hardcodeadas; Materias gestiona las del usuario aparte).
 * CÓMO CAMBIAR EL RANGO DE "ESTA SEMANA"
 *  - `setDate(+7)` en `statusActual()`.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Task, TaskDocument, TaskStatus } from '../../../services/study-data.service';
import { TaskStoreService } from '../../../services/task-store.service';
import { DocumentService, LibraryDocument } from '../../../services/document.service';
import { SearchService } from '../../../services/search.service';
import { DatePickerComponent } from '../../components/date-picker';
import { StyledSelectComponent } from '../../components/styled-select';

/** Resultado de búsqueda académica (OpenAlex) que se puede adjuntar. */
interface DocSearchResult {
  id?: string;
  title: string;
  url?: string;
  authors?: string[];
  year?: number;
}

@Component({
  standalone: true,
  selector: 'app-tareas',
  imports: [CommonModule, FormsModule, DatePickerComponent, StyledSelectComponent],
  templateUrl: './tareas.html',
  styleUrl: './tareas.css',
})
export class TareasComponent implements OnInit {
  /** Texto del filtro de la cabecera. */
  searchTerm = '';

  private readonly store = inject(TaskStoreService);

  // Estado asincrono -> signals (la app corre sin zone.js).
  readonly tasks = this.store.tasks;
  showForm = signal(false);

  /** Borrado masivo en dos pasos: primer clic pide, segundo confirma. */
  readonly confirmandoBorrado = signal(false);

  // Formulario
  editingId: string | null = null;
  formTitle = '';
  formSubject = '';
  formType: 'tarea' | 'trabajo' | 'evento' = 'tarea';
  formDate = '';
  formTime = '';
  formDescription = '';
  formError = '';
  attachedDocuments: TaskDocument[] = [];

  // Selector de documentos
  docPickerOpen = signal(false);
  docPickerTab: 'biblioteca' | 'busqueda' = 'biblioteca';
  docSearchTerm = '';
  loadingDocuments = signal(false);
  loadingSearch = signal(false);
  libraryDocuments = signal<LibraryDocument[]>([]);
  searchResults = signal<DocSearchResult[]>([]);
  errorDocuments = signal('');

  /** Columnas visibles, en orden. */
  readonly columns: Array<{ status: TaskStatus; titulo: string }> = [
    { status: 'today', titulo: 'Hoy' },
    { status: 'week', titulo: 'Esta semana' },
    { status: 'pending', titulo: 'Pendientes' },
    { status: 'done', titulo: 'Completadas' }
  ];

  /** Materias sugeridas en el formulario. */
  readonly materias: string[] = [
    'Ingeniería de Software',
    'Cálculo II',
    'Física',
    'Programación',
    'Inglés',
    'Matemáticas'
  ];

  /** Adaptación de `materias` al formato de app-styled-select. */
  readonly materiaOpciones = this.materias.map(materia => ({ value: materia, label: materia }));

  /** Tipos de tarea disponibles. */
  readonly tipoOpciones = [
    { value: 'tarea', label: 'Tarea' },
    { value: 'trabajo', label: 'Trabajo' },
    { value: 'evento', label: 'Evento' }
  ];

  /** Horarios en cuartos de hora: es lo habitual para entregas y estudio. */
  readonly horaOpciones = Array.from({ length: 4 * 24 }, (_, i) => {
    const minutos = i * 15;
    const h = Math.floor(minutos / 60) % 24;
    const m = minutos % 60;
    const hora = String(h).padStart(2, '0');
    const resto = String(m).padStart(2, '0');
    return { value: `${hora}:${resto}`, label: `${hora}:${resto}` };
  });

  constructor(
    private documentService: DocumentService,
    private searchService: SearchService
  ) {}

  /** Carga las tareas si aún no están (idempotente). */
  ngOnInit(): void {
    this.store.ensureLoaded();
  }

  /** Recarga desde el backend. */
  cargar(): void {
    this.store.refresh();
  }

  // ---------------------------------------------------------
  // Agrupacion y filtrado
  // ---------------------------------------------------------

  /** Tareas de una columna, filtradas por el texto (sin acentos). */
  filteredTasks(status: TaskStatus): Task[] {
    const term = this.sinAcentos(this.searchTerm.trim());
    return this.tasks()
      .filter(task => this.statusActual(task) === status)
      .filter(
        task =>
          !term ||
          this.sinAcentos(`${task.title} ${task.subject || ''}`).includes(term)
      );
  }

  /** Normaliza para que "FISICA" encuentre "Física" al filtrar. */
  private sinAcentos(texto: string): string {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * El estado real se deriva de `completed` y de la fecha: una tarea sin
   * fecha sigue pendiente, hoy cae en "Hoy", esta semana en "Esta semana" y
   * mas adelante en "Pendientes" hasta que se complete.
   */
  private statusActual(task: Task): TaskStatus {
    if (task.completed) return 'done';
    if (!task.dueDate) return 'pending';
    const hoy = this.hoyISO();
    if (task.dueDate <= hoy) return 'today'; // incluye vencidas
    const enUnaSemana = new Date();
    enUnaSemana.setDate(enUnaSemana.getDate() + 7);
    const isoSemana = this.toISO(enUnaSemana);
    return task.dueDate <= isoSemana ? 'week' : 'pending';
  }

  private hoyISO(): string {
    return this.toISO(new Date());
  }

  /** Fecha local como YYYY-MM-DD. */
  private toISO(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }

  /** Número de tareas en una columna (badge de la cabecera). */
  countByStatus(status: TaskStatus): number {
    return this.tasks().filter(task => this.statusActual(task) === status).length;
  }

  /** Total de no completadas. */
  get pendingCount(): number {
    return this.tasks().filter(task => !task.completed).length;
  }

  /** Total de tareas. */
  get totalCount(): number {
    return this.tasks().length;
  }

  /** Limpia el filtro de búsqueda. */
  clearSearch(): void {
    this.searchTerm = '';
  }

  // ---------------------------------------------------------
  // Alta / edicion / borrado
  // ---------------------------------------------------------

  /** Abre el panel con el formulario vacío. */
  abrirFormulario(): void {
    this.resetFormulario();
    this.showForm.set(true);
  }

  /** Cierra el panel y descarta lo escrito. */
  cerrarFormulario(): void {
    this.showForm.set(false);
    this.resetFormulario();
  }

  /** Vuelve el formulario a su estado inicial. */
  private resetFormulario(): void {
    this.editingId = null;
    this.formTitle = '';
    this.formSubject = '';
    this.formType = 'tarea';
    this.formDate = '';
    this.formTime = '';
    this.formDescription = '';
    this.formError = '';
    this.attachedDocuments = [];
  }

  /** Carga una tarea existente en el formulario (modo edición). */
  editar(task: Task): void {
    this.editingId = task.id;
    this.formTitle = task.title;
    this.formSubject = task.subject || '';
    this.formType = task.type || 'tarea';
    this.formDate = task.dueDate || '';
    this.formTime = task.dueTime || '';
    this.formDescription = task.description || '';
    // Copia: hasta guardar no se modifica la tarea original.
    this.attachedDocuments = [...(task.documents ?? [])];
    this.formError = '';
    this.showForm.set(true);
  }

  /**
   * Crea o actualiza la tarea.
   *
   * `completed` y `status` se conservan al editar (editar el título no debe
   * desmarcar una tarea hecha). `due` es el texto legible que muestra el
   * calendario ("MM-DD HH:MM"); `dueDate`/`dueTime` son los datos reales.
   */
  guardar(): void {
    const title = this.formTitle.trim();
    if (!title) {
      this.formError = 'Escribe un título para la tarea.';
      return;
    }

    const datos = {
      title,
      subject: this.formSubject.trim(),
      type: this.formType,
      dueDate: this.formDate || undefined,
      dueTime: this.formTime || undefined,
      due: this.formDate ? `${this.formDate.replace(/^\d{4}-/, '')}${this.formTime ? ` ${this.formTime}` : ''}` : undefined,
      description: this.formDescription.trim() || undefined,
      completed: this.editingId
        ? !!this.tasks().find(task => task.id === this.editingId)?.completed
        : false,
      status: this.editingId
        ? (this.tasks().find(task => task.id === this.editingId)?.status ?? 'pending')
        : 'pending',
      documents: this.attachedDocuments.length ? [...this.attachedDocuments] : undefined
    } as Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

    if (this.editingId) {
      this.store.updateTask(this.editingId, datos);
    } else {
      // El store ya refleja en el calendario las tareas que llevan fecha.
      this.store.createTask(datos);
    }

    this.cerrarFormulario();
  }

  /** Alterna completada/pendiente. */
  toggleCompleted(task: Task): void {
    this.store.toggleTask(task.id);
  }

  /** Borra una tarea (con confirmación del navegador). */
  eliminar(task: Task, event?: Event): void {
    event?.stopPropagation();
    if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar “${task.title}”?`)) return;
    this.store.removeTask(task.id);
  }

  /** Primer clic: pide confirmacion para borrar todas las tareas. */
  pedirBorrarTodas(): void {
    if (!this.tasks().length) return;
    this.confirmandoBorrado.set(true);
  }

  /** Segundo clic: elimina de una sola vez todas las tareas. */
  confirmarBorrarTodas(): void {
    this.store.removeAllTasks();
    this.confirmandoBorrado.set(false);
  }

  /** Cancela el borrado masivo. */
  cancelarBorrarTodas(): void {
    this.confirmandoBorrado.set(false);
  }

  // ---------------------------------------------------------
  // Documentos: biblioteca propia o resultados de la API
  // ---------------------------------------------------------

  /**
   * Abre el selector de documentos.
   *
   * Pestaña "biblioteca": documentos propios + compartidos (`list`+`listPublic`).
   * Pestaña "búsqueda": OpenAlex (`SearchService`).
   */
  abrirSelectorDocumento(tab: 'biblioteca' | 'busqueda' = 'biblioteca'): void {
    this.docPickerTab = tab;
    this.docPickerOpen.set(true);
    this.errorDocuments.set('');
    if (tab === 'biblioteca' && !this.libraryDocuments().length) {
      this.cargarBiblioteca();
    }
  }

  /** Cierra el selector y limpia la búsqueda. */
  cerrarSelectorDocumento(): void {
    this.docPickerOpen.set(false);
    this.docSearchTerm = '';
    this.searchResults.set([]);
  }

  /** Carga en paralelo documentos propios y de otros usuarios. */
  private cargarBiblioteca(): void {
    this.loadingDocuments.set(true);
    // Documentos propios + compartidos por el resto: la biblioteca completa.
    forkJoin({
      propios: this.documentService.list(),
      ajenos: this.documentService.listPublic()
    }).subscribe({
      next: ({ propios, ajenos }) => {
        this.libraryDocuments.set([...propios, ...ajenos]);
        this.loadingDocuments.set(false);
      },
      error: () => {
        this.errorDocuments.set('No se pudo cargar la biblioteca.');
        this.loadingDocuments.set(false);
      }
    });
  }

  /** Busca documentos académicos (OpenAlex) para adjuntar por enlace. */
  buscarDocumentos(): void {
    const term = this.docSearchTerm.trim();
    if (!term) return;
    this.loadingSearch.set(true);
    this.errorDocuments.set('');
    this.searchService.searchDocuments(term).subscribe({
      next: (response: any) => {
        // El backend devuelve {results:[...]}; se tolera un array directo.
        const list = Array.isArray(response) ? response : response?.results || response?.items || [];
        this.searchResults.set(list);
        this.loadingSearch.set(false);
      },
      error: () => {
        this.errorDocuments.set('No se pudo realizar la búsqueda.');
        this.loadingSearch.set(false);
      }
    });
  }

  /** Adjunta un documento mas; se permiten varios por tarea. */
  adjuntarDocumento(document: LibraryDocument | DocSearchResult, origen: 'biblioteca' | 'busqueda'): void {
    // Los documentos de biblioteca traen `filename`; los de OpenAlex, `title`.
    const nombre = 'filename' in document ? document.filename : document.title;
    const url = 'url' in document ? document.url || undefined : undefined;
    const adjunto: TaskDocument = { id: document.id, name: nombre, url, origin: origen };
    // No duplica el mismo documento en la misma tarea.
    const yaEsta = this.attachedDocuments.some(
      otro => otro.name === adjunto.name && otro.url === adjunto.url
    );
    if (!yaEsta) this.attachedDocuments.push(adjunto);
    // El selector se mantiene abierto para poder adjuntar otro seguido.
    this.errorDocuments.set('');
  }

  /** Quita un documento por su posicion en la lista. */
  quitarDocumento(indice: number): void {
    this.attachedDocuments.splice(indice, 1);
  }

  /** Marca como adjunto en el selector un documento ya agregado. */
  yaAdjuntado(document: LibraryDocument | DocSearchResult): boolean {
    const nombre = 'filename' in document ? document.filename : document.title;
    const url = 'url' in document ? document.url || undefined : undefined;
    return this.attachedDocuments.some(otro => otro.name === nombre && otro.url === url);
  }

  /** Etiqueta visible del tipo de tarea. */
  tipoLabel(tipo?: string): string {
    if (tipo === 'trabajo') return 'Trabajo';
    if (tipo === 'evento') return 'Evento';
    return 'Tarea';
  }
}
