/**
 * Pruebas de src/motor/alias.js: la BÚSQUEDA en los dos idiomas. La app
 * enseña siempre el nombre en inglés (es la clave de todos los datos), pero
 * Javi juega con el móvil en español y escribe «Cíclope». Lo que vigila este
 * fichero: que cada alias apunte a un héroe real, que ninguno pise el nombre
 * de otro, y que el respaldo por letras en orden solo entre cuando la
 * búsqueda normal no encuentra nada.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { ALIAS, filtrarPorNombre } from '../../src/motor/alias.js';

test('se puede buscar un heroe por su nombre en espanol', () => {
  // El caso que lo motivo: Javi tiene el juego en espanol, ve "Ciclope" y no
  // encontraba nada porque la app solo miraba el nombre en ingles.
  const busca = (hero, q) => filtrarPorNombre([hero], q).length > 0;
  ok(busca({ name: 'Cyclops' }, 'Cíclope'), 'no encuentra a Cyclops escribiendo Cíclope');
  ok(busca({ name: 'Cyclops' }, 'ciclope'), 'no encuentra a Cyclops sin tilde');
  ok(busca({ name: 'Cyclops' }, 'cyclo'), 'ha roto la busqueda por el nombre en ingles');
  ok(busca({ name: 'Minotaur' }, 'minotauro'), 'no encuentra a Minotaur escribiendo Minotauro');
  ok(!busca({ name: 'Layla' }, 'ciclope'), 'saca heroes que no tienen nada que ver');

  // Un alias que apunte a un heroe que no existe es peor que no tenerlo:
  // escribes el nombre bueno y no sale nadie, o sale otro.
  const nombres = new Set(catalogo.heroes.map((x) => x.name));
  for (const n of Object.keys(ALIAS)) {
    ok(nombres.has(n), `el alias apunta a un heroe que no esta en el catalogo: ${n}`);
  }

  // Y ningun alias puede pisar el nombre real de OTRO heroe.
  for (const [heroe, otros] of Object.entries(ALIAS)) {
    for (const alias of otros) {
      const choca = catalogo.heroes.find((x) => x.name !== heroe && x.name.toLowerCase() === alias.toLowerCase());
      ok(!choca, `el alias "${alias}" de ${heroe} es el nombre real de ${choca?.name}`);
    }
  }
});

test('si no sale nadie, el buscador prueba con las letras en orden', () => {
  // El caso que lo motivo: Javi no encontraba a Layla. Escrita "Lyla" -como
  // aparece en algunas listas en espanol- el buscador no devolvia nada, y
  // desde el movil, en 30 segundos de draft, eso es un callejon sin salida.
  const heroes = ['Layla', 'Tigreal', 'Lolita', 'Alucard', 'Lunox', 'Miya', 'Cyclops']
    .map((name) => ({ name }));
  const nombres = (q) => filtrarPorNombre(heroes, q).map((x) => x.name);

  eq(nombres('Lyla').join(), 'Layla', 'no encuentra a Layla escribiendo Lyla');
  eq(nombres('Tigral').join(), 'Tigreal', 'no perdona una letra bailada');
  eq(nombres('Lucard').join(), 'Alucard', 'no encuentra un nombre al que le falta el principio');

  // Lo normal NO cambia: mientras algo encaje de la forma de siempre, el
  // respaldo no entra. Si entrara siempre, tres letras sacarian media
  // plantilla y el buscador seria inutil. Se compara contra el filtro de
  // siempre en vez de contra una lista escrita a mano: escribirla a mano ya me
  // ha salido mal dos veces (ni "Lolita" contiene "la" ni "Cyclops" deja de
  // contener "lo").
  const contiene = (q) => heroes
    .filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).map((x) => x.name).join();
  for (const q of ['la', 'Lo', 'lay', 'yl']) {
    ok(contiene(q).length > 0, `la comprobacion no vale: "${q}" no encontraba nada de la forma normal`);
    eq(nombres(q).join(), contiene(q), `el respaldo se ha colado buscando "${q}"`);
  }

  // Y pide tres letras: con una o dos, las letras sueltas encajan en casi todo.
  eq(nombres('ly').length, 0, 'con dos letras ya se pone a adivinar');
  eq(nombres('zzz').length, 0, 'saca heroes para algo que no se parece a nada');
  eq(nombres('').length, heroes.length, 'sin escribir nada deberia salir todo');
});

await terminar('motor/alias');
