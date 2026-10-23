import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { apiBaseUrl } from '../config/runtime-config';
import { AuthService } from './auth.service';

export interface RealtimeEvent {
  type: string;
  entity: string;
  action: string;
  data: any;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly base = apiBaseUrl();
  private eventSource?: EventSource;
  private readonly subject = new Subject<RealtimeEvent>();
  readonly events$ = this.subject.asObservable();

  connect(): void {
    if (this.eventSource || typeof EventSource === 'undefined') {
      return;
    }
    const token = this.auth.getToken();
    if (!token) {
      return;
    }
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

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = undefined;
  }
}
