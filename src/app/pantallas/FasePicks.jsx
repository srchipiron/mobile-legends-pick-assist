import { Fragment, useMemo, useState } from 'react';
import { buscar } from '../../motor/nombres.js';
import { MINUTOS_PARA_RECORDAR } from '../estado/useDraft.js';
import { useAhora } from '../estado/useAhora.js';
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
 * @param d.draft       el hook useDraft (nombres, anadir, quitar, marcarRival, setFase, reiniciar, fijarPick, posponerRecordatorio)
 * @param d.equipo      { enemigos, aliados, baneos } ya resueltos a héroes
 * @param d.miPick      tu pick fijado (héroe) o null
 * @param d.maestria    la maestría que ve el motor, para el filtro «mis héroes»
 * @param d.rec         lo que devuelve useRecomendacion
 * @param d.abrir       abre una hoja: 'enemigos' | 'aliados' | 'yo' | 'maestria' | 'historial' | 'perfil' | 'meta' | 'linea' | 'apuntar' | { build }
 * @param d.onResultado (gane) apunta la partida con tu pick fijado, desde el recordatorio
 */
export function FasePicks({ t, linea, rango, idioma, onIdioma, onRango, meta, datos, metaListo, sinWinrates, edadHoras, pro, draft, equipo, miPick = null, maestria = {}, rec, abrir, onDiagnostico, onResultado, pie }) {
  const { enemigos, aliados, baneos } = equipo;
  const { ranking, rival, cov, pool, analisis, composicion, consejos, yo } = rec;
  const rivalAuto = rival.marcado ? null : rival.nombre;
  const anadirAliado = (h) => draft.anadir('aliados', h);
  // «Mis héroes»: solo los que llevas (maestría o partidas). Un héroe que
  // nunca has jugado entra en el ranking «como tu media», que es optimista;
  // el filtro es la versión honesta. No se recuerda: es cosa de este draft.
  const [soloMios, setSoloMios] = useState(false);
  const esMio = (h) => (buscar(maestria, h.name)?.games ?? 0) > 0;
  const mios = useMemo(() => ranking.filter((c) => (buscar(maestria, c.heroe.name)?.games ?? 0) > 0), [ranking, maestria]);
  const hayMios = mios.length > 0;
  const lista = soloMios && hayMios ? mios : ranking;
  // Tu pick fijado va el primero: con ocho tarjetas a la vista, el nº22 no
  // se veía, y el consejo a los compañeros (que va tras la primera) es «si
  // tú vas con él». El número de la tarjeta sigue siendo su puesto real.
  const fijada = miPick ? lista.find((c) => c.heroe.name === miPick.name) : null;
  const visibles = fijada ? [fijada, ...lista.filter((c) => c !== fijada)] : lista;
  const fueraDeMios = soloMios && hayMios && ranking[0] && !esMio(ranking[0].heroe) ? ranking[0] : null;
  // ¿Cómo fue? Diez minutos después de fijar el pick (una partida dura más),
  // al volver a la app: Gané / Perdí / Más tarde.
  const ahora = useAhora();
  const preguntar = !!(miPick && draft.miPickDesde && ahora - draft.miPickDesde >= MINUTOS_PARA_RECORDAR * 60 * 1000);

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
        <Bando
          t={t} titulo={t('app.tuEquipo')} tipo="ally" picks={aliados} max={4}
          onAnadir={() => abrir('aliados')} onQuitar={(h) => draft.quitar('aliados', h)}
          yo={miPick} onYo={() => abrir('yo')} onQuitarYo={() => draft.fijarPick(miPick)}
        />
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
            {/* Al final a propósito: las pruebas de navegador abren maestría e historial por posición. */}
            <button className="reset" onClick={() => abrir('meta')}>{t('meta.boton')}</button>
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
          {/* La cobertura solo se dice cuando falta algo: con todo cubierto
              era una línea de números que no decidía nada y ocupaba el sitio
              del filtro. */}
          {cov.conDatos && (cov.conDatos < cov.total || cov.conCounters < cov.total) ? (
            <span className="freshness stale">{t('app.cobertura', { con: cov.conDatos, total: cov.total, counters: cov.conCounters })}</span>
          ) : !cov.conDatos ? (
            <span className="freshness">{t('app.enPool', { n: pool.length })}</span>
          ) : null}
          {hayMios && (
            <button className="filtro" aria-pressed={soloMios} onClick={() => setSoloMios((v) => !v)}>{t('filtro.mios', { n: mios.length })}</button>
          )}
        </div>
        {preguntar && (
          <section className="recordatorio" role="status">
            <p>{t('recordatorio.pregunta', { yo: miPick.name })}</p>
            <button className="gane" onClick={() => onResultado?.(true)}>{t('registro.gane')}</button>
            <button onClick={() => onResultado?.(false)}>{t('registro.perdi')}</button>
            <button onClick={draft.posponerRecordatorio}>{t('recordatorio.masTarde')}</button>
          </section>
        )}

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
        {yo && (aliados.length || enemigos.length) ? (
          <p className="estimacion-nota">{t('estimacion.resumen', { yo: yo.name, n: aliados.length + enemigos.length + 1 })}</p>
        ) : null}
        {fueraDeMios && <p className="fuera-de-mios">{t('filtro.fueraDeMios', { nombre: fueraDeMios.heroe.name, pct: Math.round(fueraDeMios.p * 100) })}</p>}

        {visibles.slice(0, 8).map((c, i) => (
          <Fragment key={c.heroe.name}>
            <Tarjeta
              candidato={c}
              indice={ranking.indexOf(c)}
              t={t}
              stat={buscar(datos.meta.stats, c.heroe.name)}
              pro={pro?.heroes?.[c.heroe.name] ?? null}
              tier={meta?.tiers?.tiers?.[c.heroe.name] ?? null}
              onBuild={meta?.builds ? (h) => abrir({ build: h }) : null}
              elegido={miPick?.name === c.heroe.name}
              onElegir={draft.fijarPick}
            />
            {i === 0 && <ConsejoEquipo consejos={consejos.lista} yo={consejos.yo} onElegir={anadirAliado} t={t} />}
          </Fragment>
        ))}

        <Leyenda t={t} />
        <AvisoLegal t={t} idioma={idioma} onIdioma={onIdioma} idiomas={IDIOMAS} />
      </main>
      {pie}
    </div>
  );
}
