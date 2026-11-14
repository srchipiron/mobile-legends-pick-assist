import { tic } from '../tacto.js';
import { idMotivo } from '../../motor/nombres.js';
import { Cara, rutaDeImagen } from './Imagen.jsx';
import { Desglose } from './Desglose.jsx';
import { fraseDetras } from '../porque.js';
import { useT } from '../i18n/contexto.js';

/** «11/11» de «2026-11-11», sin pasar por el reloj ni la zona del móvil. */
export const diaYMes = (fecha) => `${Number(fecha.slice(8, 10))}/${Number(fecha.slice(5, 7))}`;

/**
 * La cara como fondo del aura, con la ruta ABSOLUTA: un `url()` relativo
 * dentro de una variable CSS se resuelve contra la hoja de estilos
 * (`assets/…`), no contra la página, y daba 404 sin ningún error.
 */
export function aura(heroe, base = typeof document === 'undefined' ? null : document.baseURI) {
  if (heroe?.id == null || !base) return undefined;
  return { '--cara': `url("${new URL(rutaDeImagen('heroes', heroe.id, '.jpg'), base).href}")` };
}

/**
 * Una recomendación: la probabilidad de ganar el draft con ese pick, de dónde
 * sale (en puntos, término a término) y lo que se enseña sin puntuar (winrate
 * en la línea, tier, parche, pro). El nombre es el botón de «Lo cojo»: no
 * añade alto a la tarjeta (cada bloque nuevo empujó la nº1 fuera de pantalla).
 */
export function Tarjeta({ candidato, indice, stat, pro = null, tier = null, wrLinea = null, linea = null, parche = null, onBuild, elegido = false, onElegir = null, detras = null, primero = null }) {
  const t = useT();
  const heroe = candidato.heroe;
  const pareja = candidato.mejorPareja ?? null;
  // El «combina bien con X» de los motivos lo dice ya la línea de la pareja.
  const motivos = pareja ? candidato.motivos.filter((m) => !(m.clave === 'regla.combinaCon' && m.params?.a === pareja.con)) : candidato.motivos;
  const nombre = (
    <>
      <Cara heroe={heroe} className="hero-cara" tam={34} />
      {heroe.name}
      {heroe.inferred && <span className="inferred" title={t('app.tagsDeRolTitulo')}>{t('app.tagsDeRol')}</span>}
      {elegido && <span className="pick-tuyo">{t('pick.tuyo')}</span>}
    </>
  );
  return (
    <article className={`pick ${indice === 0 ? 'top' : ''} ${elegido ? 'elegido' : ''}`.trim()} data-heroe={heroe.name} style={aura(heroe)}>
      <div className={`rank ${indice < 3 ? `rank-${indice + 1}` : ''}`.trim()}>{indice + 1}</div>
      <div>
        <h3 className="pick-name">
          {onElegir ? (
            <button className="pick-nombre-boton" aria-pressed={elegido} title={t(elegido ? 'pick.soltar' : 'pick.loCojo', { nombre: heroe.name })} onClick={() => { tic(); onElegir(heroe); }}>{nombre}</button>
          ) : nombre}
        </h3>
        <Desglose puntos={candidato.puntos} />
        {pareja && (
          <p className={`pick-pareja ${pareja.puntos < 0 ? 'mala' : ''}`.trim()} title={t('pick.parejaTitulo')}>
            {t('pick.pareja', { nombre: pareja.con, signo: pareja.puntos >= 0 ? '+' : '−', pp: Math.abs(pareja.puntos).toFixed(1) })}
          </p>
        )}
      </div>
      <div>
        <div className="pick-score" title={t('pick.probTitulo')} aria-label={t('pick.probTitulo')}>{Math.round(candidato.p * 100)}%</div>
        <span className="pick-wr">{stat?.winRate != null ? t('pick.wr', { pct: (stat.winRate * 100).toFixed(1) }) : t('app.sinDatos')}</span>
        {wrLinea != null && linea && (
          <span className="pick-wrlinea" title={t('pick.wrLineaTitulo', { linea: t(`linea.${linea}`) })}>{t('pick.wrLinea', { linea: t(`linea.${linea}`), pct: (wrLinea * 100).toFixed(1) })}</span>
        )}
        {tier && <span className={`pick-tier tier-${tier}`} title={t('pick.tierTitulo')}>{t('pick.tier', { tier })}</span>}
        {parche && (
          <span className="pick-parche" title={t('pick.parcheTitulo', { fecha: diaYMes(parche.fecha), quedan: parche.quedan })}>
            {parche.dias ? t('pick.parche', { dias: parche.dias }) : t('pick.parcheHoy')}
          </span>
        )}
        {/* [D] Liquipedia: con ≥3 picks+bans; el porcentaje solo con ≥5 picks («0% en 1 pick» no dice nada). */}
        {pro && pro.picks + pro.bans >= 3 && (
          <span className="pick-pro" title={`${t('pro.titulo')} · ${t('pro.detalle', { picks: pro.picks, bans: pro.bans })}`}>
            {pro.picks >= 5
              ? t('pro.linea', { picks: pro.picks, pct: Math.round((pro.ganadas / pro.picks) * 100), bans: pro.bans })
              : t('pro.lineaSinPct', { picks: pro.picks, bans: pro.bans })}
          </span>
        )}
      </div>
      {/* A todo lo ancho: en la columna del nombre cada motivo ocupaba dos líneas. */}
      <div className="pick-abajo">
        {detras && primero && <p className="pick-detras">{fraseDetras(detras, primero, t)}</p>}
        <ul className="reasons">
          {motivos.length
            ? motivos.map((m) => <li key={idMotivo(m)} className={m.bueno ? '' : 'bad'}>{t(m.clave, m.params)}</li>)
            : <li>{t('app.pickSolido')}</li>}
        </ul>
        {onBuild && <button className="pick-build" onClick={() => onBuild(heroe)}>{t('partida.boton')}</button>}
      </div>
    </article>
  );
}
