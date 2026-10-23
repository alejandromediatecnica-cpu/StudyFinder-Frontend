import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { LandingComponent } from './landing';
import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lee el usuario de la sesion guardada', () => {
    localStorage.setItem('studyfinder_user', JSON.stringify({ id: '1', name: 'Ada', email: 'ada@correo.com' }));
    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    expect(component.user()?.name).toBe('Ada');
  });

  it('sobrevive a un usuario corrupto en localStorage', () => {
    localStorage.setItem('studyfinder_user', '{corrupto');
    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    expect(component.user()).toBeNull();
  });

  it('el equipo tiene los 4 integrantes en el orden indicado', () => {
    expect(component.team.map(m => m.name)).toEqual([
      'Alejandro Quintero',
      'Matias Valencia',
      'Samuel Muñoz',
      'Sebastian Melendez',
    ]);
    expect(component.team.map(m => m.role)).toEqual([
      'Full Stack',
      'Backend',
      'Backend',
      'Base de datos',
    ]);
  });

  it('el carrusel rota hacia delante y hacia atras', () => {
    expect(component.activeStudent.name).toBe('Alejandro Quintero');
    component.nextProfile();
    expect(component.activeProfile).toBe(1);
    component.previousProfile();
    expect(component.activeProfile).toBe(0);
    component.previousProfile();
    expect(component.activeProfile).toBe(component.team.length - 1);
  });

  it('selecciona un perfil directamente', () => {
    component.selectProfile(3);
    expect(component.activeStudent.name).toBe('Sebastian Melendez');
  });

  it('alterna el menu de cuenta', () => {
    expect(component.accountMenuOpen()).toBe(false);
    component.toggleAccountMenu();
    expect(component.accountMenuOpen()).toBe(true);
    component.toggleAccountMenu();
    expect(component.accountMenuOpen()).toBe(false);
  });

  it('cierra sesion y vuelve al inicio', () => {
    const navegar = vi.spyOn(router, 'navigate');
    localStorage.setItem('studyfinder_token', 't');
    component.logout();
    http.expectOne(`${environment.apiUrl}/auth/logout`).flush(null);
    expect(localStorage.getItem('studyfinder_token')).toBeNull();
    expect(component.user()).toBeNull();
    expect(component.accountMenuOpen()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/']);
  });
});
