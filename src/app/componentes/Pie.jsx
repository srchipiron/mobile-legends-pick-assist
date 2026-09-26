import { useState } from 'react';
import { Novedades } from './Novedades.jsx';
import { tPorDefecto } from './tPorDefecto.js';
import { ETIQUETAS_RANGO } from './SelectorDeRango.jsx';

/** A partir de cuántas horas los datos se enseñan como «viejos» (pie y cabecera). */
export const HORAS_DATOS_VIEJOS = 36;

/**
 * Pie fijo: versión de la app y cuándo se descargaron los datos, en la hora
 * LOCAL del móvil. Tocarlo abre el detalle; tocar la versión, las novedades.
 * Si faltan los counters, el motivo se enseña aquí: leer el JSON en un móvil
 * no es una opción razonable.
 */
export function Pie({ meta, generado, edadHoras, rango, rangoDatos = null, diasDatos = null, cov, t = tPorDefecto }) {
  const [abierto, setAbierto] = useState(false);
  const [novedades, setNovedades] = useState(false);
  const fecha = generado ? generado.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const viejo = edadHoras != null && edadHoras > HORAS_DATOS_VIEJOS;
  const alternar = () => setAbierto((v) => !v);
  const rel = meta?.diagnostics?.relations;

  return (
    <footer
      className={`pie ${viejo ? 'stale' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={abierto}
      onClick={alternar}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } }}
    >
      {abierto && meta && (
        <div className="pie-detalle">
          <div>{t('pie.datosApi', { fecha: fecha ?? t('pie.nunca') })}</div>
          <div>{t('pie.antiguedad', { horas: edadHoras != null ? `${Math.round(edadHoras)} h` : '—' })}</div>
          {/* La ventana y el rango que DECIDEN (ventana.js), no los de la
              ingesta: con la guarda activa decía «glory · 7 días» y los
              winrates eran de Mítico a 3. */}
          {rangoDatos && rangoDatos !== rango
            ? <div className="pie-aviso">{t('pie.rangoFuerza', { rango: ETIQUETAS_RANGO[rango] ?? rango ?? '—', usado: ETIQUETAS_RANGO[rangoDatos] ?? rangoDatos, dias: diasDatos ?? meta.days ?? '?' })}</div>
            : <div>{t('pie.rango', { rango: ETIQUETAS_RANGO[rango] ?? rango ?? '—', dias: diasDatos ?? meta.days ?? '?' })}</div>}
          <div>{t('pie.heroesConStats', { n: meta.heroCount ?? 0 })}</div>
          <div>{t('pie.rangos', { lista: meta.ranks?.join(', ') || t('pie.ninguno') })}</div>
          {meta.diagnostics?.rangos && Object.entries(meta.diagnostics.rangos)
            .filter(([, v]) => String(v).startsWith('fallo'))
            .map(([k, v]) => <div key={k} className="pie-aviso">{k}: {v}</div>)}
          {cov && !cov.conCounters && (
            <div className="pie-aviso">
              {t('pie.sinCounters')}
              {rel ? (
                <>
                  {' '}{t('pie.rutaCounters', { ruta: rel.rutaCounter ?? t('pie.noEncontrada') })}
                  {' '}{t('pie.intentos', { id: rel.conId, nombre: rel.porNombre, ok: rel.ok })}
                  {rel.errores?.map((e) => <div key={e} className="pie-api">{e}</div>)}
                  {rel.muestra && <div className="pie-api">{t('pie.respuesta')} {rel.muestra}</div>}
                </>
              ) : ` ${t('pie.sinDiagnostico')}`}
              {meta.diagnostics?.schema?.heroPaths && <div className="pie-api">{t('pie.rutasApi')} {meta.diagnostics.schema.heroPaths.join(' · ')}</div>}
            </div>
          )}
          <div>{t('pie.compilada', { fecha: new Date(__BUILD_TIME__).toLocaleString() })}</div>
          {meta.diagnostics?.base && <div className="pie-api">{meta.diagnostics.base}</div>}
        </div>
      )}
      <span className="pie-linea">
        {/* La versión abre las novedades; el resto del pie, el detalle. stopPropagation para que no hagan las dos. */}
        <button className="pie-version" onClick={(e) => { e.stopPropagation(); setNovedades(true); }} title={t('changelog.titulo')}>v{__APP_VERSION__}</button>
        {' · '}{fecha ? t('pie.datos', { fecha }) : t('pie.sinDatos')}
      </span>
      {novedades && <Novedades entradas={__CHANGELOG__} actual={__APP_VERSION__} onCerrar={() => setNovedades(false)} t={t} />}
    </footer>
  );
}
