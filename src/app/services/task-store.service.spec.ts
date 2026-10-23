import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TaskStoreService } from './task-store.service';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

describe('TaskStoreService', () => {
  let service: TaskStoreService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('studyfinder_token', 'token-abc');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TaskStoreService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('un evento del calendario tambien crea una tarea vinculada', () => {
    service.createEvent({
      title: 'Parcial de calculo',
      date: '2026-11-10',
      hour: '08:00',
      type: 'evento',
    });

    // 1) Se crea el evento.
    const crearEvento = http.expectOne(`${API}/calendar`);
    expect(crearEvento.request.method).toBe('POST');
    crearEvento.flush({
      id: 'ev-1',
      title: 'Parcial de calculo',
      date: '2026-11-10',
      hour: '08:00',
      type: 'evento',
      taskId: null,
    });

    // 2) El evento genera una tarea con su misma fecha.
    const crearTarea = http.expectOne(`${API}/tasks`);
    expect(crearTarea.request.method).toBe('POST');
    expect(crearTarea.request.body.title).toBe('Parcial de calculo');
    expect(crearTarea.request.body.dueDate).toBe('2026-11-10');
    expect(crearTarea.request.body.dueTime).toBe('08:00');
    crearTarea.flush({
      id: 'ta-1',
      title: 'Parcial de calculo',
      dueDate: '2026-11-10',
      dueTime: '08:00',
      status: 'pending',
      type: 'evento',
      completed: false,
    });

    // 3) La tarea queda disponible (la pantalla de inicio la muestra).
    expect(service.tasks().map(t => t.id)).toContain('ta-1');

    // 4) El evento se enlaza con la tarea recien creada.
    const enlazar = http.expectOne(`${API}/calendar/ev-1`);
    expect(enlazar.request.method).toBe('PATCH');
    expect(enlazar.request.body.taskId).toBe('ta-1');
    enlazar.flush({
      id: 'ev-1',
      title: 'Parcial de calculo',
      date: '2026-11-10',
      hour: '08:00',
      type: 'evento',
      taskId: 'ta-1',
    });
  });

  it('una tarea con fecha crea su evento en el calendario', () => {
    service.createTask({
      title: 'Taller de fisica',
      dueDate: '2026-12-01',
      dueTime: '10:00',
      status: 'pending',
      completed: false,
      type: 'tarea',
    });

    const crearTarea = http.expectOne(`${API}/tasks`);
    crearTarea.flush({
      id: 'ta-2',
      title: 'Taller de fisica',
      dueDate: '2026-12-01',
      dueTime: '10:00',
      status: 'pending',
      type: 'tarea',
      completed: false,
    });

    const crearEvento = http.expectOne(`${API}/calendar`);
    expect(crearEvento.request.body.taskId).toBe('ta-2');
    expect(crearEvento.request.body.date).toBe('2026-12-01');
    crearEvento.flush({
      id: 'ev-2',
      title: 'Taller de fisica',
      date: '2026-12-01',
      hour: '10:00',
      type: 'tarea',
      taskId: 'ta-2',
    });

    expect(service.events().map(e => e.id)).toContain('ev-2');
  });

  it('borrar un evento enlazado tambien borra su tarea', () => {
    service.createEvent({ title: 'Reunion', date: '2026-11-20', type: 'evento' });

    http.expectOne(`${API}/calendar`).flush({
      id: 'ev-3',
      title: 'Reunion',
      date: '2026-11-20',
      type: 'evento',
      taskId: null,
    });
    http.expectOne(`${API}/tasks`).flush({
      id: 'ta-3',
      title: 'Reunion',
      dueDate: '2026-11-20',
      status: 'pending',
      type: 'evento',
      completed: false,
    });
    http.expectOne(`${API}/calendar/ev-3`).flush({
      id: 'ev-3',
      title: 'Reunion',
      date: '2026-11-20',
      type: 'evento',
      taskId: 'ta-3',
    });

    service.removeEvent('ev-3');

    http.expectOne(`${API}/calendar/ev-3`).flush(null);
    const borrarTarea = http.expectOne(`${API}/tasks/ta-3`);
    expect(borrarTarea.request.method).toBe('DELETE');
    borrarTarea.flush(null);

    expect(service.tasks().map(t => t.id)).not.toContain('ta-3');
    expect(service.events().map(e => e.id)).not.toContain('ev-3');
  });

  it('recupera como tarea un evento que ya existia sin vincular', () => {
    service.refresh();

    http.expectOne(`${API}/tasks`).flush([]);
    http.expectOne(`${API}/calendar`).flush([
      { id: 'ev-9', title: 'Examen viejo', date: '2026-10-30', type: 'evento', taskId: null },
    ]);

    const crearTarea = http.expectOne(`${API}/tasks`);
    expect(crearTarea.request.method).toBe('POST');
    expect(crearTarea.request.body.title).toBe('Examen viejo');
    crearTarea.flush({
      id: 'ta-9',
      title: 'Examen viejo',
      dueDate: '2026-10-30',
      status: 'pending',
      type: 'evento',
      completed: false,
    });

    http.expectOne(`${API}/calendar/ev-9`).flush({
      id: 'ev-9',
      title: 'Examen viejo',
      date: '2026-10-30',
      type: 'evento',
      taskId: 'ta-9',
    });

    expect(service.tasks().map(t => t.id)).toContain('ta-9');
  });

  it('no duplica la tarea de respaldo ante refrescos repetidos', () => {
    service.refresh();
    http.expectOne(`${API}/tasks`).flush([]);
    http.expectOne(`${API}/calendar`).flush([
      { id: 'ev-7', title: 'Sin vincular', date: '2026-10-31', type: 'evento', taskId: null },
    ]);

    const crear = http.expectOne(`${API}/tasks`);
    expect(crear.request.method).toBe('POST');
    crear.flush({
      id: 'ta-7',
      title: 'Sin vincular',
      dueDate: '2026-10-31',
      status: 'pending',
      type: 'evento',
      completed: false,
    });

    // El evento todavia no tiene taskId en el servidor: llega otro refresh
    // (por ejemplo, el SSE de la tarea recien creada).
    service.refresh();
    http.expectOne(`${API}/tasks`).flush([
      { id: 'ta-7', title: 'Sin vincular', dueDate: '2026-10-31', status: 'pending', type: 'evento', completed: false },
    ]);
    http.expectOne(`${API}/calendar`).flush([
      { id: 'ev-7', title: 'Sin vincular', date: '2026-10-31', type: 'evento', taskId: null },
    ]);

    // No debe crearse una segunda tarea para el mismo evento.
    http.expectNone(`${API}/tasks`);

    // Y se completa el enlace pendiente.
    http.expectOne(`${API}/calendar/ev-7`).flush({
      id: 'ev-7',
      title: 'Sin vincular',
      date: '2026-10-31',
      type: 'evento',
      taskId: 'ta-7',
    });

    expect(service.tasks().filter(t => t.title === 'Sin vincular').length).toBe(1);
  });

  it('removeAllTasks borra todas las tareas y todos los eventos', () => {
    service.refresh();
    http.expectOne(`${API}/tasks`).flush([
      { id: 'ta-1', title: 'Uno', status: 'pending', type: 'tarea', completed: false },
      { id: 'ta-2', title: 'Dos', status: 'pending', type: 'tarea', completed: false },
    ]);
    http.expectOne(`${API}/calendar`).flush([
      { id: 'ev-1', title: 'Uno', date: '2026-11-01', type: 'tarea', taskId: 'ta-1' },
    ]);

    service.removeAllTasks();

    http.expectOne(r => r.method === 'DELETE' && r.url.endsWith('/tasks')).flush(null);

    // Refresco autoritativo al terminar.
    http.expectOne(`${API}/tasks`).flush([]);
    http.expectOne(`${API}/calendar`).flush([]);

    expect(service.tasks().length).toBe(0);
    expect(service.events().length).toBe(0);
  });

  it('removeAllTasks tambien borra eventos sin tarea vinculada', () => {
    service.refresh();
    http.expectOne(`${API}/tasks`).flush([]);
    http.expectOne(`${API}/calendar`).flush([
      { id: 'ev-suelto', title: 'Suelto', date: '2026-11-02', type: 'evento', taskId: null },
    ]);
    // La reconciliacion crea la tarea de respaldo.
    http.expectOne(`${API}/tasks`).flush({
      id: 'ta-suelto',
      title: 'Suelto',
      dueDate: '2026-11-02',
      status: 'pending',
      type: 'evento',
      completed: false,
    });
    http.expectOne(`${API}/calendar/ev-suelto`).flush({
      id: 'ev-suelto',
      title: 'Suelto',
      date: '2026-11-02',
      type: 'evento',
      taskId: 'ta-suelto',
    });

    service.removeAllTasks();

    http.expectOne(r => r.method === 'DELETE' && r.url.endsWith('/tasks')).flush(null);

    // Refresco autoritativo al terminar.
    http.expectOne(`${API}/tasks`).flush([]);
    http.expectOne(`${API}/calendar`).flush([]);

    expect(service.tasks().length).toBe(0);
    expect(service.events().length).toBe(0);
  });

  it('removeAllTasks borra listas largas por tandas antes de refrescar', () => {
    const tareas = Array.from({ length: 40 }, (_, i) => ({
      id: `ta-${i}`,
      title: `Tarea ${i}`,
      status: 'pending',
      type: 'tarea',
      completed: false,
    }));
    service.refresh();
    http.expectOne(`${API}/tasks`).flush(tareas);
    http.expectOne(`${API}/calendar`).flush([]);

    service.removeAllTasks();

    // Una sola peticion borra todo, aunque haya 40 tareas.
    http.expectOne(r => r.method === 'DELETE' && r.url.endsWith('/tasks')).flush(null);
    http.expectOne(`${API}/tasks`).flush([]);
    http.expectOne(`${API}/calendar`).flush([]);

    expect(service.tasks().length).toBe(0);
  });

  it('removeAllTasks cae al borrado individual si el endpoint masivo no existe', () => {
    service.refresh();
    http.expectOne(`${API}/tasks`).flush([
      { id: 'ta-1', title: 'Uno', status: 'pending', type: 'tarea', completed: false },
      { id: 'ta-2', title: 'Dos', status: 'pending', type: 'tarea', completed: false },
    ]);
    http.expectOne(`${API}/calendar`).flush([]);

    service.removeAllTasks();

    // El backend no soporta el borrado masivo.
    http
      .expectOne(r => r.method === 'DELETE' && r.url.endsWith('/tasks'))
      .flush({}, { status: 405, statusText: 'Method Not Allowed' });

    // Se borra tarea por tarea.
    http.expectOne(`${API}/tasks/ta-1`).flush(null);
    http.expectOne(`${API}/tasks/ta-2`).flush(null);

    http.expectOne(`${API}/tasks`).flush([]);
    http.expectOne(`${API}/calendar`).flush([]);

    expect(service.tasks().length).toBe(0);
  });
});
