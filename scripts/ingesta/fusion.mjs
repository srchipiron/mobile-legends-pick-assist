/**
 * Lo que se conserva de la corrida anterior y lo que eso le hace a la fecha:
 * de donde se lee lo previo, que se guarda heroe a heroe, como se funde la
 * matriz nueva con la guardada y cuando `generatedAt` puede decir «hoy».
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OUT, PREVIO, ROOT, diagnostics } from './contexto.mjs';
import { huellaDeKit } from '../../src/motor/catalogo.js';
import { HISTORIA_DIAS } from '../../src/motor/tendencia.js';

/**
 * Lo anterior se lee de los DATOS GUARDADOS, no de la salida: los tres
 * workflows escriben a un temporal (--out) que no existe, y con eso el
 * "conservo lo anterior" de cada endpoint conservaba la nada, y un fallo
 * suelto de la API tiraba la corrida entera en vez de degradarla.
 */
export async function leerPrevio() {
  let previous = null;
  for (const ruta of [...(PREVIO ? [PREVIO] : []), resolve(ROOT, 'public/data/roam-meta.json'), OUT]) {
    try {
      previous = JSON.parse(await readFile(ruta, 'utf8'));
      break;
    } catch {
      /* primera ejecución, o salida a un temporal */
    }
  }
  return previous;
}

/**
 * La ficha de los 133: el tipo de dano hace falta para todos, y la
 * speciality viene en la misma respuesta y se guarda para todos (el motor
 * solo la usa en los que no tienen tags a mano; derivar-tags.mjs, en todos).
 *
 * Lo anterior se conserva heroe a heroe: el tipo de dano no cambia de un dia
 * para otro, asi que perder la peticion de un heroe no puede costarnos el
 * dato que ya teniamos.
 */
export function conservarFichasPrevias(heroList, previous) {
  const danoPrevio = Object.fromEntries(
    (previous?.heroes ?? []).filter((h) => h?.damage).map((h) => [h.name, h.damage]),
  );
  const retratoPrevio = Object.fromEntries(
    (previous?.heroes ?? []).filter((h) => h?.retrato).map((h) => [h.name, h.retrato]),
  );
  const caraPrevia = Object.fromEntries(
    (previous?.heroes ?? []).filter((h) => h?.cara).map((h) => [h.name, h.cara]),
  );
  // Y la speciality: con la ficha caída, derivar-tags.mjs volvía a la
  // descarga a ciegas por una ruta escrita a mano, justo lo que 1.37.0 quiso
  // evitar.
  const specialityPrevia = Object.fromEntries(
    (previous?.heroes ?? []).filter((h) => Array.isArray(h?.speciality) && h.speciality.length).map((h) => [h.name, h.speciality]),
  );
  const kitPrevio = Object.fromEntries(
    (previous?.heroes ?? []).filter((h) => typeof h?.kitTexto === 'string').map((h) => [h.name, h.kitTexto]),
  );
  const habilidadesPrevias = Object.fromEntries(
    (previous?.heroes ?? []).filter((h) => Array.isArray(h?.habilidades) && h.habilidades.length).map((h) => [h.name, h.habilidades]),
  );
  for (const h of heroList) {
    if (danoPrevio[h.name]) h.damage = danoPrevio[h.name];
    if (habilidadesPrevias[h.name]) h.habilidades = habilidadesPrevias[h.name];
    if (retratoPrevio[h.name]) h.retrato = retratoPrevio[h.name];
    if (caraPrevia[h.name]) h.cara = caraPrevia[h.name];
    if (specialityPrevia[h.name]) h.speciality = specialityPrevia[h.name];
    if (kitPrevio[h.name]) h.kitTexto = kitPrevio[h.name];
  }
  return { danoPrevio };
}

/**
 * Héroe a héroe, como el tipo de daño: la matriz nueva se FUNDE con la
 * guardada, no la sustituye entera. Sustituirla dejaba que una corrida a
 * medias (la ruta de counters caída para 13 héroes, que el comparador
 * admite) borrara filas que ya se tenían, y un héroe sin fila pierde
 * además su riesgo de contrapick.
 */
export function relacionesPrevias(previous) {
  return { counters: { ...(previous?.counters ?? {}) }, synergies: { ...(previous?.synergies ?? {}) } };
}

/**
 * La matriz de la corrida (3.37.0): sin ninguna fila nueva, la guardada
 * tal cual (y con ella su etiqueta de rango: `conservado`); con filas
 * nuevas de OTRO rango que el de la guardada, se empieza de cero y no se
 * funde (las que falten se quedan sin fila y el comparador las cuenta).
 * Hasta 3.36.0 se fundía siempre sobre la guardada: el día del cambio
 * Gloria → Mítico, los héroes que fallaban conservaban la fila ruidosa de
 * Gloria con la etiqueta de Mítico, y con todo caído salía la de Mítico
 * etiquetada como Gloria.
 */
export function relacionesDeLaCorrida(previous, elegidas, rango) {
  const filas = Object.values(elegidas?.counters ?? {}).filter((f) => Object.keys(f ?? {}).length).length;
  if (!filas) return { relations: relacionesPrevias(previous), frescas: 0, frescasParejas: 0, conservado: true };
  const rangoPrevio = previous?.relaciones?.rango ?? previous?.rank ?? null;
  const relations = rangoPrevio && rangoPrevio !== rango ? { counters: {}, synergies: {} } : relacionesPrevias(previous);
  const cuenta = {};
  const frescas = fundirRelaciones(relations, elegidas, cuenta);
  return { relations, frescas, frescasParejas: cuenta.parejas, conservado: false };
}

/**
 * Funde la matriz nueva sobre la conservada y devuelve cuántas filas de
 * cruces son nuevas; en `cuenta.parejas`, cuántas de PAREJAS. Las parejas se cuentan aparte desde 3.43.1: con la ruta de parejas
 * vacía y la de cruces bien, cada fila conservaba las parejas de la corrida
 * anterior y la corrida salía fresca, con la fecha de hoy.
 */
export function fundirRelaciones(relations, fresh, cuenta = {}) {
  let relacionesFrescas = 0;
  let parejas = 0;
  for (const [nombre, fila] of Object.entries(fresh.counters)) {
    if (!Object.keys(fila ?? {}).length) continue;
    relations.counters[nombre] = fila;
    if (Object.keys(fresh.synergies?.[nombre] ?? {}).length) { relations.synergies[nombre] = fresh.synergies[nombre]; parejas += 1; }
    relacionesFrescas += 1;
  }
  cuenta.parejas = parejas;
  return relacionesFrescas;
}

/**
 * El winrate por línea (3.12.0) fundido PAR A PAR: lo descargado hoy manda,
 * y un par que falla hoy conserva el de la corrida anterior. Hasta 3.14.0 la
 * corrida nueva sustituía a la guardada ENTERA con que trajera un solo par,
 * y el comparador aceptaba perder hasta un 10% cada vez: el mismo fallo de
 * forma que ya costó filas de la matriz de cruces. Solo se conservan los
 * pares de las líneas que el héroe juega HOY: una línea que dejó de jugar no
 * se arrastra para siempre.
 */
export function fundirWinrateLinea(previo = {}, fresco = {}, heroList = []) {
  const validas = new Set(['roam', 'jungle', 'mid', 'gold', 'exp']);
  const salida = {};
  let conservados = 0;
  for (const h of heroList) {
    for (const lane of (h.lanes ?? []).filter((l) => validas.has(l))) {
      const nuevo = fresco?.[h.name]?.[lane];
      const viejo = previo?.[h.name]?.[lane];
      if (nuevo != null) (salida[h.name] ??= {})[lane] = nuevo;
      else if (viejo != null) { (salida[h.name] ??= {})[lane] = viejo; conservados += 1; }
    }
  }
  return { winrateLinea: salida, conservados };
}

/**
 * Las builds, igual que el winrate por línea (3.40.0): héroe a héroe y línea a
 * línea. Antes una corrida con la mitad de las peticiones caídas SUSTITUÍA a
 * las guardadas enteras, y o bien el comparador tiraba la corrida entera (con
 * todo lo bueno que traía) o, perdiendo menos del 10% cada vez, las builds
 * iban menguando corrida a corrida sin fondo.
 */
export function fundirBuilds(previo = {}, fresco = {}, heroList = []) {
  const { winrateLinea: builds, conservados } = fundirWinrateLinea(previo, fresco, heroList);
  return { builds, conservados };
}

/**
 * Frescas si se han descargado casi todas: con menos, lo que hay es la
 * matriz de otro día y la fecha no puede decir «hoy». Cruces Y parejas
 * (3.43.1): sin contar las parejas, una ruta de parejas vacía dejaba las de
 * hace días con la fecha de hoy.
 */
export function anotarFrescura(relacionesFrescas, pedidas, parejasFrescas = relacionesFrescas) {
  diagnostics.frescosRecursos = { relaciones: relacionesFrescas, parejas: parejasFrescas, pedidas };
  return pedidas ? relacionesFrescas / pedidas >= 0.9 && parejasFrescas / pedidas >= 0.9 : false;
}

/**
 * ¿Se descargaron las estadísticas que DECIDEN? Las del rango pedido y,
 * si tiene, las de su rango de respaldo (3.43.1): la guarda de rango compara
 * Gloria con Mítico (ventana.js) y, si Gloria no se parece, puntúa con
 * Mítico. Con Mítico conservado de hace días la guarda comparaba contra un
 * dato viejo (con los datos del 5 de octubre de 2026 y el Mítico del 27 de
 * septiembre, la decisión pasaba de Mítico a Gloria y el nº1 de roam
 * cambiaba en 112 de 300 drafts) y la fecha decía «hoy».
 */
export function estadisticasFrescas(frescos, rango, respaldo) {
  return frescos.includes(rango) && (!respaldo || frescos.includes(respaldo));
}

/**
 * Sin estadísticas nuevas del rango pedido O sin la matriz nueva, la fecha
 * es la de los datos que se conservan, no la de hoy. Antes solo miraba
 * las estadísticas: con la ruta de counters caída salía «hoy» con la
 * matriz de hace semanas, pasaba el comparador (mismos recuentos) y la
 * puerta de 72 h del despliegue. Sin datos previos, no hay fecha.
 */
export function fechaDeLaCorrida({ frescos, estadisticasNuevas, matrizNueva, previous }) {
  diagnostics.frescos = frescos;
  diagnostics.conservado = !(estadisticasNuevas && matrizNueva);
  return estadisticasNuevas && matrizNueva ? new Date().toISOString() : (previous?.generatedAt ?? null);
}

/**
 * Héroes a los que Moonton les ha rehecho el kit DESPUÉS de que alguien les
 * escribiera los tags a mano.
 *
 * `newHeroes` no los ve: siguen en el catálogo y con su nombre de siempre,
 * así que se quedarían con los tags de otro héroe para siempre y en silencio.
 * La huella se guarda en `heroes.json` al revisar los tags, así que el aviso
 * PERSISTE hasta que una persona los mire, igual que con los héroes nuevos;
 * calcularlo contra la corrida anterior lo apagaría solo al día siguiente.
 *
 * Un héroe cuya ficha no haya llegado conserva la anterior
 * (`conservarFichasPrevias`), y si no hay ninguna se queda sin `speciality`:
 * en ese caso NO se avisa, porque una petición caída no es un rework.
 */
export function kitsRehechos(heroList = [], catalogo = []) {
  const escrito = new Map(catalogo.filter((h) => h?.kit).map((h) => [h.name, h.kit]));
  return heroList
    .filter((h) => escrito.has(h?.name) && (h.speciality ?? []).length)
    .map((h) => ({ name: h.name, antes: escrito.get(h.name), ahora: huellaDeKit(h) }))
    .filter((x) => x.antes !== x.ahora);
}


/**
 * La historia de la fuerza (3.50.0): una foto por día (UTC) del winrate y
 * la cuota de pick de la ventana de 7 días de los rangos que se comparan
 * (el tuyo y su respaldo), para que la app diga quién sube y quién baja
 * esta semana. Solo entra un rango DESCARGADO en esta corrida: una foto
 * con los datos conservados de ayer bajo la fecha de hoy diría «no se ha
 * movido» sin saberlo (el mismo fallo que ya costó `generatedAt`). La
 * última corrida del día sustituye a la anterior de ese día; lo de hace
 * más de `HISTORIA_DIAS` se cae. Puro: la fecha se pasa.
 */
export function anotarHistoria(previa, statsByRank = {}, frescos = [], fecha, { rangos = [], dias = HISTORIA_DIAS } = {}) {
  const valida = (e) => e && typeof e.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha);
  // Una foto por fecha: si lo previo trae dos (editado a mano), manda la última.
  const porFecha = new Map();
  for (const e of (Array.isArray(previa) ? previa : []).filter(valida)) porFecha.set(e.fecha, { ...e });
  const historia = [...porFecha.values()];
  const foto = {};
  for (const rango of rangos) {
    if (!frescos.includes(rango)) continue;
    const fila = {};
    for (const [heroe, s] of Object.entries(statsByRank?.[rango] ?? {})) {
      const wr = Number(s?.winRate); const pick = Number(s?.pickRate);
      if (Number.isFinite(wr) && wr > 0 && wr < 1) // Winrate a la décima de punto y cuota a cuatro decimales: el umbral
      // es de un punto y cada cifra más es ruido que pesa en el móvil.
      fila[heroe] = [Math.round(wr * 1e3) / 1e3, Number.isFinite(pick) ? Math.round(pick * 1e4) / 1e4 : 0];
    }
    if (Object.keys(fila).length) foto[rango] = fila;
  }
  if (Object.keys(foto).length && /^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) {
    const i = historia.findIndex((e) => e.fecha === fecha);
    if (i >= 0) historia[i] = { ...historia[i], ...foto };
    else historia.push({ fecha, ...foto });
  }
  const ultima = historia.map((e) => e.fecha).sort().at(-1);
  if (!ultima) return [];
  const limite = new Date(Date.parse(`${ultima}T00:00:00Z`) - (dias - 1) * 864e5).toISOString().slice(0, 10);
  return historia.filter((e) => e.fecha >= limite).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
