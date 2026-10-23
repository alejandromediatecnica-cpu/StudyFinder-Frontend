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
  name = '';
  email = '';
  password = '';
  // La app corre sin zone.js: angular zoneless. Los campos que se actualizan
  // dentro de subscribe (asincrono) deben ser signals o el DOM nunca cambia.
  success = signal(false);
  loading = signal(false);
  error = signal('');

  constructor(private authService: AuthService, private router: Router) {}

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