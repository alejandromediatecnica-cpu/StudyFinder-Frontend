import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiBaseUrl } from '../config/runtime-config';
import { AuthService } from './auth.service';

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

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}/users/me`, { headers: this.headers() });
  }

  updateMe(data: Partial<Pick<UserProfile, 'name' | 'language'>>): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.base}/users/me`, data, { headers: this.headers() });
  }

  uploadAvatar(file: File): Observable<{ hasAvatar: boolean }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<{ hasAvatar: boolean }>(`${this.base}/users/me/avatar`, form, { headers: this.headers() });
  }

  deleteAvatar(): Observable<void> {
    return this.http.delete<void>(`${this.base}/users/me/avatar`, { headers: this.headers() });
  }

  avatarUrl(userId: string): string {
    return `${this.base}/users/${userId}/avatar`;
  }

  deleteAccount(password: string): Observable<void> {
    return this.http.request<void>('delete', `${this.base}/users/me`, {
      headers: this.headers(),
      body: { password }
    });
  }
}
