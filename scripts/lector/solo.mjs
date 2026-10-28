/**
 * Un solo aparato (3.66.0): Lector MLBB lee la pantalla, decide con el MISMO
 * motor que Pick Assist y pinta tu pick en la burbuja, sin móvil al lado.
 * La mayoría juega en el móvil, sin una tablet aparte; y aun con dos, el
 * consejo ya no depende de la wifi entre ellos.
 *
 * Tres piezas, las dos primeras puras:
 * - `acumularDraft`: junta las lecturas en un draft (baneos, los cinco huecos
 *   de cada equipo y tu fila), cierra el draft cuando empieza la partida y
 *   empieza otro cuando vuelve un draft nuevo.
 * - `consejoSolo`: el draft, al motor (`recomendar` de draft.js, el único
 *   cerebro) y de ahí la burbuja: en baneos a quién banear, en picks tu nº1
 *   con los dos siguientes. El mismo texto que manda la app del móvil.
 * - `crearSolo`: el bucle. Se aparta si el móvil está leyendo o mandando su
 *   consejo (lo que manda la app, manda), y en partida solo mira el minimapa.
 *
 * Solo MIRA la pantalla, como todo el lector: no toca el juego ni la cuenta.
 */
import { readFileSync } from 'node:fs';
import { momentoDe } from './aprender.mjs';
import { nombreClave } from '../../src/motor/nombres.js';
import { prepararDatos, recomendar } from '../../src/motor/draft.js';
import { VERSION_MODELO } from '../../src/motor/modelo.js';
import { crearT } from '../../src/app/i18n/index.js';
import { guionTraducido } from '../../src/app/i18n/guion.js';

/** Las líneas que se pueden elegir en la APK (las de `LINEAS` del motor). */
export const LINEAS_SOLO = ['roam', 'jungle', 'mid', 'gold', 'exp'];
/**
 * Cada cuánto se lee: en un draft, sin draft a la vista y en partida (solo
 * el minimapa). Decisiones de producto. En el draft, 1,5 s desde 3.80.0
 * (antes 5 s, el ritmo de «Leer solo» en el móvil, donde una lectura tardaba
 * 4–6 s): en la tablet una lectura tarda 0,6–1,6 s (sus partes del 26 de
 * octubre de 2026), y el último rival y tu pick se ven con su dibujo solo
 * unos segundos antes de la fase de skins. En los 51 drafts de recortes,
 * de las capturas del final del draft solo 17 de 96 leían a los cinco rivales:
 * el hueco rojo de quien aún no ha elegido o la skin que ya lo tapa.
 */
export const INTERVALOS_SOLO = { draft: 1500, vacio: 12000, partida: 20000, error: 30000 };
/** El móvil manda si leyó o mandó su consejo hace menos de esto. */
export const MOVIL_ACTIVO_MS = 60000;
/** Lecturas seguidas en partida para dar el draft por cerrado (las mismas que la app, `LECTURAS_EN_PARTIDA`). */
export const EN_PARTIDA_PARA_CERRAR = 2;
/** Tras cerrar, un draft nuevo solo se acepta pasado esto (las pantallas del final no son un draft). */
export const MINUTOS_PARA_OTRO_DRAFT = 3;
/** Un draft sin cambios en este tiempo se da por abandonado. */
export const MINUTOS_DRAFT_ABANDONADO = 15;
/** Como `CAMBIOS_A_LA_VEZ` de la app: más huecos ya leídos cambiando a la vez es la fase de skins (imanes). */
export const CAMBIOS_A_LA_VEZ = 2;

export const draftVacio = () => ({ baneos: [], banHuecos: [null, null, null, null, null, null, null, null, null, null], enemigos: [null, null, null, null, null], aliados: [null, null, null, null, null], tuyoFila: -1, cerrado: false, cerradoEn: null, enPartida: 0, actividad: null, ids: [] });
/**
 * Cuántos baneos que NO cuadran con el draft de antes dicen que es otro
 * draft (3.72.5): un hueco de baneo con otro héroe (los baneos no cambian
 * dentro de un draft) o, tras la partida, baneos que no estaban. Dos y no
 * uno: un baneo mal leído (1 de 338 medidos) no tira el draft.
 */
export const BANEOS_DE_OTRO_DRAFT = 2;
/** Las capturas del draft que se recuerdan para aprender de una corrección (3.71.0): las mismas que mira `/corregir`. */
export const IDS_POR_DRAFT = 20;
/**
 * Qué capturas recuerda el draft (3.81.4). Desde 3.80.0 la tablet lee cada
 * 1,5 s y no cada 5: las 20 últimas eran los últimos 30 s, y las 8 que miran
 * la corrección y los recortes, la pantalla de CARGA (se lee hasta ver el
 * minimapa: el 27 de octubre de 2026, diez lecturas seguidas con «Gord 0,77»
 * en los diez baneos) y la fase de skins, de las que no se aprende a ningún
 * rival. Solo entra la pantalla del draft (`BANEOS_EN_EL_DRAFT` baneos
 * leídos, la fila de arriba que no existe en la carga; como
 * `BANEOS_PARA_APRENDER` de aprender.mjs) y espaciadas `SEPARACION_IDS_MS`
 * (el ritmo de antes de 3.80.0), con la última siempre: 20 llegan a 80 s
 * del draft y las 8 últimas, a la fase de picks.
 */
export const BANEOS_EN_EL_DRAFT = 2;
export const SEPARACION_IDS_MS = 4000;
/** Añade la captura a las del draft: la última siempre, y entre las de antes al menos `SEPARACION_IDS_MS`. */
export function conCaptura(ids = [], id) {
  const previa = ids.at(-1), antes = ids.at(-2);
  // La última solo estaba de paso si quedaba a menos de la separación de la anterior: se cambia por la nueva.
  const depaso = previa && antes && momentoDe(previa) - momentoDe(antes) < SEPARACION_IDS_MS;
  return [...(depaso ? ids.slice(0, -1) : ids), id].slice(-IDS_POR_DRAFT);
}

const nombres = (lista) => (Array.isArray(lista) ? lista : []).map((x) => (typeof x?.nombre === 'string' && x.nombre ? x.nombre : null));

/** Mete en los huecos lo leído; si cambian más de `CAMBIOS_A_LA_VEZ` huecos ya leídos, esa lectura no toca ese equipo. */
function fundirHuecos(antes, leidos, saltar = -1) {
  const cambios = antes.filter((n, i) => i !== saltar && n && leidos[i] !== undefined && leidos[i] !== n).length;
  if (cambios > CAMBIOS_A_LA_VEZ) return { huecos: antes, cambio: false };
  let cambio = false;
  const huecos = antes.map((n, i) => {
    const nuevo = leidos[i];
    if (!nuevo || nuevo === n) return n;
    cambio = true;
    return nuevo;
  });
  return { huecos, cambio };
}

/**
 * Una lectura más sobre el draft. Nunca lanza. `ahora` es el instante de la
 * lectura. Los nombres son los del lector (la grafía de sus caras): se
 * pasan al catálogo al decidir.
 */
export function acumularDraft(estado, lectura, ahora) {
  let e = estado ?? draftVacio();
  if (!lectura) return e;
  if (lectura.partida) {
    const enPartida = e.enPartida + 1;
    const cierra = !e.cerrado && enPartida >= EN_PARTIDA_PARA_CERRAR && (e.baneos.length || e.enemigos.some(Boolean));
    return { ...e, enPartida, ...(cierra ? { cerrado: true, cerradoEn: ahora } : {}) };
  }
  // Los baneos por hueco: cinco de cada lado, en su sitio.
  const huecosBan = [0, 1, 2, 3, 4].map((i) => nombres(lectura.tuyos)[i] ?? null).concat([0, 1, 2, 3, 4].map((i) => nombres(lectura.suyos)[i] ?? null));
  const baneos = huecosBan.filter(Boolean);
  const enemigos = nombres(lectura.enemigos);
  const filas = nombres(lectura.aliados);
  // Solo cuenta lo que se lee en la PANTALLA DEL DRAFT (3.83.0): con la fila de
  // baneos a la vista, o sumando a un draft abierto que ya la tuvo. El 27 de
  // octubre de 2026 la tablet leía un «Gord» o un «Sun» suelto en pantallas
  // que no eran el draft (el final, la carga, el vestíbulo, con los diez baneos
  // en «?»), abría otro draft con eso, lo cerraba con la partida y tiraba la
  // vigilancia de la partida de verdad: 7 de 23 «Draft completo» en una tarde
  // eran eso («0 consejos en directo») y la tabla del final no se vio ni una vez.
  const deDraft = baneos.length >= BANEOS_EN_EL_DRAFT || (!e.cerrado && e.baneos.length >= BANEOS_EN_EL_DRAFT);
  const algo = deDraft && (baneos.length || enemigos.some(Boolean) || filas.some(Boolean));
  if (!deDraft) return e.enPartida ? { ...e, enPartida: 0 } : e;
  // ¿Otro draft? (3.72.5) Por lo que se ve, no solo por el reloj: un hueco
  // de baneo con OTRO héroe (alguien abandonó el draft y empezó otro) o,
  // tras la partida, baneos que el de antes no tenía. Antes solo valían los
  // minutos, y el draft siguiente no entraba o se mezclaba con el anterior.
  const banHuecos = e.banHuecos ?? Array(10).fill(null);
  const huecosDistintos = huecosBan.filter((n, i) => n && banHuecos[i] && banHuecos[i] !== n).length;
  const nuevos = baneos.filter((n) => !e.baneos.includes(n)).length;
  const otro = algo && ((e.cerrado && (ahora - e.cerradoEn >= MINUTOS_PARA_OTRO_DRAFT * 60000 || nuevos >= BANEOS_DE_OTRO_DRAFT || huecosDistintos >= BANEOS_DE_OTRO_DRAFT))
    || (!e.cerrado && (huecosDistintos >= BANEOS_DE_OTRO_DRAFT || (e.actividad != null && ahora - e.actividad >= MINUTOS_DRAFT_ABANDONADO * 60000))));
  if (otro) e = draftVacio();
  if (e.cerrado) return { ...e, enPartida: 0 };
  const tuyoFila = Number.isInteger(lectura.tuyoFila) && lectura.tuyoFila >= 0 && lectura.tuyoFila < 5 ? lectura.tuyoFila : e.tuyoFila;
  const nuevosBaneos = [...new Set([...e.baneos, ...baneos])].slice(0, 10);
  const enem = fundirHuecos(e.enemigos, enemigos);
  const ali = fundirHuecos(e.aliados, filas, tuyoFila);
  const cambio = nuevosBaneos.length !== e.baneos.length || enem.cambio || ali.cambio || tuyoFila !== e.tuyoFila;
  // La captura de esta lectura (3.71.0): si luego dices quién era el «?», el lector aprende de ella.
  const ids = typeof lectura.id === 'string' && /^lectura-[\w-]+$/.test(lectura.id) && baneos.length >= BANEOS_EN_EL_DRAFT ? conCaptura(e.ids ?? [], lectura.id) : e.ids ?? [];
  const nuevosHuecos = (e.banHuecos ?? Array(10).fill(null)).map((n, i) => n ?? huecosBan[i]);
  return { ...e, baneos: nuevosBaneos, banHuecos: nuevosHuecos, enemigos: enem.huecos, aliados: ali.huecos, tuyoFila, enPartida: 0, actividad: cambio ? ahora : e.actividad ?? (algo ? ahora : null), ids };
}

const TEXTOS = {
  es: { banea: (l) => `Banea: ${l}`, tuNumeroUno: (h) => `Tu nº1 ahora: ${h}`, luego: (l) => `Luego: ${l}`, tuyos: (h) => `De los tuyos: ${h}`, baneos: 'Fase de baneos', picks: 'Fase de picks' },
  en: { banea: (l) => `Ban: ${l}`, tuNumeroUno: (h) => `Your no. 1 now: ${h}`, luego: (l) => `Then: ${l}`, tuyos: (h) => `Yours: ${h}`, baneos: 'Ban phase', picks: 'Pick phase' },
};

/**
 * Del draft al consejo de la burbuja, con el motor de la app. null si no hay
 * nada que decir (sin datos o sin draft a la vista). Nunca lanza.
 */
/**
 * El draft leído, pasado al catálogo y al motor (`recomendar`, con tu
 * maestría si la hay). null sin datos o sin nada leído. Lo usan el consejo y
 * la partida que se apunta (3.70.0): la misma decisión en los dos.
 */
export function decidirSolo({ datos, draft, linea, maestria = null }) {
  if (!datos?.heroes?.length || !draft || !LINEAS_SOLO.includes(linea)) return null;
  const porClave = new Map(datos.heroes.map((h) => [nombreClave(h.name), h]));
  const heroe = (n) => (n ? porClave.get(nombreClave(n)) ?? null : null);
  const unicos = (lista) => [...new Map(lista.filter(Boolean).map((h) => [h.name, h])).values()];
  const baneos = unicos(draft.baneos.map(heroe));
  const enemigos = unicos(draft.enemigos.map(heroe));
  const tuyo = draft.tuyoFila >= 0 ? heroe(draft.aliados[draft.tuyoFila]) : null;
  const nombresEnemigos = new Set(enemigos.map((h) => h.name));
  const aliados = unicos(draft.aliados.filter((_, i) => i !== draft.tuyoFila).map(heroe)).filter((h) => !nombresEnemigos.has(h.name) && h.name !== tuyo?.name);
  if (!baneos.length && !enemigos.length && !aliados.length && !tuyo) return null;
  const rec = recomendar(datos, { linea, enemigos, aliados, baneos, maestria, miPick: tuyo, conSimulacion: false });
  return { rec, tuyo, baneos, enemigos, aliados };
}

export function consejoSolo({ datos, draft, linea, idioma = 'es', maestria = null }) {
  try {
    if (!draft || draft.cerrado) return null;
    const d = decidirSolo({ datos, draft, linea, maestria });
    if (!d) return null;
    const { rec, baneos, enemigos, aliados } = d;
    const t = TEXTOS[idioma] ?? TEXTOS.es;
    const pct = (p) => `${Math.round(p * 100)}%`;
    if (!enemigos.length && !aliados.length) {
      const yaBaneados = new Set(baneos.map((h) => h.name));
      const lista = (rec.baneosSugeridos ?? []).map((b) => b.heroe?.name).filter((n) => n && !yaBaneados.has(n)).slice(0, 3);
      // La fase delante en la segunda línea (3.69.2), igual que lo que manda el móvil.
      if (lista.length && baneos.length < 10) return { titulo: t.banea(lista.join(' · ')), detalle: [t.baneos, rec.eleccion?.heroe ? t.tuNumeroUno(rec.eleccion.heroe.name) : null].filter(Boolean).join(' · ') };
    }
    const e = rec.eleccion;
    if (!e?.heroe) return null;
    const siguientes = rec.ranking.filter((r) => r.heroe.name !== e.heroe.name).slice(0, 2);
    const otros = siguientes.map((r) => `${r.heroe.name} ${pct(r.p)}`);
    // El mejor de los tuyos (3.72.0), como en la app: si no es ya uno de los nombrados.
    const mio = rec.deLosTuyos;
    const tuyo = mio?.heroe && mio.heroe.name !== e.heroe.name && !siguientes.some((r) => r.heroe.name === mio.heroe.name) ? t.tuyos(`${mio.heroe.name} ${pct(mio.p)}`) : null;
    return { titulo: `${e.heroe.name} ${pct(e.p)}`, detalle: [t.picks, otros.length ? t.luego(otros.join(' · ')) : null, tuyo].filter(Boolean).join(' · ') };
  } catch { return null; }
}

/**
 * La partida que apunta la tablet sola (3.70.0), con la MISMA forma que las
 * de la app (registro.js `apuntar`): el draft de cuando se cerró, tu pick
 * (tu fila leída o, si no se leyó, el nº1, marcado `supuesto`), los tres
 * recomendados, la estimación del pick jugado, el resultado de la tabla y la
 * duración si el inicio se vio. `origen: 'lector'` y `fuente: 'tablet'`.
 * null si no hay pick.
 */
export function partidaSolo({ decision, linea, rango = 'glory', gane, t, duracion = null, versionModelo = null }) {
  const rec = decision?.rec;
  const pick = decision?.tuyo?.name ?? rec?.eleccion?.heroe?.name ?? null;
  if (!pick || typeof gane !== 'boolean' || !Number.isFinite(t)) return null;
  const est = rec.ranking.find((r) => r.heroe.name === pick)?.p;
  return {
    t, pick, gane, rango, origen: 'lector', fuente: 'tablet',
    ...(decision.tuyo ? {} : { supuesto: true }),
    recomendados: rec.ranking.slice(0, 3).map((r) => r.heroe.name),
    ...(typeof est === 'number' && est > 0 && est < 1 ? { estimacion: Math.round(est * 1000) / 1000, ...(versionModelo ? { modelo: versionModelo } : {}) } : {}),
    ...(decision.baneos.length ? { bans: decision.baneos.map((h) => h.name).slice(0, 10) } : {}),
    draft: { linea, enemigos: decision.enemigos.map((h) => h.name).slice(0, 5), aliados: decision.aliados.map((h) => h.name).slice(0, 4) },
    ...(Number.isFinite(duracion) && duracion >= 3 && duracion <= 90 ? { duracion } : {}),
  };
}

/**
 * Los consejos en directo de la partida, sin el móvil (3.71.0): el MISMO plan
 * del motor que la app (`rec.partida`) traducido con los MISMOS textos
 * (`crearT`, `guionTraducido`). Como en la app, el plan es el de tu pick:
 * si el motor no lo tiene (tu pick leído no es el suyo), no hay guion.
 */
export function guionSolo(decision, idioma = 'es') {
  const rec = decision?.rec;
  if (!rec) return { guion: [], cierres: [], idioma };
  // `recomendar` planea para `eleccion` (tu pick si está en tu línea; si no, el nº1).
  const plan = decision.tuyo && rec.eleccion?.heroe?.name !== decision.tuyo.name ? null : rec.partida;
  const { guion, cierres } = guionTraducido(plan, crearT(idioma), idioma);
  return { guion, cierres, idioma };
}

/**
 * Lo que quedó sin leer al cerrarse el draft (3.71.0): enemigos, compañeros
 * y tu propio pick. Con eso y las capturas del draft, la APK te pregunta
 * quién era y el lector aprende de tu respuesta como de una corrección del
 * móvil. null si no falta nadie, si no hay capturas o si no hay datos.
 */
export function correccionDelDraft(draft, datos) {
  if (!draft?.cerrado || !draft.ids?.length || !datos?.heroes?.length) return null;
  const porClave = new Map(datos.heroes.map((h) => [nombreClave(h.name), h.name]));
  const nombre = (n) => (n ? porClave.get(nombreClave(n)) ?? null : null);
  const enemigos = draft.enemigos.map(nombre);
  const aliados = draft.aliados.map(nombre);
  const faltan = enemigos.filter((n) => !n).length + aliados.filter((n) => !n).length;
  if (!faltan) return null;
  return {
    id: `correccion-${draft.cerradoEn}`,
    ids: draft.ids.slice(),
    cuando: draft.cerradoEn,
    leidos: { enemigos, aliados, tuyoFila: draft.tuyoFila, baneos: draft.baneos.slice(0, 10) },
    faltan,
    heroes: [...porClave.values()].sort((a, b) => a.localeCompare(b)),
  };
}

/** La notificación de la pregunta (3.72.5): tocarla abre la APK, donde se contesta. */
export function resumenPregunta(desde, pick, idioma = 'es') {
  const en = idioma === 'en';
  return {
    id: `pregunta-${desde}`,
    titulo: en ? 'How did the game end?' : '¿Cómo acabó la partida?',
    texto: en
      ? `I didn't see the result${pick ? ` (with ${pick})` : ''}. Tap to say whether you won: next time it recognises it on its own.`
      : `No vi el resultado${pick ? ` (con ${pick})` : ''}. Toca para decir si ganaste: la próxima vez lo reconoce sola.`,
  };
}

/** El resumen de la notificación al apuntar sola, en tu idioma. */
/** Desde cuántas derrotas seguidas el resumen dice cómo te va tras perder. Decisión de producto. */
export const RACHA_PARA_AVISAR = 2;

export function resumenSolo(partida, idioma = 'es', faltan = 0, numeros = null) {
  const en = idioma === 'en';
  const primero = partida.recomendados?.[0];
  // Cómo va la sesión y, tras perder, cómo te suele ir en la siguiente (3.77.0): con TUS partidas
  // (`tusNumeros`, el mismo cálculo que «Tus números» del móvil), y solo afirmado si se distingue.
  const s = numeros?.sesion;
  const tras = numeros?.trasPerder;
  const enRachaMala = numeros?.racha && !numeros.racha.gane && numeros.racha.n >= RACHA_PARA_AVISAR;
  const sesion = s && s.n >= 2 ? (en ? `Today: ${s.ganadas} won, ${s.n - s.ganadas} lost.` : `Hoy: ${s.ganadas} ganadas, ${s.n - s.ganadas} perdidas.`) : null;
  const racha = enRachaMala && tras
    ? (tras.seVe && tras.dif < 0
      ? (en ? `${numeros.racha.n} losses in a row: after a loss you win ${Math.round(tras.wr * 100)}% (otherwise ${Math.round(tras.wrResto * 100)}%). A break might help.` : `${numeros.racha.n} derrotas seguidas: tras perder ganas un ${Math.round(tras.wr * 100)}% (si no, un ${Math.round(tras.wrResto * 100)}%). Quizá toca un descanso.`)
      : (en ? `${numeros.racha.n} losses in a row: in your games, losing doesn't make the next one worse.` : `${numeros.racha.n} derrotas seguidas: en tus partidas, perder no empeora la siguiente.`))
    : null;
  return {
    id: `partida-${partida.t}`,
    titulo: en ? `${partida.gane ? 'Won' : 'Lost'} with ${partida.pick}` : `${partida.gane ? 'Ganada' : 'Perdida'} con ${partida.pick}`,
    texto: [
      primero === partida.pick ? (en ? 'It was the app\'s no. 1.' : 'Era el nº1 de la app.') : primero ? (en ? `The app's no. 1 was ${primero}.` : `El nº1 de la app era ${primero}.`) : null,
      partida.estimacion != null ? (en ? `The app gave ${Math.round(partida.estimacion * 100)}%.` : `La app daba un ${Math.round(partida.estimacion * 100)}%.`) : null,
      en ? 'Logged by the tablet.' : 'Apuntada por la tablet.',
      sesion,
      racha,
      // Lo que no reconoció (3.71.0): tocando la notificación se lo dices y aprende.
      faltan > 0 ? (en ? `Tap to tell the reader who the ${faltan === 1 ? 'unknown hero was' : `${faltan} unknown heroes were`}: it learns from it.` : `Toca para decirle al lector quién ${faltan === 1 ? 'era el que no reconoció' : `eran los ${faltan} que no reconoció`}: aprende de ello.`) : null,
    ].filter(Boolean).join(' '),
  };
}

/**
 * Lo que la APK escribe en `solo.json`: la línea (sin ella, apagado), el rango
 * y el idioma. `apagado` es que Javi tocó «Apagado» (`activo: false`): eso
 * manda sobre la línea que diga la app (3.69.3).
 */
export function leerAjustesSolo(fichero) {
  try {
    const j = JSON.parse(readFileSync(fichero, 'utf8'));
    const linea = LINEAS_SOLO.includes(j?.linea) ? j.linea : null;
    // `voz: false` (3.71.0): el interruptor «Voz en partida» de la APK.
    return { activo: !!linea && j.activo !== false, apagado: j?.activo === false, linea, rango: typeof j.rango === 'string' && /^[a-z]{2,12}$/.test(j.rango) ? j.rango : 'glory', idioma: j.idioma === 'en' ? 'en' : 'es', voz: j?.voz !== false };
  } catch { return { activo: false, apagado: false, linea: null, rango: 'glory', idioma: 'es', voz: true }; }
}

/**
 * Con qué ajustes lee la tablet sola (3.69.3). Hasta ahora solo con la línea
 * elegida en la APK, y sin ella, en cuanto se callaba el móvil nadie leía: la
 * burbuja se quedaba con el consejo viejo. Hoy: la de la APK si hay; si no, y
 * sin «Apagado», la última que mandó la app del móvil.
 */
export function ajustesEfectivos(apk, movil) {
  // La voz (3.71.0): callada si la quitaste en la APK O en la app del móvil.
  const callar = apk?.voz === false || movil?.vozCallada === true;
  if (apk?.activo) return { ...apk, callar, origen: 'apk' };
  if (apk?.apagado) return { ...apk, callar, activo: false, origen: 'apagado' };
  if (movil && LINEAS_SOLO.includes(movil.linea)) {
    return { activo: true, apagado: false, linea: movil.linea, rango: typeof movil.rango === 'string' && /^[a-z]{2,12}$/.test(movil.rango) ? movil.rango : 'glory', idioma: movil.idioma === 'en' ? 'en' : 'es', callar, origen: 'movil' };
  }
  return { ...(apk ?? { linea: null, rango: 'glory', idioma: 'es' }), callar, activo: false, origen: 'sinLinea' };
}

/**
 * El bucle del modo solo. `interno` es el de `crearServidor` (leer,
 * delMovil, ponerConsejo); `datosPara(rango)` da los datos preparados (o
 * null). Devuelve `{ tic, parar, estado }`: `tic` hace una vuelta y dice
 * cuánto esperar a la siguiente (las pruebas lo llaman a mano).
 */
/** Lo que dura la pregunta de cómo acabó: lo mismo que `RETENCION_CAPTURAS_MS` de servir.mjs (una prueba lo compara). */
export const PREGUNTA_CADUCA_MS = 3 * 3600000;

export function crearSolo({ interno, ajustes, datosPara, ahora = () => Date.now(), registrar = () => {}, intervalos = INTERVALOS_SOLO, programar = setTimeout, cancelar = clearTimeout, apuntar = null, maestriaDe = () => null, alCorregir = null, numerosDe = () => null, alSinLeer = null, guardarSinResultado = null, alFinalSinLeer = null }) {
  // La partida que se vigila para apuntarla sola (3.70.0): el draft de cuando
  // se cerró y su decisión, hasta que la tabla del final dé el resultado.
  let vigilada = null;
  // Lo que no reconoció del último draft (3.71.0), para preguntártelo en la APK.
  let pendiente = null;
  // La partida de la que se te preguntó cómo acabó (3.72.5), hasta que contestes.
  let preguntada = null;
  let draft = draftVacio();
  let ultimoConsejo = null;
  let reloj = null, parado = false;
  // Lo que se cuenta en /estado (3.69.3): sin esto no se sabía si la tablet leía sola.
  // `partidas` (3.83.2): los drafts que acabaron en partida desde que arrancó. Con `apuntadas`
  // dice si la tablet ve el final: el 27 de octubre de 2026 leyó 5 h (2.811 lecturas) sin apuntar ninguna.
  const resumen = { activo: false, linea: null, origen: null, apartado: false, lecturas: 0, partidas: 0, apuntadas: 0, ultima: null };
  /** Apunta UNA vez la partida vigilada, con el resultado leído o el que contestaste. */
  const apuntarVigilada = (v, { gane, t, duracion = null, contestada = false }) => {
    if (!v || v.apuntada) return;
    v.apuntada = true;
    const sola = partidaSolo({ decision: v.decision, linea: v.linea, rango: v.rango, gane, t, duracion, versionModelo: VERSION_MODELO });
    if (!sola) return;
    // De qué draft es y cómo se supo el resultado (3.75.0), solo en la tablet (la base de datos no los guarda):
    // para medir cuánto reconoce sola y para aprender la tabla si arreglas el resultado.
    const partida = { ...sola, desde: v.desde, resultadoDe: contestada ? 'pregunta' : 'tabla' };
    // Si en este draft quedó alguien sin leer (3.81.0), sus recortes, para medir el lector.
    const sinLeer = pendiente?.cuando === v.desde ? pendiente : null;
    apuntar(partida);
    // La corrección contestada ANTES de apuntar la partida (3.74.3): se aplica
    // ahora y la tarjeta no vuelve a salir. Antes se perdía y la partida subía
    // con el draft a medias.
    const yaContestada = interno.correccionContestada?.();
    if (yaContestada && yaContestada.cuando === v.desde) {
      try { alCorregir?.({ partida: partida.t, enemigos: yaContestada.enemigos, aliados: yaContestada.aliados, tuyo: yaContestada.tuyo }); } catch (e) { registrar(`No se pudo arreglar la partida apuntada: ${e.message}`); }
      if (pendiente?.cuando === v.desde) pendiente = null;
    }
    // La corrección sabe de qué partida es: al contestarla, se arregla también su draft.
    const deEsta = pendiente?.cuando === v.desde ? pendiente : null;
    if (deEsta) { pendiente = { ...deEsta, partida: partida.t }; interno.ponerCorreccion?.(pendiente); }
    interno.ponerResumen?.(resumenSolo(partida, v.idioma, deEsta?.faltan ?? 0, numerosDe()));
    resumen.apuntadas = (resumen.apuntadas ?? 0) + 1;
    if (sinLeer) { try { alSinLeer?.({ ids: sinLeer.ids, leidos: sinLeer.leidos, faltan: sinLeer.faltan, cuando: sinLeer.cuando, partida: partida.t }); } catch (e) { registrar(`No se pudieron preparar los recortes del draft: ${e.message}`); } }
    registrar(`Sin móvil: partida apuntada${contestada ? ' con lo que contestaste' : ''}, ${partida.gane ? 'ganada' : 'perdida'} con ${partida.pick}.`);
  };
  /**
   * La tablet no sabe cómo acabó (3.72.5): la victoria no viene de serie (se
   * aprende), la tabla no salió o empezó otro draft sin verla. Antes se
   * quedaba esperando un resultado que no llegaba y la partida no se
   * apuntaba; hoy te lo pregunta la APK (y con tu respuesta aprende la tabla).
   */
  const pickDe = (v) => v.decision.tuyo?.name ?? v.decision.rec.eleccion?.heroe?.name ?? null;
  /**
   * La partida de la que no se supo el resultado (3.81.5) se guarda sin él,
   * con su draft, para que lo digas después en «Mis partidas». Una vez.
   */
  const sinResultado = (v, motivo) => {
    if (!v || v.apuntada) return;
    v.apuntada = true;
    const p = partidaSolo({ decision: v.decision, linea: v.linea, rango: v.rango, gane: false, t: instanteDe(v), versionModelo: VERSION_MODELO });
    const guardada = p && guardarSinResultado ? guardarSinResultado({ ...p, desde: v.desde, gane: undefined }) : false;
    registrar(guardada
      ? `Sin móvil: la partida con ${pickDe(v) ?? '?'} queda en «Mis partidas» sin resultado (${motivo}): dilo ahí cuando quieras.`
      : `Sin móvil: la partida con ${pickDe(v) ?? '?'} se queda sin apuntar: ${motivo}.`);
  };
  /** El instante de una partida vigilada: el del final si se vio; si no, el inicio más lo que duró; si no, el del draft (3.74.3). */
  const instanteDe = (v) => {
    const f = interno.final?.();
    const deEsta = f?.desde === v.desde;
    const duracion = deEsta && !f.inicioEstimado ? f.duracion : null;
    return deEsta && Number.isFinite(f.resultadoEn) ? f.resultadoEn
      : deEsta && Number.isFinite(f.inicio) && duracion != null ? Math.round(f.inicio + duracion * 60000)
        : v.desde;
  };
  const preguntar = (v, motivo) => {
    if (!v || v.apuntada || v.preguntada || !interno.ponerPregunta) return;
    // La APK guarda UNA pregunta: la de antes, sin contestar, se guarda sin resultado (3.81.5; antes se perdía).
    if (preguntada && preguntada !== v && !preguntada.apuntada) sinResultado(preguntada, 'no contestaste cómo acabó');
    v.preguntada = true;
    v.preguntadaEn = ahora();
    preguntada = v;
    const pick = pickDe(v);
    interno.ponerPregunta({ id: `pregunta-${v.desde}`, desde: v.desde, cuando: ahora(), pick });
    // Las pantallas del final de ESTA partida (3.81.5), para ver por qué no se reconoció: del 27 de
    // octubre de 2026 en adelante, todas las preguntas eran «ya hay otro draft», sin ver ninguna tabla.
    const f = interno.final?.();
    if (f?.desde === v.desde && Array.isArray(f.fotogramas) && f.fotogramas.length) {
      try { alFinalSinLeer?.({ desde: v.desde, motivo, fotogramas: f.fotogramas }); } catch (e) { registrar(`No se pudieron preparar las pantallas del final: ${e.message}`); }
    }
    interno.ponerResumen?.(resumenPregunta(v.desde, pick, v.idioma));
    registrar(`Sin móvil: no sé cómo acabó la partida (${motivo}); te lo pregunto en la app de la tablet.`);
  };
  async function tic() {
    // Lo que contestaste en la APK (3.72.5), antes de nada: vale aunque ahora no toque leer.
    const contestada = interno.respuesta?.();
    if (contestada && preguntada && contestada.desde === preguntada.desde) {
      if (typeof contestada.gane === 'boolean') {
        const f = interno.final?.();
        const duracion = f?.desde === preguntada.desde && !f.inicioEstimado ? f.duracion : null;
        // La hora de contestar puede ser horas después, y `t` es la identidad de la partida (3.74.3).
        apuntarVigilada(preguntada, { gane: contestada.gane, t: instanteDe(preguntada), duracion, contestada: true });
      } else {
        preguntada.apuntada = true;
        registrar('Sin móvil: dijiste que esa partida no contó; no se apunta.');
      }
      preguntada = null;
    }
    // La pregunta caduca con sus capturas (la APK deja de enseñarla): que se sepa (3.74.3).
    if (preguntada && !preguntada.apuntada && ahora() - preguntada.preguntadaEn > PREGUNTA_CADUCA_MS) {
      sinResultado(preguntada, 'no contestaste cómo acabó a tiempo');
      preguntada = null;
    }
    const a = ajustes();
    Object.assign(resumen, { activo: !!a.activo, linea: a.linea ?? null, origen: a.origen ?? null, apartado: false });
    if (!a.activo) return intervalos.vacio;
    const movil = interno.delMovil();
    const t = ahora();
    if ((movil.leyo && t - movil.leyo < MOVIL_ACTIVO_MS) || (movil.consejo && t - movil.consejo < MOVIL_ACTIVO_MS)) { resumen.apartado = true; return intervalos.vacio; }
    const r = await interno.leer({ rapida: true });
    if (!r?.ok) return intervalos.error;
    const antes = draft;
    draft = acumularDraft(draft, r.lectura, ahora());
    // Las capturas del draft abierto no se podan (3.81.4): a 1,5 s por lectura, las 40 que se guardan son un minuto.
    interno.protegerLecturas?.(draft.cerrado ? [] : draft.ids);
    resumen.lecturas += 1;
    // Empezó otro draft sin saber cómo acabó la partida de antes: se pregunta.
    if (!draft.cerrado && vigilada && !vigilada.apuntada) {
      const f = interno.final?.();
      if (f?.desde === vigilada.desde && f.inicio) preguntar(vigilada, 'ya hay otro draft');
    }
    if (!draft.cerrado) vigilada = null;
    // Se acaba de cerrar (empezó la partida): a vigilar el final, como si la app lo pidiera.
    if (draft.cerrado && !antes.cerrado) {
      resumen.partidas += 1;
      const datos = datosPara(a.rango);
      pendiente = correccionDelDraft(draft, datos);
      if (pendiente) {
        interno.ponerCorreccion?.(pendiente);
        registrar(`Sin móvil: ${pendiente.faltan} sin reconocer en este draft; al acabar te pregunto quién era${pendiente.faltan === 1 ? '' : 'n'}.`);
      }
      const decision = apuntar ? decidirSolo({ datos, draft, linea: a.linea, maestria: maestriaDe() }) : null;
      if (decision) {
        vigilada = { desde: draft.cerradoEn, decision, linea: a.linea, rango: a.rango, idioma: a.idioma, apuntada: false };
        // Con los consejos en directo de tu pick (3.71.0): la voz habla sin el móvil.
        const directo = guionSolo(decision, a.idioma);
        interno.vigilar?.(vigilada.desde, { ...directo, callar: !!a.callar });
        registrar(`Sin móvil: empieza la partida; vigilo el final para apuntarla (${decision.tuyo?.name ?? `nº1 ${decision.rec.eleccion?.heroe?.name ?? '?'}`}) con ${directo.guion.length} consejos en directo${a.callar ? ' (voz callada)' : ''}.`);
      }
    }
    // Con el resultado de la tabla, la partida se apunta sola (una vez).
    if (vigilada && !vigilada.apuntada) {
      const f = interno.final?.();
      if (f?.desde === vigilada.desde && (f.resultado === 'gane' || f.resultado === 'perdi')) {
        apuntarVigilada(vigilada, { gane: f.resultado === 'gane', t: Number.isFinite(f.resultadoEn) ? f.resultadoEn : ahora(), duracion: f.inicioEstimado ? null : f.duracion });
      } else if (f?.desde === vigilada.desde && f.acabada) {
        // Se vio la tabla del final, pero sin palabra conocida (la victoria se aprende).
        preguntar(vigilada, 'vi la tabla del final pero no la reconozco');
      } else if (f?.desde === vigilada.desde && !f.activa && f.inicio) {
        preguntar(vigilada, 'la vigilancia acabó sin ver la tabla');
      }
    }
    resumen.ultima = {
      cuando: ahora(),
      enPartida: !!r.lectura?.partida,
      baneos: draft.baneos.length, enemigos: draft.enemigos.filter(Boolean).length, aliados: draft.aliados.filter(Boolean).length,
    };
    // La fase, para la burbuja (3.84.0): tras cerrar el draft ya no es draft (la partida la ve el lector).
    interno.ponerFase?.(draft.cerrado ? 'fuera' : (draft.baneos.length || draft.enemigos.some(Boolean) || draft.aliados.some(Boolean)) ? 'draft' : 'fuera');
    if (draft.cerrado) return intervalos.partida;
    const datos = datosPara(a.rango);
    const consejo = consejoSolo({ datos, draft, linea: a.linea, idioma: a.idioma, maestria: maestriaDe() });
    const huella = consejo ? `${consejo.titulo}|${consejo.detalle}` : null;
    if (consejo && huella !== ultimoConsejo) {
      // Si el móvil mandó algo entretanto, manda el móvil.
      const m = interno.delMovil();
      if (!(m.consejo && ahora() - m.consejo < MOVIL_ACTIVO_MS)) {
        interno.ponerConsejo(consejo);
        ultimoConsejo = huella;
        registrar(`Sin móvil: ${consejo.titulo}${consejo.detalle ? ` · ${consejo.detalle}` : ''}`);
      }
    }
    const hayDraft = draft.baneos.length || draft.enemigos.some(Boolean) || draft.aliados.some(Boolean);
    return hayDraft ? intervalos.draft : intervalos.vacio;
  }
  const vuelta = async () => {
    let espera = intervalos.error;
    try { espera = await tic(); } catch (e) { registrar(`Sin móvil: ${e.message}`); }
    if (!parado) reloj = programar(vuelta, espera);
  };
  return {
    tic,
    arrancar: () => { parado = false; reloj = programar(vuelta, intervalos.vacio); },
    parar: () => { parado = true; if (reloj) cancelar(reloj); },
    estado: () => draft,
    resumen: () => ({ ...resumen, ultima: resumen.ultima ? { ...resumen.ultima } : null }),
  };
}

/**
 * Los datos para decidir, preparados UNA vez por fichero y rango. `leer()`
 * da `{ catalogo, meta }` (los de la casa de la app, o los que vienen dentro
 * de la APK); null si no hay catálogo.
 */
export function datosDelSolo(leer) {
  let huella = null, preparados = null;
  return (rango) => {
    const f = leer();
    if (!f?.catalogo) return null;
    const h = `${f.meta?.generatedAt ?? ''}|${rango}|${f.catalogo?.heroes?.length ?? 0}`;
    if (h !== huella) { preparados = prepararDatos({ catalogo: f.catalogo, meta: f.meta, rango }); huella = h; }
    return preparados;
  };
}
