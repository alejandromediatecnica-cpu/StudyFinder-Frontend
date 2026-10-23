import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { LoginComponent } from './login';
import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';

const API = `${environment.apiUrl}/auth`;

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function rellenar(email: string, password: string): void {
    component.email = email;
    component.password = password;
    component.submit();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('envio', () => {
    it('marca la sesion como cargando mientras espera', () => {
      rellenar('ada@correo.com', 'secreto');
      expect(component.loading()).toBe(true);
      http.expectOne(`${API}/login`).flush({});
    });

    it('navega a /main cuando la sesion arranca bien', async () => {
      const navegar = vi.spyOn(router, 'navigate');
      rellenar('ada@correo.com', 'secreto');
      http.expectOne(`${API}/login`).flush({
        token: 't',
        user: { id: '1', name: 'Ada', email: 'ada@correo.com' },
      });

      expect(navegar).toHaveBeenCalledWith(['/main']);
      expect(component.success()).toBe(true);
      expect(component.loading()).toBe(false);
    });

    it('muestra el detalle de error que devuelve el backend', () => {
      rellenar('ada@correo.com', 'mala');
      http.expectOne(`${API}/login`).flush(
        { detail: 'Correo o contrasena incorrectos' },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(component.error()).toBe('Correo electrónico o contraseña incorrectos.');
      expect(component.loading()).toBe(false);
      expect(component.success()).toBe(false);
    });

    it('usa un texto generico si el backend no envia detalle', () => {
      rellenar('ada@correo.com', 'mala');
      http.expectOne(`${API}/login`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.error()).toBe('No se pudo iniciar sesión.');
    });

    it('avisa cuando no se puede contactar con el backend', () => {
      rellenar('ada@correo.com', 'mala');
      http.expectOne(`${API}/login`).error(new ProgressEvent('error'), { status: 0 });
      expect(component.error()).toMatch(/servidor/i);
      expect(component.error()).toMatch(/backend/i);
      expect(component.loading()).toBe(false);
    });

    it('muestra el detalle 422 de validacion que manda el backend', () => {
      rellenar('ada@correo.com', 'mala');
      http.expectOne(`${API}/login`).flush(
        { detail: [{ msg: 'value is not a valid email address', loc: ['body', 'email'] }] },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      expect(component.error()).toBe('value is not a valid email address');
    });
  });

  // El mensaje de timeout solia pedir revisar MongoDB, que no interviene en la
  // autenticacion: el backend es SQLite desde hace varios commits.
  it('no menciona MongoDB cuando la peticion expira', async () => {
    vi.useFakeTimers();
    try {
      component.email = 'ada@correo.com';
      component.password = 'secreto';
      component.submit();
      await vi.advanceTimersByTimeAsync(10_001);
      expect(component.error()).toMatch(/backend/i);
      expect(component.error()).not.toMatch(/mongo/i);
    } finally {
      vi.useRealTimers();
      // El unsubscribe por timeout deja la peticion registrada en el backend de
      // pruebas; hay que drenarla para no ensuciar http.verify().
      http.match(() => true);
    }
  });

  it('limpia el error anterior al reintentar', () => {
    component.error.set('error viejo');
    component.email = 'ada@correo.com';
    component.password = 'secreto';
    component.submit();
    expect(component.error()).toBe('');
    http.expectOne(`${API}/login`).flush({});
  });

  describe('mostrar el error en la plantilla', () => {
    it('pinta el detalle del backend en el aviso', async () => {
      component.email = 'ada@correo.com';
      component.password = 'mala';
      component.submit();
      http.expectOne(`${API}/login`).flush(
        { detail: 'Correo o contrasena incorrectos' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await fixture.whenStable();
      fixture.detectChanges();
      const caja = fixture.nativeElement.querySelector('.form-error') as HTMLElement;
      expect(caja).toBeTruthy();
      expect(caja.textContent).toContain('Correo electrónico o contraseña incorrectos.');
    });

it('no muestra el aviso cuando no hay error', () => {
      component.error.set('');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.form-error')).toBeNull();
    });
  });
});

