/**
 * La configuración de Claude Code del repositorio (.claude/settings.json):
 * el plugin ECC va con sus hooks APAGADOS (pedido el 3 de octubre de 2026).
 * Su perfil por defecto puede reescribir mandatos, bloquear ediciones y
 * mandar texto de la conversación a otro modelo; aquí ya hay guardarraíles
 * propios. ECC lee el interruptor general de `ECC_HOOKS_ENABLED`
 * (su `hook-flags.js`) y Claude Code pasa `env` a los hooks.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';

const ajustes = JSON.parse(readFileSync(join(RAIZ, '.claude', 'settings.json'), 'utf8'));

test('si el plugin ECC está activado, sus hooks van apagados', () => {
  if (ajustes.enabledPlugins?.['ecc@ecc'] !== true) return;
  eq(String(ajustes.env?.ECC_HOOKS_ENABLED ?? '').toLowerCase(), 'false', 'ECC va activado con sus hooks encendidos');
  ok(!ajustes.hooks, 'hay hooks propios en settings.json: los hooks del proyecto se deciden aparte, no se cuelan aquí');
});

test('el marketplace de ECC es el oficial (affaan-m/ECC), no una copia', () => {
  const m = ajustes.extraKnownMarketplaces?.ecc;
  if (!m) return;
  eq(`${m.source?.source}:${m.source?.repo}`, 'github:affaan-m/ECC', 'el marketplace de ECC apunta a otro sitio');
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
 * CLAUDE.md se carga ENTERO en cada sesión (y en cada subagente y cada
 * «@claude» de GitHub). Llegó a 3.948 líneas y 272 KB (unos 75.000 tokens
 * antes de escribir nada) porque cada iteración le añadía su lección. Desde
 * el 14 de octubre de 2026 lleva solo lo que vale para cualquier tarea; lo de
 * cada zona va en `.claude/rules/` (se carga al tocar esa zona) y la historia
 * en `docs/historia/`. Tope: unas 60 líneas por encima de lo que tiene hoy.
 */
const MAX_LINEAS_CLAUDE = 250;
const MAX_BYTES_CLAUDE = 16 * 1024;

test('CLAUDE.md no vuelve a crecer sin freno (14 de octubre de 2026)', () => {
  const texto = readFileSync(join(RAIZ, 'CLAUDE.md'), 'utf8');
  const lineas = texto.split('\n').length;
  ok(lineas <= MAX_LINEAS_CLAUDE, `CLAUDE.md tiene ${lineas} líneas (tope ${MAX_LINEAS_CLAUDE}): lo de una zona va en .claude/rules/, la historia en docs/historia/`);
  ok(Buffer.byteLength(texto) <= MAX_BYTES_CLAUDE, `CLAUDE.md pesa ${Buffer.byteLength(texto)} bytes (tope ${MAX_BYTES_CLAUDE})`);
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

await terminar('scripts/claude-config');
