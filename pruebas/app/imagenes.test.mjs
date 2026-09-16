/**
 * Las imágenes que la app va a pedir: iconos de objeto (`public/objetos/{id}.png`)
 * y caras de héroe (`public/heroes/{id}.jpg`). Si falta una, el hueco se quita
 * solo y queda el texto —no se rompe la pantalla—, así que un fallo aquí es
 * invisible desde el móvil: es justo lo que estas pruebas se encargan de ver.
 *
 * Y que la ingesta las escriba DONDE SE LE DICE, no en el repositorio.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test, ok, eq, terminar, RAIZ, leerJson } from '../arnes.mjs';

test('los iconos que la app va a pedir existen de verdad', () => {
  const meta = leerJson('public/data/roam-meta.json');
  if (!Object.keys(meta.builds ?? {}).length) return;

  // El <img> pide ./objetos/{id}.png. Si el fichero no está, el hueco se quita
  // solo y queda el nombre -no se rompe la pantalla-, pero es un icono menos
  // sin que nadie se entere. Aqui se entera.
  const pedidos = new Set();
  for (const porLinea of Object.values(meta.builds)) {
    for (const lista of Object.values(porLinea)) {
      for (const b of lista) for (const id of b.objetos ?? []) pedidos.add(id);
    }
  }
  const faltan = [...pedidos].filter((id) => !existsSync(resolve(RAIZ, `public/objetos/${id}.png`)));
  ok(faltan.length <= pedidos.size * 0.05,
    `faltan ${faltan.length} iconos de ${pedidos.size}: ${faltan.slice(0, 6).join(', ')}`);
});

test('los retratos que la app va a pedir existen de verdad', () => {
  const meta = leerJson('public/data/roam-meta.json');
  const conRetrato = (meta.heroes ?? []).filter((h) => h.retrato);
  if (!conRetrato.length) return; // todavia sin retratos

  const faltan = conRetrato.filter((h) => !existsSync(resolve(RAIZ, `public/heroes/${h.id}.jpg`)));
  ok(faltan.length <= conRetrato.length * 0.05,
    `faltan ${faltan.length} retratos de ${conRetrato.length}: ${faltan.slice(0, 6).map((h) => h.name).join(', ')}`);

  // Y que sean el retrato pequeño, no el dibujo de cuerpo entero: ese pesa
  // 165 KB por heroe, veintidos megas para los 133, y el repositorio se
  // clona desde un movil.
  const pesos = conRetrato
    .filter((h) => existsSync(resolve(RAIZ, `public/heroes/${h.id}.jpg`)))
    .map((h) => statSync(resolve(RAIZ, `public/heroes/${h.id}.jpg`)).size);
  const medio = pesos.reduce((a, b) => a + b, 0) / pesos.length;
  ok(medio < 60 * 1024, `los retratos pesan ${Math.round(medio / 1024)} KB de media: se ha colado la imagen grande`);
});

test('la ingesta no escribe las imagenes en el repositorio cuando va a un temporal', async () => {
  // Mismo fallo que ya costo una version con los datos: la prueba que ejecuta
  // la ingesta escribia en public/data y ensuciaba el repo en cada npm test.
  // Las imagenes tienen que ir donde digan --iconos y --retratos, no a su
  // sitio por defecto.
  //
  // Esto se comprueba EJECUTANDO la ingesta contra una API simulada, no
  // buscando `args.iconos` en un fichero: desde que la ingesta se partió en
  // módulos, `scripts/ingest.mjs` tiene 39 líneas y una prueba de texto sobre
  // él pasaría vacía. Y el objeto que sirve la API simulada (90001) NO está en
  // public/objetos, así que si la ruta no fuera configurable aparecería allí.
  const imagen = (firma) => Buffer.concat([firma, Buffer.alloc(300)]);
  const PNG = imagen(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const JPG = imagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  const heroes = [
    { id: 1, name: 'Atlas', linea: 'Roam', rol: 'Tank' },
    { id: 2, name: 'Khufra', linea: 'Roam', rol: 'Tank' },
  ];
  const parametros = (...n) => ({ get: { parameters: n.map((name) => ({ name, in: 'query' })) } });
  const esquema = { paths: {
    '/api/heroes/hero-rank/': parametros('rank', 'days', 'size', 'index'),
    '/api/heroes/hero-position/': parametros('size', 'index'),
    '/api/heroes/{hero_id}/': parametros('lang'),
    '/api/heroes/{hero_id}/counters': parametros('rank', 'days', 'size', 'index'),
    '/api/heroes/{hero_id}/compatibility': parametros('rank', 'days', 'size', 'index'),
    '/api/equipment/expanded': parametros('size', 'index', 'lang'),
    '/api/heroes/{hero_id}/builds': parametros('lane', 'rank', 'size', 'index'),
  } };
  let puerto = 0;
  const srv = createServer((req, res) => {
    const ruta = new URL(req.url, 'http://x').pathname;
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    let m;
    if (/openapi\.json$/.test(ruta)) return json(esquema);
    if (ruta === '/api/heroes/hero-rank/') {
      return json({ code: 0, data: { records: heroes.map((h) => ({ data: {
        main_heroid: h.id, main_hero: { data: { name: h.name } },
        main_hero_win_rate: 0.5 + h.id / 100, main_hero_appearance_rate: 0.01 * h.id, main_hero_ban_rate: 0.2,
      } })) } });
    }
    if (ruta === '/api/heroes/hero-position/') {
      return json({ code: 0, data: { records: heroes.map((h) => ({ data: { hero_id: h.id, hero: { data: {
        name: h.name, roadsort: [{ data: { road_sort_title: h.linea } }], sortid: [{ data: { sort_title: h.rol } }],
      } } } })) } });
    }
    if ((m = ruta.match(/^\/api\/heroes\/([^/]+)\/$/))) {
      const h = heroes.find((x) => String(x.id) === m[1]) ?? heroes[0];
      return json({ code: 0, data: { hero: { data: {
        name: h.name, head: `http://127.0.0.1:${puerto}/img/${h.id}.jpg`, speciality: ['Guard'],
        skill: { skilllist: [{ skilldesc: 'Deals <font color="x">Magic Damage</font> to enemies' }] },
      } } } });
    }
    if (/^\/api\/heroes\/[^/]+\/(counters|compatibility)$/.test(ruta)) {
      return json({ data: { sub_hero: [{ hero_name: 'Khufra', increase_win_rate: 0.01 }] } });
    }
    if (ruta === '/api/equipment/expanded') {
      return json({ code: 0, data: { records: [{ data: {
        equipid: 90001, equipname: 'Objeto de Prueba', equiptypename: 'Defense',
        equipicon: `http://127.0.0.1:${puerto}/img/90001.png`,
        equiptips: '+18 Extra Magic Defense', equipskill1: 'x',
      } }] } });
    }
    if (/^\/api\/heroes\/[^/]+\/builds$/.test(ruta)) {
      return json({ code: 0, data: [{ equipid: [90001], build_win_rate: 0.55, build_pick_rate: 0.1,
        emblem: { data: { emblemname: 'Tank' } }, battleskill: { data: { skillname: 'Flicker' } } }] });
    }
    if (ruta.startsWith('/img/')) { res.setHeader('content-type', 'image/png'); return res.end(ruta.endsWith('.jpg') ? JPG : PNG); }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  puerto = srv.address().port;

  // Nombre Y tamaño: con solo los nombres, una ingesta que ignorase
  // `--retratos` SOBRESCRIBIRÍA `public/heroes/1.jpg` con el JPG falso de la
  // API simulada, `limpiar()` no lo vería y la prueba dejaría el repositorio
  // con una imagen corrupta. Es justo lo que este fichero existe para evitar.
  const tamanos = (d) => new Map(readdirSync(resolve(RAIZ, d)).map((f) => [f, statSync(resolve(RAIZ, d, f)).size]));
  const antes = new Map([['public/objetos', tamanos('public/objetos')], ['public/heroes', tamanos('public/heroes')]]);
  /**
   * Lo que haya aparecido en el repositorio, y lo borra: una prueba que
   * ensucia el repo es justo lo que esta prueba existe para evitar. Se llama
   * también desde el `finally`, así que limpia aunque falle otra aserción.
   */
  const limpiar = () => {
    const tocados = [];
    for (const [d, previos] of antes) {
      for (const f of readdirSync(resolve(RAIZ, d))) {
        const ruta = resolve(RAIZ, d, f);
        if (!previos.has(f)) {
          tocados.push(`${d}/${f} (nuevo)`);
          rmSync(ruta, { force: true });
          continue;
        }
        // Pisado: no se puede deshacer desde aquí, pero tiene que NOMBRARSE
        // para poder recuperarlo con `git checkout`.
        if (statSync(ruta).size !== previos.get(f)) tocados.push(`${d}/${f} (PISADO: recupéralo con git checkout)`);
      }
    }
    return tocados;
  };
  const dir = mkdtempSync(resolve(tmpdir(), 'ingesta-imagenes-'));
  try {
    const r = await new Promise((listo) => {
      const hijo = spawn(process.execPath, [resolve(RAIZ, 'scripts/ingest.mjs'),
        '--base', `http://127.0.0.1:${puerto}/api`,
        '--ranks', 'glory', '--rank', 'glory', '--pausa', '0',
        '--out', resolve(dir, 'roam-meta.json'),
        '--iconos', resolve(dir, 'objetos'), '--retratos', resolve(dir, 'heroes'),
      ], { timeout: 120000 });
      let salida = '';
      hijo.stdout.on('data', (b) => { salida += b; });
      hijo.stderr.on('data', (b) => { salida += b; });
      hijo.on('close', (status) => listo({ status, salida }));
    });
    eq(r.status, 0, `la ingesta acaba con código ${r.status}: ${r.salida.slice(-500)}`);

    // El repositorio está exactamente igual que antes...
    const escritos = limpiar();
    ok(!escritos.length, `la ingesta ha escrito imágenes en el repositorio teniendo un temporal: ${escritos.join(', ')}`);

    // ...y las imágenes están donde se le dijo. Las dos mitades hacen falta:
    // los retratos 1.jpg y 2.jpg YA están en public/heroes, así que una
    // ingesta que ignorara --retratos no descargaría nada y no ensuciaría
    // nada; lo que la delata es el temporal vacío.
    ok(existsSync(resolve(dir, 'objetos', '90001.png')), 'el icono no ha ido a --iconos: la ruta no es configurable');
    ok(existsSync(resolve(dir, 'heroes', '1.jpg')), 'el retrato no ha ido a --retratos: la ruta no es configurable');
  } finally {
    srv.close();
    limpiar();
    rmSync(dir, { recursive: true, force: true });
  }
});

await terminar('app/imagenes');
