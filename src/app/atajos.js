/**
 * Las teclas del ordenador (3.87.0, «haz también el modo PC para toda la
 * app»). Con teclado, meter el draft es más rápido tecleando que con el
 * ratón: E abre el selector de enemigos, A el de tu equipo y B el de
 * baneos; dentro, escribir busca, Intro elige y Escape cierra (eso ya
 * estaba). Solo sin hoja abierta y fuera de un campo de texto: escribir
 * «Atlas» en un buscador no puede abrir nada.
 *
 * Puro: recibe lo que importa de la tecla y del estado, devuelve qué abrir.
 */
export const ATAJOS = { e: 'enemigos', a: 'aliados', b: 'baneos' };

/** Qué hoja abre una tecla, o null. `enCampo`: el foco está en algo donde se escribe. */
export function atajoDe({ key, ctrlKey, metaKey, altKey, repeat, enCampo }, { hoja, fase }) {
  if (hoja || enCampo || ctrlKey || metaKey || altKey || repeat || typeof key !== 'string') return null;
  const destino = ATAJOS[key.toLowerCase()] ?? null;
  // En la fase de baneos no se ven los equipos: solo B.
  if (fase === 'baneos' && destino !== 'baneos') return null;
  return destino;
}

/** ¿El foco está donde se escribe? (un campo, un área de texto, un desplegable o algo editable). */
export const escribiendoEn = (el) => !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
