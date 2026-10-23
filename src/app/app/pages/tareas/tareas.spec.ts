import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TareasComponent } from './tareas';
import { routes } from '../../../app.routes';
import { StudyDataService } from '../../../services/study-data.service';
import { environment } from '../../../../environments/environment';

const DOCS_API = `${environment.apiUrl}/documents`;
const SEARCH_API = `${environment.apiUrl}/search`;

describe('TareasComponent', () => {
  let component: TareasComponent;
  let fixture: ComponentFixture<TareasComponent>;
  let studyData: StudyDataService;
  let http: HttpTestingController;

  const hoy = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TareasComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TareasComponent);
    component = fixture.componentInstance;
    studyData = TestBed.inject(StudyDataService);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  // forkJoin cancela la peticion hermana cuando una falla: verify debe ignorar
// las peticiones canceladas para no romper el teardown de TestBed.
afterEach(() => http.verify({ ignoreCancelled: true }));

  function sembrar() {
    studyData.addTask({ title: 'Integrales dobles', subject: 'Matemáticas', status: 'pending', completed: true, dueDate: hoy() });
    studyData.addTask({ title: 'Entrega laboratorio', subject: 'Física', status: 'pending', completed: false, dueDate: hoy() });
    studyData.addTask({ title: 'Practica Angular', subject: 'Programación', status: 'pending', completed: false, dueDate: hoy() });
    component.cargar();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('agrupacion', () => {
    it('agrupa por estado derivado de completed y dueDate', () => {
      sembrar();
      // La primera tarea esta completada, asi que va a "Completadas" y no a "Hoy".
      expect(component.filteredTasks('today').length).toBe(2);
      expect(component.filteredTasks('done').length).toBe(1);
    });

    it('una tarea sin fecha va a pendientes', () => {
      studyData.addTask({ title: 'Sin fecha', status: 'pending', completed: false });
      component.cargar();
      expect(component.filteredTasks('pending').length).toBe(1);
    });

    it('filtra por titulo o materia sin distinguir mayusculas', () => {
      sembrar();
      component.searchTerm = 'FISICA';
      const resultados = component.filteredTasks('today');
      expect(resultados.length).toBe(1);
      expect(resultados[0].title).toBe('Entrega laboratorio');
    });

    it('busca por termino parcial en el titulo', () => {
      sembrar();
      component.searchTerm = 'Angular';
      expect(component.filteredTasks('today').map(task => task.title)).toEqual(['Practica Angular']);
    });

    it('devuelve vacio cuando nada coincide', () => {
      sembrar();
      component.searchTerm = 'inexistente';
      expect(component.filteredTasks('today')).toEqual([]);
    });

    it('ignora espacios sobrantes', () => {
      sembrar();
      component.searchTerm = '   ';
      expect(component.filteredTasks('today').length).toBe(2);
      expect(component.totalCount).toBe(3);
    });
  });

  describe('cifras del encabezado', () => {
    it('pendingCount suma las pendientes y omite las completadas', () => {
      sembrar();
      expect(component.pendingCount).toBe(2);
    });

    it('countByStatus coincide con la lista correspondiente', () => {
      sembrar();
      expect(component.countByStatus('today')).toBe(component.filteredTasks('today').length);
      expect(component.countByStatus('done')).toBe(component.filteredTasks('done').length);
    });

    it('totalCount cuenta todas las tareas', () => {
      sembrar();
      expect(component.totalCount).toBe(3);
    });
  });

  it('clearSearch vacia el termino', () => {
    component.searchTerm = 'angular';
    component.clearSearch();
    expect(component.searchTerm).toBe('');
  });

  describe('crear tarea', () => {
    it('crea una tarea con fecha y la refleja en el calendario', () => {
      component.abrirFormulario();
      component.formTitle = 'Entrega TP2';
      component.formSubject = 'Programación';
      component.formDate = '2026-09-10';
      component.formTime = '18:00';
      component.guardar();

      const tasks = studyData.getTasks();
      expect(tasks.some(t => t.title === 'Entrega TP2')).toBe(true);

      const eventos = studyData.getEvents();
      expect(eventos.some(e => e.title === 'Entrega TP2' && e.date === '2026-09-10')).toBe(true);
    });

    it('no crea una tarea sin titulo', () => {
      component.abrirFormulario();
      component.formTitle = '';
      component.guardar();
      expect(component.formError).toMatch(/t.tulo/i);
      expect(studyData.getTasks().length).toBe(0);
    });

    it('no crea evento en el calendario si la tarea no tiene fecha', () => {
      component.abrirFormulario();
      component.formTitle = 'Sin fecha';
      component.guardar();
      expect(studyData.getTasks().length).toBe(1);
      expect(studyData.getEvents().length).toBe(0);
    });
  });

  describe('editar / eliminar / completar', () => {
    beforeEach(() => {
      sembrar();
    });

    it('editar precarga el formulario y actualiza', () => {
      const task = component.filteredTasks('today')[0];
      component.editar(task);
      expect(component.formTitle).toBe(task.title);
      expect(component.editingId).toBe(task.id);

      component.formTitle = 'Titulo editado';
      component.guardar();

      expect(studyData.getTasks().some(t => t.id === task.id && t.title === 'Titulo editado')).toBe(true);
    });

    it('toggleCompleted cambia el estado', () => {
      const task = component.filteredTasks('today').find(t => !t.completed)!;
      component.toggleCompleted(task);
      expect(studyData.getTasks().find(t => t.id === task.id)?.completed).toBe(true);
    });

    it('eliminar borra la tarea', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const task = component.filteredTasks('today')[0];
      component.eliminar(task);
      expect(studyData.getTasks().some(t => t.id === task.id)).toBe(false);
    });

    it('no elimina si se cancela', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const task = component.filteredTasks('today')[0];
      component.eliminar(task);
      expect(studyData.getTasks().some(t => t.id === task.id)).toBe(true);
    });
  });

  describe('adjuntar documentos', () => {
    it('adjunta un documento de la biblioteca', () => {
      component.abrirFormulario();
      component.formTitle = 'Leer apuntes';
      component.abrirSelectorDocumento('biblioteca');
      http.expectOne(DOCS_API).flush([
        { id: 'd1', filename: 'Apuntes.pdf', contentType: 'application/pdf', size: 100, createdAt: '2026-01-01' }
      ]);
      http.expectOne(`${DOCS_API}/public`).flush([]);

      component.adjuntarDocumento(component.libraryDocuments()[0], 'biblioteca');
      component.guardar();

      const task = studyData.getTasks().find(t => t.title === 'Leer apuntes');
      expect(task?.documents).toEqual([{ id: 'd1', name: 'Apuntes.pdf', url: undefined, origin: 'biblioteca' }]);
    });

    it('ofrece tambien los documentos compartidos por otros usuarios', () => {
      component.abrirSelectorDocumento('biblioteca');
      http.expectOne(DOCS_API).flush([
        { id: 'd1', filename: 'Mio.pdf', contentType: 'application/pdf', size: 100, createdAt: '2026-01-01' }
      ]);
      http.expectOne(`${DOCS_API}/public`).flush([
        { id: 'd9', filename: 'De Bruno.pdf', contentType: 'application/pdf', size: 200, createdAt: '2026-01-02', ownerName: 'Bruno' }
      ]);

      expect(component.libraryDocuments().map(d => d.filename)).toEqual(['Mio.pdf', 'De Bruno.pdf']);
    });

    it('adjunta un documento compartido y lo refleja en el calendario', () => {
      component.abrirFormulario();
      component.formTitle = 'Repasar apunte ajeno';
      component.formDate = '2026-09-15';
      component.abrirSelectorDocumento('biblioteca');
      http.expectOne(DOCS_API).flush([]);
      http.expectOne(`${DOCS_API}/public`).flush([
        { id: 'd9', filename: 'De Bruno.pdf', contentType: 'application/pdf', size: 200, createdAt: '2026-01-02' }
      ]);

      component.adjuntarDocumento(component.libraryDocuments()[0], 'biblioteca');
      component.guardar();

      const event = studyData.getEvents().find(e => e.date === '2026-09-15');
      expect(event?.documents).toEqual([{ id: 'd9', name: 'De Bruno.pdf', url: undefined, origin: 'biblioteca' }]);
    });

    it('adjunta un resultado de la busqueda de la API', () => {
      component.abrirFormulario();
      component.formTitle = 'Leer paper';
      component.docSearchTerm = 'algebra';
      component.buscarDocumentos();
      http.expectOne(`${SEARCH_API}?q=algebra`).flush([{ id: 'p1', title: 'Algebra Lineal', url: 'https://x.com/p1' }]);

      component.adjuntarDocumento(component.searchResults()[0], 'busqueda');
      component.guardar();

      const task = studyData.getTasks().find(t => t.title === 'Leer paper');
      expect(task?.documents).toEqual([
        { id: 'p1', name: 'Algebra Lineal', url: 'https://x.com/p1', origin: 'busqueda' }
      ]);
    });

    it('informa si la biblioteca falla', () => {
      component.abrirSelectorDocumento('biblioteca');
      // forkJoin cancela la otra peticion cuando una falla, asi que no se vacia.
      http.expectOne(DOCS_API).error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
      expect(component.errorDocuments()).toMatch(/no se pudo cargar la biblioteca/i);
      expect(component.loadingDocuments()).toBe(false);
    });

    it('informa si falla la biblioteca compartida', () => {
      component.abrirSelectorDocumento('biblioteca');
      http.expectOne(DOCS_API).flush([]);
      http.expectOne(`${DOCS_API}/public`).error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
      expect(component.errorDocuments()).toMatch(/no se pudo cargar la biblioteca/i);
    });

    it('adjunta varios documentos a la misma tarea', () => {
      component.abrirFormulario();
      component.formTitle = 'Tarea con varios anexos';
      component.abrirSelectorDocumento('biblioteca');
      http.expectOne(DOCS_API).flush([
        { id: 'd1', filename: 'Apuntes.pdf', contentType: 'application/pdf', size: 10, createdAt: '2026-01-01' },
        { id: 'd2', filename: 'Enunciado.pdf', contentType: 'application/pdf', size: 20, createdAt: '2026-01-01' }
      ]);
      http.expectOne(`${DOCS_API}/public`).flush([]);

      component.adjuntarDocumento(component.libraryDocuments()[0], 'biblioteca');
      component.adjuntarDocumento(component.libraryDocuments()[1], 'biblioteca');
      // El selector sigue abierto para poder seguir adjuntando.
      expect(component.docPickerOpen()).toBe(true);
      expect(component.attachedDocuments.length).toBe(2);
      component.guardar();

      const task = studyData.getTasks().find(t => t.title === 'Tarea con varios anexos');
      expect(task?.documents?.map(d => d.name)).toEqual(['Apuntes.pdf', 'Enunciado.pdf']);
    });

    it('no adjunta dos veces el mismo documento', () => {
      component.abrirFormulario();
      component.formTitle = 'Sin duplicados';
      component.abrirSelectorDocumento('biblioteca');
      http.expectOne(DOCS_API).flush([
        { id: 'd1', filename: 'Apuntes.pdf', contentType: 'application/pdf', size: 10, createdAt: '2026-01-01' }
      ]);
      http.expectOne(`${DOCS_API}/public`).flush([]);

      const doc = component.libraryDocuments()[0];
      component.adjuntarDocumento(doc, 'biblioteca');
      component.adjuntarDocumento(doc, 'biblioteca');
      expect(component.attachedDocuments.length).toBe(1);
      expect(component.yaAdjuntado(doc)).toBe(true);
    });

    it('quita un documento por su posición', () => {
      component.abrirFormulario();
      component.formTitle = 'Quitar anexo';
      component.abrirSelectorDocumento('biblioteca');
      http.expectOne(DOCS_API).flush([
        { id: 'd1', filename: 'A.pdf', contentType: 'application/pdf', size: 10, createdAt: '2026-01-01' },
        { id: 'd2', filename: 'B.pdf', contentType: 'application/pdf', size: 20, createdAt: '2026-01-01' }
      ]);
      http.expectOne(`${DOCS_API}/public`).flush([]);

      component.adjuntarDocumento(component.libraryDocuments()[0], 'biblioteca');
      component.adjuntarDocumento(component.libraryDocuments()[1], 'biblioteca');
      component.quitarDocumento(0);

      expect(component.attachedDocuments.map(d => d.name)).toEqual(['B.pdf']);
    });

    it('al editar recupera los documentos adjuntos', () => {
      component.abrirFormulario();
      component.formTitle = 'Con anexos';
      component.attachedDocuments.push({ id: 'd1', name: 'Apuntes.pdf', origin: 'biblioteca' });
      component.guardar();

      const task = studyData.getTasks()[0];
      component.editar(task);
      expect(component.attachedDocuments.map(d => d.name)).toEqual(['Apuntes.pdf']);
    });

    it('informa si la busqueda falla', () => {
      component.docSearchTerm = 'x';
      component.buscarDocumentos();
      http.expectOne(`${SEARCH_API}?q=x`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.errorDocuments()).toMatch(/no se pudo realizar la búsqueda/i);
    });
  });

  it('tipoLabel traduce los tipos', () => {
    expect(component.tipoLabel('trabajo')).toBe('Trabajo');
    expect(component.tipoLabel('evento')).toBe('Evento');
    expect(component.tipoLabel('tarea')).toBe('Tarea');
    expect(component.tipoLabel(undefined)).toBe('Tarea');
  });

  describe('borrado masivo en dos pasos', () => {
    it('el primer clic solo pide confirmacion, no borra', () => {
      sembrar();
      component.pedirBorrarTodas();

      expect(component.confirmandoBorrado()).toBe(true);
      expect(component.tasks().length).toBe(3);
    });

    it('sin tareas no pide confirmacion', () => {
      component.cargar();
      component.pedirBorrarTodas();
      expect(component.confirmandoBorrado()).toBe(false);
    });

    it('cancelar deja las tareas intactas', () => {
      sembrar();
      component.pedirBorrarTodas();
      component.cancelarBorrarTodas();

      expect(component.confirmandoBorrado()).toBe(false);
      expect(component.tasks().length).toBe(3);
    });

    it('el segundo clic borra todas las tareas', () => {
      sembrar();
      component.pedirBorrarTodas();
      component.confirmarBorrarTodas();

      expect(component.confirmandoBorrado()).toBe(false);
      expect(component.tasks().length).toBe(0);
      expect(studyData.getTasks().length).toBe(0);
    });
  });
});