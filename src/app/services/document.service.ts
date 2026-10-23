/**
 * Documentos de la biblioteca (subida, listado, descarga, materias, cuota).
 *
 * Particiona la API `/documents` del backend:
 *   - `list(materia?)`      GET  /documents[?materia=]
 *   - `listPublic()`        GET  /documents/public   (documentos de otros)
 *   - `upload(file)`        POST /documents          (multipart, cuota 3 MB)
 *   - `download(id)`        GET  /documents/{id}/download (blob)
 *   - `addToMateria`        POST /documents/{id}/materias
 *   - `removeFromMateria`   DELETE /documents/{id}/materias?materia=
 *   - `storage()`           GET  /documents/storage
 *   - `delete(id)`          DELETE /documents/{id}
 *
 * El upload tiene timeout de 60 s (archivos y red lenta); el resto, 10 s.
 *
 * CÓMO CAMBIAR EL LÍMITE MOSTRADO EN LA UI
 *   - Viene de `storage().limit`; no lo dupliques en el frontend.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { AuthService } from './auth.service';
import { apiEndpoint } from '../config/runtime-config';

/** Documento tal como lo devuelve la API (metadatos). */
export interface LibraryDocument {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  // Solo en `listPublic()`:
  ownerName?: string;
  ownerEmail?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly apiUrl = apiEndpoint('/documents');

  constructor(private http: HttpClient, private auth: AuthService) {}

  /** Documentos propios; si se pasa `materia`, solo los asociados a ella. */
  list(materia?: string): Observable<LibraryDocument[]> {
    let params = new HttpParams();
    if (materia) params = params.set('materia', materia);
    return this.http.get<LibraryDocument[]>(this.apiUrl, { headers: this.headers(), params }).pipe(timeout(10000));
  }

  /**
   * Sube un archivo (FormData con el nombre original).
   *
   * El backend valida extensión, firma mágica y cuota (413 si no cabe).
   * `timeout(60000)` porque una subida puede tardar más que una consulta.
   */
  upload(file: File): Observable<LibraryDocument> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<LibraryDocument>(this.apiUrl, form, { headers: this.headers() }).pipe(timeout(60000));
  }

  /** Documentos de OTROS usuarios (biblioteca compartida), con datos del dueño. */
  listPublic(): Observable<LibraryDocument[]> {
    return this.http
      .get<LibraryDocument[]>(`${this.apiUrl}/public`, { headers: this.headers() })
      .pipe(timeout(10000));
  }

  /** Descarga el archivo como `Blob` (el componente crea el enlace de descarga). */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${encodeURIComponent(id)}/download`, {
      headers: this.headers(),
      responseType: 'blob'
    });
  }

  /** Asocia el documento a una materia del usuario (idempotente). */
  addToMateria(id: string, materia: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${encodeURIComponent(id)}/materias`, { materia }, { headers: this.headers() });
  }

  /** Quita la asociación con la materia (no borra el documento). */
  removeFromMateria(id: string, materia: string): Observable<void> {
    const params = new HttpParams().set('materia', materia);
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}/materias`, { headers: this.headers(), params });
  }

  /** Uso de cuota: bytes usados, límite, disponible, nº de documentos y %. */
  storage(): Observable<{ used: number; limit: number; available: number; documentCount: number; percent: number }> {
    return this.http.get<{ used: number; limit: number; available: number; documentCount: number; percent: number }>(
      `${this.apiUrl}/storage`,
      { headers: this.headers() }
    ).pipe(timeout(10000));
  }

  /** Borra un documento propio (metadatos, asociaciones y archivo). */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}`, { headers: this.headers() });
  }

  /** Cabecera Bearer común a todas las llamadas. */
  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
