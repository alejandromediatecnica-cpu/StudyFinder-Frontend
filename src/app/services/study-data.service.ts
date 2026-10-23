/**
 * Estado local del usuario (localStorage) y modelos compartidos de la UI.
 *
 * QUÉ SE GUARDA AQUÍ
 *   - Contadores de estadísticas (búsquedas, sesiones, subidas).
 *   - Documentos guardados desde la búsqueda (`SavedDocument`).
 *   - Materias personalizadas y materias integradas eliminadas.
 *   - Tareas y eventos (modo invitado y caché de respaldo si falla la red).
 *
 * AISLAMIENTO POR USUARIO
 *   La clave es `studyfinder_data_<id>`; sin sesión, `studyfinder_data_guest`.
 *   El id sale de `studyfinder_user` (lo guarda `AuthService`).
 *
 * RELACIÓN CON `TaskStoreService`
 *   Con sesión, `TaskStoreService` usa el backend y solo cae aquí si la red
 *   falla. Sin sesión, este servicio es la fuente de verdad.
 *
 * INVARIANTE TAREA <-> EVENTO (modo local)
 *   `sincronizaEventoDeTarea` replica la misma lógica que el store: una tarea
 *   con `dueDate` tiene un evento vinculado por `taskId`, y sin fecha no tiene
 *   evento. No la dupliques en componentes.
 *
 * CÓMO AÑADIR UN DATO NUEVO
 *   1. Campo en `StudyData` y en `empty()` (para migraciones de datos viejos).
 *   2. Métodos de lectura/escritura siguiendo `read()` + `write()`.
 * CÓMO CAMBIAR EL NOMBRE DE LAS CLAVES
 *   - `prefix` (afecta a todos los datos locales existentes).
 *
 * NOTA SOBRE IDs DE MATERIA
 *   Las materias integradas usan 1..6 (definidas en `materias.ts`); las
 *   personalizadas, `1000 + índice`. Cambiar esa aritmética rompe los borrados.
 */

import { Injectable } from '@angular/core';

/** Documento guardado desde el buscador. */
export interface SavedDocument {
  id: string;
  title: string;
  url: string;
  authors?: string[];
  year?: number;
  materia?: string;
  savedAt: string;
}

/** Materia creada por el usuario. */
export interface CustomMateria {
  name: string;
  description: string;
}

export type TaskStatus = 'today' | 'week' | 'done' | 'pending';

/** Documento adjunto a una tarea. Varios por tarea. */
export interface TaskDocument {
  /** id del documento en la biblioteca, ausente en resultados de busqueda. */
  id?: string;
  name: string;
  url?: string;
  origin: 'biblioteca' | 'busqueda';
}

/** Tarea tal como la maneja la UI. */
export interface Task {
  id: string;
  title: string;
  subject?: string;
  due?: string; // fecha/hora legible (ej. "10:00" o "Miércoles")
  dueDate?: string; // ISO YYYY-MM-DD
  dueTime?: string; // HH:mm
  status: TaskStatus;
  completed: boolean;
  documents?: TaskDocument[];
  type?: 'tarea' | 'trabajo' | 'evento';
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** Evento de calendario tal como lo maneja la UI. */
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // ISO YYYY-MM-DD
  hour?: string; // HH:mm o legible
  color?: 'document' | 'homework' | 'class' | 'event' | 'task';
  type?: 'evento' | 'tarea' | 'trabajo';
  taskId?: string;
  documents?: TaskDocument[];
}

/** Estructura completa guardada en una clave de localStorage. */
interface StudyData {
  searches: number;
  savedDocuments: SavedDocument[];
  uploadedFiles: string[];
  studySessions: number;
  customMaterias: Array<string | CustomMateria>;
  deletedMateriaIds: number[];
  tasks: Task[];
  events: CalendarEvent[];
}

@Injectable({ providedIn: 'root' })
export class StudyDataService {
  // Prefijo común; la clave final añade el id de usuario.
  private readonly prefix = 'studyfinder_data_';

  /**
   * Clave de localStorage del usuario actual.
   *
   * Lee `studyfinder_user` (JSON de AuthService). Si no hay sesión o el JSON
   * está corrupto, usa `guest`. En SSR no hay localStorage -> `guest`.
   */
  private key(): string {
    const user = typeof localStorage === 'undefined' ? null : localStorage.getItem('studyfinder_user');
    let id: string | number | undefined;
    try {
      id = user ? JSON.parse(user)?.id : undefined;
    } catch {
      // Un valor corrupto se trata como sesion anonima en vez de romper la app.
      id = undefined;
    }
    return `${this.prefix}${id || 'guest'}`;
  }

  /**
   * Lee el estado completo.
   *
   * Se mezcla con `empty()` para que datos guardados por versiones anteriores
   * (sin algún campo) no rompan la app. En SSR devuelve `empty()`.
   */
  private read(): StudyData {
    if (typeof localStorage === 'undefined') return this.empty();
    const stored = localStorage.getItem(this.key());
    return stored ? { ...this.empty(), ...JSON.parse(stored) } as StudyData : this.empty();
  }

  /** Escribe el estado completo (no hace nada en SSR). */
  private write(data: StudyData): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(this.key(), JSON.stringify(data));
  }

  /** Estado inicial/migración: todos los campos con valores neutros. */
  private empty(): StudyData {
    return {
      searches: 0,
      savedDocuments: [],
      uploadedFiles: [],
      studySessions: 0,
      customMaterias: [],
      deletedMateriaIds: [],
      tasks: [],
      events: []
    };
  }

  // ------------------------- Estadísticas -------------------------

  /** +1 búsqueda (lo llama la página principal al buscar). */
  recordSearch(): void {
    const data = this.read();
    data.searches += 1;
    this.write(data);
  }

  /** +1 sesión de estudio. */
  recordSession(): void {
    const data = this.read();
    data.studySessions += 1;
    this.write(data);
  }

  /** Registra el nombre de un archivo subido. */
  recordUpload(fileName: string): void {
    const data = this.read();
    data.uploadedFiles = [...data.uploadedFiles, fileName];
    this.write(data);
  }

  // -------------------- Documentos guardados ----------------------

  /** Guarda un documento evitando duplicados por `id`. */
  saveDocument(document: SavedDocument): void {
    const data = this.read();
    if (!data.savedDocuments.some(item => item.id === document.id)) {
      data.savedDocuments = [...data.savedDocuments, document];
      this.write(data);
    }
  }

  /** Quita un documento guardado. */
  removeSavedDocument(id: string): void {
    const data = this.read();
    data.savedDocuments = data.savedDocuments.filter(document => document.id !== id);
    this.write(data);
  }

  /** Documentos guardados; opcionalmente filtrados por materia. */
  getSavedDocuments(materia?: string): SavedDocument[] {
    const documents = this.read().savedDocuments;
    return materia ? documents.filter(document => document.materia === materia) : documents;
  }

  /** Estado completo (lo usa la página de estadísticas). */
  getStats(): StudyData {
    return this.read();
  }

  // --------------------------- Materias ---------------------------

  /** Añade una materia personalizada (id implícito = 1000 + índice). */
  addMateria(name: string, description: string): void {
    const data = this.read();
    data.customMaterias = [...data.customMaterias, { name, description }];
    this.write(data);
  }

  /**
   * Borra una materia.
   *
   * - id >= 1000: personalizada -> se quita del array por índice.
   * - id < 1000: integrada -> se marca en `deletedMateriaIds` (la lista de
   *   integradas vive en el código, no en localStorage).
   */
  removeMateria(id: number): void {
    const data = this.read();
    if (id >= 1000) {
      const customIndex = id - 1000;
      data.customMaterias = data.customMaterias.filter((_, index) => index !== customIndex);
    } else if (!data.deletedMateriaIds.includes(id)) {
      data.deletedMateriaIds = [...data.deletedMateriaIds, id];
    }
    this.write(data);
  }

  /** Cambios de materias para que `materias` calcule la lista efectiva. */
  getMateriaChanges(): Pick<StudyData, 'customMaterias' | 'deletedMateriaIds'> {
    const data = this.read();
    return { customMaterias: data.customMaterias, deletedMateriaIds: data.deletedMateriaIds };
  }

  // ------------------------------------------------------------------
  // Tareas y eventos: se guardan en localStorage por usuario y los
  // comparten las pestañas Tareas y Calendario.
  // ------------------------------------------------------------------

  /**
   * Genera un id local legible: `<prefijo>-<base36 de Date.now>-<8 chars>`.
   * Usa `crypto.randomUUID()` si existe; si no, `Math.random`.
   */
  private id(prefijo: string): string {
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return `${prefijo}-${Date.now().toString(36)}-${random}`;
  }

  /** Tareas guardadas, migrando adjuntos antiguos al formato `documents[]`. */
  getTasks(): Task[] {
    const tareas = this.read().tasks ?? [];
    return tareas.map(task => this.migrateTaskAttachments(task));
  }

  /**
   * Crea una tarea local y sincroniza su evento.
   *
   * El id y los timestamps se generan aquí (el "backend" local es este método).
   * EFECTO: escribe en localStorage y devuelve la tarea creada.
   */
  addTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const data = this.read();
    const now = new Date().toISOString();
    const nueva: Task = { ...task, id: this.id('tarea'), createdAt: now, updatedAt: now };
    data.tasks = [...(data.tasks ?? []), nueva];
    this.sincronizaEventoDeTarea(data, nueva);
    this.write(data);
    return nueva;
  }

  /**
   * Actualiza una tarea local (fusión superficial) y su evento.
   *
   * Devuelve la tarea actualizada o null si no existía. `updatedAt` se refresca.
   */
  updateTask(id: string, cambios: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | null {
    const data = this.read();
    let actualizada: Task | null = null;
    data.tasks = (data.tasks ?? []).map(task => {
      if (task.id !== id) return task;
      actualizada = { ...task, ...cambios, updatedAt: new Date().toISOString() };
      return actualizada;
    });
    if (actualizada) {
      this.sincronizaEventoDeTarea(data, actualizada);
      this.write(data);
    }
    return actualizada;
  }

  /**
   * Mantiene el evento del calendario sincronizado con la tarea: si tiene fecha
   * lo crea o actualiza, y si se le quita la fecha lo elimina. Asi no quedan
   * eventos sueltos al editar desde Tareas ni entradas duplicadas.
   *
   * No escribe: muta `data.events`; el llamador hace `write`.
   */
  private sincronizaEventoDeTarea(data: StudyData, task: Task): void {
    const eventos = data.events ?? [];
    const existente = eventos.find(event => event.taskId === task.id);

    if (!task.dueDate) {
      // Sin fecha: el evento vinculado desaparece.
      data.events = eventos.filter(event => event.taskId !== task.id);
      return;
    }

    const cambios: Omit<CalendarEvent, 'id'> = {
      title: task.title,
      description: task.subject || task.description || undefined,
      date: task.dueDate,
      hour: task.dueTime,
      type: task.type,
      color: task.type === 'trabajo' ? 'homework' : task.type === 'evento' ? 'event' : 'task',
      taskId: task.id,
      documents: task.documents?.length ? task.documents : undefined
    };

    // Actualiza el evento existente o añade uno nuevo con id local.
    data.events = existente
      ? eventos.map(event => (event.id === existente.id ? { ...event, ...cambios } : event))
      : [...eventos, { ...cambios, id: this.id('evento') }];
  }

  /** Alterna completada y ajusta `status` (`done`/`pending`). */
  toggleTask(id: string): void {
    const task = this.getTasks().find(item => item.id === id);
    if (!task) return;
    this.updateTask(id, { completed: !task.completed, status: !task.completed ? 'done' : 'pending' });
  }

  /** Borra la tarea y, si tenía, su evento vinculado. */
  removeTask(id: string): void {
    const data = this.read();
    data.tasks = (data.tasks ?? []).filter(task => task.id !== id);
    // Una tarea con fecha también vive en el calendario: se borra alli tambien.
    data.events = (data.events ?? []).filter(event => event.taskId !== id);
    this.write(data);
  }

  /**
   * Datos antiguos guardaban un unico adjunto en campos sueltos
   * (documentId/documentName/documentUrl) o en `files`. Se normalizan a
   * `documents: TaskDocument[]` al leerlos, sin tocar localStorage.
   *
   * Es una migración "en lectura": se aplica cada vez que se llama a
   * `getTasks()`, pero no se persiste. Si quieres persistirla, escribe el
   * resultado en `addTask`/`updateTask`.
   */
  private migrateTaskAttachments(t: Task): Task {
    if (Array.isArray(t.documents) && t.documents.length > 0) return t;

    const anyT = t as any;
    const documentos: TaskDocument[] = [];

    // Formato singular antiguo.
    if (anyT.documentId || anyT.documentName) {
      documentos.push({
        id: anyT.documentId || undefined,
        name: anyT.documentName || anyT.nombre || 'Documento',
        url: anyT.documentUrl || undefined,
        origin: 'biblioteca'
      });
    }

    // Formato `files: []`.
    if (Array.isArray(anyT.files)) {
      for (const f of anyT.files) {
        if (f && (f.name || f.nombre)) {
          documentos.push({
            id: f.id || undefined,
            name: f.name || f.nombre,
            url: f.url || undefined,
            origin: 'biblioteca'
          });
        }
      }
    }

    if (documentos.length === 0) return t;

    // Elimina los campos viejos y deja solo `documents`.
    const { documentId, documentName, documentUrl, documentType, files, ...rest } = anyT;
    return { ...rest, documents: documentos } as Task;
  }

  /** Eventos guardados; normaliza `documents` a array o undefined. */
  getEvents(): CalendarEvent[] {
    const eventos = this.read().events ?? [];
    return eventos.map(event => ({
      ...event,
      documents: Array.isArray(event.documents) ? event.documents : undefined
    }));
  }

  /** Crea un evento local con id generado. (No crea la tarea vinculada: lo hace el store.) */
  addEvent(event: Omit<CalendarEvent, 'id'>): CalendarEvent {
    const data = this.read();
    const nuevo: CalendarEvent = { ...event, id: this.id('evento') };
    data.events = [...(data.events ?? []), nuevo];
    this.write(data);
    return nuevo;
  }

  /** Actualiza un evento local; devuelve el evento o null si no existía. */
  updateEvent(id: string, cambios: Partial<Omit<CalendarEvent, 'id'>>): CalendarEvent | null {
    const data = this.read();
    let actualizado: CalendarEvent | null = null;
    data.events = (data.events ?? []).map(event => {
      if (event.id !== id) return event;
      actualizado = { ...event, ...cambios };
      return actualizado;
    });
    if (actualizado) this.write(data);
    return actualizado;
  }

  /** Borra un evento local (no toca la tarea vinculada). */
  removeEvent(id: string): void {
    const data = this.read();
    data.events = (data.events ?? []).filter(event => event.id !== id);
    this.write(data);
  }
}
