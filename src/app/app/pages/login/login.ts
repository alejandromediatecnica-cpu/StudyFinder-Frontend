/**
 * Pantalla de inicio de sesión (/login).
 *
 * Flujo:
 *  1. `submit()` valida implícitamente (el backend decide) y llama a
 *     `AuthService.login(email, password)` -> `POST /auth/login`.
 *  2. El backend responde `{token, user}`; el servicio guarda el token en
 *     localStorage y el usuario en memoria.
 *  3. Al `next`, se navega a `/main` (protegido por `authGuard`).
 *  4. Si falla, se traduce el error con `mensajeDeError`.
 *
 * SIN ZONE.JS: `success`, `loading` y `error` SON signals. Si fueran campos
 * normales, la plantilla no se actualizaría al llegar la respuesta HTTP.
 *
 * CÓMO CAMBIAR EL DESTINO TRAS LOGIN
 *  - `this.router.navigate(['/main'])` en `submit()`.
 * CÓMO CAMBIAR LAS VALIDACIONES
 *  - Backend: `app/api/auth.py` (política de contraseñas, rate limit).
 *  - Frontend: `login.html` (required/type/autocomplete) y este `submit()`.
 * CÓMO MOSTRAR OTRO MENSAJE DE ERROR
 *  - `mensajeDeError()` / `src/app/utils/backend-error.ts`.
 */

import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { mensajeDeErrorBackend } from '../../../utils/backend-error';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  // Campos del formulario: ngModel los escribe y `submit` los lee.
  email = '';
  password = '';
  // La app corre sin zone.js: angular zoneless. Los campos que se actualizan
  // dentro de subscribe (asincrono) deben ser signals o el DOM nunca cambia.
  success = signal(false);
  loading = signal(false);
  error = signal('');

  constructor(private authService: AuthService, private router: Router) {}

  /**
   * Envía las credenciales.
   *
   * Resetea estado antes de la petición (evita mensajes viejos), desactiva el
   * botón con `loading` y navega a `/main` si el backend devuelve 200.
   */
  submit(): void {
    this.success.set(false);
    this.loading.set(true);
    this.error.set('');
    this.authService.login(this.email, this.password).subscribe({
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

  /**
   * Traduce el error HTTP a un mensaje para el usuario.
   *
   * - status 0 = no hubo respuesta (backend apagado / CORS / red).
   * - TimeoutError = el `timeout()` del interceptor/servicio venció.
   * - Los errores del backend son genéricos a propósito (no revelan si el
   *   correo existe); si mencionan "correo" se unifican en el mismo texto.
   */
  private mensajeDeError(error: unknown): string {
    if (error && typeof error === 'object' && (error as { status?: number }).status === 0) {
      return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.';
    }
    if ((error as { name?: string }).name === 'TimeoutError') {
      return 'El servidor tardó demasiado. Verifica que el backend esté activo.';
    }
    const mensaje = mensajeDeErrorBackend(error);
    if (mensaje && mensaje.toLowerCase().includes('correo')) {
      return 'Correo electrónico o contraseña incorrectos.';
    }
    return mensaje || 'No se pudo iniciar sesión.';
  }
}
