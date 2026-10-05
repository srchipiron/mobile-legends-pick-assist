/**
 * La configuración de Claude Code del repositorio (.claude/settings.json):
 * el plugin ECC va con sus hooks APAGADOS (pedido el 3 de octubre de 2026).
 * Su perfil por defecto puede reescribir mandatos, bloquear ediciones y
 * mandar texto de la conversación a otro modelo; aquí ya hay guardarraíles
 * propios. ECC lee el interruptor general de `ECC_HOOKS_ENABLED`
 * (su `hook-flags.js`) y Claude Code pasa `env` a los hooks.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

await terminar('scripts/claude-config');
