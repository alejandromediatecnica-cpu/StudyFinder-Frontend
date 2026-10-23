/**
 * Selector de fecha propio (calendario desplegable).
 *
 * POR QUÉ EXISTE: `<input type="date">` se renderiza con el estilo del sistema
 * operativo y rompe el tema oscuro. Este componente replica la estética.
 *
 * USO
 *   <app-date-picker [(ngModel)]="tarea.dueDate" placeholder="Sin fecha" />
 *   Es un `model()`: se comporta como un input normal con ngModel/[(value)].
 *   `(changed)` emite el ISO elegido (o '' al limpiar) si necesitas reaccionar.
 *
 * FORMATO DE VALOR: string `YYYY-MM-DD` (o '' si no hay fecha).
 * La semana empieza en LUNES (igual que el calendario principal).
 *
 * CÓMO CAMBIAR EL IDIOMA DE MESES/DÍAS
 *   - `meses` y `weekdays` (arrays de este archivo).
 * CÓMO PERMITIR OTRAS FECHAS (min/max)
 *   - Añade inputs `min`/`max` y filtra/deshabilita en `celdas()`. Hoy no hay.
 * CÓMO CERRAR AL ELEGIR
 *   - Ya lo hace `elegir()`. Para dejarlo abierto, quita `this.open.set(false)`.
 */

import { Component, ElementRef, HostListener, computed, input, model, output, signal } from '@angular/core';

/** Una casilla del calendario (día visible en la rejilla de 6x7). */
interface CeldaCalendario {
  iso: string;        // YYYY-MM-DD
  dia: number;        // día del mes (1..31)
  otroMes: boolean;   // true si pertenece al mes anterior/siguiente
  hoy: boolean;       // es la fecha actual
  seleccionada: boolean; // es el valor actual
}

/**
 * Selector de fecha con la decoracion de la pagina en lugar del `<input
 * type="date">` nativo, que se ve igual en todos los sistemas y rompe el tema.
 * Es un `model()` para poder usarse con [(ngModel)] igual que un input normal.
 */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  template: `
    <div class="dp">
      <!-- Botón que muestra la fecha elegida y abre/cierra el calendario. -->
      <button type="button" class="dp-trigger" [class.filled]="!!value()" (click)="toggle()" [attr.aria-expanded]="open()">
        <span class="dp-icon">▦</span>
        <span class="dp-value" [class.placeholder]="!value()">{{ value() || placeholder() }}</span>
        <span class="dp-caret">▾</span>
      </button>

      <!-- Botón para borrar la fecha (solo si hay una). -->
      @if (value()) {
        <button type="button" class="dp-clear" (click)="clear()" aria-label="Quitar fecha">×</button>
      }

      <!-- Panel desplegable con el calendario. -->
      @if (open()) {
        <div class="dp-pop" role="dialog" aria-label="Calendario">
          <!-- Cabecera: mes anterior / mes y año / mes siguiente. -->
          <div class="dp-head">
            <button type="button" class="dp-nav" (click)="moverMes(-1)" aria-label="Mes anterior">‹</button>
            <strong>{{ nombreMes() }} {{ anio() }}</strong>
            <button type="button" class="dp-nav" (click)="moverMes(1)" aria-label="Mes siguiente">›</button>
          </div>

          <!-- Cabecera de días de la semana (L..D). -->
          <div class="dp-weekdays">
            @for (dia of weekdays; track dia) { <span>{{ dia }}</span> }
          </div>

          <!-- Rejilla de 42 celdas (6 semanas). -->
          <div class="dp-grid">
            @for (celda of celdas(); track celda.iso) {
              <button
                type="button"
                class="dp-day"
                [class.otro]="celda.otroMes"
                [class.hoy]="celda.hoy"
                [class.sel]="celda.seleccionada"
                (click)="elegir(celda.iso)"
              >{{ celda.dia }}</button>
            }
          </div>

          <!-- Atajos: hoy, mañana y cerrar sin elegir. -->
          <div class="dp-foot">
            <button type="button" class="dp-today" (click)="hoy()">Hoy</button>
            <button type="button" class="dp-today" (click)="manana()">Mañana</button>
            <button type="button" class="dp-today" (click)="cerrar()">Cerrar</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    // Estilos encapsulados del componente (usan variables globales del tema).
    `
      :host { display: block; }
      .dp { position: relative; display: flex; align-items: center; gap: 6px; }
      .dp-trigger {
        flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; height: 40px; padding: 0 12px;
        border: 1px solid var(--border); border-radius: 12px; background: var(--surface-soft);
        color: var(--text); font-size: 12px; cursor: pointer; text-align: left; transition: .18s;
      }
      .dp-trigger:hover { border-color: rgba(105, 207, 255, .45); background: rgba(255, 255, 255, .08); }
      .dp-trigger.filled { background: rgba(79, 140, 255, .14); border-color: rgba(105, 207, 255, .35); }
      .dp-icon { color: #69cfff; font-size: 13px; }
      .dp-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dp-value.placeholder { color: #7d8aa3; }
      .dp-caret { color: #7d8aa3; font-size: 10px; }
      .dp-clear {
        position: absolute; right: 30px; width: 20px; height: 20px; border-radius: 50%;
        background: rgba(255, 255, 255, .08); color: #cbd5e7; font-size: 12px; cursor: pointer;
      }
      .dp-clear:hover { background: rgba(255, 107, 129, .25); color: white; }
      .dp-pop {
        position: absolute; z-index: 40; top: calc(100% + 8px); left: 0; width: 250px; padding: 14px;
        border: 1px solid rgba(105, 207, 255, .22); border-radius: 18px;
        background: linear-gradient(145deg, rgba(20, 32, 62, .97), rgba(8, 15, 33, .97));
        box-shadow: 0 26px 60px rgba(0, 0, 0, .5); backdrop-filter: blur(18px);
      }
      .dp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .dp-head strong { font-size: 12px; letter-spacing: .01em; }
      .dp-nav {
        width: 26px; height: 26px; border-radius: 9px; border: 1px solid var(--border);
        background: rgba(255, 255, 255, .05); color: #cbd5e7; font-size: 14px; cursor: pointer;
      }
      .dp-nav:hover { background: rgba(79, 140, 255, .2); color: white; }
      .dp-weekdays, .dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
      .dp-weekdays { margin-bottom: 5px; }
      .dp-weekdays span { text-align: center; color: #6f7d96; font-size: 9px; font-weight: 800; letter-spacing: .08em; }
      .dp-day {
        height: 28px; border-radius: 8px; background: transparent; color: #cbd5e7;
        font-size: 11px; cursor: pointer; transition: .14s;
      }
      .dp-day:hover { background: rgba(79, 140, 255, .22); color: white; }
      .dp-day.otro { color: #4d5a72; }
      .dp-day.hoy { border: 1px solid rgba(105, 207, 255, .5); color: #69cfff; }
      .dp-day.sel {
        background: linear-gradient(135deg, #5caeff, #376cf5); color: white;
        box-shadow: 0 6px 16px rgba(57, 112, 255, .4);
      }
      .dp-foot { display: flex; gap: 6px; margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--border); }
      .dp-today {
        flex: 1; height: 28px; border: 1px solid var(--border); border-radius: 9px;
        background: rgba(255, 255, 255, .04); color: #a9b7cd; font-size: 10px; cursor: pointer;
      }
      .dp-today:hover { background: rgba(92, 174, 255, .18); color: white; }
    `,
  ],
})
export class DatePickerComponent {
  // --- API pública ---
  /** Fecha seleccionada ('' = sin fecha). Enlazable con [(ngModel)] / [(value)]. */
  readonly value = model<string>('');
  /** Texto cuando no hay fecha. */
  readonly placeholder = input('Sin fecha');
  /** Etiqueta accesible (hoy no se pinta en la plantilla). */
  readonly label = input('Fecha');
  /** Emite la fecha ISO al elegir y '' al limpiar. */
  readonly changed = output<string>();

  // --- Estado interno ---
  /** Panel abierto/cerrado. */
  readonly open = signal(false);
  /** Mes que se está visualizando (siempre día 1). */
  readonly cursor = signal<Date>(this.inicioDeMes(new Date()));
  /** Iniciales de los días (semana empieza en lunes). */
  readonly weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  /** Nombres de meses en español. */
  readonly meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  /** Año del mes visualizado (para la cabecera). */
  readonly anio = computed(() => this.cursor().getFullYear());
  /** Nombre del mes visualizado (para la cabecera). */
  readonly nombreMes = computed(() => this.meses[this.cursor().getMonth()]);

  /**
   * Rejilla de 42 celdas (6 semanas x 7 días) para el mes actual.
   *
   * Cálculo:
   *  1. Primer día del mes visualizado.
   *  2. Desplazamiento hasta el lunes anterior: `(getDay()+6)%7` (domingo=0 -> 6).
   *  3. 42 días consecutivos desde ahí; las celdas de otros meses se marcan
   *     `otroMes` para atenuarlas.
   *  4. Marca `hoy` y `seleccionada` comparando ISO.
   *
   * Se recalcula al cambiar `cursor` o `value` (computed con signals).
   */
  readonly celdas = computed<CeldaCalendario[]>(() => {
    const cursor = this.cursor();
    const primera = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    // La semana arranca en lunes, igual que el calendario principal.
    const desplazamiento = (primera.getDay() + 6) % 7;
    const inicio = new Date(primera);
    inicio.setDate(primera.getDate() - desplazamiento);
    const hoyIso = this.aIso(new Date());
    const elegido = this.value();

    return Array.from({ length: 42 }, (_, i) => {
      const dia = new Date(inicio);
      dia.setDate(inicio.getDate() + i);
      const iso = this.aIso(dia);
      return {
        iso,
        dia: dia.getDate(),
        otroMes: dia.getMonth() !== cursor.getMonth(),
        hoy: iso === hoyIso,
        seleccionada: iso === elegido
      };
    });
  });

  // Elemento anfitrión, para detectar clics fuera.
  constructor(private host: ElementRef<HTMLElement>) {}

  /**
   * Cierra el panel al hacer clic fuera del componente.
   *
   * Se escucha en `document` porque el panel es absoluto y puede sobresalir.
   * `contains(event.target)` distingue clic dentro/fuera.
   */
  @HostListener('document:click', ['$event'])
  onClickFuera(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  /** Abre o cierra el panel; al abrir se posiciona en el mes de la fecha elegida. */
  toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    // Al abrir, el calendario muestra el mes de la fecha elegida o el actual.
    this.cursor.set(this.value() ? this.inicioDeMes(this.desDeIso(this.value())) : this.inicioDeMes(new Date()));
    this.open.set(true);
  }

  /** Cierra sin cambiar la fecha. */
  cerrar(): void {
    this.open.set(false);
  }

  /** Selecciona una fecha (ISO), la emite y cierra el panel. */
  elegir(iso: string): void {
    this.value.set(iso);
    this.changed.emit(iso);
    this.open.set(false);
  }

  /** Borra la fecha seleccionada. */
  clear(): void {
    this.value.set('');
    this.changed.emit('');
  }

  /** Atajo: selecciona hoy. */
  hoy(): void {
    this.elegir(this.aIso(new Date()));
  }

  /** Atajo: selecciona mañana. */
  manana(): void {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    this.elegir(this.aIso(manana));
  }

  /** Mueve la vista `delta` meses (negativo = atrás), siempre al día 1. */
  moverMes(delta: number): void {
    const cursor = this.cursor();
    this.cursor.set(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  // ------------------------- Utilidades -------------------------

  /** Día 1 del mes de `date` (evita desbordes de mes al navegar). */
  private inicioDeMes(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /** Formatea una fecha local como `YYYY-MM-DD` (sin desfase UTC). */
  private aIso(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }

  /** Convierte `YYYY-MM-DD` en fecha local (sin `new Date(iso)`, que usa UTC). */
  private desDeIso(iso: string): Date {
    const [anio, mes, dia] = iso.split('-').map(Number);
    return new Date(anio, (mes || 1) - 1, dia || 1);
  }
}
