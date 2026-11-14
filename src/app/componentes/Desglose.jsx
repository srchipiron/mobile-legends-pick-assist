import { useT } from '../i18n/contexto.js';

/** Los términos del modelo (motor/modelo.js), con su color. */
export const COLORES_TERMINO = {
  heroes: 'var(--c-meta)',
  cruces: 'var(--c-counter)',
  parejas: 'var(--c-synergy)',
  equilibrio: 'var(--c-balance)',
  porVer: 'var(--c-comp)',
};

export const signo = (v) => (v > 0 ? `+${v}` : `${v}`);

/** La nota en puntos de probabilidad por término: héroes y cruces siempre, el resto si no vale cero. */
export function Desglose({ puntos, className = 'desglose' }) {
  const t = useT();
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

/** La leyenda de colores y qué es la probabilidad (un `title` no existe en táctil). */
export function Leyenda() {
  const t = useT();
  return (
    <div className="legend">
      <span className="legend-nota">{t('leyenda.prob')}</span>
      {Object.keys(COLORES_TERMINO).map((k) => <span key={k}><i style={{ background: COLORES_TERMINO[k] }} />{t(`termino.${k}Largo`)}</span>)}
      <span className="legend-nota">{t('leyenda.pro')}</span>
      <span className="legend-nota">{t('leyenda.modelo')}</span>
    </div>
  );
}
