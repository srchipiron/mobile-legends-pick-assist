import { ROLE_DEFAULTS, SPECIALITY_TAGS, ROLE_VETO, TEAM_NEEDS } from './rules.js';

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * Precisión medida de los tags deducidos (rol + speciality) frente a los
 * escritos a mano. Sale de scripts/derivar-tags.mjs, no de una intuición.
 */
export const PRECISION_DEDUCIDA = 0.67;

/** Riesgo de contrapick a partir del cual un pick es «castigable a ciegas». */
export const RIESGO_AVISO = 0.6;

/**
 * ¿Es un pick a ciegas? Riesgo alto Y más de dos enemigos por ver. Un solo
 * predicado para la tarjeta y para el análisis: antes cada uno tenía el suyo
 * y con cuatro enemigos vistos la tarjeta callaba y el análisis avisaba.
 */
export function esPickCiego(riesgo, enemigosVistos) {
  const cegera = Math.max(0, 5 - enemigosVistos) / 5;
  return riesgo != null && riesgo > RIESGO_AVISO && cegera > 0.4;
}

/**
 * Desde qué cruce merece la pena decir "ganas" o "pierdes" este enfrentamiento.
 *
 * Medido sobre los 17.556 cruces reales, no supuesto: la distribución es MUY
 * estrecha (p10 0.4846, mediana 0.5000, p90 0.5154). El umbral anterior era
 * 0.53, que es el percentil 99: solo lo alcanzaba el 1,6% de los cruces, así
 * que el motivo respaldado por datos casi nunca salía y en su lugar se leían
 * los de los tags, que es lo que la app tenía peor fundado.
 *
 * Con el p90/p10 el motivo sale para el 10% de cruces más marcados de cada
 * lado, que es justo lo que significa "este cruce destaca".
 *
 * Si cambias de fuente de datos, vuelve a medir la distribución: este número no
 * es una opinión sobre qué winrate es "bueno", es dónde está la cola.
 */
export const CRUCE_DESTACABLE = 0.5154;
export const CRUCE_MALO = 0.4846;

/**
 * Lo mismo para las PAREJAS, que tienen su propia distribución y no valen los
 * números de los cruces: medida sobre las 8.778 parejas reales, p90 = 0.5100
 * (los cruces daban 0.5154). Es más estrecha por arriba y más ancha por abajo.
 *
 * También estuvo en 0.53, que aquí es el percentil 99: "combina bien con X"
 * salía en el 1,3% de las parejas, o sea casi nunca. Tercera vez que aparece
 * ese mismo 0.53 escrito a mano en un sitio distinto; si vuelves a calibrar
 * algo contra una distribución, busca sus gemelas antes de darlo por hecho.
 */
export const PAREJA_DESTACABLE = 0.51;

/**
 * Clave normalizada de un nombre de héroe. La API y el catálogo escriben lo
 * mismo de formas distintas ("X.Borg" / "X Borg", "Yi Sun-shin" / "Yi Sun Shin",
 * "Chang'e" / "Change"), y un fallo aquí es invisible: el héroe simplemente se
 * queda sin datos y nadie se entera.
 */
export const normName = (name) =>
  String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')          // "Popol & Kupa" = "Popol and Kupa"
    .replace(/[^a-z0-9]/g, '');

/**
 * Reindexa {nombre: valor} por clave normalizada.
 * `depth` dice cuántos niveles de nombres hay: 1 para las estadísticas,
 * 2 para las matrices de counters y sinergias. Antes se adivinaba mirando si el
 * valor tenía winRate, y una estadística sin ese campo se rompía en silencio.
 */
export function indexByName(obj, depth = 1) {
  if (!obj) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[normName(k)] = depth > 1 ? indexByName(v, depth - 1) : v;
  }
  return out;
}

/**
 * Busca por clave normalizada y, si no, por el nombre tal cual. El respaldo
 * importa: si quien llama no normalizó el mapa, la versión anterior devolvía
 * "sin datos" en silencio y todos los héroes empataban a 0.50.
 */
export const lookup = (map, name) => {
  if (!map) return undefined;
  return map[normName(name)] ?? map[name];
};

/**
 * Winrate de A contra B, mirando también el sentido contrario.
 *
 * Cuando un par existe en los dos sentidos suman EXACTAMENTE 1 (medido:
 * diferencia 0.0000 hasta en el peor caso), así que `1 - counters[B][A]` no es
 * una estimación, es el mismo dato por el otro lado.
 *
 * Desde 1.5.0 la matriz viene completa y la vuelta casi nunca hace falta. Se
 * queda porque cuesta nada y porque es justo lo que salva a un héroe recién
 * salido, del que la API publica sus cruces antes que su fila propia. Cuando la
 * matriz estaba a medias, esto subía la cobertura del 7,6% al 11,2%.
 */
export function matchup(counterMatrix, a, b) {
  const ida = lookup(lookup(counterMatrix, a), b);
  if (ida != null) return ida;
  const vuelta = lookup(lookup(counterMatrix, b), a);
  return vuelta != null ? 1 - vuelta : undefined;
}

/**
 * Sinergia de A con B, mirando también el sentido contrario.
 *
 * Mismo problema que en los counters y misma solución, pero SIN darle la
 * vuelta al número: llevar a A con B es exactamente lo mismo que llevar a B
 * con A, así que el dato es el mismo por los dos lados. Comprobado sobre los
 * datos de verdad: en los 271 pares que la API da en ambos sentidos, la
 * diferencia es 0.000000.
 *
 * Leyendo solo la fila del héroe se perdía el 37% de los cruces que la API sí
 * tenía: 1330 de 2118. No se notaba porque cuando falta el dato entran las
 * reglas por tags y la nota sale igual de razonable, solo que peor fundada.
 * Desde 1.5.0 la matriz viene completa y esto es, como en los counters, la red
 * para los héroes nuevos.
 */
export function sinergia(synergyMatrix, a, b) {
  const ida = lookup(lookup(synergyMatrix, a), b);
  if (ida != null) return ida;
  return lookup(lookup(synergyMatrix, b), a);
}

/**
 * ¿Es un aliado de los que hay que proteger?
 *
 * Un tanque también lleva el tag `immobile`, así que sin este filtro la app
 * recomendaba hacerle peel a la primera línea -y banear a quien le saltara
 * encima-, que es justo al revés de cómo se juega.
 *
 * Vive aquí y no dentro de una función porque el criterio se necesita en DOS
 * sitios: la sinergia y los baneos. Estaba escrito solo en el primero, y el
 * fallo sobrevivió entero en el segundo: el 12,1% de los avisos de peligro
 * protegían a un tanque.
 */
export const hayQueProtegerlo = (hero) =>
  ['hypercarry', 'poke', 'burst'].some((t) => hero?.tags?.includes(t))
  && !hero?.tags?.includes('tanky');

/** Tags que cubren la misma necesidad: encadenar CC vale como control duro. */
export const SATISFIES = {
  cc_hard: ['cc_hard', 'cc_chain'],
  peel: ['peel', 'shield', 'anti_dive'],
  sustain: ['sustain', 'heal'],
  engage: ['engage'],
  tanky: ['tanky'],
  vision: ['vision'],
};

const has = (hero, need) => (SATISFIES[need] ?? [need]).some((t) => hero.tags.includes(t));

/**
 * Cuánto pesa el 50% mientras no tengas partidas suficientes, en partidas
 * equivalentes.
 *
 * Antes esto era un CORTE: por debajo de 100 partidas tu nivel era 0.50 y a
 * partir de 100 era tu winrate real. Medido, ese salto reordenaba el 27% de
 * las recomendaciones (54 de 200 drafts cambiaban de número 1) al apuntar UNA
 * partida más. Un jugador no cambia de nivel entre la partida 99 y la 100.
 *
 * Ahora se encoge hacia el 50% como todo lo demás en esta app. El valor
 * conserva la intención del umbral que había —con 100 partidas te crees la
 * mitad de lo que dicen, con 400 el 80%— pero sin acantilado.
 *
 * Aviso honesto: los encogimientos de `metaScore` y `masteryScore` salen de una
 * dispersión MEDIDA; este no. Haría falta saber cuánto varía el winrate global
 * entre jugadores del mismo rango, y ese dato no lo tenemos. Es una elección
 * conservadora, no una medición: si algún día se puede medir, se cambia por
 * `k = 0.25/σ²` como los otros.
 */
const PRIOR_DE_TU_NIVEL = 100;

export function tuNivel(mastery = {}) {
  let partidas = 0;
  let ganadas = 0;
  for (const m of Object.values(mastery ?? {})) {
    if (!(m?.games > 0) || m.winRate == null) continue;
    partidas += m.games;
    ganadas += m.winRate * m.games;
  }
  if (!partidas) return 0.5;
  return (0.5 * PRIOR_DE_TU_NIVEL + ganadas) / (PRIOR_DE_TU_NIVEL + partidas);
}

/**
 * Tu winrate personal con ese héroe, encogido si llevas pocas partidas.
 *
 * OJO con la referencia: se encoge hacia TU NIVEL, no hacia el 50%, y la escala
 * va centrada en tu nivel. Antes iba centrada en 0.50, y eso metía un sesgo que
 * NO es el que esta función dice medir: para alguien que gana el 53,4% de sus
 * partidas, un héroe jugado a su media exacta puntuaba 0.64 y uno que no ha
 * tocado nunca, 0.50. O sea que premiaba TENER DATOS, no ser bueno con el
 * héroe. Y un héroe al 50%, que para él es de los peores, salía neutro.
 *
 * Centrado en tu nivel: por encima de lo tuyo sube, por debajo baja, y a tu
 * media exacta empata con un héroe del que no se sabe nada. Que es justo lo que
 * la función dice que mide.
 */
/**
 * Cuánto encoger un winrate personal hacia tu nivel, en partidas de prior.
 *
 * No es un número suelto: en un encogimiento bayesiano el peso del prior es
 *
 *     k = varianza de muestreo / varianza REAL entre héroes = 0.25 / σ²
 *
 * donde σ es lo que de verdad varía tu winrate de un héroe a otro. Y eso se
 * puede MEDIR de tus propias partidas: la dispersión que se observa entre tus
 * héroes menos la que explica el propio muestreo.
 *
 * El valor que había, 20, equivale a suponer σ = ±11 puntos: que tu winrate va
 * del 42% al 64% según el héroe. No es creíble, y salía caro: cinco partidas
 * al 90% puntuaban 0.87, casi el tope.
 *
 * Los límites están para que un jugador con pocos datos no acabe con un prior
 * absurdo en ninguno de los dos sentidos.
 */
const SIGMA_MINIMA = 0.02;
const SIGMA_MAXIMA = 0.08;
/** Con menos de esto no se puede medir la dispersión: se usa ±4 puntos. */
const HEROES_PARA_MEDIR_DISPERSION = 5;
/** Partidas a partir de las cuales un héroe cuenta «entero» para medir tu dispersión (peso games/(games+30)). */
const PARTIDAS_PARA_CONTAR = 30;
const SIGMA_POR_DEFECTO = 0.04;

export function priorDeMaestria(mastery = {}, nivel) {
  const base = nivel ?? tuNivel(mastery);
  // Sin umbral duro: antes contaban solo los héroes con ≥ 30 partidas y solo
  // a partir de 5 de ellos, y el quinto que pasaba de 29 a 30 movía k de 156
  // a 354 de golpe. Ahora cada héroe pesa games/(games+30) y la sigma medida
  // se funde con la de por defecto según cuántos héroes efectivos hay.
  const suyos = Object.values(mastery ?? {})
    .filter((m) => m?.games > 0 && m.winRate != null)
    .map((m) => ({ ...m, w: m.games / (m.games + PARTIDAS_PARA_CONTAR) }));
  const nEf = suyos.reduce((s, m) => s + m.w, 0);
  let sigmaMedida = SIGMA_POR_DEFECTO;
  if (nEf > 0) {
    // Con corrección de Bessel (nEf/(nEf−1)): la varianza alrededor de la
    // media de la MISMA muestra queda corta y k salía ~15% alto (simulado:
    // mediana 179 frente a los 156 de 0.25/σ²).
    const observada = suyos.reduce((s, m) => s + m.w * (m.winRate - base) ** 2, 0) / nEf * (nEf > 1 ? nEf / (nEf - 1) : 1);
    // Lo que explica el propio muestreo. Lo que sobra es variación de verdad.
    const porMuestreo = suyos.reduce((s, m) => s + m.w * 0.25 / m.games, 0) / nEf;
    const real = observada - porMuestreo;
    sigmaMedida = real > 0 ? Math.sqrt(real) : SIGMA_MINIMA;
  }
  let sigma = (SIGMA_POR_DEFECTO * HEROES_PARA_MEDIR_DISPERSION + sigmaMedida * nEf) / (HEROES_PARA_MEDIR_DISPERSION + nEf);
  sigma = Math.max(SIGMA_MINIMA, Math.min(SIGMA_MAXIMA, sigma));
  return 0.25 / (sigma * sigma);
}

export function masteryScore(roamHero, mastery, nivel, prior) {
  const m = lookup(mastery, roamHero.name) ?? mastery?.[roamHero.name];
  // Sin partidas o sin winrate, neutro: un `winRate: null` importado daba
  // 0·games = 0% y castigaba al héroe con la nota mínima.
  if (!m || !(m.games > 0) || m.winRate == null) return { value: 0.5, reasons: [] };
  const base = nivel ?? tuNivel(mastery);
  const k = prior ?? priorDeMaestria(mastery, base);
  const shrunk = (m.winRate * m.games + base * k) / (m.games + k);
  // Escala DERIVADA de tu dispersión, no fija: 1 es dos desviaciones por
  // encima de tu nivel (con la σ que `priorDeMaestria` mide de tus datos,
  // ±4 puntos → ±8), 0 dos por debajo, 0.5 como tú. Este valor ya no pasa
  // por la normalización min-max del ranking, así que su escala ES la
  // contribución: con ±10 fijos, 1.000 partidas al 70% no llegaban al tope.
  const sigma = Math.sqrt(0.25 / k);
  const value = clamp01((shrunk - base) / (4 * sigma) + 0.5);
  // El motivo se mide contra TU nivel, igual que la nota, y no contra un 55%
  // fijo. Con el umbral absoluto, a un jugador que gana el 53,4% de sus
  // partidas un héroe al 55% le salía como "lo llevas bien" siendo casi su
  // media exacta, y a uno que gana el 45% no le reconocía nunca su mejor
  // héroe. Es el mismo fallo que ya se arregló en la NOTA de maestría y que
  // se habia quedado vivo aqui.
  //
  // El margen es la dispersión que la app ya mide de tus propios datos
  // (`priorDeMaestria` la saca de ahí): destacar es salirse una desviación de
  // lo tuyo, no cruzar un número redondo.
  // Y se decide con el estimado ENCOGIDO, no con el winrate bruto. El bruto con
  // un corte de 20 partidas hacia justo lo contrario de lo que debe: 20
  // partidas al 60% sacaban "lo llevas al 60%" (encogido: 54,0%, o sea nada) y
  // 300 partidas al 57% no sacaban nada (encogido: 55,7%, una senal de verdad).
  // La evidencia debil se ensenaba y la fuerte no. El encogimiento ya lleva
  // dentro el tamano de muestra, asi que no hace falta ningun corte de partidas.
  // Lo que se ENSENA sigue siendo el bruto con su n: "60% en 20" es lo que
  // paso, y el lector ya ve que son veinte.
  const reasons = [];
  if (shrunk >= base + sigma) {
    reasons.push({ clave: 'regla.maestriaBuena', params: { pct: Math.round(m.winRate * 100), n: m.games }, good: true, w: 1.4 });
  }
  if (shrunk <= base - sigma) {
    reasons.push({ clave: 'regla.maestriaMala', params: { pct: Math.round(m.winRate * 100), n: m.games }, good: false, w: 1.4 });
  }
  return { value, reasons };
}

/**
 * Lo lejos del empate que llega el décimo peor cruce del héroe MÁS castigable.
 *
 * Sale del reparto real, no de una intuición: con la matriz completa el p10 de
 * cada héroe va de 0.465 a 0.492, así que la distancia al empate va de 0.008 a
 * 0.035. Dividir por eso reparte el riesgo entre 0.22 y 1.00, con la mediana
 * en 0.43.
 *
 * Estaba en 0.08, y ese número venía de cuando la API solo devolvía los cinco
 * cruces MÁS EXTREMOS de cada héroe. Con esa muestra sesgada el p10 parecía
 * 0.467; con la matriz entera es 0.485. Manteniendo 0.08, el héroe más
 * castigable del juego marcaba 0.43 y NADIE pasaba de 0.6: el aviso de "estás
 * eligiendo a ciegas y este pick es castigable" no habría vuelto a salir
 * nunca, sin que nada fallara.
 */
const PEOR_CRUCE_REAL = 0.035;

/**
 * Completa el catalogo con los heroes que solo conoce la API.
 * Marca los rellenados con `inferred` para poder avisarlo en la interfaz.
 */
export function mergeCatalog(catalogHeroes, apiHeroes = []) {
  // El tipo de dano lo tiene la API para los 133, tambien para los que ya
  // estan en el catalogo escrito a mano: el catalogo lleva rol y tags, no dano.
  const porApi = new Map(apiHeroes.map((h) => [normName(h.name), h]));
  const byName = new Map(catalogHeroes.map((h) => {
    const api = porApi.get(normName(h.name));
    // El id tampoco lo lleva el catalogo, y hace falta para pedir su retrato:
    // los ficheros van por id porque un id no cambia aunque Moonton reescriba
    // el nombre, que es justo lo que aqui rompe las cosas en silencio.
    return [h.name, {
      ...h,
      ...(api?.damage ? { damage: api.damage } : {}),
      ...(api?.id != null ? { id: api.id } : {}),
    }];
  }));
  // «Ya está en el catálogo» por nombre NORMALIZADO: con la clave cruda, el
  // día que la API escriba «X.Borg» y el catálogo «X Borg» habría dos héroes.
  const enCatalogo = new Set(catalogHeroes.map((h) => normName(h.name)));
  for (const api of apiHeroes) {
    if (enCatalogo.has(normName(api.name))) continue;
    const role = (api.role ?? '').toLowerCase();
    byName.set(api.name, {
      name: api.name,
      ...(api.id != null ? { id: api.id } : {}),
      role,
      tags: tagsDeducidos(role, api.speciality),
      roam: role === 'tank' || role === 'support',
      inferred: true,
      ...(api.damage ? { damage: api.damage } : {}),
    });
  }
  return [...byName.values()];
}

/**
 * Proporcion a partir de la cual un heroe cuenta como que pega de las dos
 * cosas. Sale del reparto real de los 133, no de una intuicion.
 */
const MIXTO_DESDE = 0.5;

/**
 * De que pega un heroe: 'fisico', 'magico', 'mixto' o null si no se sabe.
 *
 * Las cuentas salen de los textos de habilidad de Moonton (ver `extraerDano`
 * en la ingesta), no del rol. El rol se equivocaria en unos cuantos: Gusion es
 * asesino y pega magico, Hylos es tanque y pega magico, Esmeralda pega las dos
 * cosas de verdad.
 *
 * El dano verdadero no cuenta como tipo: atraviesa las dos defensas, asi que
 * no ayuda a decidir si al equipo le falta un lado.
 */
export function tipoDeDano(hero) {
  const d = hero?.damage;
  if (!d) return null;
  const { fisico = 0, magico = 0 } = d;
  if (!fisico && !magico) return null;
  const menor = Math.min(fisico, magico);
  const mayor = Math.max(fisico, magico);
  if (menor >= mayor * MIXTO_DESDE) return 'mixto';
  return fisico > magico ? 'fisico' : 'magico';
}

/**
 * De que pega un equipo, y que lado le falta.
 *
 * Es el concepto de draft mas repetido en MLBB: si los cinco pegais fisico, al
 * rival le basta con comprar armadura y desapareceis en late. Lo mismo al
 * reves con la resistencia magica.
 *
 * `falta` solo se rellena cuando hay de que fiarse: al menos dos heroes con
 * dato y ninguno del lado que falta. Con un solo aliado elegido no se puede
 * decir que al equipo le falte nada.
 */
export function perfilDeDano(heroes = []) {
  const tipos = heroes.map(tipoDeDano);
  const conDato = tipos.filter(Boolean);
  const cuenta = (t) => tipos.filter((x) => x === t).length;
  const fisico = cuenta('fisico');
  const magico = cuenta('magico');
  const mixto = cuenta('mixto');

  let falta = null;
  if (conDato.length >= 2) {
    if (!magico && !mixto) falta = 'magico';
    else if (!fisico && !mixto) falta = 'fisico';
  }
  return { fisico, magico, mixto, sinDato: tipos.length - conDato.length, falta };
}

/** Un heroe mixto tapa cualquier hueco; uno puro solo el suyo. */
export function tapaElHueco(hero, falta) {
  if (!falta) return false;
  const t = tipoDeDano(hero);
  return t === falta || t === 'mixto';
}

/**
 * Tags de un héroe que no está en el catálogo escrito a mano.
 *
 * Base: los tags por defecto de su rol. Encima, lo que se pueda traducir de la
 * "speciality" que publica Moonton, quitando lo que el catálogo dice que nunca
 * le corresponde a ese rol. Con solo el rol se acertaba el 39.6% de los tags
 * reales; sumando la speciality, el 52.5%, sin perder precisión.
 */
export function tagsDeducidos(role, speciality = []) {
  const porRol = ROLE_DEFAULTS[role] ?? [];
  const veto = new Set(ROLE_VETO[role] ?? []);
  const porEsp = (speciality ?? [])
    .flatMap((e) => SPECIALITY_TAGS[e] ?? [])
    .filter((t) => !veto.has(t));
  return [...new Set([...porRol, ...porEsp])];
}

/** Las cinco líneas, en el orden en que se leen en el juego. */
export const LINEAS = ['roam', 'jungle', 'mid', 'gold', 'exp'];

/**
 * Héroes que se juegan en una línea, según la API.
 *
 * El pool NO está escrito a mano: sale de en qué líneas se juega de verdad cada
 * héroe. Un héroe puede aparecer en dos (31 de los 133 lo hacen) y eso es
 * correcto: Yu Zhong es exp y también jungla.
 *
 * Si no hay datos de líneas todavía, para roam se cae al catálogo escrito a
 * mano, que es el único que los tiene. Las otras cuatro se quedan vacías, y la
 * app lo dice en vez de inventarse un pool.
 */
export function poolDeLinea(heroes, indiceLineas, linea) {
  const conLineas = heroes.filter((h) => indiceLineas?.get?.(normName(h.name))?.lanes?.length);
  if (!conLineas.length) return linea === 'roam' ? heroes.filter((h) => h.roam) : [];
  return heroes.filter((h) => indiceLineas.get(normName(h.name))?.lanes?.includes(linea));
}

/**
 * Riesgo de contrapick: cuánto puede hundirse este roamer si el enemigo aún no
 * ha elegido y luego te saca su peor matchup.
 *
 * Idea tomada de las herramientas de draft de LoL, y especialmente pertinente en
 * roam porque sueles elegir pronto, a ciegas. En ese momento no quieres el mejor
 * pick sobre el papel, quieres el que menos te pueden castigar después.
 *
 * Devuelve 0..1, donde 1 es muy castigable. Se mide con el percentil 10 de sus
 * matchups (el mal día típico), no con el mínimo absoluto, que sería un dato
 * suelto con poca muestra.
 */
export function riesgoContrapick(roamHero, counterMatrix, candidatos) {
  const fila = lookup(counterMatrix, roamHero.name);
  if (!fila) return null;

  const valores = candidatos
    .map((h) => matchup(counterMatrix, roamHero.name, h.name))
    .filter((v) => v != null)
    .sort((a, b) => a - b);

  if (valores.length < 10) return null;

  const p10 = valores[Math.floor(valores.length * 0.1)];
  return clamp01((0.50 - p10) / PEOR_CRUCE_REAL);
}

/** Cuántos roamers tienen datos reales. Si baja, algo se ha roto en silencio. */
/**
 * Densidad de la matriz de counters: cuántos rivales cubre cada roamer de media.
 *
 * "34/34 con counters" solo dice que cada roamer tiene FILA, no que tenga dato
 * contra los cinco enemigos de tu partida. Hoy la matriz está al 100% (132
 * rivales por héroe); esto sigue midiendo cuánto se apoya la app en partidas
 * para el día que un héroe nuevo salga sin cruces y entren las reglas por tags.
 */
export function densidadCounters(pool, counters, candidatos) {
  if (!counters) return { media: 0, cobertura: 0 };
  const tam = pool.map((h) => Object.keys(lookup(counters, h.name) ?? {}).length);
  const media = tam.reduce((a, b) => a + b, 0) / (tam.length || 1);

  let conDato = 0;
  let total = 0;
  for (const h of pool) {
    for (const e of candidatos ?? []) {
      // Un héroe contra sí mismo no es un cruce que falte: no existe. Contarlo
      // dejaba la cobertura en el 99.2% con la matriz COMPLETA, y eso, leído en
      // el móvil, parece que falta algo cuando no falta nada.
      if (normName(h.name) === normName(e.name)) continue;
      total++;
      if (matchup(counters, h.name, e.name) != null) conDato++;
    }
  }
  return { media, cobertura: total ? conDato / total : 0 };
}

export function coverage(pool, stats, counters) {
  const missing = stats ? pool.filter((h) => !lookup(stats, h.name)).map((h) => h.name) : pool.map((h) => h.name);
  const conCounters = counters
    ? pool.filter((h) => Object.keys(lookup(counters, h.name) ?? {}).length).length
    : 0;
  return { withData: pool.length - missing.length, total: pool.length, missing, conCounters };
}

/**
 * Identidad de un motivo. Antes era su texto; ahora los motivos viajan como
 * clave más parámetros, así que la identidad se arma con las dos cosas. Sin
 * esto, dos motivos distintos sobre enemigos distintos se tomarían por el
 * mismo y se filtrarían mal.
 */
export function idRazon(r) {
  return `${r.clave}|${r.params?.e ?? r.params?.a ?? ''}`;
}

