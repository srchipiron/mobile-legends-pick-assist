/**
 * Las teclas del ordenador (3.87.0, src/app/atajos.js): E, A y B abren su
 * selector, pero nunca escribiendo, con una hoja abierta o con Control.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { atajoDe, escribiendoEn } from '../../src/app/atajos.js';

const PICKS = { hoja: null, fase: 'picks' };

test('E enemigos, A tu equipo, B baneos (también en mayúscula)', () => {
  eq(atajoDe({ key: 'e' }, PICKS), 'enemigos');
  eq(atajoDe({ key: 'A' }, PICKS), 'aliados');
  eq(atajoDe({ key: 'b' }, PICKS), 'baneos');
  eq(atajoDe({ key: 'x' }, PICKS), null, 'otra tecla abre algo');
});

test('escribiendo, con una hoja abierta, con Control o con la tecla mantenida, nada', () => {
  eq(atajoDe({ key: 'e', enCampo: true }, PICKS), null, 'escribir «e» en un campo abre los enemigos');
  eq(atajoDe({ key: 'e' }, { ...PICKS, hoja: 'meta' }), null, 'con una hoja abierta abre otra');
  eq(atajoDe({ key: 'a', ctrlKey: true }, PICKS), null, 'Control+A (seleccionar todo) abre tu equipo');
  eq(atajoDe({ key: 'a', metaKey: true }, PICKS), null);
  eq(atajoDe({ key: 'e', altKey: true }, PICKS), null);
  eq(atajoDe({ key: 'e', repeat: true }, PICKS), null, 'mantener la tecla la abre otra vez');
  eq(atajoDe({ key: undefined }, PICKS), null);
});

test('en la fase de baneos solo B: los equipos no se ven', () => {
  eq(atajoDe({ key: 'e' }, { hoja: null, fase: 'baneos' }), null);
  eq(atajoDe({ key: 'b' }, { hoja: null, fase: 'baneos' }), 'baneos');
});

test('escribiendoEn: campos, áreas, desplegables y lo editable', () => {
  const el = (selectorQueCasa) => ({ closest: (sel) => (sel.split(', ').includes(selectorQueCasa) ? {} : null) });
  ok(escribiendoEn(el('input')) && escribiendoEn(el('textarea')) && escribiendoEn(el('select')));
  ok(!escribiendoEn(el('button')) && !escribiendoEn(null) && !escribiendoEn({}), 'un botón cuenta como campo');
});

await terminar('app/atajos');
