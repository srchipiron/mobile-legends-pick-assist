/**
 * La ingesta ejecutada DE VERDAD, como proceso: una vez contra una base
 * inalcanzable (que es lo que caza un error de programación al arrancar) y
 * tres veces contra una API simulada en local que sirve la FORMA real de las
 * respuestas.
 *
 * Se lanza `scripts/ingest.mjs` a propósito: es la entrada que llaman los
 * workflows, y la que tiene que arrancar `main` sin reventar. Lo que se mira
 * de dentro (el comparador) se importa de donde vive.
 *
 * NUNCA escribe en public/data: todas las corridas llevan `--out`, `--iconos`
 * y `--retratos` a un temporal. Sin eso, cada `npm test` ensuciaba el repo y,
 * como en el workflow las pruebas van antes de compilar, el diagnóstico
 * degradado era el que acababa publicado.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { comparar } from '../../scripts/comparar-ingesta.mjs';
import { huellaTexto } from '../../scripts/ingesta/extraccion.mjs';

const INGESTA = resolve(RAIZ, 'scripts/ingest.mjs');
const REAL = resolve(RAIZ, 'public/data/roam-meta.json');

/**
 * Lanza la ingesta y espera a que acabe. `spawn` y no `spawnSync`: la API
 * simulada vive en ESTE proceso, y una espera síncrona bloquearía el bucle de
 * eventos que tiene que responderle.
 */
const correrIngesta = (args) => new Promise((listo) => {
  const hijo = spawn(process.execPath, [INGESTA, ...args], { timeout: 120000 });
  let stdout = ''; let stderr = '';
  hijo.stdout.on('data', (b) => { stdout += b; });
  hijo.stderr.on('data', (b) => { stderr += b; });
  hijo.on('close', (status) => listo({ status, stdout, stderr }));
});

test('la ingesta entera recorre todos los endpoints contra una API simulada', async () => {
  // La prueba de abajo corre con la API caída, así que fetchEquipo,
  // fetchBuilds, fetchFichas y fetchRelations devuelven antes de ejecutarse:
  // un `RUTASX is not defined` dentro de cualquiera de ellas pasaba npm test
  // (probado por mutación) y en producción se tapaba solo, porque cada
  // endpoint que falla conserva lo anterior y el comparador no ve nada peor.
  // Aquí una API local sirve un esquema OpenAPI y respuestas con la FORMA de
  // la real, y se comprueba que lo que sale es lo que sirvió la API simulada,
  // no lo conservado.
  const pares = (n) => ({ data: { sub_hero: [
    { hero_name: 'Khufra', increase_win_rate: 0.0123 }, { hero_name: 'Tigreal', increase_win_rate: -0.02 },
    { hero_name: 'Alice', increase_win_rate: 0.01 }, { hero_name: 'Layla', increase_win_rate: 0.03 },
  ].slice(0, n) } });
  const imagen = (firma) => Buffer.concat([firma, Buffer.alloc(300)]);
  const PNG = imagen(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const JPG = imagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  const heroes = [
    { id: 1, name: 'Atlas', linea: 'Roam', rol: 'Tank' },
    { id: 2, name: 'Khufra', linea: 'Roam', rol: 'Tank' },
    { id: 3, name: 'Tigreal', linea: 'Roam', rol: 'Tank' },
  ];
  const parametros = (...n) => ({ get: { parameters: n.map((name) => ({ name, in: 'query' })) } });
  const esquema = { paths: {
    '/api/heroes/hero-rank/': parametros('rank', 'days', 'size', 'index'),
    '/api/heroes/hero-position/': parametros('size', 'index'),
    '/api/heroes/{hero_id}/': parametros('lang'),
    '/api/heroes/{hero_id}/counters': parametros('rank', 'days', 'size', 'index'),
    '/api/academy/heroes/{hero_id}/counters': parametros('rank', 'days', 'size', 'index'),
    '/api/heroes/{hero_id}/compatibility': parametros('rank', 'days', 'size', 'index'),
    '/api/equipment/expanded': parametros('size', 'index', 'lang'),
    '/api/equipment': parametros('size', 'index', 'lang'),
    '/api/heroes/{hero_id}/builds': parametros('lane', 'rank', 'size', 'index'),
  } };
  // Larga a proposito: la huella del texto solo cuenta cadenas de 40 o mas
  // caracteres una vez quitadas etiquetas, cifras y espacios. Con una corta,
  // la huella salia CONSERVADA del repositorio y la prueba pasaba sin mirar
  // lo servido (lo dijo la mutacion).
  const DESCRIPCION = 'Deals 300 <font color="x">Magic Damage</font> to enemies in a line and slows them by 40% for 1.5 seconds, then heals allies';
  const golpes = {};
  let fallaCounters = false;
  let fallaRecientes = false;
  let fallaDetail = false;
  let academyVacia = false;
  let fallosCountersPendientes = 0;
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const ruta = u.pathname;
    const marca = (k) => { golpes[k] = (golpes[k] ?? 0) + 1; };
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const bin = (b) => { res.setHeader('content-type', 'image/png'); res.end(b); };
    let m;
    if (/openapi\.json$/.test(ruta)) { marca('esquema'); return json(esquema); }
    if (ruta === '/api/heroes/hero-rank/') {
      // La ventana corta (days=3) se sirve DISTINTA a la de 7 para poder
      // comprobar que lo que sale es lo servido y no lo de siempre; y se
      // puede tirar sola, porque es un extra que no debe tumbar la corrida.
      const corta = u.searchParams.get('days') === '3';
      if (corta && fallaRecientes) { res.statusCode = 500; return res.end('{}'); }
      marca(`${corta ? 'rank3' : 'rank'}:${u.searchParams.get('rank')}`);
      return json({ code: 0, data: { records: heroes.map((h) => ({ data: {
        main_heroid: h.id, main_hero: { data: { name: h.name } },
        main_hero_win_rate: 0.5 + h.id / 100 + (corta ? 0.002 : 0), main_hero_appearance_rate: 0.01 * h.id, main_hero_ban_rate: 0.2,
      } })) } });
    }
    if (ruta === '/api/heroes/hero-position/') {
      marca('position');
      return json({ code: 0, data: { records: heroes.map((h) => ({ data: { hero_id: h.id, hero: { data: {
        name: h.name, roadsort: [{ data: { road_sort_title: h.linea } }], sortid: [{ data: { sort_title: h.rol } }],
      } } } })) } });
    }
    if ((m = ruta.match(/^\/api\/heroes\/([^/]+)\/$/))) {
      if (fallaDetail) { res.statusCode = 500; return res.end('{}'); }
      marca('detail');
      const h = heroes.find((x) => String(x.id) === m[1]) ?? heroes[0];
      return json({ code: 0, data: { hero: { data: {
        name: h.name, head: `http://127.0.0.1:${puerto}/img/${h.id}.jpg`, speciality: ['Guard', 'Crowd Control'],
        skill: { skilllist: [{ skilldesc: DESCRIPCION }] },
      } } } });
    }
    if (/^\/api\/(academy\/)?heroes\/[^/]+\/counters$/.test(ruta) && fallaCounters) { res.statusCode = 500; return res.end('{}'); }
    if (/^\/api\/heroes\/[^/]+\/counters$/.test(ruta)) {
      if (fallosCountersPendientes > 0) { fallosCountersPendientes -= 1; res.statusCode = 500; return res.end('{}'); }
      marca('counters'); return json(pares(2));
    }
    if (/^\/api\/academy\/heroes\/[^/]+\/counters$/.test(ruta)) { marca('academy'); return json(academyVacia ? { data: { sub_hero: [] } } : pares(4)); }
    if (/^\/api\/heroes\/[^/]+\/compatibility$/.test(ruta)) { marca('compat'); return json(pares(3)); }
    if (ruta === '/api/equipment/expanded') {
      marca('equipo');
      return json({ code: 0, data: { records: [{ data: {
        equipid: 90001, equipname: 'Objeto de Prueba', equiptypename: 'Defense',
        equipicon: `http://127.0.0.1:${puerto}/img/90001.png`,
        equiptips: '+18 Extra Magic Defense<br>+5 Extra Physical Defense', equipskill1: 'Reduces HP Regen effects by 50%',
      } }] } });
    }
    if (ruta === '/api/equipment') {
      marca('equipoCorto');
      return json({ code: 0, data: { records: [{ data: { equipid: 90001, equipname: 'Objeto de Prueba' } }, { data: { equipid: 90002, equipname: 'Segundo Objeto' } }] } });
    }
    if (/^\/api\/heroes\/[^/]+\/builds$/.test(ruta)) {
      marca(`builds:${u.searchParams.get('lane')}`);
      return json({ code: 0, data: [{ equipid: [90001, 90002, 90003], build_win_rate: 0.555, build_pick_rate: 0.1,
        emblem: { data: { emblemname: 'Tank' } }, battleskill: { data: { skillname: 'Flicker' } } }] });
    }
    // La tier list de mlbb.gg, en el mismo servidor con otra base (--tiers).
    if (ruta === '/api/v1/heroes') { marca('tiers'); return json(heroes.map((h) => ({ id: h.id, name: h.name }))); }
    if ((m = ruta.match(/^\/api\/v1\/heroes\/(\d+)$/))) { marca('tier'); return json({ id: Number(m[1]), name: heroes.find((x) => String(x.id) === m[1])?.name, tier: m[1] === '1' ? 'S' : 'B' }); }
    if (ruta.startsWith('/img/')) { marca('img'); return bin(ruta.endsWith('.jpg') ? JPG : PNG); }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const puerto = srv.address().port;

  const dir = mkdtempSync(resolve(tmpdir(), 'ingesta-simulada-'));
  const out = resolve(dir, 'roam-meta.json');
  const antes = Date.now();
  try {
    const r = await correrIngesta([
      '--base', `http://127.0.0.1:${puerto}/api`,
      '--ranks', 'mythic,glory', '--rank', 'glory', '--pausa', '0', '--out', out, '--tiers', `http://127.0.0.1:${puerto}/api/v1`,
      '--iconos', resolve(dir, 'objetos'), '--retratos', resolve(dir, 'heroes'),
    ]);
    const salida = `${r.stdout}\n${r.stderr}`;
    eq(r.status, 0, `la ingesta simulada acaba con código ${r.status}: ${salida.slice(-600)}`);
    ok(!/is not defined|is not a function|Cannot read|TypeError|ReferenceError/.test(salida),
      `error de programación en la ingesta: ${salida.split('\n').find((l) => /is not|TypeError|ReferenceError/.test(l))}`);
    ok(!/fallo \(/.test(salida), `algún endpoint falló contra la API simulada: ${salida.split('\n').filter((l) => /fallo \(/.test(l)).join(' | ')}`);

    // Cada endpoint que la ingesta conoce se ha llamado. Si uno deja de
    // llamarse, la app se queda con el dato conservado sin que nadie lo vea.
    for (const k of ['esquema', 'rank:mythic', 'rank:glory', 'rank3:glory', 'position', 'detail', 'counters', 'academy', 'compat', 'equipo', 'equipoCorto', 'builds:roam', 'img', 'tiers', 'tier']) {
      ok(golpes[k] > 0, `la ingesta no ha llamado a ${k}: ${JSON.stringify(golpes)}`);
    }

    // Y lo que sale es lo que sirvió la API simulada, no lo conservado del
    // repositorio: esa es la diferencia entre "no reventó" y "funciona".
    const d = JSON.parse(readFileSync(out, 'utf8'));
    ok(Date.parse(d.generatedAt) >= antes - 1000, `la fecha no es la de esta corrida: ${d.generatedAt}`);
    eq(d.diagnostics.conservado, false, 'dice que conserva teniendo datos nuevos');
    ok(d.diagnostics.frescos.includes('glory') && d.diagnostics.frescos.includes('mythic'), `rangos frescos: ${d.diagnostics.frescos}`);
    eq(d.stats.Atlas?.winRate, 0.51, `winrate de Atlas: ${JSON.stringify(d.stats.Atlas)}`);
    eq(d.statsByRank.mythic?.Khufra?.winRate, 0.52, 'las estadísticas por rango no son las servidas');
    // La ventana corta: pedida, guardada aparte y con lo que sirvió la API
    // (0.512 y no 0.51), sin pisar la de 7 días.
    eq(d.recientes?.dias, 3, `la ventana corta no se guarda: ${JSON.stringify(d.recientes)}`);
    eq(d.recientes?.statsByRank?.glory?.Atlas?.winRate, 0.512, `la ventana corta no es la servida: ${JSON.stringify(d.recientes?.statsByRank?.glory?.Atlas)}`);
    eq(d.stats.Atlas?.winRate, 0.51, 'la ventana corta ha pisado a la de 7 días');
    // La tier list: la servida, casada por nombre, y la huella del texto de la ficha.
    eq(d.tiers?.tiers?.Atlas, 'S', `la tier de Atlas no es la servida: ${JSON.stringify(d.tiers)}`);
    eq(d.tiers?.tiers?.Khufra, 'B', 'la tier de Khufra no es la servida');
    const atlas = d.heroes.find((h) => h.name === 'Atlas');
    ok(atlas && atlas.id === 1 && atlas.role === 'tank' && atlas.lanes.includes('roam'), `ficha de Atlas: ${JSON.stringify(atlas)}`);
    eq(atlas?.damage?.magico, 1, `tipo de daño de Atlas: ${JSON.stringify(atlas?.damage)}`);
    eq(atlas?.kitTexto, huellaTexto({ skilldesc: DESCRIPCION }), `la huella del texto no es la de la ficha SERVIDA: ${atlas?.kitTexto}`);
    eq(d.counters.Atlas?.Khufra, 0.5123, `cruce Atlas→Khufra: ${JSON.stringify(d.counters.Atlas)}`);
    eq(d.counters.Atlas?.Layla, 0.53, 'no ha elegido la ruta con MÁS cruces (academy trae 4, la del esquema 2)');
    ok(/^4 pares .*academy/.test(d.diagnostics.rutasMedidas?.counter ?? ''), `rutas medidas: ${JSON.stringify(d.diagnostics.rutasMedidas)}`);
    eq(d.synergies.Atlas?.Tigreal, 0.48, `pareja Atlas+Tigreal: ${JSON.stringify(d.synergies.Atlas)}`);
    const obj = d.equipment?.['90001'];
    ok(obj && obj.nombre === 'Objeto de Prueba' && obj.magica === 18 && obj.fisica === 5 && obj.tipo === 'Defense', `objeto servido: ${JSON.stringify(obj)}`);
    ok((obj?.efectos ?? []).includes('antiCuracion'), `efectos del objeto: ${JSON.stringify(obj?.efectos)}`);
    eq(d.equipment?.['90002']?.nombre, 'Segundo Objeto', 'la ruta corta de objetos no se funde con la larga');
    const build = d.builds?.Atlas?.roam?.[0];
    ok(build && build.objetos.join(',') === '90001,90002,90003' && build.emblema === 'Tank' && build.hechizo === 'Flicker', `build de Atlas: ${JSON.stringify(build)}`);
    eq(build?.winRate, 0.555, `winrate de la build: ${build?.winRate}`);
    ok(existsSync(resolve(dir, 'objetos', '90001.png')), 'no ha bajado el icono del objeto');
    ok(existsSync(resolve(dir, 'heroes', '1.jpg')), 'no ha bajado el retrato de Atlas');
    for (const [k, v] of Object.entries({ speciality: d.diagnostics.speciality?.errores, builds: d.diagnostics.builds?.errores, relations: d.diagnostics.relations?.errores })) {
      ok(!(v ?? []).length, `errores de ${k} contra la API simulada: ${JSON.stringify(v)}`);
    }

    // Segunda corrida con la ruta de counters CAÍDA: estadísticas frescas
    // pero matriz de otro día. Antes salía con la fecha de hoy, pasaba el
    // comparador (mismos recuentos) y la puerta de 72 h del despliegue.
    fallaCounters = true; fallaRecientes = true;
    const out2 = resolve(dir, 'sin-counters.json');
    const r2 = await correrIngesta([
      '--base', `http://127.0.0.1:${puerto}/api`,
      '--ranks', 'glory', '--rank', 'glory', '--pausa', '0', '--out', out2, '--tiers', `http://127.0.0.1:${puerto}/api/v1`,
      '--iconos', resolve(dir, 'objetos'), '--retratos', resolve(dir, 'heroes'),
    ]);
    eq(r2.status, 0, `la ingesta sin counters no acaba bien: ${(r2.stdout + r2.stderr).slice(-400)}`);
    const guardada = JSON.parse(readFileSync(REAL, 'utf8'));
    const d2 = JSON.parse(readFileSync(out2, 'utf8'));
    eq(d2.generatedAt, guardada.generatedAt, 'con la matriz conservada la corrida se fecha como si fuera nueva');
    eq(d2.diagnostics.conservado, true, 'no dice que conserva la matriz');
    // Con la ventana corta caída no se conserva la de ayer (unos «recientes»
    // viejos son peores que ninguno): simplemente no va, y la app cae a 7.
    ok(d2.recientes === undefined, `la ventana corta caída sale conservada o inventada: ${JSON.stringify(d2.recientes)}`);
    ok(/fallo:/.test(d2.diagnostics.recientes?.glory ?? ''), `el diagnóstico no dice que la ventana corta falló: ${JSON.stringify(d2.diagnostics.recientes)}`);
    eq(d2.diagnostics.frescosRecursos?.relaciones, 0, `cuenta relaciones frescas sin haberlas descargado: ${JSON.stringify(d2.diagnostics.frescosRecursos)}`);
    const atlasAntes = JSON.stringify(guardada.counters?.Atlas ?? null);
    ok(atlasAntes !== 'null' && JSON.stringify(d2.counters?.Atlas) === atlasAntes, 'la fila de Atlas no se conserva héroe a héroe');
    ok(comparar(d2, guardada).peores.some((p) => p.clave === 'relacionesFrescas'), 'el comparador acepta una corrida que no ha descargado la matriz');

    // Tercera corrida: la ficha de los héroes caída (speciality se conserva
    // de la corrida anterior, que se pasa con --previo), la ruta principal
    // de counters falla UNA vez al sondear y la alternativa trae CERO pares:
    // antes 0 > -1 cambiaba la ruta por la vacía y la matriz entera salía
    // conservada.
    fallaCounters = false; fallaRecientes = false; fallaDetail = true; academyVacia = true; fallosCountersPendientes = 1;
    const out3 = resolve(dir, 'ficha-caida.json');
    const r3 = await correrIngesta([
      '--base', `http://127.0.0.1:${puerto}/api`,
      '--ranks', 'glory', '--rank', 'glory', '--pausa', '0', '--out', out3, '--previo', out, '--tiers', `http://127.0.0.1:${puerto}/api/v1`,
      '--iconos', resolve(dir, 'objetos'), '--retratos', resolve(dir, 'heroes'),
    ]);
    eq(r3.status, 0, `la tercera corrida no acaba bien: ${(r3.stdout + r3.stderr).slice(-400)}`);
    const d3 = JSON.parse(readFileSync(out3, 'utf8'));
    const atlas3 = d3.heroes.find((h) => h.name === 'Atlas');
    ok(atlas3?.speciality?.includes('Guard'), `con la ficha caída la speciality no se conserva: ${JSON.stringify(atlas3?.speciality)}`);
    eq(atlas3?.kitTexto, huellaTexto({ skilldesc: DESCRIPCION }), 'con la ficha caída la huella del texto no se conserva de la corrida anterior: avisaría de un rework falso');
    ok(/^2 pares /.test(d3.diagnostics.rutasMedidas?.counter ?? '') && !/academy/.test(d3.diagnostics.rutasMedidas?.counter ?? ''),
      `un fallo suelto al sondear cambió la ruta de counters por una vacía: ${d3.diagnostics.rutasMedidas?.counter}`);
    eq(d3.counters.Atlas?.Khufra, 0.5123, 'la matriz no se descargó por la ruta buena tras el fallo suelto');
    eq(d3.diagnostics.frescosRecursos?.relaciones > 100, true, `relaciones frescas: ${JSON.stringify(d3.diagnostics.frescosRecursos)}`);
  } finally {
    srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la ingesta arranca sin errores de programación', async () => {
  // Comprobar solo la sintaxis no basta: un `ROUTES is not defined` pasaba
  // node --check y reventaba en la primera línea, dejando los datos congelados
  // en silencio porque el workflow lleva continue-on-error.

  // A un temporal, nunca a public/data. Esta corrida falla a proposito y su
  // salida es peor que los datos buenos: mismos numeros, pero un diagnostico
  // que dice que solo se resolvio un rango. Escribiendo en su sitio ensuciaba
  // el repo en cada npm test y, como en el workflow las pruebas van antes de
  // compilar, ese diagnostico degradado era el que acababa publicado.
  // Se copia el fichero real para que la ingesta encuentre su "previous" y la
  // prueba recorra el mismo camino que una corrida de verdad.
  const dir = mkdtempSync(resolve(tmpdir(), 'ingesta-'));
  const out = resolve(dir, 'roam-meta.json');
  if (existsSync(REAL)) copyFileSync(REAL, out);

  try {
    const r = await correrIngesta(['--base', 'http://127.0.0.1:1/api', '--ranks', 'mythic', '--out', out]);
    const salida = `${r.stdout}\n${r.stderr}`;
    eq(r.status, 0, `la ingesta contra una base inalcanzable acaba con código ${r.status}: ${salida.slice(-400)}`);

    ok(!/is not defined|is not a function|Cannot read/.test(salida),
      `error de programación en la ingesta: ${salida.split('\n').find((l) => /is not/.test(l))}`);
    ok(salida.includes('Escrito'), 'no llega a escribir el fichero cuando la red falla');

    // Con la API caida la corrida conserva lo anterior, y eso tiene que
    // notarse: la fecha es la de los datos conservados (no la de hoy) y el
    // comparador la rechaza por no traer nada nuevo. Sin esto, el bot
    // commiteaba los datos de ayer con la fecha de hoy y la puerta de
    // frescura del despliegue (72 h) no saltaba nunca.
    if (existsSync(REAL)) {
      const guardada = JSON.parse(readFileSync(REAL, 'utf8'));
      const nueva = JSON.parse(readFileSync(out, 'utf8'));
      eq(nueva.generatedAt, guardada.generatedAt, 'una corrida sin red se fecha como si trajera datos nuevos');
      eq(nueva.diagnostics?.conservado, true, 'la corrida no dice que conserva lo anterior');
      const veredicto = comparar(nueva, guardada);
      ok(veredicto.peores.some((p) => p.clave === 'rangoFresco'),
        `el comparador acepta una corrida que no ha descargado nada: ${JSON.stringify(veredicto.peores)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await terminar('scripts/ingesta-simulada');
