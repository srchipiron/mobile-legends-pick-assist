/**
 * La configuración de Claude Code del repositorio: `.claude/settings.json`
 * mínimo (sin plugins ni hooks: el plugin ECC no carga en la nube y sus hooks
 * reescribían mandatos; lo útil va copiado en `.claude/agents/`), CLAUDE.md y
 * las reglas de zona con tope, y lo que CLAUDE.md cita, existiendo.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';

const ajustes = JSON.parse(readFileSync(join(RAIZ, '.claude', 'settings.json'), 'utf8'));

test('settings.json no instala plugins ni hooks (4.0): nada reescribe mandatos ni manda la conversación fuera', () => {
  eq(JSON.stringify(Object.keys(ajustes).sort()), JSON.stringify(['env']), `settings.json con claves de más: ${Object.keys(ajustes)}`);
  ok(!('hooks' in ajustes) && !('enabledPlugins' in ajustes) && !('extraKnownMarketplaces' in ajustes), 'settings.json vuelve a traer plugins o hooks');
});

test('lo traído de ECC se carga (nombre y descripción), lleva su licencia y sus agentes solo leen (5 de octubre de 2026)', () => {
  // La declaración del plugin no lo instala en las sesiones en la nube: lo que sirve va copiado en .claude/.
  const dir = join(RAIZ, '.claude');
  const ficheros = [
    ...readdirSync(join(dir, 'agents')).filter((f) => f.endsWith('.md')).map((f) => join(dir, 'agents', f)),
    ...readdirSync(join(dir, 'skills')).map((d) => join(dir, 'skills', d, 'SKILL.md')).filter(existsSync),
  ];
  const deEcc = ficheros.filter((f) => /Adaptado de ECC/.test(readFileSync(f, 'utf8')));
  ok(deEcc.length >= 4, `faltan piezas de ECC en .claude/: ${deEcc.length}`);
  ok(/MIT License/.test(readFileSync(join(dir, 'ecc', 'LICENSE'), 'utf8')) && /Affaan Mustafa/.test(readFileSync(join(dir, 'ecc', 'LICENSE'), 'utf8')), 'falta la licencia MIT de ECC junto a lo copiado');
  for (const f of ficheros) {
    const texto = readFileSync(f, 'utf8');
    const cabecera = texto.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    ok(/^name: [\w-]+$/m.test(cabecera) && /^description: .{40,}$/m.test(cabecera), `${f}: sin nombre o descripción en la cabecera, Claude Code no lo carga`);
    const herramientas = cabecera.match(/^tools: (.*)$/m)?.[1];
    if (deEcc.includes(f) && herramientas) ok(!/\b(Edit|Write|NotebookEdit)\b/.test(herramientas), `${f}: un agente de revisión traído de ECC puede escribir (${herramientas})`);
  }
});

/**
 * CLAUDE.md se carga ENTERO en cada sesión (y en cada subagente). Llegó a 3.948
 * líneas y 272 KB porque cada iteración le añadía su lección. Desde 4.0 lleva solo
 * lo que vale para cualquier tarea (131 líneas); cada regla de zona tiene su tope
 * (`lector.md` llegó a 2.260 líneas y 154 KB, ~45.000 tokens al tocar un fichero).
 */
const MAX_LINEAS_CLAUDE = 140;
const MAX_BYTES_CLAUDE = 9 * 1024;
const MAX_LINEAS_REGLA = 220;
const MAX_BYTES_REGLA = 15 * 1024;

test('CLAUDE.md no vuelve a crecer sin freno (14 de octubre de 2026)', () => {
  const texto = readFileSync(join(RAIZ, 'CLAUDE.md'), 'utf8');
  const lineas = texto.split('\n').length;
  ok(lineas <= MAX_LINEAS_CLAUDE, `CLAUDE.md tiene ${lineas} líneas (tope ${MAX_LINEAS_CLAUDE}): lo de una zona va en .claude/rules/, lo demás en docs/`);
  ok(Buffer.byteLength(texto) <= MAX_BYTES_CLAUDE, `CLAUDE.md pesa ${Buffer.byteLength(texto)} bytes (tope ${MAX_BYTES_CLAUDE})`);
});

test('cada regla de zona lleva solo el estado actual, con tope (4.0): la crónica va a docs/archivo/', () => {
  const dir = join(RAIZ, '.claude', 'rules');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const texto = readFileSync(join(dir, f), 'utf8');
    const lineas = texto.split('\n').length;
    ok(lineas <= MAX_LINEAS_REGLA, `${f} tiene ${lineas} líneas (tope ${MAX_LINEAS_REGLA})`);
    ok(Buffer.byteLength(texto) <= MAX_BYTES_REGLA, `${f} pesa ${Buffer.byteLength(texto)} bytes (tope ${MAX_BYTES_REGLA})`);
  }
});

test('lo que CLAUDE.md dice que hay en docs/ existe', () => {
  const indice = readFileSync(join(RAIZ, 'CLAUDE.md'), 'utf8');
  for (const f of ['lecciones.md', 'descartados.md', 'decisiones.md', 'pendiente.md', 'paridad.md', 'comunidad.md']) {
    ok(indice.includes(`\`${f}\``), `CLAUDE.md no nombra docs/${f}`);
    ok(existsSync(join(RAIZ, 'docs', f)), `CLAUDE.md nombra docs/${f} y no existe`);
  }
});

/** Un glob de `paths:` (`**`, `*`, `?`, `{a,b}`) como expresión regular. */
export function globARegex(glob) {
  let r = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { r += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') r += '[^/]*';
    else if (c === '?') r += '[^/]';
    else if (c === '{') { const fin = glob.indexOf('}', i); r += `(?:${glob.slice(i + 1, fin).split(',').map((x) => x.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`; i = fin; }
    else r += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`);
}

test('cada regla de .claude/rules tiene su zona y la zona existe', () => {
  const repo = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);
  const dir = join(RAIZ, '.claude', 'rules');
  const reglas = readdirSync(dir).filter((f) => f.endsWith('.md'));
  ok(reglas.length >= 7, `faltan reglas por zona: ${reglas.length}`);
  const indice = readFileSync(join(RAIZ, 'CLAUDE.md'), 'utf8');
  for (const f of reglas) {
    const texto = readFileSync(join(dir, f), 'utf8');
    // Sin `paths:` se cargaría en CADA sesión: el tamaño que se quitó de CLAUDE.md volvería por aquí.
    const cabecera = texto.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
    ok(cabecera && /^paths:\s*$/m.test(cabecera), `${f}: sin \`paths:\` en la cabecera se carga siempre`);
    const globs = [...(cabecera ?? '').matchAll(/^\s+- "([^"]+)"$/gm)].map((m) => m[1]);
    ok(globs.length > 0, `${f}: \`paths:\` sin ninguna ruta`);
    // Un glob que no casa con nada es una regla que no se carga nunca, en silencio.
    for (const g of globs) ok(repo.some((r) => globARegex(g).test(r)), `${f}: «${g}» no casa con ningún fichero del repositorio`);
    ok(indice.includes(`.claude/rules/${f}`), `${f}: no está en el índice de CLAUDE.md, nadie sabe que existe`);
  }
});

test('el glob de las reglas casa como Claude Code', () => {
  ok(globARegex('src/motor/**').test('src/motor/diagnostico/seccion.js'), '** no baja de carpeta');
  ok(globARegex('scripts/medir-*.mjs').test('scripts/medir-pro.mjs') && !globARegex('scripts/medir-*.mjs').test('scripts/ingesta/medir-x.mjs'), '* cruza carpetas');
  ok(!globARegex('src/app/lector.js').test('src/app/lectorXjs'), 'el punto casa con cualquier cosa');
});
