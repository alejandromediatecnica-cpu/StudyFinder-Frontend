/**
 * Select desplegable propio (sustituye a `<select>` nativo).
 *
 * POR QUÉ: el `<select>` del sistema no respeta el tema oscuro. Este componente
 * pinta una lista flotante con los mismos estilos que el resto de la página.
 *
 * USO
 *   <app-styled-select [(ngModel)]="tipo"
 *                      [opciones]="[{value:'tarea',label:'Tarea'}]"
 *                      placeholder="Elige tipo" />
 *   `value` es un `model()`: se comporta como un select normal.
 *
 * CÓMO AÑADIR OPCIONES DINÁMICAS
 *   - Pasa un `input` `opciones` distinto (p. ej. `computed` en la página).
 * CÓMO PERMITIR SELECCIÓN MÚLTIPLE
 *   - No está soportado; habría que cambiar `value` a `model<string[]>` y la
 *     plantilla para marcar varias.
 */

import { Component, ElementRef, HostListener, input, model, signal } from '@angular/core';

/** Una opción del desplegable. */
export interface OpcionSelect {
  value: string;
  label: string;
}

/**
 * Reemplaza el `<select>` nativo (que se ve igual en todos los sistemas y no
 * admite el tema oscuro) por una lista decorada como el resto de la pagina.
 * Es un `model()` para poder usarse con [(ngModel)] igual que un select normal.
 */
@Component({
  selector: 'app-styled-select',
  standalone: true,
  template: `
    <div class="ss">
      <!-- Disparador: muestra la etiqueta de la opción elegida o el placeholder. -->
      <button type="button" class="ss-trigger" [class.filled]="!!elegido" (click)="toggle()" [attr.aria-expanded]="open()">
        <span class="ss-value" [class.placeholder]="!elegido">{{ elegido?.label || placeholder() }}</span>
        <span class="ss-caret">▾</span>
      </button>

      <!-- Lista flotante de opciones. -->
      @if (open()) {
        <ul class="ss-list" role="listbox">
          @for (opcion of opciones(); track opcion.value) {
            <li>
              <button
                type="button"
                role="option"
                class="ss-option"
                [class.active]="opcion.value === value()"
                (click)="elegir(opcion.value)"
              >
                <span>{{ opcion.label }}</span>
                @if (opcion.value === value()) { <em>✓</em> }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    // Mismos tokens/estética que date-picker para que se vean igual.
    `
      :host { display: block; }
      .ss { position: relative; }
      .ss-trigger {
        width: 100%; display: flex; align-items: center; gap: 9px; height: 40px; padding: 0 12px;
        border: 1px solid var(--border); border-radius: 12px; background: var(--surface-soft);
        color: var(--text); font-size: 12px; cursor: pointer; text-align: left; transition: .18s;
      }
      .ss-trigger:hover { border-color: rgba(105, 207, 255, .45); background: rgba(255, 255, 255, .08); }
      .ss-trigger.filled { background: rgba(79, 140, 255, .14); border-color: rgba(105, 207, 255, .35); }
      .ss-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ss-value.placeholder { color: #7d8aa3; }
      .ss-caret { color: #7d8aa3; font-size: 10px; }
      .ss-list {
        position: absolute; z-index: 40; top: calc(100% + 8px); left: 0; right: 0; max-height: 220px; overflow: auto;
        margin: 0; padding: 6px; list-style: none;
        border: 1px solid rgba(105, 207, 255, .22); border-radius: 16px;
        background: linear-gradient(145deg, rgba(20, 32, 62, .97), rgba(8, 15, 33, .97));
        box-shadow: 0 26px 60px rgba(0, 0, 0, .5); backdrop-filter: blur(18px);
      }
      .ss-option {
        width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 9px 11px; border-radius: 10px; background: transparent; color: #cbd5e7;
        font-size: 11px; text-align: left; cursor: pointer; transition: .14s;
      }
      .ss-option:hover { background: rgba(79, 140, 255, .2); color: white; }
      .ss-option.active { background: rgba(92, 174, 255, .18); color: white; font-weight: 700; }
      .ss-option em { color: #69cfff; font-style: normal; }
    `,
  ],
})
export class StyledSelectComponent {
  // --- API pública ---
  /** Valor seleccionado (enlazable). */
  readonly value = model('');
  /** Opciones disponibles. */
  readonly opciones = input<OpcionSelect[]>([]);
  /** Texto cuando no hay selección. */
  readonly placeholder = input('Selecciona una opción');
  /** Etiqueta accesible (hoy no se pinta). */
  readonly label = input('Opción');

  // --- Estado interno ---
  /** Lista abierta/cerrada. */
  readonly open = signal(false);

  constructor(private host: ElementRef<HTMLElement>) {}

  /** Opción completa cuyo `value` coincide con el actual (para mostrar label). */
  get elegido(): OpcionSelect | undefined {
    return this.opciones().find(opcion => opcion.value === this.value());
  }

  /** Cierra la lista al hacer clic fuera del componente. */
  @HostListener('document:click', ['$event'])
  onClickFuera(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  /** Abre/cierra la lista. */
  toggle(): void {
    this.open.update(abierto => !abierto);
  }

  /** Selecciona una opción y cierra la lista. */
  elegir(value: string): void {
    this.value.set(value);
    this.open.set(false);
  }
}
