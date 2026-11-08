/**
 * src/motor/directo.js: la duración de una partida y su tramo. Los consejos
 * en voz alta que vivían aquí se quitaron en 3.96.0. Propiedad: los tramos
 * repartidos IGUAL que en la medida de las partidas pro (si no, lo medido en
 * tus partidas no es lo mismo que lo medido allí).
 */
import { test, eq, ok, terminar } from '../arnes.mjs';
import { tramoDeMinutos, esDuracionPosible } from '../../src/motor/directo.js';
import { tramoDe } from '../../scripts/medir-fases.mjs';

test('los tramos de duración, repartidos igual que en la medida de las partidas pro', () => {
  for (let d = 0; d < 950; d++) {
    const m = d / 10;
    const mm = Math.floor(m), ss = Math.round((m - mm) * 60);
    if (ss === 60) continue;
    eq(tramoDeMinutos(m), tramoDe(`${mm}:${String(ss).padStart(2, '0')}`), `el minuto ${m.toFixed(1)} cae en otro tramo que en medir-fases`);
  }
  eq(tramoDeMinutos(0), null);
  // Lo que medir-fases tira (de 3 minutos para abajo, de 90 para arriba) no tiene tramo aquí tampoco.
  eq(tramoDeMinutos(2.5), null); eq(tramoDeMinutos(3), null); eq(tramoDeMinutos(90), null);
});

test('la voz ya no está (3.96.0): el plan no trae guion ni cierres', async () => {
  const { planear } = await import('../../src/motor/draft.js');
  const p = planear({ meta: {} }, {});
  ok(!('directo' in p) && !('cierres' in p), 'el plan sigue trayendo el guion de la voz');
  ok(esDuracionPosible(15) && !esDuracionPosible(2));
});

await terminar('motor/directo');
