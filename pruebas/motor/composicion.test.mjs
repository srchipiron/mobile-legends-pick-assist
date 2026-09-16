/**
 * Pruebas de src/motor/composicion.js: qué le falta a un equipo (el lado de
 * daño, los huecos por etiqueta de TEAM_NEEDS, los roles dobles con su cifra
 * medida) y qué tapa el candidato. Desde 2.0 nada de esto puntúa: se dice.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { analizarComposicion, composicionDe, ROL_DOBLE_PP } from '../../src/motor/composicion.js';

test('la composicion dice que le falta al equipo y que tapa el candidato', () => {
  const F = (name, role, tags, fisico, magico) => ({ name, role, tags, damage: { fisico, magico, verdadero: 0 } });
  // Cuatro fisicos sin nadie delante ni control.
  const aliados = [F('Ti', 'marksman', ['hypercarry'], 5, 0), F('As', 'assassin', ['dash', 'burst'], 4, 0), F('Lu', 'fighter', ['dash'], 4, 0), F('Ju', 'assassin', ['dash'], 4, 0)];
  const tanque = F('Ta', 'tank', ['tanky', 'cc_hard', 'engage'], 0, 4);
  const r = analizarComposicion({ aliados, yo: tanque, enemigos: [] });
  eq(r.sinMi.dano.falta, 'magico', 'no ve que los cuatro pegan fisico');
  ok(r.sinMi.huecos.includes('tanky') && r.sinMi.huecos.includes('cc_hard'), `no ve los huecos: ${r.sinMi.huecos}`);
  ok(r.tapa.includes('tanky') && r.tapa.includes('cc_hard') && r.tapa.includes('engage'), `el tanque deberia tapar tres huecos: ${r.tapa}`);
  ok(r.tapaDano, 'un tanque magico deberia tapar el hueco de dano magico');
  ok(!r.mio.huecos.includes('tanky') && r.mio.dano.falta == null, 'con el tanque dentro sigue faltando lo que el tapa');
  // Dos asesinos: el duplicado medido, con su cifra.
  eq(r.mio.dobles.length, 1, `deberia haber un rol doble (assassin): ${JSON.stringify(r.mio.dobles)}`);
  eq(r.mio.dobles[0].rol, 'assassin', 'el rol doble no es el de los dos asesinos');
  eq(r.mio.dobles[0].pp, ROL_DOBLE_PP.assassin, 'el rol doble no lleva su cifra medida');
  // Un equipo vacio no tiene huecos que decir ni dano que le falte.
  const vacio = composicionDe([]);
  eq(vacio.dano.falta, null, 'a un equipo vacio le falta dano');
  eq(vacio.dobles.length, 0, 'un equipo vacio tiene roles dobles');
});

await terminar('motor/composicion');
