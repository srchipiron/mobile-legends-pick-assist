/**
 * El puente entre el lector de Termux y la app (3.25.0,
 * scripts/lector/servir.mjs): una captura de la pantalla del draft entra,
 * salen NOMBRES; solo para la app (y su copia local), nunca la imagen.
 */
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

await terminar('scripts/puente-lector');
