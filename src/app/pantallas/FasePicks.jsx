import { Fragment } from 'react';
import { buscar } from '../../motor/nombres.js';
import { IDIOMAS } from '../i18n/index.js';
import { Bando } from '../componentes/Bando.jsx';
import { Cara } from '../componentes/Imagen.jsx';
import { Composicion } from '../componentes/Composicion.jsx';
import { SelectorDeRango } from '../componentes/SelectorDeRango.jsx';
import { Analisis } from '../componentes/Analisis.jsx';
import { Tarjeta } from '../componentes/Tarjeta.jsx';
import { ConsejoEquipo } from '../componentes/ConsejoEquipo.jsx';
import { Leyenda } from '../componentes/Desglose.jsx';
import { AvisoLegal } from '../componentes/AvisoLegal.jsx';
import { HORAS_DATOS_VIEJOS } from '../componentes/Pie.jsx';

/**
 * Fase 2: los picks. La tira de baneos arriba (se vuelve a ellos con un
 * toque), los dos bandos, y a la derecha (o debajo, en el móvil) el
 * análisis y las tarjetas. TU pick primero; el consejo para los demás va
 * después de él: encima empujaba la tarjeta nº1 fuera de la primera
 * pantalla en un móvil de 390×844.
 *
 * @param d.draft     el hook useDraft (nombres, anadir, quitar, marcarRival, setFase, reiniciar)
 * @param d.equipo    { enemigos, aliados, baneos } ya resueltos a héroes
 * @param d.rec       lo que devuelve useRecomendacion
 * @param d.abrir     abre una hoja: 'enemigos' | 'aliados' | 'maestria' | 'historial' | 'perfil' | 'linea' | 'apuntar' | { build }
 */
export function FasePicks({ t, linea, rango, idioma, onIdioma, onRango, meta, datos, metaListo, sinWinrates, edadHoras, pro, draft, equipo, rec, abrir, onDiagnostico, pie }) {
  const { enemigos, aliados, baneos } = equipo;
  const { ranking, rival, cov, pool, analisis, composicion, consejos } = rec;
  const rivalAuto = rival.marcado ? null : rival.nombre;
  const anadirAliado = (h) => draft.anadir('aliados', h);

  return (
    <div className="app">
      <aside className="draft">
        <div className="brand">
          {/* La línea que juegas, no «Roam»: hay cinco desde 1.0.0. */}
          <h1>{t(`linea.${linea}`)}</h1>
          <span className={`freshness ${edadHoras > HORAS_DATOS_VIEJOS ? 'stale' : ''}`}>
            {edadHoras != null ? `${Math.round(edadHoras)}h` : t('app.sinDatosMeta')}
          </span>
        </div>

        <button className="bans-resumen" onClick={() => draft.setFase('baneos')} aria-label={t('fase.volverBaneos')}>
          <span>{t('fase.baneosResumen', { n: baneos.length, max: 10 })}</span>
          {baneos.map((h) => <Cara key={h.name} heroe={h} className="cara-ban" tam={22} />)}
          <span className="fase-cambiar">{t('fase.volverBaneos')}</span>
        </button>

        <Bando
          t={t} titulo={t('app.enemigos')} tipo="enemy" picks={enemigos} max={5}
          onAnadir={() => abrir('enemigos')} onQuitar={(h) => draft.quitar('enemigos', h)}
          marcado={draft.rivalMarcado} onMarcar={draft.marcarRival}
          pista={rivalAuto ? t('app.tuRival', { nombre: rivalAuto }) : t('app.marcarRival')}
          automatico={rivalAuto}
        />
        <Bando t={t} titulo={t('app.tuEquipo')} tipo="ally" picks={aliados} max={4} onAnadir={() => abrir('aliados')} onQuitar={(h) => draft.quitar('aliados', h)} />
        <Composicion comp={composicion} t={t} />

        <details className="more">
          <summary>{t('app.ajustes')}</summary>
          <div className="side">
            <div className="side-label"><span>{t('app.tuLinea')}</span></div>
            <button className="reset" onClick={() => abrir('linea')}>{t(`linea.${linea}`)} · {t('app.cambiar')}</button>
          </div>
          <div className="side">
            <div className="side-label"><span>{t('app.rango')}</span></div>
            <SelectorDeRango t={t} rangos={meta?.ranks} valor={rango} onCambiar={onRango} rangoDeCruces={meta?.rank} />
          </div>
          {/* Lo que se toca UNA VEZ vive aquí dentro; fuera quedan los dos botones que se usan con una partida delante. */}
          <div className="tools">
            <button className="reset" onClick={() => abrir('maestria')}>{t('app.maestria')}</button>
            <button className="reset" onClick={() => abrir('historial')}>{t('hist.boton')}</button>
            <button className="reset" onClick={() => abrir('perfil')}>{t('perfil.boton')}</button>
          </div>
          <button className="reset" style={{ marginTop: '14px' }} onClick={onDiagnostico}>{t('app.diagnostico')}</button>
        </details>

        <div className="tools">
          <button className="reset" onClick={draft.reiniciar}>{t('app.nuevoDraft')}</button>
          <button className="reset" disabled={!ranking.length} onClick={() => abrir('apuntar')}>{t('app.apuntar')}</button>
        </div>
      </aside>

      <main className="results">
        <div className="results-head">
          <h2>{t('app.pick', { linea: t(`linea.${linea}`) })}</h2>
          <span className={`freshness ${cov.conDatos && cov.conDatos < cov.total ? 'stale' : ''}`}>
            {cov.conDatos ? t('app.cobertura', { con: cov.conDatos, total: cov.total, counters: cov.conCounters }) : t('app.enPool', { n: pool.length })}
          </span>
        </div>

        {sinWinrates ? (
          <div className="notice">
            {t('app.sinWinrates')}
            {meta?.diagnostics && (
              <details className="diag">
                <summary>{t('app.verPorQue')}</summary>
                <p>{t('api.base')}: <code>{meta.diagnostics.base ?? '—'}</code></p>
                {meta.diagnostics.schema && <p><code>{t('api.esquema', { n: meta.diagnostics.schema.pathCount, url: meta.diagnostics.schema.url })}</code></p>}
                {meta.diagnostics.routes && Object.entries(meta.diagnostics.routes).map(([k, v]) => <p key={k}><code>{k}: {v}</code></p>)}
                {meta.diagnostics.schema?.sample && !meta.diagnostics.routes && <p><code>{meta.diagnostics.schema.sample.join(' · ')}</code></p>}
                {meta.diagnostics.failed?.map((f) => <p key={f}><code>{f}</code></p>)}
              </details>
            )}
          </div>
        ) : null}
        {metaListo && !pool.length && <div className="notice">{t('app.sinPool', { linea: t(`linea.${linea}`) })}</div>}

        {/* El empate lo dice el análisis; la probabilidad va DENTRO de cada
            tarjeta (es la nota). Aquí solo queda el contexto: cuántos se ven,
            y que es un modelo. */}
        <Analisis frases={analisis} t={t} />
        {ranking[0] && (aliados.length || enemigos.length) ? (
          <p className="estimacion-nota">{t('estimacion.resumen', { yo: ranking[0].heroe.name, n: aliados.length + enemigos.length + 1 })}</p>
        ) : null}

        {ranking.slice(0, 8).map((c, i) => (
          <Fragment key={c.heroe.name}>
            <Tarjeta
              candidato={c}
              indice={i}
              t={t}
              stat={buscar(datos.meta.stats, c.heroe.name)}
              pro={pro?.heroes?.[c.heroe.name] ?? null}
              onBuild={meta?.builds ? (h) => abrir({ build: h }) : null}
            />
            {i === 0 && <ConsejoEquipo consejos={consejos} yo={c.heroe} onElegir={anadirAliado} t={t} />}
          </Fragment>
        ))}

        <Leyenda t={t} />
        <AvisoLegal t={t} idioma={idioma} onIdioma={onIdioma} idiomas={IDIOMAS} />
      </main>
      {pie}
    </div>
  );
}
