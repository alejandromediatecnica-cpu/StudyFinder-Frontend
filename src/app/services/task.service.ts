/**
 * Cliente HTTP de tareas y eventos (capa "transporte").
 *
 * Solo hace las peticiones y tipa las respuestas (`ApiTask`, `ApiEvent`). La
 * lógica de negocio (signals, sincronización tarea<->evento, fallback local,
 * SSE) vive en `TaskStoreService`, que es lo que usan las páginas.
 *
 * RUTAS:
 *   /tasks                     GET, POST, DELETE (masivo)
 *   /tasks/{id}                PATCH, DELETE
 *   /calendar                  GET, POST
 *   /calendar/{id}             PATCH, DELETE
 *
 * CÓMO AÑADIR UN ENDPOINT DE TAREAS
 *   - Añade el método aquí y, si es una operación de usuario, expón un método
 *     en `TaskStoreService` que actualice los signals.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiBaseUrl } from '../config/runtime-config';
import { AuthService } from './auth.service';

/** Tarea tal como la devuelve la API (camelCase). */
export interface ApiTask {
  id: string;
  title: string;
  subject?: string;
  dueDate?: string;
  dueTime?: string;
  status: string;
  type?: string;
  completed: boolean;
  description?: string;
  documents?: any[];
  createdAt?: string;
  updatedAt?: string;
}

/** Evento de calendario tal como lo devuelve la API. */
export interface ApiEvent {
  id: string;
  title: string;
  date: string;
  hour?: string;
  type?: string;
  subject?: string;
  description?: string;
  documents?: any[];
  taskId?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = apiBaseUrl();

  /** Cabecera Bearer o vacía (el backend responderá 401). */
  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  // ---------------------------- Tareas ----------------------------

  /** Todas las tareas del usuario, más recientes primero. */
  listTasks(): Observable<ApiTask[]> {
    return this.http.get<ApiTask[]>(`${this.base}/tasks`, { headers: this.headers() });
  }

  /** Crea una tarea (el backend rellena id, timestamps y `completed`). */
  createTask(task: Partial<ApiTask>): Observable<ApiTask> {
    return this.http.post<ApiTask>(`${this.base}/tasks`, task, { headers: this.headers() });
  }

  /** Actualiza parcialmente una tarea. */
  updateTask(id: string, changes: Partial<ApiTask>): Observable<ApiTask> {
    return this.http.patch<ApiTask>(`${this.base}/tasks/${encodeURIComponent(id)}`, changes, { headers: this.headers() });
  }

  /** Borra una tarea. */
  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tasks/${encodeURIComponent(id)}`, { headers: this.headers() });
  }

  /** Borra todas las tareas y eventos del usuario en una sola peticion. */
  deleteAllTasks(): Observable<void> {
    return this.http.delete<void>(`${this.base}/tasks`, { headers: this.headers() });
  }

  // ---------------------------- Eventos ----------------------------

  /** Todos los eventos, ordenados por fecha ascendente. */
  listEvents(): Observable<ApiEvent[]> {
    return this.http.get<ApiEvent[]>(`${this.base}/calendar`, { headers: this.headers() });
  }

  /** Crea un evento (`taskId` opcional vincula el evento a una tarea). */
  createEvent(event: Partial<ApiEvent>): Observable<ApiEvent> {
    return this.http.post<ApiEvent>(`${this.base}/calendar`, event, { headers: this.headers() });
  }

  /** Actualiza parcialmente un evento. */
  updateEvent(id: string, changes: Partial<ApiEvent>): Observable<ApiEvent> {
    return this.http.patch<ApiEvent>(`${this.base}/calendar/${encodeURIComponent(id)}`, changes, { headers: this.headers() });
  }

  /** Borra un evento (no borra la tarea vinculada: eso lo decide el store). */
  deleteEvent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/calendar/${encodeURIComponent(id)}`, { headers: this.headers() });
  }
}
