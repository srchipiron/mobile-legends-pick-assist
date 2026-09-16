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
export function recogerPerfil({ mastery = {}, partidas = [], rango = null, linea = null, idioma = null }) {
  return { v: 1, mastery, partidas, rango, linea, idioma, cuando: Date.now() };
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
        mastery[nombre] = { games, winRate: v.winRate };
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
      return limpia;
    });
  return { ...(perfil ?? {}), mastery, partidas };
}

/**
 * Junta lo que llega con lo que hay. Maestría: gana el que tenga MÁS
 * partidas, héroe a héroe. Partidas: por instante, y en el empate gana la
 * copia local (que lleva la corrección). Preferencias: solo si aquí no había.
 * Hay una prueba en LAS DOS direcciones.
 */
export function fundirPerfil(actual, entrante) {
  entrante = sanear(entrante ?? {});
  const mastery = { ...(actual.mastery ?? {}) };
  for (const [nombre, m] of Object.entries(entrante.mastery ?? {})) {
    const mio = mastery[nombre];
    if (!mio || (m?.games ?? 0) > (mio.games ?? 0)) mastery[nombre] = m;
  }
  const vistas = new Set();
  const partidas = [...(actual.partidas ?? []), ...(entrante.partidas ?? [])]
    .filter((p) => {
      const k = String(p.t ?? '');
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
  return {
    mastery,
    partidas,
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
