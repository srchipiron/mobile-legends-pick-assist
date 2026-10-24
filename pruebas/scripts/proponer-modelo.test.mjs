/**
 * El bot que propone recalibrar el modelo (3.72.0): solo propone con
 * partidas de sobra, si predice mejor fuera de muestra y si la escala sale
 * del error de la de hoy. Con partidas sintéticas de escala conocida.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { partidaDeGloria, juntarGloria, medirMuestra, decidirPropuesta, informe, MINIMO_PROPUESTA, MEJORA_MINIMA } from '../../scripts/proponer-modelo.mjs';
import { ESCALA } from '../../src/motor/modelo.js';

/** Partidas sintéticas: términos al azar y el resultado sacado con la escala `k` (determinista). */
function sinteticas(n, k, semilla = 1) {
  let a = semilla;
  const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  return Array.from({ length: n }, () => {
    const f = { H: normal() * 0.6, C: normal() * 0.8, S: normal() * 0.3, D: normal(), R: 0, O: 0, N: 0, B: 0 };
    const L = k * (f.H + f.C + f.S + 0.5 * f.D);
    return { ...f, y: rnd() < 1 / (1 + Math.exp(-L)) ? 1 : 0 };
  });
}
const tres = (filas) => ({ pro: medirMuestra(filas), gloria: null, juntas: medirMuestra(filas) });

test('con la escala de verdad igual a la de hoy, no propone nada', () => {
  const d = decidirPropuesta(tres(sinteticas(3000, ESCALA)));
  ok(!d.proponer, `propone sin motivo: ${d.motivo}`);
});

test('con una escala de verdad muy distinta y partidas de sobra, propone, y mide la escala buena', () => {
  const m = tres(sinteticas(3000, 1.0, 3));
  ok(Math.abs(m.juntas.escala - 1.0) < 3 * m.juntas.se, `la escala medida no es la de verdad: ${m.juntas.escala} ± ${m.juntas.se}`);
  ok(m.juntas.ganancia >= MEJORA_MINIMA, `no ve la mejora: ${m.juntas.ganancia}`);
  const d = decidirPropuesta(m);
  ok(d.proponer, `no propone: ${d.motivo}`);
  ok(/Propuesta/.test(informe({ muestras: m, decision: d })) && /Nada se ha cambiado/.test(informe({ muestras: m, decision: d })), 'el informe no dice que es una propuesta y que no cambió nada');
});

test('con pocas partidas no propone, aunque la escala esté lejos', () => {
  const d = decidirPropuesta(tres(sinteticas(MINIMO_PROPUESTA - 1, 1.2, 5)));
  ok(!d.proponer && /pocas partidas/.test(d.motivo), d.motivo);
  ok(!decidirPropuesta({ juntas: null }).proponer);
});

test('una mejora pequeña o una escala dentro del error no basta', () => {
  const m = tres(sinteticas(3000, 1.0, 3));
  eq(decidirPropuesta(m, { mejora: m.juntas.ganancia + 1 }).proponer, false, 'propone sin llegar a la mejora mínima');
  eq(decidirPropuesta(m, { escala: m.juntas.escala + m.juntas.se }).proponer, false, 'propone con la escala dentro del error');
});

test('las partidas de Gloria: solo con el draft completo, sin repetir y del catálogo; la misma partida en tu historial y en la comunidad cuenta una vez', () => {
  const nombres = ['Rafaela', 'Gord', 'Selena', 'Layla', 'Zilong', 'Clint', 'Khufra', 'Atlas', 'Franco', 'Tigreal'];
  const indice = new Map(nombres.map((n) => [n.toLowerCase(), { name: n }]));
  const p = { t: 10, pick: 'Rafaela', gane: true, draft: { aliados: ['Gord', 'Selena', 'Layla', 'Zilong'], enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Tigreal'] } };
  const g = partidaDeGloria(p, indice);
  ok(g && g.ganador === 1 && g.equipos[0][0].name === 'Rafaela' && g.equipos[1].length === 5, JSON.stringify(g));
  eq(partidaDeGloria({ ...p, gane: false }, indice).ganador, 2);
  eq(partidaDeGloria({ ...p, draft: { ...p.draft, enemigos: ['Clint'] } }, indice), null, 'puntúa un draft a medias');
  eq(partidaDeGloria({ ...p, draft: { ...p.draft, enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Gord'] } }, indice), null, 'puntúa un héroe en los dos equipos');
  eq(partidaDeGloria({ ...p, draft: { ...p.draft, enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Nadie'] } }, indice), null, 'puntúa un héroe que no existe');
  eq(partidaDeGloria({ ...p, previa: true }, indice), null, 'puntúa una partida previa (sin draft de verdad)');
  const juntas = juntarGloria({ mias: [p, { ...p, t: 1 }], comunidad: [{ j: 1, t: 10, d: p }, { j: 2, t: 11, d: { ...p, t: 11 } }], desde: 5 });
  eq(JSON.stringify(juntas.map((x) => x.t)), '[10,11]', 'repite la misma partida o entra una de antes de la ventana');
});

await terminar('scripts/proponer-modelo');
