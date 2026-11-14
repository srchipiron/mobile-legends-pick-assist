/**
 * Lo que hacen los bots con las incidencias (`scripts/bots/incidencia.mjs`,
 * con un cliente de GitHub de mentira: sin red ni token) y el mantenimiento
 * con reglas.js (`scripts/bots/sustituir-tablas.mjs`, ejecutado).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';
import { avisar, abrirSiNueva, cerrarTodas, cuerpoDeVigilancia, mantenimiento, propuestaDelModelo, vigilancia } from '../../scripts/bots/incidencia.mjs';
import { sustituir } from '../../scripts/bots/sustituir-tablas.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'bots-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** Un GitHub de mentira: incidencias en memoria y lo que se le pidió. */
function github(incidencias = []) {
  const hechas = [];
  const issues = {
    listForRepo: async ({ labels, state }) => ({ data: incidencias.filter((i) => i.state === state && i.labels.includes(labels)) }),
    createComment: async ({ issue_number: n, body }) => { hechas.push(['comenta', n, body]); },
    create: async ({ title, body, labels }) => { const n = 100 + hechas.length; incidencias.push({ number: n, title, labels, state: 'open' }); hechas.push(['abre', title, body, labels]); },
    update: async ({ issue_number: n, state, state_reason: razon }) => { hechas.push(['cierra', n, state, razon]); },
  };
  return { cliente: { rest: { issues } }, hechas, incidencias };
}
const repo = { owner: 'yo', repo: 'r' };
const context = { repo, serverUrl: 'https://github.com', runId: 7 };

test('avisar comenta en la abierta con su etiqueta o abre una; cerrar comenta y cierra todas como completadas', async () => {
  const sin = github();
  await avisar(sin.cliente, repo, { etiqueta: 'vigilancia', titulo: 'T', cuerpo: 'c' });
  eq(JSON.stringify(sin.hechas), JSON.stringify([['abre', 'T', 'c', ['vigilancia']]]), 'sin abierta no abre una');
  const con = github([{ number: 5, title: 'T', labels: ['vigilancia'], state: 'open' }, { number: 6, title: 'otra', labels: ['tags'], state: 'open' }]);
  await avisar(con.cliente, repo, { etiqueta: 'vigilancia', titulo: 'T', cuerpo: 'c2' });
  eq(JSON.stringify(con.hechas), JSON.stringify([['comenta', 5, 'c2']]), 'con una abierta crea otra (doce avisos del mismo problema)');
  await cerrarTodas(con.cliente, repo, { etiqueta: 'vigilancia', mensaje: 'ok' });
  eq(JSON.stringify(con.hechas.slice(1)), JSON.stringify([['comenta', 5, 'ok'], ['cierra', 5, 'closed', 'completed']]), 'no cierra, o cierra la de otra etiqueta');
});

test('la vigilancia: con algo mal avisa con lo que hay que mirar arriba; con todo bien cierra', async () => {
  for (const [f, t] of [['rancios', 'Los datos tienen 80 horas'], ['caras', 'Popol and Kupa cambió de cara'], ['diagnostico', '[FALLO] algo'], ['pruebas', 'x'.repeat(6000) + 'FINAL']]) writeFileSync(join(tmp, `${f}.txt`), t);
  const ficheros = Object.fromEntries(['rancios', 'caras', 'diagnostico', 'pruebas'].map((f) => [f, join(tmp, `${f}.txt`)]));
  const cuerpo = cuerpoDeVigilancia({ filaPerdida: true, rancios: true, caras: true, enlace: 'E', ficheros });
  ok(cuerpo.indexOf('NO se ha guardado') < cuerpo.indexOf('80 horas') && cuerpo.indexOf('80 horas') < cuerpo.indexOf('Popol') && cuerpo.indexOf('Popol') < cuerpo.indexOf('[FALLO] algo'), 'lo que obliga a mirar no va arriba');
  ok(cuerpo.includes('FINAL') && !cuerpo.includes('x'.repeat(5001)), 'de las pruebas no sube los últimos 5.000 caracteres');
  ok(!cuerpoDeVigilancia({ filaPerdida: false, rancios: false, caras: false, enlace: 'E', ficheros }).includes('80 horas'), 'los rancios salen sin que su paso fallara');
  const g = github([{ number: 9, title: 'Vigilancia: la app publicada falla', labels: ['vigilancia'], state: 'open' }]);
  await vigilancia({ github: g.cliente, context, mal: false });
  eq(g.hechas.at(-1)?.[0], 'cierra', 'con todo bien no cierra la incidencia');
  const g2 = github();
  await vigilancia({ github: g2.cliente, context, mal: true, filaPerdida: false, rancios: false, caras: false });
  ok(g2.hechas[0]?.[0] === 'abre' && g2.hechas[0][1] === 'Vigilancia: la app publicada falla' && g2.hechas[0][2].includes('actions/runs/7'), `con algo mal no abre la de siempre: ${JSON.stringify(g2.hechas)}`);
});

test('el mantenimiento avisa de héroes nuevos y de kits rehechos sin duplicar el título abierto', async () => {
  const meta = { newHeroes: ['Nuevo'], heroesCambiados: [{ name: 'Nana', antes: 'a', ahora: 'b' }] };
  const g = github();
  await mantenimiento({ github: g.cliente, context, meta });
  eq(g.hechas.map((h) => h[1]).join(' | '), 'Héroes nuevos sin tags propios: Nuevo | Héroes con el kit rehecho: Nana');
  ok(g.hechas.every((h) => h[3].join() === 'tags') && g.hechas[1][2].includes('`a` → `b`'), 'sin etiqueta tags o sin el antes y el después');
  await mantenimiento({ github: g.cliente, context, meta });
  eq(g.hechas.length, 2, 'duplica un aviso con el mismo título abierto');
  ok(await abrirSiNueva(g.cliente, repo, { etiqueta: 'tags', titulo: 'Héroes nuevos sin tags propios: Nuevo, Otro', cuerpo: '' }), 'con la lista cambiada no avisa');
  await mantenimiento({ github: github().cliente, context, meta: {} });
});

test('el bot del modelo abre la propuesta solo si la medida lo dice', async () => {
  const silencio = { info: () => {} };
  const g = github();
  ok(!(await propuestaDelModelo({ github: g.cliente, context, core: silencio, propuesta: { decision: { proponer: false, motivo: 'no mejora' } }, texto: 't' })) && !g.hechas.length, 'abre la incidencia sin propuesta');
  ok(!(await propuestaDelModelo({ github: g.cliente, context, core: silencio, propuesta: {}, texto: 't' })) && !g.hechas.length, 'abre la incidencia sin decisión');
  ok(await propuestaDelModelo({ github: g.cliente, context, core: silencio, propuesta: { decision: { proponer: true } }, texto: 'mide' }), 'no abre con propuesta');
  ok(g.hechas[0][1] === 'Propuesta: recalibrar el modelo' && g.hechas[0][3].join() === 'modelo' && g.hechas[0][2].startsWith('mide'), JSON.stringify(g.hechas));
});

test('las tablas de reglas.js se sustituyen tal cual: un `$&` del texto nuevo no se interpreta', () => {
  const reglas = "x\nexport const SPECIALITY_TAGS = {\n  'Guard': ['tank'],\n};\ny\nexport const ROLE_VETO = {\n  tank: [],\n};\n";
  const nuevas = "export const SPECIALITY_TAGS = {\n  'Guard': ['tank', '$&'],\n};\nexport const ROLE_VETO = {\n  tank: [],\n};\n";
  const { texto, cambio } = sustituir(reglas, nuevas);
  ok(cambio && texto.includes("['tank', '$&']") && texto.startsWith('x\n') && texto.includes('\ny\n'), `sustituye mal: ${texto}`);
  eq(sustituir(reglas, reglas).cambio, false, 'dice que cambia con las mismas tablas');
  // Ejecutado como en mantenimiento.yml: escribe reglas.js y `cambio` en GITHUB_OUTPUT.
  const f = join(tmp, 'reglas.js'); const t = join(tmp, 'tablas.txt'); const salida = join(tmp, 'salida.txt');
  writeFileSync(f, reglas); writeFileSync(t, nuevas); writeFileSync(salida, '');
  const r = spawnSync(process.execPath, [join(RAIZ, 'scripts/bots/sustituir-tablas.mjs'), t, f], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: salida } });
  ok(r.status === 0 && readFileSync(f, 'utf8') === texto && readFileSync(salida, 'utf8') === 'cambio=true\n', `el script no hace lo mismo: ${r.stderr}`);
});
