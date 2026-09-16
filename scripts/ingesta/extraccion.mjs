/**
 * Lo que se saca de cada respuesta: linea, rol, speciality, tipo de dano y
 * retrato de un heroe, defensa y efectos de un objeto, y las builds. Todo por
 * FORMA y por contexto de clave, porque la API mueve sus campos de sitio.
 */

import { DAYS, RANK, diagnostics, estado, sleep } from './contexto.mjs';
import { callRoute, fetchResource } from './descarga.mjs';
import { NAME_KEYS, asRate, idPrincipal, pick } from './relaciones.mjs';

/**
 * Líneas en las que se juega un héroe. La API las devuelve de formas distintas
 * (una cadena, una lista, objetos con nombre), así que se recogen todas las
 * cadenas que parezcan una línea conocida.
 */
const LINEAS = ['roam', 'jungle', 'mid', 'gold', 'exp', 'support', 'farm'];

/**
 * Profundidad maxima al bajar por la respuesta. La API envuelve el dato util
 * muy hondo: el titulo de la linea vive en
 * data.hero.data.roadsort[].data.road_sort_title, o sea nivel 8. Con el limite
 * de 6 que habia antes NUNCA se llegaba, y los 133 heroes salian sin linea y
 * sin rol sin que nada fallara.
 */
const HONDURA = 12;

export function extraerLineas(node, out = new Set(), depth = 0, dentro = false) {
  if (depth > HONDURA || node == null) return [...out];

  // Solo se leen las cadenas que estén DENTRO de una clave de línea. Sin ese
  // contexto, el nombre del héroe o la URL de su icono podían colar palabras
  // como "gold" o "mid" y darle líneas que no juega.
  if (typeof node === 'string') {
    if (dentro) for (const l of LINEAS) if (node.toLowerCase().includes(l)) out.add(l);
    return [...out];
  }
  if (typeof node !== 'object') return [...out];

  if (Array.isArray(node)) {
    for (const v of node) extraerLineas(v, out, depth + 1, dentro);
    return [...out];
  }

  for (const [k, v] of Object.entries(node)) {
    extraerLineas(v, out, depth + 1, dentro || /lane|position|road/i.test(k));
  }
  return [...out];
}

/**
 * Roles que usa la API. Se reconocen por igualdad exacta, no por subcadena:
 * asi una URL o un nombre de heroe no puede colar un rol que no es.
 */
const ROLES = ['tank', 'fighter', 'assassin', 'mage', 'marksman', 'support'];

/**
 * Rol del heroe. Igual que las lineas, viene hondo y con otro nombre segun la
 * version de la API (sortid[].data.sort_title hoy), asi que se busca por
 * contexto de clave en vez de por ruta fija.
 */
export function extraerRol(node, depth = 0, dentro = false) {
  if (depth > HONDURA || node == null) return '';

  if (typeof node === 'string') {
    if (!dentro) return '';
    const s = node.trim().toLowerCase();
    return ROLES.includes(s) ? s : '';
  }
  if (typeof node !== 'object') return '';

  const entradas = Array.isArray(node) ? node.map((v) => [null, v]) : Object.entries(node);
  for (const [k, v] of entradas) {
    // 'road' se excluye a proposito: roadsort lleva la LINEA, no el rol.
    const aqui = dentro || (k != null && /sort|role|class/i.test(k) && !/road/i.test(k));
    const r = extraerRol(v, depth + 1, aqui);
    if (r) return r;
  }
  return '';
}

/**
 * Etiquetas de Moonton ("Guard", "Initiator", "Regen"...). Igual que el rol,
 * vienen hondas y pueden cambiar de sitio, asi que se buscan por contexto de
 * clave. Se recogen tal cual: traducirlas a nuestros tags es cosa de
 * SPECIALITY_TAGS, que se deriva del catalogo y se mide.
 */
function extraerSpeciality(node, out = new Set(), depth = 0, dentro = false) {
  if (depth > HONDURA || node == null) return [...out];

  if (typeof node === 'string') {
    const s = node.trim();
    if (dentro && s && s.length < 30) out.add(s);
    return [...out];
  }
  if (typeof node !== 'object') return [...out];

  const entradas = Array.isArray(node) ? node.map((v) => [null, v]) : Object.entries(node);
  for (const [k, v] of entradas) {
    extraerSpeciality(v, out, depth + 1, dentro || (k != null && /special/i.test(k)));
  }
  return [...out];
}

/**
 * Tipo de dano de un heroe, contado en los textos de habilidad que da Moonton.
 *
 * No es una regla escrita a mano ni una deduccion del rol: el propio juego
 * escribe "Physical Damage" / "Magic Damage" / "True Damage" en cada
 * habilidad, y eso es lo que se cuenta. El rol se equivocaria: Gusion es
 * asesino y pega magico, Hylos es tanque y pega magico.
 *
 * Devuelve las cuentas crudas. Quien decide la etiqueta es el motor, con
 * `perfilDeDano`, para poder cambiar el criterio sin reingerir.
 */
function extraerDano(node, out = { fisico: 0, magico: 0, verdadero: 0 }, depth = 0) {
  if (depth > HONDURA || node == null) return out;

  if (typeof node === 'string') {
    // El texto viene con etiquetas de color por medio ("<font ...>Physical
    // Damage</font>"), asi que se limpian antes de contar.
    const t = node.replace(/<[^>]*>/g, ' ');
    out.fisico += (t.match(/Physical Damage/gi) ?? []).length;
    out.magico += (t.match(/Magic Damage/gi) ?? []).length;
    out.verdadero += (t.match(/True Damage/gi) ?? []).length;
    return out;
  }
  if (typeof node !== 'object') return out;

  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    extraerDano(v, out, depth + 1);
  }
  return out;
}

/**
 * El retrato de un heroe, de la ficha que ya se descarga.
 *
 * Se busca por FORMA, no por una ruta fija -la API ya ha movido sus campos de
 * sitio mas de una vez-: la imagen mas pequena que parezca un retrato. Y se
 * descarta `smallmap`, que es el dibujo de cuerpo entero: 240x390 y 165 KB por
 * heroe, veintidos megas para los 133.
 *
 * Cero peticiones extra: `fetchFichas` ya pide los 133 para el tipo de dano.
 */
function extraerRetrato(node) {
  const urls = [];
  const rec = (n, clave = '', depth = 0) => {
    if (depth > HONDURA || n == null) return;
    if (typeof n === 'string') {
      if (/^https?:\/\/\S+\.(png|jpe?g|webp)(\?|$)/i.test(n)) urls.push({ clave, url: n });
      return;
    }
    if (typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) rec(v, Array.isArray(n) ? clave : k, depth + 1);
  };
  rec(node);
  // `head` es el retrato cuadrado. Se prefiere el pequeno, que es el que cabe
  // en una lista: el grande pesa el doble y se ve igual a 34 pixeles.
  const cabezas = urls.filter((u) => /^head$/i.test(u.clave));
  return (cabezas[0] ?? urls.find((u) => /head/i.test(u.clave) && !/big/i.test(u.clave)))?.url ?? null;
}

/**
 * La ficha de cada heroe: speciality y tipo de dano, de UNA sola peticion.
 *
 * Antes se pedia solo para los 7 heroes sin tags a mano. Ahora se pide para
 * todos, porque el tipo de dano hace falta para los 133 y sale de la misma
 * respuesta: 133 peticiones en vez de 7, unos 35 segundos mas en una corrida
 * que ya dura minutos.
 *
 * Si la ruta no esta en el esquema o un heroe falla, se devuelve lo que haya y
 * quien llama conserva lo anterior. Quedarse sin un dato es peor que tenerlo,
 * pero no es una averia.
 */
export async function fetchFichas(heroes) {
  const out = {};
  if (!estado.ROUTES?.detail || !heroes.length) return out;
  for (const h of heroes) {
    try {
      const { data } = await callRoute(estado.ROUTES.detail, { lang: 'en' }, h.id ?? h.name);
      const esp = extraerSpeciality(data);
      const dano = extraerDano(data);
      const ficha = {};
      if (esp.length) ficha.speciality = esp;
      if (dano.fisico || dano.magico || dano.verdadero) ficha.damage = dano;
      const retrato = extraerRetrato(data);
      if (retrato) ficha.retrato = retrato;
      if (Object.keys(ficha).length) out[h.name] = ficha;
    } catch (err) {
      if (diagnostics.speciality.errores.length < 4) {
        diagnostics.speciality.errores.push(`${h.name}: ${err.message}`);
      }
    }
    await sleep(250);
  }
  return out;
}

/**
 * Cuanta defensa da un objeto, leida del texto del propio juego.
 *
 * Mismo criterio que `extraerDano` con las habilidades: no se deduce del tipo
 * de objeto ni de una lista escrita a mano, se cuenta lo que Moonton escribe
 * en `equiptips` ("+18 Extra Magic Defense"). El tipo mentiria: las botas
 * Tough Boots estan catalogadas como "Movement" y dan 18 de defensa magica.
 *
 * Devuelve numeros, no etiquetas: quien decide es el motor.
 */
function extraerDefensa(tips) {
  const t = String(tips ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ');
  const suma = (re) => [...t.matchAll(re)].reduce((a, m) => a + Number(m[1]), 0);
  const magica = suma(/\+\s*(\d+(?:\.\d+)?)\s*(?:Extra\s+)?Magic(?:al)?\s+Defen[cs]e/gi);
  const fisica = suma(/\+\s*(\d+(?:\.\d+)?)\s*(?:Extra\s+)?Physical\s+Defen[cs]e/gi);
  return { magica, fisica };
}

/**
 * Que hace un objeto, leido del texto que el propio juego escribe en sus
 * habilidades. NO es una lista escrita a mano de "objetos anti-curacion": es
 * lo que pone el objeto.
 *
 * Mismo criterio que `extraerDano` con los heroes y que `extraerDefensa` con
 * las estadisticas. Y sirve para lo mismo: que la app pueda decir "el equipo
 * enemigo cura, esta build no corta curacion" sin que nadie mantenga a mano
 * una tabla que envejece con cada parche. Ya paso: "Necklace of Durance" era
 * EL objeto anti-curacion y hoy no existe en la API.
 *
 * Solo se apuntan efectos que el texto dice explicitamente:
 *
 * - `antiCuracion`: "reduce the Shield and HP Regen effects" (Sea Halberd,
 *   Dominance Ice, Glowing Wand...).
 * - `cortaControl`: "CC and Slow Duration reduced" o inmunidad (Tough Boots,
 *   Winter Crown, Wind of Nature...).
 *
 * NO se apunta "castiga al que pega con ataque basico" (Blade Armor, Antique
 * Cuirass) aunque el texto tambien lo diga: para usarlo haria falta saber
 * quien pega con ataque basico, y eso NO lo sabemos. Nuestro `damage` se
 * cuenta de las HABILIDADES, asi que a un tirador le falta justo su ataque
 * basico -Melissa sale "mixto" siendo fisica-, y el rol se equivoca con
 * Gusion, Hylos, Natan y Kimmy. Un dato que no se puede usar es dato muerto.
 */
const EFECTOS = {
  antiCuracion: /reduc\w*[^.]{0,60}(HP Regen|Regen|healing|Heal)\b/i,
  cortaControl: /(CC and Slow Duration reduced|immune to all damage and effects|reduc\w*[^.]{0,30}\b(CC|Crowd Control)\b)/i,
};

function extraerEfectos(d) {
  const texto = Object.keys(d)
    .filter((k) => /^equipskill/.test(k))
    .map((k) => d[k])
    .join(' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return Object.entries(EFECTOS).filter(([, re]) => re.test(texto)).map(([k]) => k);
}

/**
 * El catalogo de objetos: id -> nombre, tipo y defensa medida.
 *
 * Una sola peticion para los 152 objetos. Los nombres van en ingles a
 * proposito, como los de heroe: son la clave del dato, y ensenar un nombre
 * traducido mientras el motor busca otro es el fallo invisible de siempre.
 */
export async function fetchEquipo() {
  const out = {};
  if (!estado.ROUTES?.equipment) return out;

  // Se leen TODAS las rutas de objetos que haya, no solo la mejor. La ruta
  // /expanded trae `equiptips` -de donde sale la defensa- pero 152 objetos; la
  // corta trae 184 sin tips. Con solo la primera, tres builds ensenaban
  // "#10001" en vez de "Lantern of Hope". Gana la primera que dé cada campo,
  // asi que la que va delante (la del esquema) manda donde tiene dato.
  const rutas = [estado.ROUTES.equipment, ...(estado.ROUTES.equipment.alternativas ?? [])];
  for (const ruta of rutas) {
    // Sin valor inicial a proposito: si la ruta falla se sigue con la
    // siguiente, asi que `rows` solo se lee cuando la peticion ha ido bien.
    let rows;
    try {
      ({ rows } = await callRoute(ruta, { size: 300, index: 1, lang: 'en' }));
    } catch {
      continue; // una ruta caida no puede costarnos las que si responden
    }
    for (const row of rows) {
      const d = row?.data ?? row;
      const id = Number(d?.equipid ?? d?.id);
      const nombre = d?.equipname ?? d?.name;
      if (!Number.isFinite(id) || !nombre) continue;
      const { magica, fisica } = extraerDefensa(d.equiptips);
      const obj = out[id] ?? {};
      obj.nombre ??= String(nombre).trim();
      obj.tipo ??= d.equiptypename ?? null;
      if (d.equipicon && !obj.icono) obj.icono = String(d.equipicon);
      if (magica && !obj.magica) obj.magica = magica;
      if (fisica && !obj.fisica) obj.fisica = fisica;
      const efectos = extraerEfectos(d);
      if (efectos.length && !obj.efectos) obj.efectos = efectos;
      out[id] = obj;
    }
    await sleep(200);
  }
  return out;
}

/**
 * Builds por heroe y linea, tal como las juega la gente en el rango pedido.
 *
 * Se pide SOLO para las lineas que cada heroe juega de verdad (164 peticiones,
 * no 665): pedir la build de jungla de un support devuelve ruido o nada.
 *
 * Lo que viene son las tres builds mas frecuentes, con su winrate y su cuota
 * de uso, y TRES objetos: son los del nucleo, no los seis del inventario. Se
 * guarda tal cual, sin completar lo que la API no da.
 *
 * OJO con el winrate de una build: no es causal. Quien elige una build rara
 * suele ser quien mas juega ese heroe, asi que parte de la ventaja es del
 * jugador y no del objeto. La app lo dice en pantalla; aqui solo se recoge.
 */
export async function fetchBuilds(heroList) {
  const out = {};
  if (!estado.ROUTES?.builds) return out;
  const lineasValidas = new Set(['roam', 'jungle', 'mid', 'gold', 'exp']);
  const errores = [];
  let pedidas = 0;

  for (const h of heroList) {
    const suyas = (h.lanes ?? []).filter((l) => lineasValidas.has(l));
    for (const lane of suyas) {
      pedidas += 1;
      try {
        const { data } = await callRoute(
          estado.ROUTES.builds,
          { lane, rank: RANK, lang: 'en', size: 20, index: 1 },
          h.id ?? h.name,
        );
        const lista = recogerBuilds(data);
        if (lista.length) (out[h.name] ??= {})[lane] = lista;
      } catch (err) {
        if (errores.length < 4) errores.push(`${h.name}/${lane}: ${err.message}`);
      }
      await sleep(200);
    }
  }
  diagnostics.builds = {
    pedidas,
    heroes: Object.keys(out).length,
    builds: Object.values(out).reduce((a, porLinea) => a + Object.values(porLinea).reduce((b, l) => b + l.length, 0), 0),
    errores,
  };
  return out;
}

/**
 * Saca las builds de la respuesta sin fijar la forma del envoltorio: se busca
 * el primer array cuyos elementos tengan `equipid`, este donde este.
 */
function recogerBuilds(node, depth = 0) {
  if (depth > HONDURA || node == null || typeof node !== 'object') return [];
  if (Array.isArray(node) && node.some((x) => x && typeof x === 'object' && Array.isArray(x.equipid))) {
    return node
      .filter((b) => Array.isArray(b?.equipid) && b.equipid.length)
      .map((b) => {
        const out = { objetos: b.equipid.map(Number).filter(Number.isFinite) };
        const wr = Number(b.build_win_rate ?? b.win_rate);
        const pr = Number(b.build_pick_rate ?? b.pick_rate);
        if (Number.isFinite(wr)) out.winRate = wr;
        if (Number.isFinite(pr)) out.pickRate = pr;
        const emblema = b?.emblem?.data?.emblemname ?? b?.emblem?.emblemname;
        const hechizo = b?.battleskill?.data?.__data?.skillname ?? b?.battleskill?.data?.skillname;
        if (emblema) out.emblema = String(emblema);
        if (hechizo) out.hechizo = String(hechizo);
        return out;
      })
      .filter((b) => b.objetos.length);
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const found = recogerBuilds(v, depth + 1);
    if (found.length) return found;
  }
  return [];
}

export async function fetchHeroList() {
  const values = { size: 300, index: 1, page_size: 300, page_index: 1, lang: 'en' };
  const { rows } = estado.ROUTES?.position
    ? await callRoute(estado.ROUTES.position, values)
    : await fetchResource(['/hero-position/', '/hero-position', '/hero-list/'], values);
  const heroes = [];
  for (const row of rows) {
    const name = pick(row, NAME_KEYS);
    if (!name) continue;
    heroes.push({
      name: String(name).trim(),
      id: idPrincipal(row),
      // pick() primero por si la API vuelve a una forma plana; si no, se busca.
      role: String(pick(row, ['role', 'hero_role', 'primary_role']) ?? '').toLowerCase() || extraerRol(row),
      lane: String(pick(row, ['lane', 'hero_lane', 'primary_lane']) ?? '').toLowerCase(),
      // Varias líneas por héroe: es lo que permite adivinar quién es su roam.
      lanes: extraerLineas(row),
    });
  }
  return heroes;
}

export async function fetchStats(rank) {
  const values = {
    days: DAYS, past_days: DAYS,
    rank, rank_id: rank,
    size: 200, index: 1, page_size: 200, page_index: 1,
    sort_field: 'win_rate', sort_order: 'desc', order: 'desc', lang: 'en',
  };
  const { rows } = estado.ROUTES?.rank
    ? await callRoute(estado.ROUTES.rank, values)
    : await fetchResource(['/hero-rank/', '/hero-rank', '/hero-rate/'], values);

  const stats = {};
  for (const row of rows) {
    const name = pick(row, NAME_KEYS);
    if (!name) continue;
    stats[String(name).trim()] = {
      winRate: asRate(pick(row, ['win_rate', 'winRate', 'main_hero_win_rate'])),
      pickRate: asRate(pick(row, ['pick_rate', 'pickRate', 'main_hero_appearance_rate'])),
      banRate: asRate(pick(row, ['ban_rate', 'banRate', 'main_hero_ban_rate'])),
      matches: Number(pick(row, ['matches', 'match_count', 'total']) ?? 0) || null,
      heroId: idPrincipal(row),
    };
  }
  return stats;
}
