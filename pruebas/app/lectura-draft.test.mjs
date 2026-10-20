/**
 * `aplicarLectura` (useDraft) con lecturas seguidas del lector, sin
 * navegador: el hook de verdad con un React mínimo (estado y referencias en
 * orden de llamada), empaquetado con esbuild. Vigila lo que una sola lectura
 * no enseña: cómo se encadenan.
 */
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, eq, ok, terminar, RAIZ } from '../arnes.mjs';

const dir = mkdtempSync(join(tmpdir(), 'lectura-draft-'));
writeFileSync(join(dir, 'react.js'), `
let slots = [], idx = 0;
export function useState(init) { const i = idx++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; }
export function useRef(init) { const i = idx++; if (!(i in slots)) slots[i] = { current: init }; return slots[i]; }
export function useCallback(f) { idx++; return f; }
export function useMemo(f) { idx++; return f(); }
export function useEffect() { idx++; }
export function render(hook) { idx = 0; return hook(); }
export function reiniciar() { slots = []; idx = 0; }
`);
writeFileSync(join(dir, 'entrada.js'), `export { useDraft } from ${JSON.stringify(join(RAIZ, 'src/app/estado/useDraft.js'))};\nexport { render, reiniciar } from 'react';\n`);
const salida = join(dir, 'hook.mjs');
buildSync({ entryPoints: [join(dir, 'entrada.js')], bundle: true, platform: 'node', format: 'esm', outfile: salida, alias: { react: join(dir, 'react.js') }, logLevel: 'silent' });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { useDraft, render, reiniciar } = await import(pathToFileURL(salida).href);

/** Un draft nuevo y una función que le pasa lecturas de enemigos hueco a hueco (null = «?»). */
function nuevo() {
  reiniciar();
  let d = render(useDraft);
  return {
    leer(huecos) {
      d.aplicarLectura({ baneos: [], enemigos: [...new Set(huecos.filter(Boolean))], aliados: [], huecos: { enemigos: huecos, aliados: [] } });
      d = render(useDraft);
      return d.enemigos;
    },
  };
}

test('un héroe que solo se miraba y se cambia por uno que el lector no reconoce no bloquea al equipo (3.56.0)', () => {
  // La secuencia de la revisión de 3.55.0: con 3.54.0, desde la sexta
  // lectura todas se tiraban y Kadita, Gloo y Eudora no entraban nunca.
  const d = nuevo();
  d.leer(['Joy', null, null, null, null]);
  d.leer([null, null, null, null, null]); // coge a Barats: «?»
  d.leer([null, 'Wanwan', null, null, null]);
  d.leer([null, null, null, null, null]); // coge a Rafaela: «?»
  d.leer([null, null, 'Hanabi', null, null]);
  d.leer([null, null, 'Kadita', 'Gloo', null]);
  const final = d.leer([null, null, 'Kadita', 'Gloo', 'Eudora']);
  ok(['Kadita', 'Gloo', 'Eudora'].every((n) => final.includes(n)), `el equipo se queda bloqueado: ${final}`);
  ok(!final.includes('Hanabi'), `Hanabi, que solo se miraba, no se cambia por Kadita: ${final}`);
});

test('la fase de skins (cambian los cinco a la vez) sigue sin tocar los picks', () => {
  const d = nuevo();
  const antes = d.leer(['Clint', 'Khufra', 'Layla', 'Miya', 'Nana']);
  eq(d.leer([null, 'Wanwan', null, 'Joy', 'Esmeralda']).join(), antes.join(), 'una lectura con cinco huecos cambiados mete o quita picks');
  eq(d.leer([null, 'Wanwan', null, 'Joy', 'Esmeralda']).join(), antes.join(), 'la segunda lectura de la fase de skins sí entra');
  // Dos cambios a la vez (los dos que eligen) sí se aplican.
  const despues = d.leer(['Clint', 'Khufra', 'Layla', 'Lesley', 'Aamon']);
  ok(despues.includes('Lesley') && despues.includes('Aamon') && !despues.includes('Miya'), `dos cambios no se aplican: ${despues}`);
});

test('tras «Nuevo draft», un héroe metido a mano antes de la primera lectura no bloquea al bando (3.60.4)', () => {
  reiniciar();
  let d = render(useDraft);
  const leer = (huecos, extra = {}) => { const r = d.aplicarLectura({ baneos: [], enemigos: [...new Set(huecos.filter(Boolean))], aliados: [], huecos: { enemigos: huecos, aliados: [] }, ...extra }); d = render(useDraft); return r; };
  leer(['A', 'B', 'C', 'D', 'E']);
  d.reiniciar(); d = render(useDraft);
  d.anadir('aliados', { name: 'Mio' }); d = render(useDraft);
  leer(['P', 'Q', 'R', null, null]);
  leer(['P', 'Q', 'R', 'S', 'T']);
  eq(d.enemigos.join(), 'P,Q,R,S,T', 'el bando del draft nuevo se tira por los huecos del anterior');
});

test('una lectura pedida en el draft anterior no entra en el nuevo (3.60.4)', () => {
  reiniciar();
  let d = render(useDraft);
  d.aplicarLectura({ baneos: ['Hirara'], enemigos: ['A'], aliados: [], huecos: { enemigos: ['A'], aliados: [] } }); d = render(useDraft);
  const epoca = d.epocaDelDraft();
  d.reiniciar(); d = render(useDraft);
  const r = d.aplicarLectura({ baneos: ['Hirara'], enemigos: ['A', 'B'], aliados: [], id: 'lectura-viejo-1', huecos: { enemigos: ['A', 'B'], aliados: [] }, epoca });
  d = render(useDraft);
  ok(r.otroDraft && !d.enemigos.length && !d.baneos.length && !d.lectura, `la lectura del draft anterior entra en el nuevo: ${JSON.stringify({ e: d.enemigos, b: d.baneos, l: d.lectura })}`);
  // Pedida en ESTE draft, sí.
  d.aplicarLectura({ baneos: [], enemigos: ['Z'], aliados: [], huecos: { enemigos: ['Z'], aliados: [] }, epoca: d.epocaDelDraft() }); d = render(useDraft);
  eq(d.enemigos.join(), 'Z');
});

await terminar('app/lectura-draft');
