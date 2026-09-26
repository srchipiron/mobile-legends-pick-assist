/**
 * Los workflows y los scripts que publican, leídos POR FORMA y, donde se
 * puede, EJECUTADOS. Aquí viven tres guardarraíles con historia: la ingesta
 * escribiendo directa sobre `public/data` (una corrida degradada commiteada),
 * el bucle de rebase+push que salía en verde con los tres intentos
 * rechazados, y el diagnóstico de la vigilancia que reventaba tres líneas
 * después de imprimir «[OK]».
 *
 * Nada de buscar cadenas sueltas en el YAML: `run: echo "antes: node
 * scripts/comparar-ingesta.mjs"` pasaba el guardarraíl y `h > 7200` pasaba el
 * tope de antigüedad. Los `run` se leen como pasos y se trocean en mandatos
 * (ver pruebas/fixtures/yaml-workflows.mjs), y los dos guardarraíles del
 * despliegue -frescura y datos publicables- se ejecutan de verdad contra un
 * `roam-meta.json` fabricado.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, ok, eq, terminar, RAIZ, leerTexto, leerJson } from '../arnes.mjs';
import { WORKFLOWS, leerWorkflow, mandatos, ejecuta } from '../fixtures/yaml-workflows.mjs';
import { medir } from '../../scripts/comparar-ingesta.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'workflows-'));
const corre = (script, args, opts = {}) => spawnSync(process.execPath, [resolve(RAIZ, script), ...args], { encoding: 'utf8', cwd: RAIZ, ...opts });

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

/** Ejecuta el `run` de un paso en un directorio de mentira, como haría el runner. */
function ejecutarPaso(run, { cwd, env = {}, path = [] } = {}) {
  const guion = run.replace(/\$\{\{[^}]*\}\}/g, '');
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', guion], {
    cwd, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, ...env, PATH: [...path, process.env.PATH].join(':') },
  });
}

const deploy = leerWorkflow('deploy.yml');

test('los workflows que publican datos pasan por el guardarrail', () => {
  // Si alguien vuelve a poner la ingesta escribiendo directa sobre
  // public/data, el guardarrail deja de mirar y volvemos al fallo de arriba.
  // Los TRES que ejecutan la ingesta. mantenimiento.yml se quedo fuera de esta
  // lista y escribia directa sobre public/data sin comparar: no lo commiteaba,
  // pero derivaba las tablas y pasaba npm test sobre lo que saliera.
  const LOS_TRES = ['deploy.yml', 'update-data.yml', 'mantenimiento.yml'];
  for (const f of LOS_TRES) {
    const w = leerWorkflow(f);
    const ingesta = w.pasos.flatMap((p) => mandatos(p.run).filter((c) => /^node scripts\/ingest\.mjs\b/.test(c)));
    ok(ingesta.length > 0, `${f}: ya no ejecuta la ingesta`);
    for (const c of ingesta) {
      ok(/\s--out\s+\S/.test(c), `${f}: la ingesta escribe directa sobre los datos buenos`);
    }
    // Que la comparación sea un COMANDO, no una mención: `run: echo "antes:
    // node scripts/comparar-ingesta.mjs"` pasaba (probado por mutación).
    ok(w.pasos.some((p) => ejecuta(p.run, /^node scripts\/comparar-ingesta\.mjs\b/)),
      `${f}: no ejecuta la comparación de la corrida con la guardada`);
  }
  // Y el cuarto: si alguien añade un workflow que llame a la ingesta, o entra
  // en la lista de arriba o no está protegido. La lista a mano fue justo el
  // fallo de mantenimiento.yml.
  for (const f of WORKFLOWS) {
    if (LOS_TRES.includes(f)) continue;
    const w = leerWorkflow(f);
    ok(!w.pasos.some((p) => ejecuta(p.run, /^node scripts\/ingest\.mjs\b/)),
      `${f} ejecuta la ingesta y no está en la lista de workflows protegidos de esta prueba`);
  }

  // El despliegue puede seguir adelante con los datos del repositorio si la API
  // esta caida -si no, un UPSTREAM_REQUEST_FAILED impide publicar cualquier
  // cambio de codigo-, pero NO puede publicar datos rancios sin darse cuenta.
  // El guardarrail no se lee: se EJECUTA con datos fabricados. Buscar `h > 72`
  // en el texto lo pasaba un `h > 7200` (y un comentario).
  const puerta = deploy.pasos.filter((p) => /roam-meta\.json/.test(p.run ?? '') && /process\.exit\(1\)/.test(p.run ?? ''));
  eq(puerta.length, 1, 'deploy.yml ya no comprueba si los datos valen para publicar');
  const caja = join(tmp, 'deploy'); mkdirSync(join(caja, 'public/data'), { recursive: true });
  const conDatos = (d) => { writeFileSync(join(caja, 'public/data/roam-meta.json'), JSON.stringify(d)); };
  const publicable = (d) => { conDatos(d); return ejecutarPaso(puerta[0].run, { cwd: caja }).status; };
  eq(publicable(datosDe({ horas: 1 })), 0, 'deploy.yml no publica con datos recién descargados');
  ok(publicable(datosDe({ horas: 73 })) !== 0, 'deploy.yml deja publicar datos de mas de tres dias');
  ok(publicable(datosDe({ horas: 1, cruces: 0 })) !== 0, 'deploy.yml ya no comprueba que haya matriz de counters');
  ok(publicable(datosDe({ horas: 1, heroCount: 0 })) !== 0, 'deploy.yml publica sin estadisticas');

  // El despliegue NO vuelve a descargar si el repositorio tiene datos
  // recientes: el bot ya lo hace dos veces al dia. Sin esto cada push de
  // codigo costaba diez minutos y, con cancel-in-progress, cada push
  // reiniciaba la descarga del anterior: cinco commits seguidos dejaron la app
  // 25 minutos por detras. Y el umbral de "reciente" tiene que quedar por
  // debajo del de "rancio" (72 h), o se publicaria sin descargar algo que
  // luego el propio despliegue rechaza.
  const pasoIngesta = deploy.pasos.find((p) => ejecuta(p.run, /^node scripts\/ingest\.mjs\b/));
  const condicion = (pasoIngesta.if ?? '').match(/steps\.([\w-]+)\.outputs\.(\w+)\s*!=\s*'true'/);
  ok(condicion, 'deploy.yml descarga datos en cada push aunque el repositorio los tenga recientes');
  const pasoFrescura = deploy.pasos.find((p) => p.id === condicion[1]);
  ok(pasoFrescura, `deploy.yml mira steps.${condicion[1]} y ese paso no existe`);
  const salida = join(caja, 'salida.txt');
  const fresca = (horas) => {
    conDatos(datosDe({ horas }));
    writeFileSync(salida, '');
    const r = ejecutarPaso(pasoFrescura.run, { cwd: caja, env: { GITHUB_OUTPUT: salida } });
    eq(r.status, 0, `el paso de frescura falla: ${r.stderr}`);
    const m = readFileSync(salida, 'utf8').match(new RegExp(`${condicion[2]}=(\\w+)`));
    ok(m, `el paso de frescura no escribe ${condicion[2]} en GITHUB_OUTPUT`);
    return m[1] === 'true';
  };
  ok(fresca(1), 'deploy.yml descarga aunque los datos del repositorio sean de hace una hora');
  ok(!fresca(73), 'deploy.yml tiene por frescos unos datos de hace tres dias');
  // El umbral de "reciente" por debajo del de "rancio": ninguna edad puede
  // dar "fresca" y a la vez no valer para publicar.
  for (const horas of [1, 12, 23, 25, 47, 71, 73]) {
    if (fresca(horas)) eq(publicable(datosDe({ horas })), 0, `con ${horas} h se publica sin descargar y luego el propio despliegue lo rechaza`);
  }
  const elegir = deploy.pasos.find((p) => ejecuta(p.run, /^node scripts\/comparar-ingesta\.mjs\b/));
  ok(mandatos(elegir.run).some((c) => /outcome\s*\}\}"? = "skipped"/.test(c) || /outcome[^\n]*=\s*"?skipped/.test(c)),
    'el paso de elegir datos no distingue "ingesta omitida" de "ingesta fallida": avisaria de un fallo que no existe');

  // Los bots que commitean hacen rebase antes del push: la vigilancia mueve
  // main varias veces al dia y un push rechazado pierde la corrida entera.
  for (const f of ['update-data.yml', 'pro.yml', 'partidas.yml']) {
    const w = leerWorkflow(f);
    const paso = w.pasos.find((p) => mandatos(p.run).some((c) => /^git push\b/.test(c)));
    ok(paso, `${f}: ya no hace push`);
    const orden = mandatos(paso.run);
    const push = orden.findIndex((c) => /^git push\b/.test(c));
    const rebase = orden.findIndex((c) => /^git pull --rebase\b/.test(c));
    ok(push >= 0 && rebase >= 0 && rebase < push, `${f}: hace git push sin git pull --rebase antes`);
  }
  // La vigilancia solo abre incidencia si el paso de pruebas falla, y con un
  // `| tee` sin pipefail el paso devolvia siempre el codigo de tee.
  const vig = leerWorkflow('vigilancia.yml');
  const pruebas = vig.pasos.filter((p) => mandatos(p.run).some((c) => /^npm test\b/.test(c)));
  ok(pruebas.length, 'vigilancia.yml ya no ejecuta npm test');
  for (const p of pruebas) {
    if (!/\|/.test(p.run)) continue;
    eq(p.shell, 'bash', 'vigilancia.yml: el paso de pruebas no tiene shell: bash (sin pipefail, npm test en rojo no abre incidencia)');
  }
  // Y en TODOS los workflows, no solo en ese paso: la misma tubería sin
  // pipefail vivía en partidas.yml (3.14.0), y un código roto se respondía
  // con «Recibido» y se cerraba sin guardar nada. Una lista fija de pasos
  // es la trampa que este proyecto ya ha pagado tres veces.
  for (const f of WORKFLOWS) {
    for (const p of leerWorkflow(f).pasos) {
      if (!p.run) continue;
      const conTuberia = p.run.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).some((l) => /(^|[^|])\|([^|]|$)/.test(l));
      if (conTuberia) eq(p.shell, 'bash', `${f}: el paso «${p.name ?? p._linea}» usa una tubería sin shell: bash (el código de salida sería el del último mandato)`);
    }
  }
  // El diagnóstico de lo publicado corre también con las pruebas en rojo:
  // sin eso no quedaba fila en el historial justo en las corridas malas.
  const diag = vig.pasos.find((p) => ejecuta(p.run, /^node scripts\/diagnostico\.mjs\b/));
  ok(diag, 'vigilancia.yml ya no ejecuta el diagnóstico de lo publicado');
  ok(/!\s*cancelled\(\)|always\(\)/.test(diag.if ?? ''), 'vigilancia.yml: el diagnóstico de lo publicado se salta cuando fallan las pruebas (sin fila en el historial)');
  // Un paso que hace push con continue-on-error no puede fallar en silencio:
  // algún paso posterior mira su `outcome` (failure() no se entera).
  for (const f of WORKFLOWS) {
    const w = leerWorkflow(f);
    w.pasos.forEach((p, i) => {
      if (String(p['continue-on-error']) !== 'true' || !mandatos(p.run).some((c) => /^git push\b/.test(c))) return;
      ok(p.id, `${f}: el paso «${p.name}» hace push con continue-on-error y sin id: nadie puede mirar si falló`);
      const mira = new RegExp(`steps\\.${p.id}\\.outcome\\s*==\\s*'failure'`);
      ok(w.pasos.slice(i + 1).some((q) => mira.test(q.if ?? '')), `${f}: si el push de «${p.name}» falla no se entera nadie (continue-on-error y ningún paso mira steps.${p.id}.outcome)`);
    });
  }
  // Cualquier paso que llame a la API lleva tope de tiempo, no solo la ingesta.
  const mant = leerWorkflow('mantenimiento.yml');
  const regenerar = mant.pasos.find((p) => ejecuta(p.run, /^node scripts\/derivar-tags\.mjs\b/));
  ok(regenerar, 'mantenimiento.yml ya no regenera las tablas de deducción');
  ok(/^\d+$/.test(regenerar['timeout-minutes'] ?? ''), 'mantenimiento.yml: regenerar tablas llama a la API sin timeout-minutes');
  // Un despliegue por workflow_run solo si el bot acabo bien.
  ok(Object.values(deploy.jobs).some((j) => /workflow_run\.conclusion == 'success'/.test(j.claves.if ?? '')),
    'deploy.yml despliega tambien cuando el bot descarto su corrida');
  // El guardarrail cuenta rangos: con glory caido, epic se colaba bajo su etiqueta.
  const m = medir({ rank: 'glory', stats: { A: {} }, statsByRank: { epic: { A: {} } } });
  eq(m.rangoPedido, 0, 'comparar-ingesta no nota que falta el rango pedido');
  eq(medir({ rank: 'glory', stats: {}, statsByRank: { epic: {}, glory: {} } }).rangos, 2, 'comparar-ingesta no cuenta los rangos');

  // Y con tope de tiempo en la ingesta. "Fallar" lo cubre continue-on-error,
  // "colgarse" no: ~570 peticiones con 15 s de timeout son 140 minutos con la
  // API a medias, y el despliegue se quedaba ahi sabiendo publicar con los
  // datos del repositorio. Se vio en directo: una ingesta llevaba 20 minutos
  // en un paso que normalmente tarda 9.
  for (const f of LOS_TRES) {
    const paso = leerWorkflow(f).pasos.find((p) => ejecuta(p.run, /^node scripts\/ingest\.mjs\b/));
    const t = Number(paso['timeout-minutes']);
    ok(Number.isFinite(t), `${f}: la ingesta no tiene timeout-minutes y puede colgar el workflow dos horas`);
    ok(t >= 15 && t <= 40, `${f}: timeout de ${t} min; lo normal son 9-10 y hace falta margen sin dejar que se cuelgue`);
  }

  // Cada JOB lleva tope de tiempo: los pasos con red ya lo tenian, pero npm
  // test (levanta un servidor), la compilacion o Pages podian colgar el runner
  // seis horas; en la vigilancia, con concurrencia sin cancelar, eso encolaba
  // todas las siguientes y el cron se perdia en silencio.
  for (const f of WORKFLOWS) {
    const w = leerWorkflow(f);
    ok(w.jobs.length, `${f}: no encuentro ningun job`);
    for (const j of w.jobs) {
      ok(/^\d+$/.test(j.claves['timeout-minutes'] ?? ''), `${f}: el job ${j.nombre} no tiene timeout-minutes (puede ocupar el runner seis horas)`);
    }
  }

  // Y «las pruebas» son UNA definicion: la de package.json. Quitar una de las
  // cuatro comprobaciones de `npm test` pasaba (probado por mutacion) y el
  // despliegue las llamaba a mano, asi que habia dos listas. Desde 3.0 son los
  // guardarrailes de scripts/comprobar, ESLint y el runner de pruebas/.
  const pkg = leerJson('package.json');
  const expandir = (guion, visto = new Set()) => guion.split(/&&|\|\||;/).map((c) => c.trim()).flatMap((c) => {
    const m = c.match(/^npm run (\S+)/);
    if (!m || visto.has(m[1])) return [c];
    visto.add(m[1]);
    return expandir(pkg.scripts?.[m[1]] ?? '', visto);
  });
  const deNpmTest = expandir(pkg.scripts?.test ?? '');
  for (const script of ['scripts/comprobar/orden.mjs', 'scripts/comprobar/css.mjs', 'scripts/comprobar/version.mjs', 'pruebas/correr.mjs']) {
    ok(deNpmTest.some((c) => c.includes(script)), `npm test ya no ejecuta ${script}`);
  }
  ok(deNpmTest.some((c) => /^eslint\b/.test(c)), 'npm test ya no pasa el lint (un identificador que no existe volvería a llegar a producción)');
  ok(deploy.pasos.some((p) => mandatos(p.run).some((c) => c === 'npm test')), 'deploy.yml no ejecuta npm test: tiene su propia lista de pruebas');

  // node_modules va en cache por hash del lockfile en TODOS los workflows
  // que instalan: medido, npm ci costaba 3,7-4,7 minutos por corrida con la
  // cache de npm de setup-node (que solo guarda descargas). Y npm ci BORRA
  // node_modules antes de instalar: sin la condicion, la cache no sirve.
  const conNpmCi = WORKFLOWS.map(leerWorkflow).filter((w) => w.pasos.some((p) => mandatos(p.run).some((c) => /^npm ci\b/.test(c))));
  ok(conNpmCi.length >= 5, `solo ${conNpmCi.length} workflows instalan: la lista de esta prueba se ha quedado corta`);
  for (const w of conNpmCi) {
    const cache = w.pasos.find((p) => /^actions\/cache@/.test(p.uses ?? '') && p['with.path'] === 'node_modules');
    ok(cache, `${w.fichero}: instala sin cache de node_modules`);
    if (!cache) continue;
    ok(/hashFiles\('package-lock\.json'\)/.test(cache['with.key'] ?? ''), `${w.fichero}: la clave de la cache no depende del lockfile: serviria node_modules viejos con dependencias nuevas`);
    const nodo = w.pasos.map((p) => p['with.node-version']).find(Boolean)?.replace(/'/g, '');
    ok(nodo && (cache['with.key'] ?? '').includes(`node${nodo}`), `${w.fichero}: la clave de la cache no lleva la version de node (${nodo})`);
    const instala = w.pasos.find((p) => mandatos(p.run).some((c) => /^npm ci\b/.test(c)));
    ok((instala.if ?? '').includes(`steps.${cache.id}.outputs.cache-hit != 'true'`),
      `${w.fichero}: npm ci corre aunque la cache haya traido node_modules (y lo borra)`);
  }
});

test('cada workflow declara sus permisos, los bots que commitean no se solapan y el despliegue escucha a los que cambian lo servido', () => {
  // Las claves de primer nivel, leídas al principio de línea (un comentario
  // o un `echo` no empiezan en la columna 0 con la clave).
  const nombreDe = (texto) => (texto.match(/^name:\s*(.+?)\s*$/m)?.[1] ?? '').replace(/^['"]|['"]$/g, '');
  const leidos = WORKFLOWS.map((f) => ({ f, w: leerWorkflow(f) }));
  for (const { f, w } of leidos) {
    // Sin `permissions:` el token recibe los permisos por defecto del
    // repositorio (pasó con pruebas-ui.yml hasta 3.15.0).
    ok(/^permissions:/m.test(w.texto), `${f}: sin bloque permissions (el token tiene los permisos por defecto)`);
    // Un bot que hace push a main con dos corridas a la vez choca en el
    // rebase y pierde una (pro.yml y mantenimiento.yml hasta 3.15.0).
    const empuja = w.pasos.some((p) => mandatos(p.run).some((c) => /^git push\b/.test(c)));
    if (empuja) ok(/^concurrency:/m.test(w.texto), `${f}: hace push sin grupo de concurrencia`);
  }
  // Un push con GITHUB_TOKEN no dispara `on: push`: el bot que cambia lo que
  // la app SIRVE (public/) tiene que estar en el workflow_run de deploy.yml
  // o lo suyo no se publica (pasó con pro.json: 304 partidas y cero en la
  // app). Y cada nombre de la lista tiene que existir: renombrar un `name:`
  // la rompía sin que nada fallara.
  const deploy = leidos.find((x) => x.f === 'deploy.yml').w.texto;
  const escucha = [...(deploy.match(/workflow_run:[\s\S]*?workflows:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
  ok(escucha.length >= 2, `deploy.yml no escucha a ningún bot: ${escucha}`);
  const nombres = new Set(leidos.map(({ w }) => nombreDe(w.texto)));
  for (const n of escucha) ok(nombres.has(n), `deploy.yml escucha a «${n}», que no es el nombre de ningún workflow`);
  for (const { f, w } of leidos) {
    const tocaServido = w.pasos.some((p) => mandatos(p.run).some((c) => /^git add\b.*\bpublic\//.test(c)));
    if (tocaServido) ok(escucha.includes(nombreDe(w.texto)), `${f} commitea bajo public/ y deploy.yml no lo escucha: lo suyo no se publica`);
  }
});

test('la vigilancia arranca de verdad contra los datos del repositorio', () => {
  // Un `matchup is not defined` en diagnostico.mjs pasó `npm test`, la
  // compilación y el despliegue: el script se ejecutaba solo en el bot, y
  // reventó DESPUÉS de imprimir «[OK] Pages sirve la 2.0.0», con lo que
  // leyendo su salida a medias parecía sano. Se ejecuta entero, y se mira el
  // código de salida, no la salida.
  // Con `--historial`: la fila de salud es lo que reventaba, y solo se
  // calcula cuando se pide (el bot siempre la pide).
  const dir = mkdtempSync(join(tmpdir(), 'salud-'));
  const salud = join(dir, 'salud.jsonl');
  const r = corre('scripts/diagnostico.mjs', ['--local', '--historial', salud], { timeout: 240000 });
  eq(r.status, 0, `diagnostico.mjs --local sale con ${r.status}: ${(r.stderr || '').split('\n').slice(0, 6).join(' | ')}`);
  // La fila de salud cuenta avisos DISTINTOS, no la suma de las cinco líneas:
  // un aviso global salía cinco veces (10 en la serie donde el móvil decía 2).
  const fila = JSON.parse(readFileSync(salud, 'utf8').trim().split('\n').at(-1));
  const distintos = new Set((r.stdout || '').split('\n').filter((l) => l.startsWith('[AVISO]'))).size;
  ok(fila.avisos <= distintos, `la fila de salud cuenta ${fila.avisos} avisos y el informe tiene ${distintos} distintos: suma las cinco líneas`);
  ok(/Fuente: public\/data/.test(r.stdout + r.stderr), 'el diagnóstico local no llega al final');
  ok(existsSync(salud) && /"cruces":\d+/.test(readFileSync(salud, 'utf8')), 'no deja la fila de salud con sus cifras');
  // Cada recuento de FIJAS que el comparador mira contra el historial tiene
  // que estar en la fila, o su máximo es siempre 0 y el trinquete no existe.
  const enDatos = medir(leerJson('public/data/roam-meta.json'));
  eq(fila.winrateLinea, enDatos.winrateLinea, `la fila de salud no cuenta los pares del winrate por línea como el comparador (${fila.winrateLinea} frente a ${enDatos.winrateLinea})`);
});

test('revisión línea a línea de scripts y workflows: guardas que no vigilaban, bucles verdes en rojo, fechas, tiempos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guardas-'));

  // 1. check-css: la regla «nada esencial oculto» llevaba muerta desde que se
  //    escribió (la regex no casaba con nada). Con un CSS roto tiene que fallar.
  //    (Desde 3.0 es scripts/comprobar/css.mjs; pruebas/scripts/comprobar.test.mjs
  //    lo rompe de más maneras, aquí se conserva el caso que lo originó.)
  const cssRoto = join(dir, 'roto.css');
  writeFileSync(cssRoto, leerTexto('src/styles.css').replace('.slot .x {', '.slot .x { display: none; '));
  const rCss = corre('scripts/comprobar/css.mjs', [cssRoto]);
  ok(rCss.status !== 0 && /se oculta/.test(rCss.stdout + rCss.stderr), `check-css no ve la × oculta: ${(rCss.stdout + rCss.stderr).slice(0, 200)}`);
  eq(corre('scripts/comprobar/css.mjs', []).status, 0, 'check-css falla con el CSS real');

  // 2. check-order: las desestructuradas (useState) también cuentan.
  const jsxRoto = join(dir, 'roto.jsx');
  writeFileSync(jsxRoto, 'export default function App() {\n  const total = enemies.length + foo;\n  const [enemies, setEnemies] = useState([]);\n  const { foo } = props;\n  return total;\n}\n');
  ok(corre('scripts/comprobar/orden.mjs', [jsxRoto]).status !== 0, 'check-order no ve un useState desestructurado usado antes');
  const jsxBien = join(dir, 'bien.jsx');
  writeFileSync(jsxBien, 'export default function App() {\n  const [enemies, setEnemies] = useState([]);\n  const { foo = 1 } = props;\n  const total = enemies.length + foo;\n  return total;\n}\n');
  eq(corre('scripts/comprobar/orden.mjs', [jsxBien]).status, 0, 'check-order falla con un orden correcto');

  // 3. Los bucles de rebase+push salen en rojo si fallan los tres intentos.
  //    No se busca la guarda en el texto: se EJECUTA el paso con un `git` de
  //    mentira que rechaza el push, y tiene que salir en rojo despues de los
  //    tres intentos. Antes el ultimo mandato del bucle era `sleep` y el
  //    estado era 0: la corrida perdida en silencio que el bucle venia a
  //    evitar, y encima el despliegue disparado «con exito» sobre datos viejos.
  const bin = join(dir, 'bin'); mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'git'), '#!/bin/sh\ncase "$1" in\n  push) echo push >> "$GITLOG"; exit 1 ;;\n  diff) case "$*" in *--staged*) exit 0 ;; *) exit 1 ;; esac ;;\n  *) exit 0 ;;\nesac\n', { mode: 0o755 });
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  for (const f of ['update-data.yml', 'pro.yml', 'vigilancia.yml', 'partidas.yml']) {
    const paso = leerWorkflow(f).pasos.find((p) => mandatos(p.run).some((c) => /^git push\b/.test(c)));
    ok(paso, `${f}: ya no hace push`);
    const caja = join(dir, `push-${f}`); mkdirSync(join(caja, 'historial'), { recursive: true });
    writeFileSync(join(caja, 'historial/salud.jsonl'), '{"cruces":17556}\n');
    const registro = join(caja, 'git.log'); writeFileSync(registro, '');
    const r = ejecutarPaso(paso.run, { cwd: caja, env: { GITLOG: registro }, path: [bin] });
    ok(r.status !== 0, `${f}: el bucle de push acaba en verde aunque fallen los tres intentos`);
    eq(readFileSync(registro, 'utf8').split('\n').filter(Boolean).length, 3, `${f}: el push no se reintenta tres veces`);
    ok(/::error::/.test(r.stdout + r.stderr), `${f}: los tres intentos fallidos no dejan ni un aviso`);
  }

  // 4. comparar-ingesta: una guardada ILEGIBLE no se acepta (solo la que no existe).
  const nueva = resolve(RAIZ, 'public/data/roam-meta.json');
  const ilegible = join(dir, 'guardada.json');
  writeFileSync(ilegible, '{esto no es json');
  ok(corre('scripts/comparar-ingesta.mjs', [nueva, ilegible]).status !== 0, 'comparar-ingesta acepta la corrida con la guardada ilegible');
  eq(corre('scripts/comparar-ingesta.mjs', [nueva, join(dir, 'no-existe.json')]).status, 0, 'comparar-ingesta rechaza la primera corrida (sin guardada)');
  for (const f of ['update-data.yml', 'deploy.yml']) {
    const w = leerWorkflow(f);
    ok(w.pasos.some((p) => ejecuta(p.run, /^node scripts\/comparar-ingesta\.mjs \/tmp\/nueva\.json public\/data\/roam-meta\.json\b/)),
      `${f}: la comparación no apunta a public/data/roam-meta.json`);
  }

  // 5. fechaISO en UTC: desde un móvil en otra zona horaria salía un día menos.
  const tz = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./scripts/ingesta-pro.mjs').then((m) => console.log(m.fechaISO('August 22, 2025 - 15:15{{abbr/ICT}}')))"], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, TZ: 'Pacific/Kiritimati' } });
  eq(tz.stdout.trim(), '2025-08-22', `fechaISO depende de la zona horaria: ${tz.stdout.trim()} ${tz.stderr.slice(0, 100)}`);

  // 6. {{Map}} con una plantilla anidada antes de los picks no se pierde.
  const { parsearPartidas, wikitextDe } = await import('../../scripts/ingesta-pro.mjs');
  const wt = '{{Match|date=August 22, 2025 - 15:15{{abbr/ICT}}|opponent1={{TeamOpponent|A}}|opponent2={{TeamOpponent|B}}}}{{Map|vod={{x}}|t1h1=a|t1h2=b|t1h3=c|t1h4=d|t1h5=e|t2h1=f|t2h2=g|t2h3=h|t2h4=i|t2h5=j|winner=1}}';
  eq(parsearPartidas(wt, 'T').length, 1, 'una plantilla anidada antes de los picks descarta la partida');

  // 7. wikitextDe avisa si la API trunca el lote (continue).
  const errores = [];
  const cliente = { consultar: async () => ({ continue: { rvcontinue: '1' }, query: { pages: { 1: { title: 'X', revisions: [{ slots: { main: { '*': 'texto' } } }] } } } }) };
  await wikitextDe(cliente, ['X'], errores);
  ok(errores.some((e) => /continue/.test(e)), 'un lote truncado por la API no deja rastro');

  // 8. Toda descarga lleva tope de tiempo. Desde 3.0 la ingesta vive en
  //    scripts/ingesta/*.mjs: mirar solo scripts/ingest.mjs (39 líneas de
  //    reexportación) haría pasar esta comprobación EN VACÍO.
  const ingesta = ['scripts/ingest.mjs', ...readdirSync(resolve(RAIZ, 'scripts/ingesta')).filter((n) => n.endsWith('.mjs')).map((n) => `scripts/ingesta/${n}`)];
  const llamadasDe = (src) => {
    const fuera = [];
    for (const m of src.matchAll(/\b(fetch|fetchImpl)\s*\(/g)) {
      let i = m.index + m[0].length; let nivel = 1;
      while (i < src.length && nivel > 0) { if (src[i] === '(') nivel++; else if (src[i] === ')') nivel--; i++; }
      fuera.push(src.slice(m.index, i));
    }
    return fuera;
  };
  for (const grupo of [ingesta, ['scripts/ingesta-pro.mjs']]) {
    let total = 0;
    for (const f of grupo) {
      for (const l of llamadasDe(leerTexto(f))) {
        total++;
        ok(/signal\s*:/.test(l), `${f}: fetch sin tope de tiempo: ${l.slice(0, 80)}`);
      }
    }
    ok(total >= 1, `${grupo[0]}: no encuentro llamadas a fetch`);
  }

  // 9. parseArgs no se traga el siguiente flag como valor.
  const { parseArgs } = await import('../../scripts/ingest.mjs');
  const a = parseArgs(['--out', '--iconos', '/tmp/x', '--days', '7']);
  ok(a.out === true && a.iconos === '/tmp/x' && a.days === '7', `parseArgs: ${JSON.stringify(a)}`);

  // 10. El diagnóstico no lleva la URL vieja del repositorio escrita a mano:
  //     el repositorio se renombró y la URL escrita aquí daba 404 en la
  //     primera línea. Se mira el código SIN comentarios (la guarda anterior
  //     buscaba la palabra NOMBRE_PAQUETE y un comentario la pasaba) y además
  //     se EJECUTA el script para ver que arranca de verdad.
  const diag = leerTexto('scripts/diagnostico.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(!/['"`][^'"`\n]*mlbb-roam-picker/.test(diag), 'diagnostico.mjs vuelve a llevar el nombre del repositorio escrito a mano');
  ok(/GITHUB_REPOSITORY/.test(diag) && /\$\{NOMBRE_PAQUETE\}/.test(diag),
    'la URL de Pages ya no se deduce del entorno ni del nombre del paquete: un renombrado volvería a dar 404');
  const local = spawnSync(process.execPath, [resolve(RAIZ, 'scripts/diagnostico.mjs'), '--local'], {
    cwd: RAIZ, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'unduenno/un-repo-renombrado' },
  });
  eq(local.status, 0, `el diagnóstico local no arranca: ${(local.stderr || local.stdout || '').slice(-400)}`);
  ok(/public\/data \(local\)/.test(local.stdout), 'con --local el diagnóstico no dice que la fuente es local');

  // 11. El rival de línea NO pesa doble desde 2.0 (medido: −0.56 ± 0.62 frente
  //     a 0.78 ± 0.32 los otros). Esa comprobación se porta con el motor:
  //     pruebas/motor/modelo.test.mjs, «el rival marcado sigue pesando distinto».
});

await terminar('scripts/workflows');
