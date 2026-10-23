import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { AuthService } from './auth.service';
import { apiEndpoint } from '../config/runtime-config';

export interface LibraryDocument {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  ownerName?: string;
  ownerEmail?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly apiUrl = apiEndpoint('/documents');

  constructor(private http: HttpClient, private auth: AuthService) {}

  list(materia?: string): Observable<LibraryDocument[]> {
    let params = new HttpParams();
    if (materia) params = params.set('materia', materia);
    return this.http.get<LibraryDocument[]>(this.apiUrl, { headers: this.headers(), params }).pipe(timeout(10000));
  }

  upload(file: File): Observable<LibraryDocument> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<LibraryDocument>(this.apiUrl, form, { headers: this.headers() }).pipe(timeout(60000));
  }

  listPublic(): Observable<LibraryDocument[]> {
    return this.http
      .get<LibraryDocument[]>(`${this.apiUrl}/public`, { headers: this.headers() })
      .pipe(timeout(10000));
  }

  download(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${encodeURIComponent(id)}/download`, {
      headers: this.headers(),
      responseType: 'blob'
    });
  }

  addToMateria(id: string, materia: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${encodeURIComponent(id)}/materias`, { materia }, { headers: this.headers() });
  }

  removeFromMateria(id: string, materia: string): Observable<void> {
    const params = new HttpParams().set('materia', materia);
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}/materias`, { headers: this.headers(), params });
  }

  storage(): Observable<{ used: number; limit: number; available: number; documentCount: number; percent: number }> {
    return this.http.get<{ used: number; limit: number; available: number; documentCount: number; percent: number }>(
      `${this.apiUrl}/storage`,
      { headers: this.headers() }
    ).pipe(timeout(10000));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}`, { headers: this.headers() });
  }

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}