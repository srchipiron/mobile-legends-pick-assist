import { useState } from 'react';
import { tPorDefecto } from './tPorDefecto.js';

const pct = (p) => Math.round(p * 100);

/**
 * Cómo va a ir la partida (3.43.0, src/motor/fases.js): vuestra
 * probabilidad de ganar según el minuto en que acabe, en seis barras, y una
 * frase con lo que os conviene. Las barras salen de la línea del 50%: hacia
 * arriba a favor, hacia abajo en contra, con la MISMA escala en todos los
 * drafts (±30 puntos llena la mitad) para que se puedan comparar.
 */
const ESCALA_BARRA = 0.3;
function CurvaDePartida({ fases, t }) {
  const puntos = fases.puntos;
  const ini = pct(puntos[0].p); const fin = pct(puntos[puntos.length - 1].p);
  const lista = puntos.map((x) => pct(x.p));
  const resumen = fases.tendencia === 'pronto' ? t('fases.pronto', { ini, fin })
    : fases.tendencia === 'tarde' ? t('fases.tarde', { ini, fin })
      : t('fases.igual', { min: Math.min(...lista), max: Math.max(...lista) });
  const alto = (p) => Math.max(2, Math.min(50, (Math.abs(p - 0.5) / ESCALA_BARRA) * 50));
  return (
    <div className="plan-bloque curva-partida">
      <p className="plan-sub">{t('fases.titulo')}</p>
      <p className="curva-ayuda">{t('fases.subtitulo')}</p>
      <ol className="curva-barras" aria-label={t('fases.titulo')}>
        {puntos.map((x) => (
          <li key={x.desde} className={`curva-tramo ${x.p >= 0.5 ? 'a-favor' : 'en-contra'}`}>
            <span className="curva-pct">{pct(x.p)}%</span>
            <span className="curva-hueco"><span className="curva-barra" style={{ height: `${alto(x.p)}%` }} /></span>
            <span className="curva-min">{x.hasta ? t('fases.tramo', { desde: x.desde, hasta: x.hasta }) : t('fases.tramoFinal', { desde: x.desde })}</span>
          </li>
        ))}
      </ol>
      <p className="curva-resumen" data-tendencia={fases.tendencia}>{resumen}</p>
    </div>
  );
}

/** Una lista de frases con su título; no pinta nada si está vacía. */
function Etapa({ titulo, frases, clase, t }) {
  if (!frases?.length) return null;
  return (
    <div className={`plan-bloque plan-etapa ${clase}`}>
      <p className="plan-sub">{titulo}</p>
      <ul className="plan-lista">{frases.map((f) => <li key={f.clave + JSON.stringify(f.params ?? {})} data-clave={f.clave}>{t(f.clave, f.params)}</li>)}</ul>
    </div>
  );
}

/**
 * El plan de partida (3.36.0, src/motor/plan.js; por fases desde 3.43.0):
 * cómo va a ir la partida según cuánto dure, qué hacer al principio, en las
 * peleas y al final, qué problemas vas a tener, y frases cortas para decir
 * al equipo por voz. Va arriba de la hoja de objetos, que se abre desde
 * cualquier tarjeta: así no añade ni un píxel a la tarjeta nº1 (lo que
 * vigila primera-pantalla.e2e).
 *
 * «Copiar para el chat» copia solo lo del equipo, en una línea, para
 * pegarlo en el chat del juego.
 */
export function PlanDePartida({ plan, yo, t = tPorDefecto }) {
  const [copiado, setCopiado] = useState(false);
  const equipo = plan?.equipo ?? [];
  const etapas = plan?.etapas ?? { temprano: [], medio: plan?.tuyo ?? [], tarde: [] };
  const problemas = plan?.problemas ?? [];
  const algo = plan?.fases || equipo.length || problemas.length || etapas.temprano.length || etapas.medio.length || etapas.tarde.length;
  if (!algo) {
    return <section className="plan-partida"><p className="build-vacio">{t('partida.vacio')}</p></section>;
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(equipo.map((f) => t(f.clave, f.params)).join(' · '));
      setCopiado(true);
    } catch { /* sin portapapeles, las frases siguen en pantalla */ }
  };
  return (
    <section className="plan-partida">
      <p className="build-nucleo">{t('partida.titulo', { yo: yo?.name ?? '' })}</p>
      {plan?.fases && <CurvaDePartida fases={plan.fases} t={t} />}
      <Etapa titulo={t('etapa.temprano')} frases={etapas.temprano} clase="etapa-temprano" t={t} />
      <Etapa titulo={t('etapa.medio')} frases={etapas.medio} clase="etapa-medio" t={t} />
      <Etapa titulo={t('etapa.tarde')} frases={etapas.tarde} clase="etapa-tarde" t={t} />
      <Etapa titulo={t('etapa.problemas')} frases={problemas} clase="etapa-problemas" t={t} />
      {equipo.length > 0 && (
        <div className="plan-bloque plan-equipo">
          <div className="plan-cabecera">
            <p className="plan-sub">{t('partida.equipo')}</p>
            <button className="plan-copiar" onClick={copiar}>{t(copiado ? 'partida.copiado' : 'partida.copiar')}</button>
          </div>
          <ol className="plan-lista">{equipo.map((f) => <li key={f.clave} data-clave={f.clave}>{t(f.clave, f.params)}</li>)}</ol>
        </div>
      )}
      <p className="build-nota">{t('partida.aviso')}</p>
    </section>
  );
}
