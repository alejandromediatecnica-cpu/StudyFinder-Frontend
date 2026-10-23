/**
 * Fuente de verdad de tareas y eventos para toda la app.
 *
 * DOS MODOS
 *   - Con sesión: el backend (Mongo) manda. Se lee al cargar/refrescar y cada
 *     mutación hace la petición y actualiza los signals al recibir respuesta.
 *   - Sin sesión (invitado): se delega en `StudyDataService` (localStorage).
 *
 * SINCRONIZACIÓN TAREA <-> EVENTO (invariante central)
 *   Una tarea con `dueDate` tiene EXACTAMENTE UN evento de calendario vinculado
 *   por `taskId`; un evento suelto (creado en el calendario) tiene EXACTAMENTE
 *   UNA tarea. Todas las mutaciones pasan por:
 *     - `syncEventForTask`    (tarea -> evento)
 *     - `vincularTareaAEvento`/`reconciliarEventosSinTarea` (evento -> tarea)
 *   No crees eventos "a mano" en las páginas: romperías el invariante.
 *
 * TIEMPO REAL
 *   Se suscribe a `RealtimeService.events$` y refresca ante `tasks`/`calendar`.
 *   `wiping` silencia los SSE intermedios durante el borrado masivo y
 *   `reconciliando` evita crear dos tareas para el mismo evento.
 *
 * ESTADO
 *   Todo son `signal()` porque la app es zoneless: si actualizas una propiedad
 *   normal dentro de `subscribe`, la vista no se entera.
 *
 * CÓMO AÑADIR UN CAMPO A LA TAREA
 *   1. `Task` en `study-data.service.ts`.
 *   2. `ApiTask` en `task.service.ts`.
 *   3. Mapea en `toTask` y envía en `createTask`/`updateTask`.
 *   4. Para que llegue al evento, añádelo también en `syncEventForTask`.
 */

import { Injectable, inject, signal } from '@angular/core';
import { forkJoin, from, of } from 'rxjs';
import { catchError, defaultIfEmpty, filter, mergeMap } from 'rxjs/operators';
import { ApiEvent, ApiTask, TaskService } from './task.service';
import { AuthService } from './auth.service';
import { RealtimeService } from './realtime.service';
import { CalendarEvent, StudyDataService, Task } from './study-data.service';

/**
 * Fuente de verdad de tareas y eventos. Con sesion activa lee y escribe en el
 * backend; sin sesion (invitado) usa el almacenamiento local existente.
 *
 * El estado vive en signals porque la aplicacion corre sin zone.js.
 */
@Injectable({ providedIn: 'root' })
export class TaskStoreService {
  private readonly taskService = inject(TaskService);
  private readonly auth = inject(AuthService);
  private readonly local = inject(StudyDataService);
  private readonly realtime = inject(RealtimeService);

  /** Tareas visibles en toda la app (panel, tareas, calendario). */
  readonly tasks = signal<Task[]>([]);
  /** Eventos del calendario (incluye los vinculados a tareas). */
  readonly events = signal<CalendarEvent[]>([]);
  /** True mientras hay una carga en curso (para spinners). */
  readonly loading = signal(false);
  /** Último error de carga/mutación, para mostrar aviso. */
  readonly error = signal<string | null>(null);

  // Banderas internas (no reactivas): evitan cargas y suscripciones repetidas.
  private loaded = false;
  private listening = false;

  /** Mientras se vacian todas las tareas se ignoran los refrescos del SSE. */
  private wiping = false;

  /** Ids de eventos cuya tarea de respaldo se esta creando (evita duplicados). */
  private readonly reconciliando = new Set<string>();

  constructor() {
    // Refresco en vivo: cualquier cambio de tareas o calendario en otro
    // dispositivo/pestaña recarga el estado sin recargar la pagina.
    this.startListening();
  }

  /**
   * Se suscribe una sola vez a los eventos SSE relevantes.
   *
   * Filtra por `entity`: `tasks` o `calendar`. Ante cualquier evento, `refresh()`
   * (simple y consistente; no se intenta aplicar deltas).
   */
  private startListening(): void {
    if (this.listening) return;
    this.listening = true;
    this.realtime.events$
      .pipe(filter(event => event.entity === 'tasks' || event.entity === 'calendar'))
      .subscribe(() => this.refresh());
  }

  /**
   * Recarga tareas y eventos.
   *
   * - Invitado: lee localStorage y termina.
   * - Logueado: `forkJoin` de tareas+eventos. Si CUALQUIERA falla (`catchError`
   *   -> null), se cae a los datos locales y se muestra `error`; así la UI nunca
   *   se queda vacía por un fallo de red.
   * - Tras cargar eventos, reconcilia los que no tienen tarea.
   * EFECTOS: escribe `tasks`, `events`, `loading`, `error`; puede crear tareas
   * en el backend (reconciliación).
   */
  refresh(): void {
    // Durante un borrado masivo los SSE intermedios no deben repoblar el estado.
    if (this.wiping) return;
    this.loading.set(true);
    this.error.set(null);

    if (!this.auth.isLoggedIn()) {
      this.tasks.set(this.local.getTasks());
      this.events.set(this.local.getEvents());
      this.loading.set(false);
      this.loaded = true;
      return;
    }

    forkJoin({
      tasks: this.taskService.listTasks().pipe(catchError(() => of(null))),
      events: this.taskService.listEvents().pipe(catchError(() => of(null)))
    }).subscribe(({ tasks, events }) => {
      if (tasks === null || events === null) {
        // Fallback: datos locales + aviso.
        this.error.set('No se pudieron cargar las tareas. Se muestran los datos locales.');
        this.tasks.set(this.local.getTasks());
        this.events.set(this.local.getEvents());
      } else {
        this.tasks.set(tasks.map(task => this.toTask(task)));
        const eventos = events.map(event => this.toEvent(event));
        this.events.set(eventos);
        // Eventos sueltos (sin tarea) tambien cuentan como tareas: se recuperan
        // aqui para que aparezcan en la pantalla de inicio y en Mis tareas.
        this.reconciliarEventosSinTarea(eventos);
      }
      this.loading.set(false);
      this.loaded = true;
    });
  }

  /** Crea la tarea que falte para los eventos que no esten vinculados a ninguna. */
  private reconciliarEventosSinTarea(eventos: CalendarEvent[]): void {
    const pendientes = new Set(eventos.map(evento => evento.id));
    // Un evento ya vinculado se olvida: la reconciliacion termino para el.
    for (const id of this.reconciliando) {
      if (!pendientes.has(id)) this.reconciliando.delete(id);
    }
    for (const evento of eventos) {
      if (evento.taskId) {
        this.reconciliando.delete(evento.id);
        continue;
      }
      // Idempotente: no se crea una segunda tarea mientras la primera siga en
      // vuelo, ni aunque llegue otro refresh disparado por el evento SSE.
      if (this.reconciliando.has(evento.id)) continue;
      this.reconciliando.add(evento.id);
      this.taskService.createTask({
        title: evento.title,
        dueDate: evento.date,
        dueTime: evento.hour,
        status: 'pending',
        type: evento.type ?? 'tarea',
        description: evento.description,
        documents: evento.documents
      }).subscribe({
        next: created => {
          const tarea = this.toTask(created);
          // Se añade al principio (el backend lista por created_at desc).
          this.tasks.update(list => [tarea, ...list]);
          // Vincula el evento con la tarea recién creada (sin propagar de vuelta).
          this.updateEvent(evento.id, { taskId: tarea.id }, false);
        },
        error: () => this.reconciliando.delete(evento.id)
      });
    }
  }

  /** Carga diferida: util para componentes que llegan despues del layout. */
  ensureLoaded(): void {
    if (!this.loaded) this.refresh();
  }

  // ------------------------------------------------------------------
  // Tareas
  // ------------------------------------------------------------------

  /**
   * Crea una tarea.
   *
   * - Invitado: local (y relocaliza tareas/eventos).
   * - Logueado: POST; al volver, actualiza el signal y sincroniza el evento
   *   (`syncEventForTask`), que lo crea/actualiza/borra según `dueDate`.
   */
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): void {
    if (!this.auth.isLoggedIn()) {
      this.local.addTask(task);
      this.tasks.set(this.local.getTasks());
      this.events.set(this.local.getEvents());
      return;
    }
    this.taskService.createTask({
      title: task.title,
      subject: task.subject,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      status: task.status,
      type: task.type ?? 'tarea',
      description: task.description,
      documents: task.documents
    }).subscribe({
      next: created => {
        this.tasks.update(list => [this.toTask(created), ...list]);
        this.syncEventForTask(this.toTask(created));
      },
      error: () => this.error.set('No se pudo crear la tarea.')
    });
  }

  /**
   * Actualiza una tarea (parcial).
   *
   * Se envían todos los campos (aunque sean undefined) para que el backend aplique
   * `$set` solo de los presentes; tras la respuesta se reemplaza en el signal y
   * se re-sincroniza el evento.
   */
  updateTask(id: string, changes: Partial<Omit<Task, 'id' | 'createdAt'>>): void {
    if (!this.auth.isLoggedIn()) {
      this.local.updateTask(id, changes);
      this.tasks.set(this.local.getTasks());
      this.events.set(this.local.getEvents());
      return;
    }
    this.taskService.updateTask(id, {
      title: changes.title,
      subject: changes.subject,
      dueDate: changes.dueDate,
      dueTime: changes.dueTime,
      status: changes.status,
      type: changes.type,
      description: changes.description,
      completed: changes.completed,
      documents: changes.documents
    } as any).subscribe({
      next: updated => {
        const tarea = this.toTask(updated);
        this.tasks.update(list => list.map(item => (item.id === id ? tarea : item)));
        this.syncEventForTask(tarea);
      },
      error: () => this.error.set('No se pudo actualizar la tarea.')
    });
  }

  /**
   * Borra una tarea y su evento vinculado.
   *
   * - Localiza el evento por `taskId` ANTES de borrar.
   * - DELETE de la tarea; al ok, quita ambos del estado y borra el evento en el
   *   backend con `propagarATarea=false` (la tarea ya no existe).
   */
  removeTask(id: string): void {
    if (!this.auth.isLoggedIn()) {
      this.local.removeTask(id);
      this.tasks.set(this.local.getTasks());
      this.events.set(this.local.getEvents());
      return;
    }
    const evento = this.events().find(item => item.taskId === id);
    this.taskService.deleteTask(id).subscribe({
      next: () => {
        this.tasks.update(list => list.filter(item => item.id !== id));
        this.events.update(list => list.filter(event => event.taskId !== id));
        // El evento vinculado también desaparece en el backend.
        if (evento) this.removeEvent(evento.id, false);
      },
      error: () => this.error.set('No se pudo eliminar la tarea.')
    });
  }

  /** Marca/desmarca completada. Mantiene `status` coherente (`done`/`pending`). */
  toggleTask(id: string): void {
    const task = this.tasks().find(item => item.id === id);
    if (!task) return;
    this.updateTask(id, { completed: !task.completed, status: !task.completed ? 'done' : 'pending' });
  }

  /**
   * Elimina todas las tareas de la cuenta. En este modelo cada evento del
   * calendario es tambien una tarea, asi que se borran todos los eventos para
   * que la reconciliacion no vuelva a crearlas.
   *
   * Estrategia:
   *   1. Invitado: borra uno a uno en local.
   *   2. Logueado: `wiping=true` (ignora SSE) y llama a `DELETE /tasks` (masivo).
   *      Si el backend no lo soporta, fallback: borra tarea a tarea y evento a
   *      evento con concurrencia 5 (`mergeMap(..., 5)`) porque el navegador
   *      limita conexiones por host.
   *   3. `alTerminar` limpia signals, desactiva `wiping` y hace un `refresh()`
   *      autoritativo.
   *
   * ADVERTENCIA: no se puede deshacer (la UI pide doble confirmación).
   */
  removeAllTasks(): void {
    if (!this.auth.isLoggedIn()) {
      for (const task of this.local.getTasks()) this.local.removeTask(task.id);
      for (const event of this.local.getEvents()) this.local.removeEvent(event.id);
      this.tasks.set(this.local.getTasks());
      this.events.set(this.local.getEvents());
      return;
    }
    const taskIds = this.tasks().map(task => task.id);
    const eventIds = this.events().map(event => event.id);
    if (!taskIds.length && !eventIds.length) return;
    // Se bloquea el refresco para que ningun SSE intermedio restaure tareas a
    // medio borrar; al final se hace un unico refresco autoritativo.
    this.wiping = true;
    const alTerminar = () => {
      this.tasks.set([]);
      this.events.set([]);
      this.error.set(null);
      this.wiping = false;
      this.refresh();
    };
    // Preferencia: un solo DELETE borra todo en el servidor. Si el backend no
    // lo soporta, se cae al borrado individual en tandas pequenas (el navegador
    // limita las conexiones por host, por eso no se lanzan todas a la vez).
    this.taskService.deleteAllTasks().subscribe({
      next: alTerminar,
      error: () => {
        const solicitudes = [
          ...taskIds.map(id => this.taskService.deleteTask(id).pipe(catchError(() => of(null)))),
          ...eventIds.map(id => this.taskService.deleteEvent(id).pipe(catchError(() => of(null))))
        ];
        from(solicitudes)
          .pipe(mergeMap(solicitud => solicitud, 5), defaultIfEmpty(null))
          .subscribe({ complete: alTerminar });
      }
    });
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------

  /**
   * Crea un evento.
   *
   * - Invitado: si el evento NO viene de una tarea (`taskId`), se replica como
   *   tarea local; luego se refrescan ambas listas.
   * - Logueado: POST; al volver se añade al signal y, si es un evento suelto,
   *   se le crea su tarea (`vincularTareaAEvento`).
   */
  createEvent(event: Omit<CalendarEvent, 'id'>): void {
    if (!this.auth.isLoggedIn()) {
      const nuevo = this.local.addEvent(event);
      // Un evento del calendario también es una tarea: se replica en local.
      if (!event.taskId) this.local.addTask(this.eventoATarea(nuevo));
      this.events.set(this.local.getEvents());
      this.tasks.set(this.local.getTasks());
      return;
    }
    this.taskService.createEvent({
      title: event.title,
      date: event.date,
      hour: event.hour,
      type: event.type,
      description: event.description,
      documents: event.documents,
      taskId: event.taskId
    }).subscribe({
      next: created => {
        this.events.update(list => [...list, this.toEvent(created)]);
        // Solo los eventos sueltos generan una tarea; los que ya provienen de
        // una tarea (traen taskId) no deben duplicarla.
        if (!created.taskId) this.vincularTareaAEvento(this.toEvent(created));
      },
      error: () => this.error.set('No se pudo crear el evento.')
    });
  }

  /**
   * Actualiza un evento.
   *
   * `propagarATarea` (por defecto true) hace que los cambios se reflejen en la
   * tarea vinculada (título, fecha, hora, tipo, descripción, documentos). Se
   * pone a `false` cuando el origen del cambio YA es la tarea (evita bucles).
   * CÓMO AÑADIR UN CAMPO PROPAGABLE: en `eventoATareaCampos`.
   */
  updateEvent(id: string, changes: Partial<Omit<CalendarEvent, 'id'>>, propagarATarea = true): void {
    if (!this.auth.isLoggedIn()) {
      this.local.updateEvent(id, changes);
      if (propagarATarea) {
        const evento = this.local.getEvents().find(item => item.id === id);
        if (evento?.taskId) this.local.updateTask(evento.taskId, this.eventoATareaCampos(evento, changes));
      }
      this.events.set(this.local.getEvents());
      this.tasks.set(this.local.getTasks());
      return;
    }
    this.taskService.updateEvent(id, {
      title: changes.title,
      date: changes.date,
      hour: changes.hour,
      type: changes.type,
      description: changes.description,
      documents: changes.documents,
      taskId: changes.taskId
    }).subscribe({
      next: updated => {
        const evento = this.toEvent(updated);
        this.events.update(list => list.map(item => (item.id === id ? evento : item)));
        // Ya tiene tarea: la reconciliación deja de estar pendiente.
        if (evento.taskId) this.reconciliando.delete(id);
        // Refleja los cambios del evento en la tarea vinculada.
        if (propagarATarea && evento.taskId) {
          this.updateTask(evento.taskId, this.eventoATareaCampos(evento, changes) as any);
        }
      },
      error: () => {
        // Permite reintentar la reconciliación en el próximo refresh.
        this.reconciliando.delete(id);
        this.error.set('No se pudo actualizar el evento.');
      }
    });
  }

  /**
   * Borra un evento.
   *
   * `propagarATarea=true` borra también la tarea vinculada (comportamiento de
   * "un evento = una tarea"). Se usa false cuando quien borra es `removeTask`
   * o `syncEventForTask` (la tarea ya no debe tocarse).
   */
  removeEvent(id: string, propagarATarea = true): void {
    if (!this.auth.isLoggedIn()) {
      const evento = this.local.getEvents().find(item => item.id === id);
      this.local.removeEvent(id);
      // Borrar un evento suelto borra también su tarea vinculada.
      if (propagarATarea && evento?.taskId) this.local.removeTask(evento.taskId);
      this.events.set(this.local.getEvents());
      this.tasks.set(this.local.getTasks());
      return;
    }
    const evento = this.events().find(item => item.id === id);
    this.taskService.deleteEvent(id).subscribe({
      next: () => {
        this.events.update(list => list.filter(item => item.id !== id));
        if (propagarATarea && evento?.taskId) this.removeTask(evento.taskId);
      },
      error: () => this.error.set('No se pudo eliminar el evento.')
    });
  }

  // ------------------------------------------------------------------
  // Sincronizacion tarea <-> evento (misma logica que el almacen local)
  // ------------------------------------------------------------------

  /**
   * Mantiene el evento del calendario alineado con la tarea, sin duplicados.
   *
   * - Sin `dueDate`: borra el evento existente (la tarea se queda).
   * - Con `dueDate`: busca el evento por `taskId`; si existe lo actualiza (sin
   *   propagar de vuelta) y si no, lo crea.
   * - `color` se deriva del tipo para que el calendario pinte distinto.
   */
  private syncEventForTask(task: Task): void {
    const existente = this.events().find(event => event.taskId === task.id);
    if (!task.dueDate) {
      // El evento se borra porque ya no hay fecha, pero la tarea permanece.
      if (existente) this.removeEvent(existente.id, false);
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
    if (existente) {
      // No propagar de vuelta a la tarea: el origen ya es la tarea.
      this.updateEvent(existente.id, cambios, false);
    } else {
      this.createEvent(cambios);
    }
  }

  /**
   * Un evento creado en el calendario también cuenta como tarea. Crea la tarea
   * vinculada y deja el `taskId` en ambos lados para mantenerlos sincronizados.
   *
   * Solo se llama para eventos SIN `taskId` (los sueltos).
   */
  private vincularTareaAEvento(evento: CalendarEvent): void {
    if (!this.auth.isLoggedIn()) {
      this.tasks.set(this.local.getTasks());
      return;
    }
    this.taskService.createTask({
      title: evento.title,
      dueDate: evento.date,
      dueTime: evento.hour,
      status: 'pending',
      type: evento.type ?? 'tarea',
      description: evento.description,
      documents: evento.documents
    }).subscribe({
      next: created => {
        const tarea = this.toTask(created);
        this.tasks.update(list => [tarea, ...list]);
        // Enlaza el evento recién creado con su tarea.
        this.updateEvent(evento.id, { taskId: tarea.id }, false);
      },
      error: () => this.error.set('No se pudo crear la tarea del evento.')
    });
  }

  /** Traduce un evento a los campos de una tarea (para altas en local). */
  private eventoATarea(evento: CalendarEvent): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      title: evento.title,
      dueDate: evento.date,
      dueTime: evento.hour,
      status: 'pending',
      completed: false,
      type: evento.type ?? 'tarea',
      description: evento.description,
      documents: evento.documents?.length ? evento.documents : undefined
    };
  }

  /**
   * Campos de tarea que cambian cuando cambia el evento vinculado.
   *
   * Nota: `title` y `description` usan el cambio si viene y, si no, el valor
   * actual del evento; la fecha/hora se toman del evento ya actualizado.
   */
  private eventoATareaCampos(
    evento: CalendarEvent,
    changes: Partial<Omit<CalendarEvent, 'id'>>
  ): Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> {
    return {
      title: changes.title ?? evento.title,
      dueDate: evento.date,
      dueTime: evento.hour,
      type: (evento.type as Task['type']) ?? 'tarea',
      description: changes.description ?? evento.description,
      documents: evento.documents?.length ? evento.documents : undefined
    };
  }

  /**
   * API -> modelo de la UI.
   *
   * - Compone `due` (texto "YYYY-MM-DD HH:MM") para mostrar en listas.
   * - Normaliza defaults (`status`, `type`, `documents`, timestamps).
   * CÓMO AÑADIR UN CAMPO: añádelo aquí y en la interfaz `Task`.
   */
  private toTask(task: ApiTask): Task {
    return {
      id: task.id,
      title: task.title,
      subject: task.subject,
      due: task.dueDate ? `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}` : undefined,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      status: (task.status as Task['status']) || 'pending',
      type: (task.type as Task['type']) || 'tarea',
      completed: !!task.completed,
      description: task.description,
      documents: task.documents ?? [],
      createdAt: task.createdAt || '',
      updatedAt: task.updatedAt || ''
    };
  }

  /**
   * API -> modelo de la UI para eventos.
   *
   * `color` se deriva del tipo: trabajo -> homework, tarea -> task, resto ->
   * event. CÓMO CAMBIAR LOS COLORES: aquí y en `CalendarioComponent`.
   */
  private toEvent(event: ApiEvent): CalendarEvent {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      hour: event.hour,
      type: (event.type as CalendarEvent['type']) || 'evento',
      color: event.type === 'trabajo' ? 'homework' : event.type === 'tarea' ? 'task' : 'event',
      taskId: event.taskId,
      documents: event.documents ?? []
    };
  }
}
