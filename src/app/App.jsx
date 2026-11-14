import { useEffect, useMemo, useRef, useState } from 'react';
import { resolverNombres, planear, poolDe } from '../motor/draft.js';
import { buscar } from '../motor/nombres.js';
import { fundirPerfil, sanear } from '../motor/perfil.js';
import { paraComprobar } from '../motor/comprobacion.js';
import { diagnosticar } from '../motor/diagnostico/index.js';
import { ContextoT } from './i18n/contexto.js';
import { useAjustes } from './estado/useAjustes.js';
import { useDatos } from './estado/useDatos.js';
import { useDraft } from './estado/useDraft.js';
import { TOPES } from './estado/draftMovil.js';
import { usePersonal } from './estado/usePersonal.js';
import { useToken } from './estado/useToken.js';
import { useLicencia } from './estado/useLicencia.js';
import { useComunidad } from './estado/useComunidad.js';
import { useNovedades } from './estado/useNovedades.js';
import { useRecomendacion } from './estado/useRecomendacion.js';
import { useActualizacion } from './estado/useActualizacion.js';
import { useAhora } from './estado/useAhora.js';
import { useHojas } from './estado/useHojas.js';
import { useLector } from './estado/useLector.js';
import { useApuntar } from './estado/useApuntar.js';
import { ajustesParaLaTablet, pedirEstadoLector } from './lector.js';
import { leerEntorno, pedirPublicada } from './entorno.js';
import { ElegirLinea } from './pantallas/ElegirLinea.jsx';
import { FaseBaneos } from './pantallas/FaseBaneos.jsx';
import { FasePicks } from './pantallas/FasePicks.jsx';
import { SelectorDeHeroe } from './componentes/SelectorDeHeroe.jsx';
import { ETIQUETAS_RANGO } from './componentes/SelectorDeRango.jsx';
import { Pie } from './componentes/Pie.jsx';
import { AvisoLegal } from './componentes/AvisoLegal.jsx';
import { Diagnostico } from './componentes/Diagnostico.jsx';
import { Builds } from './componentes/Builds.jsx';
import { AvisoDeshacer } from './componentes/AvisoDeshacer.jsx';
import { ConfirmarVinculo } from './componentes/LectorTablet.jsx';
import { ApuntarPartida } from './componentes/ApuntarPartida.jsx';
import { HistorialPartidas } from './componentes/HistorialPartidas.jsx';
import { RevisarCapturas } from './componentes/RevisarCapturas.jsx';
import { BarraPC } from './componentes/BarraPC.jsx';
import { Analitica } from './componentes/Analitica.jsx';
import { Perfil } from './componentes/Perfil.jsx';
import { EditorDeMaestria } from './componentes/EditorDeMaestria.jsx';
import { Meta } from './componentes/Meta.jsx';
import { FichaDeHeroe } from './componentes/FichaDeHeroe.jsx';
import { Administracion, PuertaDeLicencia } from './componentes/Administracion.jsx';

/**
 * La app: estado (./estado), motor (por useRecomendacion) y pantallas. Aquí
 * no se calcula nada del draft: se resuelven los nombres a héroes, se decide
 * qué pantalla y qué hoja se ven y se cablean las acciones. Todas las
 * salidas tempranas van DESPUÉS de todos los hooks.
 */
export default function App() {
  const { t, linea, setLinea, rango, setRango, idioma, setIdioma, tacto, setTacto, lectorAuto, setLectorAuto, lectorTablet, setLectorTablet, vinculoPendiente, confirmarVinculo } = useAjustes();
  const carga = useDatos(rango);
  const { datos, meta, metaListo, pro, sinWinrates } = carga;
  const draft = useDraft();
  const personal = usePersonal();
  const ahora = useAhora();
  useActualizacion();

  const enemigos = useMemo(() => resolverNombres(datos, draft.enemigos), [datos, draft.enemigos]);
  const aliados = useMemo(() => resolverNombres(datos, draft.aliados), [datos, draft.aliados]);
  const baneos = useMemo(() => resolverNombres(datos, draft.baneos), [datos, draft.baneos]);
  const miPick = useMemo(() => (draft.miPick ? datos.porNombre.get(draft.miPick) ?? null : null), [datos, draft.miPick]);
  const { hoja, setHoja, soloPagina, ordenPick, abrir, cerrar, cerrarSuelta, deHojaAHoja } = useHojas({ datos, linea, enemigos, aliados, fase: draft.fase });

  // Un nombre guardado que ya no resuelve (la API renombró al héroe) contaba como cogido y no se podía quitar.
  const { limpiarDesconocidos } = draft;
  useEffect(() => {
    if (carga.catalogo && metaListo) limpiarDesconocidos(new Set(datos.heroes.map((h) => h.name)));
  }, [carga.catalogo, metaListo, datos, limpiarDesconocidos]);

  const rec = useRecomendacion({ datos, linea, enemigos, aliados, baneos, rivalMarcado: draft.rivalMarcado, miPick, partidas: personal.partidas });
  const poolDeLinea = useMemo(() => new Set(rec.pool.map((h) => h.name)), [rec.pool]);
  // Memorizado: el perfil comprime su código en un efecto sobre este objeto.
  const perfil = useMemo(
    () => ({ mastery: personal.maestria, partidas: personal.partidas, olvidadas: personal.olvidadas, rango: datos.rango, linea, idioma }),
    [personal.maestria, personal.partidas, personal.olvidadas, datos.rango, linea, idioma],
  );
  const token = useToken();
  const licencia = useLicencia({ escribir: token.activo ? token.escribir : null, leerRepositorio: token.activo ? token.leerDelRepositorio : null });
  const verAdmin = token.activo || licencia.esAdministrador;
  const comunidad = useComunidad({ perfil, escribir: token.activo ? token.escribir : null, ahora });
  const novedades = useNovedades();
  const porComprobar = useMemo(() => paraComprobar(personal.partidas, personal.comprobadas, { ahora }).length, [personal.partidas, personal.comprobadas, ahora]);

  /** Trae datos de otro sitio (otro móvil, la base de datos, la tablet): vienen fundidos, así que solo guarda. */
  const traerPerfil = (fundido) => {
    personal.importarPerfil(fundido);
    if (fundido.rango && !rango) setRango(fundido.rango);
    if (fundido.linea && !linea) setLinea(fundido.linea);
  };
  useEffect(() => {
    if (!comunidad.nuevas.length) return;
    traerPerfil(fundirPerfil(perfil, sanear({ partidas: comunidad.nuevas, mastery: {}, olvidadas: [] })));
    comunidad.nuevasFundidas();
  }, [comunidad.nuevas]);

  const ajustesTablet = useMemo(
    () => ajustesParaLaTablet({ linea, rango: datos.rango, idioma, maestria: personal.maestriaUsada, clave: comunidad.activo ? comunidad.clave : null }),
    [linea, datos.rango, idioma, personal.maestriaUsada, comunidad.activo, comunidad.clave],
  );
  const alApuntarLaTablet = useRef(null);
  const tablet = useLector({
    lectorTablet, setLectorTablet, lectorAuto, hoja, draft, pool: poolDeLinea, conCatalogo: !!carga.catalogo && datos.heroes.length > 0,
    ajustes: ajustesTablet, comunidad, onPartida: (p) => alApuntarLaTablet.current?.(p),
  });
  const apuntar = useApuntar({ datos, rec, draft, personal, perfil, linea, hoja, cerrar, vinculada: !!lectorTablet, tablet, traerPerfil });
  alApuntarLaTablet.current = apuntar.deLaTablet;

  /** Otra línea: un pick fijado A MANO que no se juega en ella se suelta (uno leído de tu fila se queda). */
  const cambiarLinea = (l) => {
    if (draft.miPick && !draft.miPickLeido && !poolDe(datos, l).some((h) => h.name === draft.miPick)) draft.fijarPick({ name: draft.miPick });
    setLinea(l);
    cerrar();
  };

  const [informe, setInforme] = useState(null);
  const lanzarDiagnostico = async () => {
    try {
      // El lector solo se pregunta si hay tablet: sin ella, ninguna petición.
      const [{ publicada, historial }, estadoLector] = await Promise.all([pedirPublicada(), lectorTablet ? pedirEstadoLector() : null]);
      setInforme(diagnosticar({
        datos, linea, maestria: personal.maestriaUsada, maestriaManual: personal.maestria, partidas: personal.partidas,
        draft: {
          enemigos, aliados, baneos, rival: rec.rival, ranking: rec.ranking, analisis: rec.analisis, partida: rec.partida, miPick: draft.miPick,
          robustez: rec.robustez, composicion: rec.composicion,
          estimaciones: rec.ranking.slice(0, 3).map((r) => ({ yo: r.heroe.name, p: r.p, puntos: r.puntos, terminos: r.terminos, vistos: aliados.length + enemigos.length + 1 })),
        },
        historial, pro,
        entorno: leerEntorno({
          version: __APP_VERSION__, buildTime: __BUILD_TIME__, rango: datos.rango, publicada,
          lector: lectorTablet ? { donde: lectorTablet.direccion, auto: lectorAuto, estado: estadoLector, ultimo: tablet.lector.ultimo, ahora: Date.now() } : null,
        }),
      }));
    } catch (err) {
      // Que el diagnóstico falle no deja la app en blanco: el error es la información.
      setInforme({ texto: `El diagnóstico ha fallado:\n${err?.stack ?? err}`, fallos: 1, avisos: 0 });
    }
  };

  // El selector: baneos (multi, tope 10), picks (UNA hoja con pestañas, multi) o tu pick (un toque, cierra).
  const esPicks = hoja === 'enemigos' || hoja === 'aliados';
  const seleccionadosPick = useMemo(() => new Set(hoja === 'aliados' ? draft.aliados : draft.enemigos), [hoja, draft.enemigos, draft.aliados]);
  const cogidosSelector = useMemo(() => {
    if (hoja === 'baneos') return new Set([...draft.enemigos, ...draft.aliados]);
    // Tu pick fijado no entra de compañero: eres tú.
    if (esPicks) return new Set([...(hoja === 'aliados' ? [...draft.enemigos, ...(draft.miPick ? [draft.miPick] : [])] : draft.aliados), ...draft.baneos]);
    return new Set([...draft.enemigos, ...draft.aliados, ...draft.baneos]);
  }, [hoja, esPicks, draft.enemigos, draft.aliados, draft.baneos, draft.miPick]);
  const seleccionadosBaneo = useMemo(() => new Set(draft.baneos), [draft.baneos]);
  const elegirEnSelector = (h) => {
    if (hoja === 'baneos') draft.alternarBaneo(h);
    else if (esPicks) { if (seleccionadosPick.has(h.name)) draft.quitar(hoja, h); else draft.anadir(hoja, h); }
    else { if (hoja === 'yo') draft.fijarPick(h); cerrar(); }
  };

  if (carga.error) return <div className="results"><p className="notice">{t('app.errorDatos', { error: carga.error })}</p></div>;
  if (!carga.catalogo) return <div className="results"><p className="empty-state">{t('app.cargando')}</p></div>;

  if (!linea && !soloPagina) {
    return (
      <ContextoT.Provider value={t}>
        <div className="app">
          <ElegirLinea valor={null} onElegir={setLinea} idioma={idioma} onIdioma={setIdioma} />
          <AvisoLegal idioma={idioma} onIdioma={setIdioma} />
        </div>
      </ContextoT.Provider>
    );
  }

  // De qué rango salen los winrates: el tuyo, salvo que la guarda de rango (ventana.js) haya caído a otro.
  const rangoDatos = datos.meta?.fuerza?.rango ?? datos.rango;
  const pie = (
    <Pie
      meta={meta} generado={carga.generado} edadHoras={carga.edadHoras} edadMatrizHoras={carga.edadMatrizHoras} rango={datos.rango} cov={rec.cov}
      rangoDatos={rangoDatos} diasDatos={datos.meta?.ventana?.dias} novedadesNuevas={novedades.nueva} onVerNovedades={novedades.marcarVista}
    />
  );
  const vinculo = vinculoPendiente ? <ConfirmarVinculo vinculo={vinculoPendiente} onResponder={confirmarVinculo} /> : null;
  // Con una hoja abierta no se enseña: la taparía.
  const deshacer = hoja ? null : apuntar.apuntada && !draft.deshacible ? (
    <AvisoDeshacer deshacible={{ tipo: 'apuntada', gane: apuntar.apuntada.gane, aMano: apuntar.apuntada.aMano }} onDeshacer={apuntar.deshacerApuntada} onCerrar={apuntar.cerrarAviso} />
  ) : (
    <AvisoDeshacer deshacible={draft.deshacible} onDeshacer={draft.deshacer} onCerrar={draft.olvidarDeshacer} />
  );
  const selector = ['enemigos', 'aliados', 'baneos', 'yo'].includes(hoja) ? (
    <SelectorDeHeroe
      heroes={hoja === 'yo' ? rec.ranking.map((c) => c.heroe) : esPicks && ordenPick ? ordenPick : datos.heroes}
      stats={datos.meta.stats} cogidos={cogidosSelector} onElegir={elegirEnSelector} onCerrar={cerrar}
      multi={hoja !== 'yo'} seleccionados={hoja === 'baneos' ? seleccionadosBaneo : esPicks ? seleccionadosPick : null}
      max={esPicks ? TOPES[hoja] : 10} cuenta={esPicks ? t('sheet.picksCuenta') : null}
      bandos={esPicks ? [
        { id: 'enemigos', etiqueta: t('app.enemigos'), n: draft.enemigos.length, max: TOPES.enemigos, activo: hoja === 'enemigos' },
        { id: 'aliados', etiqueta: t('app.tuEquipo'), n: draft.aliados.length, max: TOPES.aliados, activo: hoja === 'aliados' },
      ] : null}
      onBando={abrir} pool={hoja === 'baneos' ? poolDeLinea : null} sugeridos={hoja === 'baneos' ? rec.proximos.map((b) => b.heroe) : []}
      orden={hoja === 'baneos' ? 'ban' : hoja === 'yo' || (esPicks && ordenPick) ? 'dado' : 'pick'}
    />
  ) : null;
  // Las hojas, en las DOS fases y en el mismo hueco del árbol: si no, React las vuelve a montar al cambiar de fase.
  const hojas = (
    <>
      {informe && <Diagnostico resultado={informe} onCerrar={() => setInforme(null)} />}
      {hoja?.build && (
        <Builds heroe={hoja.build} linea={linea} builds={meta?.builds} equipment={meta?.equipment} talentos={meta?.talentos} enemigos={enemigos} plan={planear(datos, { yo: hoja.build, aliados, enemigos, linea, baneos, rivalMarcado: draft.rivalMarcado })} onCerrar={cerrar} />
      )}
      {hoja === 'linea' && <ElegirLinea valor={linea} onElegir={cambiarLinea} onCerrar={cerrar} />}
      {hoja === 'apuntar' && (
        <ApuntarPartida pool={rec.pool} heroes={datos.heroes} miPick={draft.miPick} recomendados={rec.ranking.slice(0, 3).map((r) => r.heroe.name)} onGuardar={(pick, gane) => apuntar.apuntarAMano(gane, pick)} onCerrar={cerrar} />
      )}
      {hoja === 'historial' && (
        <HistorialPartidas
          personal={personal} datos={datos} pool={rec.pool} perfil={perfil} token={token} comunidad={comunidad} onImportar={traerPerfil}
          onRevisar={() => deHojaAHoja('revisar')} onAnalisis={() => deHojaAHoja('analisis')} onCerrar={cerrar}
        />
      )}
      {hoja === 'revisar' && <RevisarCapturas personal={personal} datos={datos} comunidad={comunidad} perfil={perfil} onImportar={traerPerfil} onCerrar={soloPagina === 'revisar' ? cerrarSuelta : cerrar} />}
      {hoja === 'analisis' && <Analitica partidas={personal.partidas} maestria={personal.maestria} datos={datos} onCerrar={soloPagina === 'analisis' ? cerrarSuelta : cerrar} />}
      {hoja === 'perfil' && <Perfil datos={perfil} onImportar={traerPerfil} onCerrar={cerrar} />}
      {hoja === 'meta' && <Meta datos={datos} linea={linea} onFicha={(nombre) => deHojaAHoja({ ficha: nombre })} onCerrar={cerrar} />}
      {hoja?.ficha && <FichaDeHeroe datos={datos} nombre={hoja.ficha} onOtro={(nombre) => setHoja({ ficha: nombre })} onCerrar={cerrar} />}
      {hoja === 'admin' && verAdmin && <Administracion licencia={licencia} comunidad={comunidad} onCerrar={cerrar} />}
      {hoja === 'maestria' && <EditorDeMaestria pool={rec.pool} maestria={personal.maestria} onGuardar={personal.guardarMaestria} onCerrar={cerrar} />}
    </>
  );

  let pantalla;
  if (!licencia.pasa) pantalla = <PuertaDeLicencia licencia={licencia} />;
  else if (soloPagina && hoja === soloPagina) pantalla = <div className="solo-pagina">{hojas}</div>;
  else {
    const barra = <BarraPC abrir={abrir} onDiagnostico={lanzarDiagnostico} conCapturas={!!comunidad.config} fase={draft.fase} />;
    const lector = lectorTablet ? { ...tablet.lector, onLeer: () => tablet.copiar(), auto: lectorAuto, onAuto: setLectorAuto } : null;
    const comun = { idioma, onIdioma: setIdioma, tacto, onTacto: setTacto, sinWinrates, lector, pie, barra };
    const fase = draft.fase === 'baneos' ? (
      <FaseBaneos
        {...comun} baneos={baneos} proximos={rec.proximos} sugeridos={rec.baneosSugeridos} plan={rec.plan}
        tasaDe={(n) => buscar(datos.meta.stats, n)?.banRate ?? null} rangoDatos={ETIQUETAS_RANGO[rangoDatos] ?? rangoDatos ?? ''}
        onAbrirSelector={() => setHoja('baneos')} onBanear={(h) => draft.anadir('baneos', h)} onQuitar={(h) => draft.quitar('baneos', h)} onAPicks={() => draft.setFase('picks')}
      />
    ) : (
      <FasePicks
        {...comun} linea={linea} rango={datos.rango} onRango={setRango} meta={meta} datos={datos} metaListo={metaListo} edadHoras={carga.edadHoras} pro={pro}
        draft={draft} equipo={{ enemigos, aliados, baneos }} miPick={miPick} maestria={personal.maestriaUsada} rec={rec} abrir={abrir} ahora={ahora}
        onDiagnostico={lanzarDiagnostico} onResultado={apuntar.apuntarAMano} conTablet={!!lectorTablet && !!draft.desdeTablet}
        lectorTablet={lectorTablet} onLectorTablet={setLectorTablet} onAdministracion={verAdmin ? () => abrir('admin') : null} porComprobar={porComprobar}
      />
    );
    // Aviso, vínculo, selector y hojas en el MISMO hueco en las dos fases (si no, React los remonta).
    pantalla = <>{fase}{deshacer}{vinculo}{selector}{hojas}</>;
  }
  return <ContextoT.Provider value={t}>{pantalla}</ContextoT.Provider>;
}
