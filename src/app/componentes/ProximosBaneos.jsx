import { useMemo } from 'react';
import { Cara } from './Imagen.jsx';
import { useOrdenEstable } from './useOrdenEstable.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Los siguientes baneos probables (motor/baneos.js): chips con la tasa de
 * ban, para tocar en vez de escribir. Los chips NO se desplazan: el tocado
 * se queda en su sitio, tachado, y el candidato nuevo entra por el final.
 * Segundo toque en el tachado: lo quita.
 *
 * @param items  [{ heroe, banRate, factor }]
 */
export function ProximosBaneos({ items, baneos = [], tasaDe = () => null, onBanear, onQuitar, visibles = 8, t = tPorDefecto }) {
  const marcados = useMemo(() => new Set(baneos.map((h) => h.name)), [baneos]);
  const candidatos = useMemo(() => items.map((x) => x.heroe.name), [items]);
  const orden = useOrdenEstable(candidatos, marcados, visibles);
  const porNombre = useMemo(() => new Map([...items.map((x) => [x.heroe.name, x.heroe]), ...baneos.map((h) => [h.name, h])]), [items, baneos]);
  const fila = orden.filter((n) => porNombre.has(n));
  if (!fila.length) return null;
  return (
    <section className="proximos">
      <div className="side-label"><span>{t('baneos.siguientes')}</span><span>{t('baneos.segun')}</span></div>
      <div className="equipo-chips">
        {fila.map((n) => {
          const heroe = porNombre.get(n);
          const marcado = marcados.has(n);
          const tasa = items.find((x) => x.heroe.name === n)?.banRate ?? tasaDe(n);
          return (
            <button
              key={n}
              className={`chip ${marcado ? 'elegido' : ''}`}
              aria-pressed={marcado}
              onClick={() => (marcado ? onQuitar?.(heroe) : onBanear(heroe))}
              aria-label={marcado ? t('app.quitar', { nombre: n }) : t('app.marcarBaneo', { nombre: n })}
            >
              <Cara heroe={heroe} className="grid-cara" tam={22} />
              {n}
              {tasa != null && <span className="chip-pct">{Math.round(tasa * 100)}%</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
