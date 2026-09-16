/**
 * El descubrimiento de rutas: se lee el esquema OpenAPI y se busca por patron
 * lo que hace falta, guardando TODAS las candidatas, y despues se elige la que
 * mas datos trae de verdad llamandolas. Ninguna URL escrita a mano.
 */

import { BASES, DAYS, RANK, diagnostics, estado, sleep } from './contexto.mjs';
import { callRoute, request } from './descarga.mjs';
import { recogerPares, relationMap } from './relaciones.mjs';

/**
 * Descriptores de lo que necesitamos. La ruta real se busca en el esquema
 * OpenAPI por estos patrones, en vez de fijarla a mano: los nombres cambian
 * entre versiones pero el concepto no.
 */
const WANTED = {
  rank: [/hero[-_]?rank/i, /hero[-_]?rate/i, /\brank\b/i],
  position: [/positions?\/?$/i, /hero[-_]?position/i, /hero[-_]?list/i, /\bheroes?\/?$/i],
  // La API llamó a esto "Hero Relation" en versiones anteriores, y puede volver
  // a cambiarle el nombre. Se buscan todas las variantes plausibles.
  // El orden importa: se prueba patrón por patrón y gana el primero que exista.
  // /relations devuelve una estructura distinta, así que va detrás de las rutas
  // dedicadas, que son las que traen los pares legibles.
  counter: [/counters?\/?$/i, /counter/i, /matchup/i, /relations?\/?$/i, /relation/i],
  compatibility: [/compatibilit/i, /compat/i, /synerg/i, /teammates?\/?$/i, /partner/i, /relations?\/?$/i, /relation/i],
  // Ficha de un heroe. Solo se usa para su "speciality", y solo de los heroes
  // que no tienen tags escritos a mano: son 7, no 133, asi que el despliegue no
  // paga la diferencia. El patron exige que la ruta ACABE en el parametro, para
  // no coger /{id}/stats ni /{id}/trends.
  detail: [/heroes?\/\{[^}]+\}\/?$/i],
  // Objetos del juego. La variante /expanded trae `equiptips`, que es donde el
  // propio juego escribe cuanta defensa da cada objeto. Sin ella solo hay
  // nombre e icono, que no sirve para decidir nada.
  equipment: [/equipment\/expanded\/?$/i, /equipments?\/?$/i, /items?\/?$/i],
  // Builds de un heroe EN UNA LINEA. El parametro `lane` es obligatorio: sin
  // el la API devuelve 422.
  builds: [/builds?\/?$/i, /equip[-_]?recommend/i],
};

/** Rutas que llevan el heroe (o el recurso) dentro del camino, no como parametro. */
const CON_ID = new Set(['counter', 'compatibility', 'detail', 'builds']);

/**
 * Lee el esquema OpenAPI y devuelve un mapa de lo que nos interesa:
 *   { rank: { url, method, params }, position: {...}, ... }
 * Esto sustituye a adivinar rutas: la API dice cuáles tiene y con qué método.
 */
export async function discoverRoutes() {
  for (const base of BASES) {
    const origin = new URL(base).origin;
    for (const schemaUrl of [`${base}/openapi.json`, `${origin}/openapi.json`, `${origin}/api/openapi.json`]) {
      let schema;
      try {
        schema = await request(schemaUrl, 'GET');
      } catch (err) {
        diagnostics.failed.push(`${schemaUrl} → ${err.message}`);
        continue;
      }
      if (!schema?.paths) continue;

      const allPaths = Object.keys(schema.paths);
      diagnostics.schema = {
        url: schemaUrl,
        pathCount: allPaths.length,
        // Solo las de héroes: son las candidatas y caben en pantalla.
        heroPaths: allPaths.filter((p) => /hero|counter|relation|compat/i.test(p)).slice(0, 30),
      };
      console.log(`  · esquema leído: ${allPaths.length} rutas en ${schemaUrl}`);

      const routes = {};
      for (const [key, patterns] of Object.entries(WANTED)) {
        const wantsId = CON_ID.has(key);
        // Por patrón, en orden de preferencia: manda el primero que exista,
        // pero se guardan TODOS los que encajan con cualquier patrón. Antes se
        // cortaba en el primer patrón con resultados, y por eso la ruta de
        // teammates -que encaja con un patrón posterior- no llegaba nunca a
        // compararse con la de compatibility.
        const candidatos = [];
        for (const re of patterns) {
          for (const p of allPaths) {
            if (re.test(p) && !candidatos.includes(p)) candidatos.push(p);
          }
        }
        // Para counter y compatibilidad se prefiere la ruta con {id}, pero si la
        // API pide el héroe como parámetro normal, también sirve: exigir {id}
        // dejaba la ruta sin encontrar y tiraba todos los counters.
        const conId = candidatos.filter((p) => /\{/.test(p));
        const orden = wantsId ? [...conId, ...candidatos] : candidatos.filter((p) => !/\{/.test(p));
        const match = orden[0];
        if (!match) continue;

        const describir = (ruta) => {
          const [method, op] = Object.entries(schema.paths[ruta])[0];
          return {
            template: origin + ruta,
            method: method.toUpperCase(),
            params: (op?.parameters ?? []).map((prm) => prm.name),
          };
        };
        routes[key] = describir(match);
        // Los candidatos que quedan, para poder ELEGIR midiendo en vez de
        // suponiendo. Aquí antes se descartaban las rutas de /academy dando por
        // hecho que eran material didáctico. Era falso y caro: /academy da los
        // 132 cruces de cada héroe y la que se prefería, cinco.
        const otras = [...new Set(orden)].filter((p) => p !== match);
        if (otras.length) routes[key].alternativas = otras.map(describir);
      }

      diagnostics.routes = Object.fromEntries(
        Object.entries(routes).map(([k, r]) => [k, `${r.method} ${r.template} (${r.params.join(', ') || 'sin params'})`]),
      );
      if (Object.keys(routes).length) return routes;
    }
  }
  return null;
}

/**
 * Entre las rutas candidatas, la que MAS cruces devuelve de verdad.
 *
 * El esquema dice que varias rutas hablan de counters; no dice cual trae el
 * dato entero. Antes se elegia por el nombre -y se descartaban las de
 * /academy dando por hecho que eran material didactico-. Era falso y salia
 * caro: la ruta preferida devolvia CINCO cruces por heroe y la descartada los
 * 132, o sea la matriz completa. La cobertura de la app pasaba del 11% al 100%
 * por elegir mal una ruta.
 *
 * Ahora se llama a cada candidata con un heroe de prueba y gana la que mas
 * pares legibles trae. Si la API vuelve a mover las rutas de sitio, esto se
 * entera solo, que es la regla de toda la ingesta.
 */
export async function elegirRutaConMasDatos(clave, heroeDePrueba) {
  const ruta = estado.ROUTES?.[clave];
  if (!ruta?.alternativas?.length) return;

  const values = { days: DAYS, past_days: DAYS, rank: RANK, rank_id: RANK, lang: 'en', size: 200, index: 1 };
  const medir = async (r) => {
    try {
      const { data } = await callRoute(r, { ...values, hero_id: heroeDePrueba, id: heroeDePrueba }, heroeDePrueba);
      return Object.keys(relationMap(recogerPares(data), new Map())).length || recogerPares(data).length;
    } catch {
      return -1;
    }
  };

  let mejor = { ruta, pares: await medir(ruta) };
  // Un 5xx suelto en la ruta principal daba -1, y cualquier alternativa con
  // CERO pares «ganaba» (0 > -1): las 266 peticiones siguientes iban a una
  // ruta vacía y la matriz entera salía conservada. Se reintenta una vez y
  // solo se cambia por una ruta que traiga MÁS pares, no por una que no
  // traiga nada.
  if (mejor.pares < 0) { await sleep(500); mejor.pares = await medir(ruta); }
  for (const alt of ruta.alternativas) {
    const pares = await medir(alt);
    await sleep(200);
    if (pares > Math.max(mejor.pares, 0)) mejor = { ruta: alt, pares };
  }

  (diagnostics.rutasMedidas ??= {})[clave] = `${mejor.pares} pares · ${mejor.ruta.template}`;
  if (mejor.ruta !== ruta) {
    console.log(`  · ${clave}: gana ${mejor.ruta.template} con ${mejor.pares} pares`);
    estado.ROUTES[clave] = { ...mejor.ruta, alternativas: ruta.alternativas };
  } else {
    console.log(`  · ${clave}: se queda ${ruta.template} con ${mejor.pares} pares`);
  }
}
