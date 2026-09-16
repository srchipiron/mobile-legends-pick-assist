/**
 * Pruebas de src/motor/analisis.js: las frases sobre el draft. Que diga si
 * el pick aguanta lo que falta por salir, que se calle con el draft completo
 * y que no cruce la simulación de OTRO draft con el ranking de este.
 */
import { test, ok, terminar } from '../arnes.mjs';
import { nombreClave, indexarPorNombre } from '../../src/motor/nombres.js';
import { analizarDraft } from '../../src/motor/analisis.js';

test('el analisis dice si el pick aguanta lo que falta, y se calla con el draft completo', () => {
  const yo = { name: 'Khufra', tags: [], roam: true };
  const ranking = [{ heroe: yo, p: 0.7 }, { heroe: { name: 'Atlas', tags: [] }, p: 0.6 }];
  const base = { ranking, enemigos: [{ name: 'Fanny', tags: [] }], aliados: [], empate: [], meta: { counters: {} } };

  const seguro = analizarDraft({ ...base, robustez: { cuota: { Khufra: 0.7, Atlas: 0.3 }, lineasAbiertas: ['mid', 'gold', 'exp', 'jungle'], n: 60 } });
  ok(seguro.some((f) => f.clave === 'analisis.pickRobusto' && f.params.pct === 70), `no dice que es seguro: ${JSON.stringify(seguro)}`);
  const fragil = analizarDraft({ ...base, robustez: { cuota: { Khufra: 0.2, Atlas: 0.5 }, lineasAbiertas: ['mid'], n: 60 } });
  ok(fragil.some((f) => f.clave === 'analisis.pickFragil' && f.params.faltan === 1), `no avisa de que es fragil: ${JSON.stringify(fragil)}`);
  // Sin lineas abiertas (draft completo) o sin simulacion, ni una cosa ni otra.
  for (const rb of [null, { cuota: { Khufra: 1 }, lineasAbiertas: [], n: 60 }]) {
    const nada = analizarDraft({ ...base, robustez: rb });
    ok(!nada.some((f) => /pickRobusto|pickFragil/.test(f.clave)), 'habla de finales con el draft completo');
  }

  // La simulación de OTRO draft no vale para este. En la app va diferida
  // (useDeferredValue) y el ranking no: en el render de en medio el nº1 es el
  // nuevo y la cuota la del draft anterior, y un héroe que esa simulación no
  // votó salía como «frágil 0%». Con la marca del draft, se calla; sin marca
  // (fixtures viejos) sigue hablando; con la marca correcta, habla.
  {
    const marcada = { cuota: { Atlas: 0.9 }, lineasAbiertas: ['mid'], n: 60, enemigos: ['fanny', 'ling'], aliados: [] };
    const otroDraft = analizarDraft({ ...base, robustez: marcada });
    ok(!otroDraft.some((f) => /pickRobusto|pickFragil/.test(f.clave)), `cruza la simulación de otro draft con este ranking: ${JSON.stringify(otroDraft)}`);
    const esteDraft = analizarDraft({ ...base, robustez: { ...marcada, enemigos: base.enemigos.map((h) => nombreClave(h.name)).sort(), aliados: [] } });
    ok(esteDraft.some((f) => f.clave === 'analisis.pickFragil' && f.params.pct === 0), 'con la marca de este draft no habla');
  }
});

test('el análisis dice lo que no se ve, y se calla cuando no sabe', () => {
  const yo = { name: 'Khufra', tags: ['engage', 'cc_hard', 'tanky', 'peel'], roam: true };
  const rival = { name: 'Estes', tags: ['heal', 'sustain'], roam: true };
  const ranking = [
    { heroe: yo, p: 0.70, riesgo: 0.2 },
    { heroe: { name: 'Atlas', tags: [] }, p: 0.55 },
  ];

  // 1. Con dato de la pareja, lo dice con el matchup, que es el dato bueno.
  const conPar = analizarDraft({
    ranking, enemigos: [rival], aliados: [], empate: [],
    rivalDeLinea: 'Estes',
    meta: { counters: indexarPorNombre({ Khufra: { Estes: 0.57 } }, 2) },
  });
  ok(conPar.some((f) => f.clave === 'analisis.ganasCruce' && f.params?.pct === 57),
    `no usa el matchup real: ${JSON.stringify(conPar)}`);

  // 2. La matriz solo cubre el 11% de los cruces, asi que casi nunca lo hay.
  //    Sin el, se comparan los winrates sueltos, que es peor informacion y por
  //    eso se dice con otras palabras: 'este parche', no 'le ganas'.
  const sinPar = analizarDraft({
    ranking, enemigos: [rival], aliados: [], empate: [],
    rivalDeLinea: 'Estes',
    meta: { counters: {}, stats: indexarPorNombre({ Khufra: { winRate: 0.54 }, Estes: { winRate: 0.49 } }) },
  });
  ok(sinPar.some((f) => f.clave === 'analisis.tuWinrateMejor'), `no cae al winrate: ${JSON.stringify(sinPar)}`);
  ok(!sinPar.some((f) => f.clave === 'analisis.ganasCruce'),
    'vende una comparación de winrates como si fuera el matchup de la pareja');

  // 3. Sin nada de nada, se calla. Una frase inventada en 30 segundos de draft
  //    es peor que ninguna.
  const aCiegas = analizarDraft({
    ranking: [{ heroe: yo, p: 0.6 }, { heroe: { name: 'Atlas', tags: [] }, p: 0.59 }],
    enemigos: [], aliados: [], empate: [], rivalDeLinea: null, meta: {},
  });
  ok(!aCiegas.length, `se inventa algo sin datos: ${JSON.stringify(aCiegas)}`);

  // 4. Nunca more de tres frases: en un draft se leen dos.
  ok(conPar.length <= 3, 'suelta demasiadas frases');
});

await terminar('motor/analisis');
