import { useMemo } from 'react';
import { tuSemana } from '../../motor/habitos.js';
import { tPorDefecto } from './tPorDefecto.js';

const pct = (v) => Math.round(v * 100);

/**
 * «Tu semana» (3.79.0), pedido por Javi: qué héroes te funcionan esta
 * semana, qué te cuesta y si seguiste o no al nº1. Frente a la semana
 * anterior, con el margen al lado: «mejor» o «peor» solo fuera de él.
 */
export function TuSemana({ partidas, t = tPorDefecto, ahora }) {
  const s = useMemo(() => tuSemana(partidas, ahora ? { ahora } : {}), [partidas, ahora]);
  if (!s.n) return null;
  const a = s.anterior;
  const lista = (hs) => hs.map((h) => t('semana.heroe', { hero: h.heroe, g: h.ganadas, p: h.n - h.ganadas })).join(', ');
  const u = s.numeroUno;
  return (
    <section className="veredicto" aria-label={t('semana.titulo')}>
      <p className="build-nucleo">{t('semana.titulo')}</p>
      <p className="veredicto-cifra">{t('semana.cifra', { n: s.n, g: s.ganadas, p: s.n - s.ganadas, pct: pct(s.wr) })}</p>
      {a ? (
        <>
          <p className="veredicto-cifra">{t('semana.anterior', { pct: pct(a.wr), n: a.n, signo: a.dif >= 0 ? '+' : '−', dif: Math.abs(a.dif * 100).toFixed(1), margen: (a.margen * 100).toFixed(1) })}</p>
          <p className={`frase ${a.seVe ? (a.dif > 0 ? 'bien' : 'ojo') : 'duda'}`}>{t(a.seVe ? (a.dif > 0 ? 'semana.mejor' : 'semana.peor') : 'semana.igual')}</p>
        </>
      ) : (
        <p className="frase duda">{t('semana.sinAnterior')}</p>
      )}
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
