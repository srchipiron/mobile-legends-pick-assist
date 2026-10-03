/**
 * La configuración de Claude Code del repositorio (.claude/settings.json):
 * el plugin ECC va con sus hooks APAGADOS (pedido el 3 de octubre de 2026).
 * Su perfil por defecto puede reescribir mandatos, bloquear ediciones y
 * mandar texto de la conversación a otro modelo; aquí ya hay guardarraíles
 * propios. ECC lee el interruptor general de `ECC_HOOKS_ENABLED`
 * (su `hook-flags.js`) y Claude Code pasa `env` a los hooks.
 */
import { readFileSync } from 'node:fs';
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

await terminar('scripts/claude-config');
