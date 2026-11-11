/**
 * El resultado DUDOSO (3.100.0, registro.js `esDudosa`): del 26 de octubre al
 * 10 de noviembre de 2026 la tablet apuntó 132 victorias de 135. Ninguna
 * medida de «si ganaste» puede contarlas hasta que se arreglen después, y
 * todas las que hay pasan por aquí: si añades una que mire `gane`, añádela.
 */
import { test, ok, eq, terminar, leerJson } from '../arnes.mjs';
import { esDudosa, conResultado, DUDOSAS_DESDE, DUDOSAS_HASTA, resumen, calibracion, ajustePersonal, medirFasesMias } from '../../src/motor/registro.js';
import { evolucion, porCompaneros, porLinea, porDia, conLaApp } from '../../src/motor/analitica.js';
import { tusNumeros, tuSemana } from '../../src/motor/habitos.js';
import { medirComunidad } from '../../src/motor/comunidad.js';
import { prepararDatos, revisarDrafts } from '../../src/motor/draft.js';

const DIA = 86400000;
const enemigos = ['Clint', 'Khufra', 'Layla', 'Fanny', 'Eudora'];
const aliados = ['Gord', 'Selena', 'Kadita', 'Hanabi'];
const fases = [0.5, 0.51, 0.52, 0.5, 0.49, 0.48];
const partida = (t, gane, extra = {}) => ({ t, pick: 'Diggie', gane, rango: 'glory', recomendados: ['Diggie', 'Estes', 'Floryn'], estimacion: 0.55, modelo: 5, duracion: 14, fases, draft: { linea: 'roam', enemigos, aliados }, ...extra });
// Las de antes del lector roto y las de después: mitad y mitad, a mano y del lector.
const fiables = [];
// Con dos picks (para este draft, Diggie deja «uno claramente mejor» y Minotaur no): la revisión del draft compara las dos.
for (let i = 0; i < 40; i++) fiables.push(partida(DUDOSAS_DESDE - (i + 1) * DIA / 4, i % 2 === 0, { ...(i % 3 ? {} : { origen: 'lector' }), ...(i % 4 < 2 ? {} : { pick: 'Minotaur' }) }));
for (let i = 0; i < 10; i++) fiables.push(partida(DUDOSAS_HASTA + (i + 1) * 3600000, i % 2 === 1, { origen: 'lector' }));
// Las dudosas: del lector, en la ventana, todas ganadas, y algunas arregladas ANTES del arreglo (no cuentan).
const dudosas = [];
for (let i = 0; i < 30; i++) dudosas.push(partida(DUDOSAS_DESDE + (i + 1) * DIA / 3, true, { origen: 'lector', ...(i % 5 ? {} : { editada: DUDOSAS_HASTA - DIA }) }));
const ahora = DUDOSAS_HASTA + 2 * DIA;
const maestria = { Diggie: { games: 400, winRate: 0.55 } };
const previas = [{ t: 1, pick: 'Diggie', gane: true, previa: true }];

test('cuáles son dudosas: del lector, en la ventana, y sin arreglar después', () => {
  ok(dudosas.every(esDudosa) && !fiables.some(esDudosa));
  ok(!esDudosa(partida(DUDOSAS_DESDE + DIA, true)), 'una apuntada a mano es dudosa');
  ok(!esDudosa(partida(DUDOSAS_DESDE + DIA, true, { origen: 'lector', editada: DUDOSAS_HASTA + 1 })), 'arreglada después sigue siendo dudosa');
  ok(esDudosa(partida(DUDOSAS_HASTA - 1, true, { origen: 'lector', editada: DUDOSAS_HASTA - 1 })), 'arreglada antes del arreglo deja de ser dudosa');
  ok(!esDudosa(partida(DUDOSAS_HASTA, true, { origen: 'lector' })) && !esDudosa(partida(DUDOSAS_DESDE - 1, true, { origen: 'lector' })), 'la ventana no es la del dato');
  ok(!conResultado(dudosas[1]) && conResultado(fiables[0]) && !conResultado({ t: 1, pick: 'X' }));
  // Las fechas son las del dato (base de datos, 11 de noviembre de 2026): lo del lector del 25 de octubre ganaba
  // un 57 %; desde el 26, 132 de 135; la tablet arrancó con 3.99.0 a las 18:11 UTC del 10 y su primera partida es de las 18:35.
  const delLector = (iso) => esDudosa({ t: Date.parse(iso), pick: 'Diggie', gane: true, origen: 'lector' });
  ok(!delLector('2026-10-25T23:00:00Z') && delLector('2026-10-26T01:00:00Z') && delLector('2026-11-09T22:53:00Z') && delLector('2026-11-10T12:00:00Z'), 'la ventana no empieza el 26 de octubre o no llega al 10 de noviembre');
  ok(!delLector('2026-11-10T18:35:52Z'), 'la primera partida leída con 3.99.0 sale dudosa');
});

test('ninguna medida de «si ganaste» las cuenta: con ellas y sin ellas sale lo mismo', () => {
  const datos = prepararDatos({ catalogo: leerJson('public/data/heroes.json'), meta: leerJson('public/data/roam-meta.json'), rango: 'glory' });
  const filas = (lista) => lista.map((d, i) => ({ j: i % 3, t: d.t, d }));
  const r = (lista) => { const x = resumen([...previas, ...lista], maestria); return { ...x, total: 0, dudosas: 0 }; };
  const medidas = {
    resumen: r,
    calibracion: (l) => calibracion(l),
    ajustePersonal: (l) => ajustePersonal(l),
    medirFasesMias: (l) => medirFasesMias(l),
    evolucion: (l) => evolucion(l, { ahora }),
    porCompaneros: (l) => [porCompaneros(l, { minimo: 2 }), porCompaneros(l, { lado: 'enemigos', minimo: 2 })],
    porLinea, porDia: (l) => porDia(l, { dia: (t) => new Date(t).getUTCDay() }), conLaApp,
    tusNumeros: (l) => tusNumeros(l, { ahora, hora: (t) => new Date(t).getUTCHours() }),
    tuSemana: (l) => tuSemana(l, { ahora: DUDOSAS_HASTA - DIA }),
    medirComunidad: (l) => medirComunidad(filas(l), { 0: { winRate: 0.5, partidas: 300 }, 1: { winRate: 0.5, partidas: 300 }, 2: { winRate: 0.5, partidas: 300 } }),
    revisarDrafts: (l) => { const x = revisarDrafts(datos, l); return { comparacion: x.comparacion }; },
  };
  ok(revisarDrafts(datos, fiables).comparacion, 'la prueba necesita que la revisión del draft compare');
  for (const [n, f] of Object.entries(medidas)) {
    const sin = JSON.stringify(f(fiables));
    eq(JSON.stringify(f([...fiables, ...dudosas])), sin, `${n} cuenta las del resultado dudoso`);
  }
  // Y vuelven a contar en cuanto se arreglan después: con todas ganadas, el Veredicto sube.
  const arregladas = dudosas.map((p) => ({ ...p, editada: DUDOSAS_HASTA + 1 }));
  ok(resumen([...previas, ...fiables, ...arregladas], maestria).siguiendo > resumen([...previas, ...fiables], maestria).siguiendo, 'las arregladas no vuelven a contar');
  eq(resumen([...previas, ...fiables, ...dudosas], maestria).dudosas, dudosas.length, 'el Veredicto no dice cuántas no cuentan');
  ok(JSON.stringify(calibracion([...fiables, ...arregladas])) !== JSON.stringify(calibracion(fiables)), 'la calibración no cuenta las arregladas');
});

await terminar('motor/dudosas');
