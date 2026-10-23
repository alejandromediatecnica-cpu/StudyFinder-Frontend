/**
 * LEGADO / NO USAR: persistencia "dual" (backend + localStorage).
 *
 * Este servicio fue el primer intento de llevar tareas y eventos al backend:
 * enviaba la petición y, además, escribía en `StudyDataService` (localStorage).
 * Eso generaba duplicados y estados divergentes.
 *
 * Hoy NADIE lo inyecta (comprobado con búsqueda global). La implementación
 * vigente es `TaskStoreService`, que:
 *   - con sesión usa el backend como única fuente de verdad,
 *   - sin sesión usa solo localStorage,
 *   - mantiene signals y sincroniza por SSE.
 *
 * SE CONSERVA por si hace falta comparar comportamiento o recuperar algún
 * mapeo, pero NO se debe usar en componentes nuevos.
 *
 * CÓMO ELIMINARLO CON SEGURIDAD
 *   - Borra este archivo y su spec si existiera (hoy no hay spec propio);
 *     ningún import lo referencia.
 */

import { Injectable, inject } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TaskService, ApiTask, ApiEvent } from './task.service';
import { StudyDataService, Task, CalendarEvent } from './study-data.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TaskPersistenceService {
  private readonly taskService = inject(TaskService);
  private readonly studyData = inject(StudyDataService);
  private readonly auth = inject(AuthService);

  /**
   * Descarga tareas/eventos del backend pero NO los aplica a ningún estado
   * observable (el bloque de sincronización quedó a medias). Es una de las
   * razones por las que este servicio está en desuso.
   */
  sync(): void {
    if (!this.auth.isLoggedIn()) return;
    forkJoin({
      tasks: this.taskService.listTasks().pipe(catchError(() => of([] as ApiTask[]))),
      events: this.taskService.listEvents().pipe(catchError(() => of([] as ApiEvent[])))
    }).subscribe(({ tasks, events }) => {
      // Sincronizar con backend como fuente de verdad.
      // Los datos locales se mantienen solo si falla el backend.
      if (tasks.length === 0 && events.length === 0) {
        return;
      }
      // Mantenemos compatibilidad con StudyDataService para componentes existentes.
    });
  }

  /** Crea en backend (si hay sesión) y también en local: doble escritura. */
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): void {
    if (!this.auth.isLoggedIn()) {
      this.studyData.addTask(task);
      return;
    }
    this.taskService.createTask({
      title: task.title,
      subject: task.subject,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      status: task.status,
      completed: task.completed,
      description: task.description,
      documents: task.documents
    }).subscribe();
    this.studyData.addTask(task);
  }

  /** Actualiza en backend (si hay sesión) y en local. */
  updateTask(id: string, cambios: Partial<Omit<Task, 'id' | 'createdAt'>>): void {
    if (this.auth.isLoggedIn()) {
      const payload: any = { ...cambios };
      // Redundante: `cambios` ya trae camelCase. Se conserva tal cual.
      if ('dueDate' in cambios) payload.dueDate = cambios.dueDate;
      if ('dueTime' in cambios) payload.dueTime = cambios.dueTime;
      this.taskService.updateTask(id, payload).subscribe();
    }
    this.studyData.updateTask(id, cambios);
  }

  /** Borra en backend (si hay sesión) y en local. */
  removeTask(id: string): void {
    if (this.auth.isLoggedIn()) {
      this.taskService.deleteTask(id).subscribe();
    }
    this.studyData.removeTask(id);
  }

  /** Crea un evento en backend (si hay sesión) y en local. */
  createEvent(event: Omit<CalendarEvent, 'id'>): void {
    if (this.auth.isLoggedIn()) {
      this.taskService.createEvent({
        title: event.title,
        date: event.date,
        hour: event.hour,
        type: event.type,
        description: event.description,
        documents: event.documents,
        taskId: event.taskId
      } as any).subscribe();
    }
    this.studyData.addEvent(event);
  }

  /** Borra un evento en backend (si hay sesión) y en local. */
  removeEvent(id: string): void {
    if (this.auth.isLoggedIn()) {
      this.taskService.deleteEvent(id).subscribe();
    }
    this.studyData.removeEvent(id);
  }
}
