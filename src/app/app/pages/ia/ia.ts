/**
 * Study AI (ruta '/main/ia').
 *
 * DECORATIVA: no tiene lógica ni backend. Es intencionalmente un cascarón para
 * no ampliar el alcance del proyecto; el HTML muestra una maqueta de chat.
 *
 * CÓMO CONECTARLA DE VERDAD
 *  - Crear endpoint en el backend (p. ej. `POST /ai/chat`), un servicio Angular
 *    y estado en signals aquí (la app es zoneless). Hoy no existe ninguno.
 */

import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-ia',
  imports: [],
  templateUrl: './ia.html',
  styleUrl: './ia.css',
})
export class IaComponent {}
