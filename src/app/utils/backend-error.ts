/**
 * Extracción de mensajes de error del backend (FastAPI/Pydantic).
 *
 * `HttpClient` entrega el error en `error.error`, que puede ser:
 *   - string (un `detail` plano o HTML),
 *   - `{ detail: "texto" }` (HTTPException),
 *   - `{ detail: [{ msg, loc, type }] }` (errores de validación 422),
 *   - null/undefined (sin cuerpo).
 *
 * Esta función normaliza todo eso a un texto listo para mostrar en la UI, o
 * `null` si no hay nada útil.
 *
 * CÓMO USARLA EN UNA PÁGINA
 *   this.error.set(mensajeDeErrorBackend(err) ?? 'No se pudo completar la acción.');
 */

/** Tipos posibles de `detail` que devuelve FastAPI. */
export type DetalleBackend = { detail?: unknown } | string | null;

/**
 * Devuelve el mensaje del backend o null.
 *
 * Pasos:
 *  1. Si no es objeto -> null.
 *  2. Cuerpo string -> el propio texto (si no está vacío).
 *  3. Cuerpo objeto con `detail` string -> ese texto.
 *  4. `detail` array (validación) -> une los `msg` de cada error con espacios.
 *  5. Cualquier otra forma -> null.
 */
export function mensajeDeErrorBackend(error: DetalleBackend | unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const cuerpo = (error as { error?: unknown }).error;
  if (cuerpo === null || cuerpo === undefined) return null;

  // Caso 1: el cuerpo HTTP ya es texto.
  if (typeof cuerpo === 'string') {
    return cuerpo.trim() ? cuerpo : null;
  }
  if (typeof cuerpo !== 'object') return null;

  const detalle = (cuerpo as { detail?: unknown }).detail;
  // Caso 2: HTTPException -> { detail: "mensaje" }.
  if (typeof detalle === 'string' && detalle.trim()) return detalle;
  // Caso 3: 422 de Pydantic -> [{ msg, loc, ... }].
  if (Array.isArray(detalle)) {
    const partes = detalle
      .map(item => {
        if (item && typeof item === 'object' && (item as { msg?: unknown }).msg) {
          return String((item as { msg: unknown }).msg);
        }
        return item ? String(item) : '';
      })
      .filter(Boolean);
    if (partes.length) return partes.join(' ');
  }
  // Sin mensaje reconocible.
  return null;
}
