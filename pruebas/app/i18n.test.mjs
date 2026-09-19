/**
 * Los idiomas: ningún idioma a medias, y toda clave que se escribe en la
 * interfaz o en el motor existe. Un `t('pro.inexistente')` pasaba y salía
 * la clave cruda en pantalla (probado por mutación en 1.32.4): por eso se
 * recorren `t('…')`, `t(\`prefijo.${…}\`)` y `clave: '…'` en TODOS los
 * ficheros de la app y del motor, no en una lista fija.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { CLAVES, DICCIONARIOS, crearT, idiomaPorDefecto, IDIOMAS } from '../../src/app/i18n/index.js';
import { COUNTER_RULES, TEAM_NEEDS, DANGER_RULES } from '../../src/motor/reglas.js';

function ficherosDe(dir) {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? ficherosDe(r) : (/\.(jsx?|mjs)$/.test(r) ? [r] : []);
  });
}

test('los dos idiomas están completos', () => {
  for (const idioma of IDIOMAS) {
    const faltan = CLAVES.filter((k) => !DICCIONARIOS[idioma][k]);
    ok(!faltan.length, `${idioma} sin traducir: ${faltan.slice(0, 6).join(', ')}`);
    const sobran = Object.keys(DICCIONARIOS[idioma]).filter((k) => !CLAVES.includes(k));
    ok(!sobran.length, `${idioma} tiene claves que no existen en español: ${sobran.join(', ')}`);
  }
});

test('las reglas usan claves de verdad', () => {
  const usadas = [...COUNTER_RULES.map((r) => r.why), ...TEAM_NEEDS.map((n) => n.why), ...DANGER_RULES.map((r) => r.why)];
  for (const clave of usadas) {
    ok(typeof clave === 'string', `why debería ser una clave, no ${typeof clave}`);
    ok(CLAVES.includes(clave), `la regla usa una clave que no existe: ${clave}`);
  }
});

test('toda clave escrita en la interfaz o en el motor existe', () => {
  const fuentes = [...ficherosDe(join(RAIZ, 'src/app')), ...ficherosDe(join(RAIZ, 'src/motor'))]
    .filter((f) => !relative(RAIZ, f).startsWith('src/app/i18n/'));
  ok(fuentes.length >= 30, `solo ${fuentes.length} ficheros: la búsqueda ya no recorre la app entera`);
  const literales = new Set(); const prefijos = new Set();
  for (const f of fuentes) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) literales.add(m[1]);
    for (const m of src.matchAll(/\bclave: '([a-zA-Z0-9_.]+)'/g)) literales.add(m[1]);
    for (const m of src.matchAll(/\bclave: ([a-z]+) === '[a-z]+' \? '([a-zA-Z0-9_.]+)' : '([a-zA-Z0-9_.]+)'/g)) { literales.add(m[2]); literales.add(m[3]); }
    for (const m of src.matchAll(/\bt\(`([a-zA-Z0-9_.]+)\$\{/g)) prefijos.add(m[1]);
  }
  ok(literales.size >= 100, `solo ${literales.size} claves literales encontradas: la expresión ya no casa con cómo se escribe t()`);
  const perdidas = [...literales].filter((k) => !CLAVES.includes(k));
  ok(!perdidas.length, `la interfaz o el motor usan claves que no existen: ${perdidas.join(', ')}`);
  for (const pre of prefijos) ok(CLAVES.some((k) => k.startsWith(pre)), `t(\`${pre}…\`) no tiene ninguna clave con ese prefijo`);
});

test('los parámetros y los plurales se sustituyen en los dos idiomas', () => {
  for (const idioma of IDIOMAS) {
    const t = crearT(idioma);
    const frase = t('regla.antiDash', { e: 'Fanny' });
    ok(frase.includes('Fanny'), `${idioma} no sustituye el parámetro: ${frase}`);
    ok(!frase.includes('{e}'), `${idioma} deja el hueco sin rellenar: ${frase}`);
    // «1 líneas abiertas» y «Les faltan 1 picks» salían con el plural fijo.
    const uno = t('equipo.lineas', { n: 1 }); const dos = t('equipo.lineas', { n: 2 });
    ok(!/\|/.test(uno) && !/\|/.test(dos) && uno !== dos, `${idioma} no elige el plural: ${uno} / ${dos}`);
    // Una lista de claves se traduce elemento a elemento.
    const lista = t('analisis.equipoLeFalta', { yo: 'X', lista: ['comp.tanky', 'comp.cc_hard'] });
    ok(!lista.includes('comp.'), `${idioma} no traduce la lista: ${lista}`);
    // El motivo del equilibrio de daño lleva el tipo como clave traducible.
    const dano = t('regla.equilibraDano', { tipo: ['comp.magico'] });
    ok(!/[{}|]/.test(dano) && !dano.includes('comp.'), `${idioma} no traduce el tipo de daño: ${dano}`);
  }
});

test('una clave que no existe se devuelve tal cual, y el idioma por defecto es uno soportado', () => {
  eq(crearT('es')('no.existe.esta'), 'no.existe.esta');
  ok(IDIOMAS.includes(idiomaPorDefecto()), 'el idioma por defecto no es uno de los soportados');
});

await terminar('app/i18n');
