import { useMemo } from 'react';
import { resumen, calibracion } from '../../motor/registro.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * ¿Te está funcionando la app? Es la única prueba que significa algo, y por
 * eso hay que enseñarla con cuidado. Tres reglas, ninguna negociable:
 *
 *  1. El margen va SIEMPRE al lado del número. Un 73% en once partidas es
 *     exactamente lo que parecería una racha normal.
 *  2. No se afirma nada hasta que la diferencia no cabe en ese margen.
 *  3. Se dice la trampa: tú eliges cuándo hacer caso, así que esto no está
 *     aleatorizado.
 *
 * Si algún día se enseña fuera de la app, se enseña entero: el número sin el
 * margen es publicidad.
 */
export function Veredicto({ partidas, maestria, t = tPorDefecto }) {
  const r = useMemo(() => resumen(partidas, maestria), [partidas, maestria]);
  const pct = (n) => (n * 100).toFixed(1);
  const c = r.contraReferencia;
  return (
    <section className="veredicto">
      <p className="build-nucleo">{t('veredicto.titulo')}</p>
      {r.wrSiguiendo == null || r.siguiendo < 5 ? (
        <p className="frase duda">{t('veredicto.pocas', { n: r.siguiendo })}</p>
      ) : !r.referencia ? (
        <p className="frase duda">{t('veredicto.sinReferencia')}</p>
      ) : (
        <>
          <p className="veredicto-cifra">{t('veredicto.conApp', { pct: pct(r.wrSiguiendo), n: r.siguiendo })}</p>
          <p className="veredicto-cifra">{t('veredicto.tuyo', { pct: pct(r.referencia.winRate), n: r.referencia.partidas })}</p>
          {c && (
            <>
              <p className="veredicto-dif">
                {t('veredicto.dif', { signo: c.dif >= 0 ? '+' : '−', dif: Math.abs(c.dif * 100).toFixed(1), margen: (c.margen * 100).toFixed(1) })}
              </p>
              <p className={`frase ${c.seVe ? (c.dif > 0 ? 'bien' : 'ojo') : 'duda'}`}>
                {c.seVe
                  ? t(c.dif > 0 ? 'veredicto.mejor' : 'veredicto.peor')
                  : (c.faltan == null ? t('veredicto.noSeVeSinCifra') : t('veredicto.noSeVe', { faltan: c.faltan }))}
              </p>
            </>
          )}
        </>
      )}
      <Calibracion partidas={partidas} t={t} />
      <p className="build-nota">{t('veredicto.trampa')}</p>
    </section>
  );
}

/** ¿La probabilidad estimada se parece a lo que pasa? Solo con partidas que llevaran estimación delante. */
export function Calibracion({ partidas, t = tPorDefecto }) {
  const c = useMemo(() => calibracion(partidas), [partidas]);
  if (!c.n) return null;
  const pct = (v) => (v == null ? '—' : Math.round(v * 100));
  return (
    <div className="calibracion">
      <p className="veredicto-cifra">{t('estimacion.calibrada', { n: c.n, prev: pct(c.prevista), real: pct(c.real) })}</p>
      {c.concluyente ? (
        <p className={`frase ${c.peorQueMoneda ? 'ojo' : 'bien'}`}>
          {t('estimacion.brier', { brier: c.brier.toFixed(3), altas: pct(c.altas.real), nAltas: c.altas.n, bajas: pct(c.bajas.real), nBajas: c.bajas.n })}
        </p>
      ) : (
        <p className="frase duda">{t('estimacion.faltanCalibrar', { n: c.faltan })}</p>
      )}
    </div>
  );
}
