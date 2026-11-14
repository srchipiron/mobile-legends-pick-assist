/**
 * El aviso de caras nuevas (3.102.0, scripts/caras-nuevas.mjs): la vigilancia
 * abre la incidencia de siempre cuando el juego cambia el dibujo de un héroe
 * y el lector de la tablet aún no lo tiene.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';

const cdn = (carpeta, f) => `https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_${carpeta}_1/100_${f}.png`;

test('sale con 1 y dice cuáles, solo con otra imagen o un héroe nuevo; otra carpeta del CDN no es una cara nueva', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caras-'));
  const correr = (heroes, fuentes) => {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ heroes }));
    writeFileSync(join(dir, 'caras.json'), JSON.stringify({ lado: 24, fuentes, caras: {} }));
    return spawnSync(process.execPath, [join(RAIZ, 'scripts/caras-nuevas.mjs'), join(dir, 'meta.json'), join(dir, 'caras.json')], { encoding: 'utf8' });
  };
  // El 11 de noviembre de 2026: todas cambiaron de carpeta y solo dos de imagen.
  const alDia = correr([{ name: 'Miya', cara: cdn(1235, 'aaa') }, { name: 'Sin cara' }], { Miya: cdn(1232, 'aaa') });
  ok(alDia.status === 0 && /al día/.test(alDia.stdout), `otra carpeta del CDN abre incidencia: ${alDia.stdout}`);
  const nuevas = correr([{ name: 'Miya', cara: cdn(1235, 'aaa') }, { name: 'Popol and Kupa', cara: cdn(1235, 'nuevo') }, { name: 'Recién Salido', cara: cdn(1235, 'x') }],
    { Miya: cdn(1232, 'aaa'), 'Popol and Kupa': cdn(1232, 'viejo') });
  eq(nuevas.status, 1, 'con una cara nueva no falla');
  ok(/Popol and Kupa, Recién Salido/.test(nuevas.stdout) && !/Miya/.test(nuevas.stdout) && /sacar-caras\.mjs/.test(nuevas.stdout), `no dice cuáles ni cómo se arregla: ${nuevas.stdout}`);
  // Sin los ficheros no se sabe: no es una incidencia.
  eq(spawnSync(process.execPath, [join(RAIZ, 'scripts/caras-nuevas.mjs'), join(dir, 'no-hay.json'), join(dir, 'caras.json')], { encoding: 'utf8' }).status, 0);
});

test('la vigilancia lo corre tras los datos rancios, con pipefail, y lo pone arriba en la incidencia', () => {
  const v = readFileSync(join(RAIZ, '.github/workflows/vigilancia.yml'), 'utf8');
  const paso = v.indexOf('run: node scripts/caras-nuevas.mjs');
  ok(paso > v.indexOf('scripts/datos-rancios.mjs') && paso < v.indexOf('name: Abrir incidencia'), 'la vigilancia no mira las caras antes de abrir la incidencia');
  ok(/id: caras\n\s*if: \$\{\{ !cancelled\(\) \}\}\n\s*shell: bash\n\s*run: node scripts\/caras-nuevas\.mjs 2>&1 \| tee \/tmp\/caras\.txt/.test(v), 'el paso de las caras sin bash (pipefail) o se salta tras un fallo');
  ok(v.includes("steps.caras.outcome }}' === 'failure'") && v.includes("leer('/tmp/caras.txt')"), 'la incidencia no dice qué caras faltan');
  // Y NO va en npm test: una cara nueva llega con los datos del bot y tiraría el despliegue.
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
  ok(!JSON.stringify(pkg.scripts).includes('caras-nuevas'), 'el aviso de caras va en npm test');
});

await terminar('scripts/caras-nuevas');
