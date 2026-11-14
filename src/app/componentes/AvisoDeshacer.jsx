import { tic } from '../tacto.js';
import { useT } from '../i18n/contexto.js';

/**
 * «Deshacer»: tras «Nuevo draft», la ×, lo que copió la tablet o una partida
 * apuntada. Va montado en App, fuera de todo lo que se transforma: es
 * `position: fixed` y un antecesor con `transform` lo encerraría.
 */
export function AvisoDeshacer({ deshacible, onDeshacer, onCerrar }) {
  const t = useT();
  if (!deshacible) return null;
  const d = deshacible;
  const texto = d.tipo === 'quitado' ? t('deshacer.quitado', { nombre: d.nombre })
    : d.tipo === 'apuntada' ? t(d.aMano ? 'deshacer.apuntadaMano' : 'deshacer.apuntada', { resultado: t(d.gane ? 'deshacer.ganada' : 'deshacer.perdida') })
    : d.tipo === 'leido' ? t('deshacer.leido', { b: d.baneos, e: d.enemigos, a: d.aliados ?? 0 }) + (d.tuyo ? ` ${t('deshacer.leidoTuyo', { nombre: d.tuyo })}` : '')
    : t('deshacer.vaciado');
  return (
    <div className="aviso-deshacer" role="status">
      <span>{texto}</span>
      <button className="deshacer" onClick={() => { tic(); onDeshacer(); }}>{t('deshacer.boton')}</button>
      <button className="x" aria-label={t('app.cerrar')} onClick={onCerrar}>×</button>
    </div>
  );
}
