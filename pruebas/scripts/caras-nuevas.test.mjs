/**
 * El aviso de caras nuevas (3.102.0, scripts/caras-nuevas.mjs): la vigilancia
 * abre la incidencia de siempre cuando el juego cambia el dibujo de un héroe
 * y el lector de la tablet aún no lo tiene.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';

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

test('la vigilancia lo corre tras los datos rancios, con pipefail, y su resultado llega a la incidencia como CARAS', () => {
  const v = readFileSync(join(RAIZ, '.github/workflows/vigilancia.yml'), 'utf8');
  const pasos = v.split(/\n(?=\s*- name: )/);
  const i = pasos.findIndex((p) => /- name: Caras nuevas en el juego\n/.test(p));
  ok(i >= 0, 'la vigilancia no tiene el paso «Caras nuevas en el juego»');
  const paso = pasos[i];
  ok(/^\s*id: caras$/m.test(paso) && /^\s*if: \$\{\{ !cancelled\(\) \}\}$/m.test(paso) && /^\s*shell: bash$/m.test(paso), 'el paso de las caras sin id, sin bash (pipefail) o se salta tras un fallo');
  ok(/^\s*run: node scripts\/caras-nuevas\.mjs 2>&1 \| tee \/tmp\/caras\.txt$/m.test(paso), 'el paso no corre scripts/caras-nuevas.mjs, o no deja lo que dice donde lo lee la incidencia');
  ok(pasos.findIndex((p) => p.includes('run: node scripts/datos-rancios.mjs')) < i, 'las caras se miran antes que los datos rancios');
  const abrir = pasos.findIndex((p) => /- name: Abrir incidencia/.test(p));
  ok(abrir > i, 'la vigilancia no mira las caras antes de abrir la incidencia');
  ok(/^\s*CARAS: \$\{\{ steps\.caras\.outcome == 'failure' \}\}$/m.test(pasos[abrir]) && /\bcaras: si\('CARAS'\)/.test(pasos[abrir]), 'el resultado de las caras no llega a la incidencia');
  // Y NO va en npm test: una cara nueva llega con los datos del bot y tiraría el despliegue.
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
  ok(!JSON.stringify(pkg.scripts).includes('caras-nuevas'), 'el aviso de caras va en npm test');
});
