/**
 * Comprobar la tablet cada semana (3.101.0, src/motor/comprobacion.js): tres
 * partidas suyas al azar (fijo en la semana), solo de las que apuntó ella y
 * nadie tocó, y cuánto acierta en lo comprobado.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { paraComprobar, precisionDeLaTablet, sanearComprobadas, semanaDe, POR_SEMANA, SEMANA_MS, TOPE_COMPROBADAS } from '../../src/motor/comprobacion.js';
import { DUDOSAS_DESDE, DUDOSAS_HASTA } from '../../src/motor/registro.js';

const H = 3600000;
// Un miércoles a mediodía, lejos de las dudosas.
const AHORA = Date.UTC(2026, 10, 18, 12);
const delLector = (t, extra = {}) => ({ t, pick: 'Diggie', gane: true, origen: 'lector', recomendados: ['Diggie'], ...extra });
const LUNES_DE = (t) => Date.UTC(2026, 0, 5) + semanaDe(t) * SEMANA_MS;
const semana = Array.from({ length: 12 }, (_, i) => delLector(AHORA - (i + 1) * 10 * H, { gane: i % 2 === 0 }));

test('elige tres de la semana, solo de la tablet, sin tocar, con resultado fiable y sin repetir', () => {
  const elegidas = paraComprobar(semana, [], { ahora: AHORA });
  eq(elegidas.length, POR_SEMANA);
  ok(elegidas.every((p) => semana.includes(p)), `elige una que no toca: ${JSON.stringify(elegidas.map((p) => p.t))}`);
  eq(new Set(elegidas.map((p) => p.t)).size, POR_SEMANA, 'repite partida');
  // Cada una que no toca, sola: no sale ni aunque no haya otra.
  const noTocan = {
    'a mano': delLector(AHORA - 2 * H, { origen: undefined }),
    'ya arreglada': delLector(AHORA - 3 * H, { editada: AHORA - H }),
    'de hace más de una semana': delLector(AHORA - SEMANA_MS - H),
    'del futuro': delLector(AHORA + H),
    'sin resultado': { t: AHORA - 4 * H, pick: 'Diggie', origen: 'lector' },
    'sin héroe': delLector(AHORA - 5 * H, { pick: undefined }),
  };
  for (const [que, p] of Object.entries(noTocan)) eq(paraComprobar([p], [], { ahora: AHORA }).length, 0, `elige una ${que}`);
  // Las del resultado dudoso (de la tablet entre el 26 de octubre y el 10 de noviembre), tampoco.
  const enLasDudosas = DUDOSAS_DESDE + 3 * 86400000;
  eq(paraComprobar([delLector(enLasDudosas - H)], [], { ahora: enLasDudosas }).length, 0, 'elige una del resultado dudoso');
  eq(paraComprobar([delLector(DUDOSAS_HASTA + H)], [], { ahora: DUDOSAS_HASTA + 2 * H }).length, 1, 'la primera después de las dudosas no sale');
  // Las mismas al volver a abrir (y en otro orden de la lista).
  eq(JSON.stringify(paraComprobar([...semana].reverse(), [], { ahora: AHORA + H }).map((p) => p.t)), JSON.stringify(elegidas.map((p) => p.t)), 'cambian al volver a abrir');
  // Las MISMAS partidas, mirado el domingo por la noche y el lunes de madrugada: otra semana, otro azar.
  const lunes = LUNES_DE(AHORA) + SEMANA_MS;
  const finde = Array.from({ length: 12 }, (_, i) => delLector(lunes - (i + 2) * 4 * H));
  const domingo = paraComprobar(finde, [], { ahora: lunes - H }).map((p) => p.t);
  const delLunes = paraComprobar(finde, [], { ahora: lunes + H }).map((p) => p.t);
  ok(semanaDe(lunes - H) !== semanaDe(lunes + H) && domingo.length === POR_SEMANA && delLunes.length === POR_SEMANA);
  ok(JSON.stringify(domingo) !== JSON.stringify(delLunes), 'todas las semanas tocan las mismas partidas');
});

test('cada comprobada esta semana descuenta una; las de otras semanas no, y una comprobada no vuelve', () => {
  const [a, b] = paraComprobar(semana, [], { ahora: AHORA });
  const hechas = [{ t: a.t, bien: true, cuando: AHORA - H }];
  const quedan = paraComprobar(semana, hechas, { ahora: AHORA });
  eq(quedan.length, POR_SEMANA - 1, 'una comprobada no descuenta');
  ok(!quedan.some((p) => p.t === a.t) && quedan.some((p) => p.t === b.t), 'vuelve la comprobada o se cambia el resto');
  const otra = semana.find((p) => p.t !== a.t && p.t !== b.t);
  const todas = [...hechas, { t: b.t, bien: false, que: 'resultado', cuando: AHORA - H }, { t: otra.t, bien: true, cuando: AHORA - 2 * H }];
  eq(paraComprobar(semana, todas, { ahora: AHORA }).length, 0, 'con tres comprobadas esta semana sigue pidiendo');
  eq(paraComprobar(semana, [{ t: 1, bien: true, cuando: AHORA - SEMANA_MS * 2 }], { ahora: AHORA }).length, POR_SEMANA, 'una de hace dos semanas descuenta de esta');
});

test('cuánto acierta: con su intervalo y los fallos por tipo', () => {
  eq(precisionDeLaTablet([]).n, 0);
  const p = precisionDeLaTablet([{ t: 1, bien: true, cuando: 1 }, { t: 2, bien: true, cuando: 2 }, { t: 3, bien: false, que: 'heroe', cuando: 3 }, { t: 4, bien: false, cuando: 4 }, { t: 5, bien: false, que: 'resultado', cuando: 5 }]);
  ok(p.n === 5 && p.bien === 2 && p.mal === 3 && p.heroe === 1 && p.resultado === 2, JSON.stringify(p));
  ok(p.bajo < 0.4 && p.alto > 0.4, 'sin intervalo');
  const todas = precisionDeLaTablet(Array.from({ length: 12 }, (_, i) => ({ t: i, bien: true, cuando: i })));
  ok(todas.mal === 0 && todas.bajo > 0.7 && todas.alto === 1, JSON.stringify(todas));
});

test('lo guardado con forma: sin repetir partida (manda la última), con tope y sin campos raros', () => {
  const s = sanearComprobadas([{ t: 1, bien: true, cuando: 1 }, { t: 1, bien: false, que: 'heroe', cuando: 5 }, { t: 2, bien: 'si', cuando: 3 }, { t: 3, bien: false, que: '<b>', cuando: 4, raro: 1 }, null, 'x']);
  eq(JSON.stringify(s), JSON.stringify([{ t: 1, bien: false, que: 'heroe', cuando: 5 }, { t: 3, bien: false, que: 'resultado', cuando: 4 }]));
  eq(sanearComprobadas(Array.from({ length: TOPE_COMPROBADAS + 9 }, (_, i) => ({ t: i, bien: true, cuando: i }))).length, TOPE_COMPROBADAS);
  eq(sanearComprobadas(null).length, 0);
});

await terminar('motor/comprobacion');
