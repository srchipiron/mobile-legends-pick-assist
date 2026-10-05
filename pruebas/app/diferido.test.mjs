/**
 * Lo que espera al plazo de un «Deshacer» antes de salir de la app (3.42.0):
 * sale al acabar el plazo, no sale si se deshace (y devuelve lo que llevaba),
 * y lo pendiente sale ya si llega otra cosa o la app se va.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { crearDiferido } from '../../src/app/diferido.js';

/** Un reloj de mentira: se avanza a mano. */
function relojFalso() {
  let ahora = 0;
  const tareas = new Map();
  let n = 0;
  return {
    esperar: (f, ms) => { n += 1; tareas.set(n, { f, cuando: ahora + ms }); return n; },
    soltar: (id) => { tareas.delete(id); },
    avanzar(ms) {
      ahora += ms;
      for (const [id, t] of [...tareas]) if (t.cuando <= ahora) { tareas.delete(id); t.f(); }
    },
  };
}

test('lo pendiente sale al acabar el plazo, una sola vez', () => {
  const r = relojFalso();
  const d = crearDiferido(r);
  const salidas = [];
  d.programar(1, { lista: ['a'] }, 100, (x) => salidas.push(x.lista.join()));
  r.avanzar(99);
  eq(salidas.length, 0, 'sale antes del plazo del «Deshacer»');
  r.avanzar(1);
  eq(salidas.join('|'), 'a', 'no sale al acabar el plazo');
  r.avanzar(1000);
  eq(salidas.length, 1, 'sale dos veces');
  eq(d.ejecutar(), false, 'ejecutar sin nada pendiente hace algo');
});

test('deshacer (cancelar SU draft) no lo deja salir y devuelve lo que llevaba; otro draft no lo cancela', () => {
  const r = relojFalso();
  const d = crearDiferido(r);
  const salidas = [];
  d.programar(7, { lista: ['x', 'y'] }, 100, (x) => salidas.push(x));
  eq(d.cancelar(8), null, 'cancela lo de otro draft');
  eq(d.cancelar(null), null, 'cancela sin draft');
  const vuelve = d.cancelar(7);
  eq(vuelve?.lista?.join(), 'x,y', 'no devuelve lo que llevaba');
  r.avanzar(1000);
  eq(salidas.length, 0, 'lo deshecho sale igual');
  eq(d.pendiente, null, 'queda algo pendiente');
});

test('si llega otra cosa que esperar, o la app se va, lo de antes sale ya', () => {
  const r = relojFalso();
  const d = crearDiferido(r);
  const salidas = [];
  d.programar(1, 'a', 100, (x) => salidas.push(x));
  d.programar(2, 'b', 100, (x) => salidas.push(x));
  eq(salidas.join(), 'a', 'lo primero se pierde al encolar lo segundo');
  ok(d.ejecutar(), 'ejecutar con algo pendiente no hace nada');
  eq(salidas.join(), 'a,b', 'lo pendiente no sale al irse la app');
  r.avanzar(1000);
  eq(salidas.join(), 'a,b', 'lo que ya salió sale otra vez al acabar su plazo');
});

await terminar('app/diferido');
