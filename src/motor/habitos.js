import { esPrevia, compararProporciones, sanearDuracion } from './registro.js';
import { nombreClave } from './nombres.js';

/**
 * «Tus números» (3.48.0): lo que enseñan los rastreadores de partidas de
 * otros juegos (racha, sesión de hoy, winrate por hora, por héroe, tras una
 * derrota), con la regla del Veredicto: el margen va al lado del número y no
 * se afirma nada que quepa en él. Solo partidas apuntadas con la app (las
 * previas no tienen hora ni orden). Puro: la hora local se inyecta.
 */

// Decisión de producto: dos partidas a menos de 45 minutos son la misma
// sesión (una partida dura 10–25 y entre una y otra hay cola y draft).
export const HUECO_DE_SESION_MS = 45 * 60 * 1000;
// Decisión de producto: la sesión se enseña si la última partida es de
// hace menos de 12 horas («hoy»).
export const SESION_RECIENTE_MS = 12 * 60 * 60 * 1000;
// Decisión de producto: por debajo de 10 partidas un grupo no se enseña
// (con 10, el margen ya es ±30 puntos: más es ruido en pantalla).
export const MINIMO_POR_GRUPO = 10;
// Decisión de producto: un héroe sale en la lista desde 5 partidas.
export const MINIMO_POR_HEROE = 5;
// Franjas horarias: decisión de producto (tarde, tarde-noche, noche).
export const FRANJAS = [
  { id: 'tarde', desde: 0, hasta: 18 },
  { id: 'cena', desde: 18, hasta: 21 },
  { id: 'noche', desde: 21, hasta: 24 },
];
// Tramos de duración en minutos: decisión de producto (corta, normal, larga).
export const DURACIONES = [
  { id: 'corta', desde: 0, hasta: 15 },
  { id: 'media', desde: 15, hasta: 20 },
  { id: 'larga', desde: 20, hasta: Infinity },
];

/** Intervalo de Wilson al 95%: con 5 de 5 Wald daría [100, 100]. */
export function wilson(ganadas, n) {
  if (!(n > 0)) return null;
  const z = 1.96; const p = ganadas / n; const z2 = z * z;
  const centro = (p + z2 / (2 * n)) / (1 + z2 / n);
  const medio = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { bajo: Math.max(0, centro - medio), alto: Math.min(1, centro + medio) };
}

const ganadasDe = (lista) => lista.filter((p) => p.gane).length;

/** Un grupo contra el resto, con el error agrupado; null si alguno no llega al mínimo. */
function contraElResto(grupo, resto) {
  if (grupo.length < MINIMO_POR_GRUPO || resto.length < MINIMO_POR_GRUPO) return null;
  const a = ganadasDe(grupo) / grupo.length;
  const b = ganadasDe(resto) / resto.length;
  return { n: grupo.length, wr: a, nResto: resto.length, wrResto: b, ...compararProporciones(a, grupo.length, b, resto.length) };
}

const horaLocal = (t) => new Date(t).getHours();

export function tusNumeros(partidas = [], { ahora = Date.now(), hora = horaLocal } = {}) {
  const lista = (partidas ?? [])
    .filter((p) => p && !esPrevia(p) && Number.isFinite(p.t) && typeof p.gane === 'boolean')
    .sort((a, b) => a.t - b.t);
  const n = lista.length;
  const ganadas = ganadasDe(lista);
  const salida = { n, wr: n ? ganadas / n : null, racha: null, sesion: null, trasPerder: null, franjas: [], heroes: [], duraciones: [] };
  if (!n) return salida;

  // Racha: las últimas seguidas con el mismo resultado.
  const ultima = lista[n - 1];
  let k = 1;
  while (k < n && lista[n - 1 - k].gane === ultima.gane) k++;
  salida.racha = { gane: ultima.gane, n: k };

  // Sesión: las partidas encadenadas que acaban en la última, si es reciente.
  if (ahora - ultima.t < SESION_RECIENTE_MS) {
    let i = n - 1;
    while (i > 0 && lista[i].t - lista[i - 1].t < HUECO_DE_SESION_MS) i--;
    const sesion = lista.slice(i);
    salida.sesion = { n: sesion.length, ganadas: ganadasDe(sesion) };
  }

  // La partida siguiente, en la misma sesión, tras perder y tras ganar.
  const tras = { perder: [], ganar: [] };
  for (let i = 1; i < n; i++) {
    if (lista[i].t - lista[i - 1].t >= HUECO_DE_SESION_MS) continue;
    tras[lista[i - 1].gane ? 'ganar' : 'perder'].push(lista[i]);
  }
  salida.trasPerder = contraElResto(tras.perder, tras.ganar);

  for (const f of FRANJAS) {
    const dentro = lista.filter((p) => { const h = hora(p.t); return h >= f.desde && h < f.hasta; });
    const c = contraElResto(dentro, lista.filter((p) => !dentro.includes(p)));
    if (c) salida.franjas.push({ id: f.id, ...c });
  }

  const conDuracion = lista.filter((p) => sanearDuracion(p.duracion) != null);
  for (const d of DURACIONES) {
    const dentro = conDuracion.filter((p) => p.duracion >= d.desde && p.duracion < d.hasta);
    const c = contraElResto(dentro, conDuracion.filter((p) => !dentro.includes(p)));
    if (c) salida.duraciones.push({ id: d.id, ...c });
  }

  // Por héroe, por clave normalizada («X.Borg» y «X Borg» son el mismo).
  const porHeroe = new Map();
  for (const p of lista) {
    const clave = nombreClave(p.pick);
    if (!clave) continue;
    if (!porHeroe.has(clave)) porHeroe.set(clave, { heroe: p.pick, partidas: [] });
    porHeroe.get(clave).partidas.push(p);
  }
  const media = salida.wr;
  salida.heroes = [...porHeroe.values()]
    .filter((h) => h.partidas.length >= MINIMO_POR_HEROE)
    .map((h) => {
      const g = ganadasDe(h.partidas); const m = h.partidas.length;
      const ic = wilson(g, m);
      // «Se distingue de tu media» solo si el intervalo la deja fuera.
      const lado = ic.bajo > media ? 'mejor' : ic.alto < media ? 'peor' : null;
      return { heroe: h.heroe, n: m, wr: g / m, ...ic, lado };
    })
    .sort((a, b) => b.n - a.n || b.wr - a.wr);
  return salida;
}

// «Tu semana» (3.79.0): decisión de producto, los últimos 7 días contra los 7 de antes.
export const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
// Decisión de producto: un héroe entra en tu semana desde 3 partidas en ella.
export const MINIMO_SEMANA_HEROE = 3;
// Decisión de producto: dos que te funcionan y dos que te cuestan, no una lista.
export const HEROES_DE_LA_SEMANA = 2;

/**
 * Tu semana: cuántas, cómo te fue frente a la semana anterior (con el margen
 * al lado, «mejor» solo si se sale de él), los héroes que te funcionaron y
 * los que te costaron, y si cogiste el nº1 de la app y cómo te fue con y sin
 * él. Lo de los héroes es lo que PASÓ esta semana (con 3–6 partidas no dice
 * qué héroe es mejor para ti: eso es «Tus números»). Las de «pick supuesto»
 * (el lector no vio tu fila y puso el nº1) no cuentan para el nº1.
 */
export function tuSemana(partidas = [], { ahora = Date.now() } = {}) {
  const validas = (partidas ?? []).filter((p) => p && !esPrevia(p) && Number.isFinite(p.t) && typeof p.gane === 'boolean' && p.t <= ahora);
  const semana = validas.filter((p) => ahora - p.t < SEMANA_MS);
  const anterior = validas.filter((p) => ahora - p.t >= SEMANA_MS && ahora - p.t < 2 * SEMANA_MS);
  const n = semana.length;
  const salida = { n, ganadas: ganadasDe(semana), wr: n ? ganadasDe(semana) / n : null, anterior: null, funcionan: [], cuestan: [], numeroUno: null };
  if (!n) return salida;
  if (anterior.length) {
    const b = ganadasDe(anterior) / anterior.length;
    salida.anterior = { n: anterior.length, wr: b, ...compararProporciones(salida.wr, n, b, anterior.length) };
  }

  const porHeroe = new Map();
  for (const p of semana) {
    const clave = nombreClave(p.pick);
    if (!clave) continue;
    if (!porHeroe.has(clave)) porHeroe.set(clave, { heroe: p.pick, n: 0, ganadas: 0 });
    const h = porHeroe.get(clave); h.n++; if (p.gane) h.ganadas++;
  }
  const heroes = [...porHeroe.values()].filter((h) => h.n >= MINIMO_SEMANA_HEROE).map((h) => ({ ...h, saldo: 2 * h.ganadas - h.n }));
  salida.funcionan = heroes.filter((h) => h.saldo > 0).sort((a, b) => b.saldo - a.saldo || b.n - a.n).slice(0, HEROES_DE_LA_SEMANA).map(({ saldo, ...h }) => h);
  salida.cuestan = heroes.filter((h) => h.saldo < 0).sort((a, b) => a.saldo - b.saldo || b.n - a.n).slice(0, HEROES_DE_LA_SEMANA).map(({ saldo, ...h }) => h);

  const conUno = semana.filter((p) => !p.supuesto && nombreClave(p.recomendados?.[0]) && nombreClave(p.pick));
  if (conUno.length) {
    const si = conUno.filter((p) => nombreClave(p.recomendados[0]) === nombreClave(p.pick));
    const no = conUno.filter((p) => !si.includes(p));
    const wr = (l) => (l.length ? ganadasDe(l) / l.length : null);
    salida.numeroUno = { n: conUno.length, cogido: si.length, wrCogido: wr(si), wrOtro: wr(no) };
  }
  return salida;
}
