/**
 * Pruebas de src/motor/habitos.js («Tus números», 3.48.0): racha, sesión,
 * después de perder, por hora, por duración y por héroe. Lo que importa: el
 * margen sale siempre, nada se afirma dentro de él, las previas no cuentan
 * y los grupos pequeños no se enseñan.
 */
import { test, ok, eq, casi, terminar } from '../arnes.mjs';
import { tusNumeros, wilson, HUECO_DE_SESION_MS, MINIMO_POR_GRUPO } from '../../src/motor/habitos.js';
import { compararProporciones, resumen } from '../../src/motor/registro.js';

const igual = (a, b) => eq(JSON.stringify(a), JSON.stringify(b));
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const horaUTC = (t) => new Date(t).getUTCHours();
const BASE = Date.UTC(2026, 9, 1, 0, 0);
// Una partida en el día d a la hora h (UTC), minuto m.
const p = (d, h, m, gane, extra = {}) => ({ t: BASE + d * 24 * HORA + h * HORA + m * MIN, pick: 'Diggie', gane, ...extra });

test('racha: las últimas seguidas con el mismo resultado, en orden de instante y no de llegada', () => {
  const ps = [p(0, 20, 0, true), p(0, 20, 30, false), p(0, 21, 0, false), p(0, 21, 30, false)];
  const r = tusNumeros([ps[3], ps[0], ps[2], ps[1]], { ahora: ps[3].t, hora: horaUTC });
  igual(r.racha, { gane: false, n: 3 });
});

test('las partidas previas no cuentan para nada', () => {
  const r = tusNumeros([p(0, 20, 0, true), p(0, 20, 30, false, { previa: true })], { ahora: BASE, hora: horaUTC });
  eq(r.n, 1);
  igual(r.racha, { gane: true, n: 1 });
});

test('sesión: encadena las partidas a menos de 45 min y solo si la última es reciente', () => {
  const ps = [p(0, 18, 0, true), p(0, 20, 0, true), p(0, 20, 30, false), p(0, 21, 10, true)];
  const r = tusNumeros(ps, { ahora: ps[3].t + HORA, hora: horaUTC });
  igual(r.sesion, { n: 3, ganadas: 2 });
  ok(tusNumeros(ps, { ahora: ps[3].t + 13 * HORA, hora: horaUTC }).sesion === null, 'sesión vieja');
  // Justo en el hueco no encadena.
  const dos = [p(0, 20, 0, true), { ...p(0, 20, 0, true), t: p(0, 20, 0, true).t + HUECO_DE_SESION_MS }];
  eq(tusNumeros(dos, { ahora: dos[1].t, hora: horaUTC }).sesion.n, 1);
});

// Diez sesiones de cuatro partidas: perder-X-ganar-Y, para controlar lo que
// sigue a cada resultado.
function sesiones(trasPerder, trasGanar, n = 12) {
  const ps = [];
  for (let s = 0; s < n; s++) {
    ps.push(p(s, 20, 0, false), p(s, 20, 30, trasPerder(s)), p(s, 22, 0, true), p(s, 22, 30, trasGanar(s)));
  }
  return ps;
}

test('después de perder: se compara con el error agrupado y solo con 10 y 10', () => {
  const ps = sesiones((s) => s % 2 === 0, (s) => s % 2 === 0);
  const r = tusNumeros(ps, { ahora: 0, hora: horaUTC }).trasPerder;
  eq(r.n, 12); eq(r.nResto, 12);
  casi(r.wr, 0.5); casi(r.wrResto, 0.5);
  ok(!r.seVe, 'iguales no se distinguen');
  ok(tusNumeros(sesiones(() => true, () => true, MINIMO_POR_GRUPO - 1), { ahora: 0, hora: horaUTC }).trasPerder === null, 'pocas');
  const malo = tusNumeros(sesiones(() => false, () => true, 15), { ahora: 0, hora: horaUTC }).trasPerder;
  ok(malo.seVe && malo.dif < 0, 'perder siempre tras perder se distingue');
});

test('el margen del Veredicto y el de Tus números son la misma cuenta', () => {
  const c = compararProporciones(0.7, 40, 0.5, 30);
  casi(c.margen, 1.96 * Math.sqrt((0.7 * 40 + 0.5 * 30) / 70 * (1 - (0.7 * 40 + 0.5 * 30) / 70) * (1 / 40 + 1 / 30)), 1e-12);
  const ps = [];
  for (let i = 0; i < 30; i++) ps.push({ t: i, pick: 'A', recomendados: ['A'], gane: i < 25 });
  for (let i = 0; i < 30; i++) ps.push({ t: 100 + i, pick: 'B', recomendados: ['A'], gane: i < 12 });
  const e = resumen(ps, {}).entreRamas;
  const c2 = compararProporciones(25 / 30, 30, 12 / 30, 30);
  casi(e.margen, c2.margen, 1e-12); eq(e.seVe, c2.seVe);
});

test('por hora: cada franja contra el resto, con la hora inyectada', () => {
  const ps = [];
  for (let d = 0; d < 12; d++) ps.push(p(d, 15, 0, false), p(d, 22, 0, true));
  const r = tusNumeros(ps, { ahora: 0, hora: horaUTC });
  const tarde = r.franjas.find((f) => f.id === 'tarde');
  const noche = r.franjas.find((f) => f.id === 'noche');
  ok(tarde && noche, 'las dos franjas con partidas');
  ok(!r.franjas.some((f) => f.id === 'cena'), 'franja vacía fuera');
  ok(tarde.seVe && tarde.dif < 0 && noche.seVe && noche.dif > 0, 'se distinguen');
  // Con la hora corrida 3 h, todas caen en otra franja: la hora manda.
  const r2 = tusNumeros(ps, { ahora: 0, hora: (t) => (horaUTC(t) + 3) % 24 });
  ok(r2.franjas.some((f) => f.id === 'cena'), 'la hora inyectada se usa');
});

test('por duración: solo las partidas con duración posible', () => {
  const ps = [];
  for (let d = 0; d < 10; d++) ps.push(p(d, 20, 0, true, { duracion: 12 }), p(d, 21, 0, false, { duracion: 22 }), p(d, 22, 0, true, { duracion: 2 }));
  const r = tusNumeros(ps, { ahora: 0, hora: horaUTC });
  const corta = r.duraciones.find((g) => g.id === 'corta');
  eq(corta.n, 10, 'la de 2 minutos no es una partida');
  eq(corta.nResto, 10);
});

test('por héroe: desde 5, por clave normalizada, con Wilson y marcado solo fuera del margen', () => {
  const ps = [];
  for (let i = 0; i < 20; i++) ps.push({ t: i, pick: i % 2 ? 'X.Borg' : 'X Borg', gane: true });
  for (let i = 0; i < 20; i++) ps.push({ t: 100 + i, pick: 'Layla', gane: false });
  for (let i = 0; i < 4; i++) ps.push({ t: 200 + i, pick: 'Gloo', gane: true });
  const r = tusNumeros(ps, { ahora: 0, hora: horaUTC });
  eq(r.heroes.length, 2, 'Gloo con 4 no sale');
  const xb = r.heroes.find((h) => h.n === 20 && h.wr === 1);
  ok(xb && xb.lado === 'mejor', 'X.Borg junto y por encima');
  ok(xb.alto <= 1 && xb.bajo < 1 && xb.bajo > 0.8, 'Wilson con 20 de 20 no da margen cero');
  eq(r.heroes.find((h) => h.heroe === 'Layla').lado, 'peor');
  const casiMedia = tusNumeros([...ps, ...Array.from({ length: 6 }, (_, i) => ({ t: 300 + i, pick: 'Estes', gane: i < 3 }))], { ahora: 0, hora: horaUTC });
  eq(casiMedia.heroes.find((h) => h.heroe === 'Estes').lado, null, 'dentro del margen, sin marca');
});

test('wilson: dentro de [0, 1] y contiene la proporción', () => {
  for (const [g, n] of [[0, 5], [5, 5], [3, 7], [50, 100]]) {
    const w = wilson(g, n);
    ok(w.bajo >= 0 && w.alto <= 1 && w.bajo <= g / n && w.alto >= g / n, `${g}/${n}`);
  }
  eq(wilson(0, 0), null);
});

test('sin partidas no hay nada que enseñar', () => {
  const r = tusNumeros([], {});
  eq(r.n, 0); eq(r.racha, null);
});

await terminar('motor/habitos');
