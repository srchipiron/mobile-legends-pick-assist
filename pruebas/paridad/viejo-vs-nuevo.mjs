#!/usr/bin/env node
/**
 * Paridad del motor entre dos árboles que DEBEN dar lo mismo (una reescritura).
 *
 * Carga el motor viejo de `PARIDAD_VIEJO` (un worktree del commit anterior a la
 * reescritura, con `node_modules` enlazado) y el nuevo de `src/motor`, con los
 * MISMOS datos (los del árbol viejo), genera drafts deterministas en las cinco
 * líneas y compara todo lo que consumen la app, la tablet y los scripts. Sale
 * con 1 y lista las diferencias si hay alguna.
 *
 *   git worktree add /tmp/viejo <commit> && ln -s "$PWD/node_modules" /tmp/viejo/node_modules
 *   PARIDAD_VIEJO=/tmp/viejo node pruebas/paridad/viejo-vs-nuevo.mjs 2000
 *
 * En 4.0.0 (contra 3.102.0, 0c6d784) se quitó A PROPÓSITO lo dormido: el término
 * `tu` (siempre 0) y `deLosTuyos` (siempre null). `normalizar` los borra de la
 * salida vieja; cualquier otra diferencia es un fallo.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(new URL('../..', import.meta.url).pathname);
const VIEJO = process.env.PARIDAD_VIEJO;
if (!VIEJO) { console.error('Falta PARIDAD_VIEJO=/ruta/al/arbol/viejo'); process.exit(2); }
const N = Number(process.argv[2] ?? 400);
const AHORA = Date.UTC(2026, 10, 14, 12);

const cargar = (raiz) => async (m) => import(pathToFileURL(resolve(raiz, 'src/motor', m)).href);
const MODULOS = ['draft.js', 'ranking.js', 'builds.js', 'alias.js', 'registro.js', 'habitos.js', 'analitica.js', 'comunidad.js',
  'comprobacion.js', 'perfil.js', 'maestria.js', 'diagnostico/index.js', 'catalogo.js', 'nombres.js'];
const motorDe = async (raiz) => Object.fromEntries(await Promise.all(MODULOS.map(async (m) => [m.replace(/\.js$/, ''), await cargar(raiz)(m)])));
const [V, Nu] = await Promise.all([motorDe(VIEJO), motorDe(RAIZ)]);

const leer = (r) => JSON.parse(readFileSync(resolve(VIEJO, r), 'utf8'));
const catalogo = leer('public/data/heroes.json');
const meta = leer('public/data/roam-meta.json');
const pro = leer('public/data/pro.json');

// ---- comparar ----
/** Lo quitado a propósito en 4.0: `terminos.tu` y `deLosTuyos`. */
function normalizar(x, clave = '') {
  if (Array.isArray(x)) return x.map((v) => normalizar(v));
  if (x instanceof Map) return normalizar(Object.fromEntries(x));
  if (x instanceof Set) return [...x].map((v) => normalizar(v));
  if (x && typeof x === 'object') {
    const salida = {};
    for (const k of Object.keys(x).sort()) {
      if (k === 'deLosTuyos') continue;
      if ((clave === 'terminos' || clave === 'puntos') && k === 'tu') continue;
      salida[k] = normalizar(x[k], k);
    }
    return salida;
  }
  if (typeof x === 'number' && Number.isNaN(x)) return 'NaN';
  if (x === undefined) return '__undefined';
  return x;
}
let diferencias = 0;
let comparaciones = 0;
const fallos = [];
const porQue = new Map();
/** Si los dos lanzan lo mismo la comparación no mide nada: se dice. */
const lanzanLosDos = new Map();
function comparar(id, que, fv, fn) {
  comparaciones += 1;
  let a; let b;
  try { a = JSON.stringify(normalizar(fv())); } catch (e) { a = `LANZA ${e.message}`; }
  try { b = JSON.stringify(normalizar(fn())); } catch (e) { b = `LANZA ${e.message}`; }
  if (a === b && a.startsWith('LANZA')) lanzanLosDos.set(que, a);
  if (a === b) return;
  diferencias += 1;
  porQue.set(que, (porQue.get(que) ?? 0) + 1);
  if (fallos.length < 30) {
    let i = 0; while (i < a.length && a[i] === b[i]) i += 1;
    fallos.push(`${id} · ${que}\n    viejo: …${a.slice(Math.max(0, i - 80), i + 160)}\n    nuevo: …${b.slice(Math.max(0, i - 80), i + 160)}`);
  }
}

// ---- datos ----
const dV = V.draft.prepararDatos({ catalogo, meta, rango: 'glory' });
const dN = Nu.draft.prepararDatos({ catalogo, meta, rango: 'glory' });
comparar('datos', 'prepararDatos (sin catálogo crudo)', () => ({ ...dV, catalogo: null, crudo: null }), () => ({ ...dN, catalogo: null, crudo: null }));
for (const r of ['mythic', 'legend', 'nadie', null]) {
  comparar(`datos ${r}`, 'prepararDatos de otro rango', () => V.draft.prepararDatos({ catalogo, meta, rango: r }).meta.fuerza,
    () => Nu.draft.prepararDatos({ catalogo, meta, rango: r }).meta.fuerza);
}
comparar('datos', 'sin meta', () => V.draft.prepararDatos({ catalogo, meta: null }).poolsPorLinea, () => Nu.draft.prepararDatos({ catalogo, meta: null }).poolsPorLinea);

// ---- drafts deterministas ----
function generador(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = generador(20261114);
const LINEAS = ['roam', 'jungle', 'mid', 'gold', 'exp'];
const nombres = dV.heroes.map((h) => h.name);
const elegir = (k, fuera) => {
  const libres = nombres.filter((n) => !fuera.has(n));
  const salida = [];
  while (salida.length < k && libres.length) salida.push(libres.splice(Math.floor(rnd() * libres.length), 1)[0]);
  salida.forEach((n) => fuera.add(n));
  return salida;
};
const azar = (lista) => lista[Math.floor(rnd() * lista.length)];

const partidas = [];
for (let i = 0; i < 260; i += 1) {
  const fuera = new Set();
  const pick = elegir(1, fuera)[0];
  partidas.push({
    t: AHORA - (260 - i) * 3600000 * 7 + Math.floor(rnd() * 3600000), pick, gane: rnd() < 0.53 ? true : (rnd() < 0.9 ? false : null),
    recomendados: elegir(3, new Set([pick])), rango: 'glory', estimacion: 0.4 + rnd() * 0.25, modelo: rnd() < 0.8 ? 5 : 4,
    ...(rnd() < 0.5 ? { origen: 'lector' } : {}), ...(rnd() < 0.1 ? { supuesto: true } : {}), ...(rnd() < 0.05 ? { previa: true } : {}),
    bans: elegir(Math.floor(rnd() * 10), fuera),
    draft: { linea: azar(LINEAS), enemigos: elegir(5, fuera), aliados: elegir(4, fuera), ...(rnd() < 0.3 ? { rival: null } : {}) },
    ...(rnd() < 0.6 ? { duracion: 8 + Math.round(rnd() * 200) / 10 } : {}),
    ...(rnd() < 0.3 ? { editada: AHORA - Math.floor(rnd() * 1e9) } : {}),
  });
}
const maestria = Object.fromEntries(elegir(25, new Set()).map((n) => [n, { games: 1 + Math.floor(rnd() * 400), winRate: 0.4 + rnd() * 0.25 }]));

for (let i = 0; i < N; i += 1) {
  const linea = LINEAS[i % 5];
  const fuera = new Set();
  const nE = Math.floor(rnd() * 6); const nA = Math.floor(rnd() * 5); const nB = Math.floor(rnd() * 11);
  const enemigos = elegir(nE, fuera); const aliados = elegir(nA, fuera); const baneos = elegir(nB, fuera);
  const pool = Nu.draft.poolDe(dN, linea).filter((h) => !fuera.has(h.name));
  const miPick = rnd() < 0.3 && pool.length ? azar(pool).name : null;
  const rivalMarcado = enemigos.length && rnd() < 0.2 ? azar(enemigos) : null;
  const draft = { linea, enemigos, aliados, baneos, miPick, rivalMarcado };
  const id = `#${i} ${linea} ${nE}v${nA} b${nB}`;
  const conSimulacion = i % 7 === 0;

  const rV = V.draft.recomendar(dV, { ...draft, conSimulacion });
  const rN = Nu.draft.recomendar(dN, { ...draft, conSimulacion });
  comparar(id, 'recomendar', () => rV, () => rN);
  const yo = rN.eleccion?.heroe?.name ?? azar(nombres);
  comparar(id, 'estimarCon', () => V.draft.estimarCon(dV, { yo, enemigos, aliados, baneos }), () => Nu.draft.estimarCon(dN, { yo, enemigos, aliados, baneos }));
  comparar(id, 'planear', () => V.draft.planear(dV, { yo, aliados, enemigos, linea, baneos, rivalMarcado }), () => Nu.draft.planear(dN, { yo, aliados, enemigos, linea, baneos, rivalMarcado }));
  for (const bando of ['enemigos', 'aliados']) {
    const equipo = bando === 'enemigos' ? enemigos : aliados;
    comparar(id, `probablesDelBando ${bando}`, () => V.draft.probablesDelBando(dV, { equipo, linea, bando }).map((h) => h.name),
      () => Nu.draft.probablesDelBando(dN, { equipo, linea, bando }).map((h) => h.name));
  }
  comparar(id, 'siguientesBaneos', () => V.draft.siguientesBaneos(dV, { baneos, enemigos, aliados, miPick, partidas }),
    () => Nu.draft.siguientesBaneos(dN, { baneos, enemigos, aliados, miPick, partidas }));
  comparar(id, 'crucesDelDraft', () => V.draft.crucesDelDraft(dV, { yo, enemigos, aliados }), () => Nu.draft.crucesDelDraft(dN, { yo, enemigos, aliados }));
  comparar(id, 'porQueDetras', () => rV.ranking.slice(1, 6).map((c) => V.ranking.porQueDetras(c, rV.ranking[0])),
    () => rN.ranking.slice(1, 6).map((c) => Nu.ranking.porQueDetras(c, rN.ranking[0])));
  if (i % 3 === 0) {
    comparar(id, 'fichaDeHeroe', () => V.draft.fichaDeHeroe(dV, yo, { ahora: AHORA }), () => Nu.draft.fichaDeHeroe(dN, yo, { ahora: AHORA }));
    comparar(id, 'tocadoPorElParche', () => V.draft.tocadoPorElParche(dV, yo, AHORA), () => Nu.draft.tocadoPorElParche(dN, yo, AHORA));
    comparar(id, 'winrateEnLinea', () => V.draft.winrateEnLinea(dV, yo, linea), () => Nu.draft.winrateEnLinea(dN, yo, linea));
  }
  const heroe = dN.porNombre.get(yo);
  const builds = Nu.builds.buildsDe(meta.builds, heroe, linea);
  comparar(id, 'buildsDe', () => V.builds.buildsDe(meta.builds, dV.porNombre.get(yo), linea), () => builds);
  const enemigosH = Nu.draft.resolverNombres(dN, enemigos);
  if (builds.length) {
    comparar(id, 'ajustesDeBuild', () => V.builds.ajustesDeBuild(builds[0], meta.equipment, V.draft.resolverNombres(dV, enemigos), linea, { builds: meta.builds }),
      () => Nu.builds.ajustesDeBuild(builds[0], meta.equipment, enemigosH, linea, { builds: meta.builds }));
    comparar(id, 'buildParaElDraft', () => V.builds.buildParaElDraft(builds, meta.equipment, V.draft.resolverNombres(dV, enemigos), linea, { builds: meta.builds }),
      () => Nu.builds.buildParaElDraft(builds, meta.equipment, enemigosH, linea, { builds: meta.builds }));
  }
  comparar(id, 'buildEnUnaLinea', () => V.builds.buildEnUnaLinea({ builds: meta.builds, equipment: meta.equipment, heroe: dV.porNombre.get(yo), linea, enemigos: V.draft.resolverNombres(dV, enemigos) }),
    () => Nu.builds.buildEnUnaLinea({ builds: meta.builds, equipment: meta.equipment, heroe, linea, enemigos: enemigosH }));
}

// ---- por línea ----
for (const linea of LINEAS) {
  comparar(linea, 'planDePicks', () => V.draft.planDePicks(dV, { linea }), () => Nu.draft.planDePicks(dN, { linea }));
  comparar(linea, 'movimientosDelMeta', () => V.draft.movimientosDelMeta(dV, { linea }), () => Nu.draft.movimientosDelMeta(dN, { linea }));
  comparar(linea, 'lineasEnemigasAbiertas', () => V.draft.lineasEnemigasAbiertas(dV, nombres.slice(0, 3)), () => Nu.draft.lineasEnemigasAbiertas(dN, nombres.slice(0, 3)));
}
comparar('meta', 'movimientosDelMeta sin línea', () => V.draft.movimientosDelMeta(dV, {}), () => Nu.draft.movimientosDelMeta(dN, {}));

// ---- revisión de partidas ----
for (const p of partidas.slice(0, 120)) comparar(`t${p.t}`, 'revisarPartida', () => V.draft.revisarPartida(dV, p), () => Nu.draft.revisarPartida(dN, p));
comparar('partidas', 'revisarDrafts', () => V.draft.revisarDrafts(dV, partidas), () => Nu.draft.revisarDrafts(dN, partidas));

// ---- buscador ----
for (const texto of ['', 'a', 'cic', 'Cíclope', 'lyla', 'xb', 'popol', 'chang', 'zzz', 'mos', 'yss']) {
  comparar(`«${texto}»`, 'filtrarPorNombre', () => V.alias.filtrarPorNombre(dV.heroes, texto).map((h) => h.name), () => Nu.alias.filtrarPorNombre(dN.heroes, texto).map((h) => h.name));
}

// ---- tus partidas ----
const opciones = { ahora: AHORA, hora: (t) => new Date(t).getUTCHours() };
comparar('partidas', 'tusNumeros', () => V.habitos.tusNumeros(partidas, opciones), () => Nu.habitos.tusNumeros(partidas, opciones));
comparar('partidas', 'tuSemana', () => V.habitos.tuSemana(partidas, { ahora: AHORA }), () => Nu.habitos.tuSemana(partidas, { ahora: AHORA }));
comparar('partidas', 'resumen', () => V.registro.resumen(partidas, maestria), () => Nu.registro.resumen(partidas, maestria));
comparar('partidas', 'calibracion', () => V.registro.calibracion(partidas), () => Nu.registro.calibracion(partidas));
comparar('partidas', 'aciertosDelLector', () => V.registro.aciertosDelLector(partidas), () => Nu.registro.aciertosDelLector(partidas));
comparar('partidas', 'medirFasesMias', () => V.registro.medirFasesMias(partidas), () => Nu.registro.medirFasesMias(partidas));
comparar('partidas', 'siguioConsejo', () => partidas.map(V.registro.siguioConsejo), () => partidas.map(Nu.registro.siguioConsejo));
comparar('partidas', 'evolucion', () => V.analitica.evolucion(partidas, { ahora: AHORA }), () => Nu.analitica.evolucion(partidas, { ahora: AHORA }));
for (const lado of ['aliados', 'enemigos']) comparar('partidas', `porCompaneros ${lado}`, () => V.analitica.porCompaneros(partidas, { lado }), () => Nu.analitica.porCompaneros(partidas, { lado }));
comparar('partidas', 'porLinea', () => V.analitica.porLinea(partidas), () => Nu.analitica.porLinea(partidas));
comparar('partidas', 'porDia', () => V.analitica.porDia(partidas, { dia: (t) => new Date(t).getUTCDay() }), () => Nu.analitica.porDia(partidas, { dia: (t) => new Date(t).getUTCDay() }));
comparar('partidas', 'conLaApp', () => V.analitica.conLaApp(partidas), () => Nu.analitica.conLaApp(partidas));
comparar('partidas', 'maestriaEfectiva', () => V.maestria.maestriaEfectiva(maestria, partidas), () => Nu.maestria.maestriaEfectiva(maestria, partidas));
comparar('partidas', 'maestriaDeSiempre', () => V.maestria.maestriaDeSiempre(maestria, partidas), () => Nu.maestria.maestriaDeSiempre(maestria, partidas));
comparar('partidas', 'winrateDeReferencia', () => V.maestria.winrateDeReferencia(maestria), () => Nu.maestria.winrateDeReferencia(maestria));
comparar('partidas', 'fecharMaestria', () => V.maestria.fecharMaestria(maestria, AHORA), () => Nu.maestria.fecharMaestria(maestria, AHORA));
const comprobadas = partidas.slice(0, 40).map((p, i) => ({ t: p.t, bien: i % 3 !== 0, que: i % 3 ? null : 'resultado', cuando: p.t + 1000 }));
comparar('partidas', 'paraComprobar', () => V.comprobacion.paraComprobar(partidas, comprobadas, { ahora: AHORA }), () => Nu.comprobacion.paraComprobar(partidas, comprobadas, { ahora: AHORA }));
comparar('partidas', 'precisionDeLaTablet', () => V.comprobacion.precisionDeLaTablet(comprobadas), () => Nu.comprobacion.precisionDeLaTablet(comprobadas));
comparar('partidas', 'sanearComprobadas', () => V.comprobacion.sanearComprobadas([...comprobadas, { t: 'x' }, comprobadas[0]]), () => Nu.comprobacion.sanearComprobadas([...comprobadas, { t: 'x' }, comprobadas[0]]));
const filas = partidas.map((p, i) => ({ jugador: `j${i % 7}`, ...p, referencia: { winRate: 0.45 + (i % 7) / 70, partidas: 100 } }));
comparar('comunidad', 'medirComunidad', () => V.comunidad.medirComunidad(filas, {}), () => Nu.comunidad.medirComunidad(filas, {}));
const perfil = { mastery: maestria, partidas, olvidadas: [partidas[3].t], rango: 'glory', linea: 'roam', idioma: 'es' };
comparar('perfil', 'recogerPerfil+sanear', () => V.perfil.sanear({ ...V.perfil.recogerPerfil(perfil), cuando: AHORA }), () => Nu.perfil.sanear({ ...Nu.perfil.recogerPerfil(perfil), cuando: AHORA }));
comparar('perfil', 'fundirPerfil', () => V.perfil.fundirPerfil(V.perfil.sanear(perfil), V.perfil.sanear({ ...perfil, partidas: partidas.slice(100), mastery: {} })),
  () => Nu.perfil.fundirPerfil(Nu.perfil.sanear(perfil), Nu.perfil.sanear({ ...perfil, partidas: partidas.slice(100), mastery: {} })));
{
  const codigo = await V.perfil.exportarPerfil({ ...V.perfil.recogerPerfil(perfil), cuando: AHORA });
  const [lV, lN] = await Promise.all([V.perfil.leerPerfil(codigo), Nu.perfil.leerPerfil(codigo)]);
  comparar('perfil', 'leerPerfil de un código viejo', () => lV, () => lN);
  const codigoN = await Nu.perfil.exportarPerfil({ ...Nu.perfil.recogerPerfil(perfil), cuando: AHORA });
  comparar('perfil', 'código de perfil (mismo texto)', () => codigo, () => codigoN);
}
let lista = [];
let listaN = [];
for (const p of partidas.slice(0, 60)) {
  const entrada = { pick: p.pick, gane: p.gane, recomendados: p.recomendados, rango: 'glory', estimacion: p.estimacion, modelo: 5, bans: p.bans, draft: p.draft };
  lista = V.registro.apuntar(lista, entrada); listaN = Nu.registro.apuntar(listaN, entrada);
}
comparar('registro', 'apuntar (sin el instante)', () => lista.map(({ t, ...r }) => r), () => listaN.map(({ t, ...r }) => r));

// ---- diagnóstico (sin la fecha) ----
const entorno = { almacen: true, version: '4.0.0', publicada: null, sinDatosPersonales: true };
// MOTOR, MAESTRÍA y MODELO cambian A PROPÓSITO en 4.0: miden por el camino de la app
// (`ordenar` de draft.js) y no hablan de una maestría que ya no puntúa.
const sinFecha = (t) => String(t).replace(/^.*\d{1,2}\/\d{1,2}\/\d{4}.*$/gm, '<fecha>').replace(/hace \d+(?:[.,]\d+)? ?[hd]\b/g, 'hace <edad>')
  .replace(/\n--- (MOTOR|MAESTRÍA|MODELO) ---[\s\S]*?(?=\n--- |\n=== |$)/g, '\n--- $1 --- <cambia en 4.0>');
for (const linea of LINEAS) {
  comparar(linea, 'diagnosticar (sin datos personales)', () => sinFecha(V['diagnostico/index'].diagnosticar({ datos: dV, linea, maestria: {}, partidas: [], entorno, historial: [], pro }).texto),
    () => sinFecha(Nu['diagnostico/index'].diagnosticar({ datos: dN, linea, maestria: {}, partidas: [], entorno, historial: [], pro }).texto));
}

console.log(`${comparaciones} comparaciones sobre ${N} drafts · ${diferencias} diferencias`);
if (lanzanLosDos.size) {
  console.log(`OJO, lanzan los dos (no se compara nada): ${[...lanzanLosDos].map(([q, e]) => `${q}: ${e}`).join(' | ')}`);
  process.exit(1);
}
if (diferencias) {
  console.log([...porQue].map(([q, n]) => `  ${q}: ${n}`).join('\n'));
  console.log(fallos.join('\n'));
  process.exit(1);
}
