/**
 * Estadísticas (ruta '/main/estadisticas').
 *
 * Solo lectura: toma las métricas locales del navegador que acumula
 * `StudyDataService` (búsquedas, documentos guardados, subidas, sesiones...).
 * No hay endpoint de estadísticas en el backend ni se envía nada al servidor.
 *
 * CÓMO AÑADIR UNA MÉTRICA
 *  - Añade el contador en `StudyDataService` (y su `record*`), expónlo en
 *    `getStats()` y píntalo en `estadisticas.html`.
 * CÓMO HACERLAS GLOBALES/POR USUARIO EN SERVIDOR
 *  - Requiere nueva colección y endpoint; hoy no existe.
 */

import { Component } from '@angular/core';
import { StudyDataService } from '../../../services/study-data.service';

@Component({
  standalone: true,
  selector: 'app-estadisticas',
  imports: [],
  templateUrl: './estadisticas.html',
  styleUrl: './estadisticas.css',
})
export class EstadisticasComponent {
  /** Instantánea de las métricas locales (se lee una vez al crear la página). */
  stats;

  constructor(private studyData: StudyDataService) {
    this.stats = studyData.getStats();
  }
}
