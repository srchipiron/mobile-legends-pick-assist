import { useEffect, useMemo, useRef, useState } from 'react';
import { resolverNombres, probablesDelBando, planear, poolDe } from '../motor/draft.js';
import { buscar } from '../motor/nombres.js';
import { fundirPerfil, sanear } from '../motor/perfil.js';
import { diagnosticar } from '../motor/diagnostico/index.js';
import { IDIOMAS } from './i18n/index.js';
import { useAjustes } from './estado/useAjustes.js';
import { useDatos } from './estado/useDatos.js';
import { useDraft, TOPES } from './estado/useDraft.js';
import { usePersonal } from './estado/usePersonal.js';
import { useEnvio } from './estado/useEnvio.js';
import { useLicencia } from './estado/useLicencia.js';
import { useComunidad } from './estado/useComunidad.js';
import { useNovedades } from './estado/useNovedades.js';
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
import { ConfirmarVinculo } from './componentes/LectorTablet.jsx';
import { pedirLectura, pedirEstadoLector, pedirClaveDeLaTablet, pedirUltimaApk, buscarTabletUnaVez, sinLlegarALaTablet, parteDeLaTablet, mandarALaTablet, consejoParaLaTablet, resumenParaLaTablet, pedirFinal, avisarVigilancia, fundirFinal, guionTraducido, ensenarResultado, cuerpoDeFotogramas, cuerpoDePicks, callarVoz, recorteValido, faltoAlguien, nombresDeLectura, corregirLectura, dudasDeLectura, tocaLeerSolo, tocaVigilarFinal, lecturasEnPartida, tuyoDeTuLinea, LECTURAS_EN_PARTIDA, FALLOS_DEL_LECTOR, INTERVALO_AUTO_MS, INTERVALO_AUTO_VACIO_MS, INTERVALO_FINAL_MS, DESHACER_APUNTADA_MS } from './lector.js';
import { draftCompleto, DESHACER_MS } from './estado/useDraft.js';
import { crearDiferido } from './diferido.js';
import { useAhora } from './estado/useAhora.js';
import { ApuntarPartida } from './componentes/ApuntarPartida.jsx';
import { HistorialPartidas } from './componentes/HistorialPartidas.jsx';
import { RevisarCapturas } from './componentes/RevisarCapturas.jsx';
import { BarraPC } from './componentes/BarraPC.jsx';
import { Analitica } from './componentes/Analitica.jsx';
import { atajoDe, escribiendoEn } from './atajos.js';
import { Perfil } from './componentes/Perfil.jsx';
import { EditorDeMaestria } from './componentes/EditorDeMaestria.jsx';
import { Meta } from './componentes/Meta.jsx';
import { FichaDeHeroe } from './componentes/FichaDeHeroe.jsx';
import { Administracion, PuertaDeLicencia } from './componentes/Administracion.jsx';

/**
 * La app: estado (hooks de ./estado), motor (src/motor, por useRecomendacion)
 * y pantallas. Aquí no se calcula nada del draft: se resuelven los nombres
 * guardados a héroes, se decide qué pantalla y qué hoja se ven, y se cablean
 * las acciones.
 */
/** Las páginas que se abren solas desde un enlace (3.87.0 y 3.88.0): hash → hoja. */
const PAGINAS_SUELTAS = { '#capturas': 'revisar', '#analisis': 'analisis' };

export default function App() {
  const { t, linea, setLinea, rango, setRango, idioma, setIdioma, tacto, setTacto, lectorAuto, setLectorAuto, vozCallada, setVozCallada, lectorTablet, setLectorTablet, vinculoPendiente, confirmarVinculo } = useAjustes();
  // `t` es también el instante de una partida dentro de guardarPartida: allí se traduce con este.
  const traducir = t;
  const carga = useDatos(rango);
  const { datos, meta, metaListo, pro, error, generado, edadHoras, edadMatrizHoras, sinWinrates } = carga;
  const draft = useDraft();
  const personal = usePersonal();
  useActualizacion();

  // 'enemigos' | 'aliados' | 'baneos' | 'maestria' | 'historial' | 'revisar' | 'perfil' | 'linea' | 'apuntar' | { build }
  // Las páginas sueltas, para el ordenador: la app abierta con `#capturas`
  // (3.87.0) o `#analisis` (3.88.0) es SOLO esa hoja.
  const paginaDelHash = () => (typeof window !== 'undefined' ? PAGINAS_SUELTAS[window.location.hash] ?? null : null);
  // El hash se quita en cuanto se lee (3.87.1): si se quedaba en el historial, «atrás» tras
  // cerrar volvía a abrir la página. Antes de cualquier efecto: la hoja mete su entrada después.
  const quitarHash = () => { try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`); } catch { /* sin historial */ } };
  const [soloPagina, setSoloPagina] = useState(() => { const p = paginaDelHash(); if (p) quitarHash(); return p; });
  const [hoja, setHoja] = useState(() => soloPagina);
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
  useEffect(() => {
    const alCambiar = () => { const p = paginaDelHash(); if (p) { quitarHash(); setSoloPagina(p); setHoja(p); } };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  // Salir de una página suelta deja la app normal; el hash ya no está: ni recargar ni «atrás» vuelven a meterte.
  const cerrarSuelta = () => {
    setSoloPagina(null);
    setHoja(null);
  };

  const enemigos = useMemo(() => resolverNombres(datos, draft.enemigos), [datos, draft.enemigos]);
  const aliados = useMemo(() => resolverNombres(datos, draft.aliados), [datos, draft.aliados]);
  /**
   * De una hoja a otra (3.67.0, Meta → ficha): la que se cierra retira su
   * entrada del historial con un «atrás» que llega DESPUÉS, y cerraba la
   * nueva nada más abrirse. Se cierra, se espera a ese «atrás» y se abre.
   */
  const deHojaAHoja = (nueva) => {
    setHoja(null);
    let hecho = false;
    const abrirYa = () => { if (hecho) return; hecho = true; window.removeEventListener('popstate', abrirYa); clearTimeout(reloj); setHoja(nueva); };
    window.addEventListener('popstate', abrirYa);
    // Sin historial (o sin «atrás» que esperar), se abre igual.
    const reloj = setTimeout(abrirYa, 400);
  };
  const abrir = (h) => {
    if (h === 'enemigos' || h === 'aliados') {
      setOrdenPick(probablesDelBando(datos, { equipo: h === 'aliados' ? aliados : enemigos, linea, bando: h }));
    }
    setHoja(h);
  };
  // Las teclas del ordenador (3.87.0): E, A y B abren el selector de su bando sin soltar el teclado.
  const teclaRef = useRef(null);
  teclaRef.current = (e) => {
    if (!linea || soloPagina) return;
    // Solo con el draft a la vista (3.87.1): el Diagnóstico, las novedades del pie, el aviso del QR o la
    // puerta de la licencia no son `hoja`, y E abría el selector encima de ellos.
    const tapado = !document.querySelector('.app .draft') || !!document.querySelector('.sheet, [role="dialog"]');
    const destino = atajoDe({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, enCampo: escribiendoEn(e.target) }, { hoja: hoja ?? (tapado ? 'otra' : null), fase: draft.fase });
    if (!destino) return;
    e.preventDefault();
    abrir(destino);
  };
  useEffect(() => {
    const alPulsar = (e) => teclaRef.current?.(e);
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);
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
  // Las claves de invitación (3.65.0). La administración solo se ve con el
  // token de la subida (el móvil de Javi) o ya con la clave de administrador.
  const licencia = useLicencia({ escribir: envio.activo ? envio.escribir : null, leerRepositorio: envio.activo ? envio.leerDelRepositorio : null });
  const verAdmin = envio.activo || licencia.esAdministrador;
  // La base de datos de partidas de todos (3.69.0): con la casilla puesta, las tuyas se suben solas con tu clave.
  const comunidad = useComunidad({ perfil: datosPerfil, escribir: envio.activo ? envio.escribir : null });
  const novedades = useNovedades();

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
  // La tablet no acepta el código (3.61.0): no se lee solo hasta volver a vincular.
  const codigoMalo = useRef(false);
  useEffect(() => { codigoMalo.current = false; }, [lectorTablet]);
  const ultimaLectura = useRef(0);
  // Lecturas seguidas con la tablet ya en partida (3.46.0).
  const enPartidaSeguidas = useRef(0);
  // El final de la partida (3.30.0): con «Leer solo», al completar el draft
  // se avisa al lector y ÉL captura (3.33.0: la app no está a la vista
  // mientras se juega en la tablet) del minuto 8 al 25, quedándose con las
  // pantallas que cambian (juego → resultado → vestíbulo) y leyendo la tabla
  // de resultado. Aquí se recogen cuando la app vuelve a estar a la vista,
  // se apunta la partida si vio el resultado (3.32.0) y los fotogramas se
  // suben solos al proyecto al apuntar o al empezar otro draft, para medir.
  const fotogramas = useRef([]);
  const vigilando = useRef(false);
  // Los consejos en directo (3.44.0): lo último que se le mandó al lector
  // (draft y huella del guion), cuánto duró la partida según él y si su voz
  // funciona (sin Termux:API no suena y se dice debajo del botón).
  const guionEnviado = useRef(null);
  // La voz callada (3.53.0): el tic de la vigilancia la lee por referencia (no reinicia el efecto).
  const vozCalladaActual = useRef(vozCallada);
  vozCalladaActual.current = vozCallada;
  /** «Voz: sí / callada»: se guarda y se le dice al lector en el acto; si no contesta, se lo dice el siguiente aviso. */
  const cambiarVoz = (callar) => { setVozCallada(callar); vozCalladaActual.current = callar; callarVoz({ callar }); };
  const duracionFinal = useRef({ desde: null, duracion: null });
  const [vozLector, setVozLector] = useState(null);
  const lectorConVoz = useMemo(() => ({ ...lector, voz: vozLector }), [lector, vozLector]);
  const ahora = useAhora();
  /** Sube unas pantallas (si hay). Sin token no sube: se descartan. */
  const envioActual = useRef(envio);
  envioActual.current = envio;
  const subirFotogramas = (lista, resultado = null) => {
    if (!lista.length || !envioActual.current.activo) return;
    envioActual.current.subirAparte({ ...cuerpoDeFotogramas({ fotogramas: lista, resultado, version: __APP_VERSION__ }), etiquetas: ['pantalla'] });
  };
  /** Las pantallas vigiladas, fuera de la lista (las de este draft ya no se vuelven a subir). */
  const sacarFotogramas = () => { const lista = fotogramas.current; fotogramas.current = []; return lista; };
  // Lo que un «Deshacer» aún puede echar atrás espera a su plazo (3.42.0, diferido.js).
  const diferido = useRef(null);
  if (!diferido.current) diferido.current = crearDiferido();
  // Si la app se va (se cierra, se recarga), lo pendiente sale antes.
  useEffect(() => {
    const salir = () => diferido.current.ejecutar();
    window.addEventListener('pagehide', salir);
    return () => window.removeEventListener('pagehide', salir);
  }, []);
  // Al dejar de estar completo el draft (nuevo draft, vaciar) se suben sin
  // resultado, pero pasado el plazo del «Deshacer»: si vuelve el MISMO draft,
  // vuelven sus pantallas y no se ha subido nada (3.42.0).
  const completoAntes = useRef(draft.completoDesde);
  useEffect(() => {
    const antes = completoAntes.current;
    if (antes && !draft.completoDesde) {
      const lista = sacarFotogramas();
      if (lista.length) diferido.current.programar(antes, { lista }, DESHACER_MS + 1000, ({ lista: l }) => subirFotogramas(l, null));
    } else if (draft.completoDesde) {
      const vuelve = diferido.current.cancelar(draft.completoDesde);
      if (vuelve) fotogramas.current = [...vuelve.lista, ...fotogramas.current];
    }
    completoAntes.current = draft.completoDesde;
  }, [draft.completoDesde]);

  /**
   * Apunta la partida con la estimación que había delante para ESE héroe y
   * el draft entero (es lo que la hace medible después), y limpia el draft.
   */
  // El draft (su `completoDesde`) cuya partida ya se apuntó: la vigilancia no la apunta otra vez.
  const apuntadaSola = useRef(null);
  const guardarPartida = (pick, gane, { t = null, origen = null, deshacible = false, supuesto = false } = {}) => {
    const heroe = datos.porNombre.get(pick);
    const est = heroe ? rec.estimacionCon(heroe) : null;
    personal.apuntarPartida({
      ...(t ? { t } : {}), ...(origen ? { origen } : {}),
      // Sin tu pick fijado ni leído, el pick es el nº1 supuesto (3.81.2): no cuenta como «siguió el consejo».
      ...(supuesto ? { supuesto: true } : {}),
      pick, gane, rango: datos.rango,
      recomendados: rec.ranking.slice(0, 3).map((r) => r.heroe.name),
      ...(est ? { estimacion: est.p } : {}),
      bans: draft.baneos,
      draft: { linea, enemigos: draft.enemigos, aliados: draft.aliados, rival: rec.rival.nombre },
      // Cuánto duró (lo mide el lector) y lo que se preveía para cada duración
      // con ESE héroe (3.44.0): con las dos se mide si las fases aciertan en tus partidas.
      ...(duracionFinal.current.desde === draft.completoDesde && duracionFinal.current.duracion ? { duracion: duracionFinal.current.duracion } : {}),
      ...(rec.yo?.name === pick && rec.partida?.fases?.puntos ? { fases: rec.partida.fases.puntos.map((x) => x.p) } : {}),
      // Lo que leyó el lector de la tablet: para medir cuánto acierta (3.25.0).
      // Sin los ids de sus capturas, que son del móvil.
      ...(draft.lectura ? { lector: { baneos: draft.lectura.baneos, enemigos: draft.lectura.enemigos, ...(draft.lectura.aliados ? { aliados: draft.lectura.aliados } : {}), ...(draft.lectura.tuyo ? { tuyo: draft.lectura.tuyo } : {}), ...(draft.lectura.dudas ? { dudas: draft.lectura.dudas } : {}), ...(draft.lectura.aprendizaje ? { aprendizaje: draft.lectura.aprendizaje } : {}), ...(draft.lectura.ms ? { ms: draft.lectura.ms } : {}), ...(draft.lectura.msCaptura ? { msCaptura: draft.lectura.msCaptura } : {}), ...(draft.lectura.formatos ? { formatos: draft.lectura.formatos } : {}) } } : {}),
    });
    // Y a la tablet, el resumen para su notificación (3.62.0): con quién, si era el consejo y cómo vas.
    const ultimas = [{ gane }, ...personal.partidas.filter((p) => !p.previa).slice(0, 19)];
    mandarALaTablet({ resumen: resumenParaLaTablet({ t: t ?? Date.now(), pick, gane, recomendados: rec.ranking.slice(0, 3).map((r) => r.heroe.name), estimacion: est?.p ?? null, ultimas }, traducir) });
    // Y al lector, lo que había de verdad, para que aprenda (3.27.0).
    // `tuyo` solo si es un hecho (3.60.4): apuntada sola sin pick fijado, el
    // pick es el nº1 SUPUESTO, y el lector aprendía tu cara con ese nombre.
    corregirLectura({ ids: draft.lectura?.ids ?? [], enemigos: draft.enemigos, baneos: draft.baneos, aliados: draft.aliados, tuyo: supuesto ? null : pick });
    // Y el resultado con sus fotogramas, para que aprenda la palabra de la
    // tabla (3.32.0), y los fotogramas al proyecto con el resultado (3.30.0).
    // Si la partida se apuntó sola, después del plazo de su «Deshacer»
    // (3.42.0): deshecha, el lector no aprende nada de ella.
    const lista = sacarFotogramas();
    const ensenarYSubir = ({ lista: l, gane: g, desde: d }) => {
      // Con `desde`, el lector deja de vigilar y de hablar de esa partida (3.44.1).
      ensenarResultado({ ids: l.map((f) => f.id), gane: g, desde: d });
      subirFotogramas(l, g ? 'gane' : 'perdi');
    };
    if (deshacible && draft.completoDesde) diferido.current.programar(draft.completoDesde, { lista, gane, desde: draft.completoDesde }, DESHACER_APUNTADA_MS + 1000, ensenarYSubir);
    else ensenarYSubir({ lista, gane, desde: draft.completoDesde });
    // Este draft ya está apuntado (a mano o sola): un tic de la vigilancia
    // que estuviera esperando al lector no lo vuelve a apuntar (3.37.0).
    if (draft.completoDesde) apuntadaSola.current = draft.completoDesde;
    // Apuntada sola, solo se cierran los selectores del draft: la hoja que
    // estés usando no se cierra bajo el dedo (3.60.2).
    if (origen !== 'lector' || ['enemigos', 'aliados', 'baneos', 'yo', 'apuntar'].includes(hoja)) cerrar();
    draft.reiniciar();
  };

  // Apuntada sola (3.32.0): una por draft, y con vuelta atrás durante un rato
  // (olvida la partida y devuelve el draft tal cual estaba).
  const [apuntada, setApuntada] = useState(null);
  const apuntarSola = (gane, t = Date.now()) => {
    const antes = draft.foto();
    // Tu pick fijado manda aunque no esté en el ranking de tu línea (3.40.0):
    // con el nº1 delante se apuntaba otro héroe (el lector fija tu fila, sea de la línea que sea).
    const pick = draft.miPick ?? rec.eleccion?.heroe.name;
    if (!pick) return false;
    guardarPartida(pick, gane, { t, origen: 'lector', deshacible: true, supuesto: !draft.miPick });
    setApuntada({ t, gane, antes });
    return true;
  };
  // Gané/Perdí a mano también se pueden deshacer (3.60.7): sin aviso, un
  // toque equivocado solo se arreglaba buscando la partida en Ajustes, que
  // en la fase de baneos (adonde vuelve la app) ni sale.
  const apuntarAMano = (gane, elegido = null) => {
    const pick = elegido ?? draft.miPick ?? rec.eleccion?.heroe.name;
    if (!pick) return;
    const t = Date.now(), antes = draft.foto();
    guardarPartida(pick, gane, { t, deshacible: true });
    setApuntada({ t, gane, antes, aMano: true });
  };
  // El tic de abajo vive en un efecto que no se rehace con cada render: tiene
  // que llamar a la ÚLTIMA apuntarSola (con el ranking de ahora), no a la del
  // render en que se creó, cuando el meta aún no había llegado y no había
  // nº1 (cazado en la prueba de navegador de 3.33.0: el resultado llegaba y
  // no se apuntaba nada).
  const apuntarSolaAhora = useRef(apuntarSola);
  apuntarSolaAhora.current = apuntarSola;
  // El draft de AHORA, para el tic de la vigilancia, que espera al lector.
  const completoActual = useRef(draft.completoDesde);
  completoActual.current = draft.completoDesde;
  const draftActual = useRef(draft);
  draftActual.current = draft;
  // El guion de AHORA (el héroe fijado puede cambiar con el draft completo).
  // Con tu pick fijado fuera del ranking de tu línea (el lector fija tu fila,
  // sea de la línea que sea), el plan es el del nº1: la voz hablaría de otro
  // héroe, y mejor callar (3.44.1). Y sin los datos del día todavía (recién
  // abierta la app), el guion está vacío y no vale como guion: `listo`.
  const planDelPick = draft.miPick && rec.yo?.name !== draft.miPick ? null : rec.partida;
  const directo = useMemo(() => ({ ...guionTraducido(planDelPick, t, idioma), listo: metaListo }), [planDelPick, t, idioma, metaListo]);
  const directoActual = useRef(directo);
  directoActual.current = directo;
  useEffect(() => {
    if (!apuntada) return undefined;
    const reloj = setTimeout(() => setApuntada((a) => (a === apuntada ? null : a)), DESHACER_APUNTADA_MS);
    return () => clearTimeout(reloj);
  }, [apuntada]);
  const deshacerApuntada = () => {
    if (!apuntada) return;
    personal.olvidarPartida(apuntada.t);
    // Lo que iba a enseñarse al lector y subirse no sale y sus pantallas
    // vuelven (3.42.0): lo hace el efecto de `completoDesde` al volver el draft.
    // Con la marca guardada en el draft: tras una recarga (la app se
    // actualiza sola) no se vuelve a apuntar lo que deshiciste (3.37.0).
    draft.restaurar({ ...apuntada.antes, apuntadaSola: apuntada.antes.completoDesde });
    setApuntada(null);
  };
  // Recoger el final de la partida que vigila el lector (3.33.0): va DESPUÉS de apuntarSola y guardarPartida, que usa.
  useEffect(() => {
    if (!tocaVigilarFinal({ auto: lectorAuto, completoDesde: draft.completoDesde })) return undefined;
    const yo = draft.completoDesde;
    // Si mientras se esperaba al lector el draft cambió (apuntaste a mano,
    // nuevo draft), lo que conteste ya no es de este draft (3.37.0).
    const sigue = () => completoActual.current === yo;
    const tic = async () => {
      if (vigilando.current || document.visibilityState !== 'visible') return;
      vigilando.current = true;
      try {
        // Sin `/final` (el lector tarda o acaba de arrancar) se le avisa igual:
        // si no, el guion no llegaba y con el móvil ya en el bolsillo no
        // había otro tic (3.44.1).
        let f = await pedirFinal().catch(() => ({ desde: null, fotogramas: [] }));
        if (!sigue()) return;
        // El lector no sabe de este draft (acaba de completarse, o se reinició)
        // o su guion de consejos ya no es el de ahora (3.44.0): se le avisa,
        // con el guion, y contesta con lo que tenga.
        // Sin los datos del día no se manda guion (el lector conserva el que
        // tenga): tras recargar, el primer aviso iba con el guion VACÍO y el
        // lector daba por pasados los avisos del minuto en que llegaba el bueno.
        const d = directoActual.current;
        const callar = vozCalladaActual.current;
        const huella = `${yo}|${d.listo ? d.huella : 'sin datos'}|${callar}`;
        if (f.desde !== yo || guionEnviado.current !== huella || f.callada !== callar) {
          const r = await avisarVigilancia({ desde: yo, directo: d.listo ? d : null, callar });
          if (r) { f = r; guionEnviado.current = huella; }
        }
        if (!sigue()) return;
        const { suyo, fotogramas: lista, resultado, resultadoEn, duracion, voz } = fundirFinal(fotogramas.current, f, { completoDesde: yo });
        if (!suyo) return;
        fotogramas.current = lista;
        if (duracion) duracionFinal.current = { desde: yo, duracion };
        // La voz que falta se dice hasta que vuelva a sonar (un draft nuevo aún no ha hablado).
        if (voz) setVozLector(voz);
        // La tabla de resultado con una palabra conocida (3.32.0): la partida se apunta SOLA, con «Deshacer», fechada cuando el lector vio la tabla.
        // Nunca dos veces por draft, ni la que deshiciste (marca guardada en el draft).
        if (resultado && apuntadaSola.current !== yo && draftActual.current.apuntadaSola !== yo && apuntarSolaAhora.current(resultado === 'gane', resultadoEn ?? Date.now())) apuntadaSola.current = yo;
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
    // Sin catálogo los nombres salen en «?» (#145): se espera a tenerlo.
    if (!draft.completoDesde || corregido.current === draft.completoDesde || !draft.lectura?.ids?.length || !datos.heroes.length) return;
    corregido.current = draft.completoDesde;
    const desde = draft.completoDesde;
    // Lo de ESTE draft, ahora: la respuesta tarda (el lector aprende) y el draft puede haber cambiado.
    const verdad = { enemigos: draft.enemigos, aliados: draft.aliados, tuyo: draft.miPick };
    const leidos = { enemigos: draft.lectura.enemigos, aliados: draft.lectura.aliados };
    corregirLectura({ ids: draft.lectura.ids, enemigos: draft.enemigos, baneos: draft.baneos, aliados: draft.aliados, tuyo: draft.miPick })
      .then((r) => {
        if (r?.aprendido) draft.anotarAprendizaje({ aprendidos: r.aprendidos, sinEncontrar: r.sinEncontrar }, desde);
        // Si a la lectura se le escapó alguien, las caras de los picks al
        // proyecto para medir por qué (3.52.0). Sin token no sube nada.
        const recortes = (r?.recortes ?? []).filter(recorteValido);
        if (recortes.length && faltoAlguien(leidos, verdad) && envioActual.current.activo) {
          envioActual.current.subirAparte({ ...cuerpoDePicks({ recortes, verdad, leidos, heroes: datos.heroes, version: __APP_VERSION__ }), etiquetas: ['pantalla'], id: `picks:${desde}` });
        }
      });
  }, [draft.completoDesde, draft.lectura, draft.enemigos, draft.baneos, datos.heroes]);

  /** Trae los datos de otro dispositivo: vienen fundidos, así que solo guarda. */
  const traerPerfil = (fundido) => {
    personal.importarPerfil(fundido);
    if (fundido.rango && !rango) setRango(fundido.rango);
    if (fundido.linea && !linea) setLinea(fundido.linea);
  };

  /**
   * Otra línea, a mano (3.60.2): un pick fijado que no se juega en ella se
   * suelta. Seguía en el hueco «Tú» y «Apuntar partida» lo guardaba con la
   * línea nueva sin enseñarlo en la rejilla. El que fijó el lector
   * (`miPickLeido`) se queda: tu fila vale sea de la línea que sea (3.40.0).
   */
  const cambiarLinea = (l) => {
    if (draft.miPick && !draft.miPickLeido && !poolDe(datos, l).some((h) => h.name === draft.miPick)) draft.fijarPick({ name: draft.miPick });
    setLinea(l);
    cerrar();
  };

  const lanzarDiagnostico = async () => {
    try {
      // El lector solo se pregunta si se usa: sin él, Chrome sacaría el aviso de red local a cualquiera.
      const [{ publicada, historial }, estadoLector] = await Promise.all([pedirPublicada(), lectorAuto || lectorTablet ? pedirEstadoLector() : null]);
      setInforme(diagnosticar({
        datos, linea,
        maestria: personal.maestriaUsada, maestriaManual: personal.maestria, partidas: personal.partidas,
        draft: {
          enemigos, aliados, baneos, rival: rec.rival, ranking: rec.ranking, analisis: rec.analisis, partida: rec.partida, miPick: draft.miPick,
          robustez: rec.robustez, composicion: rec.composicion,
          estimaciones: rec.ranking.slice(0, 3).map((r) => ({ yo: r.heroe.name, p: r.p, puntos: r.puntos, terminos: r.terminos, vistos: aliados.length + enemigos.length + 1 })),
        },
        historial, pro,
        entorno: leerEntorno({
          version: __APP_VERSION__, buildTime: __BUILD_TIME__, rango: datos.rango, publicada,
          lector: lectorAuto || lectorTablet ? { donde: lectorTablet?.direccion ?? null, auto: lectorAuto, estado: estadoLector, ultimo: lector.ultimo, ahora: Date.now() } : null,
        }),
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
    const epoca = draft.epocaDelDraft();
    setLector((l) => ({ ...l, estado: 'leyendo', aviso: silencioso ? l.aviso : null }));
    try {
      const lectura = await pedirLectura();
      // Tu fila, solo si el héroe es de tu línea (3.46.1).
      const nombres = tuyoDeTuLinea(nombresDeLectura(lectura, datos.heroes), poolDeLinea);
      const n = draft.aplicarLectura({ ...nombres, id: typeof lectura.id === 'string' ? lectura.id : null, dudas: dudasDeLectura(lectura), ms: lectura.ms, msCaptura: lectura.msCaptura, formato: lectura.formato, epoca });
      // De otro draft: ni cuenta para cerrar este por partida ni dice nada.
      if (n.otroDraft) { setLector((l) => ({ ...l, estado: 'libre' })); return; }
      // La tablet ya está en partida (3.46.0): el draft se cierra aunque falte
      // alguien, y con eso arrancan la voz, la vigilancia y el resultado.
      enPartidaSeguidas.current = lecturasEnPartida(enPartidaSeguidas.current, lectura);
      if (enPartidaSeguidas.current >= LECTURAS_EN_PARTIDA) draft.cerrarPorPartida();
      const algo = nombres.baneos.length + nombres.enemigos.length + nombres.aliados.length + (nombres.tuyo ? 1 : 0);
      const nuevos = n.baneos + n.enemigos + n.aliados + (n.tuyo ? 1 : 0);
      const aviso = nuevos ? null : (algo ? 'yaEstaba' : 'nada');
      setLector({ estado: 'libre', aviso: silencioso ? null : aviso, ultimo: { cuando: Date.now(), ok: true, nuevos } });
    } catch (e) {
      const tipo = FALLOS_DEL_LECTOR.includes(e?.tipo) ? e.tipo : 'error';
      // Con el código de la tablet mal (3.61.0), leer solo se para: seguir
      // insistiendo cada 5 s acabaría bloqueando al móvil en la tablet.
      if (tipo === 'codigo' || tipo === 'bloqueado') codigoMalo.current = true;
      setLector({ estado: 'libre', aviso: silencioso && !codigoMalo.current ? null : tipo, ultimo: { cuando: Date.now(), ok: false, tipo } });
    } finally {
      leyendoAhora.current = false;
    }
  };

  // La burbuja de la tablet (3.62.0): tu pick y los dos siguientes, cada vez
  // que cambian. Solo con el lector en la tablet; si no llega, el siguiente
  // cambio lo vuelve a mandar.
  const maestriaParaLaTablet = useMemo(() => Object.fromEntries(Object.entries(personal.maestriaUsada ?? {})
    .filter(([, m]) => Number.isInteger(m?.games) && m.games > 0 && typeof m.winRate === 'number')
    .sort((a, b) => b[1].games - a[1].games).slice(0, 200)
    .map(([n, m]) => [n, { games: m.games, winRate: Math.round(m.winRate * 1000) / 1000 }])), [personal.maestriaUsada]);
  const consejoTablet = lectorTablet ? consejoParaLaTablet({ eleccion: rec.eleccion, ranking: rec.ranking, fase: draft.fase, baneos: rec.baneosSugeridos, deLosTuyos: rec.deLosTuyos }, t) : null;
  const huellaConsejo = consejoTablet ? `${consejoTablet.titulo}|${consejoTablet.detalle}` : '';
  useEffect(() => {
    if (!lectorTablet) return;
    // Con tu línea, rango e idioma (3.69.3): la tablet sigue leyendo sola con
    // ellos cuando el móvil se calla, aunque en la APK no se haya elegido línea.
    // Y tu maestría y tu clave de la base de datos (3.70.0): la tablet decide
    // con ellas y sube lo que apunte sola, sin el móvil delante.
    // Y si callaste la voz (3.71.0): la tablet habla sola en partida y lo respeta.
    mandarALaTablet({ consejo: consejoTablet, ajustes: { linea, rango: datos.rango, idioma, maestria: maestriaParaLaTablet, vozCallada, ...(comunidad.activo && comunidad.clave ? { clave: comunidad.clave } : {}) } });
    // consejoTablet cambia de objeto en cada render: lo que decide es su huella.
  }, [huellaConsejo, lectorTablet, linea, datos.rango, idioma, maestriaParaLaTablet, vozCallada, comunidad.activo, comunidad.clave]);
  // Móvil y tablet con UNA clave (3.76.0): vinculado y sin clave propia, el
  // móvil usa la de la tablet y ve y arregla lo mismo que «Mis partidas» de
  // la APK. Con una clave tuya, manda la tuya (va a la tablet con el consejo).
  const claveTabletPedida = useRef(false);
  useEffect(() => {
    if (!lectorTablet || !comunidad.config || comunidad.clave || claveTabletPedida.current) return;
    claveTabletPedida.current = true;
    pedirClaveDeLaTablet().then((clave) => { if (clave) comunidad.usarClave(clave); else claveTabletPedida.current = false; });
    // comunidad cambia de objeto en cada render: lo que decide es si hay clave y configuración.
  }, [lectorTablet, comunidad.config, comunidad.clave]);
  // Las partidas que apuntó la tablet sola (3.70.0) se funden aquí como las de otro móvil.
  useEffect(() => {
    if (!comunidad.nuevas.length) return;
    traerPerfil(fundirPerfil(datosPerfil, sanear({ partidas: comunidad.nuevas, mastery: {}, olvidadas: [] })));
    comunidad.nuevasFundidas();
  }, [comunidad.nuevas]);

  // La tablet cambió de IP (3.65.4): si no contesta, se busca en la wifi y la
  // app se vincula sola a la dirección nueva. Al abrir y cada 5 minutos.
  useEffect(() => {
    if (!lectorTablet) return undefined;
    const tic = async () => {
      const estado = await pedirEstadoLector();
      if (estado.ok || !sinLlegarALaTablet(estado.tipo)) return;
      const nueva = await buscarTabletUnaVez(lectorTablet);
      if (nueva && nueva.direccion !== lectorTablet.direccion) setLectorTablet(nueva);
    };
    tic();
    const reloj = setInterval(tic, 5 * 60 * 1000);
    return () => clearInterval(reloj);
  }, [lectorTablet, setLectorTablet]);

  // El parte de salud de la tablet (3.63.0): cada 10 min, con el lector en la
  // tablet y la subida activada, se le pregunta cómo está y, si toca
  // (uno al día, o en el acto si algo va mal), se sube a su incidencia.
  const subirParte = envio.subirParte;
  useEffect(() => {
    if (!lectorTablet || !envio.activo) return undefined;
    const tic = async () => {
      const estado = await pedirEstadoLector();
      const parte = parteDeLaTablet(estado, { version: __APP_VERSION__, ultimaApk: estado.ok ? await pedirUltimaApk() : null });
      if (parte) subirParte(parte);
    };
    tic();
    const reloj = setInterval(tic, 10 * 60 * 1000);
    return () => clearInterval(reloj);
  }, [lectorTablet, envio.activo, subirParte]);

  // Leyendo solo (3.28.0): mientras el draft no esté completo, la app a la
  // vista y sin hoja abierta, se pide una lectura cada pocos segundos. Con
  // el draft vacío, más despacio: es buscar si ha empezado uno.
  const completo = draftCompleto(draft);
  const vacio = !draft.enemigos.length && !draft.aliados.length && !draft.baneos.length;
  // Hasta que no hay catálogo los nombres leídos no resuelven a nadie: se espera.
  const conCatalogo = !!carga.catalogo && datos.heroes.length > 0;
  useEffect(() => {
    const tuPick = { miPick: draft.miPick, completoDesde: draft.completoDesde, cerrado: draft.cerrado };
    if (!conCatalogo || !tocaLeerSolo({ auto: lectorAuto, hoja, completo, ...tuPick })) return undefined;
    const tic = () => { if (!codigoMalo.current && tocaLeerSolo({ auto: lectorAuto, visible: document.visibilityState === 'visible', hoja, completo, leyendo: leyendoAhora.current, ...tuPick })) leerDelJuego({ silencioso: true }); };
    // Al (re)arrancar, una lectura ya, salvo que acabe de haber una: la
    // primera lectura cambia el draft de vacío a lleno y eso rearma esto.
    if (Date.now() - ultimaLectura.current >= INTERVALO_AUTO_MS) tic();
    const reloj = setInterval(tic, vacio ? INTERVALO_AUTO_VACIO_MS : INTERVALO_AUTO_MS);
    return () => clearInterval(reloj);
    // leerDelJuego cambia en cada render; lo que decide si se lee es lo de aquí.
  }, [conCatalogo, lectorAuto, hoja, completo, vacio, draft.miPick, draft.completoDesde, draft.cerrado, lectorTablet]);

  if (error) return <div className="results"><p className="notice">{t('app.errorDatos', { error })}</p></div>;
  if (!carga.catalogo) return <div className="results"><p className="empty-state">{t('app.cargando')}</p></div>;

  // Primer arranque: sin línea no hay nada que recomendar.
  if (!linea && !soloPagina) {
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
      t={t} meta={meta} generado={generado} edadHoras={edadHoras} edadMatrizHoras={edadMatrizHoras} rango={datos.rango} cov={rec.cov}
      rangoDatos={rangoDatos} diasDatos={datos.meta?.ventana?.dias}
      novedadesNuevas={novedades.nueva} onVerNovedades={novedades.marcarVista}
    />
  );
  // «Deshacer» tras vaciar el draft o quitar con la × (3.23.0). Con una hoja
  // abierta no se enseña: la hoja lo taparía y ahí se quita tocando otra vez.
  // El enlace del QR de la tablet espera un toque (3.61.0): no se vincula solo.
  const vinculo = vinculoPendiente ? <ConfirmarVinculo vinculo={vinculoPendiente} onResponder={confirmarVinculo} t={t} /> : null;
  const deshacer = hoja ? null : apuntada && !draft.deshacible ? (
    <AvisoDeshacer deshacible={{ tipo: 'apuntada', gane: apuntada.gane, aMano: apuntada.aMano }} onDeshacer={deshacerApuntada} onCerrar={() => { setApuntada(null); diferido.current.ejecutar(); }} t={t} />
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

  // Las hojas, en las DOS fases (3.60.2): una partida apuntada sola reinicia
  // el draft a baneos y, montadas solo en picks, la que estabas usando
  // (Ajustes → maestría, partidas, diagnóstico) desaparecía con lo escrito.
  const hojas = (
    <>
      {informe && <Diagnostico t={t} resultado={informe} onCerrar={() => setInforme(null)} />}
      {hoja?.build && (
        <Builds heroe={hoja.build} linea={linea} builds={meta?.builds} equipment={meta?.equipment} talentos={meta?.talentos} enemigos={enemigos} plan={planear(datos, { yo: hoja.build, aliados, enemigos, linea, baneos, maestria: personal.maestriaUsada, rivalMarcado: draft.rivalMarcado })} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'linea' && (
        <ElegirLinea valor={linea} onElegir={cambiarLinea} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'apuntar' && (
        <ApuntarPartida pool={rec.pool} heroes={datos.heroes} miPick={draft.miPick} recomendados={rec.ranking.slice(0, 3).map((r) => r.heroe.name)} onGuardar={(pick, gane) => apuntarAMano(gane, pick)} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'historial' && (
        <HistorialPartidas
          partidas={personal.partidas} maestria={personal.maestria} maestriaUsada={personal.maestriaUsada} datos={datos} pool={rec.pool} perfil={datosPerfil} envio={envio} comunidad={comunidad} onImportar={traerPerfil}
          onOlvidar={personal.olvidarPartida} onCorregir={personal.corregirPartida} onCambiarHeroe={personal.cambiarHeroePartida} onCambiarDraft={personal.cambiarDraftPartida}
          onAnadir={(heroe, gane) => personal.apuntarPartida({ pick: heroe, gane, previa: true, rango: datos.rango })}
          onRevisar={() => deHojaAHoja('revisar')}
          onAnalisis={() => deHojaAHoja('analisis')}
          onCerrar={cerrar} t={t}
        />
      )}
      {hoja === 'revisar' && <RevisarCapturas partidas={personal.partidas} datos={datos} comunidad={comunidad} perfil={datosPerfil} onImportar={traerPerfil} onGuardar={personal.revisarPartida} onCerrar={soloPagina === 'revisar' ? cerrarSuelta : cerrar} t={t} />}
      {hoja === 'analisis' && <Analitica partidas={personal.partidas} maestria={personal.maestria} datos={datos} onCerrar={soloPagina === 'analisis' ? cerrarSuelta : cerrar} t={t} />}
      {hoja === 'perfil' && <Perfil datos={datosPerfil} onImportar={traerPerfil} onCerrar={cerrar} t={t} />}
      {hoja === 'meta' && <Meta datos={datos} linea={linea} onFicha={(nombre) => deHojaAHoja({ ficha: nombre })} onCerrar={cerrar} t={t} />}
      {hoja?.ficha && <FichaDeHeroe datos={datos} nombre={hoja.ficha} onOtro={(nombre) => setHoja({ ficha: nombre })} onCerrar={cerrar} t={t} />}
      {hoja === 'admin' && verAdmin && <Administracion licencia={licencia} comunidad={comunidad} onCerrar={cerrar} t={t} />}
      {hoja === 'maestria' && (
        <EditorDeMaestria pool={rec.pool} maestria={personal.maestria} onGuardar={personal.guardarMaestria} onCerrar={cerrar} t={t} />
      )}
    </>
  );

  // La puerta va DESPUÉS de todos los hooks: cerrarla no puede cambiar su orden.
  if (!licencia.pasa) return <PuertaDeLicencia licencia={licencia} t={t} />;
  // «Capturas» sola: ni draft ni lector detrás, solo la hoja.
  if (soloPagina && hoja === soloPagina) return <div className="solo-pagina">{hojas}</div>;

  const barra = <BarraPC abrir={abrir} onDiagnostico={lanzarDiagnostico} conCapturas={!!comunidad.config} fase={draft.fase} t={t} />;

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
          lector={lectorConVoz} onLeer={leerDelJuego} lectorAuto={lectorAuto} onLectorAuto={setLectorAuto} vozCallada={vozCallada} onVoz={cambiarVoz}
          pie={pie} barra={barra}
        />
        {/* El aviso y el selector en el MISMO sitio que en picks (segundo y
            tercer hijo): si no, al cambiar de fase React los vuelve a montar.
            El aviso se iba de debajo del dedo (la partida apuntada sola
            reinicia el draft a baneos) y el selector de baneos se CERRABA
            cuando una lectura en vuelo pasaba el draft a picks (3.40.0). */}
        {deshacer}
        {vinculo}
        {selector}
        {hojas}
      </>
    );
  }

  return (
    <>
      <FasePicks
        t={t} linea={linea} rango={datos.rango} idioma={idioma} onIdioma={setIdioma} tacto={tacto} onTacto={setTacto} onRango={setRango}
        meta={meta} datos={datos} metaListo={metaListo} sinWinrates={sinWinrates} edadHoras={edadHoras} pro={pro}
        draft={draft} equipo={{ enemigos, aliados, baneos }} miPick={miPick} maestria={personal.maestriaUsada} rec={rec} abrir={abrir} onDiagnostico={lanzarDiagnostico}
        onResultado={apuntarAMano}
        lector={lectorConVoz} onLeer={leerDelJuego} lectorAuto={lectorAuto} onLectorAuto={setLectorAuto} vozCallada={vozCallada} onVoz={cambiarVoz}
        lectorTablet={lectorTablet} onLectorTablet={setLectorTablet} onAdministracion={verAdmin ? () => abrir('admin') : null} ajuste={personal.ajuste}
        pie={pie} barra={barra}
      />
      {deshacer}
      {vinculo}
      {selector}
      {hojas}
    </>
  );
}
