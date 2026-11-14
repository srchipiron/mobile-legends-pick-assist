#!/usr/bin/env node
/**
 * El mantenimiento de los lunes: cambia en reglas.js los bloques
 * `SPECIALITY_TAGS` y `ROLE_VETO` por los que imprimió derivar-tags.mjs, y
 * escribe `cambio=true|false` en GITHUB_OUTPUT. Se sustituye con una FUNCIÓN:
 * con una cadena, un `$&` del texto nuevo se interpretaba [C].
 *
 *   node scripts/bots/sustituir-tablas.mjs /tmp/tablas.txt src/motor/reglas.js
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BLOQUES = ['SPECIALITY_TAGS', 'ROLE_VETO'];
const bloque = (texto, nombre) => texto.match(new RegExp(`export const ${nombre} = \\{[\\s\\S]*?\\n\\};`))?.[0] ?? '';

/** `{ texto, cambio }`: los bloques de `reglas` sustituidos por los de `nuevas`, si están en los dos y difieren. */
export function sustituir(reglas, nuevas) {
  let texto = reglas;
  let cambio = false;
  for (const nombre of BLOQUES) {
    const viejo = bloque(reglas, nombre);
    const nuevo = bloque(nuevas, nombre);
    if (viejo && nuevo && viejo !== nuevo) { texto = texto.replace(viejo, () => nuevo); cambio = true; }
  }
  return { texto, cambio };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tablas, reglas] = process.argv.slice(2);
  const { texto, cambio } = sustituir(readFileSync(reglas, 'utf8'), readFileSync(tablas, 'utf8'));
  if (cambio) writeFileSync(reglas, texto);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `cambio=${cambio}\n`);
  console.log(cambio ? 'Tablas de deducción cambiadas.' : 'Las tablas de deducción no cambian.');
}
