/**
 * Pruebas de src/motor/equipo.js: el consejo para los compañeros. Es el
 * MISMO motor apuntando a otra línea, así que lo que se vigila aquí es el
 * reparto (qué líneas quedan abiertas, cuál nunca se aconseja) y que el
 * consejo responda al equipo enemigo y no sea el meta por línea.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { LINEAS } from '../../src/motor/catalogo.js';
import { prepararDatos } from '../../src/motor/draft.js';
import { aconsejarEquipo } from '../../src/motor/equipo.js';

test('el consejo para los compañeros cubre las líneas abiertas y responde al equipo enemigo', () => {
  const meta = leerJson('public/data/roam-meta.json');
  if (!(meta.heroes ?? []).length || !meta.counters) return;
  // Los datos como los monta la app (prepararDatos): índice de líneas,
  // frecuencias de rol, meta indexado y pool de cada línea.
  const datos = prepararDatos({ catalogo, meta });
  const todos = datos.heroes;
  const pools = datos.poolsPorLinea;
  if (LINEAS.some((l) => pools[l].length < 10)) return;
  const H = (n) => todos.find((x) => x.name === n);
  const base = { heroes: todos, lineas: datos.lineas, frecuencias: datos.frecuencias, miLinea: 'roam', yo: H('Khufra'), meta: datos.meta };

  // 1. Cuatro líneas abiertas sin aliados; nunca la mía.
  const solo = aconsejarEquipo({ ...base, enemigos: [H('Layla')] });
  eq(solo.length, 4, `líneas aconsejadas: ${solo.map((c) => c.linea)}`);
  ok(!solo.some((c) => c.linea === 'roam'), 'aconseja para mi propia línea');
  for (const c of solo) {
    ok(c.sugerencias.length === 3, `${c.linea}: ${c.sugerencias.length} sugerencias en vez de 3`);
    for (const s of c.sugerencias) {
      ok(pools[c.linea].some((x) => x.name === s.heroe.name), `${s.heroe.name} no juega ${c.linea} y se aconseja ahí`);
      ok(s.heroe.name !== 'Khufra' && s.heroe.name !== 'Layla', `aconseja a alguien ya cogido: ${s.heroe.name}`);
    }
  }
  // Layla es tiradora: el rival de la línea de oro es ella, y ahí no se aconseja a nadie contra nadie más.
  const oro = solo.find((c) => c.linea === 'gold');
  eq(oro?.rival, 'Layla', `rival de oro: ${oro?.rival}`);

  // 2. Un aliado que ya cubre una línea la cierra: Fanny ocupa la jungla.
  const conJungla = aconsejarEquipo({ ...base, enemigos: [H('Layla')], aliados: [H('Fanny')] });
  ok(!conJungla.some((c) => c.linea === 'jungle'), 'sigue aconsejando jungla con Fanny en el equipo');
  ok(!conJungla.flatMap((c) => c.sugerencias).some((s) => s.heroe.name === 'Fanny'), 'aconseja al aliado que ya está');
  // Y un baneado no sale por ninguna línea.
  const baneado = conJungla.flatMap((c) => c.sugerencias)[0]?.heroe;
  const sinEl = aconsejarEquipo({ ...base, enemigos: [H('Layla')], aliados: [H('Fanny')], baneos: [baneado] });
  ok(!sinEl.flatMap((c) => c.sugerencias).some((s) => s.heroe.name === baneado.name), `aconseja al baneado ${baneado.name}`);

  // 2b. Un aliado flexible NO se pone en mi línea: jugando exp con Lukas
  //     (jungla/exp) de aliado, Lukas va a la jungla y la jungla se cierra.
  //     Medido: repartir entre las cinco aconsejaba una línea ya cubierta en
  //     132 de 400 drafts; excluyendo la mía, 23.
  const lukas = H('Lukas');
  if (lukas) {
    const exp = aconsejarEquipo({ ...base, miLinea: 'exp', yo: H('Chou'), enemigos: [H('Layla')], aliados: [lukas] });
    ok(!exp.some((c) => c.linea === 'jungle'), `con Lukas aliado jugando exp sigue aconsejando jungla: ${exp.map((c) => c.linea)}`);
  }

  // 3. Con cuatro aliados no queda línea que aconsejar.
  const lleno = aconsejarEquipo({ ...base, enemigos: [H('Layla')], aliados: [H('Fanny'), H('Layla'), H('Pharsa'), H('Chou')].filter(Boolean) });
  ok(lleno.length <= 1, `con el equipo lleno sigue aconsejando ${lleno.length} líneas`);

  // 4. Responde al equipo enemigo: contra tres asesinos móviles y contra tres
  //    magos estáticos el nº1 de alguna línea cambia. Si no, no es un consejo
  //    contra nadie: es el meta por línea.
  const contraA = aconsejarEquipo({ ...base, enemigos: ['Fanny', 'Ling', 'Lancelot'].map(H).filter(Boolean) });
  const contraB = aconsejarEquipo({ ...base, enemigos: ['Pharsa', 'Layla', 'Eudora'].map(H).filter(Boolean) });
  const tops = (cs) => cs.map((c) => `${c.linea}:${c.sugerencias[0]?.heroe.name}`).join(' ');
  ok(tops(contraA) !== tops(contraB), `mismo consejo contra asesinos que contra magos: ${tops(contraA)}`);

  // 5. Sin línea propia o sin héroes, nada (y sin reventar).
  eq(aconsejarEquipo({ ...base, miLinea: null, enemigos: [H('Layla')] }).length, 0, 'aconseja sin saber mi línea');
  eq(aconsejarEquipo({ heroes: [], miLinea: 'roam' }).length, 0, 'aconseja sin héroes');
});

await terminar('motor/equipo');
