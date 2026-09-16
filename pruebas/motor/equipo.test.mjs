/**
 * Pruebas de src/motor/equipo.js: el consejo para los compañeros. Es el
 * MISMO motor apuntando a otra línea, así que lo que se vigila aquí es el
 * reparto (qué líneas quedan abiertas, cuál nunca se aconseja) y que el
 * consejo responda al equipo enemigo y no sea el meta por línea.
 *
 * Se llama por la vía de la app (`aconsejar` de draft.js), no a
 * `aconsejarEquipo` a pelo: así el consejo va con las líneas enemigas
 * abiertas y los pools por línea, que es lo que dice CLAUDE.md y lo que la
 * app hace de verdad. Llamando a pelo sin esos dos campos, cambiar
 * `lineasAbiertas` por `[]` dentro de equipo.js no lo notaba nadie.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { LINEAS } from '../../src/motor/catalogo.js';
import { prepararDatos, aconsejar, lineasEnemigasAbiertas } from '../../src/motor/draft.js';
import { aconsejarEquipo } from '../../src/motor/equipo.js';

test('el consejo para los compañeros cubre las líneas abiertas y responde al equipo enemigo', () => {
  const meta = leerJson('public/data/roam-meta.json');
  // Sin datos no se ejercita nada, y eso es un FALLO, no un pase: con el
  // `return` de antes el fichero imprimía «1 de 1 correctas» sin haber
  // probado una sola línea.
  ok((meta.heroes ?? []).length >= 100 && meta.counters,
    `roam-meta.json trae ${(meta.heroes ?? []).length} heroes y ${meta.counters ? '' : 'NINGUNA '}matriz de cruces: el consejo no se puede comprobar`);
  // Los datos como los monta la app (prepararDatos): índice de líneas,
  // frecuencias de rol, meta indexado y pool de cada línea.
  const datos = prepararDatos({ catalogo, meta });
  const todos = datos.heroes;
  const pools = datos.poolsPorLinea;
  ok(!LINEAS.some((l) => pools[l].length < 10),
    `alguna línea se queda sin pool: ${LINEAS.map((l) => `${l}:${pools[l].length}`).join(' ')}`);
  const H = (n) => todos.find((x) => x.name === n);
  // La vía de la app: `aconsejar` pone las líneas enemigas abiertas y los
  // pools por línea por su cuenta.
  const consejo = (extra) => aconsejar(datos, { linea: 'roam', yo: H('Khufra'), ...extra });

  // 1. Cuatro líneas abiertas sin aliados; nunca la mía.
  const solo = consejo({ enemigos: [H('Layla')] });
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
  const conJungla = consejo({ enemigos: [H('Layla')], aliados: [H('Fanny')] });
  ok(!conJungla.some((c) => c.linea === 'jungle'), 'sigue aconsejando jungla con Fanny en el equipo');
  ok(!conJungla.flatMap((c) => c.sugerencias).some((s) => s.heroe.name === 'Fanny'), 'aconseja al aliado que ya está');
  // Y un baneado no sale por ninguna línea.
  const baneado = conJungla.flatMap((c) => c.sugerencias)[0]?.heroe;
  const sinEl = consejo({ enemigos: [H('Layla')], aliados: [H('Fanny')], baneos: [baneado] });
  ok(!sinEl.flatMap((c) => c.sugerencias).some((s) => s.heroe.name === baneado.name), `aconseja al baneado ${baneado.name}`);

  // 2b. Un aliado flexible NO se pone en mi línea: jugando exp con Lukas
  //     (jungla/exp) de aliado, Lukas va a la jungla y la jungla se cierra.
  //     Medido: repartir entre las cinco aconsejaba una línea ya cubierta en
  //     132 de 400 drafts; excluyendo la mía, 23.
  const lukas = H('Lukas');
  if (lukas) {
    const exp = aconsejar(datos, { linea: 'exp', yo: H('Chou'), enemigos: [H('Layla')], aliados: [lukas] });
    ok(!exp.some((c) => c.linea === 'jungle'), `con Lukas aliado jugando exp sigue aconsejando jungla: ${exp.map((c) => c.linea)}`);
  }

  // 3. Con cuatro aliados no queda línea que aconsejar.
  const lleno = consejo({ enemigos: [H('Layla')], aliados: [H('Fanny'), H('Layla'), H('Pharsa'), H('Chou')].filter(Boolean) });
  ok(lleno.length <= 1, `con el equipo lleno sigue aconsejando ${lleno.length} líneas`);

  // 4. Responde al equipo enemigo: contra tres asesinos móviles y contra tres
  //    magos estáticos el nº1 de alguna línea cambia. Si no, no es un consejo
  //    contra nadie: es el meta por línea.
  const contraA = consejo({ enemigos: ['Fanny', 'Ling', 'Lancelot'].map(H).filter(Boolean) });
  const contraB = consejo({ enemigos: ['Pharsa', 'Layla', 'Eudora'].map(H).filter(Boolean) });
  const tops = (cs) => cs.map((c) => `${c.linea}:${c.sugerencias[0]?.heroe.name}`).join(' ');
  ok(tops(contraA) !== tops(contraB), `mismo consejo contra asesinos que contra magos: ${tops(contraA)}`);

  // 4b. Y responde también a lo que FALTA por salir: el consejo va con las
  //     mismas líneas enemigas abiertas que tu propio ranking (el término
  //     «por ver» del modelo). Sin esto, cambiar `lineasAbiertas` por `[]`
  //     dentro de `aconsejarEquipo` dejaba las pruebas en verde y el consejo
  //     era el de un draft completo que nadie tiene delante.
  const firma = (cs) => cs.map((c) => `${c.linea}:${c.sugerencias.map((s) => s.heroe.name).join('/')}`).join(' ');
  for (const nombres of [['Layla'], ['Layla', 'Fanny'], ['Layla', 'Fanny', 'Pharsa']]) {
    const enemigos = nombres.map(H).filter(Boolean);
    const abiertas = lineasEnemigasAbiertas(datos, enemigos);
    ok(abiertas.length > 0, `con ${enemigos.length} enemigos deberían quedar líneas abiertas`);
    const conAbiertas = consejo({ enemigos });
    const comoSiEstuvieraLleno = consejo({ enemigos, lineasAbiertas: [] });
    ok(firma(conAbiertas) !== firma(comoSiEstuvieraLleno),
      `con ${enemigos.length} enemigos (${abiertas.length} líneas abiertas) el consejo no mira lo que falta por salir: ${firma(conAbiertas)}`);
  }

  // 5. Sin línea propia o sin héroes, nada (y sin reventar).
  eq(aconsejar(datos, { linea: null, yo: H('Khufra'), enemigos: [H('Layla')] }).length, 0, 'aconseja sin saber mi línea');
  eq(aconsejar(datos, { linea: 'roam', yo: null, enemigos: [H('Layla')] }).length, 0, 'aconseja sin saber mi pick');
  eq(aconsejar(datos, { linea: 'roam', yo: H('Khufra'), enemigos: [] }).length, 0, 'aconseja sin ningún enemigo a la vista');
  // Este no pasa por `aconsejar` porque el catálogo vacío no se puede pedir
  // desde la app: es la guarda de la función.
  eq(aconsejarEquipo({ heroes: [], miLinea: 'roam' }).length, 0, 'aconseja sin héroes');
});

await terminar('motor/equipo');
