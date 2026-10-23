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

  updateTask(id: string, cambios: Partial<Omit<Task, 'id' | 'createdAt'>>): void {
    if (this.auth.isLoggedIn()) {
      const payload: any = { ...cambios };
      if ('dueDate' in cambios) payload.dueDate = cambios.dueDate;
      if ('dueTime' in cambios) payload.dueTime = cambios.dueTime;
      this.taskService.updateTask(id, payload).subscribe();
    }
    this.studyData.updateTask(id, cambios);
  }

  removeTask(id: string): void {
    if (this.auth.isLoggedIn()) {
      this.taskService.deleteTask(id).subscribe();
    }
    this.studyData.removeTask(id);
  }

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

  removeEvent(id: string): void {
    if (this.auth.isLoggedIn()) {
      this.taskService.deleteEvent(id).subscribe();
    }
    this.studyData.removeEvent(id);
  }
}
