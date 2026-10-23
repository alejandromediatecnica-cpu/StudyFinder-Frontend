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

  readonly tasks = signal<Task[]>([]);
  readonly events = signal<CalendarEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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

  private startListening(): void {
    if (this.listening) return;
    this.listening = true;
    this.realtime.events$
      .pipe(filter(event => event.entity === 'tasks' || event.entity === 'calendar'))
      .subscribe(() => this.refresh());
  }

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
          this.tasks.update(list => [tarea, ...list]);
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

  toggleTask(id: string): void {
    const task = this.tasks().find(item => item.id === id);
    if (!task) return;
    this.updateTask(id, { completed: !task.completed, status: !task.completed ? 'done' : 'pending' });
  }

  /**
   * Elimina todas las tareas de la cuenta. En este modelo cada evento del
   * calendario es tambien una tarea, asi que se borran todos los eventos para
   * que la reconciliacion no vuelva a crearlas.
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
        if (evento.taskId) this.reconciliando.delete(id);
        // Refleja los cambios del evento en la tarea vinculada.
        if (propagarATarea && evento.taskId) {
          this.updateTask(evento.taskId, this.eventoATareaCampos(evento, changes) as any);
        }
      },
      error: () => {
        this.reconciliando.delete(id);
        this.error.set('No se pudo actualizar el evento.');
      }
    });
  }

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

  /** Mantiene el evento del calendario alineado con la tarea, sin duplicados. */
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

  /** Campos de tarea que cambian cuando cambia el evento vinculado. */
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
