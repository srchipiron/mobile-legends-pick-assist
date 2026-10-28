/**
 * `scripts/medir-lector.mjs` (3.82.0): los recortes de la tablet contra la
 * partida de verdad (con lo que se arregla después en el historial), y las
 * caras de compañero confirmadas que aún no van de serie.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { medirRecortes, informeLector } from '../../scripts/medir-lector.mjs';
import { recorteDePicks } from '../../scripts/lector/recortes.mjs';
import { capturaCompleta, VERDAD } from '../fixtures/juego/captura.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import { bajarRecortes } from '../../src/app/basedatos.js';

const T = 1793140000000;
const picks = recorteDePicks(capturaCompleta({ columna: 2 }));
// La verdad, arreglada en el historial: el quinto rival era Layla (en la captura sale Aamon).
const partida = { t: T, pick: VERDAD.tuyo, gane: true, editada: T + 1, draft: { linea: 'roam', enemigos: [...VERDAD.enemigos2.slice(0, 4), 'Layla'], aliados: VERDAD.aliados.slice(0, 4) } };
const recortes = [
  { j: 1, d: { v: 1, partida: T, capturas: [{ id: 'lectura-2026-10-27T22-20-00-000Z-1', picks, tuyoFila: VERDAD.tuyoFila }] } },
  { j: 1, d: { v: 1, tipo: 'final', desde: T, capturas: [{ id: 'fotograma-1', miniatura: 'iVBORw0KGgo=' }] } },
  { j: 1, d: { v: 1, partida: 1, capturas: [{ id: 'lectura-x', picks, tuyoFila: 4 }] } },
];

test('cada recorte contra su partida de verdad: lo que se lee, lo que falta y lo leído de más', () => {
  const m = medirRecortes({ recortes, partidas: [partida], aprender: () => ({ aprendido: null }) });
  ok(m.recortes === 2 && m.finales === 1 && m.sinPartida === 1 && m.drafts.length === 1, JSON.stringify({ ...m, drafts: undefined }));
  eq(JSON.stringify(m.rivales), JSON.stringify({ leidos: 4, de: 5, falsos: 1 }), 'los rivales no cuadran (cuatro leídos, Layla falta, Aamon de más)');
  eq(JSON.stringify(m.aliados), JSON.stringify({ leidos: 4, de: 4, falsos: 0 }), 'los compañeros no cuadran');
  eq(JSON.stringify(m.tuFila), JSON.stringify({ leidos: 1, de: 1 }), 'tu fila no cuadra');
  eq(JSON.stringify(m.faltan), JSON.stringify({ Layla: 1 }));
  ok(m.drafts[0].editada && m.drafts[0].faltan.join() === 'Layla', JSON.stringify(m.drafts[0]));
  ok(/Rivales leídos: 4 de 5 \(80%\), 1 de más/.test(informeLector(m)), informeLector(m));
  // El pick supuesto no es tu fila de verdad.
  eq(medirRecortes({ recortes, partidas: [{ ...partida, supuesto: true }], aprender: () => ({ aprendido: null }) }).tuFila.de, 0, 'cuenta tu fila con un pick supuesto');
  // Con datos raros no lanza.
  eq(medirRecortes({ recortes: [null, { d: 'x' }, { d: { partida: T, capturas: [{ id: 'y', picks: 'no-es-png' }] } }], partidas: [partida, null] }).drafts[0].capturas, 0);
});

test('las candidatas: las caras de compañero que el aprendizaje confirma y no van de serie, listas para caras-panel.json', () => {
  const aprendido = { aliados: { Gord: [{ v: 'AAAA', de: 'lectura-1' }], Hanabi: [{ v: 'BBBB', de: 'lectura-2026-10-27T22-20-00-000Z-1' }, { v: 'CCCC', de: 'lectura-2026-10-26T20-00-00-000Z-1' }] } };
  const llamadas = [];
  const m = medirRecortes({ recortes, partidas: [partida], aprender: (pares, o) => { llamadas.push({ pares, o }); return { aprendido }; } });
  ok(llamadas.length === 1 && llamadas[0].pares[0].verdad.enemigos.includes('Layla') && llamadas[0].pares[0].img?.ancho === 2400, 'no repite el aprendizaje con la captura devuelta a su sitio y la verdad arreglada');
  eq(m.candidatas.map((c) => c.nombre).join(), 'Hanabi,Hanabi', 'propone una que ya va de serie (Gord) o se deja alguna');
  ok(m.candidatas.every((c) => c.panel === 'aliados' && c.v && /recorte de la tablet lectura-/.test(c.fuente)), JSON.stringify(m.candidatas));
  ok(/Hanabi/.test(informeLector(m)), informeLector(m));
});

await test('los recortes se bajan de la base de datos (recortes_recientes)', async () => {
  const s = supabaseFalso();
  const config = { url: 'https://abcdefghijklmnopqrst.supabase.co', clave: s.clavePublica };
  s.atender('subir_recorte', { clave: 'k'.repeat(43), recorte: recortes[0].d }, { apikey: s.clavePublica });
  const r = await bajarRecortes(config, { horas: 24, fetch: s.fetch });
  ok(!r.error && r.recortes.length === 1 && r.recortes[0].d.partida === T, JSON.stringify(r).slice(0, 200));
});

await terminar('scripts/medir-lector');
