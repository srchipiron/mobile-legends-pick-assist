import { tic } from '../tacto.js';
import { useT } from '../i18n/contexto.js';

/**
 * A quién banear por tu equipo (motor/baneos.js), con su motivo.
 * @param rango  el rango del que salen las tasas (`meta.fuerza.rango`): tras un reinicio de temporada no es el tuyo.
 * @param plan   tu plan A·B·C: banear uno de ellos es quitártelo también a ti, y la fila lo dice.
 */
export function BaneosSugeridos({ items, onBanear, rango = '', plan = [] }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <section className="bans-suggested">
      <div className="side-label"><span>{t('ban.mereceLaPena')}</span></div>
      {items.map((b) => (
        <div className="ban-row" key={b.heroe.name}>
          <span>
            {b.heroe.name}
            {plan.includes(b.heroe.name) && (
              <span className="ban-plan" title={t('ban.tuPlanPista')}>{t('ban.tuPlan', { letra: String.fromCharCode(65 + plan.indexOf(b.heroe.name)) })}</span>
            )}
            {b.motivos[0] && <span className="inferred">{t(b.motivos[0].clave, { rango, ...b.motivos[0].params })}</span>}
          </span>
          <span className="rate">
            {b.puntos > 0 ? t('ban.quita', { n: b.puntos }) : ''}
            {b.puntos > 0 && b.stat.banRate != null ? ' · ' : ''}
            {b.stat.banRate != null ? t('ban.tasa', { pct: Math.round(b.stat.banRate * 100) }) : ''}
          </span>
          <button onClick={() => { tic(); onBanear(b.heroe); }} aria-label={t('app.marcarBaneo', { nombre: b.heroe.name })}>{t('ban.banear')}</button>
        </div>
      ))}
    </section>
  );
}
