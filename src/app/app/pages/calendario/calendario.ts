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
  currentDate = new Date();
  selectedDay = new Date();
  calendarDays: Date[] = [];

  private readonly store = inject(TaskStoreService);

  // Estado asincrono -> signals (sin zone.js).
  readonly events = this.store.events;
  showForm = signal(false);
  formError = signal('');
  editingId: string | null = null;

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

  ngOnInit(): void {
    this.generateCalendar();
    this.store.ensureLoaded();
  }

  cargar(): void {
    this.store.refresh();
  }

  get currentMonthName(): string {
    return this.months[this.currentDate.getMonth()];
  }

  get currentYear(): number {
    return this.currentDate.getFullYear();
  }

  previousMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
  }

  nextMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
  }

  goToday(): void {
    this.currentDate = new Date();
    this.selectedDay = new Date();
    this.generateCalendar();
  }

  selectDay(day: Date): void {
    this.selectedDay = day;
  }

  isSelected(day: Date): boolean {
    return day.toDateString() === this.selectedDay.toDateString();
  }

  isCurrentMonth(day: Date): boolean {
    return day.getMonth() === this.currentDate.getMonth() && day.getFullYear() === this.currentDate.getFullYear();
  }

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

  tipoLabel(tipo?: string): string {
    if (tipo === 'trabajo') return 'Trabajo';
    if (tipo === 'tarea') return 'Tarea';
    return 'Evento';
  }

  // ---------------------------------------------------------
  // Alta y borrado
  // ---------------------------------------------------------

  abrirFormulario(): void {
    this.formTitle = '';
    this.formDescription = '';
    this.formType = 'evento';
    this.formHour = '';
    this.formError.set('');
    this.editingId = null;
    this.showForm.set(true);
  }

  /** Carga un evento existente en el formulario para editarlo sin recrearlo. */
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

  cerrarFormulario(): void {
    this.showForm.set(false);
    this.editingId = null;
  }

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

  eliminar(event: CalendarEvent, domEvent?: Event): void {
    domEvent?.stopPropagation();
    if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar “${event.title}”?`)) return;
    this.store.removeEvent(event.id);
  }

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