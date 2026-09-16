import { tPorDefecto } from './tPorDefecto.js';

/**
 * A quién banear por tu equipo, con el motivo cuando lo hay.
 * @param items  [{ heroe, stat, puntos, motivos }] (motor/baneos.js)
 */
export function BaneosSugeridos({ items, onBanear, t = tPorDefecto }) {
  if (!items.length) return null;
  return (
    <section className="bans-suggested">
      <div className="side-label"><span>{t('ban.mereceLaPena')}</span></div>
      {items.map((b) => (
        <div className="ban-row" key={b.heroe.name}>
          <span>
            {b.heroe.name}
            {b.motivos[0] && <span className="inferred">{t(b.motivos[0].clave, b.motivos[0].params)}</span>}
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
