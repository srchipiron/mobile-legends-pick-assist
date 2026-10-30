import { tPorDefecto } from './tPorDefecto.js';

/**
 * La barra del ordenador (3.87.0): en pantalla ancha (desde 1.100 px, el
 * corte de styles.css) todo lo que en el móvil vive dentro de «Ajustes» va
 * a la vista, a un clic, con las teclas del draft al lado. En el móvil no
 * se ve (CSS): ahí no cambia ni un píxel de dónde cae la nº1.
 */
export function BarraPC({ abrir, onDiagnostico, conCapturas, fase, t = tPorDefecto }) {
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
