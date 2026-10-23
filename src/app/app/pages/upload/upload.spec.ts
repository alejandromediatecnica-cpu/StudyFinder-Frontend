import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadComponent } from './upload';
import { routes } from '../../../app.routes';
import { StudyDataService } from '../../../services/study-data.service';
import { environment } from '../../../../environments/environment';

// El servicio sube por POST a la raiz de la coleccion, sin sufijo /upload.
const API = `${environment.apiUrl}/documents`;

describe('UploadComponent', () => {
  let component: UploadComponent;
  let fixture: ComponentFixture<UploadComponent>;
  let http: HttpTestingController;
  let studyData: StudyDataService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    studyData = TestBed.inject(StudyDataService);
    // ngOnInit (disparado por detectChanges) consulta el espacio libre de la cuota.
    fixture.detectChanges();
    http.expectOne(`${API}/storage`).flush({ used: 0, limit: 3145728, available: 3145728, documentCount: 0, percent: 0 });
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function elegirArchivo(nombre = 'apuntes.pdf', contenido = 'contenido'): File {
    const archivo = new File([contenido], nombre, { type: 'application/pdf' });
    const input = inputDelFormulario();
    // jsdom no implementa DataTransfer, asi que se inyecta la FileList a mano:
    // el componente solo lee input.files?.[0].
    Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
    input.dispatchEvent(new Event('change'));
    return archivo;
  }

  // #fileInput es una template reference variable: no se refleja como atributo
  // id, asi que el input se localiza por su tipo.
  function inputDelFormulario(): HTMLInputElement {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    return input;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('guarda el archivo seleccionado y limpia el mensaje previo', () => {
    component.message.set('mensaje viejo');
    const archivo = elegirArchivo();
    expect(component.selectedFile).toBe(archivo);
    expect(component.message()).toBe('');
  });

  it('no hace nada si no hay archivo seleccionado', () => {
    component.upload();
    http.expectNone(API);
    expect(component.uploading()).toBe(false);
  });

  it('confirma la subida y registra el archivo en las estadisticas', () => {
    const registrar = vi.spyOn(studyData, 'recordUpload');
    elegirArchivo('apuntes.pdf');
    component.upload();

    const req = http.expectOne(API);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'd1', filename: 'apuntes.pdf' });
    // Tras subir, se vuelve a consultar el espacio libre.
    http.expectOne(`${API}/storage`).flush({ used: 10, limit: 3145728, available: 3145718, documentCount: 1, percent: 0 });

    expect(component.message()).toBe('apuntes.pdf se guardó en tu biblioteca.');
    expect(component.error()).toBe('');
    expect(component.uploading()).toBe(false);
    expect(registrar).toHaveBeenCalledWith('apuntes.pdf');
  });

  // Sin limpiar el valor del input, elegir dos veces el mismo archivo no dispara
  // el evento change y la subida queda bloqueada.
  it('vacia el input y la seleccion tras la subida', () => {
    elegirArchivo('apuntes.pdf');
    component.upload();
    http.expectOne(API).flush({ id: 'd1', filename: 'apuntes.pdf' });
    http.expectOne(`${API}/storage`).flush({ used: 10, limit: 3145728, available: 3145718, documentCount: 1, percent: 0 });

    const input = inputDelFormulario();
    expect(component.selectedFile).toBeNull();
    expect(input.value).toBe('');
  });

  it('muestra el detalle de error del backend', () => {
    elegirArchivo('apuntes.pdf');
    component.upload();
    http.expectOne(API).flush(
      { detail: 'El archivo supera los 25 MB' },
      { status: 413, statusText: 'Payload Too Large' },
    );

    expect(component.error()).toBe('El archivo supera los 25 MB');
    expect(component.uploading()).toBe(false);
  });

  it('usa un texto generico si el backend no envia detalle', () => {
    elegirArchivo();
    component.upload();
    http.expectOne(API).flush({}, { status: 500, statusText: 'Server Error' });
    expect(component.error()).toMatch(/sesión/i);
  });

  it('ignora un segundo intento mientras la subida esta en curso', () => {
    elegirArchivo();
    component.upload();
    component.upload();
    http.expectOne(API).flush({ id: 'd1', filename: 'apuntes.pdf' });
    http.expectOne(`${API}/storage`).flush({ used: 10, limit: 3145728, available: 3145718, documentCount: 1, percent: 0 });
  });

  it('rechaza un archivo que supera el espacio libre disponible', () => {
    // Cuota casi llena: solo quedan 1 KB libres.
    component.available.set(1024);
    elegirArchivo('grande.pdf', 'x'.repeat(2048));
    expect(component.selectedFile).toBeNull();
    expect(component.error()).toMatch(/espacio disponible/i);
  });
});
