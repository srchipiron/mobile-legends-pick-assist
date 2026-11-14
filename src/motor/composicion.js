import { perfilDeDano, tipoDeDano } from './catalogo.js';
import { TEAM_NEEDS, cubre } from './reglas.js';

/**
 * Qué tiene y qué le falta a un equipo. Dos cosas que no valen lo mismo: lo
 * MEDIDO en las parejas (dos del mismo rol rinden peor, con su cifra) y los huecos
 * por etiqueta (`TEAM_NEEDS`, regla escrita a mano), que se dicen y NO puntúan
 * ([M] un hueco vale 0,00 ± 0,07 en 902 partidas pro).
 */

/** [M] Sinergia neta media de dos del mismo rol, en puntos (8.778 pares). */
export const ROL_DOBLE_PP = { mage: -4.0, assassin: -2.6, tank: -1.95, marksman: -1.26 };
/** [P] Los huecos que merece la pena decir en voz alta. */
export const HUECOS_QUE_SE_DICEN = ['tanky', 'cc_hard', 'engage'];

/** @returns {{ n, dano, roles, cubiertos, huecos, dobles }} */
export function composicionDe(equipo = []) {
  const roles = {};
  for (const h of equipo) if (h.role) roles[h.role] = (roles[h.role] ?? 0) + 1;
  const cubiertos = Object.fromEntries(TEAM_NEEDS.map((n) => [n.tag, equipo.some((h) => cubre(h, n.tag))]));
  return {
    n: equipo.length,
    dano: perfilDeDano(equipo),
    roles,
    cubiertos,
    huecos: TEAM_NEEDS.filter((n) => !cubiertos[n.tag]).map((n) => n.tag),
    dobles: Object.entries(roles).filter(([rol, n]) => n >= 2 && ROL_DOBLE_PP[rol] != null).map(([rol, n]) => ({ rol, n, pp: ROL_DOBLE_PP[rol] })),
  };
}

/**
 * Tu equipo con tu candidato, sin él, y el suyo. `tapa`: huecos de tus cuatro que
 * tu candidato cierra; `tapaDano`: les falta un daño y tú eres de ese o mixto.
 */
export function analizarComposicion({ aliados = [], yo = null, enemigos = [] } = {}) {
  const sinMi = composicionDe(aliados);
  const mio = composicionDe(yo ? [...aliados.filter((h) => h.name !== yo.name), yo] : aliados);
  return {
    mio,
    suyo: composicionDe(enemigos),
    sinMi,
    tapa: yo ? sinMi.huecos.filter((tag) => cubre(yo, tag)) : [],
    tapaDano: !!(yo && sinMi.dano.falta && ['mixto', sinMi.dano.falta].includes(tipoDeDano(yo))),
  };
}
