/**
 * Búsqueda académica (OpenAlex a través del backend).
 *
 * `GET /search?q=` es PÚBLICO en el backend, pero aquí no se envía token: no
 * hace falta. `encodeURIComponent` protege términos con espacios/acentos.
 *
 * CÓMO USARLA
 *   this.search.searchDocuments('machine learning').subscribe(resultados => ...)
 *   El resultado ya viene normalizado: [{title, authors, year, url, type, source}].
 * CÓMO AÑADIR FILTROS (año, área)
 *   - El backend hoy solo acepta `q`; añade parámetros allí y aquí.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiBaseUrl } from '../config/runtime-config';

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  // Base en runtime (respeta API_URL).
  private readonly apiUrl = apiBaseUrl();

  constructor(private http: HttpClient) {}

  /** Devuelve hasta 8 trabajos con texto completo para el término dado. */
  searchDocuments(term: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/search?q=${encodeURIComponent(term)}`);
  }
}
