#!/usr/bin/env node
/**
 * Paridad entre el motor de 2.0.2 y el de 3.0.
 *
 * Solo tiene sentido en la migración: carga el motor viejo desde un árbol de
 * trabajo de git (PARIDAD_VIEJO, o `git worktree add <dir> v2.0.2`) y el nuevo
 * desde `src/motor`, genera miles de drafts deterministas en las cinco líneas
 * y compara TODO lo que la app enseña: ranking entero, probabilidad, términos,
 * motivos, empate, rival de línea, simulación, composición, consejos,
 * análisis, baneos sugeridos, siguiente baneo y la estimación con un héroe
 * cualquiera. Cualquier diferencia se lista y el proceso sale con 1.
 *
 *   PARIDAD_VIEJO=/ruta/al/2.0.2 node pruebas/paridad/viejo-vs-nuevo.mjs [drafts]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(new URL('../..', import.meta.url).pathname);
const VIEJO = process.env.PARIDAD_VIEJO;
if (!VIEJO) { console.error('Falta PARIDAD_VIEJO=/ruta/al/arbol/2.0.2'); process.exit(2); }
const N = Number(process.argv[2] ?? 400);

const v = async (m) => import(pathToFileURL(resolve(VIEJO, 'src/engine', m)).href);
const n = async (m) => import(pathToFileURL(resolve(RAIZ, 'src/motor', m)).href);

const [vScore, vRanking, vRival, vRobustez, vEstimacion, vComposicion, vEquipo, vAnalisis, vBaneos, vRegistro] = await Promise.all(
  ['score.js', 'ranking.js', 'rival-de-linea.js', 'robustez.js', 'estimacion.js', 'composicion.js', 'equipo.js', 'analisis.js', 'baneos.js', 'registro.js'].map(v));
const [nDraft, nNombres, nMaestria] = await Promise.all(['draft.js', 'nombres.js', 'maestria.js'].map(n));

const catalogo = JSON.parse(readFileSync(resolve(RAIZ, 'public/data/heroes.json'), 'utf8'));
const meta = JSON.parse(readFileSync(resolve(RAIZ, 'public/data/roam-meta.json'), 'utf8'));

// ---- viejo, montado como lo montaba App.jsx 2.0.2 ----
const allHeroes = vScore.mergeCatalog(catalogo.heroes, meta.heroes);
const lineasV = vRival.indiceDeLineas(meta.heroes);
const frecuenciasV = vRival.frecuenciaDeRoles(meta.heroes ?? []);
const rango = meta.rank ?? 'glory';
const metaCtx = {
  stats: vScore.indexByName(meta.statsByRank?.[rango] ?? meta.stats),
  counters: vScore.indexByName(meta.counters, 2),
  synergies: vScore.indexByName(meta.synergies, 2),
  patchAvgWinRate: meta.avgByRank?.[rango] ?? meta.patchAvgWinRate ?? 0.5,
};
const poolsV = Object.fromEntries(vScore.LINEAS.map((l) => [l, vScore.poolDeLinea(allHeroes, lineasV, l)]));
const abiertasV = (enemies) => {
  if (!enemies.length || enemies.length >= 5) return [];
  const ocupadas = new Set(vRival.lineasOcupadas(enemies, lineasV, frecuenciasV));
  return vScore.LINEAS.filter((l) => !ocupadas.has(l));
};

// ---- nuevo ----
const datos = nDraft.prepararDatos({ catalogo, meta, rango });

// ---- drafts deterministas ----
function generador(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = generador(20260914);
const elegir = (lista, k, fuera) => {
  const libres = lista.filter((h) => !fuera.has(h.name));
  const salida = [];
  while (salida.length < k && libres.length) {
    const i = Math.floor(rnd() * libres.length);
    salida.push(libres.splice(i, 1)[0]);
  }
  return salida;
};
const porNombreN = datos.porNombre;

let diferencias = 0;
const fallos = [];
const reportar = (draftId, que, viejo, nuevo) => {
  diferencias += 1;
  if (fallos.length < 40) fallos.push(`${draftId} · ${que}\n    viejo: ${JSON.stringify(viejo)}\n    nuevo: ${JSON.stringify(nuevo)}`);
};
const casi = (a, b, tol = 1e-9) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);
const motivoV = (m) => ({ clave: m.clave, params: m.params ?? null, bueno: m.good, peso: m.w != null ? Number(m.w.toFixed(9)) : null });
const motivoN = (m) => ({ clave: m.clave, params: m.params ?? null, bueno: m.bueno, peso: m.peso != null ? Number(m.peso.toFixed(9)) : null });
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const linea = vScore.LINEAS[i % 5];
  const nE = Math.floor(rnd() * 6);
  const nA = Math.floor(rnd() * 5);
  const nB = Math.floor(rnd() * 11);
  const fuera = new Set();
  const bans = elegir(allHeroes, nB, fuera); bans.forEach((h) => fuera.add(h.name));
  const enemies = elegir(allHeroes, nE, fuera); enemies.forEach((h) => fuera.add(h.name));
  const allies = elegir(allHeroes.filter((h) => !poolsV[linea].includes(h) || rnd() < 0.3), nA, fuera); allies.forEach((h) => fuera.add(h.name));
  // Maestría: un puñado de héroes con partidas, a veces ninguna.
  const maestria = {};
  if (rnd() < 0.7) {
    for (const h of elegir(allHeroes, 1 + Math.floor(rnd() * 8), new Set())) {
      maestria[nNombres.nombreClave(h.name)] = { games: 1 + Math.floor(rnd() * 400), winRate: 0.35 + rnd() * 0.3 };
    }
  }
  const partidas = rnd() < 0.5 ? Array.from({ length: Math.floor(rnd() * 30) }, (_, k) => ({
    t: 1000 + k, pick: allHeroes[Math.floor(rnd() * allHeroes.length)].name, gane: rnd() < 0.5,
    bans: elegir(allHeroes, Math.floor(rnd() * 10), new Set()).map((h) => h.name),
  })) : [];
  const marcado = enemies.length && rnd() < 0.3 ? enemies[Math.floor(rnd() * enemies.length)].name : null;
  const id = `#${i} ${linea} E${nE} A${nA} B${nB}`;

  const aN = (hs) => hs.map((h) => porNombreN.get(h.name));
  const eV = enemies; const alV = allies; const bV = bans;
  const eN = aN(enemies); const alN = aN(allies); const bN = aN(bans);
  const maestriaV = vRegistro.maestriaEfectiva(maestria, partidas);
  const maestriaN = nMaestria.maestriaEfectiva(maestria, partidas);
  if (!igual(maestriaV, maestriaN)) reportar(id, 'maestriaEfectiva', maestriaV, maestriaN);

  // ranking
  const lineasAbiertas = abiertasV(eV);
  const taken = new Set([...eV, ...alV, ...bV].map((h) => h.name));
  const rankedV = vRanking.rankRoamers(poolsV[linea], {
    enemies: eV, allies: alV, bans: bV, mastery: maestriaV, meta: metaCtx, lineas: lineasV, lineasAbiertas, poolsPorLinea: poolsV,
    candidatos: allHeroes.filter((h) => !taken.has(h.name)),
  });
  const rec = nDraft.recomendar(datos, { linea, enemigos: eN, aliados: alN, baneos: bN, maestria: maestriaN, rivalMarcado: marcado });
  const rankedN = rec.ranking;
  if (!igual(rec.lineasAbiertas, lineasAbiertas)) reportar(id, 'lineasAbiertas', lineasAbiertas, rec.lineasAbiertas);
  if (rankedV.length !== rankedN.length) reportar(id, 'tamaño del ranking', rankedV.length, rankedN.length);
  const orden = (r) => r.map((c) => (c.hero ?? c.heroe).name);
  if (!igual(orden(rankedV), orden(rankedN))) reportar(id, 'orden del ranking', orden(rankedV), orden(rankedN));
  for (let k = 0; k < Math.min(rankedV.length, rankedN.length); k++) {
    const a = rankedV[k]; const b = rankedN[k];
    if (!casi(a.p, b.p)) reportar(id, `p de ${a.hero.name}`, a.p, b.p);
    if (!casi(a.logOdds, b.logOdds)) reportar(id, `logOdds de ${a.hero.name}`, a.logOdds, b.logOdds);
    for (const t of ['heroes', 'cruces', 'parejas', 'tu', 'porVer']) if (!casi(a.terminos[t], b.terminos[t])) reportar(id, `término ${t} de ${a.hero.name}`, a.terminos, b.terminos);
    if (!igual(a.puntos, b.puntos)) reportar(id, `puntos de ${a.hero.name}`, a.puntos, b.puntos);
    if (a.dato !== b.dato) reportar(id, `dato de ${a.hero.name}`, a.dato, b.dato);
    if (!casi(a.riesgo, b.riesgo)) reportar(id, `riesgo de ${a.hero.name}`, a.riesgo, b.riesgo);
    if (!igual(a.reasons.map(motivoV), b.motivos.map(motivoN))) reportar(id, `motivos de ${a.hero.name}`, a.reasons, b.motivos);
  }

  // empate
  const empV = vRanking.empatados(rankedV).map((c) => c.hero.name);
  if (!igual(empV, rec.empate.map((c) => c.heroe.name))) reportar(id, 'empate', empV, rec.empate.map((c) => c.heroe.name));

  // rival de línea
  const rivalV = marcado ?? vRival.detectarRivalDeLinea(eV, lineasV, linea, frecuenciasV);
  if (rivalV !== rec.rival.nombre) reportar(id, 'rival', rivalV, rec.rival);

  // simulación
  const robV = (eV.length && eV.length < 5 && poolsV[linea].length)
    ? vRobustez.simularFinales({ pool: poolsV[linea], enemies: eV, allies: alV, lineasAbiertas, poolsPorLinea: poolsV, ctx: { meta: metaCtx, mastery: maestriaV, bans: bV, lineas: lineasV }, linea })
    : null;
  if (!igual(robV, rec.robustez)) reportar(id, 'robustez', robV, rec.robustez);

  // composición
  const compV = (alV.length || eV.length) && rankedV[0] ? vComposicion.analizarComposicion({ allies: alV, yo: rankedV[0].hero, enemies: eV }) : null;
  const sinHeroes = (c) => c && JSON.parse(JSON.stringify(c));
  if (!igual(sinHeroes(compV), sinHeroes(rec.composicion))) reportar(id, 'composicion', compV, rec.composicion);

  // consejos a los compañeros
  const consV = rankedV[0] && eV.length
    ? vEquipo.aconsejarEquipo({ allHeroes, lineas: lineasV, frecuencias: frecuenciasV, miLinea: linea, yo: rankedV[0].hero, enemies: eV, allies: alV, bans: bV, meta: metaCtx, lineasAbiertas, poolsPorLinea: poolsV })
    : [];
  const consejo = (c, campo) => c.map((x) => ({ linea: x.linea, rival: x.rival, s: x.sugerencias.map((s) => [s[campo].name, Number(s.p.toFixed(9)), s.puntos, (s.motivos ?? s.reasons).map((m) => m.clave)]) }));
  if (!igual(consejo(consV, 'hero'), consejo(rec.consejos, 'heroe'))) reportar(id, 'consejos', consejo(consV, 'hero'), consejo(rec.consejos, 'heroe'));

  // análisis
  const anV = vAnalisis.analizarDraft({ ranked: rankedV, enemies: eV, allies: alV, meta: metaCtx, rivalLinea: rivalV, linea, empate: vRanking.empatados(rankedV), robustez: robV, composicion: compV });
  if (!igual(anV, rec.analisis)) reportar(id, 'analisis', anV, rec.analisis);

  // baneos sugeridos
  const banV = vRanking.suggestBans(allHeroes, { allies: alV, enemies: eV, bans: bV, meta: metaCtx });
  const ban = (lista, campo, mot) => lista.map((b) => [b[campo].name, Number((b.valor ?? b.score).toFixed(12)), b.puntos, Number(b.disponible.toFixed(12)), b[mot].map(mot === 'reasons' ? motivoV : motivoN)]);
  if (!igual(ban(banV, 'hero', 'reasons'), ban(rec.baneosSugeridos, 'heroe', 'motivos'))) reportar(id, 'baneos sugeridos', ban(banV, 'hero', 'reasons'), ban(rec.baneosSugeridos, 'heroe', 'motivos'));

  // siguiente baneo probable
  const histV = vBaneos.coocurrenciaDeBaneos(partidas);
  const proxV = vBaneos.proximosBaneos(allHeroes, { bans: bV, enemies: eV, allies: alV, meta: metaCtx, historial: histV, n: 10 });
  const proxN = nDraft.siguientesBaneos(datos, { baneos: bN, enemigos: eN, aliados: alN, partidas, n: 10 });
  const prox = (lista, campo) => lista.map((x) => [x[campo].name, x.banRate, Number(x.factor.toFixed(12))]);
  if (!igual(prox(proxV, 'hero'), prox(proxN, 'heroe'))) reportar(id, 'siguiente baneo', prox(proxV, 'hero'), prox(proxN, 'heroe'));

  // estimación con un héroe cualquiera del pool (aunque esté cogido)
  const yo = poolsV[linea][Math.floor(rnd() * poolsV[linea].length)];
  const estV = vEstimacion.estimarVictoria({ allies: alV, yo, enemies: eV, meta: metaCtx, mastery: maestriaV, lineas: lineasV, lineasAbiertas, poolsPorLinea: poolsV, bans: bV });
  const estN = nDraft.estimarCon(datos, { yo: porNombreN.get(yo.name), enemigos: eN, aliados: alN, baneos: bN, maestria: maestriaN });
  if (!casi(estV.p, estN.p) || !igual(estV.puntos, estN.puntos) || estV.vistos !== estN.vistos) reportar(id, `estimación con ${yo.name}`, { p: estV.p, puntos: estV.puntos, vistos: estV.vistos }, { p: estN.p, puntos: estN.puntos, vistos: estN.vistos });
}

console.log(`${N} drafts en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${diferencias} diferencias`);
for (const f of fallos) console.log(f);
if (fallos.length < diferencias) console.log(`... y ${diferencias - fallos.length} más`);
process.exit(diferencias ? 1 : 0);
