import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, timeout } from 'rxjs';
import { apiEndpoint } from '../config/runtime-config';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = apiEndpoint('/auth');

  constructor(private http: HttpClient) {}

  signup(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/signup`, { name, email, password }).pipe(
      timeout(10000),
      tap(response => this.storeSession(response))
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password }).pipe(
      timeout(10000),
      tap(response => this.storeSession(response))
    );
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem('studyfinder_token');
  }

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

  verifyCurrentPassword(email: string, password: string): Observable<{ verification_token: string; expires_in: number }> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    return this.http.post<{ verification_token: string; expires_in: number }>(
      `${this.apiUrl}/password/verify`,
      { email, password },
      { headers }
    ).pipe(timeout(10000));
  }

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

  private storeSession(response: AuthResponse): void {
    localStorage.setItem('studyfinder_token', response.token);
    localStorage.setItem('studyfinder_user', JSON.stringify(response.user));
  }
}
