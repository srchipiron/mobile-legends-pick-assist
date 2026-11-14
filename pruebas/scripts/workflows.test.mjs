/**
 * Los workflows y lo que publican, leídos POR FORMA y, donde se puede,
 * EJECUTADOS: la ingesta siempre a un temporal y con el comparador como
 * MANDATO, las puertas del despliegue con datos fabricados, el bucle de push
 * con un `git` de mentira que lo rechaza, pipefail en toda tubería, topes de
 * tiempo, permisos, concurrencia en los jobs y acciones fijadas por SHA.
 * Buscar cadenas sueltas no vale: `echo "…comparar-ingesta…"` y `h > 7200`
 * pasaban las guardas por texto.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { after } from 'node:test';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, ok, eq, RAIZ, leerTexto, leerJson } from '../ayuda.mjs';
import { ACCIONES_LOCALES, WORKFLOWS, ejecuta, leerAccion, leerWorkflow, mandatos } from '../fixtures/yaml-workflows.mjs';
import { medir, FIJAS } from '../../scripts/comparar-ingesta.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'workflows-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const corre = (script, args, opts = {}) => spawnSync(process.execPath, [resolve(RAIZ, script), ...args], { encoding: 'utf8', cwd: RAIZ, ...opts });
const todos = WORKFLOWS.map(leerWorkflow);
const wf = (f) => todos.find((w) => w.fichero === f);
const deploy = wf('deploy.yml');
const LOS_TRES = ['deploy.yml', 'update-data.yml', 'mantenimiento.yml'];
const INGESTA = /^node scripts\/ingest\.mjs\b/;
const SUBIR = /^bash scripts\/bots\/subir\.sh\b/;
/** ¿El paso hace push? Directo o con el bucle de scripts/bots/subir.sh. */
const empuja = (p) => mandatos(p.run).some((c) => /^git push\b/.test(c) || SUBIR.test(c));
/** ¿El paso instala? `npm ci` directo o la acción local `instalar`. */
const instala = (p) => mandatos(p.run).some((c) => /^npm ci\b/.test(c)) || p.uses === './.github/actions/instalar';

/** Un `roam-meta.json` de mentira con la edad que se le pida. */
function datosDe({ horas = 1, cruces = 1200, heroCount = 133 } = {}) {
  const filas = {};
  const n = Math.ceil(Math.sqrt(cruces)) + 1;
  let puestos = 0;
  for (let i = 0; i < n && puestos < cruces; i++) {
    filas[`H${i}`] = {};
    for (let j = 0; j < n && puestos < cruces; j++) { if (i === j) continue; filas[`H${i}`][`H${j}`] = 0.5; puestos++; }
  }
  return { generatedAt: new Date(Date.now() - horas * 3.6e6).toISOString(), heroCount, counters: filas };
}

/** Ejecuta el `run` de un paso en un directorio de mentira, como haría el runner (sin las expresiones `${{ }}`). */
function ejecutarPaso(run, { cwd, env = {}, path = [] } = {}) {
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', run.replace(/\$\{\{[^}]*\}\}/g, '')], {
    cwd, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, ...env, PATH: [...path, process.env.PATH].join(':') },
  });
}

/** Un `git` de mentira que rechaza todo push (y lo apunta en $GITLOG) y un `sleep` que no espera. */
function gitQueRechaza(dir) {
  const bin = join(dir, 'bin'); mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'git'), '#!/bin/sh\ncase "$1" in\n  push) echo "$*" >> "$GITLOG"; exit 1 ;;\n  diff) case "$*" in *--staged*) exit 0 ;; *) exit 1 ;; esac ;;\n  *) exit 0 ;;\nesac\n', { mode: 0o755 });
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return bin;
}

test('la ingesta escribe a un temporal y pasa por el comparador en los tres workflows que la ejecutan, y en ninguno más', () => {
  for (const f of LOS_TRES) {
    const w = wf(f);
    const ingesta = w.pasos.flatMap((p) => mandatos(p.run).filter((c) => INGESTA.test(c)));
    ok(ingesta.length > 0, `${f}: ya no ejecuta la ingesta`);
    for (const c of ingesta) ok(/\s--out\s+\S/.test(c), `${f}: la ingesta escribe directa sobre los datos buenos`);
    ok(w.pasos.some((p) => ejecuta(p.run, /^node scripts\/comparar-ingesta\.mjs \/tmp\/nueva\.json public\/data\/roam-meta\.json\b/)), `${f}: no compara la corrida con public/data/roam-meta.json`);
    // Fallar lo cubre continue-on-error o el comparador; colgarse, el tope (~570 peticiones con 15 s: 140 min a medias).
    const paso = w.pasos.find((p) => ejecuta(p.run, INGESTA));
    const t = Number(paso['timeout-minutes']);
    ok(t >= 15 && t <= 40, `${f}: la ingesta con un tope de ${paso['timeout-minutes']} min (lo normal son 9-10)`);
  }
  // Un workflow nuevo que llame a la ingesta entra en la lista o no está protegido.
  for (const w of todos) {
    if (!LOS_TRES.includes(w.fichero)) ok(!w.pasos.some((p) => ejecuta(p.run, INGESTA)), `${w.fichero} ejecuta la ingesta y no está en la lista protegida`);
  }
});

test('el despliegue: frescura de 24 h por debajo del rancio, aviso a las 72 h, para sin estadísticas o sin matriz, y distingue omitida de fallida', () => {
  const puerta = deploy.pasos.filter((p) => /roam-meta\.json/.test(p.run ?? '') && /process\.exit\(1\)/.test(p.run ?? ''));
  eq(puerta.length, 1, 'deploy.yml ya no comprueba si los datos valen para publicar');
  const caja = join(tmp, 'deploy'); mkdirSync(join(caja, 'public/data'), { recursive: true });
  const conDatos = (d) => writeFileSync(join(caja, 'public/data/roam-meta.json'), JSON.stringify(d));
  const paso = (d) => { conDatos(d); return ejecutarPaso(puerta[0].run, { cwd: caja }); };
  const reciente = paso(datosDe({ horas: 1 }));
  ok(reciente.status === 0 && !/::warning::/.test(reciente.stdout), 'no publica, o avisa, con datos recién descargados');
  const viejos = paso(datosDe({ horas: 73 }));
  ok(viejos.status === 0 && /::warning::.*72 horas/.test(viejos.stdout), `con más de tres días no publica, o no avisa: ${viejos.stdout}`);
  ok(paso(datosDe({ cruces: 0 })).status !== 0, 'publica sin matriz de counters');
  ok(paso(datosDe({ heroCount: 0 })).status !== 0, 'publica sin estadísticas');

  const pasoIngesta = deploy.pasos.find((p) => ejecuta(p.run, INGESTA));
  const condicion = (pasoIngesta.if ?? '').match(/steps\.([\w-]+)\.outputs\.(\w+)\s*!=\s*'true'/);
  ok(condicion, 'deploy.yml descarga datos en cada push aunque el repositorio los tenga recientes');
  const frescura = deploy.pasos.find((p) => p.id === condicion[1]);
  ok(frescura, `deploy.yml mira steps.${condicion[1]} y ese paso no existe`);
  const salida = join(caja, 'salida.txt');
  const fresca = (horas) => {
    conDatos(datosDe({ horas }));
    writeFileSync(salida, '');
    const r = ejecutarPaso(frescura.run, { cwd: caja, env: { GITHUB_OUTPUT: salida } });
    eq(r.status, 0, `el paso de frescura falla: ${r.stderr}`);
    const m = readFileSync(salida, 'utf8').match(new RegExp(`${condicion[2]}=(\\w+)`));
    ok(m, `el paso de frescura no escribe ${condicion[2]}`);
    return m[1] === 'true';
  };
  ok(fresca(1) && !fresca(73), 'la frescura no separa una hora de tres días');
  for (const horas of [1, 12, 23, 25, 47, 71, 73]) if (fresca(horas)) eq(paso(datosDe({ horas })).status, 0, `con ${horas} h no descarga y luego no publica`);
  const elegir = deploy.pasos.find((p) => ejecuta(p.run, /^node scripts\/comparar-ingesta\.mjs\b/));
  ok(mandatos(elegir.run).some((c) => /outcome[^\n]*=\s*"?skipped/.test(c)), 'el paso de elegir datos no distingue «ingesta omitida» de «fallida»');
  ok(deploy.jobs.some((j) => /workflow_run\.conclusion == 'success'/.test(j.claves.if ?? '')), 'despliega también cuando el bot descartó su corrida');
  ok(deploy.pasos.some((p) => mandatos(p.run).includes('npm test')), 'deploy.yml no ejecuta npm test');
});

test('sin datos nuevos, el despliegue publica los que ya sirve Pages si son más nuevos y el comparador los acepta', () => {
  const paso = deploy.pasos.find((p) => /comparar-ingesta\.mjs \/tmp\/nueva\.json/.test(p.run ?? ''));
  ok(paso, 'deploy.yml ya no tiene el paso que elige con qué datos se publica');
  const caja = join(tmp, 'publicados'); mkdirSync(join(caja, 'public/data'), { recursive: true });
  // Copias, no enlaces: por un enlace el comparador no se ve como programa principal y sale con 0.
  for (const d of ['scripts', 'src']) cpSync(join(RAIZ, d), join(caja, d), { recursive: true });
  const bin = join(caja, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), '#!/bin/bash\necho "$@" >> "$CURL_LOG"\n[ -n "$PUBLICADA" ] || exit 22\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && cp "$PUBLICADA" "$2"; shift; done\n');
  chmodSync(join(bin, 'curl'), 0o755);
  const curlLog = join(caja, 'curl.log');
  const real = leerJson('public/data/roam-meta.json');
  const conFecha = (horas) => ({ ...real, generatedAt: new Date(Date.parse(real.generatedAt) + horas * 3.6e6).toISOString() });
  const publicar = (repo, publicada) => {
    writeFileSync(join(caja, 'public/data/roam-meta.json'), JSON.stringify(repo));
    const fichero = join(caja, 'publicada.json');
    if (publicada) writeFileSync(fichero, JSON.stringify(publicada));
    const r = ejecutarPaso(paso.run, { cwd: caja, env: { PUBLICADA: publicada ? fichero : '', CURL_LOG: curlLog }, path: [bin] });
    eq(r.status, 0, `el paso falla: ${r.stderr}`);
    return leerJson(join(caja, 'public/data/roam-meta.json')).generatedAt;
  };
  eq(publicar(real, conFecha(10)), conFecha(10).generatedAt, 'con datos publicados más nuevos se vuelve a los del repositorio');
  const pedida = readFileSync(curlLog, 'utf8').split(/\s+/).find((x) => /^https:/.test(x)) ?? '';
  ok(/\.github\.io\/[^ ]*\/data\/roam-meta\.json$/.test(pedida), `no se piden los datos que sirve Pages: ${pedida}`);
  eq(publicar(real, conFecha(-10)), real.generatedAt, 'se publican datos más VIEJOS que los del repositorio');
  eq(publicar(real, null), real.generatedAt, 'sin poder leer lo publicado no se queda con los del repositorio');
  const peores = { ...conFecha(10), counters: Object.fromEntries(Object.entries(real.counters).slice(0, 60)) };
  eq(publicar(real, peores), real.generatedAt, 'se publican datos que el comparador rechaza');
});

test('los bots que commitean suben con el bucle de rebase+push, que reintenta tres veces y acaba en ROJO', () => {
  const orden = mandatos(leerTexto('scripts/bots/subir.sh'));
  const rebase = orden.findIndex((c) => /^git pull --rebase\b/.test(c));
  const push = orden.findIndex((c) => /^git push\b/.test(c));
  ok(rebase >= 0 && rebase < push, 'subir.sh hace git push sin git pull --rebase antes');
  for (const f of ['update-data.yml', 'pro.yml', 'vigilancia.yml']) {
    const paso = wf(f).pasos.find(empuja);
    ok(paso && ejecuta(paso.run, SUBIR), `${f}: ya no sube con scripts/bots/subir.sh`);
  }
  // Se EJECUTA con un git que rechaza el push: el último mandato de un bucle verde era `sleep`.
  const caja = join(tmp, 'subir'); mkdirSync(caja, { recursive: true });
  const bin = gitQueRechaza(caja);
  for (const args of [[], ['origin', 'HEAD:main']]) {
    const registro = join(caja, `git-${args.length}.log`); writeFileSync(registro, '');
    const r = spawnSync('bash', [resolve(RAIZ, 'scripts/bots/subir.sh'), ...args], { cwd: caja, encoding: 'utf8', env: { ...process.env, GITLOG: registro, PATH: `${bin}:${process.env.PATH}` } });
    ok(r.status !== 0, 'el bucle de push acaba en verde aunque fallen los tres intentos');
    const pushes = readFileSync(registro, 'utf8').split('\n').filter(Boolean);
    eq(pushes.length, 3, 'el push no se reintenta tres veces');
    ok(pushes.every((l) => l === ['push', ...args].join(' ')), `los argumentos no llegan a git push: ${pushes[0]}`);
    ok(/::error::/.test(r.stdout + r.stderr), 'los tres intentos fallidos no dejan ni un aviso');
  }
  // Y el paso de cada bot, entero, sale en rojo con ese git.
  for (const f of ['update-data.yml', 'pro.yml', 'vigilancia.yml']) {
    const sitio = join(caja, f); mkdirSync(join(sitio, 'historial'), { recursive: true });
    cpSync(join(RAIZ, 'scripts/bots'), join(sitio, 'scripts/bots'), { recursive: true });
    writeFileSync(join(sitio, 'historial/salud.jsonl'), '{"cruces":17556}\n');
    const registro = join(sitio, 'git.log'); writeFileSync(registro, '');
    const r = ejecutarPaso(wf(f).pasos.find(empuja).run, { cwd: sitio, env: { GITLOG: registro }, path: [bin] });
    ok(r.status !== 0 && readFileSync(registro, 'utf8').split('\n').filter(Boolean).length === 3, `${f}: el paso de subir no sale en rojo tras tres intentos`);
  }
});

test('toda tubería lleva pipefail, la vigilancia mira lo publicado también con las pruebas en rojo y un push perdido no pasa en silencio', () => {
  const conTuberia = (run) => run.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).some((l) => /(^|[^|])\|([^|]|$)/.test(l));
  const conPasos = [...todos.map((w) => ({ donde: w.fichero, pasos: w.pasos })), ...ACCIONES_LOCALES.map((a) => ({ donde: `acción ${a}`, pasos: leerAccion(a).pasos }))];
  let vistas = 0;
  for (const { donde, pasos } of conPasos) {
    for (const p of pasos) {
      if (!p.run || !conTuberia(p.run)) continue;
      vistas++;
      eq(p.shell, 'bash', `${donde}: el paso «${p.name ?? p._linea}» usa una tubería sin shell: bash (saldría con el código del último mandato)`);
    }
  }
  ok(vistas >= 4, `solo ${vistas} pasos con tubería: la lectura se ha quedado corta`);
  const vig = wf('vigilancia.yml');
  ok(vig.pasos.some((p) => ejecuta(p.run, /^npm test\b/) && ejecuta(p.run, /^tee \/tmp\/pruebas\.txt$/)), 'vigilancia.yml ya no guarda la salida de npm test');
  const diag = vig.pasos.find((p) => ejecuta(p.run, /^node scripts\/diagnostico\.mjs\b/));
  ok(diag && /!\s*cancelled\(\)|always\(\)/.test(diag.if ?? ''), 'el diagnóstico de lo publicado se salta con las pruebas en rojo (sin fila en el historial)');
  for (const id of ['rancios', 'caras']) {
    const p = vig.pasos.find((x) => x.id === id);
    ok(p && /!\s*cancelled\(\)/.test(p.if ?? '') && ejecuta(p.run, new RegExp(`^tee /tmp/${id}\\.txt$`)), `vigilancia.yml: el paso ${id} no corre siempre o no deja su salida para la incidencia`);
  }
  // Un paso que sube con continue-on-error lo mira alguien después (failure() no se entera).
  for (const w of todos) {
    w.pasos.forEach((p, i) => {
      if (String(p['continue-on-error']) !== 'true' || !empuja(p)) return;
      ok(p.id, `${w.fichero}: «${p.name}» sube con continue-on-error y sin id`);
      const mira = new RegExp(`steps\\.${p.id}\\.outcome\\s*==\\s*'failure'`);
      ok(w.pasos.slice(i + 1).some((q) => mira.test(q.if ?? '')), `${w.fichero}: si falla el push de «${p.name}» no se entera nadie`);
    });
  }
  const regenerar = wf('mantenimiento.yml').pasos.find((p) => ejecuta(p.run, /^node scripts\/derivar-tags\.mjs\b/));
  ok(regenerar && /^\d+$/.test(regenerar['timeout-minutes'] ?? ''), 'mantenimiento.yml: regenerar tablas llama a la API sin tope');
  ok(ejecuta(regenerar.run, /^node scripts\/bots\/sustituir-tablas\.mjs \/tmp\/tablas\.txt src\/motor\/reglas\.js$/), 'mantenimiento.yml ya no sustituye las tablas con su script');
  for (const w of todos) {
    ok(w.jobs.length, `${w.fichero}: no encuentro ningún job`);
    for (const j of w.jobs) ok(/^\d+$/.test(j.claves['timeout-minutes'] ?? ''), `${w.fichero}: el job ${j.nombre} sin timeout-minutes (seis horas de runner)`);
  }
});

test('«las pruebas» son una definición (package.json) y node_modules va en caché por lockfile y versión de node', () => {
  const pkg = leerJson('package.json');
  const expandir = (guion, visto = new Set()) => guion.split(/&&|\|\||;/).map((c) => c.trim()).flatMap((c) => {
    const m = c.match(/^npm run (\S+)/);
    if (!m || visto.has(m[1])) return [c];
    visto.add(m[1]);
    return expandir(pkg.scripts?.[m[1]] ?? '', visto);
  });
  const deNpmTest = expandir(pkg.scripts?.test ?? '');
  for (const script of ['scripts/comprobar/css.mjs', 'scripts/comprobar/version.mjs']) ok(deNpmTest.some((c) => c.includes(script)), `npm test ya no ejecuta ${script}`);
  ok(deNpmTest.some((c) => /^node --test\b/.test(c) && c.includes('pruebas/')), 'npm test ya no corre las pruebas con node --test');
  ok(deNpmTest.some((c) => /^eslint\b/.test(c)), 'npm test ya no pasa el lint');

  // La caché: en la acción local o en el workflow que instala a mano (npm ci BORRA node_modules).
  const comprobarCache = (donde, pasos) => {
    const cache = pasos.find((p) => /^actions\/cache@/.test(p.uses ?? '') && p['with.path'] === 'node_modules');
    ok(cache, `${donde}: instala sin caché de node_modules`);
    if (!cache) return;
    ok(/hashFiles\('package-lock\.json'\)/.test(cache['with.key'] ?? ''), `${donde}: la clave de la caché no depende del lockfile`);
    const nodo = pasos.map((p) => p['with.node-version']).find(Boolean)?.replace(/'/g, '');
    ok(nodo && (cache['with.key'] ?? '').includes(`node${nodo}`), `${donde}: la clave de la caché no lleva la versión de node (${nodo})`);
    const ci = pasos.find((p) => mandatos(p.run).some((c) => /^npm ci\b/.test(c)));
    ok(ci && (ci.if ?? '').includes(`steps.${cache.id}.outputs.cache-hit != 'true'`), `${donde}: npm ci corre aunque la caché haya traído node_modules`);
  };
  ok(ACCIONES_LOCALES.includes('instalar'), 'falta la acción local instalar');
  comprobarCache('acción instalar', leerAccion('instalar').pasos);
  const instalan = todos.filter((w) => w.pasos.some(instala));
  ok(instalan.length >= 6, `solo ${instalan.length} workflows instalan: la lista se ha quedado corta`);
  for (const w of instalan) if (w.pasos.some((p) => mandatos(p.run).some((c) => /^npm ci\b/.test(c)))) comprobarCache(w.fichero, w.pasos);
  // Una acción local exige el repositorio: va después del checkout.
  for (const w of todos) {
    for (const j of w.jobs) {
      const i = j.pasos.findIndex((p) => /^\.\//.test(p.uses ?? ''));
      if (i >= 0) ok(j.pasos.slice(0, i).some((p) => /^actions\/checkout@/.test(p.uses ?? '')), `${w.fichero}: usa una acción local antes del checkout`);
    }
  }
  const m = medir({ rank: 'glory', stats: { A: {} }, statsByRank: { epic: { A: {} } } });
  ok(m.rangoPedido === 0 && medir({ rank: 'glory', stats: {}, statsByRank: { epic: {}, glory: {} } }).rangos === 2, 'el comparador no cuenta rangos (con el pedido caído se colaba otro bajo su etiqueta)');
});

test('cada workflow declara sus permisos, los que suben no se solapan y el despliegue escucha a los bots que cambian lo servido', () => {
  const nombreDe = (texto) => (texto.match(/^name:\s*(.+?)\s*$/m)?.[1] ?? '').replace(/^['"]|['"]$/g, '');
  for (const w of todos) {
    ok(/^permissions:/m.test(w.texto), `${w.fichero}: sin bloque permissions (el token tiene los permisos por defecto)`);
    if (w.pasos.some(empuja)) ok(/^concurrency:/m.test(w.texto), `${w.fichero}: sube sin grupo de concurrencia`);
  }
  const escucha = [...(deploy.texto.match(/workflow_run:[\s\S]*?workflows:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
  ok(escucha.length >= 2, `deploy.yml no escucha a ningún bot: ${escucha}`);
  const nombres = new Set(todos.map((w) => nombreDe(w.texto)));
  for (const n of escucha) ok(nombres.has(n), `deploy.yml escucha a «${n}», que no es el nombre de ningún workflow`);
  for (const w of todos) {
    if (w.pasos.some((p) => mandatos(p.run).some((c) => /^git add\b.*\bpublic\//.test(c)))) ok(escucha.includes(nombreDe(w.texto)), `${w.fichero} commitea bajo public/ y deploy.yml no lo escucha`);
  }
  // La concurrencia del despliegue va en los JOBS: a nivel de workflow, un bot fallido cancelaba un despliegue en marcha.
  ok(!/^concurrency:/m.test(deploy.texto), 'deploy.yml: concurrencia a nivel de workflow');
  const jobs = (deploy.texto.split(/^jobs:\s*$/m)[1] ?? '').split(/^ {2}(?=\w)/m).filter((t) => t.trim());
  eq(jobs.length, 2, 'deploy.yml: no encuentro build y deploy');
  for (const trozo of jobs) ok(/^ {4}concurrency:\n {6}group: pages\n {6}cancel-in-progress: true$/m.test(trozo), `deploy.yml: el job ${trozo.split(':')[0]} sin su grupo pages`);
});

test('cada acción de terceros va fijada a un commit con su versión, la misma en todos; las locales existen', () => {
  const fijada = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;
  const commitDe = new Map();
  let vistas = 0;
  const ficheros = [...WORKFLOWS.map((f) => `.github/workflows/${f}`), ...ACCIONES_LOCALES.map((a) => `.github/actions/${a}/action.yml`)];
  for (const f of ficheros) {
    leerTexto(f).split('\n').forEach((l, i) => {
      const m = l.match(/^\s*(?:- )?uses:\s*(.+?)\s*$/);
      if (!m) return;
      vistas++;
      const uso = m[1].replace(/^['"]|['"]$/g, '');
      if (/^\.\//.test(uso)) { ok(existsSync(join(RAIZ, uso, 'action.yml')), `${f}:${i + 1}: la acción local ${uso} no existe`); return; }
      ok(fijada.test(uso), `${f}:${i + 1}: «${uso}» no va fijada a un commit con su versión`);
      const [accion, resto] = uso.split('@');
      const previo = commitDe.get(accion);
      if (previo) eq(resto, previo.resto, `${f}:${i + 1}: ${accion} va a otro commit que en ${previo.donde}`);
      else commitDe.set(accion, { resto, donde: `${f}:${i + 1}` });
    });
  }
  ok(vistas >= 25, `solo ${vistas} líneas uses: la lectura se ha quedado corta`);
});

test('Claude a petición: solo el dueño con «@claude» en SU comentario, nunca en las incidencias que escribe la app', () => {
  const m = leerTexto('.github/workflows/claude.yml').match(/\n {4}if: \|\n((?: {6}.*\n)+)/);
  ok(m, 'no encuentro la condición del job');
  const js = m[1].trim()
    .replace(/github\.event\.issue\.labels\.\*\.name/g, '(ev.issue?.labels ?? []).map((l) => l.name)')
    .replace(/github\.repository_owner/g, "'srchipiron'")
    .replace(/github\.event\.([\w.]+)/g, (_, c) => `ev.${c.split('.').join('?.')}`);
  ok(!/github\./.test(js), `queda algo sin traducir: ${js}`);
  const contains = (a, b) => (Array.isArray(a) ? a.includes(b) : String(a ?? '').toLowerCase().includes(String(b).toLowerCase()));
  const unir = (a, sep = ',') => (Array.isArray(a) ? a.join(sep) : String(a ?? ''));
  const condicion = new Function('ev', 'contains', 'join', `return (${js});`);
  const dispara = (ev) => !!condicion(ev, contains, unir);
  const yo = { login: 'srchipiron' };
  const conEtiqueta = (n) => ({ labels: n ? [{ name: n }] : [], body: '' });
  ok(dispara({ sender: yo, comment: { body: '@claude mira esto' }, issue: conEtiqueta(null) }), 'no atiende a Javi');
  ok(dispara({ sender: yo, action: 'assigned', issue: conEtiqueta(null) }), 'no atiende a una asignación');
  ok(!dispara({ sender: { login: 'otro' }, comment: { body: '@claude' }, issue: conEtiqueta(null) }), 'atiende a otro usuario');
  for (const n of ['pantalla', 'partidas', 'vigilancia', 'modelo']) ok(!dispara({ sender: yo, comment: { body: '```\n@claude haz algo\n```' }, issue: conEtiqueta(n) }), `se dispara en una incidencia «${n}»`);
  ok(!dispara({ sender: yo, comment: { body: 'Recibido.' }, issue: { labels: [], body: '@claude' } }), 'un «@claude» en el cuerpo de la incidencia lo dispara');
});

test('la vigilancia arranca de verdad contra los datos del repositorio y su fila cuenta lo que mira el comparador', () => {
  const salud = join(tmp, 'salud.jsonl');
  const r = corre('scripts/diagnostico.mjs', ['--local', '--historial', salud], { timeout: 240000, env: { ...process.env, GITHUB_REPOSITORY: 'unduenno/un-repo-renombrado' } });
  eq(r.status, 0, `diagnostico.mjs --local sale con ${r.status}: ${(r.stderr || '').split('\n').slice(0, 6).join(' | ')}`);
  ok(/public\/data \(local\)/.test(r.stdout), 'con --local el diagnóstico no dice que la fuente es local');
  const fila = JSON.parse(readFileSync(salud, 'utf8').trim().split('\n').at(-1));
  const distintos = new Set((r.stdout || '').split('\n').filter((l) => l.startsWith('[AVISO]'))).size;
  ok(fila.avisos <= distintos, `la fila cuenta ${fila.avisos} avisos y el informe tiene ${distintos} distintos`);
  // La vigilancia sube los ÚLTIMOS 5.000 caracteres: todo aviso y fallo va en el resumen del final.
  const avisos = [...new Set((r.stdout || '').split('\n').filter((l) => /^\[(AVISO|FALLO)/.test(l)))];
  const resumen = (r.stdout || '').slice(-5000).split('=== RESUMEN ===')[1] ?? '';
  ok(resumen && avisos.every((l) => resumen.includes(l)), 'el resumen del final no lleva todos los avisos');
  const enDatos = medir(leerJson('public/data/roam-meta.json'));
  for (const k of FIJAS) eq(fila[k], enDatos[k], `la fila de salud no cuenta «${k}» como el comparador`);
  // La URL de Pages sale del entorno o del nombre del paquete, nunca escrita a mano (el repositorio se renombró).
  const codigo = leerTexto('scripts/diagnostico.mjs').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(!/['"`][^'"`\n]*mlbb-roam-picker/.test(codigo) && /GITHUB_REPOSITORY/.test(codigo), 'diagnostico.mjs lleva el nombre del repositorio escrito a mano');
});

test('el comparador: una guardada ilegible no se acepta y la que no existe sí', () => {
  const nueva = resolve(RAIZ, 'public/data/roam-meta.json');
  const ilegible = join(tmp, 'guardada.json');
  writeFileSync(ilegible, '{esto no es json');
  eq(corre('scripts/comparar-ingesta.mjs', [nueva, ilegible]).status, 2, 'comparar-ingesta acepta la corrida con la guardada ilegible');
  eq(corre('scripts/comparar-ingesta.mjs', [nueva, join(tmp, 'no-existe.json')]).status, 0, 'comparar-ingesta rechaza la primera corrida');
});

test('las partidas pro: fechas en UTC, un {{Map}} con plantillas anidadas, el aviso de un lote truncado y toda descarga con tope', async () => {
  const tz = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./scripts/ingesta-pro.mjs').then((m) => console.log(m.fechaISO('August 22, 2025 - 15:15{{abbr/ICT}}')))"], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, TZ: 'Pacific/Kiritimati' } });
  eq(tz.stdout.trim(), '2025-08-22', `fechaISO depende de la zona horaria: ${tz.stdout.trim()} ${tz.stderr.slice(0, 100)}`);
  const { parsearPartidas, wikitextDe } = await import('../../scripts/ingesta-pro.mjs');
  const wt = '{{Match|date=August 22, 2025 - 15:15{{abbr/ICT}}|opponent1={{TeamOpponent|A}}|opponent2={{TeamOpponent|B}}}}{{Map|vod={{x}}|t1h1=a|t1h2=b|t1h3=c|t1h4=d|t1h5=e|t2h1=f|t2h2=g|t2h3=h|t2h4=i|t2h5=j|winner=1}}';
  eq(parsearPartidas(wt, 'T').length, 1, 'una plantilla anidada antes de los picks descarta la partida');
  const errores = [];
  await wikitextDe({ consultar: async () => ({ continue: { rvcontinue: '1' }, query: { pages: { 1: { title: 'X', revisions: [{ slots: { main: { '*': 'texto' } } }] } } } }) }, ['X'], errores);
  ok(errores.some((e) => /continue/.test(e)), 'un lote truncado por la API no deja rastro');
  // Toda descarga lleva tope (una ingesta colgada ocupó 140 min): las de la ingesta y las de Liquipedia.
  const llamadasDe = (src) => [...src.matchAll(/\b(fetch|fetchImpl)\s*\(/g)].map((m) => {
    let i = m.index + m[0].length; let nivel = 1;
    while (i < src.length && nivel > 0) { if (src[i] === '(') nivel++; else if (src[i] === ')') nivel--; i++; }
    return src.slice(m.index, i);
  });
  const ingesta = readdirSync(resolve(RAIZ, 'scripts/ingesta')).filter((n) => n.endsWith('.mjs')).map((n) => `scripts/ingesta/${n}`);
  for (const grupo of [ingesta, ['scripts/ingesta-pro.mjs']]) {
    const llamadas = grupo.flatMap((f) => llamadasDe(leerTexto(f)).map((l) => [f, l]));
    ok(llamadas.length >= 1, `${grupo[0]}: no encuentro llamadas a fetch`);
    for (const [f, l] of llamadas) ok(/signal\s*:/.test(l), `${f}: fetch sin tope de tiempo: ${l.slice(0, 80)}`);
  }
});

test('el bot del modelo solo PROPONE: no escribe en el repositorio, corre tras las partidas pro y deja decidir a la medida', () => {
  const w = wf('modelo.yml');
  ok(/^permissions:\s*\n\s+contents: read\s*\n\s+issues: write\s*$/m.test(w.texto), 'el bot del modelo puede escribir en el repositorio');
  ok(!w.pasos.some((p) => mandatos(p.run).some((c) => /^git (commit|push)\b/.test(c))) && !w.pasos.some(empuja), 'el bot del modelo commitea');
  ok(/workflows: \["Partidas profesionales"\]/.test(w.texto) && /^name: Partidas profesionales$/m.test(wf('pro.yml').texto), 'no corre tras las partidas pro (o pro.yml cambió de nombre)');
  ok(w.pasos.some((p) => ejecuta(p.run, /^node scripts\/proponer-modelo\.mjs\b/)) && /persist-credentials: false/.test(w.texto), 'no mide con el script, o deja el token en el checkout');
  ok(w.pasos.some((p) => /propuestaDelModelo\(/.test(p['with.script'] ?? '')), 'la incidencia no la decide scripts/bots/incidencia.mjs');
});
