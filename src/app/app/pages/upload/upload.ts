/**
 * Subir documento (ruta '/main/upload').
 *
 * Flujo:
 *  1. Al entrar consulta la cuota real (`GET /documents/storage`) para saber
 *     cuánto espacio queda.
 *  2. Al elegir archivo valida en cliente `size <= maxBytes`; el backend vuelve
 *     a validar tamaño, cuota (413) y tipo por magic bytes.
 *  3. `upload()` manda FormData, guarda la métrica local (`recordUpload`),
 *     limpia el input y refresca el espacio disponible.
 *
 * LÍMITES: 3 MB por usuario (`MAX_STORAGE_PER_USER` aquí y en
 * `app/api/documents.py`; deben coincidir). Tipos permitidos: pdf/doc/docx/
 * ppt/pptx/xls/xlsx, comprobados en el backend.
 *
 * SIN ZONE.JS: `message`, `uploading`, `error`, `available` son signals porque
 * se actualizan dentro de `subscribe`. `selectedFile` no aparece como estado
 * asíncrono en la plantilla hasta el cambio, pero se deja normal como antes.
 *
 * CÓMO AUMENTAR LA CUOTA O EL TIPO DE ARCHIVOS
 *  - Backend `app/api/documents.py` y `app/files.py` (magic bytes), y esta
 *    constante para que la UI muestre el límite correcto.
 */

import { Component, ElementRef, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DocumentService } from '../../../services/document.service';
import { StudyDataService } from '../../../services/study-data.service';
import { mensajeDeErrorBackend } from '../../../utils/backend-error';

/** Cuota total por usuario: 3 MB. */
const MAX_STORAGE_PER_USER = 3 * 1024 * 1024;

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './upload.html',
  styleUrl: './upload.css'
})
export class UploadComponent implements OnInit {
  // Sin esta referencia, tras una subida correcta el <input type="file"> conserva
  // el valor anterior y el evento change no vuelve a dispararse al elegir el
  // mismo archivo otra vez.
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  selectedFile: File | null = null;
  // Cambian dentro de subscribe (asincrono): sin zone.js deben ser signals.
  message = signal('');
  uploading = signal(false);
  error = signal('');
  // Espacio libre disponible en la cuota del usuario.
  available = signal(MAX_STORAGE_PER_USER);

  constructor(private documents: DocumentService, private studyData: StudyDataService) {}

  /** Pide el espacio libre real al entrar en la página. */
  ngOnInit(): void {
    this.cargarEspacio();
  }

  /** Consulta el espacio libre real para limitar el tamano aceptado. */
  private cargarEspacio(): void {
    this.documents.storage().subscribe({
      next: storage => this.available.set(Math.max(0, storage.available)),
      // Si falla, se conserva la cuota total como tope optimista.
      error: () => undefined
    });
  }

  /** Tamano maximo que se puede subir ahora mismo. */
  get maxBytes(): number {
    return Math.min(MAX_STORAGE_PER_USER, this.available());
  }

  /** Formatea bytes (B / KB / MB) para los mensajes. */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Valida el archivo elegido antes de subirlo.
   *
   * Si excede el espacio libre se descarta y se limpia el input (para poder
   * volver a elegir el mismo archivo). La validación definitiva es del backend.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.message.set('');
    this.error.set('');
    if (file.size > this.maxBytes) {
      this.selectedFile = null;
      input.value = '';
      this.error.set(
        `El archivo supera el espacio disponible (${this.formatSize(this.maxBytes)} libres).`
      );
      return;
    }
    this.selectedFile = file;
  }

  /**
   * Sube el archivo seleccionado.
   *
   * Revalida el tamaño (el espacio pudo cambiar entre selección y clic),
   * bloquea dobles envíos con `uploading`, y al terminar limpia el input y
   * recarga el espacio disponible.
   */
  upload(): void {
    if (!this.selectedFile || this.uploading()) return;
    if (this.selectedFile.size > this.maxBytes) {
      this.error.set(
        `El archivo supera el espacio disponible (${this.formatSize(this.maxBytes)} libres).`
      );
      return;
    }
    this.uploading.set(true);
    this.error.set('');
    this.documents.upload(this.selectedFile).subscribe({
      next: document => {
        this.message.set(`${document.filename} se guardó en tu biblioteca.`);
        // Estadística local de uso (StudyDataService).
        this.studyData.recordUpload(document.filename);
        this.selectedFile = null;
        this.uploading.set(false);
        // Limpia el input para permitir subir el mismo archivo otra vez.
        if (this.fileInput) this.fileInput.nativeElement.value = '';
        // La cuota bajó: refresca el espacio disponible.
        this.cargarEspacio();
      },
      error: response => {
        // El backend devuelve 413 (cuota), 415 (tipo) o 401 (sesión).
        this.error.set(
          mensajeDeErrorBackend(response) || 'No se pudo guardar el archivo. Comprueba tu sesión y vuelve a intentarlo.'
        );
        this.uploading.set(false);
      }
    });
  }
}
