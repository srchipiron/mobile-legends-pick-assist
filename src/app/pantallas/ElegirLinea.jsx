import { LINEAS } from '../../motor/catalogo.js';
import { Hoja } from '../componentes/Hoja.jsx';
import { Idiomas } from '../componentes/AvisoLegal.jsx';
import { tPorDefecto } from '../componentes/tPorDefecto.js';

/**
 * El icono y el color de cada línea (3.91.0). Dibujos propios y sencillos
 * (escudo, hoja, rayo, moneda, espada), no los del juego.
 */
const ASPECTO = {
  roam: { tono: '#409CFF', d: 'M12 2.5 4.5 5.5v6c0 4.6 3.2 8.4 7.5 10 4.3-1.6 7.5-5.4 7.5-10v-6L12 2.5Z' },
  jungle: { tono: '#30D158', d: 'M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14Zm0 0 8.5-8.5' },
  mid: { tono: '#BF5AF2', d: 'M13 2 5 13.5h6L10 22l9-12.5h-6L13 2Z' },
  gold: { tono: '#FFD60A', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10M9 9.5c0-1.4 1.3-2 3-2s3 .8 3 2-1.2 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.6 3-2' },
  exp: { tono: '#FF9F0A', d: 'M20 4h-4.5L7 12.5l4.5 4.5L20 8.5V4ZM5 14l5 5M3.5 20.5l3-3' },
};

/**
 * Qué línea juegas. Se pregunta una sola vez y se recuerda: no es una
 * preferencia estética, es el dato que decide entre 21 y 40 héroes. En el
 * primer arranque tapa el pie, así que el idioma va dentro.
 */
export function ElegirLinea({ valor, onElegir, onCerrar, idioma, onIdioma, idiomas = [], t = tPorDefecto }) {
  return (
    <Hoja etiqueta={t('app.elegirLinea')} onCerrar={onCerrar}>
      {/* La portada, solo la primera vez (3.91.0): sin línea elegida. */}
      {!valor && (
        <div className="portada">
          <p className="portada-marca">Pick Assist</p>
          <p className="portada-lema">{t('linea.portadaLema')}</p>
        </div>
      )}
      <div className="sheet-head">
        <strong style={{ flex: 1, alignSelf: 'center' }}>{t('linea.pregunta')}</strong>
        {onIdioma && idiomas.length > 1 && <Idiomas idioma={idioma} onIdioma={onIdioma} idiomas={idiomas} />}
        {onCerrar && <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>}
      </div>
      <div className="lineas">
        {LINEAS.map((l) => (
          <button key={l} className={`linea ${valor === l ? 'elegida' : ''}`} style={ASPECTO[l] ? { '--tono': ASPECTO[l].tono } : undefined} aria-pressed={valor === l} onClick={() => onElegir(l)}>
            {ASPECTO[l] && (
              <span className="linea-icono" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ASPECTO[l].d} /></svg>
              </span>
            )}
            <span className="linea-nombre">{t(`linea.${l}`)}</span>
            <span className="linea-pista">{t(`linea.${l}.pista`)}</span>
            <span className="linea-flecha" aria-hidden>›</span>
          </button>
        ))}
      </div>
      <p className="empty-state" style={{ paddingTop: '10px' }}>{t('linea.cambiarDespues')}</p>
    </Hoja>
  );
}
