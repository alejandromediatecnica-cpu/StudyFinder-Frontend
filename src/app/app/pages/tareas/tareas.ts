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

  readonly columns: Array<{ status: TaskStatus; titulo: string }> = [
    { status: 'today', titulo: 'Hoy' },
    { status: 'week', titulo: 'Esta semana' },
    { status: 'pending', titulo: 'Pendientes' },
    { status: 'done', titulo: 'Completadas' }
  ];

  readonly materias: string[] = [
    'Ingeniería de Software',
    'Cálculo II',
    'Física',
    'Programación',
    'Inglés',
    'Matemáticas'
  ];

  readonly materiaOpciones = this.materias.map(materia => ({ value: materia, label: materia }));

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

  ngOnInit(): void {
    this.store.ensureLoaded();
  }

  cargar(): void {
    this.store.refresh();
  }

  // ---------------------------------------------------------
  // Agrupacion y filtrado
  // ---------------------------------------------------------

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
    if (task.dueDate <= hoy) return 'today';
    const enUnaSemana = new Date();
    enUnaSemana.setDate(enUnaSemana.getDate() + 7);
    const isoSemana = this.toISO(enUnaSemana);
    return task.dueDate <= isoSemana ? 'week' : 'pending';
  }

  private hoyISO(): string {
    return this.toISO(new Date());
  }

  private toISO(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }

  countByStatus(status: TaskStatus): number {
    return this.tasks().filter(task => this.statusActual(task) === status).length;
  }

  get pendingCount(): number {
    return this.tasks().filter(task => !task.completed).length;
  }

  get totalCount(): number {
    return this.tasks().length;
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  // ---------------------------------------------------------
  // Alta / edicion / borrado
  // ---------------------------------------------------------

  abrirFormulario(): void {
    this.resetFormulario();
    this.showForm.set(true);
  }

  cerrarFormulario(): void {
    this.showForm.set(false);
    this.resetFormulario();
  }

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

  editar(task: Task): void {
    this.editingId = task.id;
    this.formTitle = task.title;
    this.formSubject = task.subject || '';
    this.formType = task.type || 'tarea';
    this.formDate = task.dueDate || '';
    this.formTime = task.dueTime || '';
    this.formDescription = task.description || '';
    this.attachedDocuments = [...(task.documents ?? [])];
    this.formError = '';
    this.showForm.set(true);
  }

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

  toggleCompleted(task: Task): void {
    this.store.toggleTask(task.id);
  }

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

  cancelarBorrarTodas(): void {
    this.confirmandoBorrado.set(false);
  }

  // ---------------------------------------------------------
  // Documentos: biblioteca propia o resultados de la API
  // ---------------------------------------------------------

  abrirSelectorDocumento(tab: 'biblioteca' | 'busqueda' = 'biblioteca'): void {
    this.docPickerTab = tab;
    this.docPickerOpen.set(true);
    this.errorDocuments.set('');
    if (tab === 'biblioteca' && !this.libraryDocuments().length) {
      this.cargarBiblioteca();
    }
  }

  cerrarSelectorDocumento(): void {
    this.docPickerOpen.set(false);
    this.docSearchTerm = '';
    this.searchResults.set([]);
  }

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

  buscarDocumentos(): void {
    const term = this.docSearchTerm.trim();
    if (!term) return;
    this.loadingSearch.set(true);
    this.errorDocuments.set('');
    this.searchService.searchDocuments(term).subscribe({
      next: (response: any) => {
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

  tipoLabel(tipo?: string): string {
    if (tipo === 'trabajo') return 'Trabajo';
    if (tipo === 'evento') return 'Evento';
    return 'Tarea';
  }
}