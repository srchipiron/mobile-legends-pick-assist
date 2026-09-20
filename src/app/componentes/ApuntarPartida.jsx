import { useMemo, useState } from 'react';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Apuntar cómo fue la partida. Dos toques: a quién cogiste y si ganaste. Los
 * recomendados van primero y marcados: saber si le hiciste caso es justo el
 * dato que hace falta para saber si la app sirve de algo.
 */
export function ApuntarPartida({ pool, heroes = [], miPick = null, recomendados, onGuardar, onCerrar, t = tPorDefecto }) {
  // Tu pick fijado va marcado de entrada: apuntar es un toque (Gané/Perdí).
  const [pick, setPick] = useState(miPick ?? recomendados[0] ?? null);
  const [todos, setTodos] = useState(false);
  const orden = useMemo(() => {
    const rec = new Set(recomendados);
    return [...pool].sort((a, b) => (rec.has(b.name) ? 1 : 0) - (rec.has(a.name) ? 1 : 0) || a.name.localeCompare(b.name));
  }, [pool, recomendados]);
  // Te pusieron en otra línea: cualquier héroe, detrás de un toque.
  const resto = useMemo(() => {
    const enPool = new Set(pool.map((h) => h.name));
    return heroes.filter((h) => !enPool.has(h.name)).sort((a, b) => a.name.localeCompare(b.name));
  }, [heroes, pool]);

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
            {miPick === h.name && <span className="inferred">{t('pick.tuyo')}</span>}
          </button>
        ))}
        {resto.length > 0 && !todos && <button className="otro-heroe" onClick={() => setTodos(true)}>{t('registro.otroHeroe')}</button>}
        {todos && resto.map((h) => (
          <button key={h.name} className={pick === h.name ? 'elegido' : ''} onClick={() => setPick(h.name)}>{h.name}</button>
        ))}
      </div>
      <div className="resultado">
        <button className="reset" disabled={!pick} onClick={() => onGuardar(pick, false)}>{t('registro.perdi')}</button>
        <button className="reset" disabled={!pick} onClick={() => onGuardar(pick, true)}>{t('registro.gane')}</button>
      </div>
    </Hoja>
  );
}
