/**
 * Autenticación en el cliente.
 *
 * - Guarda el token y el usuario en `localStorage` bajo `studyfinder_token` y
 *   `studyfinder_user` (JSON). No hay cookies: el backend usa Bearer opaco.
 * - Todas las peticiones usan `timeout(10000)` salvo que se indique otra cosa.
 * - `tap(storeSession)` guarda la sesión automáticamente al registrarse, iniciar
 *   sesión o cambiar la contraseña.
 *
 * CÓMO AÑADIR UN NUEVO MÉTODO DE AUTH
 *   - Añade el método con `this.http...` y, si devuelve un `AuthResponse`,
 *     encadena `.pipe(tap(...))` para persistir la sesión.
 * CÓMO CAMBIAR EL ALMACENAMIENTO (p. ej. sessionStorage)
 *   - `getToken/getUser/storeSession/logout` son los cuatro puntos a tocar.
 * CÓMO CAMBIAR EL TIMEOUT
 *   - Los `timeout(10000)` de signup/login/password.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, timeout } from 'rxjs';
import { apiEndpoint } from '../config/runtime-config';

/** Usuario tal como lo devuelve el backend (sin datos sensibles). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

/** Respuesta de login/signup/change-password: token + usuario. */
export interface AuthResponse {
  token: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Base ya resuelta en runtime: http://host:8000/auth (o el API_URL configurado).
  private readonly apiUrl = apiEndpoint('/auth');

  constructor(private http: HttpClient) {}

  /** Registra una cuenta y deja la sesión iniciada. */
  signup(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/signup`, { name, email, password }).pipe(
      timeout(10000),           // 10 s: evita que el botón quede "cargando" para siempre
      tap(response => this.storeSession(response))  // guarda token+usuario al recibir 201
    );
  }

  /** Inicia sesión. El backend valida la contraseña y devuelve el token. */
  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password }).pipe(
      timeout(10000),
      tap(response => this.storeSession(response))
    );
  }

  /** True si hay token guardado (no comprueba si sigue siendo válido en el backend). */
  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /** Token Bearer o null. En SSR no hay localStorage -> null. */
  getToken(): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem('studyfinder_token');
  }

  /**
   * Usuario guardado en sesión (o null).
   *
   * Un valor corrupto en localStorage no debe tumbar la app: Landing y Layout
   * llaman a getUser() en sus constructores, por eso el JSON.parse va con try.
   */
  getUser(): AuthUser | null {
    if (typeof localStorage === 'undefined') return null;
    const storedUser = localStorage.getItem('studyfinder_user');
    if (!storedUser) return null;
    // Un valor corrupto en localStorage no debe tumbar la app: Landing y Layout
    // llaman a getUser() en sus constructores.
    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      return null;
    }
  }

  /**
   * Cierra sesión.
   *
   * Borra el almacenamiento local PRIMERO (el usuario ve el efecto al instante)
   * y avisa al backend en segundo plano para revocar el token. Si la petición
   * falla, se ignora: el token local ya no existe.
   */
  logout(): void {
    const token = this.getToken();
    localStorage.removeItem('studyfinder_token');
    localStorage.removeItem('studyfinder_user');
    if (token) {
      this.http.post<void>(`${this.apiUrl}/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      }).subscribe({ error: () => undefined });
    }
  }

  /**
   * Paso 1 del cambio de contraseña: confirma la actual con el email.
   *
   * Requiere sesión (va el Bearer). Devuelve un token temporal de 10 min.
   */
  verifyCurrentPassword(email: string, password: string): Observable<{ verification_token: string; expires_in: number }> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    return this.http.post<{ verification_token: string; expires_in: number }>(
      `${this.apiUrl}/password/verify`,
      { email, password },
      { headers }
    ).pipe(timeout(10000));
  }

  /**
   * Paso 2: cambia la contraseña y recibe una sesión NUEVA.
   *
   * El backend revoca todas las sesiones anteriores; por eso se guarda la
   * respuesta con `storeSession` (si no, el usuario quedaría deslogueado).
   */
  changePassword(verification_token: string, new_password: string, confirm_password: string): Observable<AuthResponse> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    return this.http.post<AuthResponse>(
      `${this.apiUrl}/password/change`,
      { verification_token, new_password, confirm_password },
      { headers }
    ).pipe(
      timeout(10000),
      tap(response => this.storeSession(response))
    );
  }

  /** Persiste token y usuario en localStorage (único punto de escritura). */
  private storeSession(response: AuthResponse): void {
    localStorage.setItem('studyfinder_token', response.token);
    localStorage.setItem('studyfinder_user', JSON.stringify(response.user));
  }
}
