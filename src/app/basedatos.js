/**
 * La base de datos de partidas de todos los jugadores (3.69.0, elegido por
 * Javi: «una clave por jugador», sin correo ni contraseña). Puro salvo la
 * red, que se inyecta: QUÉ se sube, con qué forma, y las cuatro llamadas a
 * las funciones de `supabase/esquema.sql`. El estado está en
 * estado/useComunidad.js.
 *
 * - La CLAVE la genera la app (32 bytes al azar). Es lo único que identifica
 *   al jugador: con ella se recuperan las partidas en otro móvil. El servidor
 *   guarda su huella, nunca la clave.
 * - Lo que viaja de cada partida es `paraLaComunidad`: el draft, el pick, lo
 *   recomendado, el resultado, la estimación. Nada del lector (ids de
 *   capturas, dudas) ni del perfil. El token de GitHub no pasa por aquí.
 * - La dirección y la clave PÚBLICA del proyecto de Supabase van en
 *   `public/comunidad.json`, que publica Javi desde Administración. Sin ese
 *   fichero, nada de esto se ve.
 */

/** Un proyecto de Supabase: `https://<20 letras>.supabase.co`, nada más (ni rutas ni otros dominios). */
const URL_SUPABASE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;

/** ¿Es una clave que se puede publicar? La «publishable» nueva, o la anon de siempre (un JWT con `role: anon`). Nunca la secreta. */
export function clavePublicable(clave) {
  if (typeof clave !== 'string') return false;
  const c = clave.trim();
  if (/^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(c)) return true;
  const partes = c.split('.');
  if (partes.length !== 3 || !partes.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const carga = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
    return carga?.role === 'anon';
  } catch { return false; }
}

/** `comunidad.json` con la forma garantizada, o null si no vale (y entonces no se usa). */
export function sanearConfig(x) {
  if (!x || typeof x !== 'object') return null;
  const url = typeof x.url === 'string' ? x.url.trim().replace(/\/+$/, '') : '';
  const clave = typeof x.clave === 'string' ? x.clave.trim() : '';
  return URL_SUPABASE.test(url) && clavePublicable(clave) ? { url, clave } : null;
}

/** Una clave de jugador nueva: 32 bytes al azar en base64url (43 letras). */
export function crearClaveDeJugador(azar = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  return btoa(String.fromCharCode(...azar(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** La misma forma que exige el servidor (`huella_de`). */
export const claveDeJugadorValida = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(c);

/** Los campos de una partida que van a la base de datos. Ni lector ni nada que no sirva para medir. */
// `editada` (3.76.0): cuándo la arreglaste, para que entre móvil y tablet gane la copia arreglada más tarde.
// `supuesto` (3.81.2): el pick es el nº1 porque no se leyó el tuyo; sin la marca contaba como «siguió el consejo».
const CAMPOS = ['t', 'pick', 'gane', 'recomendados', 'rango', 'estimacion', 'modelo', 'previa', 'origen', 'bans', 'draft', 'duracion', 'fases', 'editada', 'supuesto'];
export function paraLaComunidad(p) {
  const salida = {};
  for (const k of CAMPOS) if (p?.[k] !== undefined && p[k] !== null) salida[k] = p[k];
  return salida;
}

/** Partidas por envío: el tope del servidor. */
export const POR_LOTE = 200;
/** Partidas quitadas que se mandan para borrar allí: el tope del servidor. */
export const QUITAR_MAX = 1000;

/** Lo guardado en `roam-picker:comunidad`, con la forma garantizada. */
export function sanearEstadoComunidad(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : null);
  const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    activo: o.activo === true && claveDeJugadorValida(o.clave),
    clave: claveDeJugadorValida(o.clave) ? o.clave : null,
    huella: texto(o.huella),
    cuando: num(o.cuando),
    total: Number.isInteger(o.total) && o.total >= 0 ? o.total : null,
    error: texto(o.error),
    intento: num(o.intento),
    huellaIntentada: texto(o.huellaIntentada),
    // La primera subida va entera; después, las POR_LOTE más recientes.
    completo: o.completo === true,
    config: sanearConfig(o.config),
  };
}

/** Lo mismo que `tocaSubir` (envio.js), con la clave en lugar del token. */
export function tocaSubirComunidad(estado, huella, { ahora, enLinea = true, partidas = 0, config = null, reintento = 10 * 60 * 1000 } = {}) {
  if (!estado?.activo || !estado.clave || !config || !partidas || !enLinea) return false;
  if (huella === estado.huella) return false;
  if (estado.error && estado.huellaIntentada === huella && estado.intento && ahora - estado.intento < reintento) return false;
  return true;
}

/** Los errores que lanza el esquema, por su texto; lo demás es 'otro'. */
const ERRORES = ['clave', 'lote', 'quitar', 'partida', 'tope', 'lleno', 'pronto', 'parte'];
const PLAZO_MS = 15000;

/**
 * Una función del esquema por la API de Supabase (`/rest/v1/rpc/<funcion>`).
 * `{ datos }` o `{ error: 'red'|'clave'|'tope'|'lleno'|'partida'|…|'otro' }`.
 * Nunca lanza.
 */
export async function llamar(config, funcion, cuerpo, { fetch = globalThis.fetch, plazo = PLAZO_MS } = {}) {
  if (!sanearConfig(config)) return { error: 'config' };
  const cabeceras = { apikey: config.clave, 'Content-Type': 'application/json' };
  // La anon de siempre es un JWT y va también como Authorization; la publishable nueva, no.
  if (!config.clave.startsWith('sb_')) cabeceras.Authorization = `Bearer ${config.clave}`;
  let r;
  try {
    r = await fetch(`${config.url}/rest/v1/rpc/${funcion}`, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(plazo) });
  } catch { return { error: 'red' }; }
  let j;
  try { j = await r.json(); } catch { j = null; }
  if (r.ok) return { datos: j };
  const m = String(j?.message ?? '');
  return { error: ERRORES.includes(m) ? m : (r.status === 401 || r.status === 403 ? 'permiso' : 'otro'), estado: r.status };
}

/**
 * Sube las partidas: todas la primera vez (`completo` falso), en lotes de
 * POR_LOTE de la más nueva a la más vieja; después, las POR_LOTE más
 * recientes y, de las demás, las que arreglaste (`editada`, 3.81.2: desde
 * 3.78.0 se arreglan resultado, héroe y equipos de cualquier partida, y un
 * arreglo en la 201.ª no salía nunca del móvil mientras la app decía «al
 * día»). El servidor no deja que una copia más vieja pise a otra arreglada
 * después. Las quitadas van en el primer lote para que se borren allí también.
 */
export async function subirPartidas({ config, clave, partidas = [], olvidadas = [], referencia = null, completo = false }, opciones = {}) {
  const todas = [...partidas].filter((p) => Number.isFinite(p?.t)).sort((a, b) => b.t - a.t).map(paraLaComunidad);
  const orden = completo ? [...todas.slice(0, POR_LOTE), ...todas.slice(POR_LOTE).filter((p) => Number.isFinite(p.editada))] : todas;
  const lotes = [];
  for (let i = 0; i < orden.length; i += POR_LOTE) lotes.push(orden.slice(i, i + POR_LOTE));
  if (!lotes.length) lotes.push([]);
  let total = null;
  for (let i = 0; i < lotes.length; i += 1) {
    const r = await llamar(config, 'subir_partidas', {
      clave,
      lote: lotes[i],
      quitar: i === 0 ? [...olvidadas].filter(Number.isFinite).slice(-QUITAR_MAX) : [],
      referencia: referencia && typeof referencia.winRate === 'number' ? { winRate: referencia.winRate, partidas: referencia.partidas } : null,
    }, opciones);
    if (r.error) return r;
    total = r.datos?.total ?? total;
  }
  return { total };
}

/** Las partidas de esta clave (para traerlas a otro móvil). `{ partidas }` o `{ error }`. */
export async function traerMisPartidas({ config, clave }, opciones = {}) {
  const r = await llamar(config, 'mis_partidas', { clave }, opciones);
  if (r.error) return r;
  return { partidas: Array.isArray(r.datos?.partidas) ? r.datos.partidas : [] };
}

/**
 * De lo que hay en la base de datos, qué hay que fundir aquí: lo que aquí no
 * está ni se quitó, y lo que se arregló allí (en la tablet o en otro móvil)
 * DESPUÉS que aquí (`editada`, 3.76.0).
 */
export function queTraer(remotas = [], { partidas = [], olvidadas = [] } = {}) {
  const quitadas = new Set(olvidadas);
  const aqui = new Map(partidas.map((x) => [x.t, x]));
  const editadaDe = (x) => (Number.isFinite(x?.editada) ? x.editada : 0);
  return remotas.filter((x) => Number.isFinite(x?.t) && !quitadas.has(x.t) && (!aqui.has(x.t) || editadaDe(x) > editadaDe(aqui.get(x.t))));
}

/** Borra todo lo de esta clave en el servidor. */
export async function borrarMisPartidas({ config, clave }, opciones = {}) {
  const r = await llamar(config, 'borrar_mis_partidas', { clave }, opciones);
  return r.error ? r : { borradas: r.datos === true };
}

/** Las páginas de la comunidad que se bajan como mucho: 50.000 partidas. Decisión de producto. */
export const MAX_PAGINAS = 50;

/** Las partidas de todos (`{ filas, referencias, incompleto }`), página a página. */
export async function bajarComunidad(config, { maxPaginas = MAX_PAGINAS, ...opciones } = {}) {
  // Sin prototipo: las claves vienen del servidor, y una «__proto__» no puede tocar nada.
  const filas = []; const referencias = Object.create(null);
  let tras = { j: 0, t: 0 };
  for (let i = 0; i < maxPaginas; i += 1) {
    const r = await llamar(config, 'partidas_comunidad', { tras_jugador: tras.j, tras_t: tras.t, cuantas: 1000 }, opciones);
    if (r.error) return r;
    const pagina = Array.isArray(r.datos?.filas) ? r.datos.filas.filter((f) => Number.isFinite(f?.j) && Number.isFinite(f?.t)) : [];
    filas.push(...pagina);
    const refs = r.datos?.referencias && typeof r.datos.referencias === 'object' ? r.datos.referencias : {};
    for (const [j, v] of Object.entries(refs)) if (/^\d+$/.test(j)) referencias[j] = v;
    if (!r.datos?.mas || !pagina.length) return { filas, referencias, incompleto: false };
    const ultima = pagina[pagina.length - 1];
    tras = { j: ultima.j, t: ultima.t };
  }
  // No se calla: con más de lo que se baja, el informe lo dice.
  return { filas, referencias, incompleto: true };
}

/**
 * El parte de salud del lector de la tablet (3.74.0): cómo va y las últimas
 * líneas de su registro, con tu clave de jugador. Lo lee la revisión
 * automática (`partes_recientes`, sin huella). Nunca lanza.
 */
export async function subirParte({ config, clave, parte }, opciones = {}) {
  if (!claveDeJugadorValida(clave) || !parte || typeof parte !== 'object') return { error: 'clave' };
  return llamar(config, 'subir_parte', { clave, parte }, opciones);
}

/**
 * Los recortes de un draft con héroes sin reconocer (3.81.0): las diez caras
 * de una o dos capturas (sin nombres de jugadores) y lo leído, con la clave
 * del lector. Para medir el lector (`recortes_recientes`). Nunca lanza.
 */
export async function subirRecorte({ config, clave, recorte }, opciones = {}) {
  if (!claveDeJugadorValida(clave) || !recorte || typeof recorte !== 'object' || !Array.isArray(recorte.capturas) || !recorte.capturas.length) return { error: 'clave' };
  return llamar(config, 'subir_recorte', { clave, recorte }, opciones);
}

/** Los recortes de las últimas `horas` (3.82.0, como mucho 1.440 y 50 recortes): para medir el lector con `scripts/medir-lector.mjs`. */
export async function bajarRecortes(config, { horas = 168, ...opciones } = {}) {
  const r = await llamar(config, 'recortes_recientes', { horas }, opciones);
  return r.error ? r : { recortes: Array.isArray(r.datos) ? r.datos : [] };
}

/** Los partes de las últimas `horas` (como mucho 168), de todos los lectores. */
export async function bajarPartes(config, { horas = 48, ...opciones } = {}) {
  const r = await llamar(config, 'partes_recientes', { horas }, opciones);
  return r.error ? r : { partes: Array.isArray(r.datos) ? r.datos : [] };
}
