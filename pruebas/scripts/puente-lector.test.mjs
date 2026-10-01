/**
 * El puente entre el lector de Termux y la app (3.25.0,
 * scripts/lector/servir.mjs): una captura de la pantalla del draft entra,
 * salen NOMBRES; solo para la app (y su copia local), nunca la imagen.
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar } from '../arnes.mjs';
import { crearServidor, capturaAutomatica, origenPermitido, PUERTO } from '../../scripts/lector/servir.mjs';
import { carasGuardadas } from '../../scripts/lector/leer.mjs';
import { PUERTO_LECTOR } from '../../src/app/lector.js';
import { capturaCompletaPng, VERDAD } from '../fixtures/juego/captura.mjs';

const caras = carasGuardadas();
const png = capturaCompletaPng();

async function conServidor(opciones, fn) {
  const servidor = crearServidor({ caras, ...opciones });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { return await fn(base); } finally { servidor.close(); }
}

test('el puerto del lector es el que pide la app', () => {
  eq(PUERTO, PUERTO_LECTOR, 'servir.mjs escucha en un puerto y la app llama a otro');
});

test('solo la app publicada y su copia local pueden pedir lecturas', () => {
  ok(origenPermitido('https://srchipiron.github.io'), 'la app publicada no puede pedir');
  ok(origenPermitido('http://127.0.0.1:5173') && origenPermitido('http://localhost:4173'), 'la copia local no puede pedir');
  for (const o of ['https://evil.example', 'http://192.168.1.20:8000', 'https://srchipiron.github.io.evil.example', 'null']) ok(!origenPermitido(o), `${o} puede pedir lecturas`);
});

test('una lectura devuelve los nombres de la captura, con la cabecera para la app', async () => {
  await conServidor({ capturar: () => png }, async (base) => {
    const r = await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
    eq(r.status, 200, 'la lectura no responde 200');
    eq(r.headers.get('access-control-allow-origin'), 'https://srchipiron.github.io', 'sin la cabecera CORS la app no puede leer la respuesta');
    const l = await r.json();
    eq(l.tuyos.map((x) => x.nombre).join(), VERDAD.tuyos.join(), 'los baneos de tu equipo no salen');
    eq(l.suyos.map((x) => x.nombre).join(), VERDAD.suyos.join(), 'los baneos del enemigo no salen');
    eq(l.enemigos.map((x) => x.nombre ?? '?').join(), 'Clint,Khufra,?,?,?', 'los picks enemigos no salen');
    ok(!JSON.stringify(l).includes('rgba') && JSON.stringify(l).length < 4000, 'la respuesta lleva la imagen o algo más que nombres');
  });
});

test('otra web no recibe nada, la comprobación previa se contesta y un fallo de captura se dice', async () => {
  await conServidor({ capturar: () => png }, async (base) => {
    const ajena = await fetch(`${base}/leer`, { headers: { Origin: 'https://evil.example' } });
    eq(ajena.status, 403, 'una web ajena recibe la lectura');
    eq(ajena.headers.get('access-control-allow-origin'), null, 'una web ajena recibe la cabecera CORS');
    const previa = await fetch(`${base}/leer`, { method: 'OPTIONS', headers: { Origin: 'https://srchipiron.github.io' } });
    eq(previa.status, 204, 'la comprobación previa no se contesta');
    eq(previa.headers.get('access-control-allow-private-network'), 'true', 'la comprobación previa de red privada no se contesta');
    const estado = await (await fetch(`${base}/estado`)).json();
    ok(estado.ok, '/estado no dice que está vivo');
  });
  await conServidor({ capturar: () => { throw new Error('adb: device offline'); } }, async (base) => {
    const r = await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
    eq(r.status, 502, 'un fallo de captura no responde 502');
    eq((await r.json()).error, 'captura', 'un fallo de captura no se distingue');
  });
});

test('la captura automática busca la tablet sola, la recuerda y la vuelve a buscar si deja de contestar', async () => {
  const puertos = [40000, 41111];
  let busquedas = 0, capturas = [];
  const encontrar = async () => ({ ip: '10.0.0.5', puerto: puertos[busquedas++], via: 'wifi' });
  const memoria = {}, recordadas = [];
  const capturar = (d) => { capturas.push(d); if (d === '10.0.0.5:40000' && capturas.length > 1) throw new Error('device offline'); return png; };
  const auto = capturaAutomatica({ memoria, recordar: (m) => recordadas.push({ ...m }), encontrar, capturar });
  ok(Buffer.isBuffer(await auto()), 'la primera captura no sale');
  eq(`${busquedas} ${capturas.join(' ')}`, '1 10.0.0.5:40000', 'no busca la tablet la primera vez o captura de otra');
  eq(`${memoria.ip}:${memoria.puerto}`, '10.0.0.5:40000', 'no recuerda la tablet encontrada');
  eq(recordadas.length, 1, 'no guarda la memoria');
  // El puerto ha cambiado: la captura falla, se busca otra vez y sale con la nueva.
  ok(Buffer.isBuffer(await auto()), 'tras cambiar el puerto no vuelve a salir');
  eq(`${busquedas} ${capturas.slice(1).join(' ')}`, '2 10.0.0.5:40000 10.0.0.5:41111', 'al fallar la captura no busca la tablet otra vez');
  eq(memoria.puerto, 41111, 'no recuerda el puerto nuevo');
  // Con la tablet fijada a mano no se busca nada, y un fallo es un fallo.
  const fija = capturaAutomatica({ fija: '10.0.0.9:1', encontrar: async () => { throw new Error('no debía buscar'); }, capturar: () => { throw new Error('device offline'); } });
  const e = await fija().catch((x) => x);
  eq(e.message, 'device offline', `con --tablet fija hace otra cosa: ${e.message}`);
  // `preparar()` la busca al arrancar y el primer toque no espera a nada.
  let buscadaAntes = 0;
  const caliente = capturaAutomatica({ encontrar: async () => { buscadaAntes += 1; return { ip: '10.0.0.5', puerto: 1, via: 'memoria' }; }, capturar: () => png });
  caliente.preparar();
  await caliente();
  eq(buscadaAntes, 1, `preparar() y el primer toque buscan ${buscadaAntes} veces (una sola búsqueda compartida)`);
});

test('un hueco sin reconocer dice en Termux a qué se quedó más cerca', async () => {
  const lineas = [];
  await conServidor({ capturar: () => capturaCompletaPng({ conPicks: false }), registrar: (m) => lineas.push(m) }, async (base) => {
    await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
  });
  const linea = lineas.find((l) => /^Lectura 1/.test(l)) ?? '';
  ok(/enemigos \?\([A-Za-z.' -]+ 0\.\d\d\)/.test(linea), `la línea de Termux no dice el candidato y el parecido de un «?»: ${linea}`);
});

test('la app distingue «no veo la tablet» y «falta emparejar» de un fallo de captura', async () => {
  for (const tipo of ['tablet', 'emparejar']) {
    await conServidor({ capturar: async () => { throw Object.assign(new Error(tipo), { tipo }); } }, async (base) => {
      const r = await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
      eq(`${r.status} ${(await r.json()).error}`, `502 ${tipo}`, `un fallo «${tipo}» no llega a la app como tal`);
    });
  }
});

test('una corrección de la app guarda la verdad junto a la captura, aprende de las últimas y lo aprendido manda en la siguiente lectura', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-aprende-'));
  const tandas = [], guardadas = [];
  // El aprendizaje de pega: devuelve unos huecos imposibles (fuera de la columna), para ver que la lectura siguiente los usa.
  const aprender = async ({ pares, aprendido }) => { tandas.push({ pares, aprendido }); return { aprendido: { version: 1, picks: [[100, 100, 40], [100, 300, 40], [100, 500, 40], [100, 700, 40], [100, 900, 40]], caras: {}, capturas: (aprendido?.capturas ?? 0) + pares.length }, informe: [{ id: pares[0].id, aprendidos: [{ nombre: 'Clint', hueco: 0, parecido: 0.9, pos: [1, 2, 3] }], sinEncontrar: [], yaLeidos: [] }] }; };
  await conServidor({ capturar: () => png, carpeta, aprender, guardar: (a) => guardadas.push(a) }, async (base) => {
    const cab = { Origin: 'https://srchipiron.github.io' };
    const ids = [];
    for (let i = 0; i < 4; i++) { const l = await (await fetch(`${base}/leer`, { headers: cab })).json(); ids.push(l.id); }
    ok(ids.every((id) => /^lectura-/.test(id)) && new Set(ids).size === 4, `las lecturas no llevan id propio: ${ids}`);
    eq((await (await fetch(`${base}/leer`, { headers: cab })).json()).enemigos[0].nombre, 'Clint', 'antes de aprender no lee a Clint');
    // Sin origen (no es la app) no se escribe nada.
    const ajena = await fetch(`${base}/corregir`, { method: 'POST', body: JSON.stringify({ ids, enemigos: ['Clint'] }) });
    eq(ajena.status, 403, 'una corrección sin origen se acepta');
    const r = await (await fetch(`${base}/corregir`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...ids, 'lectura-que-no-existe', '../../etc'], enemigos: ['Clint', 'Khufra'], baneos: ['Hirara'] }) })).json();
    ok(r.aprendido && r.aprendidos.join() === 'Clint', `la corrección no aprende: ${JSON.stringify(r)}`);
    const ficheros = readdirSync(carpeta);
    eq(ficheros.filter((f) => f.endsWith('.verdad.json')).length, 4, `la verdad no se guarda junto a cada captura: ${ficheros}`);
    const verdad = JSON.parse(readFileSync(join(carpeta, `${ids[0]}.verdad.json`), 'utf8'));
    eq(verdad.enemigos.join(), 'Clint,Khufra', 'la verdad guardada no lleva los enemigos');
    eq(tandas.length, 1, 'no aprende una vez por corrección');
    eq(tandas[0].pares.length, 3, `aprende de ${tandas[0].pares.length} capturas y no de las 3 últimas`);
    eq(tandas[0].pares.map((p) => p.id).join(), ids.slice(1).join(), 'no aprende de las ÚLTIMAS capturas');
    eq(guardadas.length, 1, 'lo aprendido no se guarda en disco');
    // Con los huecos aprendidos (de pega, fuera de la columna) la lectura siguiente ya no ve a Clint: lo aprendido manda.
    const despues = await (await fetch(`${base}/leer`, { headers: cab })).json();
    ok(despues.enemigos.every((e) => !e.nombre), `la lectura siguiente no usa los huecos aprendidos: ${despues.enemigos.map((e) => e.nombre)}`);
    const estado = await (await fetch(`${base}/estado`)).json();
    eq(estado.aprendido.capturas, 3, '/estado no dice de cuántas capturas ha aprendido');
    // La segunda corrección acumula sobre lo aprendido.
    await fetch(`${base}/corregir`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(0, 1), enemigos: ['Clint'] }) });
    eq(tandas[1].aprendido.capturas, 3, 'la segunda tanda no parte de lo aprendido en la primera');
  });
});

await terminar('scripts/puente-lector');
