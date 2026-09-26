/**
 * Tu perfil en un código que puedes copiar y pegar.
 *
 * El almacenamiento del navegador va por dispositivo, y no hay servidor (la
 * app es estática en GitHub Pages; montarlo convertiría a Javi en responsable
 * de datos de otras personas, para mover kilobyte y medio). Así que los datos
 * van DENTRO del código: JSON, gzip si el navegador sabe, base64url, con
 * marca de versión delante y suma de control detrás. «Tus datos no salen de
 * tu móvil» sigue siendo cierto: salen porque tú los sacas.
 *
 * Al importar se FUNDE, nunca se reemplaza: pegar un código viejo en el
 * dispositivo bueno no borra nada.
 */

import { sanearDraft } from './registro.js';

const MARCA = 'MLPA1';

/** Suma de control corta. No es criptografía: es cazar un pegado a medias. */
function suma(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const aBase64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const deBase64 = (texto) => {
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
};

async function comprimir(texto) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(texto));
    w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  } catch {
    return null;
  }
}

async function descomprimir(bytes) {
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}

/** Lo que se lleva: maestría, partidas y preferencias. NO el draft a medias. */
export function recogerPerfil({ mastery = {}, partidas = [], olvidadas = [], rango = null, linea = null, idioma = null }) {
  return { v: 1, mastery, partidas, ...(olvidadas.length ? { olvidadas } : {}), rango, linea, idioma, cuando: Date.now() };
}

/**
 * Cuántas marcas de borrado se guardan como mucho (las más recientes).
 * Decisión de producto: el móvil guarda 500 partidas; con el doble de
 * marcas, cualquier partida que aún pueda llegar de un código viejo tiene
 * la suya. Cada una son unos 14 caracteres.
 */
export const TOPE_OLVIDADAS = 1000;

/**
 * Las partidas QUITADAS a propósito («Quitar esta partida»), por su instante.
 * Viajan en el código para que fundir no las resucite: sin ellas, la fusión
 * solo suma, y una partida apuntada por error y quitada en el móvil volvía
 * al importar un código viejo y se quedaba para siempre en la base de datos
 * del proyecto (3.10.1).
 */
export function sanearOlvidadas(x) {
  const vistas = new Set();
  for (const v of Array.isArray(x) ? x : []) { const n = Number(v); if (typeof v !== 'boolean' && v !== null && v !== '' && Number.isFinite(n)) vistas.add(n); }
  return [...vistas].sort((a, b) => b - a).slice(0, TOPE_OLVIDADAS);
}

/** El código para copiar. */
export async function exportarPerfil(perfil) {
  const json = JSON.stringify(perfil);
  const gz = await comprimir(json);
  const cuerpo = gz ? `z${aBase64(gz)}` : `p${aBase64(new TextEncoder().encode(json))}`;
  return `${MARCA}.${cuerpo}.${suma(cuerpo)}`;
}

/**
 * Lee un código. Devuelve { perfil } o { error: 'vacio'|'formato'|'incompleto'|'ilegible' }.
 * Nunca lanza: un error tiene que salir en pantalla, no dejar la app en blanco.
 */
export async function leerPerfil(codigo) {
  const limpio = String(codigo ?? '').trim().replace(/\s+/g, '');
  if (!limpio) return { error: 'vacio' };
  const partes = limpio.split('.');
  if (partes.length !== 3 || partes[0] !== MARCA) return { error: 'formato' };
  const [, cuerpo, control] = partes;
  if (suma(cuerpo) !== control) return { error: 'incompleto' };
  try {
    const bytes = deBase64(cuerpo.slice(1));
    const json = cuerpo[0] === 'z' ? await descomprimir(bytes) : new TextDecoder().decode(bytes);
    const perfil = JSON.parse(json);
    if (!perfil || typeof perfil !== 'object' || Array.isArray(perfil)) return { error: 'formato' };
    return { perfil: sanear(perfil) };
  } catch {
    return { error: 'ilegible' };
  }
}

/**
 * Solo lo que tiene la forma esperada. `games` NUMÉRICO y finito (`"500" >
 * 0` es true y con el texto dentro `tuNivel` salía 0,0000037); cada campo de
 * una partida coaccionado o descartado (llegaban `t: NaN`, `estimacion: 7`,
 * `gane: 'no'`). Una partida válida sale de aquí IDÉNTICA: lo guardado en el
 * móvil no se reordena.
 */
export function sanear(perfil) {
  const mastery = {};
  const m = perfil?.mastery;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    for (const [nombre, v] of Object.entries(m)) {
      const games = Number(v?.games);
      if (v && typeof v === 'object' && Number.isFinite(games) && games > 0 && typeof v.winRate === 'number' && v.winRate >= 0 && v.winRate <= 1) {
        mastery[nombre] = { games, winRate: v.winRate, ...(Number.isFinite(v.desde) && v.desde > 0 ? { desde: v.desde } : {}) };
      }
    }
  }
  const partidas = (Array.isArray(perfil?.partidas) ? perfil.partidas : [])
    .filter((p) => p && typeof p === 'object' && typeof p.pick === 'string' && p.pick.trim() && Number.isFinite(p.t))
    .map((p) => {
      const limpia = { ...p };
      limpia.pick = p.pick.trim();
      limpia.gane = p.gane === true;
      limpia.recomendados = Array.isArray(p.recomendados) ? p.recomendados.filter((r) => typeof r === 'string') : [];
      if (p.previa !== true) delete limpia.previa;
      if (!(typeof p.estimacion === 'number' && p.estimacion > 0 && p.estimacion < 1)) delete limpia.estimacion;
      const limpios = Array.isArray(p.bans) ? p.bans.filter((b) => typeof b === 'string' && b).slice(0, 10) : [];
      if (limpios.length) limpia.bans = limpios; else delete limpia.bans;
      const draft = sanearDraft(p.draft);
      if (draft) limpia.draft = draft; else delete limpia.draft;
      return limpia;
    });
  return { ...(perfil ?? {}), mastery, partidas, olvidadas: sanearOlvidadas(perfil?.olvidadas) };
}

/**
 * Junta lo que llega con lo que hay. Maestría: gana el que tenga MÁS
 * partidas, héroe a héroe. Partidas: por instante, y en el empate gana la
 * copia local (que lleva la corrección). Preferencias: solo si aquí no había.
 * Hay una prueba en LAS DOS direcciones.
 *
 * Las partidas quitadas (`olvidadas`, las de los dos lados) no vuelven: una
 * marca de borrado gana a la partida venga de donde venga.
 */
/**
 * Qué copia de la maestría de UN héroe gana al fundir: la de más partidas
 * (pegar un código viejo no puede borrar la buena), y en el empate la que
 * trae fecha, que si no se perdía y la app la volvía a fechar a «ahora»
 * (3.14.0). NO gana «la más reciente»: la fecha la pone también la app sola
 * al ver una maestría sin fecha (3.13.1, `fecharMaestria`), así que dice
 * cuándo la vio ESE dispositivo, no cuándo se copiaron los números del
 * juego. Probado en 3.14.0: con esa regla un móvil con 10 partidas de
 * Diggie, fechado después, borraba las 3.821 del otro.
 */
function ganaEntrante(mio, m) {
  const conFecha = (x) => Number.isFinite(x?.desde) && x.desde > 0;
  const ga = mio?.games ?? 0; const gb = m?.games ?? 0;
  if (gb !== ga) return gb > ga;
  return !conFecha(mio) && conFecha(m);
}

export function fundirPerfil(actual, entrante) {
  entrante = sanear(entrante ?? {});
  const mastery = { ...(actual.mastery ?? {}) };
  for (const [nombre, m] of Object.entries(entrante.mastery ?? {})) {
    const mio = mastery[nombre];
    if (!mio || ganaEntrante(mio, m)) mastery[nombre] = m;
  }
  const olvidadas = sanearOlvidadas([...(actual.olvidadas ?? []), ...(entrante.olvidadas ?? [])]);
  const borradas = new Set(olvidadas.map(String));
  const vistas = new Set();
  const partidas = [...(actual.partidas ?? []), ...(entrante.partidas ?? [])]
    .filter((p) => {
      const k = String(p.t ?? '');
      if (borradas.has(k)) return false;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
  return {
    mastery,
    partidas,
    olvidadas,
    rango: actual.rango ?? entrante.rango ?? null,
    linea: actual.linea ?? entrante.linea ?? null,
    idioma: actual.idioma ?? entrante.idioma ?? null,
    resumen: {
      maestriaAntes: Object.keys(actual.mastery ?? {}).length,
      maestriaDespues: Object.keys(mastery).length,
      partidasAntes: (actual.partidas ?? []).length,
      partidasDespues: partidas.length,
    },
  };
}
