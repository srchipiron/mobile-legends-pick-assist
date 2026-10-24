/**
 * La base de datos de partidas de todos (3.69.0), en un Chrome de verdad
 * sobre la app compilada y con Supabase SIMULADO (pruebas/fixtures/
 * supabase-falso.mjs, las mismas respuestas que supabase/esquema.sql): sin
 * comunidad.json no se ve nada; con la casilla, tus partidas se suben solas
 * con tu clave y sin nada del lector ni el token de GitHub; quitar una la
 * borra allí; con tu clave en otro móvil te las traes; «Ver» mide las de
 * todos; borrar se lo lleva todo; y la Administración publica SOLO la
 * clave pública.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, abrirAjustes } from './navegador.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import { crearClaveDeAdministrador, sanearLicencias } from '../../src/app/licencia.js';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const SUPA = 'https://abcdefghijklmnopqrst.supabase.co';
const PUBLICA = 'sb_publishable_prueba1234567890';
const TOKEN = 'github_pat_PRUEBA_0123456789abcdefghij';
const LINEA = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };
const PARTIDAS = [
  { t: 1788000000000, pick: 'Tigreal', gane: true, rango: 'glory', recomendados: ['Tigreal', 'Atlas', 'Khufra'], lector: { ids: ['lectura-123'], baneos: ['Ling'], enemigos: [] }, draft: { linea: 'roam', enemigos: ['Layla'], aliados: [] } },
  { t: 1788003600000, pick: 'Atlas', gane: false, rango: 'glory', recomendados: ['Tigreal', 'Atlas', 'Khufra'] },
];
const leer = (pagina, clave) => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);
const esperar = async (cond, ms = 9000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 200)); } return cond(); };

/** comunidad.json (del origen de la app) y Supabase de pega, antes de cargar. */
const conBaseDeDatos = (s, config = { url: SUPA, clave: PUBLICA }, { retrasoMis = 0 } = {}) => async (p) => {
  await p.route(`${url}comunidad.json*`, (ruta) => (config ? ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) }) : ruta.fulfill({ status: 404, body: '' })));
  await p.route(`${SUPA}/**`, async (ruta) => {
    const r = ruta.request();
    const m = r.url().match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (r.method() === 'OPTIONS') { await ruta.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' } }); return; }
    // `retrasoMis`: la base de datos contesta DESPUÉS de llegar comunidad.json (en el móvil pasa).
    if (retrasoMis && m?.[1] === 'mis_partidas') await new Promise((res) => setTimeout(res, retrasoMis));
    const res = m ? s.atender(m[1], JSON.parse(r.postData() ?? '{}'), r.headers()) : { status: 404, cuerpo: {} };
    await ruta.fulfill({ status: res.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(res.cuerpo) });
  });
};
const abrirPartidas = async (pagina) => {
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Partidas', exact: true }).click(); await pagina.waitForTimeout(400);
};

await prueba('sin comunidad.json la sección no sale', async () => {
  const s = supabaseFalso();
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': PARTIDAS }, sinServiceWorker: true, antes: conBaseDeDatos(s, null) });
  await abrirPartidas(pagina);
  eq(await pagina.locator('.comunidad').count(), 0, 'sale sin base de datos configurada');
  eq(s.llamadas.length, 0);
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('con la casilla, tus partidas suben solas con tu clave, sin el lector ni el token; quitar una la borra allí', async () => {
  const s = supabaseFalso();
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': PARTIDAS, 'roam-picker:envio': { token: TOKEN } }, sinServiceWorker: true, antes: conBaseDeDatos(s) });
  await contexto.route('https://api.github.com/**', (ruta) => ruta.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ number: 7, html_url: 'https://github.com/x/y/issues/7' }) }));
  await pagina.waitForTimeout(4000);
  eq(s.llamadas.length, 0, 'sube sin haber puesto la casilla');
  await abrirPartidas(pagina);
  await pagina.getByRole('button', { name: 'Guardar mis partidas' }).click();
  ok(await esperar(() => s.llamadas.some((l) => l.funcion === 'subir_partidas')), 'con la casilla no sube');
  const sub = s.llamadas.find((l) => l.funcion === 'subir_partidas');
  eq(sub.args.lote.length, 2);
  eq(sub.cabeceras.apikey, PUBLICA, 'la clave pública no va como apikey');
  const texto = JSON.stringify(sub);
  ok(!texto.includes(TOKEN), 'el token de GitHub viaja a la base de datos');
  ok(!texto.includes('lectura-123') && !sub.args.lote.some((p) => 'lector' in p), 'sube lo del lector');
  const guardado = await leer(pagina, 'roam-picker:comunidad');
  ok(guardado?.activo && /^[A-Za-z0-9_-]{43}$/.test(guardado.clave) && sub.args.clave === guardado.clave, `la clave no cuadra: ${JSON.stringify(guardado)}`);
  ok(await esperar(async () => /2 partidas guardadas/.test(await pagina.locator('.comunidad').innerText())), 'no dice cuántas hay guardadas');
  eq(await pagina.locator('.comunidad-clave').inputValue(), guardado.clave, 'no enseña tu clave');
  const antes = s.llamadas.length;
  await pagina.getByRole('button', { name: 'Quitar esta partida · Tigreal' }).click();
  ok(await esperar(() => s.llamadas.length > antes, 12000), 'quitar una partida no sube nada');
  const ultima = s.llamadas.at(-1);
  ok(ultima.args.quitar.includes(PARTIDAS[0].t), `no manda borrar la quitada: ${JSON.stringify(ultima.args.quitar)}`);
  eq(s.jugadores.get(guardado.clave).partidas.size, 1, 'la quitada sigue en la base de datos');
  // Recargar no vuelve a subir lo mismo (al abrir sí LEE, para traer lo de la tablet: 3.70.0).
  const subidas = () => s.llamadas.filter((l) => l.funcion === 'subir_partidas').length;
  const n = subidas();
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(4500);
  eq(subidas(), n, 'al recargar sube lo mismo otra vez');
  // «Dejar de guardar»: corregir una partida ya no sube nada (la clave se queda para volver).
  await abrirPartidas(pagina);
  await pagina.getByRole('button', { name: 'Dejar de guardar' }).click();
  await pagina.getByRole('button', { name: /· Atlas$/ }).filter({ hasText: '⇄' }).click();
  await pagina.waitForTimeout(5000);
  eq(subidas(), n, 'sube con la casilla quitada');
  eq((await leer(pagina, 'roam-picker:comunidad')).clave, guardado.clave, 'dejar de guardar pierde la clave');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('con tu clave en otro móvil te traes tus partidas, «Ver» mide las de todos, y borrar se lo lleva todo', async () => {
  const s = supabaseFalso();
  const clave = 'Q'.repeat(43);
  s.atender('subir_partidas', { clave, lote: PARTIDAS.map(({ lector, ...p }) => p), quitar: [], referencia: { winRate: 0.5, partidas: 300 } }, { apikey: PUBLICA });
  s.atender('subir_partidas', { clave: 'R'.repeat(43), lote: [{ t: 1788000000001, pick: 'Chou', gane: true, recomendados: ['Chou'] }], quitar: [] }, { apikey: PUBLICA });
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: LINEA, sinServiceWorker: true, antes: conBaseDeDatos(s) });
  await abrirPartidas(pagina);
  await pagina.getByRole('textbox', { name: 'Tu clave de jugador' }).fill(clave);
  await pagina.getByRole('button', { name: 'Usar esta clave' }).click();
  ok(await esperar(async () => /2 partidas traídas/.test(await pagina.locator('.comunidad').innerText())), `no trae las partidas: ${await pagina.locator('.comunidad').innerText()}`);
  ok(await esperar(async () => (await leer(pagina, 'roam-picker:partidas'))?.length === 2), 'las traídas no se guardan en este móvil');
  eq((await leer(pagina, 'roam-picker:comunidad')).clave, clave, 'no se queda con la clave');
  await pagina.getByRole('button', { name: 'Ver con las partidas de todos' }).click();
  ok(await esperar(async () => /2 jugadores · 3 partidas/.test(await pagina.locator('.comunidad-informe').innerText().catch(() => ''))), 'el informe no cuenta a todos');
  pagina.once('dialog', (d) => d.accept());
  await pagina.getByRole('button', { name: 'Borrar mis partidas de la base de datos' }).click();
  ok(await esperar(() => !s.jugadores.has(clave)), 'borrar no borra en la base de datos');
  ok(await esperar(async () => (await leer(pagina, 'roam-picker:comunidad'))?.activo === false), 'tras borrar sigue activo');
  eq((await leer(pagina, 'roam-picker:partidas')).length, 2, 'borrar allí se lleva las de este móvil');
  eq(s.jugadores.size, 1, 'borra las de otro');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('lo que apuntó la tablet sola llega a la app al abrirla, sin repetir lo que ya hay ni resucitar lo quitado (3.70.0)', async () => {
  const s = supabaseFalso();
  const clave = 'T'.repeat(43);
  const deLaTablet = { t: 1788009000000, pick: 'Rafaela', gane: true, recomendados: ['Rafaela', 'Estes', 'Angela'], origen: 'lector', draft: { linea: 'roam', enemigos: ['Clint'], aliados: [] } };
  const quitada = { t: 1788009900000, pick: 'Diggie', gane: false, recomendados: ['Diggie'] };
  s.atender('subir_partidas', { clave, lote: [...PARTIDAS.map(({ lector, ...p }) => p), deLaTablet, quitada], quitar: [] }, { apikey: PUBLICA });
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...LINEA, 'roam-picker:partidas': PARTIDAS, 'roam-picker:olvidadas': [quitada.t], 'roam-picker:comunidad': { activo: true, clave, completo: true, config: { url: SUPA, clave: PUBLICA } } },
    sinServiceWorker: true, antes: conBaseDeDatos(s, undefined, { retrasoMis: 1500 }),
  });
  ok(await esperar(async () => (await leer(pagina, 'roam-picker:partidas'))?.length === 3), `la partida de la tablet no llega: ${JSON.stringify((await leer(pagina, 'roam-picker:partidas'))?.map((p) => p.t))}`);
  const ts = (await leer(pagina, 'roam-picker:partidas')).map((p) => p.t);
  ok(ts.includes(deLaTablet.t) && !ts.includes(quitada.t), 'resucita una partida quitada');
  eq(new Set(ts).size, ts.length, 'repite partidas');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('la Administración publica la dirección y la clave pública, y no deja publicar la secreta', async () => {
  const s = supabaseFalso();
  const admin = await crearClaveDeAdministrador();
  const puestas = [];
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...LINEA, 'roam-picker:envio': { token: TOKEN }, 'roam-picker:admin': admin },
    sinServiceWorker: true,
    antes: async (p) => {
      await conBaseDeDatos(s, null)(p);
      await p.route(`${url}licencias.json*`, (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sanearLicencias({ publica: admin.publica })) }));
    },
  });
  await contexto.route('https://api.github.com/**', async (ruta) => {
    const r = ruta.request();
    if (r.method() === 'PUT') { puestas.push({ url: r.url(), json: JSON.parse(Buffer.from(JSON.parse(r.postData()).content, 'base64').toString('utf8')) }); await ruta.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); return; }
    if (r.url().includes('licencias.json')) { await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 's', content: Buffer.from(JSON.stringify(sanearLicencias({ publica: admin.publica }))).toString('base64') }) }); return; }
    await ruta.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Administración' }).click(); await pagina.waitForTimeout(300);
  await pagina.getByRole('textbox', { name: 'Dirección del proyecto de Supabase' }).fill(SUPA);
  await pagina.getByRole('textbox', { name: 'Clave pública (publishable) de Supabase' }).fill('sb_secret_abcdefghij1234567890');
  ok(await pagina.locator('.admin-basedatos').isDisabled(), 'deja publicar la clave secreta');
  ok(/SECRETA/.test(await pagina.locator('.sheet-body').innerText()), 'no avisa de que es la secreta');
  await pagina.getByRole('textbox', { name: 'Clave pública (publishable) de Supabase' }).fill(PUBLICA);
  await pagina.locator('.admin-basedatos').click();
  ok(await esperar(() => puestas.length === 1), 'no publica comunidad.json');
  ok(puestas[0].url.endsWith('/contents/public/comunidad.json'), puestas[0].url);
  eq(JSON.stringify(puestas[0].json), JSON.stringify({ url: SUPA, clave: PUBLICA }));
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await navegador.close();
await cerrar();
await terminar('interfaz/comunidad');
