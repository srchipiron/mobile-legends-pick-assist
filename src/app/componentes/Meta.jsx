import { useMemo } from 'react';
import { LINEAS } from '../../motor/catalogo.js';
import { terminoHeroe } from '../../motor/modelo.js';
import { buscar } from '../../motor/nombres.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Cara } from './Imagen.jsx';
import { ETIQUETAS_RANGO } from './SelectorDeRango.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/** Cuántos héroes por línea: los que decide un draft, no los 42 de exp. */
const POR_LINEA = 12;

/**
 * La tier list que la app YA usa, para que se pueda comparar con la que se
 * lea por ahí en vez de fiarse. Por línea, ordenada por el MISMO término de
 * héroe con el que puntúa el modelo (winrate del rango menos la media del
 * rango), así que lo que sale aquí es exactamente lo que empuja las tarjetas.
 * No toca el motor ni añade constantes: solo enseña lo que ya decide.
 *
 * La deriva (Δ) es la ventana corta frente a la de 7 días, cuando la ingesta
 * trae las dos y la corta es coherente (src/motor/ventana.js): un héroe que
 * sube tras un parche se ve aquí antes de que la media de 7 días lo recoja.
 */
export function Meta({ datos, linea, onCerrar, t = tPorDefecto }) {
  const { stats, ventana, mediaDelRango } = datos.meta;
  const conDeriva = ventana?.dias && ventana.dias !== 7;
  const lineas = useMemo(() => {
    const orden = linea ? [linea, ...LINEAS.filter((l) => l !== linea)] : LINEAS;
    return orden.map((l) => ({
      linea: l,
      filas: (datos.poolsPorLinea[l] ?? [])
        .map((h) => ({ heroe: h, stat: buscar(stats, h.name), valor: terminoHeroe(h, stats, mediaDelRango)?.valor ?? 0 }))
        .filter((f) => f.stat?.winRate != null)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, POR_LINEA),
    }));
  }, [datos, linea, stats, mediaDelRango]);
  const pct = (v, d = 1) => (v * 100).toFixed(d);

  return (
    <Hoja etiqueta={t('meta.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('meta.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body">
        <p className="nota">{t('meta.pista', { rango: ETIQUETAS_RANGO[datos.rango] ?? datos.rango, dias: ventana?.dias ?? 7 })}</p>
        {conDeriva && <p className="nota">{t('meta.deriva', { dias: ventana.dias })}</p>}
        {lineas.map(({ linea: l, filas }) => (
          <section key={l} className="meta-linea">
            <h3 className="meta-titulo">{t(`linea.${l}`)}</h3>
            {!filas.length && <p className="nota">{t('app.sinDatosMeta')}</p>}
            {filas.map((f, i) => {
              const delta = conDeriva && f.stat.winRateSemana != null ? f.stat.winRate - f.stat.winRateSemana : null;
              return (
                <div key={f.heroe.name} className={`meta-fila${i === 0 ? ' top' : ''}`}>
                  <span className="meta-pos">{i + 1}</span>
                  <Cara heroe={f.heroe} className="grid-cara" tam={30} alt="" />
                  <span className="meta-nombre">{f.heroe.name}</span>
                  <span className="meta-wr">{pct(f.stat.winRate)}%</span>
                  <span className={`meta-delta${delta == null ? '' : delta > 0.001 ? ' sube' : delta < -0.001 ? ' baja' : ''}`}>
                    {delta == null ? '' : `${delta >= 0 ? '+' : '−'}${pct(Math.abs(delta))}`}
                  </span>
                  <span className="meta-uso">{t('meta.uso', { pick: pct(f.stat.pickRate ?? 0), ban: pct(f.stat.banRate ?? 0, 0) })}</span>
                </div>
              );
            })}
          </section>
        ))}
        <p className="nota">{t('meta.resto')}</p>
      </div>
    </Hoja>
  );
}
