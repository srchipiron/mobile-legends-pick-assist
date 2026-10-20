import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { buscar } from '../../motor/nombres.js';
import { tic } from '../tacto.js';
import { winrateEnLinea, tiersVigentes } from '../../motor/draft.js';
import { porQueDetras } from '../../motor/ranking.js';
import { MINUTOS_PARA_RECORDAR } from '../estado/useDraft.js';
import { useAhora } from '../estado/useAhora.js';
import { IDIOMAS } from '../i18n/index.js';
import { Bando } from '../componentes/Bando.jsx';
import { Cara } from '../componentes/Imagen.jsx';
import { Composicion } from '../componentes/Composicion.jsx';
import { SelectorDeRango } from '../componentes/SelectorDeRango.jsx';
import { Analisis } from '../componentes/Analisis.jsx';
import { Tarjeta } from '../componentes/Tarjeta.jsx';
import { useDeslizar } from '../componentes/useDeslizar.js';
import { BotonLector, BotonVoz } from '../componentes/BotonLector.jsx';
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
 * @param d.draft       el hook useDraft (nombres, anadir, quitar, marcarRival, setFase, vaciarConDeshacer, quitarConDeshacer, fijarPick, posponerRecordatorio)
 * @param d.equipo      { enemigos, aliados, baneos } ya resueltos a héroes
 * @param d.miPick      tu pick fijado (héroe) o null
 * @param d.maestria    la maestría que ve el motor, para el filtro «mis héroes»
 * @param d.rec         lo que devuelve useRecomendacion
 * @param d.abrir       abre una hoja: 'enemigos' | 'aliados' | 'yo' | 'maestria' | 'historial' | 'perfil' | 'meta' | 'linea' | 'apuntar' | { build }
 * @param d.onResultado (gane) apunta la partida con tu pick fijado, desde el recordatorio
 */
export function FasePicks({ t, linea, rango, idioma, onIdioma, tacto, onTacto, onRango, meta, datos, metaListo, sinWinrates, edadHoras, pro, draft, equipo, miPick = null, maestria = {}, rec, abrir, onDiagnostico, onResultado, lector = null, onLeer = null, lectorAuto = false, onLectorAuto = null, vozCallada = false, onVoz = null, pie }) {
  const { enemigos, aliados, baneos } = equipo;
  const { ranking, rival, cov, pool, analisis, composicion, consejos, yo } = rec;
  const rivalAuto = rival.marcado ? null : rival.nombre;
  // La tier de mlbb.gg, solo si es de estas dos semanas (3.59.4).
  const tiers = tiersVigentes(meta);
  // Lo que puso el lector de la tablet (3.59.0): su hueco lleva un punto.
  // Menos lo que se metió a mano (3.60.1): quitado y vuelto a meter, el
  // nombre sigue en `lectura` y el punto decía que lo puso el lector.
  const leidos = useMemo(() => {
    const aMano = new Set(draft.aMano ?? []);
    return new Set([...(draft.lectura?.enemigos ?? []), ...(draft.lectura?.aliados ?? [])].filter((n) => !aMano.has(n)).concat(draft.lectura?.tuyo ? [draft.lectura.tuyo] : []));
  }, [draft.lectura, draft.aMano]);
  const anadirAliado = (h) => draft.anadir('aliados', h);
  // «Mis héroes»: solo los que llevas (maestría o partidas). Un héroe que
  // nunca has jugado entra en el ranking «como tu media», que es optimista;
  // el filtro es la versión honesta. No se recuerda: es cosa de este draft.
  const [soloMios, setSoloMios] = useState(false);
  const esMio = (h) => (buscar(maestria, h.name)?.games ?? 0) > 0;
  const mios = useMemo(() => ranking.filter((c) => (buscar(maestria, c.heroe.name)?.games ?? 0) > 0), [ranking, maestria]);
  const hayMios = mios.length > 0;
  // Por sinergia (3.60.0, pedido por Javi): las tarjetas ordenadas por cómo
  // encajan con tu equipo (el término de parejas). Solo cambia el ORDEN que
  // se ve: la nota y el número de cada tarjeta son los de siempre. No se
  // recuerda: es cosa de este draft, como «mis héroes».
  const [porSinergia, setPorSinergia] = useState(false);
  const conEquipo = aliados.length > 0;
  // Sin compañeros el botón no se ve: tampoco se queda puesto a escondidas
  // para volver solo con el primer compañero (3.60.1).
  useEffect(() => { if (!conEquipo) setPorSinergia(false); }, [conEquipo]);
  const filtrada = soloMios && hayMios ? mios : ranking;
  const lista = porSinergia && conEquipo ? [...filtrada].sort((a, b) => (b.terminos?.parejas ?? 0) - (a.terminos?.parejas ?? 0) || b.p - a.p) : filtrada;
  // Tu pick fijado va el primero: con ocho tarjetas a la vista, el nº22 no
  // se veía, y el consejo a los compañeros (que va tras la primera) es «si
  // tú vas con él». El número de la tarjeta sigue siendo su puesto real.
  const fijada = miPick ? lista.find((c) => c.heroe.name === miPick.name) : null;
  const visibles = fijada ? [fijada, ...lista.filter((c) => c !== fijada)] : lista;
  const enPantalla = visibles.slice(0, 8);
  // El consejo a los compañeros es «si tú vas con X»: va tras la tarjeta de X
  // (3.60.1; con «Sinergia» X podía no ser la primera). Si X no está entre
  // las ocho, tras la primera, que es donde se busca.
  const trasDe = Math.max(0, enPantalla.findIndex((c) => c.heroe.name === consejos.yo?.name));
  // Las tarjetas se deslizan a su puesto nuevo (3.22.0); con otra línea,
  // otro rango o el meta recién llegado es otro ranking y no se anima.
  const resultados = useRef(null);
  useDeslizar(resultados, `${linea}|${rango}|${metaListo}`);
  const fueraDeMios = soloMios && hayMios && ranking[0] && !esMio(ranking[0].heroe) ? ranking[0] : null;
  // ¿Cómo fue? Diez minutos después de fijar el pick (una partida dura más),
  // al volver a la app: Gané / Perdí / Más tarde.
  const ahora = useAhora();
  const plazo = MINUTOS_PARA_RECORDAR * 60 * 1000;
  // Diez minutos después de fijar tu pick, o de que el draft esté COMPLETO
  // sin pick fijado (3.9.0): la partida se está jugando igual, y sin
  // pregunta no se apuntaba. Sin pick fijado se pregunta por el nº1
  // (`rec.eleccion`), y «Otro héroe» abre «Apuntar partida».
  const preguntar = !!(rec.eleccion && (
    (miPick && draft.miPickDesde && ahora - draft.miPickDesde >= plazo)
    // «Más tarde» sin pick fijado apunta `recordarDesde` (3.37.0); el de un
    // draft anterior es más viejo que este `completoDesde` y no cuenta.
    || (!miPick && draft.completoDesde && ahora - Math.max(draft.completoDesde, draft.recordarDesde ?? 0) >= plazo)
  ));

  return (
    <div className="app">
      <aside className="draft">
        <div className="brand">
          {/* La línea que juegas, no «Roam»: hay cinco desde 1.0.0. */}
          <h1>{t(`linea.${linea}`)}</h1>
          <span className={`freshness ${edadHoras > HORAS_DATOS_VIEJOS ? 'stale' : ''}`}>
            {edadHoras != null ? `${Math.round(edadHoras)}h` : t('app.sinDatosMeta')}
          </span>
          {/* La versión arriba, a la vista: en el móvil el pie ya no flota. */}
          <span className="freshness version">v{__APP_VERSION__}</span>
        </div>

        <button className="bans-resumen" onClick={() => draft.setFase('baneos')} aria-label={t('fase.volverBaneos')}>
          <span>{t('fase.baneosResumen', { n: baneos.length, max: 10 })}</span>
          {baneos.map((h) => <Cara key={h.name} heroe={h} className="cara-ban" tam={22} />)}
          <span className="fase-cambiar">{t('fase.volverBaneos')}</span>
        </button>

        <Bando
          t={t} titulo={t('app.enemigos')} tipo="enemy" picks={enemigos} max={5}
          onAnadir={() => abrir('enemigos')} onQuitar={(h) => draft.quitarConDeshacer('enemigos', h)}
          marcado={draft.rivalMarcado} onMarcar={draft.marcarRival}
          pista={rivalAuto ? t('app.tuRival', { nombre: rivalAuto }) : t('app.marcarRival')}
          automatico={rivalAuto} leidos={leidos}
        />
        <Bando
          t={t} titulo={t('app.tuEquipo')} tipo="ally" picks={aliados} max={4}
          onAnadir={() => abrir('aliados')} onQuitar={(h) => draft.quitarConDeshacer('aliados', h)}
          yo={miPick} onYo={() => abrir('yo')} onQuitarYo={() => draft.fijarPick(miPick)} leidos={leidos}
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
            <SelectorDeRango t={t} rangos={meta?.ranks} valor={rango} onCambiar={onRango} rangoDeCruces={meta?.relaciones?.rango ?? meta?.rank} rangoDeBuilds={meta?.rank} />
          </div>
          {/* Lo que se toca UNA VEZ vive aquí dentro; fuera quedan los dos botones que se usan con una partida delante. */}
          <div className="tools">
            <button className="reset" onClick={() => abrir('maestria')}>{t('app.maestria')}</button>
            <button className="reset" onClick={() => abrir('historial')}>{t('hist.boton')}</button>
            <button className="reset" onClick={() => abrir('perfil')}>{t('perfil.boton')}</button>
            {/* Al final a propósito: las pruebas de navegador abren maestría e historial por posición. */}
            <button className="reset" onClick={() => abrir('meta')}>{t('meta.boton')}</button>
          </div>
          {/* «Leer solo» se enciende UNA vez: vive aquí desde 3.38.0. Fuera, en
              la fila de botones, partía la fila en dos a 360 px y empujaba la
              tarjeta nº1 48 px más abajo. Lo que hace (la última lectura) se
              sigue diciendo debajo de «Leer del juego». */}
          {onLeer && onLectorAuto && (
            <button className="reset lector-auto" style={{ marginTop: '14px' }} aria-pressed={lectorAuto} onClick={() => { tic(); onLectorAuto(!lectorAuto); }}>
              {t(lectorAuto ? 'lector.autoSi' : 'lector.autoNo')}
            </button>
          )}
          {onLeer && lectorAuto && onVoz && <BotonVoz callada={vozCallada} onVoz={onVoz} t={t} style={{ marginTop: '14px' }} />}
          <button className="reset" style={{ marginTop: '14px' }} onClick={onDiagnostico}>{t('app.diagnostico')}</button>
        </details>

        <div className="tools">
          <button className="reset" onClick={draft.vaciarConDeshacer}>{t('app.nuevoDraft')}</button>
          <button className="reset" disabled={!ranking.length} onClick={() => abrir('apuntar')}>{t('app.apuntar')}</button>
          {/* «Voz» en la fila solo con el draft completo: es cuando habla, y antes
              pasaría la fila a dos líneas y bajaría la nº1 (3.53.0). */}
          {onLeer && <BotonLector estado={lector?.estado} aviso={lector?.aviso} ultimo={lector?.ultimo} voz={lector?.voz} auto={lectorAuto} vozCallada={vozCallada} onVoz={draft.completoDesde ? onVoz : null} onLeer={onLeer} t={t} />}
        </div>
      </aside>

      <main className="results" ref={resultados}>
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
          {conEquipo && (
            <button className="filtro filtro-sinergia" aria-pressed={porSinergia} onClick={() => { tic(); setPorSinergia((v) => !v); }}>{t('filtro.sinergia')}</button>
          )}
          {hayMios && (
            <button className="filtro filtro-mios" aria-pressed={soloMios} onClick={() => setSoloMios((v) => !v)}>{t('filtro.mios', { n: mios.length })}</button>
          )}
        </div>
        {preguntar && (
          <section className="recordatorio" role="status">
            <p>{t(miPick ? 'recordatorio.pregunta' : 'recordatorio.preguntaSinFijar', { yo: miPick ? miPick.name : rec.eleccion.heroe.name })}</p>
            <button className="gane" onClick={() => onResultado?.(true)}>{t('registro.gane')}</button>
            <button onClick={() => onResultado?.(false)}>{t('registro.perdi')}</button>
            {!miPick && <button onClick={() => abrir('apuntar')}>{t('recordatorio.otroHeroe')}</button>}
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

        {enPantalla.map((c, i) => (
          <Fragment key={c.heroe.name}>
            <Tarjeta
              candidato={c}
              indice={ranking.indexOf(c)}
              t={t}
              stat={buscar(datos.meta.stats, c.heroe.name)}
              pro={pro?.heroes?.[c.heroe.name] ?? null}
              tier={tiers?.[c.heroe.name] ?? null}
              wrLinea={linea ? winrateEnLinea(datos, c.heroe, linea) : null}
              linea={linea}
              onBuild={meta ? (h) => abrir({ build: h }) : null /* también sin builds: la hoja lleva el plan (3.37.0) */}
              elegido={miPick?.name === c.heroe.name}
              onElegir={draft.fijarPick}
              detras={ranking.indexOf(c) > 0 ? porQueDetras(c, ranking[0]) : null}
              primero={ranking[0]?.heroe.name}
            />
            {i === trasDe && <ConsejoEquipo consejos={consejos.lista} yo={consejos.yo} onElegir={anadirAliado} t={t} />}
          </Fragment>
        ))}

        <Leyenda t={t} />
        <AvisoLegal t={t} idioma={idioma} onIdioma={onIdioma} idiomas={IDIOMAS} tacto={tacto} onTacto={onTacto} />
      </main>
      {pie}
    </div>
  );
}
