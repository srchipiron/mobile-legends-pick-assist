import { idMotivo } from '../../motor/nombres.js';
import { Cara } from './Imagen.jsx';
import { Desglose } from './Desglose.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * La identidad de un motivo, para las `key` de React: la MISMA que usa el
 * motor para filtrar los comunes y quitar repetidos (`idMotivo`). Estuvo
 * escrita dos veces; si una se cambia y la otra no, las claves de la lista y
 * el dedupe dejan de hablar de lo mismo.
 */
export { idMotivo };

/**
 * Tarjeta de recomendación: la probabilidad de ganar el draft con ese pick
 * y de dónde sale, en puntos, término a término.
 */
export function Tarjeta({ candidato, indice, stat, pro = null, tier = null, onBuild, t = tPorDefecto }) {
  const pct = Math.round(candidato.p * 100);
  const heroe = candidato.heroe;
  return (
    <article className={`pick ${indice === 0 ? 'top' : ''}`}>
      <div className="rank">{indice + 1}</div>
      <div>
        <h3 className="pick-name">
          <Cara heroe={heroe} className="hero-cara" tam={34} />
          {heroe.name}
          {/* Un héroe que no está en el catálogo escrito a mano juega con los
              tags genéricos de su rol. Se recomienda igual, pero conviene saberlo. */}
          {heroe.inferred && <span className="inferred" title={t('app.tagsDeRolTitulo')}>{t('app.tagsDeRol')}</span>}
        </h3>
        <Desglose puntos={candidato.puntos} t={t} />
        <ul className="reasons">
          {candidato.motivos.length ? candidato.motivos.map((m) => (
            <li
              key={idMotivo(m)}
              /* Un motivo de EQUIPO («no hay primera línea») le vale igual a
                 media lista: se apaga para que no compita con los que sí
                 hablan de ESTE héroe contra ESTE draft. */
              className={`${m.bueno ? '' : 'bad'} ${m.clave.startsWith('necesidad.') ? 'de-equipo' : ''}`.trim()}
            >
              {t(m.clave, m.params)}
            </li>
          )) : <li>{t('app.pickSolido')}</li>}
        </ul>
      </div>
      <div>
        <div className="pick-score" title={t('pick.probTitulo')} aria-label={t('pick.probTitulo')}>{pct}%</div>
        <span className="pick-wr">{stat?.winRate != null ? t('pick.wr', { pct: (stat.winRate * 100).toFixed(1) }) : t('app.sinDatos')}</span>
        {/* La tier de mlbb.gg: OPINIÓN, al lado del dato y sin puntuar. Medido
            que no añade nada al winrate (scripts/ingesta/tiers.mjs). */}
        {tier && <span className={`pick-tier tier-${tier}`} title={t('pick.tierTitulo')}>{t('pick.tier', { tier })}</span>}
        {/* Lo que hacen los profesionales con él (Liquipedia): DATO, no
            opinión. El porcentaje solo con muestra: «0% en 1 pick» no dice nada. */}
        {pro && pro.picks + pro.bans >= 3 && (
          <span className="pick-pro" title={t('pro.titulo')}>
            {pro.picks >= 5
              ? t('pro.linea', { picks: pro.picks, pct: Math.round((pro.ganadas / pro.picks) * 100), bans: pro.bans })
              : t('pro.lineaSinPct', { picks: pro.picks, bans: pro.bans })}
          </span>
        )}
        {/* Los objetos son lo siguiente que necesitas DESPUÉS de elegir: detrás de un toque. */}
        {onBuild && <button className="pick-build" onClick={() => onBuild(heroe)}>{t('build.titulo')}</button>}
      </div>
    </article>
  );
}
