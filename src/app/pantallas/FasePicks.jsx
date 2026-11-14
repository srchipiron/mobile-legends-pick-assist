import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { buscar } from '../../motor/nombres.js';
import { winrateEnLinea, tiersVigentes, tocadoPorElParche } from '../../motor/draft.js';
import { porQueDetras } from '../../motor/ranking.js';
import { tic } from '../tacto.js';
import { MINUTOS_PARA_RECORDAR } from '../estado/draftMovil.js';
import { Bando } from '../componentes/Bando.jsx';
import { Cara } from '../componentes/Imagen.jsx';
import { Composicion } from '../componentes/Composicion.jsx';
import { SelectorDeRango } from '../componentes/SelectorDeRango.jsx';
import { Analisis } from '../componentes/Analisis.jsx';
import { Tarjeta } from '../componentes/Tarjeta.jsx';
import { useDeslizar } from '../componentes/useDeslizar.js';
import { BotonLector, BotonLeerSolo } from '../componentes/BotonLector.jsx';
import { LectorTablet } from '../componentes/LectorTablet.jsx';
import { ConsejoEquipo } from '../componentes/ConsejoEquipo.jsx';
import { Leyenda } from '../componentes/Desglose.jsx';
import { AvisoLegal } from '../componentes/AvisoLegal.jsx';
import { HORAS_DATOS_VIEJOS } from '../componentes/Pie.jsx';
import { useT } from '../i18n/contexto.js';

/** [D] Tarjetas a la vista: la nº1 asoma en 360×640 y entera en 390×844 (medido). */
const TARJETAS = 8;

/**
 * Fase 2: los picks. Los baneos en una tira (se vuelve con un toque), los dos
 * bandos, «Ajustes» plegado y, a la derecha (debajo en el móvil), el análisis
 * y las tarjetas. Nada encima de la nº1 que no lo diga el draft: cada bloque
 * nuevo la empujó fuera de la primera pantalla.
 *
 * @param draft       useDraft
 * @param equipo      { enemigos, aliados, baneos } ya resueltos a héroes
 * @param maestria    solo para la vista «Domino» (los héroes con partidas): no cambia ningún número
 * @param onResultado (gane, elegido?) apunta la partida desde el recordatorio
 * @param conTablet   el draft es de la tablet: el recordatorio ofrece «No la terminé»
 */
export function FasePicks({ linea, rango, idioma, onIdioma, tacto, onTacto, onRango, meta, datos, metaListo, sinWinrates, edadHoras, pro, draft, equipo, miPick = null, maestria = {}, rec, abrir, ahora, onDiagnostico, onResultado, conTablet = false, lector = null, lectorTablet = null, onLectorTablet = null, onAdministracion = null, porComprobar = 0, pie, barra = null }) {
  const t = useT();
  const { enemigos, aliados, baneos } = equipo;
  const { ranking, rival, cov, pool, analisis, composicion, consejos, yo } = rec;
  const rivalAuto = rival.marcado ? null : rival.nombre;
  const tiers = tiersVigentes(meta);
  // El punto verde: lo que puso la tablet, menos lo que metiste tú.
  const leidos = useMemo(() => {
    const aMano = new Set(draft.aMano ?? []);
    const l = draft.lectura;
    return new Set([...(l?.enemigos ?? []), ...(l?.aliados ?? [])].filter((n) => !aMano.has(n)).concat(l?.tuyo ? [l.tuyo] : []));
  }, [draft.lectura, draft.aMano]);

  // «Domino»: una VISTA con solo los héroes que has jugado, con los mismos porcentajes. No se recuerda.
  const [soloDomino, setSoloDomino] = useState(false);
  const domina = (h) => (buscar(maestria, h.name)?.games ?? 0) > 0;
  const dominados = useMemo(() => ranking.filter((c) => domina(c.heroe)), [ranking, maestria]);
  // «Sinergia»: ordena por cómo encaja con tu equipo (las parejas), sin tocar nota ni número; sin compañeros se apaga.
  const [porSinergia, setPorSinergia] = useState(false);
  const conEquipo = aliados.length > 0;
  useEffect(() => { if (!conEquipo) setPorSinergia(false); }, [conEquipo]);
  const filtrada = soloDomino && dominados.length ? dominados : ranking;
  const lista = porSinergia && conEquipo ? [...filtrada].sort((a, b) => (b.terminos?.parejas ?? 0) - (a.terminos?.parejas ?? 0) || b.p - a.p) : filtrada;
  // Tu pick fijado va primero (con su puesto real), aunque el filtro lo deje fuera.
  const fijada = miPick ? (lista.find((c) => c.heroe.name === miPick.name) ?? ranking.find((c) => c.heroe.name === miPick.name) ?? null) : null;
  const enPantalla = (fijada ? [fijada, ...lista.filter((c) => c !== fijada)] : lista).slice(0, TARJETAS);
  // El consejo a los compañeros es «si tú vas con X»: tras la tarjeta de X (o tras la primera).
  const trasDe = Math.max(0, enPantalla.findIndex((c) => c.heroe.name === consejos.yo?.name));
  const fueraDeDominados = soloDomino && dominados.length && ranking[0] && !domina(ranking[0].heroe) ? ranking[0] : null;
  // Las tarjetas se deslizan a su puesto; con otra línea, otro rango o el meta recién llegado no se anima.
  const resultados = useRef(null);
  useDeslizar(resultados, `${linea}|${rango}|${metaListo}`);

  // ¿Cómo fue? A los MINUTOS_PARA_RECORDAR de fijar el pick o de completarse el draft («Más tarde» lo pospone).
  const plazo = MINUTOS_PARA_RECORDAR * 60 * 1000;
  const preguntar = !!(rec.eleccion && (
    (miPick && draft.miPickDesde && ahora - draft.miPickDesde >= plazo)
    || (!miPick && draft.completoDesde && ahora - Math.max(draft.completoDesde, draft.recordarDesde ?? 0) >= plazo)
  ));
  const nombreLinea = t(`linea.${linea}`);

  return (
    <div className="app">
      <aside className="draft">
        <div className="brand">
          <h1>{nombreLinea}</h1>
          <span className={`freshness ${edadHoras > HORAS_DATOS_VIEJOS ? 'stale' : ''}`}>{edadHoras != null ? `${Math.round(edadHoras)}h` : t('app.sinDatosMeta')}</span>
          <span className="freshness version">v{__APP_VERSION__}</span>
        </div>

        <button className="bans-resumen" onClick={() => draft.setFase('baneos')} aria-label={t('fase.volverBaneos')}>
          <span>{t('fase.baneosResumen', { n: baneos.length, max: 10 })}</span>
          {baneos.map((h) => <Cara key={h.name} heroe={h} className="cara-ban" tam={22} />)}
          <span className="fase-cambiar">{t('fase.volverBaneos')}</span>
        </button>

        <Bando
          titulo={t('app.enemigos')} tipo="enemy" picks={enemigos} max={5}
          onAnadir={() => abrir('enemigos')} onQuitar={(h) => draft.quitarConDeshacer('enemigos', h)}
          marcado={draft.rivalMarcado} onMarcar={draft.marcarRival}
          pista={rivalAuto ? t('app.tuRival', { nombre: rivalAuto }) : t('app.marcarRival')} automatico={rivalAuto} leidos={leidos}
        />
        <Bando
          titulo={t('app.tuEquipo')} tipo="ally" picks={aliados} max={4}
          onAnadir={() => abrir('aliados')} onQuitar={(h) => draft.quitarConDeshacer('aliados', h)}
          yo={miPick} onYo={() => abrir('yo')} onQuitarYo={() => draft.fijarPick(miPick)} leidos={leidos}
        />
        <Composicion comp={composicion} />

        <details className="more">
          <summary>{t('app.ajustes')}{porComprobar > 0 && <span className="por-comprobar" aria-label={t('comprobar.porComprobar', { n: porComprobar })}>{porComprobar}</span>}</summary>
          <div className="side">
            <div className="side-label"><span>{t('app.tuLinea')}</span></div>
            <button className="reset" onClick={() => abrir('linea')}>{nombreLinea} · {t('app.cambiar')}</button>
          </div>
          <div className="side">
            <div className="side-label"><span>{t('app.rango')}</span></div>
            <SelectorDeRango rangos={meta?.ranks} valor={rango} onCambiar={onRango} rangoDeCruces={meta?.relaciones?.rango ?? meta?.rank} rangoDeBuilds={meta?.rank} />
          </div>
          {/* [C] En este orden: las pruebas abren Maestría, Partidas, Perfil y Análisis por posición y Meta la última. */}
          <div className="tools">
            <button className="reset" onClick={() => abrir('maestria')}>{t('app.maestria')}</button>
            <button className="reset" onClick={() => abrir('historial')}>{t('hist.boton')}{porComprobar > 0 && <span className="por-comprobar" aria-label={t('comprobar.porComprobar', { n: porComprobar })}>{porComprobar}</span>}</button>
            <button className="reset" onClick={() => abrir('perfil')}>{t('perfil.boton')}</button>
            <button className="reset" onClick={() => abrir('analisis')}>{t('ana.boton')}</button>
            <button className="reset" onClick={() => abrir('meta')}>{t('meta.boton')}</button>
          </div>
          {/* «Leer solo» se enciende una vez: en la fila de botones partía la fila a 360 px. */}
          {lector && <BotonLeerSolo lector={lector} style={{ marginTop: '14px' }} />}
          {onLectorTablet && <LectorTablet vinculo={lectorTablet} onVinculo={onLectorTablet} />}
          <button className="reset" style={{ marginTop: '14px' }} onClick={onDiagnostico}>{t('app.diagnostico')}</button>
          {onAdministracion && <button className="reset" style={{ marginTop: '14px' }} onClick={onAdministracion}>{t('admin.titulo')}</button>}
        </details>

        <div className="tools">
          <button className="reset" onClick={draft.vaciarConDeshacer}>{t('app.nuevoDraft')}</button>
          <button className="reset" disabled={!ranking.length} onClick={() => abrir('apuntar')}>{t('app.apuntar')}</button>
          {lector && <BotonLector lector={lector} />}
        </div>
        {barra}
      </aside>

      <main className="results" ref={resultados}>
        <div className="results-head">
          <h2>{t('app.pick', { linea: nombreLinea })}</h2>
          {/* La cobertura solo se dice cuando falta algo. */}
          {cov.conDatos && (cov.conDatos < cov.total || cov.conCounters < cov.total) ? (
            <span className="freshness stale">{t('app.cobertura', { con: cov.conDatos, total: cov.total, counters: cov.conCounters })}</span>
          ) : !cov.conDatos ? (
            <span className="freshness">{t('app.enPool', { n: pool.length })}</span>
          ) : null}
          {conEquipo && <button className="filtro filtro-sinergia" aria-pressed={porSinergia} onClick={() => { tic(); setPorSinergia((v) => !v); }}>{t('filtro.sinergia')}</button>}
          {dominados.length > 0 && <button className="filtro filtro-domino" aria-pressed={soloDomino} onClick={() => { tic(); setSoloDomino((v) => !v); }}>{t('filtro.domino', { n: dominados.length })}</button>}
        </div>
        {preguntar && (
          <section className="recordatorio" role="status">
            <p>{t(miPick ? 'recordatorio.pregunta' : 'recordatorio.preguntaSinFijar', { yo: miPick ? miPick.name : rec.eleccion.heroe.name })}</p>
            <button className="gane" onClick={() => onResultado(true)}>{t('registro.gane')}</button>
            <button onClick={() => onResultado(false)}>{t('registro.perdi')}</button>
            {!miPick && <button onClick={() => abrir('apuntar')}>{t('recordatorio.otroHeroe')}</button>}
            {conTablet && <button onClick={() => onResultado(null)}>{t('recordatorio.noTerminada')}</button>}
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
                {meta.diagnostics.failed?.map((f) => <p key={f}><code>{f}</code></p>)}
              </details>
            )}
          </div>
        ) : null}
        {metaListo && !pool.length && <div className="notice">{t('app.sinPool', { linea: nombreLinea })}</div>}

        <Analisis frases={analisis} />
        {yo && (aliados.length || enemigos.length) ? <p className="estimacion-nota">{t('estimacion.resumen', { yo: yo.name, n: aliados.length + enemigos.length + 1 })}</p> : null}
        {fueraDeDominados && <p className="fuera-de-mios">{t('filtro.fueraDeDominados', { nombre: fueraDeDominados.heroe.name, pct: Math.round(fueraDeDominados.p * 100) })}</p>}
        {enPantalla.map((c, i) => (
          <Fragment key={c.heroe.name}>
            <Tarjeta
              candidato={c} indice={ranking.indexOf(c)} stat={buscar(datos.meta.stats, c.heroe.name)}
              pro={pro?.heroes?.[c.heroe.name] ?? null} tier={tiers?.[c.heroe.name] ?? null}
              wrLinea={linea ? winrateEnLinea(datos, c.heroe, linea) : null} parche={tocadoPorElParche(datos, c.heroe, Date.now())} linea={linea}
              onBuild={meta ? (h) => abrir({ build: h }) : null} elegido={miPick?.name === c.heroe.name} onElegir={draft.fijarPick}
              detras={ranking.indexOf(c) > 0 ? porQueDetras(c, ranking[0]) : null} primero={ranking[0]?.heroe.name}
            />
            {i === trasDe && <ConsejoEquipo consejos={consejos.lista} yo={consejos.yo} onElegir={(h) => draft.anadir('aliados', h)} />}
          </Fragment>
        ))}

        <Leyenda />
        <AvisoLegal idioma={idioma} onIdioma={onIdioma} tacto={tacto} onTacto={onTacto} />
      </main>
      {pie}
    </div>
  );
}
