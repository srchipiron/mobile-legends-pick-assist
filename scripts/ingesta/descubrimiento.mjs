/**
 * Ninguna ruta escrita a mano [C]: se lee el esquema OpenAPI, se buscan por
 * patrón las candidatas de cada recurso (todas) y, para cruces y parejas, se
 * elige midiendo cuál trae más datos de verdad.
 */

import { RUTA_PROHIBIDA, callRoute, request } from './descarga.mjs';
import { recogerPares, relationMap } from './relaciones.mjs';

/** Lo que se busca en el esquema, en orden de preferencia [D]. */
const BUSCADAS = {
  rank: [/hero[-_]?rank/i, /hero[-_]?rate/i, /\brank\b/i],
  position: [/positions?\/?$/i, /hero[-_]?position/i, /hero[-_]?list/i, /\bheroes?\/?$/i],
  counter: [/counters?\/?$/i, /counter/i, /matchup/i, /relations?\/?$/i, /relation/i],
  compatibility: [/compatibilit/i, /compat/i, /synerg/i, /teammates?\/?$/i, /partner/i, /relations?\/?$/i, /relation/i],
  // Acaba en el parámetro: no `/{id}/stats` [D].
  detail: [/heroes?\/\{[^}]+\}\/?$/i],
  // `/expanded` trae `equiptips`, de donde sale la defensa [M].
  equipment: [/equipment\/expanded\/?$/i, /equipments?\/?$/i, /items?\/?$/i],
  builds: [/builds?\/?$/i, /equip[-_]?recommend/i],
  lineas: [/win[-_]?rate\/timeline\/?$/i],
  talentos: [/emblems?\/?$/i],
};
/** Llevan el héroe en el camino: primero las que tienen `{…}` [D]. */
const CON_ID = new Set(['counter', 'compatibility', 'detail', 'builds', 'lineas']);

/**
 * Lee el esquema de la primera base que lo sirva. Devuelve `{ rutas, schema,
 * routes }` (rutas: `{ clave: { template, method, params, alternativas? } }`)
 * o `{ rutas: null }`; los esquemas que no responden van a `ctx.fallos`.
 */
export async function descubrirRutas(ctx) {
  let leido = { schema: null, routes: null };
  for (const base of ctx.op.bases) {
    const origen = new URL(base).origin;
    for (const url of [`${base}/openapi.json`, `${origen}/openapi.json`, `${origen}/api/openapi.json`]) {
      let esquema;
      try {
        esquema = await request(url, 'GET');
      } catch (err) {
        ctx.fallos.push(`${url} → ${err.message}`);
        continue;
      }
      if (!esquema?.paths) continue;
      // Las de la cuenta fuera, encajen o no con un patrón (primera puerta) [C].
      const caminos = Object.keys(esquema.paths).filter((p) => !RUTA_PROHIBIDA.test(p));
      const schema = { url, pathCount: caminos.length, heroPaths: caminos.filter((p) => /hero|counter|relation|compat/i.test(p)).slice(0, 30) };
      console.log(`  · esquema leído: ${caminos.length} rutas en ${url}`);
      const describir = (camino) => {
        const [method, op] = Object.entries(esquema.paths[camino])[0];
        return { template: origen + camino, method: method.toUpperCase(), params: (op?.parameters ?? []).map((p) => p.name) };
      };
      const rutas = {};
      for (const [clave, patrones] of Object.entries(BUSCADAS)) {
        const candidatas = [...new Set(patrones.flatMap((re) => caminos.filter((p) => re.test(p))))];
        const conId = candidatas.filter((p) => p.includes('{'));
        const orden = CON_ID.has(clave) ? [...conId, ...candidatas] : candidatas.filter((p) => !p.includes('{'));
        if (!orden.length) continue;
        rutas[clave] = describir(orden[0]);
        // Las demás, para ELEGIR midiendo: /academy daba los 132 cruces y la preferida 5 [M].
        const otras = [...new Set(orden)].filter((p) => p !== orden[0]);
        if (otras.length) rutas[clave].alternativas = otras.map(describir);
      }
      const routes = Object.fromEntries(Object.entries(rutas).map(([k, r]) => [k, `${r.method} ${r.template} (${r.params.join(', ') || 'sin params'})`]));
      if (Object.keys(rutas).length) return { rutas, schema, routes };
      leido = { schema, routes };
    }
  }
  return { rutas: null, ...leido };
}

/**
 * Entre las candidatas de `clave`, la que más pares legibles trae con un héroe
 * de prueba; deja la ganadora en `ctx.rutas[clave]` y devuelve el texto para
 * `diagnostics.rutasMedidas` (o null si no hay alternativas). Un error no es
 * un cero: se reintenta, y solo gana una que traiga MÁS pares [M].
 */
export async function medirRutas(ctx, clave, heroe) {
  const ruta = ctx.rutas?.[clave];
  if (!ruta?.alternativas?.length) return null;
  const { dias, rank } = ctx.op;
  const valores = { days: dias, past_days: dias, rank, rank_id: rank, lang: 'en', size: 200, index: 1, hero_id: heroe, id: heroe };
  const medir = async (r) => {
    try {
      const { data } = await callRoute(r, valores, heroe);
      return Object.keys(relationMap(recogerPares(data), new Map())).length || recogerPares(data).length;
    } catch {
      return -1;
    }
  };
  const medirConReintento = async (r) => {
    const n = await medir(r);
    if (n >= 0) return n;
    await ctx.sleep(500);
    return medir(r);
  };
  let mejor = { ruta, pares: await medirConReintento(ruta) };
  for (const alt of ruta.alternativas) {
    const pares = await medirConReintento(alt);
    await ctx.sleep(200);
    if (pares > Math.max(mejor.pares, 0)) mejor = { ruta: alt, pares };
  }
  if (mejor.ruta !== ruta) {
    console.log(`  · ${clave}: gana ${mejor.ruta.template} con ${mejor.pares} pares`);
    ctx.rutas[clave] = { ...mejor.ruta, alternativas: ruta.alternativas };
  } else {
    console.log(`  · ${clave}: se queda ${ruta.template} con ${mejor.pares} pares`);
  }
  return `${mejor.pares} pares · ${mejor.ruta.template}`;
}
