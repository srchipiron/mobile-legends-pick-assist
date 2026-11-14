/**
 * Fundir el draft de la tablet en el del móvil (`fundirTablet`,
 * src/app/estado/draftMovil.js), copia tras copia: la tablet manda sobre lo
 * que ella leyó y la mano sobre lo que tocó. Y lo guardado en 3.102.0 se
 * carga y se vuelve a guardar sin perder nada.
 */
import { test, ok, eq } from '../ayuda.mjs';
import { fundirTablet, vacio, cargarDraft, paraGuardar, correccionDe, huellaDeNombres, huellaDeLaTablet } from '../../src/app/estado/draftMovil.js';
import { sanearDraftTablet } from '../../src/comun/contrato.js';

const D = 1763150000000;
/** Un draft de la tablet: cinco huecos por equipo y tu fila. */
const tablet = (o = {}) => sanearDraftTablet({ desde: D, enemigos: [], aliados: [], tuyoFila: -1, baneos: [], ...o });
const copiar = (antes, t, extra) => fundirTablet(antes, t, { ahora: D + 1000, ...extra });
const nombres = (d) => JSON.stringify({ b: d.baneos, e: d.enemigos, a: d.aliados, tu: d.miPick });

test('una copia mete baneos, enemigos, compañeros y tu fila como tu pick, pasa a picks y cuenta lo que entró', () => {
  const t = tablet({ baneos: ['Hirara', 'Fanny'], enemigos: ['Clint', null, 'Khufra'], aliados: ['Miya', 'Estes', null, 'Gloo', null], tuyoFila: 1 });
  const r = copiar(vacio(), t);
  eq(nombres(r.despues), JSON.stringify({ b: ['Hirara', 'Fanny'], e: ['Clint', 'Khufra'], a: ['Miya', 'Gloo'], tu: 'Estes' }));
  ok(r.despues.miPickLeido && r.despues.miPickDesde === D + 1000, 'tu fila no queda como pick leído con su instante');
  eq(r.despues.fase, 'picks');
  eq(r.despues.desdeTablet, D, 'el móvil no sabe qué draft de la tablet sigue');
  eq(JSON.stringify(r.nuevos), JSON.stringify({ baneos: 2, enemigos: 2, aliados: 2, tuyo: 'Estes' }));
  const otra = copiar(r.despues, t);
  eq(nombres(otra.despues), nombres(r.despues), 'la misma copia otra vez cambia algo');
  eq(otra.nuevos.baneos + otra.nuevos.enemigos + otra.nuevos.aliados, 0, 'la misma copia otra vez cuenta como nueva');
});

test('lo metido a mano se queda aunque la tablet no lo vea; lo que la tablet cambió (el que solo miraba) sale', () => {
  const t1 = tablet({ enemigos: ['Clint', 'Khufra'] });
  let d = copiar(vacio(), t1).despues;
  d = { ...d, enemigos: [...d.enemigos, 'Layla'], aMano: ['Layla'] };
  // En el hueco de Clint ahora se ve a Rafaela: Clint solo se miraba.
  const r = copiar(d, tablet({ enemigos: ['Rafaela', 'Khufra'] }));
  eq(JSON.stringify(r.despues.enemigos), JSON.stringify(['Khufra', 'Layla', 'Rafaela']), `no se cambia al que miraba o se va lo de la mano: ${r.despues.enemigos}`);
  eq(r.quitados, 1);
  // Un héroe metido a mano antes de que la tablet empezara se queda con su draft.
  const aMano = { ...vacio(), enemigos: ['Saber'], fase: 'picks' };
  eq(JSON.stringify(copiar(aMano, t1).despues.enemigos), JSON.stringify(['Saber', 'Clint', 'Khufra']), 'lo de antes de la tablet se pierde');
});

test('lo leído que quitas (×, «Deshacer») no vuelve en la copia siguiente, ni de baneo, enemigo o compañero', () => {
  const t = tablet({ baneos: ['Hirara', 'Fanny'], enemigos: ['Clint', 'Khufra'], aliados: ['Miya', 'Estes', 'Gloo', null, null], tuyoFila: 1 });
  const d = copiar(vacio(), t).despues;
  const quitado = { ...d, baneos: ['Fanny'], enemigos: ['Khufra'], aliados: ['Gloo'] };
  const r = copiar(quitado, t);
  eq(nombres(r.despues), nombres(quitado), 'lo quitado vuelve con la copia siguiente');
  ok(r.despues.lectura.enemigos.includes('Clint') && r.despues.lectura.baneos.includes('Hirara'), 'se olvida que se quitó (volvería después)');
});

test('tu pick: el que soltaste no vuelve, uno fijado a mano manda y uno fuera de tu línea no se fija', () => {
  const t = tablet({ aliados: ['Miya', 'Estes', null, null, null], tuyoFila: 1 });
  const d = copiar(vacio(), t).despues;
  eq(copiar({ ...d, miPick: null, miPickDesde: null, miPickLeido: false }, t).despues.miPick, null, 'el pick soltado vuelve');
  eq(copiar({ ...vacio(), miPick: 'Rafaela', miPickLeido: false }, t).despues.miPick, 'Rafaela', 'la tablet pisa tu pick fijado a mano');
  eq(copiar(vacio(), t, { pool: new Set(['Rafaela']) }).despues.miPick, null, 'un pick que no es de tu línea se fija');
  eq(copiar({ ...vacio(), miPick: 'Miya', miPickLeido: true }, tablet({ aliados: ['Rafaela', null, null, null, null], tuyoFila: 0 })).despues.miPick, 'Rafaela', 'el leído no cambia cuando cambias de héroe');
});

test('otro draft de la tablet empieza uno nuevo; uno viejo o ya vaciado no entra', () => {
  const d = copiar(vacio(), tablet({ enemigos: ['Clint'] })).despues;
  const r = copiar(d, tablet({ desde: D + 600000, enemigos: ['Ling'] }));
  ok(r.otro && JSON.stringify(r.despues.enemigos) === '["Ling"]', `el draft siguiente se mezcla con el anterior: ${r.despues.enemigos}`);
  ok(copiar(r.despues, tablet({ enemigos: ['Clint'] })).ignorado, 'un draft más viejo que el que se sigue entra');
  const vaciado = vacio({ ignorarTabletHasta: D });
  ok(copiar(vaciado, tablet({ enemigos: ['Clint'] })).ignorado, '«Nuevo draft» no ignora el draft que vació');
  ok(!copiar(vaciado, tablet({ desde: D + 1, enemigos: ['Clint'] })).ignorado, 'tras «Nuevo draft» no entra el siguiente');
  // Un draft a mano completado antes de que empezara el de la tablet es otra partida.
  const viejo = { ...vacio(), enemigos: ['A', 'B', 'C', 'D', 'E'], aliados: ['F', 'G', 'H', 'I'], completoDesde: D - 1000, fase: 'picks' };
  eq(JSON.stringify(copiar(viejo, tablet({ enemigos: ['Clint'] })).despues.enemigos), '["Clint"]', 'el draft de la tablet se mezcla con una partida vieja');
});

test('cerrado por la partida en la tablet: cerrado y completo en el móvil, salvo sin enemigos', () => {
  const r = copiar(vacio(), tablet({ enemigos: ['Clint', 'Khufra'], cerrado: true, cerradoEn: D + 500 }));
  ok(r.despues.cerrado && r.despues.completoDesde === D + 1000, JSON.stringify(r.despues));
  ok(!copiar(vacio(), tablet({ baneos: ['Hirara', 'Fanny'], cerrado: true })).despues.cerrado, 'se cierra un draft sin enemigos');
});

test('la corrección para la tablet: tú fuera de tus compañeros, y la huella dice si el móvil ve otra cosa', () => {
  const t = tablet({ enemigos: ['Clint', 'Khufra'], aliados: ['Miya', 'Estes', null, null, null], tuyoFila: 1 });
  const d = copiar(vacio(), t).despues;
  eq(huellaDeNombres(correccionDe(d)), huellaDeLaTablet(t), 'el móvil y la tablet ven lo mismo y sale corrección');
  const tocado = { ...d, enemigos: ['Khufra'], aliados: [...d.aliados, 'Gloo'] };
  const c = correccionDe(tocado);
  eq(JSON.stringify(c), JSON.stringify({ desde: D, enemigos: ['Khufra'], aliados: ['Miya', 'Gloo'], tuyo: 'Estes', baneos: [] }));
  ok(huellaDeNombres(c) !== huellaDeLaTablet(t), 'lo tocado no cuenta como distinto');
  eq(correccionDe(vacio()), null, 'sin draft de la tablet hay corrección');
});

test('lo guardado por 3.102.0 se carga entero y se vuelve a guardar igual (los campos de 4.0 solo se añaden)', () => {
  const viejo = {
    enemies: ['Clint', 'Khufra'], allies: ['Miya'], bans: ['Hirara'], enemyRoam: 'Khufra', fase: 'picks', miPick: 'Estes', miPickDesde: 5, miPickLeido: true,
    completoDesde: 9, cerrado: true, recordarDesde: 11, apuntadaSola: 7,
    lectura: { baneos: ['Hirara'], enemigos: ['Clint', 'Khufra'], aliados: ['Miya'], tuyo: 'Estes', ids: ['lectura-2026-1'], dudas: [{ hueco: 'e3', candidato: 'Gord', parecido: 0.74 }], ms: [1200], msCaptura: [800], formatos: ['crudo'] },
  };
  eq(JSON.stringify(paraGuardar(cargarDraft(viejo))), JSON.stringify(viejo), 'un draft de 3.102.0 pierde algo al cargarlo y guardarlo');
  const raro = cargarDraft({ enemies: 'Clint', allies: [1, 'Miya'], fase: 'otra', completoDesde: 9 });
  ok(JSON.stringify(raro.enemigos) === '[]' && JSON.stringify(raro.aliados) === '["Miya"]' && raro.fase === 'picks' && raro.completoDesde === null, JSON.stringify(raro));
  const nuevo = paraGuardar({ ...cargarDraft(viejo), aMano: ['Miya'], desdeTablet: D, ignorarTabletHasta: D - 1 });
  eq(JSON.stringify(cargarDraft(nuevo).aMano), '["Miya"]');
  eq(cargarDraft(nuevo).desdeTablet, D);
});
