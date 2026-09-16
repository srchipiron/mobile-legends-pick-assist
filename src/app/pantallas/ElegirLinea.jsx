import { LINEAS } from '../../motor/catalogo.js';
import { Hoja } from '../componentes/Hoja.jsx';
import { Idiomas } from '../componentes/AvisoLegal.jsx';
import { tPorDefecto } from '../componentes/tPorDefecto.js';

/**
 * Qué línea juegas. Se pregunta una sola vez y se recuerda: no es una
 * preferencia estética, es el dato que decide entre 21 y 40 héroes. En el
 * primer arranque tapa el pie, así que el idioma va dentro.
 */
export function ElegirLinea({ valor, onElegir, onCerrar, idioma, onIdioma, idiomas = [], t = tPorDefecto }) {
  return (
    <Hoja etiqueta={t('app.elegirLinea')} onCerrar={onCerrar}>
      <div className="sheet-head">
        <strong style={{ flex: 1, alignSelf: 'center' }}>{t('linea.pregunta')}</strong>
        {onIdioma && idiomas.length > 1 && <Idiomas idioma={idioma} onIdioma={onIdioma} idiomas={idiomas} />}
        {onCerrar && <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>}
      </div>
      <div className="lineas">
        {LINEAS.map((l) => (
          <button key={l} className={`linea ${valor === l ? 'elegida' : ''}`} aria-pressed={valor === l} onClick={() => onElegir(l)}>
            <span className="linea-nombre">{t(`linea.${l}`)}</span>
            <span className="linea-pista">{t(`linea.${l}.pista`)}</span>
          </button>
        ))}
      </div>
      <p className="empty-state" style={{ paddingTop: '10px' }}>{t('linea.cambiarDespues')}</p>
    </Hoja>
  );
}
