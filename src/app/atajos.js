/**
 * Las teclas del ordenador: E abre el selector de enemigos, A el de tu
 * equipo y B el de baneos. Nunca escribiendo en un campo, con una hoja
 * abierta, con Ctrl/Cmd/Alt ni con la tecla mantenida. Pura: recibe la tecla
 * y el estado, devuelve qué abrir.
 */
export const ATAJOS = { e: 'enemigos', a: 'aliados', b: 'baneos' };

/** Qué hoja abre una tecla, o null. `enCampo`: el foco está donde se escribe. */
export function atajoDe({ key, ctrlKey, metaKey, altKey, repeat, enCampo }, { hoja, fase }) {
  if (hoja || enCampo || ctrlKey || metaKey || altKey || repeat || typeof key !== 'string') return null;
  const destino = ATAJOS[key.toLowerCase()] ?? null;
  // En la fase de baneos no se ven los equipos: solo B.
  if (fase === 'baneos' && destino !== 'baneos') return null;
  return destino;
}

/** ¿El foco está donde se escribe? (un campo, un área de texto, un desplegable o algo editable). */
export const escribiendoEn = (el) => !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
