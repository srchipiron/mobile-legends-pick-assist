/**
 * La base de datos de TUS partidas (3.8.0): el código de perfil que manda el
 * móvil se lee, se funde sin perder nada, se mide el modelo contra los
 * drafts y el workflow que lo hace solo escucha al dueño del repositorio.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportarPerfil, recogerPerfil } from '../../src/motor/perfil.js';
import { importar, PATRON_CODIGO } from '../../scripts/importar-partidas.mjs';
import { medir, informe, auc } from '../../scripts/medir-mias.mjs';
import { leerWorkflow, mandatos } from '../fixtures/yaml-workflows.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'partidas-'));

const partidasDe = (n, desde = 1700000000000) => Array.from({ length: n }, (_, i) => ({
  t: desde + i * 3600000, pick: i % 2 ? 'Tigreal' : 'Atlas', gane: i % 3 !== 0, rango: 'glory', recomendados: ['Atlas', 'Tigreal', 'Khufra'],
  estimacion: 0.5 + (i % 5) * 0.02, bans: ['Hirara'], draft: { linea: 'roam', enemigos: ['Layla', 'Fanny', 'Pharsa'], aliados: ['Chou', 'Miya'], rival: 'Layla' },
}));

test('importar: el código se encuentra dentro de cualquier texto, se funde por instante y el móvil gana en el empate', async () => {
  const ruta = join(dir, 'partidas.json');
  const perfil = recogerPerfil({ mastery: { Tigreal: { games: 300, winRate: 0.55 } }, partidas: partidasDe(3), rango: 'glory', linea: 'roam' });
  const codigo = await exportarPerfil(perfil);
  ok(PATRON_CODIGO.test(codigo), 'el patrón no casa con un código de verdad');
  // El cuerpo de una incidencia: texto alrededor, bloque de código, saltos.
  const r1 = await importar(`Enviado desde la app.\n\n\`\`\`\n${codigo}\n\`\`\`\nGracias`, ruta, { incidencia: 12 });
  eq(r1.error, undefined, `no importa: ${r1.error}`);
  eq(r1.ahora, 3); eq(r1.nuevas, 3);
  const g1 = JSON.parse(readFileSync(ruta, 'utf8'));
  eq(g1.partidas.length, 3); eq(g1.maestria.Tigreal.games, 300); eq(g1.envios[0].incidencia, 12);
  ok(g1.partidas[0].draft?.enemigos?.length === 3, 'el draft no se guarda entero');
  // Segundo envío: una partida corregida (gana → pierde), una nueva y una menos (borrada en el móvil).
  const segundo = partidasDe(3);
  segundo[0] = { ...segundo[0], gane: !segundo[0].gane };
  const nuevas = [...segundo.slice(0, 2), ...partidasDe(1, 1800000000000)];
  const r2 = await importar(await exportarPerfil(recogerPerfil({ mastery: { Tigreal: { games: 250, winRate: 0.5 }, Atlas: { games: 10, winRate: 0.6 } }, partidas: nuevas })), ruta);
  eq(r2.ahora, 4, 'la partida borrada en el móvil se ha perdido del repositorio, o la nueva no ha entrado');
  eq(r2.nuevas, 1);
  const g2 = JSON.parse(readFileSync(ruta, 'utf8'));
  const corregida = g2.partidas.find((p) => p.t === segundo[0].t);
  eq(corregida.gane, segundo[0].gane, 'en el empate por instante no gana la copia del móvil (la corrección se pierde)');
  eq(g2.maestria.Tigreal.games, 300, 'la maestría con más partidas no gana');
  eq(g2.maestria.Atlas.games, 10);
  eq(g2.envios.length, 2);
  // Sin código: error claro, y el fichero no se toca.
  const antes = readFileSync(ruta, 'utf8');
  eq((await importar('hola MLPA1 nada', ruta)).error, 'sin-codigo');
  eq((await importar('MLPA1.zAAAA.xyz', ruta)).error, 'incompleto');
  eq(readFileSync(ruta, 'utf8'), antes, 'un envío inválido ha tocado el fichero');
  // Y el script de verdad, por la línea de mandatos, con código de salida.
  writeFileSync(join(dir, 'cuerpo.txt'), `x\n${codigo}\ny`);
  const r = spawnSync(process.execPath, ['scripts/importar-partidas.mjs', join(dir, 'cuerpo.txt'), '--out', join(dir, 'cli.json')], { cwd: RAIZ, encoding: 'utf8' });
  eq(r.status, 0, `el script falla: ${r.stderr}`);
  ok(/ahora: 3/.test(r.stdout), `no resume lo importado: ${r.stdout}`);
  const malo = spawnSync(process.execPath, ['scripts/importar-partidas.mjs', '--codigo', 'nada', '--out', join(dir, 'no.json')], { cwd: RAIZ, encoding: 'utf8' });
  ok(malo.status !== 0 && !existsSync(join(dir, 'no.json')), 'sin código el script sale en verde o escribe el fichero');
});

test('medir-mias: veredicto, calibración y el modelo de hoy sobre los drafts guardados; nunca falla por pocas partidas', () => {
  eq(auc([{ p: 0.6, y: 1 }, { p: 0.4, y: 0 }]), 1);
  eq(auc([{ p: 0.6, y: 0 }, { p: 0.4, y: 1 }]), 0);
  eq(auc([{ p: 0.5, y: 1 }]), null);
  const vacio = medir({ partidas: [], maestria: {} }, null);
  eq(vacio.n, 0);
  ok(/Todavía no hay partidas/.test(informe(vacio)), 'con cero partidas no lo dice');
  const registro = { partidas: [...partidasDe(24), { t: 1, pick: 'Tigreal', gane: true, previa: true, recomendados: [] }], maestria: { Tigreal: { games: 500, winRate: 0.53 } } };
  const r = spawnSync(process.execPath, ['-e', `
    import('${RAIZ}/scripts/medir-mias.mjs').then(async ({ medir, informe }) => {
      const { readFileSync } = await import('node:fs');
      const { prepararDatos } = await import('${RAIZ}/src/motor/draft.js');
      const catalogo = JSON.parse(readFileSync('${RAIZ}/public/data/heroes.json', 'utf8'));
      const meta = JSON.parse(readFileSync('${RAIZ}/public/data/roam-meta.json', 'utf8'));
      const m = medir(${JSON.stringify(registro)}, prepararDatos({ catalogo, meta }));
      console.log(JSON.stringify({ n: m.n, conApp: m.conApp, previas: m.previas, hoy: m.hoy.n, auc: m.hoy.auc, brier: m.hoy.brier, pendiente: m.hoy.pendiente, cal: m.calibracion.n, heroes: m.porHeroe.length, meses: m.porMes.length }));
      console.log(informe(m, { generado: meta.generatedAt }));
    });
  `], { cwd: RAIZ, encoding: 'utf8' });
  eq(r.status, 0, `medir falla: ${r.stderr}`);
  const [json, ...resto] = r.stdout.split('\n');
  const m = JSON.parse(json);
  eq(m.n, 25); eq(m.conApp, 24); eq(m.previas, 1);
  eq(m.hoy, 24, 'no re-puntúa todos los drafts con el modelo de hoy');
  ok(m.hoy && m.brier > 0 && m.brier < 1 && m.auc != null, 'sin Brier o AUC');
  ok(m.pendiente && Number.isFinite(m.pendiente.b) && m.pendiente.se > 0, 'sin pendiente con 24 partidas');
  eq(m.cal, 24); eq(m.heroes, 2); ok(m.meses >= 1);
  const texto = resto.join('\n');
  for (const s of ['¿Sirve seguir a la app?', 'Brier', 'AUC', '### Por héroe', '### Por mes', '| Tigreal |']) ok(texto.includes(s), `el informe no lleva «${s}»`);
  // Y el script entero contra el fichero del repositorio, con código de salida 0.
  const cli = spawnSync(process.execPath, ['scripts/medir-mias.mjs', '--json', join(dir, 'mias.json')], { cwd: RAIZ, encoding: 'utf8' });
  eq(cli.status, 0, `medir-mias.mjs falla: ${cli.stderr}`);
  ok(/## Tus partidas/.test(cli.stdout) && existsSync(join(dir, 'mias.json')), 'no escribe el informe o el JSON');
});

test('partidas.yml: solo el dueño, solo con un código dentro, cuerpo por variable, con tope y rebase antes del push', () => {
  const w = leerWorkflow('partidas.yml');
  const job = w.jobs[0];
  const condicion = job.claves.if ?? '';
  ok(/repository_owner/.test(condicion), 'el workflow no exige que la incidencia sea del dueño: cualquiera podría meter partidas en tu base de datos');
  ok(/MLPA1\./.test(condicion), 'el workflow no exige que el cuerpo lleve un código');
  ok(/^\d+$/.test(job.claves['timeout-minutes'] ?? ''), 'sin timeout-minutes');
  const lee = w.pasos.find((p) => mandatos(p.run).some((c) => /importar-partidas\.mjs/.test(c)));
  ok(lee, 'no llama a importar-partidas.mjs');
  ok(!/github\.event\.issue\.body/.test(lee.run ?? ''), 'el cuerpo de la incidencia va DENTRO del mandato (inyección)');
  ok(/CUERPO/.test(lee['env.CUERPO'] ?? '') || lee['env.CUERPO'] !== undefined, 'el cuerpo no llega por variable de entorno');
  const push = w.pasos.find((p) => mandatos(p.run).some((c) => /^git push\b/.test(c)));
  ok(push, 'no hace push');
  const orden = mandatos(push.run);
  ok(orden.findIndex((c) => /^git pull --rebase\b/.test(c)) < orden.findIndex((c) => /^git push\b/.test(c)), 'push sin rebase antes');
  ok(w.pasos.some((p) => /issues\.createComment/.test(p['with.script'] ?? '')), 'no responde en la incidencia');
  ok(w.claves?.['permissions.issues'] === 'write' || /issues:\s*write/.test(readFileSync(join(RAIZ, '.github/workflows/partidas.yml'), 'utf8')), 'sin permiso para responder');
});

await terminar('scripts/partidas');
