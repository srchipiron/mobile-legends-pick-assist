import { useEffect, useMemo, useRef, useState } from 'react';
import { resolverNombres, probablesDelBando } from '../motor/draft.js';
import { buscar } from '../motor/nombres.js';
import { diagnosticar } from '../motor/diagnostico/index.js';
import { IDIOMAS } from './i18n/index.js';
import { useAjustes } from './estado/useAjustes.js';
import { useDatos } from './estado/useDatos.js';
import { useDraft, TOPES } from './estado/useDraft.js';
import { usePersonal } from './estado/usePersonal.js';
import { useEnvio } from './estado/useEnvio.js';
import { useRecomendacion } from './estado/useRecomendacion.js';
import { useActualizacion } from './estado/useActualizacion.js';
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
import { pedirLectura, pedirFinal, avisarVigilancia, fundirFinal, ensenarResultado, cuerpoDeFotogramas, nombresDeLectura, corregirLectura, dudasDeLectura, tocaLeerSolo, tocaVigilarFinal, FALLOS_DEL_LECTOR, INTERVALO_AUTO_MS, INTERVALO_AUTO_VACIO_MS, INTERVALO_FINAL_MS, DESHACER_APUNTADA_MS } from './lector.js';
import { draftCompleto } from './estado/useDraft.js';
import { useAhora } from './estado/useAhora.js';
import { ApuntarPartida } from './componentes/ApuntarPartida.jsx';
import { HistorialPartidas } from './componentes/HistorialPartidas.jsx';
import { Perfil } from './componentes/Perfil.jsx';
import { EditorDeMaestria } from './componentes/EditorDeMaestria.jsx';
import { Meta } from './componentes/Meta.jsx';

/**
 * La app: estado (hooks de ./estado), motor (src/motor, por useRecomendacion)
 * y pantallas. Aquí no se calcula nada del draft: se resuelven los nombres
 * guardados a héroes, se decide qué pantalla y qué hoja se ven, y se cablean
 * las acciones.
 */
export default function App() {
  const { t, linea, setLinea, rango, setRango, idioma, setIdioma, tacto, setTacto, lectorAuto, setLectorAuto } = useAjustes();
  const carga = useDatos(rango);
  const { datos, meta, metaListo, pro, error, generado, edadHoras, sinWinrates } = carga;
  const draft = useDraft();
  const personal = usePersonal();
  useActualizacion();

  // 'enemigos' | 'aliados' | 'baneos' | 'maestria' | 'historial' | 'perfil' | 'linea' | 'apuntar' | { build }
  const [hoja, setHoja] = useState(null);
  // El orden de las caras del selector de picks (3.17.0): se calcula al ABRIR
  // la hoja o al cambiar de pestaña y no se mueve mientras se toca. Lo que se
  // toca a contrarreloj no cambia de sitio (errores ya cometidos: los chips
  // del siguiente baneo desplazándose).
  const [ordenPick, setOrdenPick] = useState(null);
  const [informe, setInforme] = useState(null);
  // «Leer del juego» (3.25.0): leyendo o no, y qué decir si algo falla.
  const [lector, setLector] = useState({ estado: 'libre', aviso: null, ultimo: null });
  // El aviso de un fallo se va solo: lo que se lee con prisa no se queda tapando.
  useEffect(() => {
    if (!lector.aviso) return undefined;
    const reloj = setTimeout(() => setLector((l) => (l.aviso ? { ...l, aviso: null } : l)), 12000);
    return () => clearTimeout(reloj);
  }, [lector.aviso]);
  const cerrar = () => setHoja(null);

  const enemigos = useMemo(() => resolverNombres(datos, draft.enemigos), [datos, draft.enemigos]);
  const aliados = useMemo(() => resolverNombres(datos, draft.aliados), [datos, draft.aliados]);
  const abrir = (h) => {
    if (h === 'enemigos' || h === 'aliados') {
      setOrdenPick(probablesDelBando(datos, { equipo: h === 'aliados' ? aliados : enemigos, linea, bando: h }));
    }
    setHoja(h);
  };
  // Si el meta llega con la hoja de picks ya abierta (se tocó un hueco al
  // arrancar), la rejilla se quedaba alfabética hasta reabrirla. Solo con
  // `datos`: tocar un héroe NO reordena (lo que se toca a contrarreloj no se mueve).
  useEffect(() => {
    if (hoja === 'enemigos' || hoja === 'aliados') {
      setOrdenPick(probablesDelBando(datos, { equipo: hoja === 'aliados' ? aliados : enemigos, linea, bando: hoja }));
    }
  }, [datos]);
  const baneos = useMemo(() => resolverNombres(datos, draft.baneos), [datos, draft.baneos]);
  const miPick = useMemo(() => (draft.miPick ? datos.porNombre.get(draft.miPick) ?? null : null), [datos, draft.miPick]);

  // Un nombre guardado que ya no resuelve (la API renombró al héroe) era
  // invisible, inamovible y contaba como cogido. Se limpia al tener el catálogo.
  const { limpiarDesconocidos } = draft;
  useEffect(() => {
    if (!carga.catalogo || !metaListo) return;
    limpiarDesconocidos(new Set(datos.heroes.map((h) => h.name)));
  }, [carga.catalogo, metaListo, datos, limpiarDesconocidos]);

  const rec = useRecomendacion({
    datos, linea, enemigos, aliados, baneos, rivalMarcado: draft.rivalMarcado, miPick,
    maestria: personal.maestriaUsada, partidas: personal.partidas,
  });

  const cogidos = useMemo(() => new Set([...draft.enemigos, ...draft.aliados, ...draft.baneos]), [draft.enemigos, draft.aliados, draft.baneos]);
  const cogidosSinBaneos = useMemo(() => new Set([...draft.enemigos, ...draft.aliados]), [draft.enemigos, draft.aliados]);
  const seleccionadosBaneo = useMemo(() => new Set(draft.baneos), [draft.baneos]);
  // El selector de picks (3.16.0): una sola hoja para los dos bandos, que no
  // se cierra al tocar. En la pestaña de un bando, sus héroes se marcan y se
  // desmarcan; los del otro bando y los baneados no se pueden tocar.
  const esPicks = hoja === 'enemigos' || hoja === 'aliados';
  const seleccionadosPick = useMemo(() => new Set(hoja === 'aliados' ? draft.aliados : draft.enemigos), [hoja, draft.enemigos, draft.aliados]);
  const cogidosPick = useMemo(
    // Tu pick fijado no se puede meter de compañero: eres tú.
    () => new Set([...(hoja === 'aliados' ? [...draft.enemigos, ...(draft.miPick ? [draft.miPick] : [])] : draft.aliados), ...draft.baneos]),
    [hoja, draft.enemigos, draft.aliados, draft.baneos, draft.miPick],
  );
  const poolDeLinea = useMemo(() => new Set(rec.pool.map((h) => h.name)), [rec.pool]);
  // Memorizado: la hoja del perfil comprime el código en un efecto sobre
  // `datos`, y un objeto nuevo en cada render lo regeneraba cada vez.
  const datosPerfil = useMemo(
    () => ({ mastery: personal.maestria, partidas: personal.partidas, olvidadas: personal.olvidadas, rango: datos.rango, linea, idioma }),
    [personal.maestria, personal.partidas, personal.olvidadas, datos.rango, linea, idioma],
  );
  // La subida automática de partidas (3.10.0): con token, cada cambio se sube solo.
  const envio = useEnvio({ perfil: datosPerfil, t });

  const elegirEnSelector = (h) => {
    if (hoja === 'baneos') { draft.alternarBaneo(h); return; }
    if (esPicks) {
      if (seleccionadosPick.has(h.name)) draft.quitar(hoja, h); else draft.anadir(hoja, h);
      return;
    }
    if (hoja === 'yo') draft.fijarPick(h);
    cerrar();
  };

  // Los refs del lector (3.25.0+): si está leyendo ahora y cuándo fue la última.
  const leyendoAhora = useRef(false);
  const ultimaLectura = useRef(0);
  // El final de la partida (3.30.0): con «Leer solo», al completar el draft
  // se avisa al lector y ÉL captura (3.33.0: la app no está a la vista
  // mientras se juega en la tablet) del minuto 8 al 25, quedándose con las
  // pantallas que cambian (juego → resultado → vestíbulo) y leyendo la tabla
  // de resultado. Aquí se recogen cuando la app vuelve a estar a la vista,
  // se apunta la partida si vio el resultado (3.32.0) y los fotogramas se
  // suben solos al proyecto al apuntar o al empezar otro draft, para medir.
  const fotogramas = useRef([]);
  const vigilando = useRef(false);
  const ahora = useAhora();
  /** Sube lo vigilado (si hay) y lo olvida. Sin token no sube: se descarta. */
  const volcarFotogramas = (resultado = null) => {
    const lista = fotogramas.current;
    fotogramas.current = [];
    if (!lista.length || !envio.activo) return;
    envio.subirAparte({ ...cuerpoDeFotogramas({ fotogramas: lista, resultado, version: __APP_VERSION__ }), etiquetas: ['pantalla'] });
  };
  // Al dejar de estar completo el draft (nuevo draft, vaciar) se vuelcan sin resultado.
  const completoAntes = useRef(draft.completoDesde);
  useEffect(() => {
    if (completoAntes.current && !draft.completoDesde) volcarFotogramas(null);
    completoAntes.current = draft.completoDesde;
  }, [draft.completoDesde]);

  /**
   * Apunta la partida con la estimación que había delante para ESE héroe y
   * el draft entero (es lo que la hace medible después), y limpia el draft.
   */
  const guardarPartida = (pick, gane, { t = null, origen = null } = {}) => {
    const heroe = datos.porNombre.get(pick);
    const est = heroe ? rec.estimacionCon(heroe) : null;
    personal.apuntarPartida({
      ...(t ? { t } : {}), ...(origen ? { origen } : {}),
      pick, gane, rango: datos.rango,
      recomendados: rec.ranking.slice(0, 3).map((r) => r.heroe.name),
      ...(est ? { estimacion: est.p } : {}),
      bans: draft.baneos,
      draft: { linea, enemigos: draft.enemigos, aliados: draft.aliados, rival: rec.rival.nombre },
      // Lo que leyó el lector de la tablet: para medir cuánto acierta (3.25.0).
      // Sin los ids de sus capturas, que son del móvil.
      ...(draft.lectura ? { lector: { baneos: draft.lectura.baneos, enemigos: draft.lectura.enemigos, ...(draft.lectura.aliados ? { aliados: draft.lectura.aliados } : {}), ...(draft.lectura.tuyo ? { tuyo: draft.lectura.tuyo } : {}), ...(draft.lectura.dudas ? { dudas: draft.lectura.dudas } : {}), ...(draft.lectura.aprendizaje ? { aprendizaje: draft.lectura.aprendizaje } : {}) } } : {}),
    });
    // Y al lector, lo que había de verdad, para que aprenda (3.27.0).
    corregirLectura({ ids: draft.lectura?.ids ?? [], enemigos: draft.enemigos, baneos: draft.baneos });
    // Y el resultado con sus fotogramas, para que aprenda la palabra de la tabla (3.32.0): antes de volcarlos.
    ensenarResultado({ ids: fotogramas.current.map((f) => f.id), gane });
    // Los fotogramas del final, con el resultado (3.30.0): antes de reiniciar.
    volcarFotogramas(gane ? 'gane' : 'perdi');
    cerrar();
    draft.reiniciar();
  };

  // Apuntada sola (3.32.0): una por draft, y con vuelta atrás durante un rato
  // (olvida la partida y devuelve el draft tal cual estaba).
  const apuntadaSola = useRef(null);
  const [apuntada, setApuntada] = useState(null);
  const apuntarSola = (gane, t = Date.now()) => {
    const antes = draft.foto();
    const pick = rec.eleccion?.heroe.name ?? draft.miPick;
    if (!pick) return false;
    guardarPartida(pick, gane, { t, origen: 'lector' });
    setApuntada({ t, gane, antes });
    return true;
  };
  // El tic de abajo vive en un efecto que no se rehace con cada render: tiene
  // que llamar a la ÚLTIMA apuntarSola (con el ranking de ahora), no a la del
  // render en que se creó, cuando el meta aún no había llegado y no había
  // nº1 (cazado en la prueba de navegador de 3.33.0: el resultado llegaba y
  // no se apuntaba nada).
  const apuntarSolaAhora = useRef(apuntarSola);
  apuntarSolaAhora.current = apuntarSola;
  useEffect(() => {
    if (!apuntada) return undefined;
    const reloj = setTimeout(() => setApuntada((a) => (a === apuntada ? null : a)), DESHACER_APUNTADA_MS);
    return () => clearTimeout(reloj);
  }, [apuntada]);
  const deshacerApuntada = () => {
    if (!apuntada) return;
    personal.olvidarPartida(apuntada.t);
    draft.restaurar(apuntada.antes);
    setApuntada(null);
  };
  // Recoger el final de la partida que vigila el lector (3.33.0): va DESPUÉS de apuntarSola y guardarPartida, que usa.
  useEffect(() => {
    if (!tocaVigilarFinal({ auto: lectorAuto, completoDesde: draft.completoDesde })) return undefined;
    const tic = async () => {
      if (vigilando.current || document.visibilityState !== 'visible') return;
      vigilando.current = true;
      try {
        let f = await pedirFinal();
        // El lector no sabe de este draft (acaba de completarse, o se reinició): se le avisa, y contesta con lo que tenga.
        if (f.desde !== draft.completoDesde) f = (await avisarVigilancia({ desde: draft.completoDesde })) ?? f;
        const { suyo, fotogramas: lista, resultado, resultadoEn } = fundirFinal(fotogramas.current, f, { completoDesde: draft.completoDesde });
        if (!suyo) return;
        fotogramas.current = lista;
        // La tabla de resultado con una palabra conocida (3.32.0): la partida se apunta SOLA, con «Deshacer», fechada cuando el lector vio la tabla.
        if (resultado && apuntadaSola.current !== draft.completoDesde && apuntarSolaAhora.current(resultado === 'gane', resultadoEn ?? Date.now())) apuntadaSola.current = draft.completoDesde;
      } catch { /* sin lector: se vuelve a intentar en el siguiente tic */ }
      finally { vigilando.current = false; }
    };
    const reloj = setInterval(tic, INTERVALO_FINAL_MS);
    tic();
    return () => clearInterval(reloj);
  }, [lectorAuto, draft.completoDesde, ahora]);

  // Con el draft completo (cinco enemigos), el lector ya puede cruzar sus
  // capturas con lo que hay; al apuntar la partida se le vuelve a mandar
  // por si se corrigió algo después.
  const corregido = useRef(null);
  useEffect(() => {
    if (!draft.completoDesde || corregido.current === draft.completoDesde || !draft.lectura?.ids?.length) return;
    corregido.current = draft.completoDesde;
    corregirLectura({ ids: draft.lectura.ids, enemigos: draft.enemigos, baneos: draft.baneos })
      .then((r) => { if (r?.aprendido) draft.anotarAprendizaje({ aprendidos: r.aprendidos, sinEncontrar: r.sinEncontrar }); });
  }, [draft.completoDesde, draft.lectura, draft.enemigos, draft.baneos]);

  /** Trae los datos de otro dispositivo: vienen fundidos, así que solo guarda. */
  const traerPerfil = (fundido) => {
    personal.importarPerfil(fundido);
    if (fundido.rango && !rango) setRango(fundido.rango);
    if (fundido.linea && !linea) setLinea(fundido.linea);
  };

  const lanzarDiagnostico = async () => {
    try {
      const { publicada, historial } = await pedirPublicada();
      setInforme(diagnosticar({
        datos, linea,
        maestria: personal.maestriaUsada, maestriaManual: personal.maestria, partidas: personal.partidas,
        draft: {
          enemigos, aliados, baneos, rival: rec.rival, ranking: rec.ranking, analisis: rec.analisis, miPick: draft.miPick,
          robustez: rec.robustez, composicion: rec.composicion,
          estimaciones: rec.ranking.slice(0, 3).map((r) => ({ yo: r.heroe.name, p: r.p, puntos: r.puntos, terminos: r.terminos, vistos: aliados.length + enemigos.length + 1 })),
        },
        historial, pro,
        entorno: leerEntorno({ version: __APP_VERSION__, buildTime: __BUILD_TIME__, rango: datos.rango, publicada }),
      }));
    } catch (err) {
      // Que el diagnóstico falle no debe dejar la app en blanco: el propio error es información útil.
      setInforme({ texto: `El diagnóstico ha fallado:\n${err?.stack ?? err}`, fallos: 1, avisos: 0 });
    }
  };

  /**
   * Pide al lector de Termux lo que hay en la tablet y lo mete en el draft
   * (con Deshacer). Leyendo solo (`silencioso`), un fallo o una lectura
   * vacía no sacan aviso: se repite en unos segundos; queda en `ultimo`.
   */
  const leerDelJuego = async ({ silencioso = false } = {}) => {
    if (leyendoAhora.current) return;
    leyendoAhora.current = true;
    ultimaLectura.current = Date.now();
    setLector((l) => ({ ...l, estado: 'leyendo', aviso: silencioso ? l.aviso : null }));
    try {
      const lectura = await pedirLectura();
      const nombres = nombresDeLectura(lectura, datos.heroes);
      const n = draft.aplicarLectura({ ...nombres, id: typeof lectura.id === 'string' ? lectura.id : null, dudas: dudasDeLectura(lectura) });
      const algo = nombres.baneos.length + nombres.enemigos.length + nombres.aliados.length + (nombres.tuyo ? 1 : 0);
      const nuevos = n.baneos + n.enemigos + n.aliados + (n.tuyo ? 1 : 0);
      const aviso = nuevos ? null : (algo ? 'yaEstaba' : 'nada');
      setLector({ estado: 'libre', aviso: silencioso ? null : aviso, ultimo: { cuando: Date.now(), ok: true, nuevos } });
    } catch (e) {
      const tipo = FALLOS_DEL_LECTOR.includes(e?.tipo) ? e.tipo : 'error';
      setLector({ estado: 'libre', aviso: silencioso ? null : tipo, ultimo: { cuando: Date.now(), ok: false, tipo } });
    } finally {
      leyendoAhora.current = false;
    }
  };

  // Leyendo solo (3.28.0): mientras el draft no esté completo, la app a la
  // vista y sin hoja abierta, se pide una lectura cada pocos segundos. Con
  // el draft vacío, más despacio: es buscar si ha empezado uno.
  const completo = draftCompleto(draft);
  const vacio = !draft.enemigos.length && !draft.aliados.length && !draft.baneos.length;
  // Hasta que no hay catálogo los nombres leídos no resuelven a nadie: se espera.
  const conCatalogo = !!carga.catalogo && datos.heroes.length > 0;
  useEffect(() => {
    if (!conCatalogo || !tocaLeerSolo({ auto: lectorAuto, hoja, completo })) return undefined;
    const tic = () => { if (tocaLeerSolo({ auto: lectorAuto, visible: document.visibilityState === 'visible', hoja, completo, leyendo: leyendoAhora.current })) leerDelJuego({ silencioso: true }); };
    // Al (re)arrancar, una lectura ya, salvo que acabe de haber una: la
    // primera lectura cambia el draft de vacío a lleno y eso rearma esto.
    if (Date.now() - ultimaLectura.current >= INTERVALO_AUTO_MS) tic();
    const reloj = setInterval(tic, vacio ? INTERVALO_AUTO_VACIO_MS : INTERVALO_AUTO_MS);
    return () => clearInterval(reloj);
    // leerDelJuego cambia en cada render; lo que decide si se lee es lo de aquí.
  }, [conCatalogo, lectorAuto, hoja, completo, vacio]);

  if (error) return <div className="results"><p className="notice">{t('app.errorDatos', { error })}</p></div>;
  if (!carga.catalogo) return <div className="results"><p className="empty-state">{t('app.cargando')}</p></div>;

  // Primer arranque: sin línea no hay nada que recomendar.
  if (!linea) {
    return (
      <div className="app">
        <ElegirLinea valor={null} onElegir={setLinea} t={t} idioma={idioma} onIdioma={setIdioma} idiomas={IDIOMAS} />
        <AvisoLegal t={t} idioma={idioma} onIdioma={setIdioma} idiomas={IDIOMAS} />
      </div>
    );
  }

  // De qué rango salen los winrates y las tasas de ban: el tuyo, salvo que
  // la guarda de rango (ventana.js) haya caído a otro tras un reinicio de
  // temporada. Donde la app dice de dónde sale un número, dice ESTE.
  const rangoDatos = datos.meta?.fuerza?.rango ?? datos.rango;
  const etiquetaDatos = ETIQUETAS_RANGO[rangoDatos] ?? rangoDatos ?? '';
  const pie = (
    <Pie
      t={t} meta={meta} generado={generado} edadHoras={edadHoras} rango={datos.rango} cov={rec.cov}
      rangoDatos={rangoDatos} diasDatos={datos.meta?.ventana?.dias}
    />
  );
  // «Deshacer» tras vaciar el draft o quitar con la × (3.23.0). Con una hoja
  // abierta no se enseña: la hoja lo taparía y ahí se quita tocando otra vez.
  const deshacer = hoja ? null : apuntada && !draft.deshacible ? (
    <AvisoDeshacer deshacible={{ tipo: 'apuntada', gane: apuntada.gane }} onDeshacer={deshacerApuntada} onCerrar={() => setApuntada(null)} t={t} />
  ) : (
    <AvisoDeshacer deshacible={draft.deshacible} onDeshacer={draft.deshacer} onCerrar={draft.olvidarDeshacer} t={t} />
  );
  const selector = ['enemigos', 'aliados', 'baneos', 'yo'].includes(hoja) ? (
    <SelectorDeHeroe
      // Para tu pick: solo tu pool, en el orden del ranking.
      heroes={hoja === 'yo' ? rec.ranking.map((c) => c.heroe) : esPicks && ordenPick ? ordenPick : datos.heroes}
      stats={datos.meta.stats}
      // Para banear, los baneados no están «cogidos»: se tocan para quitarlos.
      cogidos={hoja === 'baneos' ? cogidosSinBaneos : esPicks ? cogidosPick : cogidos}
      onElegir={elegirEnSelector}
      onCerrar={cerrar}
      multi={hoja === 'baneos' || esPicks}
      seleccionados={hoja === 'baneos' ? seleccionadosBaneo : esPicks ? seleccionadosPick : null}
      max={esPicks ? TOPES[hoja] : 10}
      cuenta={esPicks ? t('sheet.picksCuenta') : null}
      bandos={esPicks ? [
        { id: 'enemigos', etiqueta: t('app.enemigos'), n: draft.enemigos.length, max: TOPES.enemigos, activo: hoja === 'enemigos' },
        { id: 'aliados', etiqueta: t('app.tuEquipo'), n: draft.aliados.length, max: TOPES.aliados, activo: hoja === 'aliados' },
      ] : null}
      onBando={abrir}
      pool={hoja === 'baneos' ? poolDeLinea : null}
      sugeridos={hoja === 'baneos' ? rec.proximos.map((b) => b.heroe) : []}
      orden={hoja === 'baneos' ? 'ban' : hoja === 'yo' || (esPicks && ordenPick) ? 'dado' : 'pick'}
      t={t}
    />
  ) : null;

  if (draft.fase === 'baneos') {
    return (
      <>
        <FaseBaneos
          t={t} baneos={baneos} proximos={rec.proximos} sugeridos={rec.baneosSugeridos} plan={rec.plan}
          tasaDe={(n) => buscar(datos.meta.stats, n)?.banRate ?? null} rangoDatos={etiquetaDatos}
          sinWinrates={sinWinrates} idioma={idioma} onIdioma={setIdioma} tacto={tacto} onTacto={setTacto}
          onAbrirSelector={() => setHoja('baneos')}
          onBanear={(h) => draft.anadir('baneos', h)}
          onQuitar={(h) => draft.quitar('baneos', h)}
          onAPicks={() => draft.setFase('picks')}
          lector={lector} onLeer={leerDelJuego} lectorAuto={lectorAuto} onLectorAuto={setLectorAuto} lectorAuto={lectorAuto} onLectorAuto={setLectorAuto}
          pie={pie}
        />
        {selector}
        {deshacer}
      </>
    );
  }

  return (
    <>
      <FasePicks
        t={t} linea={linea} rango={datos.rango} idioma={idioma} onIdioma={setIdioma} tacto={tacto} onTacto={setTacto} onRango={setRango}
        meta={meta} datos={datos} metaListo={metaListo} sinWinrates={sinWinrates} edadHoras={edadHoras} pro={pro}
        draft={draft} equipo={{ enemigos, aliados, baneos }} miPick={miPick} maestria={personal.maestriaUsada} rec={rec} abrir={abrir} onDiagnostico={lanzarDiagnostico}
        onResultado={(gane) => guardarPartida(rec.eleccion?.heroe.name ?? draft.miPick, gane)}
        lector={lector} onLeer={leerDelJuego} lectorAuto={lectorAuto} onLectorAuto={setLectorAuto}
        pie={pie}
      />
      {deshacer}
      {informe && <Diagnostico t={t} resultado={informe} onCerrar={() => setInforme(null)} />}
      {hoja?.build && (
        <Builds heroe={hoja.build} linea={linea} builds={meta?.builds} equipment={meta?.equipment} enemigos={enemigos} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'linea' && (
        <ElegirLinea valor={linea} onElegir={(l) => { setLinea(l); cerrar(); }} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'apuntar' && (
        <ApuntarPartida pool={rec.pool} heroes={datos.heroes} miPick={draft.miPick} recomendados={rec.ranking.slice(0, 3).map((r) => r.heroe.name)} onGuardar={guardarPartida} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'historial' && (
        <HistorialPartidas
          partidas={personal.partidas} maestria={personal.maestria} pool={rec.pool} perfil={datosPerfil} envio={envio}
          onOlvidar={personal.olvidarPartida} onCorregir={personal.corregirPartida}
          onAnadir={(heroe, gane) => personal.apuntarPartida({ pick: heroe, gane, previa: true, rango: datos.rango })}
          onCerrar={cerrar} t={t}
        />
      )}
      {hoja === 'perfil' && <Perfil datos={datosPerfil} onImportar={traerPerfil} onCerrar={cerrar} t={t} />}
      {hoja === 'meta' && <Meta datos={datos} linea={linea} onCerrar={cerrar} t={t} />}
      {hoja === 'maestria' && (
        <EditorDeMaestria pool={rec.pool} maestria={personal.maestria} onGuardar={personal.guardarMaestria} onCerrar={cerrar} t={t} />
      )}
      {selector}
    </>
  );
}
