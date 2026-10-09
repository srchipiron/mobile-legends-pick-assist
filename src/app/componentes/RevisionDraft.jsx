import { useMemo, useState } from 'react';
import { revisarPartida, revisarDrafts } from '../../motor/draft.js';
import { tPorDefecto } from './tPorDefecto.js';

const pct = (v) => Math.round(v * 100);
const puntos = (v) => (v * 100).toFixed(1);

/**
 * La revisión del draft (3.49.0, como DraftGap en LoL): tu última partida
 * con draft, con el draft entero y los datos de hoy, y a petición todas.
 * Todas cuestan ~1 s en el móvil por cada 40 drafts: por eso van con botón.
 */
export function RevisionDraft({ datos, partidas, maestria, t = tPorDefecto }) {
  const ultima = useMemo(() => {
    if (!datos) return null;
    const conDraft = (partidas ?? []).filter((p) => p.draft?.linea && !p.previa).sort((a, b) => b.t - a.t);
    for (const p of conDraft.slice(0, 5)) {
      const r = revisarPartida(datos, p, { maestria });
      if (r) return r;
    }
    return null;
  }, [datos, partidas, maestria]);
  const [todas, setTodas] = useState(null);
  const [calculando, setCalculando] = useState(false);
  if (!ultima) return null;

  const revisarTodas = () => {
    setCalculando(true);
    // Un respiro para que se pinte «Revisando…» antes del cálculo.
    setTimeout(() => { setTodas(revisarDrafts(datos, partidas, { maestria })); setCalculando(false); }, 30);
  };

  return (
    <section className="veredicto revision-draft" aria-label={t('revision.titulo')}>
      <p className="build-nucleo">{t('revision.titulo')}</p>
      <Fila r={ultima} t={t} />
      {todas ? <Resumen r={todas} t={t} /> : (
        <button className="ancho" disabled={calculando} onClick={revisarTodas}>{t(calculando ? 'revision.calculando' : 'revision.todas')}</button>
      )}
      <p className="build-nota">{t('revision.nota')}</p>
    </section>
  );
}

function Fila({ r, t }) {
  const puesto = r.puesto ? t('revision.puesto', { puesto: r.puesto, de: r.de }) : t('revision.fuera');
  return (
    <p className={`frase ${r.veredicto === 'mejor' ? 'ojo' : r.veredicto === 'bien' ? 'bien' : 'duda'}`}>
      {r.veredicto === 'bien'
        ? t('revision.bien', { hero: r.pick, p: pct(r.p) })
        : t(r.veredicto === 'mejor' ? 'revision.mejor' : 'revision.poco', { hero: r.pick, p: pct(r.p), puesto, mejor: r.mejor.heroe, pm: pct(r.mejor.p), dif: puntos(r.dif) })}
    </p>
  );
}

function Resumen({ r, t }) {
  if (!r.n) return <p className="frase duda">{t('revision.ninguna')}</p>;
  const c = r.comparacion;
  const cuenta = new Map();
  for (const f of r.filas) if (f.veredicto === 'mejor') cuenta.set(f.mejor.heroe, (cuenta.get(f.mejor.heroe) ?? 0) + 1);
  const mas = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => `${h} (${n})`).join(', ');
  return (
    <>
      <p className="veredicto-cifra">{t('revision.resumen', { n: r.n, bien: r.bien, pb: pct(r.bien / r.n), claro: r.claro, dif: puntos(r.difMedia) })}</p>
      {mas && <p className="veredicto-cifra">{t('revision.masSugeridos', { lista: mas })}</p>}
      {c ? (
        <>
          <p className="veredicto-cifra">{t('revision.comparacion', { a: pct(c.wrClaro), na: c.nClaro, b: pct(c.wrResto), nb: c.nResto, signo: c.dif >= 0 ? '+' : '−', dif: Math.abs(c.dif * 100).toFixed(1), margen: (c.margen * 100).toFixed(1) })}</p>
          <p className={`frase ${c.seVe ? (c.dif < 0 ? 'ojo' : 'bien') : 'duda'}`}>
            {t(c.seVe ? (c.dif < 0 ? 'revision.compPeor' : 'revision.compMejor') : 'revision.compNoSeVe')}
          </p>
        </>
      ) : <p className="frase duda">{t('revision.compPocas')}</p>}
    </>
  );
}
