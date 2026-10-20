/**
 * `filasDeSalud` (3.60.5): una línea rota de historial/salud.jsonl no vacía
 * el historial. Lo leen el diagnóstico de la vigilancia, el `historial.json`
 * que compara el móvil y `tendencia.mjs`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { filasDeSalud } from '../../scripts/salud.mjs';

test('una línea rota se salta y se cuenta; las demás se quedan', () => {
  const r = filasDeSalud('{"a":1}\n{"a":2\n\n{"a":3}\n');
  eq(r.filas.map((f) => f.a).join(), '1,3', 'una línea rota se lleva las demás');
  eq(r.rotas, 1);
  eq(filasDeSalud('{"a":1}\n{"a":2}\n{"a":3}', { max: 2 }).filas.map((f) => f.a).join(), '2,3', 'no se queda con las últimas');
  eq(filasDeSalud(null).filas.length, 0);
});

test('los tres que leen el historial usan esta función', () => {
  for (const f of ['vite.config.js', 'scripts/diagnostico.mjs', 'scripts/tendencia.mjs']) {
    const s = readFileSync(join(RAIZ, f), 'utf8');
    ok(s.includes('filasDeSalud(') && !/salud\.jsonl[^\n]*\n?[^\n]*\.map\(\(l\) => JSON\.parse/.test(s), `${f} lee el historial con su propio map(JSON.parse)`);
  }
});

await terminar('scripts/salud');
