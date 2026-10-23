/**
 * Tiempo real (Server-Sent Events) del lado cliente.
 *
 * - Abre UNA sola conexión `GET /events/stream?token=...` por pestaña.
 *   El token va en la query porque `EventSource` no permite cabeceras.
 * - Cada evento `update` se parsea y se emite por `events$` como
 *   `{type, entity, action, data}`.
 * - `EventSource` reconecta solo si se cae; no hay lógica de reintento propia.
 *
 * CÓMO REACCIONAR A UN EVENTO EN UNA PÁGINA
 *   this.realtime.events$.subscribe(evt => {
 *     if (evt.entity === 'tasks') this.cargar();
 *   });
 *   (Recuerda: el estado afectado debe ser `signal` por ser zoneless.)
 * CÓMO AÑADIR UN TIPO DE EVENTO
 *   - No hay que tocar nada aquí: el backend manda `entity`/`action` y cada
 *     página filtra por `entity`. Los nombres válidos están en
 *     `backend/app/realtime.py`.
 * CÓMO DESACTIVAR EL TIEMPO REAL
 *   - No llames a `connect()` en `app.ts`.
 */

import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { apiBaseUrl } from '../config/runtime-config';
import { AuthService } from './auth.service';

/** Forma de un evento SSE del backend. */
export interface RealtimeEvent {
  type: string;    // p. ej. "tasks.created"
  entity: string;  // "tasks" | "calendar" | "documents" | "messages" | "contacts" | "profile"
  action: string;  // "created" | "updated" | "deleted"
  data: any;       // carga útil (varía por entidad)
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly base = apiBaseUrl();
  private eventSource?: EventSource;
  // `Subject` (no BehaviorSubject): los eventos son efímeros, no estado.
  private readonly subject = new Subject<RealtimeEvent>();
  /** Stream público al que se suscriben las páginas. */
  readonly events$ = this.subject.asObservable();

  /**
   * Abre la conexión SSE si hay sesión y no había una abierta.
   *
   * Idempotente: llamar dos veces no duplica la conexión. En SSR
   * (`EventSource === undefined`) no hace nada.
   * EFECTO: crea un `EventSource` y empieza a emitir por `events$`.
   */
  connect(): void {
    if (this.eventSource || typeof EventSource === 'undefined') {
      return;
    }
    const token = this.auth.getToken();
    if (!token) {
      return;
    }
    // `encodeURIComponent` protege el token si trae caracteres especiales.
    const url = `${this.base}/events/stream?token=${encodeURIComponent(token)}`;
    this.eventSource = new EventSource(url);
    this.eventSource.addEventListener('update', (evt: MessageEvent) => {
      try {
        this.subject.next(JSON.parse(evt.data));
      } catch {
        // Ignorar eventos malformados.
      }
    });
    this.eventSource.onerror = () => {
      // EventSource reintenta automáticamente.
    };
  }

  /** Cierra la conexión (logout/desmontaje). Es seguro llamarlo varias veces. */
  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = undefined;
  }
}
