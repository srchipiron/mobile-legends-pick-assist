import { useMemo } from 'react';
import { tusNumeros } from '../../motor/habitos.js';
import { tPorDefecto } from './tPorDefecto.js';

const pct = (v) => Math.round(v * 100);
const puntos = (c) => ({ signo: c.dif >= 0 ? '+' : '−', dif: Math.abs(c.dif * 100).toFixed(1), margen: (c.margen * 100).toFixed(1) });

/**
 * «Tus números» (3.48.0): racha, sesión de hoy, después de perder, por hora,
 * por duración y por héroe. Las mismas reglas que el Veredicto: el margen al
 * lado del número y nada afirmado mientras quepa en él.
 */
export function TusNumeros({ partidas, t = tPorDefecto, ahora }) {
  const r = useMemo(() => tusNumeros(partidas, ahora ? { ahora } : {}), [partidas, ahora]);
  if (!r.n) return null;
  return (
    <section className="veredicto tus-numeros" aria-label={t('numeros.titulo')}>
      <p className="build-nucleo">{t('numeros.titulo')}</p>
      <p className="veredicto-cifra">
        {t(r.racha.gane ? 'numeros.rachaGana' : 'numeros.rachaPierde', { n: r.racha.n })}
        {r.sesion && <> · {t('numeros.sesion', { n: r.sesion.n, g: r.sesion.ganadas, p: r.sesion.n - r.sesion.ganadas })}</>}
      </p>

      {r.trasPerder ? (
        <>
          <p className="veredicto-cifra">{t('numeros.trasPerder', { a: pct(r.trasPerder.wr), na: r.trasPerder.n, b: pct(r.trasPerder.wrResto), nb: r.trasPerder.nResto, ...puntos(r.trasPerder) })}</p>
          <p className={`frase ${r.trasPerder.seVe ? (r.trasPerder.dif < 0 ? 'ojo' : 'bien') : 'duda'}`}>
            {t(r.trasPerder.seVe ? (r.trasPerder.dif < 0 ? 'numeros.trasPerderPeor' : 'numeros.trasPerderMejor') : 'numeros.trasPerderNoSeVe')}
          </p>
        </>
      ) : (
        <p className="frase duda">{t('numeros.trasPerderPocas')}</p>
      )}

      <Grupos grupos={r.franjas} prefijo="numeros.franja" t={t} />
      <Grupos grupos={r.duraciones} prefijo="numeros.duracion" t={t} />

      {r.heroes.length > 0 && (
        <>
          {r.heroes.map((h) => (
            <p key={h.heroe} className={`veredicto-cifra numeros-heroe ${h.lado ?? ''}`}>
              {t('numeros.heroe', { hero: h.heroe, pct: pct(h.wr), n: h.n, bajo: pct(h.bajo), alto: pct(h.alto) })}
              {h.lado && <> · {t(`numeros.heroe.${h.lado}`)}</>}
            </p>
          ))}
          <p className="build-nota">{t('numeros.heroesNota', { media: pct(r.wr) })}</p>
        </>
      )}
    </section>
  );
}

/** Cada grupo contra el resto, y una sola frase: el que se distingue o «ninguno». */
function Grupos({ grupos, prefijo, t }) {
  if (!grupos.length) return null;
  const visto = grupos.find((g) => g.seVe);
  return (
    <>
      {grupos.map((g) => (
        <p key={g.id} className="veredicto-cifra">
          {t('numeros.grupo', { grupo: t(`${prefijo}.${g.id}`), a: pct(g.wr), na: g.n, b: pct(g.wrResto), ...puntos(g) })}
        </p>
      ))}
      <p className={`frase ${visto ? (visto.dif > 0 ? 'bien' : 'ojo') : 'duda'}`}>
        {visto
          ? t(visto.dif > 0 ? `${prefijo}.mejor` : `${prefijo}.peor`, { grupo: t(`${prefijo}.${visto.id}`) })
          : t(`${prefijo}.noSeVe`)}
      </p>
    </>
  );
}
