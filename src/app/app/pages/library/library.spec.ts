import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LibraryComponent } from './library';
import { routes } from '../../../app.routes';
import { LibraryDocument } from '../../../services/document.service';
import { environment } from '../../../../environments/environment';

const API = `${environment.apiUrl}/documents`;

function doc(id: string, filename: string, size = 2048, extra: Partial<LibraryDocument> = {}): LibraryDocument {
  return { id, filename, contentType: 'application/pdf', size, createdAt: '2026-03-04T10:00:00Z', ...extra };
}

describe('LibraryComponent', () => {
  let component: LibraryComponent;
  let fixture: ComponentFixture<LibraryComponent>;
  let http: HttpTestingController;

  const catalogo = [doc('1', 'Algebra lineal.pdf'), doc('2', 'Calculo.pdf'), doc('3', 'Programacion.docx')];
  const compartidos = [doc('9', 'Libro de Bruno.pdf', 4096, { ownerName: 'Bruno', ownerEmail: 'bruno@correo.com' })];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LibraryComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LibraryComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    // detectChanges() dispara ngOnInit de forma determinista; createComponent
    // lo agendaba a un macrotask posterior y contaminaba los timers falsos.
    // jsdom no implementa la navegacion de anchor.click(), solo imprime ruido.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  afterEach(() => http.verify());

  // ngOnInit lanza DOS peticiones: la lista propia y la de otros usuarios.
  function alCargar(propios: LibraryDocument[] = [], otros: LibraryDocument[] = []): HttpTestingController {
    http.expectOne(API).flush(propios);
    http.expectOne(`${API}/public`).flush(otros);
    return http;
  }

  it('carga los documentos propios y los de otros al inicializar', () => {
    alCargar(catalogo, compartidos);
    expect(component.documentos().length).toBe(3);
    expect(component.publicos().length).toBe(1);
    expect(component.publicos()[0].ownerName).toBe('Bruno');
    expect(component.loading()).toBe(false);
    expect(component.loadingPublic()).toBe(false);
  });

  it('responde con listas vacias y deja de cargar si no hay documentos', () => {
    alCargar();
    expect(component.documentos()).toEqual([]);
    expect(component.publicos()).toEqual([]);
    expect(component.loading()).toBe(false);
  });

  it('avisa especificamente cuando la sesion caduca', () => {
    http.expectOne(API).flush({ detail: 'Invalid token' }, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/public`).flush([]);
    expect(component.error()).toMatch(/sesión anterior ya no es válida/i);
    expect(component.loading()).toBe(false);
  });

  it('usa un texto generico si el backend no envia detalle', () => {
    http.expectOne(API).flush({}, { status: 500, statusText: 'Server Error' });
    http.expectOne(`${API}/public`).flush([]);
    expect(component.error()).toMatch(/no se pudo cargar tu biblioteca/i);
  });

  describe('storageUsed', () => {
    beforeEach(() => alCargar(catalogo, []));

    it('suma el tamaño de los documentos propios', () => {
      expect(component.storageUsed()).toBe(2048 * 3);
    });
  });

  describe('filteredDocuments', () => {
    beforeEach(() => alCargar(catalogo));

    it('devuelve todo cuando no hay filtro', () => {
      expect(component.filteredDocuments().length).toBe(3);
    });

    it('filtra por nombre sin distinguir mayusculas', () => {
      component.filter.set('CALCULO');
      expect(component.filteredDocuments().map(d => d.id)).toEqual(['2']);
    });

    it('ignora espacios sobrantes en el filtro', () => {
      component.filter.set('  algebra  ');
      expect(component.filteredDocuments().map(d => d.id)).toEqual(['1']);
    });

    it('devuelve una lista vacia si nada coincide', () => {
      component.filter.set('quimica');
      expect(component.filteredDocuments()).toEqual([]);
    });
  });

  describe('descarga', () => {
    beforeEach(() => alCargar([], []));

    it('no revoca la URL hasta que el navegador ha leido el blob', async () => {
      const revocar = URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>;
      component.download(catalogo[0]);
      http.expectOne(`${API}/1/download`).flush(new Blob(['contenido']));
      expect(revocar).not.toHaveBeenCalled();
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(revocar).toHaveBeenCalledTimes(1);
    });

    it('informa cuando la descarga falla', () => {
      component.download(catalogo[0]);
      http.expectOne(`${API}/1/download`).flush(new Blob([]), { status: 404, statusText: 'Not Found' });
      expect(component.error()).toBe('No se pudo descargar este documento.');
    });

    it('tambien descarga documentos de otros usuarios', () => {
      component.download(compartidos[0]);
      http.expectOne(`${API}/9/download`).flush(new Blob(['contenido']));
    });
  });

  describe('remove', () => {
    beforeEach(() => alCargar(catalogo));

    it('no hace nada si el usuario cancela la confirmacion', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      component.remove(catalogo[0]);
      http.expectNone(`${API}/1`);
      expect(component.deletingId()).toBeNull();
      expect(component.documentos().length).toBe(3);
    });

    it('elimina el documento y lo quita de la lista', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.remove(catalogo[0]);
      expect(component.deletingId()).toBe('1');
      http.expectOne(`${API}/1`).flush(null);
      expect(component.documentos().map(d => d.id)).toEqual(['2', '3']);
      expect(component.deletingId()).toBeNull();
    });

    it('informa y libera el estado si el borrado falla', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.remove(catalogo[0]);
      http.expectOne(`${API}/1`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.error()).toBe('No se pudo eliminar el documento.');
      expect(component.deletingId()).toBeNull();
    });
  });

  describe('asignar a materia', () => {
    beforeEach(() => alCargar(catalogo, compartidos));

    it('asigna un documento propio a una materia', () => {
      component.asignar('Cálculo II', catalogo[0]);
      const req = http.expectOne(`${API}/1/materias`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ materia: 'Cálculo II' });
      req.flush(null);
      expect(component.asignadoA()['1']).toBe('Cálculo II');
      expect(component.assigningId()).toBeNull();
    });

    it('puede asignar el documento de otro usuario a una materia propia', () => {
      component.asignar('Física', compartidos[0]);
      http.expectOne(`${API}/9/materias`).flush(null);
      expect(component.asignadoA()['9']).toBe('Física');
    });

    it('ignora la opcion vacia del selector', () => {
      component.asignar('', catalogo[0]);
      http.expectNone(`${API}/1/materias`);
    });

    it('informa si la asignacion falla', () => {
      component.asignar('Inglés', catalogo[0]);
      http.expectOne(`${API}/1/materias`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.error()).toBe('No se pudo asignar el documento a la materia.');
      expect(component.assigningId()).toBeNull();
    });
  });

  describe('formatSize', () => {
    // Estos casos no usan el catalogo: solo se drena la peticion de ngOnInit.
    beforeEach(() => http.match(() => true));

    it('muestra bytes por debajo de 1 KB', () => {
      expect(component.formatSize(10)).toBe('10 B');
    });

    it('muestra KB por debajo de 1 MB', () => {
      expect(component.formatSize(2048)).toBe('2.0 KB');
    });

    it('muestra MB a partir de 1 MB', () => {
      expect(component.formatSize(1024 * 1024 * 2.5)).toBe('2.50 MB');
    });
  });
});