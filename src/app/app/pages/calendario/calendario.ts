/**
 * Calendario mensual (ruta '/main/calendario').
 *
 * Qué hace:
 *  - Genera una rejilla fija de 42 días (6 semanas) que empieza en lunes.
 *  - Muestra los eventos del día seleccionado y permite crear/editar/borrar.
 *  - Los eventos vienen de `TaskStoreService.events` (backend `GET /calendar`),
 *    que además los mantiene sincronizados con las tareas que tienen fecha.
 *
 * NOTA sobre el estado: `currentDate`, `selectedDay` y `calendarDays` son
 * campos normales porque solo cambian por clics (síncrono). Lo que llega de
 * `subscribe` (showForm, formError) sí es signal, porque no hay zone.js.
 *
 * CÓMO CAMBIAR EL DÍA DE INICIO DE SEMANA
 *  - `generateCalendar()`: hoy fuerza lunes (`startDay === 0 ? 6 : startDay - 1`).
 * CÓMO AÑADIR VISTA SEMANA/MES
 *  - Habría que derivar la rejilla de `currentDate`; hoy siempre es mensual.
 * CÓMO CAMBIAR LOS COLORES POR TIPO
 *  - `guardar()` (`color`) y `calendario.css` (`.ev-*`).
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarEvent } from '../../../services/study-data.service';
import { TaskStoreService } from '../../../services/task-store.service';
import { StyledSelectComponent } from '../../components/styled-select';

@Component({
  selector: 'app-calendario',
  standalone: true,
  imports: [CommonModule, FormsModule, StyledSelectComponent],
  templateUrl: './calendario.html',
  styleUrl: './calendario.css',
})
export class CalendarioComponent implements OnInit {
  /** Mes que se está viendo (día 1). */
  currentDate = new Date();
  /** Día resaltado; el formulario guarda en esta fecha. */
  selectedDay = new Date();
  /** 42 celdas de la rejilla actual. */
  calendarDays: Date[] = [];

  private readonly store = inject(TaskStoreService);

  // Estado asincrono -> signals (sin zone.js).
  readonly events = this.store.events;
  showForm = signal(false);
  formError = signal('');
  /** Si no es null, `guardar()` actualiza ese evento en vez de crear uno. */
  editingId: string | null = null;

  // Campos del formulario.
  formTitle = '';
  formDescription = '';
  formType: 'evento' | 'tarea' | 'trabajo' = 'evento';
  formHour = '';

  readonly weekDays = [
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo'
  ];

  readonly months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
  ];

  /** Tipos de entrada del calendario. */
  readonly tipoOpciones = [
    { value: 'evento', label: 'Evento' },
    { value: 'tarea', label: 'Tarea' },
    { value: 'trabajo', label: 'Trabajo' }
  ];

  /** Horarios en cuartos de hora, igual que el formulario de Tareas. */
  readonly horaOpciones = Array.from({ length: 4 * 24 }, (_, i) => {
    const minutos = (i + 1) * 15;
    const hora = String(Math.floor(minutos / 60)).padStart(2, '0');
    const resto = String(minutos % 60).padStart(2, '0');
    return { value: `${hora}:${resto}`, label: `${hora}:${resto}` };
  });

  /** Construye la rejilla y pide los eventos si aún no están cargados. */
  ngOnInit(): void {
    this.generateCalendar();
    this.store.ensureLoaded();
  }

  /** Recarga los eventos desde el backend. */
  cargar(): void {
    this.store.refresh();
  }

  /** Nombre del mes visible (cabecera). */
  get currentMonthName(): string {
    return this.months[this.currentDate.getMonth()];
  }

  /** Año visible (cabecera). */
  get currentYear(): number {
    return this.currentDate.getFullYear();
  }

  /** Mes anterior (siempre día 1 para evitar saltos de fin de mes). */
  previousMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
  }

  /** Mes siguiente. */
  nextMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
  }

  /** Vuelve a hoy y lo selecciona. */
  goToday(): void {
    this.currentDate = new Date();
    this.selectedDay = new Date();
    this.generateCalendar();
  }

  /** Selecciona un día (resalta y filtra el panel lateral). */
  selectDay(day: Date): void {
    this.selectedDay = day;
  }

  /** ¿Es el día seleccionado? (comparación por fecha, no por hora). */
  isSelected(day: Date): boolean {
    return day.toDateString() === this.selectedDay.toDateString();
  }

  /** ¿Pertenece al mes visible? (para atenuar los de otros meses). */
  isCurrentMonth(day: Date): boolean {
    return day.getMonth() === this.currentDate.getMonth() && day.getFullYear() === this.currentDate.getFullYear();
  }

  /** Fecha local como YYYY-MM-DD. */
  private iso(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }

  /** Eventos de un dia, en orden por hora (sin hora, al principio). */
  getEvents(day: Date): CalendarEvent[] {
    const iso = this.iso(day);
    return this.events()
      .filter(event => event.date === iso)
      .sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));
  }

  /** Etiqueta visible del tipo. */
  tipoLabel(tipo?: string): string {
    if (tipo === 'trabajo') return 'Trabajo';
    if (tipo === 'tarea') return 'Tarea';
    return 'Evento';
  }

  // ---------------------------------------------------------
  // Alta y borrado
  // ---------------------------------------------------------

  /** Abre el formulario vacío para el día seleccionado. */
  abrirFormulario(): void {
    this.formTitle = '';
    this.formDescription = '';
    this.formType = 'evento';
    this.formHour = '';
    this.formError.set('');
    this.editingId = null;
    this.showForm.set(true);
  }

  /**
   * Carga un evento existente en el formulario para editarlo sin recrearlo.
   * También mueve `selectedDay` al día del evento.
   */
  editar(event: CalendarEvent, domEvent?: Event): void {
    domEvent?.stopPropagation();
    this.editingId = event.id;
    this.formTitle = event.title;
    this.formDescription = event.description || '';
    this.formType = (event.type as 'evento' | 'tarea' | 'trabajo') || 'evento';
    this.formHour = event.hour || '';
    this.selectedDay = event.date ? new Date(`${event.date}T00:00`) : this.selectedDay;
    this.formError.set('');
    this.showForm.set(true);
  }

  /** Cierra el panel sin guardar. */
  cerrarFormulario(): void {
    this.showForm.set(false);
    this.editingId = null;
  }

  /**
   * Crea o actualiza el evento en la fecha seleccionada.
   *
   * `color` deriva del tipo para que el tablero lo pinte distinto; se guarda
   * además de `type` por compatibilidad con datos antiguos.
   */
  guardar(): void {
    const title = this.formTitle.trim();
    if (!title) {
      this.formError.set('Escribe un título para el evento.');
      return;
    }

    const cambios = {
      title,
      description: this.formDescription.trim() || undefined,
      date: this.iso(this.selectedDay),
      hour: this.formHour || undefined,
      color: this.formType === 'trabajo' ? 'homework' : this.formType === 'tarea' ? 'task' : 'event',
      type: this.formType
    } as const;

    if (this.editingId) {
      this.store.updateEvent(this.editingId, cambios);
    } else {
      this.store.createEvent(cambios);
    }

    this.cerrarFormulario();
  }

  /** Borra el evento (con confirmación del navegador). */
  eliminar(event: CalendarEvent, domEvent?: Event): void {
    domEvent?.stopPropagation();
    if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar “${event.title}”?`)) return;
    this.store.removeEvent(event.id);
  }

  /**
   * Rellena `calendarDays` con 42 fechas consecutivas.
   *
   * 1. Primer día del mes visible.
   * 2. Retrocede hasta el lunes de esa semana (domingo=0 -> 6).
   * 3. Genera 6 semanas completas para que la rejilla no cambie de alto.
   */
  private generateCalendar(): void {
    this.calendarDays = [];
    const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - startDay);
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      this.calendarDays.push(day);
    }
  }
}
