/**
 * Lo que sale de la app cuando un «Deshacer» todavía puede echarlo atrás
 * (3.42.0): las pantallas del final que se suben al proyecto y lo que se le
 * enseña al lector (la tabla de resultado). Antes salía en el acto: con
 * «Nuevo draft» + «Deshacer» las pantallas de esa partida ya se habían
 * subido sin resultado, y al deshacer una partida apuntada sola el lector
 * ya había aprendido «ganada» o «perdida» de una tabla que quizá no lo era.
 *
 * Ahora espera a que pase el plazo del «Deshacer». Va con la CLAVE del draft
 * (`completoDesde`): si ese draft vuelve (lo devolvió un «Deshacer»), se
 * cancela y lo guardado vuelve a quien lo tenía. Si llega otra cosa que
 * esperar, lo de antes sale ya: no se pierde nada por encadenar dos.
 */
export function crearDiferido({ esperar = (f, ms) => setTimeout(f, ms), soltar = (r) => clearTimeout(r) } = {}) {
  let pendiente = null;
  const ejecutar = () => {
    const p = pendiente;
    if (!p) return false;
    pendiente = null;
    soltar(p.reloj);
    p.accion(p.datos);
    return true;
  };
  return {
    /** Espera `ms` y entonces hace `accion(datos)`, salvo que antes se cancele `clave`. */
    programar(clave, datos, ms, accion) {
      ejecutar();
      const p = { clave, datos, accion };
      p.reloj = esperar(() => { if (pendiente === p) { pendiente = null; accion(datos); } }, ms);
      pendiente = p;
    },
    /** Lo pendiente de `clave` no sale; devuelve sus datos (o null si no había nada de esa clave). */
    cancelar(clave) {
      const p = pendiente;
      if (!p || clave == null || p.clave !== clave) return null;
      pendiente = null;
      soltar(p.reloj);
      return p.datos;
    },
    /** Lo pendiente sale ya (la app se va, o llega otra cosa). */
    ejecutar,
    get pendiente() { return pendiente ? pendiente.clave : null; },
  };
}
