import { useState } from 'react';
import { titular } from '../../motor/diagnostico/index.js';
import { Hoja } from './Hoja.jsx';
import { urlDeIncidencia } from '../github.js';
import { tPorDefecto } from './tPorDefecto.js';

/** El informe del diagnóstico, listo para copiar, compartir o dejar como incidencia en GitHub. */
export function Diagnostico({ resultado, onCerrar, t = tPorDefecto }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resultado.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: se selecciona el texto para copiar a mano.
      const el = document.getElementById('selftest-texto');
      const sel = window.getSelection();
      const rango = document.createRange();
      rango.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(rango);
    }
  };
  const compartir = () => navigator.share?.({ text: resultado.texto }).catch(() => {});

  /**
   * Deja el informe como incidencia en GitHub: se abre el formulario YA
   * RELLENO y tú solo confirmas, así no hace falta ninguna credencial dentro
   * de la app. El repositorio se deduce de la propia dirección (en Pages el
   * primer tramo de la ruta ES el nombre del repositorio).
   */
  const aGitHub = () => {
    const url = urlDeIncidencia({
      titulo: t('diag.tituloIncidencia', { fecha: new Date().toLocaleDateString(), titular: titular(resultado.fallos, resultado.avisos) }),
      etiquetas: ['diagnostico'],
      cuerpo: `${t('diag.cuerpoIncidencia')}\n\n\`\`\`\n${resultado.texto}\n\`\`\``,
    });
    window.open(url, '_blank', 'noopener');
  };

  return (
    <Hoja etiqueta={t('app.diagnostico')} onCerrar={onCerrar}>
      <div className="sheet-head">
        {/* El mismo titular que el texto: la cabecera y lo que copias dicen lo mismo. */}
        <strong style={{ flex: 1, alignSelf: 'center' }}>{titular(resultado.fallos, resultado.avisos)}</strong>
        {navigator.share && <button className="close" onClick={compartir}>{t('diag.enviar')}</button>}
        <button className="close" onClick={aGitHub}>{t('diag.aGitHub')}</button>
        <button className="close" style={{ color: 'var(--gold)' }} onClick={copiar}>{copiado ? t('diag.copiado') : t('diag.copiar')}</button>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </div>
      <pre id="selftest-texto" className="selftest">{resultado.texto}</pre>
    </Hoja>
  );
}
