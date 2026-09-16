import { tPorDefecto } from './tPorDefecto.js';

/**
 * Enlace de donación. Vacío hasta que Javi ponga el suyo: mejor un hueco que
 * un enlace inventado.
 */
export const ENLACE_DONAR = '';

/** Los botones de idioma. Van en el pie y en la primera pantalla (que tapa el pie). */
export function Idiomas({ idioma, onIdioma, idiomas = ['es', 'en'] }) {
  return (
    <div className="idiomas">
      {idiomas.map((l) => (
        <button key={l} className={idioma === l ? 'elegido' : ''} aria-pressed={idioma === l} onClick={() => onIdioma(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

/**
 * Pie público: idioma, aviso de no afiliación, privacidad y donación. El
 * aviso NO es adorno: los nombres y los datos son de Moonton, y esto es una
 * herramienta de aficionado.
 */
export function AvisoLegal({ t = tPorDefecto, idioma, onIdioma, idiomas = ['es', 'en'] }) {
  return (
    <section className="aviso">
      <Idiomas idioma={idioma} onIdioma={onIdioma} idiomas={idiomas} />
      <p>{t('legal.noAfiliado')}</p>
      <p>{t('legal.privacidad')}</p>
      <p>{t('legal.liquipedia')}</p>
      {ENLACE_DONAR && <a className="donar" href={ENLACE_DONAR} target="_blank" rel="noopener noreferrer">{t('donar.texto')}</a>}
    </section>
  );
}
