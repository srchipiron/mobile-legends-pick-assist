import { useState } from 'react';
import { titular } from '../../motor/diagnostico/index.js';
import { Hoja } from './Hoja.jsx';
import { urlDeIncidencia } from '../github.js';
import { tPorDefecto } from './tPorDefecto.js';

/** El informe del diagnóstico, listo para copiar, compartir o dejar como incidencia en GitHub. */
export function Diagnostico({ resultado, onCerrar, t = tPorDefecto }) {
  // `ok` copiado; `mano` (3.60.4): sin portapapeles se selecciona el texto y
  // el botón lo dice. Antes no cambiaba y no se sabía que había que copiar a mano.
  const [copiado, setCopiado] = useState(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resultado.texto);
      setCopiado('ok');
    } catch {
      const el = document.getElementById('selftest-texto');
      const sel = window.getSelection();
      const rango = document.createRange();
      rango.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(rango);
      // El camino viejo, que en algunos navegadores aún copia lo seleccionado.
      let hecho = false;
      try { hecho = document.execCommand?.('copy') === true; } catch { /* no hay */ }
      setCopiado(hecho ? 'ok' : 'mano');
    }
    setTimeout(() => setCopiado(null), 4000);
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
        <button className="close" style={{ color: 'var(--gold)' }} onClick={copiar}>{copiado === 'ok' ? t('diag.copiado') : copiado === 'mano' ? t('diag.copiarAMano') : t('diag.copiar')}</button>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </div>
      <pre id="selftest-texto" className="selftest">{resultado.texto}</pre>
    </Hoja>
  );
}
