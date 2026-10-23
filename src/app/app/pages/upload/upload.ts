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

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

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
        this.studyData.recordUpload(document.filename);
        this.selectedFile = null;
        this.uploading.set(false);
        if (this.fileInput) this.fileInput.nativeElement.value = '';
        // La cuota bajó: refresca el espacio disponible.
        this.cargarEspacio();
      },
      error: response => {
        this.error.set(
          mensajeDeErrorBackend(response) || 'No se pudo guardar el archivo. Comprueba tu sesión y vuelve a intentarlo.'
        );
        this.uploading.set(false);
      }
    });
  }
}
