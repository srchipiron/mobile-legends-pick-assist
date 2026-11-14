import { useMemo } from 'react';
import { resumen, calibracion } from '../../motor/registro.js';
import { puntos } from './TusNumeros.jsx';
import { useT } from '../i18n/contexto.js';

const pct1 = (n) => (n * 100).toFixed(1);

/**
 * ¿Te funciona la app? La única prueba que significa algo, con tres reglas
 * [D]: el margen SIEMPRE al lado del número (un 73% en once partidas es una
 * racha normal), no se afirma nada mientras la diferencia quepa en él, y se
 * dice la trampa (tú eliges cuándo hacer caso: no está aleatorizado).
 */
export function Veredicto({ partidas, maestria }) {
  const t = useT();
  const r = useMemo(() => resumen(partidas, maestria), [partidas, maestria]);
  const c = r.contraReferencia;
  const e = r.entreRamas;
  return (
    <section className="veredicto">
      <p className="build-nucleo">{t('veredicto.titulo')}</p>
      {r.dudosas > 0 && <p className="frase ojo">{t('veredicto.dudosas', { n: r.dudosas })}</p>}
      {r.wrSiguiendo == null || r.siguiendo < 5 ? (
        <p className="frase duda">{t('veredicto.pocas', { n: r.siguiendo })}</p>
      ) : !r.referencia ? (
        <p className="frase duda">{t('veredicto.sinReferencia')}</p>
      ) : (
        <>
          <p className="veredicto-cifra">{t('veredicto.conApp', { pct: pct1(r.wrSiguiendo), n: r.siguiendo })}</p>
          <p className="veredicto-cifra">{t('veredicto.tuyo', { pct: pct1(r.referencia.winRate), n: r.referencia.partidas })}</p>
          {c && (
            <>
              <p className="veredicto-dif">{t('veredicto.dif', puntos(c))}</p>
              <p className={`frase ${c.seVe ? (c.dif > 0 ? 'bien' : 'ojo') : 'duda'}`}>
                {c.seVe ? t(c.dif > 0 ? 'veredicto.mejor' : 'veredicto.peor') : (c.faltan == null ? t('veredicto.noSeVeSinCifra') : t('veredicto.noSeVe', { faltan: c.faltan }))}
              </p>
            </>
          )}
        </>
      )}
      {/* Siguiendo contra por libre: solo con 30 y 30, con las mismas tres reglas. */}
      {e && (
        <>
          <p className="veredicto-dif">{t('veredicto.ramas', { a: pct1(r.wrSiguiendo), na: r.siguiendo, b: pct1(r.wrPorLibre), nb: r.porLibre, ...puntos(e) })}</p>
          <p className={`frase ${e.seVe ? (e.dif > 0 ? 'bien' : 'ojo') : 'duda'}`}>
            {e.seVe ? t(e.dif > 0 ? 'veredicto.ramasMejor' : 'veredicto.ramasPeor') : t('veredicto.ramasNoSeVe')}
          </p>
        </>
      )}
      <Calibracion partidas={partidas} />
      <p className="build-nota">{t('veredicto.trampa')}</p>
    </section>
  );
}

/** ¿La probabilidad estimada se parece a lo que pasa? Con las partidas que llevaban estimación; la del modelo de hoy, aparte. */
export function Calibracion({ partidas }) {
  const t = useT();
  const c = useMemo(() => calibracion(partidas), [partidas]);
  if (!c.n) return null;
  const p = (v) => (v == null ? '—' : Math.round(v * 100));
  const hoy = c.porModelo?.[c.actual];
  return (
    <div className="calibracion">
      <p className="veredicto-cifra">{t('estimacion.calibrada', { n: c.n, prev: p(c.prevista), real: p(c.real) })}</p>
      {hoy && hoy.n < c.n && <p className="frase duda">{t('estimacion.modeloDeHoy', { n: hoy.n, prev: p(hoy.prevista), real: p(hoy.real) })}</p>}
      {c.concluyente ? (
        <p className={`frase ${c.peorQueMoneda ? 'ojo' : 'bien'}`}>
          {t('estimacion.brier', { brier: c.brier.toFixed(3), altas: p(c.altas.real), nAltas: c.altas.n, bajas: p(c.bajas.real), nBajas: c.bajas.n })}
        </p>
      ) : <p className="frase duda">{t('estimacion.faltanCalibrar', { n: c.faltan })}</p>}
    </div>
  );
}
