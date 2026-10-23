/**
 * Componente raíz (`<app-root>`).
 *
 * Responsabilidades:
 *  1. Renderizar el `<router-outlet>` (todo lo demás cuelga de aquí).
 *  2. Abrir UNA sola conexión SSE al arrancar si hay sesión, y cerrarla al
 *     destruir la app. Los componentes no abren sus propios streams: se
 *     suscriben a `realtime.events$`.
 *
 * POR QUÉ AQUÍ: el SSE es global (un único `EventSource` por pestaña) y debe
 * sobrevivir a la navegación entre páginas.
 *
 * CÓMO CAMBIARLO: si un día la app se monta con sesión iniciada tras un login
 * sin recargar, hay que llamar a `realtime.connect()` también en el login
 * (hoy el login redirige y la app ya estaba montada sin sesión).
 */

import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RealtimeService } from './services/realtime.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  // `title` se mantiene por la plantilla/pruebas; es un signal por coherencia zoneless.
  protected readonly title = signal('studyfinderFront');

  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    // La app corre sin zone.js: la conexion SSE se abre una sola vez y los
    // componentes se suscriben a `realtime.events$` para refrescar su estado.
    // Solo se conecta si hay token; en SSR `isLoggedIn()` es false.
    if (this.auth.isLoggedIn()) {
      this.realtime.connect();
    }
  }

  ngOnDestroy(): void {
    // Cierra el EventSource (la app raíz rara vez se destruye, pero los tests sí).
    this.realtime.disconnect();
  }
}
