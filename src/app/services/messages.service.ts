/**
 * API de contactos y chat (la usa `pages/mensajes`).
 *
 * Agrupa en un solo servicio endpoints de dos routers del backend:
 *   - Contactos: /users/search, /contacts/...
 *   - Mensajes:  /messages/{otroId}
 *   - Adjuntos:  /messages/files/{owner}/{archivo}
 *
 * REGLA DEL BACKEND: solo se puede leer/escribir mensajes con contactos en
 * estado `aceptado` (si no, 403). La UI debe reflejar ese flujo (buscar ->
 * solicitud -> aceptar -> chatear).
 *
 * CÓMO MOSTRAR UNA IMAGEN ADJUNTA
 *   `attachmentUrl(path)` construye la URL, pero el endpoint exige Bearer; un
 *   `<img src>` no lo envía. Para imágenes habría que descargarlas como blob
 *   con `HttpClient` (igual que en el avatar).
 * CÓMO AÑADIR "NO LEÍDOS"
 *   - El backend ya guarda `leido: False`; falta endpoint y, aquí, un método.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { apiBaseUrl } from '../config/runtime-config';

@Injectable({ providedIn: 'root' })
export class MessagesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = apiBaseUrl();

  /** Cabecera Bearer o vacía. */
  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    if (token) {
      return new HttpHeaders({ Authorization: `Bearer ${token}` });
    }
    return new HttpHeaders();
  }

  /** Perfil del usuario actual (id/nombre/email). */
  getMe() {
    return this.http.get<any>(`${this.base}/users/me`, { headers: this.headers() });
  }

  /** Busca usuarios por nombre parcial (mínimo 2 letras). Devuelve hasta 20. */
  search(nombre: string) {
    return this.http.get<any[]>(`${this.base}/users/search`, {
      params: { nombre },
      headers: this.headers(),
    });
  }

  /** Contactos aceptados: [{contact_id, otro: {id, name, email}, updated_at}]. */
  contacts() {
    return this.http.get<any[]>(`${this.base}/contacts/`, { headers: this.headers() });
  }

  /** Solicitudes pendientes recibidas. */
  incoming() {
    return this.http.get<any[]>(`${this.base}/contacts/requests/incoming`, { headers: this.headers() });
  }

  /** Solicitudes pendientes enviadas. */
  outgoing() {
    return this.http.get<any[]>(`${this.base}/contacts/requests/outgoing`, { headers: this.headers() });
  }

  /** Envía una solicitud de contacto (`usuario_id` = id del otro usuario). */
  sendRequest(usuarioId: string) {
    return this.http.post<any>(
      `${this.base}/contacts/requests`,
      { usuario_id: usuarioId },
      { headers: this.headers() }
    );
  }

  /** Acepta una solicitud por el `_id` de la relación (contact_id). */
  accept(id: string) {
    return this.http.post<void>(
      `${this.base}/contacts/requests/${id}/accept`,
      {},
      { headers: this.headers() }
    );
  }

  /** Rechaza una solicitud por el `_id` de la relación. */
  reject(id: string) {
    return this.http.post<void>(
      `${this.base}/contacts/requests/${id}/reject`,
      {},
      { headers: this.headers() }
    );
  }

  /** Historial de la conversación (máx. 50, orden cronológico). */
  messages(otroId: string) {
    return this.http.get<any[]>(`${this.base}/messages/${otroId}`, { headers: this.headers() });
  }

  /**
   * Envía un mensaje (texto y/o archivo) como multipart.
   *
   * No se fija `Content-Type`: el navegador añade el boundary de FormData.
   * Límite del backend: 3 MB y formatos validados por firma mágica.
   */
  send(otroId: string, texto: string, archivo?: File) {
    const form = new FormData();
    if (texto) form.append('texto', texto);
    if (archivo) form.append('archivo', archivo);
    return this.http.post<any>(`${this.base}/messages/${otroId}`, form, { headers: this.headers() });
  }

  /** URL del adjunto (ver nota de autenticación en el encabezado). */
  attachmentUrl(path: string): string {
    return `${this.base}/messages/files/${path}`;
  }
}
