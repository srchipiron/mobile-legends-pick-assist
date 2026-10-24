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
import { nombreClave } from '../../src/motor/nombres.js';
import { prepararDatos, recomendar } from '../../src/motor/draft.js';

/** Las líneas que se pueden elegir en la APK (las de `LINEAS` del motor). */
export const LINEAS_SOLO = ['roam', 'jungle', 'mid', 'gold', 'exp'];
/** Cada cuánto se lee: en un draft, sin draft a la vista y en partida (solo el minimapa). Decisión de producto, como «Leer solo» de la app. */
export const INTERVALOS_SOLO = { draft: 5000, vacio: 12000, partida: 20000, error: 30000 };
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

export const draftVacio = () => ({ baneos: [], enemigos: [null, null, null, null, null], aliados: [null, null, null, null, null], tuyoFila: -1, cerrado: false, cerradoEn: null, enPartida: 0, actividad: null });

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
  const baneos = [...nombres(lectura.tuyos), ...nombres(lectura.suyos)].filter(Boolean);
  const enemigos = nombres(lectura.enemigos);
  const filas = nombres(lectura.aliados);
  const algo = baneos.length || enemigos.some(Boolean) || filas.some(Boolean);
  // Un draft nuevo: tras la partida (pasados unos minutos, con algo leído) o
  // si el de antes lleva mucho sin moverse.
  const otro = algo && ((e.cerrado && ahora - e.cerradoEn >= MINUTOS_PARA_OTRO_DRAFT * 60000)
    || (!e.cerrado && e.actividad != null && ahora - e.actividad >= MINUTOS_DRAFT_ABANDONADO * 60000));
  if (otro) e = draftVacio();
  if (e.cerrado) return { ...e, enPartida: 0 };
  const tuyoFila = Number.isInteger(lectura.tuyoFila) && lectura.tuyoFila >= 0 && lectura.tuyoFila < 5 ? lectura.tuyoFila : e.tuyoFila;
  const nuevosBaneos = [...new Set([...e.baneos, ...baneos])].slice(0, 10);
  const enem = fundirHuecos(e.enemigos, enemigos);
  const ali = fundirHuecos(e.aliados, filas, tuyoFila);
  const cambio = nuevosBaneos.length !== e.baneos.length || enem.cambio || ali.cambio || tuyoFila !== e.tuyoFila;
  return { ...e, baneos: nuevosBaneos, enemigos: enem.huecos, aliados: ali.huecos, tuyoFila, enPartida: 0, actividad: cambio ? ahora : e.actividad ?? (algo ? ahora : null) };
}

const TEXTOS = {
  es: { banea: (l) => `Banea: ${l}`, tuNumeroUno: (h) => `Tu nº1 ahora: ${h}`, luego: (l) => `Luego: ${l}`, baneos: 'Fase de baneos', picks: 'Fase de picks' },
  en: { banea: (l) => `Ban: ${l}`, tuNumeroUno: (h) => `Your no. 1 now: ${h}`, luego: (l) => `Then: ${l}`, baneos: 'Ban phase', picks: 'Pick phase' },
};

/**
 * Del draft al consejo de la burbuja, con el motor de la app. null si no hay
 * nada que decir (sin datos o sin draft a la vista). Nunca lanza.
 */
export function consejoSolo({ datos, draft, linea, idioma = 'es' }) {
  try {
    if (!datos?.heroes?.length || !draft || draft.cerrado || !LINEAS_SOLO.includes(linea)) return null;
    const porClave = new Map(datos.heroes.map((h) => [nombreClave(h.name), h]));
    const heroe = (n) => (n ? porClave.get(nombreClave(n)) ?? null : null);
    const unicos = (lista) => [...new Map(lista.filter(Boolean).map((h) => [h.name, h])).values()];
    const baneos = unicos(draft.baneos.map(heroe));
    const enemigos = unicos(draft.enemigos.map(heroe));
    const tuyo = draft.tuyoFila >= 0 ? heroe(draft.aliados[draft.tuyoFila]) : null;
    const nombresEnemigos = new Set(enemigos.map((h) => h.name));
    const aliados = unicos(draft.aliados.filter((_, i) => i !== draft.tuyoFila).map(heroe)).filter((h) => !nombresEnemigos.has(h.name) && h.name !== tuyo?.name);
    if (!baneos.length && !enemigos.length && !aliados.length && !tuyo) return null;
    const rec = recomendar(datos, { linea, enemigos, aliados, baneos, miPick: tuyo, conSimulacion: false });
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
    const otros = rec.ranking.filter((r) => r.heroe.name !== e.heroe.name).slice(0, 2).map((r) => `${r.heroe.name} ${pct(r.p)}`);
    return { titulo: `${e.heroe.name} ${pct(e.p)}`, detalle: [t.picks, otros.length ? t.luego(otros.join(' · ')) : null].filter(Boolean).join(' · ') };
  } catch { return null; }
}

/** Lo que la APK escribe en `solo.json`: la línea (sin ella, apagado), el rango y el idioma. */
export function leerAjustesSolo(fichero) {
  try {
    const j = JSON.parse(readFileSync(fichero, 'utf8'));
    const linea = LINEAS_SOLO.includes(j?.linea) ? j.linea : null;
    return { activo: !!linea && j.activo !== false, linea, rango: typeof j.rango === 'string' && /^[a-z]{2,12}$/.test(j.rango) ? j.rango : 'glory', idioma: j.idioma === 'en' ? 'en' : 'es' };
  } catch { return { activo: false, linea: null, rango: 'glory', idioma: 'es' }; }
}

/**
 * El bucle del modo solo. `interno` es el de `crearServidor` (leer,
 * delMovil, ponerConsejo); `datosPara(rango)` da los datos preparados (o
 * null). Devuelve `{ tic, parar, estado }`: `tic` hace una vuelta y dice
 * cuánto esperar a la siguiente (las pruebas lo llaman a mano).
 */
export function crearSolo({ interno, ajustes, datosPara, ahora = () => Date.now(), registrar = () => {}, intervalos = INTERVALOS_SOLO, programar = setTimeout, cancelar = clearTimeout }) {
  let draft = draftVacio();
  let ultimoConsejo = null;
  let reloj = null, parado = false;
  async function tic() {
    const a = ajustes();
    if (!a.activo) return intervalos.vacio;
    const movil = interno.delMovil();
    const t = ahora();
    if ((movil.leyo && t - movil.leyo < MOVIL_ACTIVO_MS) || (movil.consejo && t - movil.consejo < MOVIL_ACTIVO_MS)) return intervalos.vacio;
    const r = await interno.leer({ rapida: true });
    if (!r?.ok) return intervalos.error;
    draft = acumularDraft(draft, r.lectura, ahora());
    if (draft.cerrado) return intervalos.partida;
    const datos = datosPara(a.rango);
    const consejo = consejoSolo({ datos, draft, linea: a.linea, idioma: a.idioma });
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
