import { tPorDefecto } from './tPorDefecto.js';

/**
 * A quién banear por tu equipo, con el motivo cuando lo hay.
 * @param items  [{ heroe, stat, puntos, motivos }] (motor/baneos.js)
 * @param rango  el rango del que salen los winrates y las tasas de ban
 *               (`meta.fuerza.rango`), que tras un reinicio de temporada no
 *               es el tuyo: decir «en tu rango» con números de Mítico mentía.
 * @param plan   tu plan A·B·C (nombres, en orden). El baneo sugerido mide lo
 *               que te quita ese héroe EN EL OTRO EQUIPO, y a menudo es tu
 *               propio plan (Rafaela era a la vez tu plan B y el primer
 *               baneo sugerido): banearlo es quitártelo también a ti, y la
 *               fila lo dice para que no se banee sin querer.
 */
export function BaneosSugeridos({ items, onBanear, rango = '', plan = [], t = tPorDefecto }) {
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
          <button onClick={() => onBanear(b.heroe)} aria-label={t('app.marcarBaneo', { nombre: b.heroe.name })}>{t('ban.banear')}</button>
        </div>
      ))}
    </section>
  );
}
