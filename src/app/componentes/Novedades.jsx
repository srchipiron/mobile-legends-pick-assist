import { useState } from 'react';
import { resumen as resumenDeCambio } from '../../../scripts/changelog.mjs';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Las novedades, al tocar la versión del pie. Resumidas: la primera frase de
 * cada cambio, y «ver todo» para el porqué. Vienen del CHANGELOG.md en la
 * compilación (el MISMO fichero que exige comprobar/version.mjs).
 */
export function Novedades({ entradas, actual, onCerrar, t = tPorDefecto }) {
  const [enteras, setEnteras] = useState(() => new Set());
  const alternar = (v) => setEnteras((prev) => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  return (
    <Hoja etiqueta={t('changelog.titulo')} onCerrar={onCerrar} alClicar={(e) => e.stopPropagation()}>
      <CabeceraDeHoja titulo={t('changelog.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="changelog">
        {entradas.map((e) => (
          <section key={e.version} className={e.version === actual ? 'actual' : ''}>
            <h3>
              v{e.version}
              {e.version === actual && <span className="inferred">{t('changelog.actual')}</span>}
              <button className="changelog-mas" onClick={() => alternar(e.version)}>{enteras.has(e.version) ? t('changelog.menos') : t('changelog.mas')}</button>
            </h3>
            <ul>{e.cambios.map((c, i) => <li key={i}>{enteras.has(e.version) ? c : resumenDeCambio(c)}</li>)}</ul>
          </section>
        ))}
        {!entradas.length && <p className="empty-state">{t('changelog.vacio')}</p>}
        <p className="build-nota">{t('changelog.idioma')}</p>
      </div>
    </Hoja>
  );
}
