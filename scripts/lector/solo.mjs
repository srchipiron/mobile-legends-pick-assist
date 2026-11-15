/**
 * El modo solo: la tablet lleva el draft (protocolo 2). Lee la pantalla,
 * junta las lecturas (acumular.mjs), decide con el MISMO motor que Pick
 * Assist (`recomendar` de draft.js, el único cerebro), pinta la burbuja,
 * vigila el final, pregunta lo que no supo y apunta la partida. El móvil la
 * copia (`paraElMovil`) y le manda lo que tú tocas (`corregir`, `resultado`).
 * Siempre que haya línea (la de la APK o la del móvil), conduce ella.
 *
 * Solo MIRA la pantalla, como todo el lector: no toca el juego ni la cuenta.
 */
import { readFileSync } from 'node:fs';
import { nombreClave } from '../../src/motor/nombres.js';
import { prepararDatos, recomendar, poolDe } from '../../src/motor/draft.js';
import { VERSION_MODELO } from '../../src/motor/modelo.js';
import { buildEnUnaLinea } from '../../src/motor/builds.js';
import { BANEOS_EN_EL_DRAFT, PREGUNTA_CADUCA_MS } from '../../src/comun/contrato.js';
import { acumularDraft, draftVacio, conCorreccion, registrarCorreccion, faseDe, leeAlguien } from './acumular.mjs';

// [compat] Lo importa pruebas/app/lector.test hasta que lo tome de contrato.js.
export { BANEOS_EN_EL_DRAFT };

/** [C] Las líneas que se pueden elegir (las de `LINEAS` del motor). */
export const LINEAS_SOLO = ['roam', 'jungle', 'mid', 'gold', 'exp'];
/** [M] Cada cuánto se lee: en el draft 1,5 s (una lectura tarda 0,6–1,6 s y el último pick se ve unos segundos antes de las skins); vacío, en partida (solo minimapa) y tras un fallo. */
export const INTERVALOS_SOLO = { draft: 1500, vacio: 12000, partida: 20000, error: 30000 };
/** [M] Lo menos que separa dos tablas del final: ninguna partida de 126 duró menos de 8 minutos y entre dos de Javi nunca hubo menos de 12. */
export const MINUTOS_ENTRE_TABLAS = 10;
/** [P] Tus habituales que salen como botones «¿Con quién jugaste tú?» (los que caben en una fila). */
export const HABITUALES = 6;
/** [P] Derrotas seguidas desde las que el resumen dice cómo te va tras perder. */
export const RACHA_PARA_AVISAR = 2;

/**
 * El draft leído, pasado al catálogo y al motor. null sin datos o sin nada
 * leído. Lo usan la burbuja y la partida que se apunta: la misma decisión.
 * [D] Un héroe elegido no puede estar baneado: si sale en los dos, el baneo es el leído mal.
 */
export function decidirSolo({ datos, draft, linea }) {
  if (!datos?.heroes?.length || !draft || !LINEAS_SOLO.includes(linea)) return null;
  const porClave = new Map(datos.heroes.map((h) => [nombreClave(h.name), h]));
  const heroe = (n) => (n ? porClave.get(nombreClave(n)) ?? null : null);
  const unicos = (lista) => [...new Map(lista.filter(Boolean).map((h) => [h.name, h])).values()];
  const enemigos = unicos(draft.enemigos.map(heroe));
  const tuyo = draft.tuyoFila >= 0 ? heroe(draft.aliados[draft.tuyoFila]) : null;
  const nombresEnemigos = new Set(enemigos.map((h) => h.name));
  const aliados = unicos(draft.aliados.filter((_, i) => i !== draft.tuyoFila).map(heroe)).filter((h) => !nombresEnemigos.has(h.name) && h.name !== tuyo?.name);
  const elegidos = new Set([...enemigos, ...aliados, tuyo].filter(Boolean).map((h) => h.name));
  const baneos = unicos(draft.baneos.map(heroe)).filter((h) => !elegidos.has(h.name));
  if (!baneos.length && !enemigos.length && !aliados.length && !tuyo) return null;
  const rec = recomendar(datos, { linea, enemigos, aliados, baneos, miPick: tuyo, conSimulacion: false });
  return { rec, tuyo, baneos, enemigos, aliados };
}

const TEXTOS = {
  es: { build: (h, l) => `${h}: ${l}`, buildDetalle: 'Tu build', banea: (l) => `Banea: ${l}`, tuNumeroUno: (h) => `Tu nº1 ahora: ${h}`, luego: (l) => `Luego: ${l}`, baneos: 'Fase de baneos', picks: 'Fase de picks' },
  en: { build: (h, l) => `${h}: ${l}`, buildDetalle: 'Your build', banea: (l) => `Ban: ${l}`, tuNumeroUno: (h) => `Your no. 1 now: ${h}`, luego: (l) => `Then: ${l}`, baneos: 'Ban phase', picks: 'Pick phase' },
};

/**
 * La burbuja: en baneos a quién banear; con tu héroe ya elegido, su build
 * para este draft; si no, tu nº1 con los dos siguientes. La fase va delante
 * de la segunda línea. null si no hay nada que decir. Nunca lanza.
 */
export function consejoSolo({ datos, draft, linea, idioma = 'es' }) {
  try {
    if (!draft || draft.cerrado) return null;
    const d = decidirSolo({ datos, draft, linea });
    if (!d) return null;
    const { rec, baneos, enemigos, aliados } = d;
    const t = TEXTOS[idioma] ?? TEXTOS.es;
    const pct = (p) => `${Math.round(p * 100)}%`;
    if (!enemigos.length && !aliados.length) {
      const yaBaneados = new Set(baneos.map((h) => h.name));
      const lista = (rec.baneosSugeridos ?? []).map((b) => b.heroe?.name).filter((n) => n && !yaBaneados.has(n)).slice(0, 3);
      if (lista.length && baneos.length < 10) return { titulo: t.banea(lista.join(' · ')), detalle: [t.baneos, rec.eleccion?.heroe ? t.tuNumeroUno(rec.eleccion.heroe.name) : null].filter(Boolean).join(' · ') };
    }
    if (d.tuyo) {
      const b = buildEnUnaLinea({ builds: datos.crudo?.builds, equipment: datos.crudo?.equipment, heroe: d.tuyo, linea, enemigos });
      if (b) return { titulo: t.build(d.tuyo.name, b.objetos.slice(0, 3).join(' → ')), detalle: [t.picks, t.buildDetalle, b.objetos.length > 3 ? `+ ${b.objetos.slice(3).join(' → ')}` : null, [b.emblema, b.hechizo].filter(Boolean).join(' · ') || null].filter(Boolean).join(' · ') };
    }
    const e = rec.eleccion;
    if (!e?.heroe) return null;
    const otros = rec.ranking.filter((r) => r.heroe.name !== e.heroe.name).slice(0, 2).map((r) => `${r.heroe.name} ${pct(r.p)}`);
    return { titulo: `${e.heroe.name} ${pct(e.p)}`, detalle: [t.picks, otros.length ? t.luego(otros.join(' · ')) : null].filter(Boolean).join(' · ') };
  } catch { return null; }
}

/**
 * La partida que apunta la tablet, con la forma de `apuntar` (registro.js):
 * tu pick (tu fila o, sin ella, el nº1 marcado `supuesto`), los tres
 * recomendados, la estimación, los baneos, el draft y la duración (3–90 min,
 * solo con el inicio visto). null sin pick o sin resultado.
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

/** Tus héroes de la línea con más partidas (las de siempre o las apuntadas), sin los que ya salen en el draft. */
export function tusHabituales(datos, linea, maestria, yaSalen = []) {
  const no = new Set(yaSalen.filter(Boolean).map(nombreClave));
  const partidas = (h) => { const m = maestria?.[nombreClave(h.name)]; return Number(m?.deSiempre ?? m?.games) || 0; };
  return poolDe(datos, linea).map((h) => ({ nombre: h.name, n: partidas(h) }))
    .filter((x) => x.n > 0 && !no.has(nombreClave(x.nombre)))
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
    .slice(0, HABITUALES).map((x) => x.nombre);
}

/**
 * Lo que quedó sin leer al cerrarse el draft, para la tarjeta «Enseña al
 * lector» de la APK: con las capturas del draft, tu respuesta enseña al
 * lector. Tus habituales solo si falta el tuyo. null si no falta nadie.
 */
export function correccionDelDraft(draft, datos, { tuyos = [] } = {}) {
  if (!draft?.cerrado || !draft.ids?.length || !datos?.heroes?.length) return null;
  const porClave = new Map(datos.heroes.map((h) => [nombreClave(h.name), h.name]));
  const nombre = (n) => (n ? porClave.get(nombreClave(n)) ?? null : null);
  const enemigos = draft.enemigos.map(nombre);
  const aliados = draft.aliados.map(nombre);
  const faltan = enemigos.filter((n) => !n).length + aliados.filter((n) => !n).length;
  if (!faltan) return null;
  return {
    id: `correccion-${draft.cerradoEn}`, ids: draft.ids.slice(), cuando: draft.cerradoEn,
    leidos: { enemigos, aliados, tuyoFila: draft.tuyoFila, baneos: draft.baneos.slice(0, 10) },
    faltan,
    heroes: [...porClave.values()].sort((a, b) => a.localeCompare(b)),
    ...(!(draft.tuyoFila >= 0 && aliados[draft.tuyoFila]) && tuyos.length ? { tuyos: tuyos.map(nombre).filter(Boolean) } : {}),
  };
}

/** La notificación de la pregunta: tocarla abre la APK, donde se contesta. */
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

/** La notificación al apuntar: el nº1, el %, cómo va la sesión y, en racha mala, cómo te va tras perder (con tus partidas). */
export function resumenSolo(partida, idioma = 'es', numeros = null) {
  const en = idioma === 'en';
  const primero = partida.recomendados?.[0];
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
    ].filter(Boolean).join(' '),
  };
}

/** `solo.json` de la APK: la línea (sin ella, apagado), el rango y el idioma. `apagado` es «Apagado» tocado: manda sobre la línea del móvil. */
export function leerAjustesSolo(fichero) {
  try {
    const j = JSON.parse(readFileSync(fichero, 'utf8'));
    const linea = LINEAS_SOLO.includes(j?.linea) ? j.linea : null;
    return { activo: !!linea && j.activo !== false, apagado: j?.activo === false, linea, rango: typeof j.rango === 'string' && /^[a-z]{2,12}$/.test(j.rango) ? j.rango : 'glory', idioma: j.idioma === 'en' ? 'en' : 'es' };
  } catch { return { activo: false, apagado: false, linea: null, rango: 'glory', idioma: 'es' }; }
}

/** Con qué lee la tablet: la línea de la APK; si no hay y no está «Apagado», la última del móvil. */
export function ajustesEfectivos(apk, movil) {
  if (apk?.activo) return { ...apk, origen: 'apk' };
  if (apk?.apagado) return { ...apk, activo: false, origen: 'apagado' };
  if (movil && LINEAS_SOLO.includes(movil.linea)) {
    return { activo: true, apagado: false, linea: movil.linea, rango: typeof movil.rango === 'string' && /^[a-z]{2,12}$/.test(movil.rango) ? movil.rango : 'glory', idioma: movil.idioma === 'en' ? 'en' : 'es', origen: 'movil' };
  }
  return { ...(apk ?? { linea: null, rango: 'glory', idioma: 'es' }), activo: false, origen: 'sinLinea' };
}

/** Los datos para decidir, preparados UNA vez por fichero y rango. `leer()` da `{ catalogo, meta }`. */
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

/** Lo que solo sabe la tablet de una partida apuntada (no va al móvil ni a la base de datos). */
const sinLoDeLaTablet = ({ desde, resultadoDe, leida, ...resto }) => resto;

/**
 * El bucle. `interno` es el de `crearServidor`; `datosPara(rango)` da los
 * datos preparados; `apuntar(partida)` la guarda. Devuelve `{ tic, arrancar,
 * parar, estado, resumen, paraElMovil, corregir, resultado }`: `tic` hace
 * una vuelta y dice cuánto esperar (las pruebas lo llaman a mano).
 */
export function crearSolo({
  interno, ajustes, datosPara, ahora = () => Date.now(), registrar = () => {}, intervalos = INTERVALOS_SOLO, programar = setTimeout, cancelar = clearTimeout,
  apuntar = null, maestriaDe = () => null, alCorregir = null, numerosDe = () => null, alSinLeer = null, guardarSinResultado = null, alFinalSinLeer = null, alApuntarTabla = null,
  partidaGuardada = () => null, alCambiarResultado = null,
}) {
  let draft = draftVacio();
  /** La partida del draft que se cerró, mientras se vigila su final (la del último draft cerrado sigue en `ultima`). */
  let vigilada = null, ultima = null, preguntada = null, pendiente = null;
  let ultimaTabla = null, ultimoConsejo = null, vacias = 0;
  let reloj = null, parado = false;
  const aprendidas = new Set();
  const resumen = { activo: false, linea: null, origen: null, lecturas: 0, partidas: 0, apuntadas: 0, sinBaneos: 0, ultima: null };
  const pickDe = (v) => v.decision.tuyo?.name ?? v.decision.rec.eleccion?.heroe?.name ?? null;

  /** El instante de una partida: el del resultado si se vio; si no, el inicio más lo que duró; si no, el cierre del draft. */
  const instanteDe = (v) => {
    const f = interno.final?.();
    const deEsta = f?.desde === v.desde;
    const duracion = deEsta && !f.inicioEstimado ? f.duracion : null;
    return deEsta && Number.isFinite(f.resultadoEn) ? f.resultadoEn
      : deEsta && Number.isFinite(f.inicio) && duracion != null ? Math.round(f.inicio + duracion * 60000)
        : v.desde;
  };

  /** Apunta UNA vez la partida, con el resultado leído o el que contestaste. Devuelve la partida o null. */
  const apuntarVigilada = (v, { gane, t, duracion = null, contestada = false }) => {
    if (!v || v.apuntada) return null;
    v.apuntada = true;
    const sola = partidaSolo({ decision: v.decision, linea: v.linea, rango: v.rango, gane, t, duracion, versionModelo: VERSION_MODELO });
    if (!sola) { v.estado = 'sinResultado'; return null; }
    const partida = { ...sola, desde: v.desde, resultadoDe: contestada ? 'pregunta' : 'tabla' };
    const sinLeer = pendiente?.cuando === v.desde ? pendiente : null;
    apuntar?.(partida);
    Object.assign(v, { estado: 'apuntada', gane: partida.gane, registro: partida });
    // La corrección contestada en la APK antes de apuntar se aplica ahora.
    const yaContestada = interno.correccionContestada?.();
    if (yaContestada && yaContestada.cuando === v.desde) {
      try { alCorregir?.({ partida: partida.t, enemigos: yaContestada.enemigos, aliados: yaContestada.aliados, tuyo: yaContestada.tuyo }); } catch (e) { registrar(`No se pudo arreglar la partida apuntada: ${e.message}`); }
      v.registro = partidaGuardada(partida.t) ?? v.registro;
      if (pendiente?.cuando === v.desde) pendiente = null;
    }
    if (pendiente?.cuando === v.desde) { pendiente = { ...pendiente, partida: partida.t }; interno.ponerCorreccion?.(pendiente); }
    interno.ponerResumen?.(resumenSolo(partida, v.idioma, numerosDe()));
    resumen.apuntadas += 1;
    if (sinLeer) { try { alSinLeer?.({ ids: sinLeer.ids, leidos: sinLeer.leidos, faltan: sinLeer.faltan, cuando: sinLeer.cuando, partida: partida.t }); } catch (e) { registrar(`No se pudieron preparar los recortes del draft: ${e.message}`); } }
    registrar(`Partida apuntada${contestada ? ' con lo que contestaste' : ''}, ${partida.gane ? 'ganada' : 'perdida'} con ${partida.pick}.`);
    return partida;
  };

  /** La partida de la que no se supo el resultado: se guarda sin él (lo dices después en «Mis partidas»). */
  const sinResultado = (v, motivo) => {
    if (!v || v.apuntada) return;
    v.apuntada = true;
    v.estado = 'sinResultado';
    const p = partidaSolo({ decision: v.decision, linea: v.linea, rango: v.rango, gane: false, t: v.tSinResultado ?? instanteDe(v), versionModelo: VERSION_MODELO });
    const guardada = p && guardarSinResultado ? guardarSinResultado({ ...p, desde: v.desde, gane: undefined }) : false;
    if (guardada) v.tGuardada = p.t;
    registrar(guardada
      ? `La partida con ${pickDe(v) ?? '?'} queda en «Mis partidas» sin resultado (${motivo}): dilo ahí cuando quieras.`
      : `La partida con ${pickDe(v) ?? '?'} se queda sin apuntar: ${motivo}.`);
  };

  /** No sé cómo acabó: se pregunta UNA vez (la APK guarda una pregunta: la de antes sin contestar queda sin resultado). */
  const preguntar = (v, motivo) => {
    if (!v || v.apuntada || v.preguntada || !interno.ponerPregunta) return;
    if (preguntada && preguntada !== v && !preguntada.apuntada) sinResultado(preguntada, 'no contestaste cómo acabó');
    Object.assign(v, { preguntada: true, preguntadaEn: ahora(), estado: 'preguntando' });
    // [D] Su instante, UNA vez: el mismo en la tablet, en las pantallas del final y en lo que contestes.
    v.tSinResultado = instanteDe(v);
    preguntada = v;
    const pick = pickDe(v);
    interno.ponerPregunta({ id: `pregunta-${v.desde}`, desde: v.desde, cuando: ahora(), pick });
    const f = interno.final?.();
    if (f?.desde === v.desde && Array.isArray(f.fotogramas) && f.fotogramas.length) {
      const sin = partidaSolo({ decision: v.decision, linea: v.linea, rango: v.rango, gane: false, t: v.tSinResultado, versionModelo: VERSION_MODELO });
      const partida = sin ? (({ gane, ...resto }) => resto)(sin) : null;
      try { alFinalSinLeer?.({ desde: v.desde, motivo, fotogramas: f.fotogramas, ...(partida ? { partida } : {}) }); } catch (e) { registrar(`No se pudieron preparar las pantallas del final: ${e.message}`); }
    }
    interno.ponerResumen?.(resumenPregunta(v.desde, pick, v.idioma));
    registrar(`No sé cómo acabó la partida (${motivo}); te lo pregunto en la app de la tablet.`);
  };

  /** Aprender de la corrección de un draft CERRADO, una vez por contenido. */
  const aprenderDe = (d, c) => {
    if (!d?.cerrado || !d.ids?.length || !c?.enemigos?.length || !interno.aprenderDe) return;
    const huella = JSON.stringify([d.desde, c.enemigos, c.aliados, c.tuyo, c.baneos]);
    if (aprendidas.has(huella)) return;
    aprendidas.add(huella);
    Promise.resolve(interno.aprenderDe({ ids: d.ids, enemigos: c.enemigos, aliados: c.aliados, tuyo: c.tuyo, baneos: c.baneos }))
      .catch((e) => registrar(`No se pudo aprender de tu corrección: ${e.message}`));
  };

  /** La decisión de la partida con la corrección, y la partida ya apuntada arreglada. */
  const corregirPartida = (v, c) => {
    const decision = decidirSolo({ datos: datosPara(v.rango), draft: conCorreccion(v.draft, c), linea: v.linea });
    if (decision) v.decision = decision;
    if (v.estado === 'apuntada' && v.registro) {
      try { alCorregir?.({ partida: v.registro.t, enemigos: c.enemigos, aliados: c.aliados, tuyo: c.tuyo }); } catch (e) { registrar(`No se pudo arreglar la partida apuntada: ${e.message}`); }
      v.registro = partidaGuardada(v.registro.t) ?? v.registro;
    }
  };

  async function tic() {
    // Lo contestado en la APK, antes de nada: vale aunque ahora no toque leer.
    const contestada = interno.respuesta?.();
    if (contestada && preguntada && contestada.desde === preguntada.desde) {
      if (typeof contestada.gane === 'boolean') {
        const f = interno.final?.();
        const duracion = f?.desde === preguntada.desde && !f.inicioEstimado ? f.duracion : null;
        apuntarVigilada(preguntada, { gane: contestada.gane, t: preguntada.tSinResultado ?? instanteDe(preguntada), duracion, contestada: true });
      } else {
        Object.assign(preguntada, { apuntada: true, estado: 'sinResultado', gane: null });
        registrar('Dijiste que esa partida no contó; no se apunta.');
      }
      preguntada = null;
    }
    if (preguntada && !preguntada.apuntada && ahora() - preguntada.preguntadaEn > PREGUNTA_CADUCA_MS) {
      sinResultado(preguntada, 'no contestaste cómo acabó a tiempo');
      preguntada = null;
    }
    const a = ajustes();
    Object.assign(resumen, { activo: !!a.activo, linea: a.linea ?? null, origen: a.origen ?? null });
    // Sin línea no se lee: sin fase (no se sabe qué hay delante) y sin burbuja.
    if (!a.activo) { interno.ponerFase?.(null); if (ultimoConsejo) { interno.ponerConsejo?.(null); ultimoConsejo = null; } return intervalos.vacio; }
    const r = await interno.leer({ rapida: true });
    if (!r?.ok) { interno.ponerFase?.(null); return intervalos.error; }
    const antes = draft;
    draft = acumularDraft(draft, r.lectura, ahora());
    interno.protegerLecturas?.(draft.cerrado ? [] : draft.ids);
    resumen.lecturas += 1;
    // Empezó otro draft sin saber cómo acabó la partida de antes: se pregunta.
    if (!draft.cerrado && vigilada && !vigilada.apuntada) {
      const f = interno.final?.();
      if (f?.desde === vigilada.desde && f.inicio) preguntar(vigilada, 'ya hay otro draft');
    }
    if (!draft.cerrado) vigilada = null;
    if (draft.cerrado && !antes.cerrado) {
      resumen.partidas += 1;
      if (new Set(draft.baneos).size < BANEOS_EN_EL_DRAFT) {
        resumen.sinBaneos += 1;
        registrar('Este draft se cerró sin leer los baneos (se abrió por los picks); si pasa en todas, el juego ha cambiado su pantalla.');
      }
      const datos = datosPara(a.rango);
      const vista = conCorreccion(draft);
      pendiente = correccionDelDraft(vista, datos, { tuyos: tusHabituales(datos, a.linea, maestriaDe(), [...vista.enemigos, ...vista.aliados, ...vista.baneos]) });
      if (pendiente) {
        interno.ponerCorreccion?.(pendiente);
        registrar(`${pendiente.faltan} sin reconocer en este draft; al acabar te pregunto quién era${pendiente.faltan === 1 ? '' : 'n'}.`);
      }
      aprenderDe(draft, draft.correccion);
      const decision = decidirSolo({ datos, draft: vista, linea: a.linea });
      if (decision) {
        vigilada = { desde: draft.cerradoEn, draftDesde: draft.desde, draft, decision, linea: a.linea, rango: a.rango, idioma: a.idioma, apuntada: false, estado: 'vigilando', gane: null, registro: null };
        ultima = vigilada;
        interno.vigilar?.(vigilada.desde);
        registrar(`Empieza la partida; vigilo el final para apuntarla (${decision.tuyo?.name ?? `nº1 ${decision.rec.eleccion?.heroe?.name ?? '?'}`}).`);
      }
    }
    if (vigilada && !vigilada.apuntada) {
      const f = interno.final?.();
      const deEsta = f?.desde === vigilada.desde;
      const conResultado = deEsta && (f.resultado === 'gane' || f.resultado === 'perdi');
      if (conResultado && Number.isFinite(f.resultadoEn) && Number.isFinite(ultimaTabla) && f.resultadoEn - ultimaTabla < MINUTOS_ENTRE_TABLAS * 60000) {
        Object.assign(vigilada, { apuntada: true, estado: 'sinResultado' });
        registrar(`La tabla del final llega ${Math.round((f.resultadoEn - ultimaTabla) / 60000 * 10) / 10} min después de la anterior; es la misma partida y no la apunto otra vez.`);
      } else if (conResultado) {
        if (Number.isFinite(f.resultadoEn)) ultimaTabla = f.resultadoEn;
        const apuntada = apuntarVigilada(vigilada, { gane: f.resultado === 'gane', t: Number.isFinite(f.resultadoEn) ? f.resultadoEn : ahora(), duracion: f.inicioEstimado ? null : f.duracion });
        if (apuntada) { try { alApuntarTabla?.({ t: apuntada.t, gane: apuntada.gane, fotograma: (f.fotogramas ?? []).find((x) => x.id === f.resultadoId) ?? null }); } catch (e) { registrar(`No se pudo preparar el comprobante: ${e.message}`); } }
      } else if (deEsta && f.acabada) {
        preguntar(vigilada, 'vi la tabla del final pero no la reconozco');
      } else if (deEsta && !f.activa && f.inicio) {
        preguntar(vigilada, 'la vigilancia acabó sin ver la tabla');
      }
    }
    resumen.ultima = { cuando: ahora(), enPartida: !!r.lectura?.partida, baneos: draft.baneos.length, enemigos: draft.enemigos.filter(Boolean).length, aliados: draft.aliados.filter(Boolean).length };
    vacias = leeAlguien(r.lectura) || r.lectura?.partida ? 0 : vacias + 1;
    interno.ponerFase?.(faseDe(draft, r.lectura, vacias));
    if (draft.cerrado) return intervalos.partida;
    const consejo = consejoSolo({ datos: datosPara(a.rango), draft: conCorreccion(draft), linea: a.linea, idioma: a.idioma });
    const huella = consejo ? `${consejo.titulo}|${consejo.detalle}` : null;
    if (consejo && huella !== ultimoConsejo) {
      interno.ponerConsejo(consejo);
      ultimoConsejo = huella;
      registrar(`Burbuja: ${consejo.titulo}${consejo.detalle ? ` · ${consejo.detalle}` : ''}`);
    }
    const hayDraft = draft.baneos.length || draft.enemigos.some(Boolean) || draft.aliados.some(Boolean);
    return hayDraft ? intervalos.draft : intervalos.vacio;
  }

  const vuelta = async () => {
    let espera = intervalos.error;
    try { espera = await tic(); } catch (e) { registrar(`Modo solo: ${e.message}`); }
    if (!parado) reloj = programar(vuelta, espera);
  };

  /** Los nombres en la grafía del catálogo (el móvil los busca ahí). */
  const delCatalogo = (rango) => {
    const datos = datosPara(rango);
    const porClave = new Map((datos?.heroes ?? []).map((h) => [nombreClave(h.name), h.name]));
    return (n) => (n ? porClave.get(nombreClave(n)) ?? n : null);
  };

  return {
    tic,
    arrancar: () => { parado = false; reloj = programar(vuelta, intervalos.vacio); },
    parar: () => { parado = true; if (reloj) cancelar(reloj); },
    estado: () => draft,
    resumen: () => ({ ...resumen, ultima: resumen.ultima ? { ...resumen.ultima } : null }),
    /** `GET /draft`: el draft abierto o el último cerrado (con tu corrección encima) y la partida del último cerrado. */
    paraElMovil() {
      const a = ajustes();
      const nombre = delCatalogo(a.rango);
      const d = draft.desde != null ? conCorreccion(draft) : null;
      return {
        draft: d && {
          desde: d.desde, cambiado: d.actividad ?? d.desde, cerrado: d.cerrado, cerradoEn: d.cerradoEn, linea: a.linea ?? null,
          enemigos: d.enemigos.map(nombre), aliados: d.aliados.map(nombre), tuyoFila: d.tuyoFila,
          tuyo: d.tuyoFila >= 0 ? nombre(d.aliados[d.tuyoFila]) : null, baneos: d.baneos.map(nombre), porPicks: !!d.porPicks, corregido: !!d.correccion,
        },
        partida: ultima && { desde: ultima.draftDesde, estado: ultima.estado, gane: ultima.gane, registro: ultima.estado === 'apuntada' && ultima.registro ? sinLoDeLaTablet(ultima.registro) : null },
      };
    },
    /** `POST /draft`: tu corrección manda sobre lo leído de ESE draft (burbuja, partida que se apunte) y la tablet aprende de ella. false si no es el draft actual ni el último cerrado. */
    corregir(c) {
      const enCurso = draft.desde != null && c.desde === draft.desde;
      const delUltimo = ultima != null && c.desde === ultima.draftDesde;
      if (!enCurso && !delUltimo) return false;
      const base = enCurso ? draft : ultima.draft;
      const registrada = registrarCorreccion(conCorreccion(base, null), c);
      if (enCurso) draft = { ...draft, correccion: registrada };
      if (delUltimo) { ultima.draft = { ...ultima.draft, correccion: registrada }; corregirPartida(ultima, registrada); }
      if (pendiente && pendiente.cuando === base.cerradoEn) { pendiente = null; interno.ponerCorreccion?.(null); }
      aprenderDe(base, registrada);
      ultimoConsejo = null;
      registrar(`Corrección del móvil: ${registrada.enemigos.length} enemigos, ${registrada.aliados.length} compañeros${registrada.tuyo ? `, tú ${registrada.tuyo}` : ''}.`);
      return true;
    },
    /** `POST /resultado`: apunta ESA partida con ese resultado (o la arregla), y deja de vigilarla y de preguntar. false si no es la del último draft cerrado. */
    resultado({ desde, gane }) {
      const v = ultima && ultima.draftDesde === desde ? ultima : null;
      if (!v) return false;
      interno.terminarVigilancia?.(v.desde);
      if (preguntada === v) { preguntada = null; interno.ponerPregunta?.(null); }
      if (v.estado === 'apuntada' || (v.estado === 'sinResultado' && Number.isFinite(v.tGuardada))) {
        if (gane === null) return v.estado === 'sinResultado';
        if (gane === v.gane) return true;
        const t = v.registro?.t ?? v.tGuardada;
        const nueva = alCambiarResultado?.(t, gane);
        if (!nueva) return false;
        Object.assign(v, { estado: 'apuntada', gane, registro: partidaGuardada(t) ?? nueva });
        registrar(`Resultado cambiado desde el móvil: ${gane ? 'ganada' : 'perdida'}.`);
        return true;
      }
      if (v.apuntada) return gane === null;
      if (gane === null) {
        Object.assign(v, { apuntada: true, estado: 'sinResultado', gane: null });
        registrar('El móvil dice que esa partida no contó; no se apunta.');
        return true;
      }
      const f = interno.final?.();
      const duracion = f?.desde === v.desde && !f.inicioEstimado ? f.duracion : null;
      apuntarVigilada(v, { gane, t: v.tSinResultado ?? instanteDe(v), duracion, contestada: true });
      return true;
    },
  };
}
