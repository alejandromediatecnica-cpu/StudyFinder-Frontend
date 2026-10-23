/**
 * Mensajería (ruta '/main/mensajes').
 *
 * Qué hace:
 *  - Lista contactos aceptados, solicitudes entrantes/salientes y el hilo del
 *    contacto abierto.
 *  - Busca usuarios por nombre (`GET /users/search`) y envía solicitudes.
 *  - Envía texto y/o un archivo de hasta 3 MB (FormData).
 *  - Se refresca en vivo con SSE: los eventos `messages` y `contacts` recargan
 *    listas y, si hay hilo abierto, el historial.
 *
 * REGLA DEL BACKEND: solo los contactos en estado `aceptado` pueden leer o
 * enviar mensajes (403 si no). Los archivos viven en `uploads/<user_id>/...` y
 * se descargan por endpoints que exigen Bearer.
 *
 * SIN ZONE.JS: todo el estado que llega en `subscribe`/SSE debe ser signal
 * (`yo`, `contactos`, `mensajes`, etc.). `texto`/`archivo` son campos normales
 * porque los escribe ngModel/input de forma síncrona.
 *
 * CÓMO CAMBIAR EL LÍMITE DE ARCHIVO
 *  - `onFile()` (3 * 1024 * 1024) y backend `app/api/messages.py`.
 * CÓMO AÑADIR "ESCRIBIENDO..." O LEÍDOS
 *  - Requiere nuevos eventos SSE y campos en el backend; hoy no existen.
 */

import { Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { MessagesService } from '../../../services/messages.service';
import { RealtimeService } from '../../../services/realtime.service';

@Component({
  standalone: true,
  selector: 'app-mensajes',
  imports: [CommonModule, FormsModule],
  templateUrl: './mensajes.html',
  styleUrl: './mensajes.css',
})
export class MensajesComponent implements OnDestroy {
  private readonly ms = inject(MessagesService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroy$ = new Subject<void>();

  // La app es zoneless: el estado que llega en callbacks async debe ser signal
  // para que la plantilla se vuelva a renderizar.
  readonly yo = signal<any>(null);            // perfil propio
  readonly contactos = signal<any[]>([]);     // contactos aceptados
  readonly entrantes = signal<any[]>([]);     // solicitudes recibidas
  readonly salientes = signal<any[]>([]);     // solicitudes enviadas
  readonly activo = signal<any>(null);        // usuario del hilo abierto
  readonly mensajes = signal<any[]>([]);      // historial del hilo
  readonly mostrarAgregar = signal(false);    // panel "agregar contacto"
  readonly resultados = signal<any[]>([]);    // búsqueda de usuarios
  readonly busco = signal(false);             // ya se intentó buscar

  // Entrada del mensaje (síncrona, no necesitan signal).
  texto = '';
  archivo?: File;
  nombreAgregar = '';

  constructor() {
    this.cargar();
    // Refresco en vivo: nuevos mensajes, solicitudes y contactos llegan por SSE.
    // Si el evento es `messages` y hay hilo abierto, se recarga su historial;
    // en ambos casos se recargan contadores/listas.
    this.realtime.events$
      .pipe(
        filter(event => ['messages', 'contacts'].includes(event.entity)),
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
        const activo = this.activo();
        if (event.entity === 'messages' && activo) {
          // Recarga el hilo abierto con el mensaje recien llegado.
          this.ms.messages(activo.id).subscribe((r: any) => this.mensajes.set(r));
        }
        this.cargar();
      });
  }

  /** Desuscribe el SSE al salir de la página. */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Recarga perfil, contactos y solicitudes (4 peticiones en paralelo).
   * Se llama al entrar, tras aceptar/rechazar/enviar solicitud y en cada evento SSE.
   */
  cargar(): void {
    this.ms.getMe().subscribe((r: any) => this.yo.set(r));
    this.ms.contacts().subscribe((r: any) => this.contactos.set(r));
    this.ms.incoming().subscribe((r: any) => this.entrantes.set(r));
    this.ms.outgoing().subscribe((r: any) => this.salientes.set(r));
  }

  /** Abre el hilo de un contacto (`contacto.otro` es el usuario). */
  abrir(contacto: any): void {
    this.abrirConversacion(contacto.otro);
  }

  /** Abre un hilo con un usuario concreto y limpia el anterior. */
  abrirConversacion(usuario: any): void {
    this.activo.set(usuario);
    this.mensajes.set([]);
    this.ms.messages(usuario.id).subscribe((r: any) => this.mensajes.set(r));
  }

  /**
   * Envía el mensaje actual (texto y/o archivo).
   *
   * No hace falta recargar: el backend devuelve el mensaje creado y se añade a
   * la lista local. También se limpia el input de archivo del DOM.
   */
  enviar(): void {
    const activo = this.activo();
    if (!activo) return;
    const texto = this.texto.trim();
    if (!texto && !this.archivo) return; // no enviar vacío
    this.ms.send(activo.id, texto, this.archivo).subscribe((r: any) => {
      this.mensajes.update(lista => [...lista, r]);
      this.texto = '';
      this.archivo = undefined;
      // El input file no está enlazado a ngModel: se limpia a mano.
      const input = document.querySelector('#archivo') as HTMLInputElement | null;
      if (input) input.value = '';
    });
  }

  /** Valida el tamaño del archivo (mismo límite que el backend: 3 MB). */
  onFile(event: any): void {
    const file = event.target.files?.[0];
    if (file && file.size > 3 * 1024 * 1024) {
      alert('El archivo no debe superar 3 MB');
      event.target.value = '';
      return;
    }
    this.archivo = file;
  }

  /** Abre/cierra el panel de búsqueda de usuarios y resetea su estado. */
  abrirAgregar(): void {
    this.mostrarAgregar.update(v => !v);
    this.nombreAgregar = '';
    this.resultados.set([]);
    this.busco.set(false);
  }

  /** Busca usuarios por nombre (mínimo 2 caracteres, igual que el backend). */
  buscar(): void {
    const nombre = this.nombreAgregar.trim();
    this.busco.set(true);
    if (nombre.length < 2) {
      this.resultados.set([]);
      return;
    }
    this.ms.search(nombre).subscribe({
      next: (r: any) => this.resultados.set(r),
      error: () => this.resultados.set([]),
    });
  }

  /** Envía solicitud de contacto; al aceptarse se podrá chatear. */
  enviarSolicitud(usuario: any): void {
    this.ms.sendRequest(usuario.id).subscribe({
      next: () => {
        alert('Solicitud enviada');
        // Desaparece de la lista de resultados para no duplicar el envío.
        this.resultados.update(lista => lista.filter(u => u.id !== usuario.id));
        this.cargar();
      },
      error: (e: any) => alert(e?.error?.detail || 'Error al enviar solicitud'),
    });
  }

  /** Acepta una solicitud entrante (pasa a contacto y habilita el chat). */
  aceptar(id: string): void {
    this.ms.accept(id).subscribe(() => this.cargar());
  }

  /** Rechaza una solicitud entrante. */
  rechazar(id: string): void {
    this.ms.reject(id).subscribe(() => this.cargar());
  }

  /** URL de descarga de un adjunto (requiere Bearer; ver MessagesService). */
  archivoUrl(path: string): string {
    return this.ms.attachmentUrl(path);
  }
}
