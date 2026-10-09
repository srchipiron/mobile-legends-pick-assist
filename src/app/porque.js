import { tPorDefecto } from './componentes/tPorDefecto.js';

const decimal = (v) => v.toFixed(1);

/**
 * La línea de «por qué no es el nº1» de una tarjeta (3.51.0), a partir de
 * `porQueDetras` (motor/ranking.js): «1.2 puntos por detrás de Rafaela: más
 * flojo en general (−1.5), aunque mejores cruces (+0.6)». Puro, para poder
 * probarla sin navegador.
 */
export function fraseDetras(d, primero, t = tPorDefecto) {
  if (!d || !primero) return null;
  if (d.empate) return t('porque.empate', { hero: primero });
  if (!d.principal) return t('porque.detrasSolo', { dif: decimal(d.dif), hero: primero });
  const razon = t(`porque.contra.${d.principal.termino}`, { p: decimal(d.principal.puntos) });
  const aunque = d.aFavor ? t('porque.aunque', { razon: t(`porque.favor.${d.aFavor.termino}`, { p: decimal(d.aFavor.puntos) }) }) : '';
  return t('porque.detras', { dif: decimal(d.dif), hero: primero, razon, aunque });
}
