import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { StudyDataService, Task } from '../../../services/study-data.service';
import { TaskStoreService } from '../../../services/task-store.service';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './main.html',
  styleUrl: './main.css',
})
export class MainComponent implements OnInit {
  user;
  stats;

  private readonly store = inject(TaskStoreService);

  /** Tareas reales del usuario; es la unica fuente de los dos widgets. */
  readonly tasks = this.store.tasks;

  /**
   * La mas urgente es la pendiente con la fecha mas cercana: primero las
   * vencidas, luego hoy, y las que no tienen fecha quedan para el final.
   */
  readonly urgentTask = computed<Task | null>(() => {
    const pendientes = this.tasks()
      .filter(task => !task.completed)
      .sort((a, b) => this.urgencia(a) - this.urgencia(b));
    return pendientes[0] ?? null;
  });

  /** Las siguientes mas cercanas despues de la urgente, para "Proximas tareas". */
  readonly upcomingTasks = computed<Task[]>(() => {
    const urgentes = this.tasks()
      .filter(task => !task.completed)
      .sort((a, b) => this.urgencia(a) - this.urgencia(b));
    const urgent = this.urgentTask();
    if (urgent) {
      return urgentes.filter(t => t.id !== urgent.id).slice(0, 4);
    }
    return urgentes.slice(0, 4);
  });

  /** Ultimas tareas completadas, para confirmar que el boton si hizo algo. */
  readonly recentlyCompleted = computed<Task[]>(() =>
    this.tasks()
      .filter(task => task.completed)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 3)
  );

  readonly pendingCount = computed(() => this.tasks().filter(task => !task.completed).length);

  constructor(private authService: AuthService, private studyData: StudyDataService) {
    this.user = this.authService.getUser();
    this.studyData.recordSession();
    this.stats = this.studyData.getStats();
  }

  ngOnInit(): void {
    this.store.ensureLoaded();
  }

  cargar(): void {
    this.store.refresh();
  }

  /** Marca la tarea urgente como completada; la siguiente ocupa su lugar. */
  completarUrgente(): void {
    const task = this.urgentTask();
    if (!task) return;
    this.store.toggleTask(task.id);
  }

  /** Orden de urgencia: vencidas primero, luego por fecha y hora mas proximas. */
  private urgencia(task: Task): number {
    if (!task.dueDate) return Number.MAX_SAFE_INTEGER;
    const fecha = Number(`${task.dueDate.replace(/-/g, '')}${(task.dueTime || '23:59').replace(':', '')}`);
    return Number.isNaN(fecha) ? Number.MAX_SAFE_INTEGER : fecha;
  }

  /** "Hoy", "Mañana", "En 3 días" o la fecha legible si esta lejos. */
  etiquetaFecha(task: Task): string {
    if (!task.dueDate) return 'Sin fecha';
    const hoy = this.hoyIso();
    if (task.dueDate < hoy) return 'Vencida';
    if (task.dueDate === hoy) return 'Hoy';
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    if (task.dueDate === this.aIso(manana)) return 'Mañana';
    const dias = Math.round((new Date(`${task.dueDate}T00:00`).getTime() - new Date(`${hoy}T00:00`).getTime()) / 86400000);
    if (dias <= 7) return `En ${dias} días`;
    return new Date(`${task.dueDate}T00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  /** Marca cualquier tarea desde la lista de próximas. */
  completar(task: Task, event?: Event): void {
    event?.stopPropagation();
    this.store.toggleTask(task.id);
  }

  private hoyIso(): string {
    return this.aIso(new Date());
  }

  private aIso(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }
}
