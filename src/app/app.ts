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
  protected readonly title = signal('studyfinderFront');

  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    // La app corre sin zone.js: la conexion SSE se abre una sola vez y los
    // componentes se suscriben a `realtime.events$` para refrescar su estado.
    if (this.auth.isLoggedIn()) {
      this.realtime.connect();
    }
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
  }
}
