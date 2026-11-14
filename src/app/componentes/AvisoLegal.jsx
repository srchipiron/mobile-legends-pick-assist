import { puedeVibrar } from '../tacto.js';
import { IDIOMAS } from '../i18n/index.js';
import { useT } from '../i18n/contexto.js';

/** [P] El enlace de donación: vacío hasta que Javi ponga el suyo (mejor un hueco que uno inventado). */
export const ENLACE_DONAR = '';

/** Los botones de idioma (en el pie y en la portada, que tapa el pie). */
export function Idiomas({ idioma, onIdioma }) {
  return (
    <div className="idiomas">
      {IDIOMAS.map((l) => (
        <button key={l} className={idioma === l ? 'elegido' : ''} aria-pressed={idioma === l} onClick={() => onIdioma(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

/**
 * Idioma, vibración (solo donde el navegador sabe vibrar), el aviso de no
 * afiliación (los nombres y los datos son de Moonton), privacidad y donación.
 */
export function AvisoLegal({ idioma, onIdioma, tacto = null, onTacto = null }) {
  const t = useT();
  return (
    <section className="aviso">
      <div className="aviso-ajustes">
        <Idiomas idioma={idioma} onIdioma={onIdioma} />
        {onTacto && puedeVibrar() && (
          <button className="tacto" aria-pressed={!!tacto} onClick={() => onTacto(!tacto)}>{t(tacto ? 'ajustes.tactoSi' : 'ajustes.tactoNo')}</button>
        )}
      </div>
      <p>{t('legal.noAfiliado')}</p>
      <p>{t('legal.privacidad')}</p>
      <p>{t('legal.liquipedia')}</p>
      {ENLACE_DONAR && <a className="donar" href={ENLACE_DONAR} target="_blank" rel="noopener noreferrer">{t('donar.texto')}</a>}
    </section>
  );
}
