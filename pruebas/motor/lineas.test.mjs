/**
 * Pruebas de src/motor/lineas.js: quién es el rival de TU línea entre los
 * enemigos elegidos, y cuándo callarse. Un rival mal nombrado sale en el
 * análisis como un hecho; no decir nada no cuesta nada.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo, h, crearRnd } from '../fixtures/catalogo.mjs';
import { detectarRivalDeLinea, indiceDeLineas, frecuenciaDeRoles, asignarLineas, lanesDe } from '../../src/motor/lineas.js';
import { LINEAS } from '../../src/motor/catalogo.js';
import { prepararDatos, rivalDeLinea } from '../../src/motor/draft.js';

test('se deduce el rival de TU línea, y se calla si hay duda', () => {
  const listado = [
    { name: 'Angela', role: 'support', lane: 'roam' },
    { name: 'Fredrinn', role: 'fighter', lane: 'jungle,exp' },
    { name: 'Zilong', role: 'fighter', lane: 'exp,gold' },
    { name: 'Kagura', role: 'mage', lane: 'mid' },
    { name: 'Claude', role: 'marksman', lane: 'gold' },
    { name: 'Minotaur', role: 'tank', lane: 'roam' },
    { name: 'Floryn', role: 'support', lane: 'roam' },
    { name: 'Melissa', role: 'marksman', lane: 'gold' },
    { name: 'Argus', role: 'fighter', lane: 'exp' },
    { name: 'Saber', role: 'assassin', lane: 'jungle' },
  ];
  const info = indiceDeLineas(listado);
  const frec = frecuenciaDeRoles(listado.map((x) => ({ ...x, lanes: x.lane.split(',') })));
  const draft = ['Fredrinn', 'Angela', 'Zilong', 'Kagura', 'Claude'].map(h);
  const rival = (linea, d = draft) => detectarRivalDeLinea(d, info, linea, frec);

  // El MISMO draft da un rival distinto según la línea que juegues tú. Esto es
  // lo que hace que la app sirva para los cinco roles y no solo para roam.
  ok(rival('roam') === 'Angela', `roam deberia ser Angela: ${rival('roam')}`);
  ok(rival('mid') === 'Kagura', `mid deberia ser Kagura: ${rival('mid')}`);
  ok(rival('gold') === 'Claude', `gold deberia ser Claude: ${rival('gold')}`);

  // Con DOS candidatos claros, callarse: equivocarse duplica el peso del
  // matchup equivocado, que es peor que no decir nada.
  const dosRoamers = ['Melissa', 'Argus', 'Saber', 'Minotaur', 'Floryn'].map(h);
  ok(rival('roam', dosRoamers) === null, 'se moja habiendo dos roamers posibles');

  // Y no se inventa un roam donde no hay ninguno.
  ok(rival('roam', ['Kagura', 'Claude', 'Zilong', 'Saber', 'Argus'].map(h)) === null,
    'inventa un roam donde no hay ninguno');

  // Sin datos de la API sigue funcionando para roam con el catálogo, que es lo
  // único que sabe quién rota. Para las otras cuatro no puede saberlo, y
  // callarse es la respuesta correcta.
  ok(detectarRivalDeLinea(draft, new Map(), 'roam', {}) === 'Angela',
    'sin datos de líneas no acierta el roam ni con el catálogo');
  ok(detectarRivalDeLinea(draft, new Map(), 'mid', {}) === null,
    'sin datos de líneas se inventa un mid');
});

test('el reparto de lineas es el de la app', () => {
  // `asignarLineas` (el mejor reparto de cinco en las cinco líneas, lo que
  // usan los scripts de medición) coincide con lo que la app deduce cuando
  // no duda. Era la mitad de una prueba de scripts/medir-rival.mjs; la otra
  // mitad (la logística recupera coeficientes conocidos) es del script.
  const listado = [
    { name: 'Angela', role: 'support', lane: 'roam' }, { name: 'Kagura', role: 'mage', lane: 'mid' },
    { name: 'Claude', role: 'marksman', lane: 'gold' }, { name: 'Saber', role: 'assassin', lane: 'jungle' },
    { name: 'Argus', role: 'fighter', lane: 'exp' },
  ];
  const info = indiceDeLineas(listado); const frec = frecuenciaDeRoles(listado.map((x) => ({ ...x, lanes: x.lane.split(',') })));
  const equipo = listado.map((x) => ({ name: x.name }));
  const reparto = asignarLineas(equipo, info, frec);
  for (const l of ['roam', 'mid', 'gold', 'jungle', 'exp']) {
    eq(reparto[l].name, detectarRivalDeLinea(equipo, info, l, frec), `reparto de ${l} distinto del de la app`);
  }
});

test('el rival se deduce por eliminacion, y acierta lo que se midio', () => {
  // 1. Eliminacion: cuatro enemigos claros en otras lineas y uno ambiguo entre
  //    exp y jungla. Mirandolo solo es ambiguo; mirando el draft entero, si la
  //    jungla ya esta cogida, va a la exp. Es como lo lee cualquiera.
  const listado = [
    { name: 'Angela', role: 'support', lane: 'roam' },
    { name: 'Kagura', role: 'mage', lane: 'mid' },
    { name: 'Claude', role: 'marksman', lane: 'gold' },
    { name: 'Saber', role: 'assassin', lane: 'jungle' },
    { name: 'YuZhong', role: 'fighter', lane: 'exp,jungle' },
    { name: 'Argus', role: 'fighter', lane: 'exp' },
  ];
  const info = indiceDeLineas(listado);
  const frec = frecuenciaDeRoles(listado.map((x) => ({ ...x, lanes: x.lane.split(',') })));
  const draft = ['Angela', 'Kagura', 'Claude', 'Saber', 'YuZhong'].map((n) => ({ name: n }));
  eq(detectarRivalDeLinea(draft, info, 'exp', frec), 'YuZhong',
    'con la jungla ya cogida, el que juega exp o jungla tiene que ir a la exp');
  eq(detectarRivalDeLinea(draft, info, 'jungle', frec), 'Saber', 'y la jungla es del jungla claro');

  // 2. Con solo el ambiguo y nadie mas, sigue sin mojarse entre sus dos lineas.
  ok(detectarRivalDeLinea([{ name: 'YuZhong' }], info, 'exp', frec) === null
    || detectarRivalDeLinea([{ name: 'YuZhong' }], info, 'jungle', frec) === null,
  'nombra al mismo heroe como rival de DOS lineas a la vez');

  // 3. Precision medida sobre los datos reales, no sobre un fixture: drafts con
  //    un enemigo por linea (verdad conocida). Los suelos salen de la medicion
  //    del cambio (exp 60%->88%, jungla 69%->91%) con holgura, y el techo de
  //    errores tambien. Si un cambio futuro vuelve a mirar a cada enemigo por
  //    separado, esto lo nota. Los datos como los monta la app (prepararDatos)
  //    y el rival por la vía de la app (rivalDeLinea, sin nadie marcado a mano).
  const meta = leerJson('public/data/roam-meta.json');
  if (!(meta.heroes ?? []).length) return;
  const datos = prepararDatos({ catalogo, meta });
  const pools = datos.poolsPorLinea;
  if (LINEAS.some((l) => pools[l].length < 10)) return;

  const r = crearRnd(13);
  // Draft completo (5 enemigos) y draft a medias (3): el segundo es donde
  // nombrar a alguien que aun no ha salido cuesta caro, y donde mas se nota el
  // peso del rol (0.30: 2,7% de errores; 0.10: 0,0%).
  const cuenta = {};
  for (const cuantos of [5, 3]) {
    let bien = 0; let mal = 0; let n = 0;
    for (let d = 0; d < 600; d++) {
      const usados = new Set();
      const draftReal = {};
      for (const l of LINEAS) {
        let h;
        do h = pools[l][Math.floor(r() * pools[l].length)]; while (usados.has(h.name));
        usados.add(h.name);
        draftReal[l] = h;
      }
      const orden = [...LINEAS].sort(() => r() - 0.5).slice(0, cuantos);
      const enemigos = orden.map((l) => draftReal[l]);
      for (const l of LINEAS) {
        const real = orden.includes(l) ? draftReal[l].name : null;
        const dicho = rivalDeLinea(datos, { linea: l, enemigos }).nombre;
        n++;
        if (dicho == null) { if (!real) bien++; } else if (dicho === real) bien++; else mal++;
      }
    }
    cuenta[cuantos] = { bien: bien / n, mal: mal / n };
  }
  // Suelos y techos con holgura sobre lo medido (5en: 93,5% / 0,0%; 3en:
  // 85,8% / 0,0%), pero lo bastante apretados para cazar tanto el metodo
  // enemigo a enemigo (60% en exp, 5% de error) como un peso del rol de 0.30
  // (2,7% de error a medias).
  ok(cuenta[5].bien >= 0.88, `draft completo: acierta solo el ${(cuenta[5].bien * 100).toFixed(1)}%`);
  ok(cuenta[5].mal <= 0.01, `draft completo: nombra al rival equivocado el ${(cuenta[5].mal * 100).toFixed(1)}%`);
  ok(cuenta[3].bien >= 0.80, `draft a medias: acierta solo el ${(cuenta[3].bien * 100).toFixed(1)}%`);
  ok(cuenta[3].mal <= 0.012, `draft a medias: nombra a un rival equivocado el ${(cuenta[3].mal * 100).toFixed(1)}%`);
});

test('revision linea a linea del motor: las dos lecturas de lineas son la misma', () => {
  // 5. Las dos lecturas de líneas son la misma: mayúsculas y `lane` en cadena.
  eq(frecuenciaDeRoles([{ role: 'mage', lane: 'Mid,Exp' }]).mid?.mage, 1, 'frecuenciaDeRoles no lee `lane` en cadena ni mayúsculas');
  eq(indiceDeLineas([{ name: 'Z', role: 'Mage', lanes: ['Mid'] }]).get('z')?.lanes.join(), 'mid', 'indiceDeLineas no pasa a minúsculas');
  eq(lanesDe({ lanes: [' Gold '] }).join(), 'gold', 'lanesDe no recorta');
});

await terminar('motor/lineas');
