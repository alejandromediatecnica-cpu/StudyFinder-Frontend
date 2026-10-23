/**
 * Perfil del usuario: consulta, edición, avatar y baja de cuenta.
 *
 * Todas las llamadas van con `Authorization: Bearer <token>` (helper `headers`).
 * El endpoint del avatar exige `Authorization: Bearer`, así que un `<img src>`
 * directo NO sirve (el navegador no envía cabeceras). `avatarUrl()` existe para
 * construir la ruta, pero hoy no se usa: para mostrarla habría que pedirla con
 * `HttpClient` como blob y crear un object URL.
 *
 * CÓMO MOSTRAR EL AVATAR
 *   `getAvatarBlob(id)` + `URL.createObjectURL(blob)` en el componente.
 * CÓMO CAMBIAR EL IDIOMA
 *   `updateMe({ language: 'en' })`; el backend lo persiste en la cuenta.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiBaseUrl } from '../config/runtime-config';
import { AuthService } from './auth.service';

/** Perfil completo (respuesta de `GET/PATCH /users/me`). */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  language: 'es' | 'en';
  hasAvatar: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = apiBaseUrl();

  /** Cabecera Bearer o vacía (el backend responderá 401). */
  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** Perfil del usuario autenticado. */
  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}/users/me`, { headers: this.headers() });
  }

  /** Actualiza solo nombre y/o idioma (`PATCH` parcial). */
  updateMe(data: Partial<Pick<UserProfile, 'name' | 'language'>>): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.base}/users/me`, data, { headers: this.headers() });
  }

  /**
   * Sube el avatar como multipart.
   *
   * El backend detecta el tipo por el contenido (máx. 2 MB) y devuelve
   * `hasAvatar`. IMPORTANTE: no poner `Content-Type` manualmente; el navegador
   * añade el boundary de FormData.
   */
  uploadAvatar(file: File): Observable<{ hasAvatar: boolean }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<{ hasAvatar: boolean }>(`${this.base}/users/me/avatar`, form, { headers: this.headers() });
  }

  /** Elimina el avatar. */
  deleteAvatar(): Observable<void> {
    return this.http.delete<void>(`${this.base}/users/me/avatar`, { headers: this.headers() });
  }

  /**
   * Construye la URL del avatar.
   *
   * OJO: la petición a esa URL debe llevar el Bearer; si la usas en un `<img>`
   * recibirá 401. Ver la nota del encabezado del archivo.
   */
  avatarUrl(userId: string): string {
    return `${this.base}/users/${userId}/avatar`;
  }

  /**
   * Baja de cuenta. Necesita la contraseña en el cuerpo, por eso se usa
   * `http.request('delete', ...)` (el `delete` normal no envía body).
   * EFECTO: el backend borra todos los datos; el componente debe hacer logout
   * local después.
   */
  deleteAccount(password: string): Observable<void> {
    return this.http.request<void>('delete', `${this.base}/users/me`, {
      headers: this.headers(),
      body: { password }
    });
  }
}
