/**
 * Pantalla de registro (/signup).
 *
 * Flujo:
 *  1. `submit()` llama a `AuthService.signup(name, email, password)` ->
 *     `POST /auth/signup`.
 *  2. El backend valida política de contraseña (>=12, mayúscula, minúscula,
 *     dígito, no en lista de comunes), nombre y correo únicos, y rate limit.
 *  3. Éxito: el servicio guarda token + usuario y se navega a `/main`.
 *
 * SIN ZONE.JS: `success`, `loading` y `error` deben ser signals (se asignan
 * dentro de `subscribe`).
 *
 * CÓMO ENDURECER/RELAJAR LA CONTRASEÑA
 *  - Backend `app/api/auth.py` (constantes de política y `COMMON_PASSWORDS`).
 *  - Texto de ayuda y `minlength` en `signup.html`.
 * CÓMO PEDIR MÁS CAMPOS (p. ej. carrera)
 *  - Añade aquí el campo, en `signup.html` y en el payload del backend.
 */

import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { mensajeDeErrorBackend } from '../../../utils/backend-error';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.css'
})
export class SignupComponent {
  // Campos del formulario (ngModel).
  name = '';
  email = '';
  password = '';
  // La app corre sin zone.js: angular zoneless. Los campos que se actualizan
  // dentro de subscribe (asincrono) deben ser signals o el DOM nunca cambia.
  success = signal(false);
  loading = signal(false);
  error = signal('');

  constructor(private authService: AuthService, private router: Router) {}

  /**
   * Crea la cuenta.
   *
   * No se valida en el cliente más allá de lo que hace el HTML: la fuente de
   * verdad es el backend, que devuelve mensajes genéricos (`GENERIC_SIGNUP_ERROR`)
   * para no filtrar si un correo ya existe.
   */
  submit(): void {
    this.success.set(false);
    this.loading.set(true);
    this.error.set('');
    this.authService.signup(this.name, this.email, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        this.router.navigate(['/main']);
      },
      error: error => {
        this.loading.set(false);
        this.error.set(this.mensajeDeError(error));
      }
    });
  }

  /** Traduce el fallo (red caída, timeout o mensaje del backend). */
  private mensajeDeError(error: unknown): string {
    if (error && typeof error === 'object' && (error as { status?: number }).status === 0) {
      return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.';
    }
    if ((error as { name?: string }).name === 'TimeoutError') {
      return 'El servidor tardó demasiado. Verifica que el backend esté activo.';
    }
    return mensajeDeErrorBackend(error) || 'No se pudo crear la cuenta.';
  }
}
