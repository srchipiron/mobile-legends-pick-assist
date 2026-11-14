import { useMemo, useState } from 'react';
import { paraComprobar, precisionDeLaTablet } from '../../motor/comprobacion.js';
import { RejillaDeHeroes } from './RejillaDeHeroes.jsx';
import { useT } from '../i18n/contexto.js';

/**
 * Comprobar la tablet: hasta tres partidas suyas al azar cada semana, con la
 * pantalla del final que leyó si llegó su comprobante, y cuánto acierta en
 * lo comprobado. Un fallo de lectura se ve en días, no en semanas.
 */
export function ComprobarTablet({ personal, comprobantes = new Map(), pool = [] }) {
  const t = useT();
  const { partidas, comprobadas, comprobarPartida, corregirPartida, cambiarHeroePartida } = personal;
  const pendientes = useMemo(() => paraComprobar(partidas, comprobadas, { ahora: Date.now() }), [partidas, comprobadas]);
  const precision = useMemo(() => precisionDeLaTablet(comprobadas), [comprobadas]);
  const [eligiendo, setEligiendo] = useState(null);
  if (!pendientes.length && !precision.n) return null;
  const pct = (x) => Math.round(x * 100);
  const fecha = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <section className="comprobar">
      <p className="build-nucleo">{t('comprobar.titulo')}</p>
      {pendientes.length > 0 && <p className="nota">{t('comprobar.pista', { n: pendientes.length })}</p>}
      {pendientes.map((p) => {
        const c = comprobantes.get(p.t);
        return (
          <div key={p.t} className="comprobar-partida">
            <p className="comprobar-que">{fecha(p.t)} · <strong>{p.pick}</strong> · {p.gane ? t('hist.gane') : t('hist.perdi')}</p>
            {c && <img className="partida-comprobante" src={`data:image/png;base64,${c.tira}`} alt={t('comprobar.pantalla')} />}
            <div className="resultado">
              <button type="button" className="reset partida-bien" onClick={() => comprobarPartida(p.t, true)}>{t('comprobar.bien')}</button>
              <button type="button" className="reset partida-mal" onClick={() => { corregirPartida(p.t, !p.gane); comprobarPartida(p.t, false, 'resultado'); }}>{t('comprobar.resultadoMal')}</button>
              <button type="button" className="reset" aria-expanded={eligiendo === p.t} onClick={() => setEligiendo((e) => (e === p.t ? null : p.t))}>{t('comprobar.heroeMal')}</button>
            </div>
            {eligiendo === p.t && (
              <div className="partida-cambiar">
                <strong>{t('comprobar.elegirHeroe')}</strong>
                <RejillaDeHeroes
                  className="corto" heroes={pool.filter((h) => h.name !== p.pick)}
                  onElegir={(h) => { cambiarHeroePartida(p.t, h.name); comprobarPartida(p.t, false, 'heroe'); setEligiendo(null); }}
                />
              </div>
            )}
          </div>
        );
      })}
      {precision.n > 0 && (
        <p className={`frase ${precision.mal ? 'ojo' : 'bien'}`}>
          {precision.mal
            ? t('comprobar.precisionMal', { bien: precision.bien, n: precision.n, resultado: precision.resultado, heroe: precision.heroe })
            : t('comprobar.precision', { bien: precision.bien, n: precision.n, bajo: pct(precision.bajo), alto: pct(precision.alto) })}
        </p>
      )}
    </section>
  );
}
