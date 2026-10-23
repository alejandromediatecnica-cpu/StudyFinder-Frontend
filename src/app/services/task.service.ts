import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiBaseUrl } from '../config/runtime-config';
import { AuthService } from './auth.service';

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

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  listTasks(): Observable<ApiTask[]> {
    return this.http.get<ApiTask[]>(`${this.base}/tasks`, { headers: this.headers() });
  }

  createTask(task: Partial<ApiTask>): Observable<ApiTask> {
    return this.http.post<ApiTask>(`${this.base}/tasks`, task, { headers: this.headers() });
  }

  updateTask(id: string, changes: Partial<ApiTask>): Observable<ApiTask> {
    return this.http.patch<ApiTask>(`${this.base}/tasks/${encodeURIComponent(id)}`, changes, { headers: this.headers() });
  }

  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tasks/${encodeURIComponent(id)}`, { headers: this.headers() });
  }

  /** Borra todas las tareas y eventos del usuario en una sola peticion. */
  deleteAllTasks(): Observable<void> {
    return this.http.delete<void>(`${this.base}/tasks`, { headers: this.headers() });
  }

  listEvents(): Observable<ApiEvent[]> {
    return this.http.get<ApiEvent[]>(`${this.base}/calendar`, { headers: this.headers() });
  }

  createEvent(event: Partial<ApiEvent>): Observable<ApiEvent> {
    return this.http.post<ApiEvent>(`${this.base}/calendar`, event, { headers: this.headers() });
  }

  updateEvent(id: string, changes: Partial<ApiEvent>): Observable<ApiEvent> {
    return this.http.patch<ApiEvent>(`${this.base}/calendar/${encodeURIComponent(id)}`, changes, { headers: this.headers() });
  }

  deleteEvent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/calendar/${encodeURIComponent(id)}`, { headers: this.headers() });
  }
}
