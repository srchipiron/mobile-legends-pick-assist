/**
 * Lo que se lee de cada respuesta de la API, POR FORMA y por contexto de
 * clave: la API mueve sus campos de sitio, así que nada aquí fija una ruta
 * dentro del JSON. Funciones puras: ni red ni estado.
 */

/** Hasta dónde se baja: la línea de un héroe vive en el nivel 8 [M]. */
export const HONDURA = 12;
const SALTAR = 1;
const PARAR = 2;

/**
 * Recorre `nodo` en profundidad (el nodo es el nivel 0, hasta `HONDURA`).
 * `visita(valor, claves, indice)` recibe las claves de OBJETO por las que se
 * llegó (sin los índices de lista) y el índice si el valor está en una lista;
 * devuelve `SALTAR` para no bajar de ese valor y `PARAR` para acabar.
 */
function recorrer(nodo, visita) {
  let parado = false;
  const ir = (v, claves, indice, nivel) => {
    if (parado || nivel > HONDURA || v == null) return;
    const r = visita(v, claves, indice);
    if (r === PARAR) { parado = true; return; }
    if (r === SALTAR || typeof v !== 'object') return;
    if (Array.isArray(v)) v.forEach((x, i) => ir(x, claves, i, nivel + 1));
    else for (const [k, x] of Object.entries(v)) ir(x, [...claves, k], null, nivel + 1);
  };
  ir(nodo, [], null, 0);
}

const esObjeto = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const sinEtiquetas = (t, por = '') => String(t ?? '').replace(/<[^>]*>/g, por);
const ES_IMAGEN = /^https?:\/\/\S+\.(png|jpe?g|webp)(\?|$)/i;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

/** FNV-1a de 32 bits en hexadecimal: estable entre corridas y sin dependencias [C]. */
function fnv1a(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Las cadenas que cuelgan de alguna clave que casa con `re` (el contexto evita que un nombre o una URL cuelen datos) [D]. */
function cadenasBajo(nodo, re, alLeer) {
  recorrer(nodo, (v, claves) => {
    if (typeof v === 'string' && claves.some((k) => re(k))) return alLeer(v);
    return undefined;
  });
}

// `support` y `farm` no salen nunca hoy; se leen por si la API vuelve a nombrarlas así [D].
const LINEAS_API = ['roam', 'jungle', 'mid', 'gold', 'exp', 'support', 'farm'];
export function extraerLineas(nodo) {
  const out = new Set();
  cadenasBajo(nodo, (k) => /lane|position|road/i.test(k), (s) => {
    for (const l of LINEAS_API) if (s.toLowerCase().includes(l)) out.add(l);
  });
  return [...out];
}

/** Por igualdad exacta: una URL o un nombre no pueden colar un rol [D]. */
const ROLES = ['tank', 'fighter', 'assassin', 'mage', 'marksman', 'support'];
export function extraerRol(nodo) {
  let rol = '';
  // `roadsort` lleva la LÍNEA, no el rol [M].
  cadenasBajo(nodo, (k) => /sort|role|class/i.test(k) && !/road/i.test(k), (s) => {
    const r = s.trim().toLowerCase();
    if (!ROLES.includes(r)) return undefined;
    rol = r;
    return PARAR;
  });
  return rol;
}

/** La forma de una speciality («Crowd Control»): acaban como claves de reglas.js, y una con comillas sería código [C]. */
export const ES_SPECIALITY = /^[A-Za-z][A-Za-z ]{0,28}$/;
export function extraerSpeciality(nodo) {
  const out = new Set();
  cadenasBajo(nodo, (k) => /special/i.test(k), (s) => { if (ES_SPECIALITY.test(s.trim())) out.add(s.trim()); });
  return [...out];
}

/** Las veces que los textos de habilidad dicen cada tipo de daño; la etiqueta la decide el motor [D]. */
export function extraerDano(nodo) {
  const out = { fisico: 0, magico: 0, verdadero: 0 };
  recorrer(nodo, (v) => {
    if (typeof v !== 'string') return;
    const t = sinEtiquetas(v, ' ');
    out.fisico += (t.match(/Physical Damage/gi) ?? []).length;
    out.magico += (t.match(/Magic Damage/gi) ?? []).length;
    out.verdadero += (t.match(/True Damage/gi) ?? []).length;
  });
  return out;
}

/**
 * Las cadenas largas de la ficha sin etiquetas, cifras ni espacios: un rework
 * reescribe el texto y un reequilibrio de números no [M]. Las direcciones no
 * cuentan: un proxy de imágenes no es un rework [M].
 */
export function extraerTextos(nodo) {
  const out = [];
  recorrer(nodo, (v) => {
    if (typeof v !== 'string' || /^\s*[a-z][a-z0-9+.-]*:\/\//i.test(v)) return;
    const t = sinEtiquetas(v).replace(/[0-9%.,]+/g, '').replace(/\s+/g, '').toLowerCase();
    if (t.length >= 40) out.push(t);
  });
  return out;
}

/** La huella del texto de la ficha (sin cifras), la de `kit` en heroes.json [C]. */
export function huellaTexto(nodo) {
  const textos = [...new Set(extraerTextos(nodo))].sort().join('|');
  return textos ? fnv1a(textos) : null;
}

const esHabilidad = (v) => esObjeto(v) && typeof v.skillname === 'string' && typeof v.skilldesc === 'string';

/** La huella de las habilidades CON cifras (nombre, texto, recarga y coste): la que ve un nerf de números [M]. */
export function huellaDeHabilidades(nodo) {
  const lineas = new Set();
  const limpio = (t) => sinEtiquetas(t).replace(/\s+/g, ' ').trim().toLowerCase();
  recorrer(nodo, (v) => {
    if (esHabilidad(v)) lineas.add(`${limpio(v.skillname)}|${limpio(v.skilldesc)}|${limpio(v['skillcd&cost'])}`);
  });
  const texto = [...lineas].sort().join('\n');
  return texto ? fnv1a(texto) : null;
}

// «Death Immunity» NO es intocable: a Argus se le controla [D].
const ETIQUETA_EFECTO = { CC: 'cc', AOE: 'area', 'Remove CC': 'limpia', 'CC Immune': 'limpia', Invincible: 'inmortal' };
// La etiqueta solo marca 5 de las 11 habilidades que limpian; el texto, el resto [M].
const LIMPIA_TEXTO = /(?:remov|clear)\w* (?:all )?(?:debuffs|negative effects|control effects)|purif|cleans/i;
const ALIADOS_TEXTO = /allied heroes|allies|teammates/i;

/**
 * Las habilidades que importan en el draft (control, área, limpiar, intocable),
 * una por nombre. La primera de cada lista es la PASIVA y no cuenta [D].
 */
export function extraerHabilidades(nodo) {
  const vistas = new Map();
  recorrer(nodo, (v, _claves, indice) => {
    if (!esHabilidad(v)) return undefined;
    if (indice === 0) return SALTAR;
    const texto = sinEtiquetas(v.skilldesc, ' ');
    const efectos = new Set();
    for (const g of Array.isArray(v.skilltag) ? v.skilltag : []) {
      const e = ETIQUETA_EFECTO[String(g?.tagname ?? '').trim()];
      if (e) efectos.add(e);
    }
    if (LIMPIA_TEXTO.test(texto)) efectos.add('limpia');
    if (efectos.has('limpia') && ALIADOS_TEXTO.test(texto)) efectos.add('aliados');
    const nombre = v.skillname.trim();
    if (nombre && (efectos.has('cc') || efectos.has('limpia') || efectos.has('inmortal'))) {
      const previa = vistas.get(nombre) ?? new Set();
      for (const e of efectos) previa.add(e);
      vistas.set(nombre, previa);
    }
    return SALTAR;
  });
  return [...vistas].map(([n, e]) => ({ n, e: [...e].sort() }));
}

/** La dirección original de una imagen servida por un proxy (`?url=`): se guarda la de Moonton [M]. */
export function urlOriginal(url) {
  if (typeof url !== 'string') return url;
  try {
    const dentro = new URL(url).searchParams.get('url');
    if (dentro && ES_IMAGEN.test(dentro)) return dentro;
  } catch { /* no es una URL: se devuelve tal cual */ }
  return url;
}

/** El retrato: `head` (210×220), nunca `smallmap`, el cuerpo entero de 165 KB [M]. */
export function extraerRetrato(nodo) {
  const urls = [];
  recorrer(nodo, (v, claves) => {
    if (typeof v !== 'string') return;
    const url = urlOriginal(v);
    if (ES_IMAGEN.test(url)) urls.push({ clave: claves.at(-1) ?? '', url });
  });
  const cabezas = urls.filter((u) => /^head$/i.test(u.clave));
  return (cabezas[0] ?? urls.find((u) => /head/i.test(u.clave) && !/big/i.test(u.clave)))?.url ?? null;
}

/** La cara del juego ACTUAL (`head` del objeto con `heroid`), la que reconoce el lector [M]. */
export function extraerCara(nodo) {
  let cara = null;
  recorrer(nodo, (v) => {
    if (!esObjeto(v) || v.heroid == null || typeof v.head !== 'string') return undefined;
    const head = urlOriginal(v.head);
    if (!ES_IMAGEN.test(head)) return undefined;
    cara = head;
    return PARAR;
  });
  return cara;
}

/** La ficha de un héroe: solo lo que llega; `habilidades` siempre (un rework puede dejarlas vacías) [D]. */
export function leerFicha(data) {
  const ficha = {};
  const esp = extraerSpeciality(data);
  const dano = extraerDano(data);
  if (esp.length) ficha.speciality = esp;
  if (dano.fisico || dano.magico || dano.verdadero) ficha.damage = dano;
  const valores = { retrato: extraerRetrato(data), cara: extraerCara(data), kitTexto: huellaTexto(data), kitCifras: huellaDeHabilidades(data) };
  for (const [k, v] of Object.entries(valores)) if (v) ficha[k] = v;
  ficha.habilidades = extraerHabilidades(data);
  return ficha;
}

/** La defensa que el propio juego escribe en `equiptips` (las botas «Movement» dan defensa) [D]. */
function extraerDefensa(tips) {
  const t = String(tips ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ');
  const suma = (re) => [...t.matchAll(re)].reduce((a, m) => a + Number(m[1]), 0);
  return {
    magica: suma(/\+\s*(\d+(?:\.\d+)?)\s*(?:Extra\s+)?Magic(?:al)?\s+Defen[cs]e/gi),
    fisica: suma(/\+\s*(\d+(?:\.\d+)?)\s*(?:Extra\s+)?Physical\s+Defen[cs]e/gi),
  };
}

/** Lo que dice el texto de un objeto, no una lista escrita a mano [D] (comprobado sobre los 152 objetos [M]). */
const EFECTOS = {
  antiCuracion: /reduc\w*[^.]{0,60}(HP Regen|Regen|healing|Heal)\b/i,
  cortaControl: /(CC and Slow Duration reduced|immune to all damage and effects|reduc\w*[^.]{0,30}\b(CC|Crowd Control)\b)/i,
  antiEscudo: /reduc\w*[^.]{0,30}\bShield/i,
  antiCritico: /Crit(ical)? Damage Reduction/i,
  critico: /Crit(ical)? Chance/i,
};
// Solo el crítico se lee de las estadísticas: «+12 HP Regen» de unas botas no es antisanación [M].
const DE_ESTADISTICAS = new Set(['antiCritico', 'critico']);

function extraerEfectos(d) {
  const limpio = (claves) => claves.map((k) => d[k]).join(' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ');
  const pasiva = limpio(Object.keys(d).filter((k) => /^equipskill/.test(k)));
  const estadisticas = limpio(['equiptips'].filter((k) => k in d));
  return Object.entries(EFECTOS).filter(([k, re]) => re.test(DE_ESTADISTICAS.has(k) ? estadisticas : pasiva)).map(([k]) => k);
}

/**
 * Funde las filas de una ruta de objetos en `out`: gana la primera ruta que da
 * cada campo, y los efectos se JUNTAN entre rutas [M].
 */
export function leerObjetos(rows, out) {
  for (const row of rows) {
    const d = row?.data ?? row;
    const id = Number(d?.equipid ?? d?.id);
    const nombre = d?.equipname ?? d?.name;
    if (!Number.isFinite(id) || !nombre) continue;
    const { magica, fisica } = extraerDefensa(d.equiptips);
    const obj = out[id] ?? {};
    obj.nombre ??= String(nombre).trim();
    obj.tipo ??= d.equiptypename ?? null;
    if (d.equipicon && !obj.icono) obj.icono = urlOriginal(String(d.equipicon));
    if (magica && !obj.magica) obj.magica = magica;
    if (fisica && !obj.fisica) obj.fisica = fisica;
    const efectos = extraerEfectos(d);
    if (efectos.length) obj.efectos = [...new Set([...(obj.efectos ?? []), ...efectos])];
    out[id] = obj;
  }
  return out;
}

/** `giftid` → nombre, nivel (1-3) y texto del talento [C]. */
export function leerTalentos(rows) {
  const out = {};
  for (const row of rows) {
    const d = row?.data ?? row;
    const id = Number(d?.giftid);
    const nombre = d?.emblemskill?.skillname;
    if (!Number.isInteger(id) || id <= 0 || !nombre) continue;
    const t = { nombre: String(nombre).trim() };
    const nivel = Number(d?.gifttiers);
    if ([1, 2, 3].includes(nivel)) t.nivel = nivel;
    const texto = sinEtiquetas(d?.emblemskill?.skilldescemblem ?? d?.emblemskill?.skilldesc ?? '').replace(/\s+/g, ' ').trim();
    if (texto) t.texto = texto.slice(0, 200);
    out[id] = t;
  }
  return out;
}

/** Las builds de la respuesta: el primer array con `equipid`, tal cual (sin completar lo que la API no da) [D]. */
export function recogerBuilds(nodo) {
  let builds = [];
  recorrer(nodo, (v) => {
    if (!Array.isArray(v) || !v.some((x) => x && typeof x === 'object' && Array.isArray(x.equipid))) return undefined;
    const lista = v.filter((b) => Array.isArray(b?.equipid) && b.equipid.length).map(leerBuild).filter((b) => b.objetos.length);
    if (!lista.length) return SALTAR;
    builds = lista;
    return PARAR;
  });
  return builds;
}

function leerBuild(b) {
  const out = { objetos: b.equipid.map(Number).filter(Number.isFinite) };
  const wr = Number(b.build_win_rate ?? b.win_rate);
  const pr = Number(b.build_pick_rate ?? b.pick_rate);
  if (Number.isFinite(wr)) out.winRate = wr;
  if (Number.isFinite(pr)) out.pickRate = pr;
  const emblema = b?.emblem?.data?.emblemname ?? b?.emblem?.emblemname;
  const hechizo = b?.battleskill?.data?.__data?.skillname ?? b?.battleskill?.data?.skillname;
  if (emblema) out.emblema = String(emblema);
  if (hechizo) out.hechizo = String(hechizo);
  const talentos = (Array.isArray(b?.new_rune_skill) ? b.new_rune_skill : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (talentos.length) out.talentos = talentos;
  return out;
}

/** Los tramos de la curva por duración, en minutos; con otros, la curva NO se guarda (las fases hablarían de otros minutos) [C]. */
export const TRAMOS_CURVA = [10, 12, 14, 16, 18, 20];

/** `time_win_rate` en el orden de TRAMOS_CURVA, o null; una curva en porcentaje no vale [M]. */
export function recogerCurva(nodo) {
  let curva = null;
  recorrer(nodo, (v) => {
    if (!esObjeto(v) || !Array.isArray(v.time_win_rate)) return undefined;
    const tramos = [...v.time_win_rate].filter((x) => x && typeof x === 'object').sort((a, b) => Number(a.time_min) - Number(b.time_min));
    const desde = tramos.map((x) => Number(x.time_min));
    const wr = tramos.map((x) => Number(x.win_rate));
    if (desde.length !== TRAMOS_CURVA.length || desde.some((d, i) => d !== TRAMOS_CURVA[i])) return SALTAR;
    if (wr.some((x) => !Number.isFinite(x) || x <= 0 || x >= 1)) return SALTAR;
    curva = wr.map(round4);
    return PARAR;
  });
  return curva;
}

/** El primer `total_win_rate` posible (0 < v < 1) de la respuesta [C]. */
export function recogerWinrateLinea(nodo) {
  let wr = null;
  recorrer(nodo, (v) => {
    if (!esObjeto(v) || v.total_win_rate == null) return undefined;
    const x = Number(v.total_win_rate);
    if (!Number.isFinite(x) || x <= 0 || x >= 1) return undefined;
    wr = x;
    return PARAR;
  });
  return wr;
}
