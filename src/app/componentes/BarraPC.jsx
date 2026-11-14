import { useT } from '../i18n/contexto.js';

/**
 * La barra del ordenador: desde 1.100 px (el corte de styles.css) lo que en
 * el móvil vive en «Ajustes» va a un clic, con las teclas al lado. En el
 * móvil es `display: none`: no mueve la nº1.
 */
export function BarraPC({ abrir, onDiagnostico, conCapturas, fase }) {
  const t = useT();
  return (
    <nav className="barra-pc" aria-label={t('pc.barra')}>
      <button className="reset" onClick={() => abrir('analisis')}>{t('ana.boton')}</button>
      <button className="reset" onClick={() => abrir('historial')}>{t('hist.boton')}</button>
      {conCapturas && <button className="reset" onClick={() => abrir('revisar')}>{t('pc.capturas')}</button>}
      <button className="reset" onClick={() => abrir('maestria')}>{t('app.maestria')}</button>
      <button className="reset" onClick={() => abrir('meta')}>{t('meta.boton')}</button>
      <button className="reset" onClick={() => abrir('perfil')}>{t('perfil.boton')}</button>
      <button className="reset" onClick={onDiagnostico}>{t('app.diagnostico')}</button>
      <p className="nota barra-pc-teclas">{t(fase === 'baneos' ? 'pc.teclasBaneos' : 'pc.teclas')}</p>
    </nav>
  );
}
