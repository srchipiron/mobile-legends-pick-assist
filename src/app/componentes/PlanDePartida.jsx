import { useState } from 'react';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * El plan de partida (3.36.0, src/motor/plan.js): frases cortas para decir
 * al equipo por voz y lo que te toca a ti con ese héroe. Va arriba de la
 * hoja de objetos, que se abre desde cualquier tarjeta: así no añade ni un
 * píxel a la tarjeta nº1 (lo que vigila primera-pantalla.e2e).
 *
 * «Copiar para el chat» copia solo lo del equipo, en una línea, para
 * pegarlo en el chat del juego.
 */
export function PlanDePartida({ plan, yo, t = tPorDefecto }) {
  const [copiado, setCopiado] = useState(false);
  const equipo = plan?.equipo ?? [];
  const tuyo = plan?.tuyo ?? [];
  if (!equipo.length && !tuyo.length) {
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
      <p className="build-nucleo">{t('partida.titulo')}</p>
      {equipo.length > 0 && (
        <div className="plan-bloque">
          <div className="plan-cabecera">
            <p className="plan-sub">{t('partida.equipo')}</p>
            <button className="plan-copiar" onClick={copiar}>{t(copiado ? 'partida.copiado' : 'partida.copiar')}</button>
          </div>
          <ol className="plan-lista">{equipo.map((f) => <li key={f.clave} data-clave={f.clave}>{t(f.clave, f.params)}</li>)}</ol>
        </div>
      )}
      {tuyo.length > 0 && (
        <div className="plan-bloque">
          <p className="plan-sub">{t('partida.tuyo', { yo: yo?.name ?? '' })}</p>
          <ul className="plan-lista">{tuyo.map((f) => <li key={f.clave} data-clave={f.clave}>{t(f.clave, f.params)}</li>)}</ul>
        </div>
      )}
      <p className="build-nota">{t('partida.aviso')}</p>
    </section>
  );
}
