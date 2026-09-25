#!/usr/bin/env node
/**
 * Mete en `historial/partidas.json` (la base de datos de TUS partidas) lo
 * que trae un código de perfil de la app. El código viaja en el cuerpo de
 * una incidencia de GitHub que abre el propio móvil («Tus partidas» →
 * «Enviar al proyecto»), y `partidas.yml` llama a esto.
 *
 *   node scripts/importar-partidas.mjs <fichero con el código dentro> [--out historial/partidas.json] [--incidencia N]
 *   node scripts/importar-partidas.mjs --codigo MLPA1.xxx.yyy
 *
 * El texto de entrada es DATO, no instrucciones: solo se busca en él la
 * forma exacta de un código (`MLPA1.<cuerpo>.<control>`), se descodifica con
 * el mismo lector que la app (suma de control, `sanear`) y se funde con lo
 * guardado por instante de partida: el móvil gana en el empate, porque es
 * el que lleva las correcciones. Solo se quita lo que el móvil marca como
 * quitado a propósito (`olvidadas`, 3.10.1); las marcas se guardan aquí
 * también, para que un código más viejo no la devuelva.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { leerPerfil, fundirPerfil } from '../src/motor/perfil.js';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto = null) => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : porDefecto; };
const salida = opcion('--out', 'historial/partidas.json');
const incidencia = opcion('--incidencia', null);
const fichero = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

export const PATRON_CODIGO = /MLPA1\.[A-Za-z0-9_-]+\.[a-z0-9]+/;

export function leerGuardado(ruta) {
  if (!existsSync(ruta)) return { actualizado: null, partidas: [], maestria: {}, olvidadas: [], envios: [] };
  const g = JSON.parse(readFileSync(ruta, 'utf8'));
  return { actualizado: g.actualizado ?? null, partidas: Array.isArray(g.partidas) ? g.partidas : [], maestria: g.maestria ?? {}, olvidadas: Array.isArray(g.olvidadas) ? g.olvidadas : [], envios: Array.isArray(g.envios) ? g.envios : [] };
}

export async function importar(texto, ruta, { incidencia = null, ahora = new Date() } = {}) {
  const m = String(texto ?? '').match(PATRON_CODIGO);
  if (!m) return { error: 'sin-codigo' };
  const { perfil, error } = await leerPerfil(m[0]);
  if (error) return { error };
  const guardado = leerGuardado(ruta);
  // fundirPerfil: en el empate por instante gana `actual`. El móvil es la
  // verdad (lleva la corrección de un resultado), así que va de `actual`.
  const fundido = fundirPerfil(
    { mastery: perfil.mastery, partidas: perfil.partidas, olvidadas: perfil.olvidadas },
    { mastery: guardado.maestria, partidas: guardado.partidas, olvidadas: guardado.olvidadas },
  );
  const quedan = new Set(fundido.partidas.map((p) => String(p.t)));
  const quitadas = guardado.partidas.filter((p) => !quedan.has(String(p.t))).length;
  const antes = new Set(guardado.partidas.map((p) => String(p.t)));
  const nuevas = fundido.partidas.filter((p) => !antes.has(String(p.t))).length;
  const registro = {
    actualizado: ahora.toISOString(),
    partidas: fundido.partidas,
    maestria: fundido.mastery,
    olvidadas: fundido.olvidadas,
    envios: [...guardado.envios, { cuando: ahora.toISOString(), partidas: perfil.partidas.length, heroes: Object.keys(perfil.mastery).length, incidencia: incidencia ? Number(incidencia) : null }].slice(-200),
  };
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(registro, null, 1)}\n`);
  return { antes: guardado.partidas.length, enElEnvio: perfil.partidas.length, ahora: fundido.partidas.length, nuevas, quitadas, heroes: Object.keys(fundido.mastery).length };
}

if (process.argv[1] && process.argv[1].endsWith('importar-partidas.mjs')) {
  const texto = opcion('--codigo') ?? (fichero ? readFileSync(fichero, 'utf8') : '');
  const r = await importar(texto, salida, { incidencia });
  if (r.error === 'sin-codigo') { console.error('No hay ningún código de perfil (MLPA1.….…) en la entrada.'); process.exit(2); }
  if (r.error) { console.error(`El código no se puede leer: ${r.error}.`); process.exit(2); }
  console.log(`Partidas guardadas antes: ${r.antes} · en el envío: ${r.enElEnvio} · ahora: ${r.ahora} (${r.nuevas} nuevas, ${r.quitadas} quitadas a propósito) · héroes con maestría: ${r.heroes}`);
}
