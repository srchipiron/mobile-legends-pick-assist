import { useMemo, useState } from 'react';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Apuntar cómo fue la partida. Dos toques: a quién cogiste y si ganaste. Los
 * recomendados van primero y marcados: saber si le hiciste caso es justo el
 * dato que hace falta para saber si la app sirve de algo.
 */
export function ApuntarPartida({ pool, recomendados, onGuardar, onCerrar, t = tPorDefecto }) {
  const [pick, setPick] = useState(recomendados[0] ?? null);
  const orden = useMemo(() => {
    const rec = new Set(recomendados);
    return [...pool].sort((a, b) => (rec.has(b.name) ? 1 : 0) - (rec.has(a.name) ? 1 : 0) || a.name.localeCompare(b.name));
  }, [pool, recomendados]);

  return (
    <Hoja etiqueta={t('app.apuntarPartida')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('registro.conQuien')}>
        <button className="close" onClick={onCerrar}>{t('app.cancelar')}</button>
      </CabeceraDeHoja>
      <div className="hero-grid">
        {orden.map((h) => (
          <button key={h.name} className={pick === h.name ? 'elegido' : ''} onClick={() => setPick(h.name)}>
            {h.name}
            {recomendados.includes(h.name) && <span className="inferred">{t('registro.recomendado')}</span>}
          </button>
        ))}
      </div>
      <div className="resultado">
        <button className="reset" disabled={!pick} onClick={() => onGuardar(pick, false)}>{t('registro.perdi')}</button>
        <button className="reset" disabled={!pick} onClick={() => onGuardar(pick, true)}>{t('registro.gane')}</button>
      </div>
    </Hoja>
  );
}
