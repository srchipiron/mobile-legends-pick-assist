import { tPorDefecto } from './tPorDefecto.js';

/** Los términos del modelo (motor/modelo.js), con su color. */
export const COLORES_TERMINO = {
  heroes: 'var(--c-meta)',
  cruces: 'var(--c-counter)',
  parejas: 'var(--c-synergy)',
  porVer: 'var(--c-comp)',
  tu: 'var(--c-mastery)',
};

export const signo = (v) => (v > 0 ? `+${v}` : `${v}`);

/**
 * El desglose de una nota en puntos de probabilidad por término. Los que
 * valen cero no se pintan (tú sin maestría, por ver con el draft cerrado).
 */
export function Desglose({ puntos, t = tPorDefecto, className = 'desglose' }) {
  if (!puntos) return null;
  const partes = Object.keys(COLORES_TERMINO).filter((k) => puntos[k] != null && (puntos[k] !== 0 || k === 'heroes' || k === 'cruces'));
  return (
    <div className={className}>
      {partes.map((k) => (
        <span key={k} style={{ color: COLORES_TERMINO[k] }} title={t(`termino.${k}Largo`)}>
          {t(`termino.${k}`)} <b>{signo(puntos[k])}</b>
        </span>
      ))}
    </div>
  );
}

/** La leyenda de colores y qué es la probabilidad. Lo que antes vivía en un `title`, que en táctil no existe. */
export function Leyenda({ t = tPorDefecto }) {
  return (
    <div className="legend">
      <span className="legend-nota">{t('leyenda.prob')}</span>
      {Object.keys(COLORES_TERMINO).map((k) => (
        <span key={k}><i style={{ background: COLORES_TERMINO[k] }} />{t(`termino.${k}Largo`)}</span>
      ))}
      <span className="legend-nota">{t('leyenda.pro')}</span>
    </div>
  );
}
