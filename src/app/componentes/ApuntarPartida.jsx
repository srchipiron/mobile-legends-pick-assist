import { useMemo, useState } from 'react';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { RejillaDeHeroes } from './RejillaDeHeroes.jsx';
import { useT } from '../i18n/contexto.js';

const porNombre = (a, b) => a.name.localeCompare(b.name);

/**
 * Apuntar cómo fue: a quién cogiste (tu pick marcado de entrada; si no, el
 * nº1) y si ganaste. Los recomendados van primero y marcados: saber si le
 * hiciste caso es lo que dice si la app sirve. El resto del catálogo, detrás
 * de un toque (te pusieron en otra línea).
 */
export function ApuntarPartida({ pool, heroes = [], miPick = null, recomendados, onGuardar, onCerrar }) {
  const t = useT();
  const [pick, setPick] = useState(miPick ?? recomendados[0] ?? null);
  const [todos, setTodos] = useState(false);
  const orden = useMemo(() => {
    const rec = new Set(recomendados);
    return [...pool].sort((a, b) => (rec.has(b.name) ? 1 : 0) - (rec.has(a.name) ? 1 : 0) || porNombre(a, b));
  }, [pool, recomendados]);
  const resto = useMemo(() => {
    const enPool = new Set(pool.map((h) => h.name));
    return heroes.filter((h) => !enPool.has(h.name)).sort(porNombre);
  }, [heroes, pool]);
  const marcas = (h) => (
    <>
      {recomendados.includes(h.name) && <span className="inferred">{t('registro.recomendado')}</span>}
      {miPick === h.name && <span className="inferred">{t('pick.tuyo')}</span>}
    </>
  );

  return (
    <Hoja etiqueta={t('app.apuntarPartida')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('registro.conQuien')}>
        <button className="close" onClick={onCerrar}>{t('app.cancelar')}</button>
      </CabeceraDeHoja>
      <RejillaDeHeroes heroes={todos ? [...orden, ...resto] : orden} onElegir={(h) => setPick(h.name)} elegido={(h) => pick === h.name} extra={marcas}>
        {resto.length > 0 && !todos && <button className="otro-heroe" onClick={() => setTodos(true)}>{t('registro.otroHeroe')}</button>}
      </RejillaDeHeroes>
      <div className="resultado">
        <button className="reset" disabled={!pick} onClick={() => onGuardar(pick, false)}>{t('registro.perdi')}</button>
        <button className="reset" disabled={!pick} onClick={() => onGuardar(pick, true)}>{t('registro.gane')}</button>
      </div>
    </Hoja>
  );
}
