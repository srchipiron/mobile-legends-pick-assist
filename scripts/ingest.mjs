#!/usr/bin/env node
/**
 * La ingesta de datos meta: la entrada que lanzan los workflows y las
 * pruebas (todo vive en scripts/ingesta/).
 *
 *   node scripts/ingest.mjs --rank glory --days 7 --out /tmp/nueva.json
 *   node scripts/ingest.mjs --base http://127.0.0.1:8816/api --pausa 0 --out /tmp/x.json   (pruebas)
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './ingesta/cli.mjs';

export { main };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Ingesta fallida:', err.message);
    process.exit(1);
  });
}
