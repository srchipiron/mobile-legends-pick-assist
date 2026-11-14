import { useMemo } from 'react';
import { tusNumeros, tuSemana } from '../../motor/habitos.js';
import { useT } from '../i18n/contexto.js';

/**
 * Tus números y tu semana, con las reglas del Veredicto: el margen al lado
 * del número y nada afirmado mientras quepa en él. Los usan «Tus partidas»
 * y el Análisis (`Grupos` es el mismo en los dos).
 */
export const pct = (v) => Math.round(v * 100);
/** La diferencia de un grupo contra el resto, en puntos con su margen. */
export const puntos = (c) => ({ signo: c.dif >= 0 ? '+' : '−', dif: Math.abs(c.dif * 100).toFixed(1), margen: (c.margen * 100).toFixed(1) });

/**
 * Cada grupo contra el resto. Con `prefijo` (Tus números) cierra con UNA
 * frase: el que se distingue o «ninguno»; sin él (Análisis), cada fila dice
 * si se distingue.
 */
export function Grupos({ grupos, nombre, prefijo = null }) {
  const t = useT();
  if (!grupos.length) return null;
  if (!prefijo) {
    return grupos.map((g) => (
      <p key={g.id} className={`veredicto-cifra ana-grupo ${g.seVe ? (g.dif > 0 ? 'mejor' : 'peor') : ''}`}>
        {t('ana.grupo', { grupo: nombre(g.id), a: pct(g.wr), na: g.n, b: pct(g.wrResto), ...puntos(g) })}
        {g.seVe && <> · {t(g.dif > 0 ? 'ana.lado.mejor' : 'ana.lado.peor')}</>}
      </p>
    ));
  }
  const visto = grupos.find((g) => g.seVe);
  return (
    <>
      {grupos.map((g) => <p key={g.id} className="veredicto-cifra">{t('numeros.grupo', { grupo: nombre(g.id), a: pct(g.wr), na: g.n, b: pct(g.wrResto), ...puntos(g) })}</p>)}
      <p className={`frase ${visto ? (visto.dif > 0 ? 'bien' : 'ojo') : 'duda'}`}>
        {visto ? t(visto.dif > 0 ? `${prefijo}.mejor` : `${prefijo}.peor`, { grupo: nombre(visto.id) }) : t(`${prefijo}.noSeVe`)}
      </p>
    </>
  );
}

/** Racha, sesión de hoy, después de perder, por hora, por duración y por héroe. */
export function TusNumeros({ partidas, ahora }) {
  const t = useT();
  const r = useMemo(() => tusNumeros(partidas, ahora ? { ahora } : {}), [partidas, ahora]);
  if (!r.n) return null;
  const tp = r.trasPerder;
  return (
    <section className="veredicto tus-numeros" aria-label={t('numeros.titulo')}>
      <p className="build-nucleo">{t('numeros.titulo')}</p>
      <p className="veredicto-cifra">
        {t(r.racha.gane ? 'numeros.rachaGana' : 'numeros.rachaPierde', { n: r.racha.n })}
        {r.sesion && <> · {t('numeros.sesion', { n: r.sesion.n, g: r.sesion.ganadas, p: r.sesion.n - r.sesion.ganadas })}</>}
      </p>
      {tp ? (
        <>
          <p className="veredicto-cifra">{t('numeros.trasPerder', { a: pct(tp.wr), na: tp.n, b: pct(tp.wrResto), nb: tp.nResto, ...puntos(tp) })}</p>
          <p className={`frase ${tp.seVe ? (tp.dif < 0 ? 'ojo' : 'bien') : 'duda'}`}>
            {t(tp.seVe ? (tp.dif < 0 ? 'numeros.trasPerderPeor' : 'numeros.trasPerderMejor') : 'numeros.trasPerderNoSeVe')}
          </p>
        </>
      ) : <p className="frase duda">{t('numeros.trasPerderPocas')}</p>}
      <Grupos grupos={r.franjas} prefijo="numeros.franja" nombre={(id) => t(`numeros.franja.${id}`)} />
      <Grupos grupos={r.duraciones} prefijo="numeros.duracion" nombre={(id) => t(`numeros.duracion.${id}`)} />
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

/** Tu semana frente a la anterior: qué héroes te funcionan, qué te cuesta y si seguiste al nº1. */
export function TuSemana({ partidas, ahora }) {
  const t = useT();
  const s = useMemo(() => tuSemana(partidas, ahora ? { ahora } : {}), [partidas, ahora]);
  if (!s.n) return null;
  const a = s.anterior;
  const u = s.numeroUno;
  const lista = (hs) => hs.map((h) => t('semana.heroe', { hero: h.heroe, g: h.ganadas, p: h.n - h.ganadas })).join(', ');
  return (
    <section className="veredicto" aria-label={t('semana.titulo')}>
      <p className="build-nucleo">{t('semana.titulo')}</p>
      <p className="veredicto-cifra">{t('semana.cifra', { n: s.n, g: s.ganadas, p: s.n - s.ganadas, pct: pct(s.wr) })}</p>
      {a ? (
        <>
          <p className="veredicto-cifra">{t('semana.anterior', { pct: pct(a.wr), n: a.n, ...puntos(a) })}</p>
          <p className={`frase ${a.seVe ? (a.dif > 0 ? 'bien' : 'ojo') : 'duda'}`}>{t(a.seVe ? (a.dif > 0 ? 'semana.mejor' : 'semana.peor') : 'semana.igual')}</p>
        </>
      ) : <p className="frase duda">{t('semana.sinAnterior')}</p>}
      {s.funcionan.length > 0 && <p className="veredicto-cifra numeros-heroe mejor">{t('semana.funcionan', { lista: lista(s.funcionan) })}</p>}
      {s.cuestan.length > 0 && <p className="veredicto-cifra numeros-heroe peor">{t('semana.cuestan', { lista: lista(s.cuestan) })}</p>}
      {(s.funcionan.length > 0 || s.cuestan.length > 0) && <p className="build-nota">{t('semana.heroesNota')}</p>}
      {u && (
        <>
          <p className="veredicto-cifra">{t('semana.uno', { c: u.cogido, n: u.n })}</p>
          {u.wrCogido != null && u.wrOtro != null && <p className="veredicto-cifra">{t('semana.unoWr', { a: pct(u.wrCogido), na: u.cogido, b: pct(u.wrOtro), nb: u.n - u.cogido })}</p>}
          <p className="build-nota">{t('semana.unoNota')}</p>
        </>
      )}
    </section>
  );
}
