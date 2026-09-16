/**
 * Pruebas de src/motor/builds.js: la mitad que es CONSEJO (`ajusteDefensivo`).
 * No sale de medir builds contra este draft -ese dato no existe-, sino de dos
 * hechos medidos (de qué pega cada enemigo, cuánta defensa da cada objeto)
 * más una regla evidente del juego, así que lo que hay que vigilar es dónde
 * pone el listón de «esta build ya lleva defensa».
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { ajusteDefensivo } from '../../src/motor/builds.js';

test('revision linea a linea del motor: quince de armadura no son «ya lleva defensa»', () => {
  // 7. «Ya lleva defensa» es defensa COMPARABLE a la propuesta: con `> 0`,
  //    los 15 de armadura de Immortality callaban el aviso contra tres
  //    físicos (9 de 431 builds). El umbral es la mitad del mejor objeto
  //    propuesto.
  const fis = (n) => ({ name: n, damage: { fisico: 6, magico: 0 } });
  const equipment = { 1: { nombre: 'Blade Armor', fisica: 80 }, 2: { nombre: 'Immortality', fisica: 15 }, 3: { nombre: 'Hunter Strike' } };
  const enemigos = [fis('A'), fis('B'), fis('C'), fis('D'), fis('E')];
  const conImmortality = ajusteDefensivo({ objetos: [2, 3] }, equipment, enemigos);
  ok(conImmortality && conImmortality.lado === 'fisica', 'Immortality (15) calla el aviso de defensa física');
  eq(ajusteDefensivo({ objetos: [1, 3] }, equipment, enemigos), null, 'con Blade Armor sigue avisando');
});

await terminar('motor/builds');
