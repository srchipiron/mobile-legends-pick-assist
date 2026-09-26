/**
 * El comparador de la ingesta: la puerta que separa una corrida buena de una
 * degradada. La ingesta se degrada EN SILENCIO y por diseño (cada endpoint que
 * falla conserva lo anterior), así que una corrida mala se parece a una buena
 * en el diff: mismos números y `generatedAt` nuevo. Esto llegó a producción.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { comparar, medir, maximosDelHistorial } from '../../scripts/comparar-ingesta.mjs';

test('una corrida de ingesta degradada no llega a los datos guardados', () => {
  // Esto llego a produccion: el bot de datos commiteo una corrida con los 133
  // heroes SIN linea y SIN rol, y con counters de 34 en vez de 133. Cuatro de
  // las cinco lineas se quedaban sin pool. El diff parecia normal porque la
  // ingesta conserva los datos anteriores cuando un endpoint falla: solo
  // cambiaba generatedAt.
  const heroe = (n, lanes) => ({ name: n, role: 'tank', lanes, damage: { fisico: 3, magico: 0 } });
  const buena = {
    heroes: Array.from({ length: 10 }, (_, i) => heroe(`H${i}`, ['roam'])),
    stats: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`H${i}`, {}])),
    counters: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`H${i}`,
      Object.fromEntries(Array.from({ length: 9 }, (_, j) => [`H${j}`, 0.5]))])),
    synergies: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`H${i}`,
      Object.fromEntries(Array.from({ length: 9 }, (_, j) => [`H${j}`, 0.5]))])),
  };

  ok(comparar(buena, buena).peores.length === 0, 'marca como peor una corrida identica');

  // Trinquete hacia abajo: comparar solo con la ANTERIOR aceptada dejaba que
  // diez corridas perdiendo un 9% cada una bajaran los cruces al 39% sin que
  // saltara nada. Los recuentos de tamano conocido se comparan tambien con el
  // maximo visto en el historial de salud; objetos y builds, no (varian por
  // diseno). Y una linea rota del historial no tira la lectura.
  const historial = ['{"cruces":90,"heroes":10,"objetos":999}', 'esto no es json', '{"cruces":50}'].join('\n');
  const maximos = maximosDelHistorial(historial);
  eq(maximos.cruces, 90, `maximo de cruces del historial: ${JSON.stringify(maximos)}`);
  ok(!('objetos' in maximos), 'los objetos no entran en los maximos fijos');
  const menguada = { ...buena, counters: Object.fromEntries(Object.entries(buena.counters).map(([h, f]) => [h, Object.fromEntries(Object.entries(f).slice(0, 5))])) };
  ok(comparar(menguada, menguada).peores.length === 0, 'sin historial, una corrida igual a la guardada se rechaza');
  ok(comparar(menguada, menguada, maximos).peores.some((p) => p.clave === 'cruces' && p.antes === 90), 'no detecta que la corrida esta muy por debajo del maximo del historial');
  ok(comparar(buena, buena, { objetos: 999 }).peores.length === 0, 'los objetos se comparan contra el historial y no deberian');

  const sinLineas = { ...buena, heroes: buena.heroes.map((h) => ({ ...h, lanes: [] })) };
  ok(comparar(sinLineas, buena).peores.some((p) => p.clave === 'conLinea'),
    'no detecta que la corrida nueva se ha quedado sin lineas');

  const sinRol = { ...buena, heroes: buena.heroes.map(({ role, ...h }) => h) };
  ok(comparar(sinRol, buena).peores.some((p) => p.clave === 'conRol'),
    'no detecta que la corrida nueva se ha quedado sin roles');

  const sinDano = { ...buena, heroes: buena.heroes.map(({ damage, ...h }) => h) };
  ok(comparar(sinDano, buena).peores.some((p) => p.clave === 'conDano'),
    'no detecta que la corrida nueva se ha quedado sin tipo de dano');

  const menosCounters = { ...buena, counters: { H0: {}, H1: {} } };
  ok(comparar(menosCounters, buena).peores.some((p) => p.clave === 'counters'),
    'no detecta que la corrida nueva trae muchos menos counters');

  // Y el caso mas traicionero: los 10 heroes siguen teniendo fila, pero con
  // dos cruces en vez de nueve. En el recuento de filas no cambia nada.
  const filasFlacas = { ...buena,
    counters: Object.fromEntries(Object.entries(buena.counters)
      .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).slice(0, 2))])) };
  ok(comparar(filasFlacas, buena).peores.some((p) => p.clave === 'cruces'),
    'no detecta que las filas vienen casi vacias, con los mismos heroes');

  // El margen esta para que el ruido normal de la API no pare el despliegue:
  // que un heroe no devuelva counters un dia no es una regresion.
  const unoMenos = { ...buena, counters: Object.fromEntries(Object.entries(buena.counters).slice(0, 9)) };
  ok(comparar(unoMenos, buena).peores.length === 0, 'un heroe de menos no puede parar el despliegue');

  // Y la primera vez no hay con que comparar: no puede bloquear.
  ok(medir({}).heroes === 0, 'medir() no aguanta un JSON vacio');
});

test('una corrida que pierde builds no pasa el filtro', () => {
  const tres = (n) => Array.from({ length: n }, () => ({ objetos: [1, 2, 3] }));
  const base = {
    heroes: [{ name: 'A', lanes: ['exp'], role: 'fighter', damage: { fisico: 3 } }],
    stats: { A: {} }, counters: { A: { B: 0.5 } }, synergies: { A: { B: 0.5 } },
    equipment: { 1: { nombre: 'X' } },
    builds: { A: { exp: tres(3) } },
  };
  eq(comparar(base, base).peores.length, 0, 'una corrida identica se rechaza');

  // El caso que hay que cazar: MISMOS heroes con build, una build cada uno en
  // vez de tres. Contando heroes esto pasaba.
  const pobre = { ...base, builds: { A: { exp: tres(1) } } };
  ok(comparar(pobre, base).peores.some((p) => p.clave === 'builds'),
    'una corrida con un tercio de las builds pasa el filtro');

  ok(comparar({ ...base, equipment: {} }, base).peores.some((p) => p.clave === 'objetos'),
    'una corrida sin catalogo de objetos pasa el filtro');
});

test('una corrida que pierde el winrate por línea no pasa el filtro (se cuentan pares héroe-línea)', () => {
  const base = {
    heroes: [{ name: 'A', lanes: ['exp', 'jungle'], role: 'fighter', damage: { fisico: 3 } }],
    stats: { A: {} }, counters: { A: { B: 0.5 } }, synergies: { A: { B: 0.5 } },
    winrateLinea: { A: { exp: 0.5, jungle: 0.52 }, B: { roam: 0.49 } },
  };
  eq(comparar(base, base).peores.length, 0, 'una corrida idéntica se rechaza');
  // Los mismos héroes con UNA línea cada uno: contando héroes pasaría.
  ok(comparar({ ...base, winrateLinea: { A: { exp: 0.5 }, B: { roam: 0.49 } } }, base).peores.some((p) => p.clave === 'winrateLinea'),
    'una corrida con un tercio menos de pares héroe-línea pasa el filtro');
  ok(comparar({ ...base, winrateLinea: {} }, base).peores.some((p) => p.clave === 'winrateLinea'), 'una corrida sin winrate por línea pasa el filtro');
  // Un fichero de antes (sin el campo) no bloquea la primera corrida que lo trae.
  const viejo = { ...base }; delete viejo.winrateLinea;
  eq(comparar(base, viejo).peores.length, 0, 'la primera corrida con winrate por línea se rechaza contra un fichero que no lo tenía');
  // Y contra el MÁXIMO del historial, no solo contra la última aceptada: sin
  // esto cada corrida podía perder un 9% sobre la anterior, sin fondo.
  const maximos = maximosDelHistorial('{"winrateLinea":30}');
  eq(maximos.winrateLinea, 30, 'el historial no guarda el máximo de pares héroe-línea');
  ok(comparar(base, base, maximos).peores.some((p) => p.clave === 'winrateLinea' && p.antes === 30), 'una corrida muy por debajo del máximo del historial pasa el filtro');
});

await terminar('scripts/comparar');
