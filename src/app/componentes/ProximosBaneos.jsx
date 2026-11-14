import { useMemo } from 'react';
import { tic } from '../tacto.js';
import { Cara } from './Imagen.jsx';
import { useOrdenEstable } from './useOrdenEstable.js';
import { useT } from '../i18n/contexto.js';

/**
 * Los siguientes baneos probables, en chips con su tasa de ban. No se
 * desplazan (lo que se toca a contrarreloj no se mueve): el tocado se queda
 * tachado en su sitio y el nuevo entra por el final; otro toque lo quita.
 *
 * @param items  [{ heroe, banRate }] (motor/baneos.js)
 */
export function ProximosBaneos({ items, baneos = [], tasaDe = () => null, onBanear, onQuitar, visibles = 8, rango = '' }) {
  const t = useT();
  const marcados = useMemo(() => new Set(baneos.map((h) => h.name)), [baneos]);
  const candidatos = useMemo(() => items.map((x) => x.heroe.name), [items]);
  const orden = useOrdenEstable(candidatos, marcados, visibles);
  const porNombre = useMemo(() => new Map([...items.map((x) => [x.heroe.name, x.heroe]), ...baneos.map((h) => [h.name, h])]), [items, baneos]);
  const fila = orden.filter((n) => porNombre.has(n));
  if (!fila.length) return null;
  return (
    <section className="proximos">
      <div className="side-label"><span>{t('baneos.siguientes')}</span><span>{t('baneos.segun', { rango })}</span></div>
      <div className="equipo-chips">
        {fila.map((n) => {
          const heroe = porNombre.get(n);
          const marcado = marcados.has(n);
          const tasa = items.find((x) => x.heroe.name === n)?.banRate ?? tasaDe(n);
          return (
            <button
              key={n} className={`chip ${marcado ? 'elegido' : ''}`} aria-pressed={marcado}
              onClick={() => { tic(); if (marcado) onQuitar?.(heroe); else onBanear(heroe); }}
              aria-label={marcado ? t('app.quitar', { nombre: n }) : t('app.marcarBaneo', { nombre: n })}
            >
              <Cara heroe={heroe} alt="" className="grid-cara" tam={22} />
              {n}
              {tasa != null && <span className="chip-pct">{Math.round(tasa * 100)}%</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
