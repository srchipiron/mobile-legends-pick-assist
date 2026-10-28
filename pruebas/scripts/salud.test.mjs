/**
 * `filasDeSalud` (3.60.5): una línea rota de historial/salud.jsonl no vacía
 * el historial. Lo leen el diagnóstico de la vigilancia, el `historial.json`
 * que compara el móvil y `tendencia.mjs`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { filasDeSalud, datosRancios, DATOS_RANCIOS_H } from '../../scripts/salud.mjs';

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

test('datos de más de 72 horas abren la incidencia de la vigilancia (3.81.2); al día o sin saberlo, no', () => {
  eq(datosRancios([{ edadHoras: 10 }, { edadHoras: DATOS_RANCIOS_H + 1, datosDe: '2026-10-20T11:15:02Z' }])?.includes('73 horas'), true);
  eq(datosRancios([{ edadHoras: DATOS_RANCIOS_H + 1 }, { edadHoras: 5 }]), null, 'mira una fila vieja y no la última');
  eq(datosRancios([{}]), null);
  eq(datosRancios([]), null);
  // El mandato que corre la vigilancia: sale con 1 justo cuando toca.
  const dir = mkdtempSync(join(tmpdir(), 'rancios-'));
  const correr = (filas) => { writeFileSync(join(dir, 's.jsonl'), filas.map((f) => JSON.stringify(f)).join('\n')); return spawnSync(process.execPath, [join(RAIZ, 'scripts/datos-rancios.mjs'), join(dir, 's.jsonl')], { encoding: 'utf8' }); };
  eq(correr([{ edadHoras: 100, datosDe: 'x' }]).status, 1, 'con datos rancios no falla');
  eq(correr([{ edadHoras: 30 }]).status, 0, 'con datos al día falla');
  // Sin la edad, ni incidencia ni «al día» (3.83.1).
  const sinEdad = correr([{ fallos: 0 }]);
  ok(sinEdad.status === 0 && /No sé la edad/.test(sinEdad.stdout) && !/al día/.test(sinEdad.stdout), `sin edad dice: ${sinEdad.stdout}`);
  ok(/al día/.test(correr([{ edadHoras: 30 }]).stdout));
  // Y la vigilancia lo llama después de guardar la fila, con pipefail (bash), y lo pone en la incidencia.
  const v = readFileSync(join(RAIZ, '.github/workflows/vigilancia.yml'), 'utf8');
  const paso = v.indexOf('scripts/datos-rancios.mjs');
  ok(paso > v.indexOf('name: Guardar la fila') && paso < v.indexOf('name: Abrir incidencia'), 'la vigilancia no mira los datos rancios tras guardar la fila');
  ok(/shell: bash\n\s*run: node scripts\/datos-rancios\.mjs/.test(v), 'sin bash (pipefail), el tee se come el código de salida');
  ok(v.includes('/tmp/rancios.txt') && v.includes('steps.rancios.outcome'), 'la incidencia no dice que los datos están rancios');
});

await terminar('scripts/salud');
