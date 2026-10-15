/**
 * Aprender de las correcciones (3.27.0). La app manda al lector, cuando el
 * draft está completo y al apuntar la partida, lo que de verdad había
 * (`POST /corregir`: baneos y enemigos finales, corregidos a mano). Con la
 * captura guardada y esa verdad, aquí se busca a cada enemigo que el lector
 * NO reconoció por todo el panel de picks, y de lo que encuentra sale:
 *
 * - dónde están los huecos en ESTA tablet (`picks`: las cinco posiciones,
 *   ajustadas con lo encontrado; la geometría de leer.mjs se midió en una
 *   captura y otra pantalla o otra versión del juego las mueve);
 * - la cara tal como la pinta el juego en ese panel (`caras`: un recorte por
 *   héroe, en la orientación de la pantalla), que se suma a las de la API.
 *
 * Solo se aprende lo que se encuentra con seguridad (`APRENDER_MINIMO` y sin
 * otro héroe que se le parezca igual en ese sitio): un recorte equivocado
 * enseñaría al lector a confundir a dos héroes, que es peor que no aprender.
 * Lo que no se encuentra se dice, para mandar esa captura.
 *
 * Dos guardas más desde 3.30.1, porque la primera tanda real (1 de octubre
 * de 2026) aprendió a Rafaela y a Selena de tres capturas que NO eran la
 * pantalla del draft (con «Leer solo» se captura cada 5 s hasta completar
 * el draft, y el draft se completa a mano ya en la carga o en la partida),
 * movió el panel entero y los picks dejaron de leerse hasta el final de la
 * tarde: (1) una captura solo vale si en su fila de baneos se leen al menos
 * `BANEOS_PARA_APRENDER` de los baneos que dice la verdad (la fila no se
 * mueve en picks ni en skins, y en la carga y en la partida no está); (2)
 * un hallazgo solo vale si cae a menos de medio hueco de SU hueco medido
 * (`PICKS_ENEMIGOS`): más lejos, el hueco al que se asigna es una
 * adivinanza, y lo aprendido no puede alejarse de la medida más que eso.
 *
 * Y desde 3.58.0 las caras de TU EQUIPO (`aliados`), que la API no lee
 * con las skins de cada uno (la mitad de los compañeros se quedaban en
 * «?»; los que más, los que juegan contigo siempre con la misma skin:
 * Selena, Gord, Kadita). Ahí no se busca por el panel: cada fila tiene su
 * sitio, y lo que falta es saber QUIÉN es. Se sabe en dos casos: tu fila
 * (la del nombre amarillo) es tu pick, y si de los cuatro compañeros se
 * leen tres, el que queda es el cuarto. Solo con capturas que leen al
 * menos `ENEMIGOS_PARA_ALIADOS` enemigos de la verdad y ninguno de fuera
 * (el 13 de octubre de 2026 una corrección traía una captura de OTRA
 * partida, #93), y una cara solo se usa cuando dos drafts distintos
 * (`MINUTOS_ENTRE_DRAFTS`) la confirman a `ALIADO_MINIMO`: un compañero
 * que cambia de héroe con otro o una verdad corregida tarde (#98/#99, el
 * mismo draft con dos verdades) no se repiten igual en otra partida.
 * Medido en los 30 drafts de recortes del 10 al 14 de octubre: 15 huecos
 * más leídos y 0 falsos; sin confirmar, 43 y 1 falso.
 *
 * Puro: recibe píxeles y verdades, devuelve lo aprendido. Sin adb, sin
 * programas, sin red.
 */
import { LADO, muestra, normalizar, espejo, guardarCara, cargarCaras, reconocer, PARECIDO_MINIMO } from './caras.mjs';
import { PICKS_ENEMIGOS, REFERENCIA, ALIADOS, OPCIONES_ALIADOS, ALIADO_MINIMO, leerBaneos, leerPicksEnemigos, leerAliados, filaPropia, escalar, vacioAliadoGuardado } from './leer.mjs';
import { nombreClave } from '../../src/motor/nombres.js';

/** Un hallazgo entra si se parece al menos esto (un acierto normal va de 0,75 a 0,99; el peor equivocado medido, 0,72). */
export const APRENDER_MINIMO = 0.78;
/** Y si ningún otro héroe se le parece casi igual en ese mismo sitio. */
export const MARGEN_SOBRE_OTRO = 0.03;
/** Recortes que se guardan por héroe (los últimos). */
export const RECORTES_POR_HEROE = 2;
/** Dónde puede estar el panel de picks enemigos: el quinto derecho de la pantalla. */
const PANEL = [0.80, 0.06, 1.0, 0.96];
/** De cuántas capturas (las últimas que sean la pantalla del draft) se aprende por corrección. */
export const CAPTURAS_POR_CORRECCION = 3;
/** Una captura es la pantalla del draft si lee al menos estos baneos de los que dice la verdad (si la verdad trae alguno). */
export const BANEOS_PARA_APRENDER = 2;
/** Versión de lo aprendido: la 1 (3.27.0–3.30.0) se aprendió sin estas guardas y se descarta. */
export const VERSION_APRENDIDO = 2;
/** Una captura enseña caras de tu equipo si lee al menos estos enemigos de la verdad, y ninguno que no esté. */
export const ENEMIGOS_PARA_ALIADOS = 3;
/** Dos capturas son de drafts distintos si las separa al menos esto (una partida dura más). */
export const MINUTOS_ENTRE_DRAFTS = 10;
/** Caras confirmadas por compañero (varias skins) y pendientes de confirmar en total. */
export const RECORTES_POR_ALIADO = 4, PENDIENTES_MAXIMOS = 40;
/** Ancho del hueco de un pick enemigo en la referencia (leer.mjs: x0 = 2020, ancho 380). */
const ANCHO_HUECO = 380;
const PASO_HUECO = PICKS_ENEMIGOS[1][1] - PICKS_ENEMIGOS[0][1];

const producto = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/**
 * Busca una cara por una región de la captura, a varios tamaños, y devuelve
 * dónde se parece más: `{ cx, cy, r, parecido, espejo }` (en píxeles de la
 * captura). Compara con la cara tal cual y en espejo a la vez.
 */
export function buscarCara(img, v, { region = PANEL, r0, escalas = [0.8, 0.9, 1, 1.12, 1.25] } = {}) {
  const [x0, y0, x1, y1] = [region[0] * img.ancho, region[1] * img.alto, region[2] * img.ancho, region[3] * img.alto];
  const vE = espejo(v);
  const medir = (cx, cy, r) => {
    const m = normalizar(muestra(img, cx, cy, r));
    const a = producto(m, v), b = producto(m, vE);
    return { cx, cy, r, parecido: Math.max(a, b), espejo: b > a };
  };
  // Rejilla gruesa (paso r/4) a varios tamaños; se guardan los mejores
  // sitios que no se pisan entre sí, porque el máximo grueso de otro héroe
  // parecido puede tapar al bueno.
  const gruesos = [];
  for (const esc of escalas) {
    const r = r0 * esc, paso = Math.max(2, r / 4);
    for (let cy = y0 + r; cy <= y1 - r; cy += paso) for (let cx = x0 + r; cx <= x1 - r; cx += paso) gruesos.push(medir(cx, cy, r));
  }
  gruesos.sort((a, b) => b.parecido - a.parecido);
  const cimas = [];
  for (const g of gruesos) {
    if (cimas.length >= 8) break;
    if (cimas.every((c) => Math.hypot(c.cx - g.cx, c.cy - g.cy) > r0 * 0.8)) cimas.push(g);
  }
  // Afinar alrededor de cada cima: posición a pasos de r/10 y tamaño ±6%.
  let mejor = { parecido: -Infinity };
  for (const base of cimas) {
    const fino = Math.max(1, base.r / 10);
    for (const esc of [0.94, 1, 1.06]) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const m = medir(base.cx + dx * fino, base.cy + dy * fino, base.r * esc);
      if (m.parecido > mejor.parecido) mejor = m;
    }
  }
  return mejor;
}

/** Las caras aprendidas como referencias listas para `reconocer` (ya en la orientación de la pantalla). */
export function carasAprendidas(aprendido) {
  const lista = [];
  for (const [nombre, recortes] of Object.entries(aprendido?.caras ?? {})) {
    for (const r of recortes) lista.push({ nombre, v: normalizar(Float32Array.from(Buffer.from(r.v, 'base64'))) });
  }
  return lista;
}

const deBase64 = (v) => normalizar(Float32Array.from(Buffer.from(v, 'base64')));

/**
 * El hueco de un compañero que AÚN NO HA ELEGIDO (3.58.1): el juego pinta
 * siempre el mismo icono (una mano blanca sobre azul), en cualquier
 * partida. Con 3.58.0, si un amigo elegía último en dos partidas, ese
 * icono se habría aprendido como su cara (el «que falta» por eliminación)
 * y desde entonces cualquier hueco vacío se leería como él. Medido en los
 * 30 drafts de recortes: el icono contra sí mismo 0,96–1,00 en seis
 * huecos, cualquier cara real 0,75 como mucho. Recorte de la incidencia
 * #60 (`vacio-aliado.json`).
 */
export const VACIO_ALIADO = deBase64(vacioAliadoGuardado());
/** Un recorte es ese icono si se le parece al menos esto (entre 0,75 y 0,96). */
export const MINIMO_VACIO = 0.85;
const producto24 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
/** ¿Es este recorte (ya normalizado, tomado en el centro del hueco) el icono del hueco vacío? */
export const esHuecoVacio = (v) => producto24(v, VACIO_ALIADO) >= MINIMO_VACIO;

/**
 * Las caras de tu equipo aprendidas y confirmadas, listas para `leerAliados`
 * (3.58.0). Sin las que son el icono del hueco vacío (3.58.1): lo que
 * aprendió 3.58.0 sin esa guarda no se usa.
 */
export function aliadasAprendidas(aprendido) {
  const lista = [];
  for (const [nombre, recortes] of Object.entries(aprendido?.aliados ?? {})) {
    for (const r of recortes) { const v = deBase64(r.v); if (!esHuecoVacio(v)) lista.push({ nombre, v }); }
  }
  return lista;
}

/** El instante de una captura por su nombre (`lectura-2026-10-14T17-52-57-139Z-42`), o NaN. */
export function momentoDe(id) {
  const m = /^lectura-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z/.exec(id ?? '');
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : NaN;
}

/**
 * Quién es quién en tu equipo según la verdad: tu fila es tu pick (si la
 * lectura no lo dice ya) y, si de los cuatro compañeros se leen tres, el
 * hueco que queda es el que falta. Devuelve [{ i, nombre }].
 */
export function etiquetarAliados(leidos, fila, { aliados = [], tuyo = null } = {}) {
  if (fila < 0) return [];
  const clave = (l) => (l?.nombre ? nombreClave(l.nombre) : null);
  const etiquetas = [];
  if (tuyo && clave(leidos[fila]) !== nombreClave(tuyo)) etiquetas.push({ i: fila, nombre: tuyo });
  if (aliados.length === 4) {
    const resto = [0, 1, 2, 3, 4].filter((i) => i !== fila);
    const verdad = new Set(aliados.map(nombreClave));
    const sinLeer = resto.filter((i) => !verdad.has(clave(leidos[i])));
    const faltan = aliados.filter((a) => !resto.some((i) => clave(leidos[i]) === nombreClave(a)));
    if (sinLeer.length === 1 && faltan.length === 1) etiquetas.push({ i: sinLeer[0], nombre: faltan[0] });
  }
  return etiquetas;
}

/**
 * Aprende las caras de tu equipo de una captura (muta `nuevo.aliados` y
 * `nuevo.aliadosPendientes`). Cada recorte queda pendiente hasta que otro
 * de un draft distinto se le parece a `ALIADO_MINIMO`; entonces los dos
 * pasan a confirmados. Devuelve { aprendidos, pendientes } (nombres).
 */
function aprenderAliadosDe(img, id, verdad, nuevo, caras) {
  const informe = { aprendidos: [], pendientes: [], vacios: [], confundibles: [] };
  const t = momentoDe(id);
  if (!Number.isFinite(t)) return informe;
  const fila = filaPropia(img);
  const leidos = leerAliados(img, caras, { extra: aliadasAprendidas(nuevo) });
  for (const { i, nombre } of etiquetarAliados(leidos, fila, verdad)) {
    const pos = escalar(img, ALIADOS[i]);
    // El hueco aún vacío no es nadie (3.58.1).
    if (reconocer(img, pos, [{ nombre: 'vacio', v: VACIO_ALIADO }], OPCIONES_ALIADOS).parecido >= MINIMO_VACIO) { informe.vacios.push(nombre); continue; }
    // Y si se parece a la cara aprendida de OTRO héroe, uno de los dos está mal apuntado: no se aprende.
    const deOtroHeroe = [...Object.entries(nuevo.aliados), ...Object.entries(nuevo.aliadosPendientes)].filter(([n]) => nombreClave(n) !== nombreClave(nombre)).flatMap(([n, l]) => l.map((p) => ({ nombre: n, v: deBase64(p.v) })));
    const choca = deOtroHeroe.length ? reconocer(img, pos, deOtroHeroe, OPCIONES_ALIADOS) : null;
    if (choca && choca.parecido >= ALIADO_MINIMO) { informe.confundibles.push({ nombre, con: choca.candidato }); continue; }
    const recorte = { v: guardarCara(muestra(img, ...pos)), de: id, t };
    const pendientes = (nuevo.aliadosPendientes[nombre] ?? []).filter((p) => p.de !== id);
    const deOtros = pendientes.filter((p) => Math.abs(p.t - t) >= MINUTOS_ENTRE_DRAFTS * 60000);
    const refs = deOtros.map((p) => ({ nombre: p.de, v: deBase64(p.v) }));
    const r = refs.length ? reconocer(img, pos, refs, OPCIONES_ALIADOS) : null;
    if (r && r.parecido >= ALIADO_MINIMO) {
      const otro = deOtros.find((p) => p.de === r.candidato);
      nuevo.aliados[nombre] = [{ ...recorte, parecido: Math.round(r.parecido * 1000) / 1000 }, otro, ...(nuevo.aliados[nombre] ?? [])].slice(0, RECORTES_POR_ALIADO);
      nuevo.aliadosPendientes[nombre] = pendientes.filter((p) => p !== otro);
      informe.aprendidos.push(nombre);
    } else {
      nuevo.aliadosPendientes[nombre] = [recorte, ...pendientes];
      informe.pendientes.push(nombre);
    }
    if (!nuevo.aliadosPendientes[nombre].length) delete nuevo.aliadosPendientes[nombre];
  }
  // Tope de lo pendiente: se van los más viejos.
  const todos = Object.entries(nuevo.aliadosPendientes).flatMap(([n, l]) => l.map((p) => [n, p])).sort((a, b) => b[1].t - a[1].t);
  for (const [n, p] of todos.slice(PENDIENTES_MAXIMOS)) {
    nuevo.aliadosPendientes[n] = nuevo.aliadosPendientes[n].filter((x) => x !== p);
    if (!nuevo.aliadosPendientes[n].length) delete nuevo.aliadosPendientes[n];
  }
  return informe;
}

const aReferencia = (img, cx, cy, r) => {
  const fx = img.ancho / REFERENCIA.ancho, fy = img.alto / REFERENCIA.alto;
  return [cx / fx, cy / fy, r / Math.min(fx, fy)];
};
const aCaptura = (img, [x, y, r]) => {
  const fx = img.ancho / REFERENCIA.ancho, fy = img.alto / REFERENCIA.alto;
  return [x * fx, y * fy, r * Math.min(fx, fy)];
};
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/**
 * Las cinco posiciones nuevas a partir de las encontradas: el panel se
 * desplaza ENTERO (mediana del desplazamiento de cada hallazgo respecto a
 * su hueco), con la mediana en x y r. El espacio entre huecos se conserva:
 * con dos hallazgos en huecos vecinos una recta amplifica 20 px de error
 * hasta 60 en el quinto hueco (medido: se perdía el hueco). Solo con tres
 * huecos distintos se reajusta el espacio, y acotado al ±10% del de antes.
 */
export function ajustarPosiciones(anteriores, hallazgos) {
  if (!hallazgos.length) return anteriores;
  const x = mediana(hallazgos.map((h) => h.pos[0])), r = mediana(hallazgos.map((h) => h.pos[2]));
  const dy = mediana(hallazgos.map((h) => h.pos[1] - anteriores[h.hueco][1]));
  const huecos = new Set(hallazgos.map((h) => h.hueco));
  let paso = (anteriores[anteriores.length - 1][1] - anteriores[0][1]) / (anteriores.length - 1);
  let y0 = anteriores[0][1] + dy;
  if (huecos.size >= 3) {
    const puntos = [...huecos].map((i) => [i, mediana(hallazgos.filter((h) => h.hueco === i).map((h) => h.pos[1]))]);
    const n = puntos.length, mi = puntos.reduce((s, p) => s + p[0], 0) / n, my = puntos.reduce((s, p) => s + p[1], 0) / n;
    const b = puntos.reduce((s, p) => s + (p[0] - mi) * (p[1] - my), 0) / puntos.reduce((s, p) => s + (p[0] - mi) ** 2, 0);
    const acotado = Math.max(paso * 0.9, Math.min(paso * 1.1, b));
    y0 = my - acotado * mi;
    paso = acotado;
  }
  return anteriores.map((_, i) => [x, y0 + paso * i, r]);
}

/**
 * ¿Es esta captura la pantalla del draft? Con la verdad de los baneos: si
 * trae `BANEOS_PARA_APRENDER` o más, en la fila de arriba tienen que leerse
 * al menos esos. Sin baneos en la verdad (una clásica) no se puede saber y
 * se da por buena.
 */
export function esPantallaDeDraft(img, caras, verdad) {
  const baneos = new Set((verdad?.baneos ?? []).map(nombreClave));
  if (baneos.size < BANEOS_PARA_APRENDER) return true;
  const leidos = leerBaneos(img, caras);
  const aciertos = [...leidos.tuyos, ...leidos.suyos].filter((l) => l.nombre && baneos.has(nombreClave(l.nombre))).length;
  return aciertos >= BANEOS_PARA_APRENDER;
}

/** Un hallazgo cae en un hueco medido si está a menos de medio hueco de él (en x y en y). Devuelve el hueco o -1. */
export function huecoDe(pos, base = PICKS_ENEMIGOS) {
  const hueco = base.reduce((mejor, p, i) => (Math.abs(p[1] - pos[1]) < Math.abs(base[mejor][1] - pos[1]) ? i : mejor), 0);
  const [x, y] = base[hueco];
  return Math.abs(pos[1] - y) <= PASO_HUECO / 2 && Math.abs(pos[0] - x) <= ANCHO_HUECO / 2 ? hueco : -1;
}

/**
 * Aprende de varias capturas con su verdad. `pares` = [{ id, img, verdad:
 * { enemigos, baneos } }] (`img` decodificada o una función que la
 * decodifica, para no tener todas en memoria a la vez); `caras` las de la
 * API ([{ nombre, v }]); `aprendido` lo de antes. De las que son la pantalla
 * del draft se aprende de las `maximo` que más enemigos leen (a igualdad,
 * las últimas). Devuelve lo aprendido nuevo
 * (acumulado) y un informe por captura (las descartadas, con su motivo).
 */
export function aprenderDe(pares, { caras, aprendido = null, posicionesBase = PICKS_ENEMIGOS, maximo = CAPTURAS_POR_CORRECCION } = {}) {
  const nuevo = { version: VERSION_APRENDIDO, picks: aprendido?.picks ?? null, caras: { ...(aprendido?.caras ?? {}) }, aliados: { ...(aprendido?.aliados ?? {}) }, aliadosPendientes: { ...(aprendido?.aliadosPendientes ?? {}) }, capturas: aprendido?.capturas ?? 0 };
  const porClave = new Map(caras.map((c) => [nombreClave(c.nombre), c]));
  const extra = carasAprendidas(aprendido);
  const enEspejo = [...caras.map((c) => ({ ...c, v: espejo(c.v) })), ...extra];
  const informe = [];
  const hallazgos = [];
  // De las que son la pantalla del draft, las que MÁS enemigos de la verdad
  // leen (3.54.0); a igualdad, las más nuevas. Hasta 3.53.0 se cogían las
  // últimas, y el draft se completa muchas veces ya en la fase de skins:
  // del 10 al 12 de octubre de 2026 el aprendizaje miró casi siempre
  // pantallas de skins (los cinco «sin encontrar» con el draft bien leído un
  // momento antes) y no aprendió casi nada. Una captura cada vez en memoria.
  const candidatas = [];
  for (let i = pares.length - 1; i >= 0; i--) {
    const { id, verdad } = pares[i];
    const enemigos = (verdad?.enemigos ?? []).map((n) => porClave.get(nombreClave(n))).filter(Boolean);
    if (!enemigos.length) continue;
    const img = typeof pares[i].img === 'function' ? pares[i].img() : pares[i].img;
    if (!esPantallaDeDraft(img, caras, verdad)) { informe.unshift({ id, descartada: 'sinBaneos', aprendidos: [], sinEncontrar: [], yaLeidos: [] }); continue; }
    // Lo que ya sale con la geometría de ahora (la medida, y lo aprendido donde esa no lee), hueco a hueco.
    const leidos = leerPicksEnemigos(img, caras, { posiciones: aprendido?.picks ?? null, extra });
    const claves = new Set(enemigos.map((h) => nombreClave(h.nombre)));
    const aciertos = leidos.filter((l) => l.nombre && claves.has(nombreClave(l.nombre))).length;
    const fuera = leidos.filter((l) => l.nombre && !claves.has(nombreClave(l.nombre))).length;
    candidatas.push({ i, id, enemigos, leidos, aciertos, fuera, verdad, img: typeof pares[i].img === 'function' ? null : img });
  }
  const elegidas = [...candidatas].sort((a, b) => b.aciertos - a.aciertos || b.i - a.i).slice(0, maximo).sort((a, b) => a.i - b.i);
  for (const { i, id, enemigos, leidos, aciertos, fuera, verdad, img: guardada } of elegidas) {
    const img = guardada ?? pares[i].img();
    const reconocidos = new Set(leidos.map((l) => l.nombre && nombreClave(l.nombre)).filter(Boolean));
    const linea = { id, aprendidos: [], sinEncontrar: [], yaLeidos: [...reconocidos], aciertos };
    const r0 = aCaptura(img, posicionesBase[0])[2];
    for (const h of enemigos) {
      const clave = nombreClave(h.nombre);
      if (reconocidos.has(clave)) continue;
      const donde = buscarCara(img, h.v, { r0 });
      if (donde.parecido < APRENDER_MINIMO) { linea.sinEncontrar.push({ nombre: h.nombre, parecido: donde.parecido }); continue; }
      // Que en ese sitio no haya otro héroe que se le parezca casi igual.
      const otros = reconocer(img, [donde.cx, donde.cy, donde.r], enEspejo.filter((c) => nombreClave(c.nombre) !== clave), { pasos: 0, escalas: [] });
      if (otros.parecido > donde.parecido - MARGEN_SOBRE_OTRO) { linea.sinEncontrar.push({ nombre: h.nombre, parecido: donde.parecido, confundible: otros.candidato }); continue; }
      const pos = aReferencia(img, donde.cx, donde.cy, donde.r);
      // Y que caiga en un hueco medido: si no, no es el panel de picks (o no se sabe qué hueco es).
      const hueco = huecoDe(pos, posicionesBase);
      if (hueco < 0) { linea.sinEncontrar.push({ nombre: h.nombre, parecido: donde.parecido, fuera: pos.map(Math.round) }); continue; }
      hallazgos.push({ nombre: h.nombre, pos, hueco, parecido: donde.parecido });
      const recorte = { v: guardarCara(muestra(img, donde.cx, donde.cy, donde.r)), de: id, parecido: Math.round(donde.parecido * 1000) / 1000 };
      nuevo.caras[h.nombre] = [recorte, ...(nuevo.caras[h.nombre] ?? [])].slice(0, RECORTES_POR_HEROE);
      linea.aprendidos.push({ nombre: h.nombre, hueco, parecido: donde.parecido, pos: pos.map(Math.round) });
    }
    // Tu equipo (3.58.0), solo de una captura que es de verdad ESTE draft.
    const aliados = (Array.isArray(verdad?.aliados) ? verdad.aliados : []).map((n) => porClave.get(nombreClave(n))?.nombre).filter(Boolean);
    const tuyo = porClave.get(nombreClave(verdad?.tuyo ?? ''))?.nombre ?? null;
    if ((aliados.length || tuyo) && aciertos >= ENEMIGOS_PARA_ALIADOS && !fuera) linea.aliados = aprenderAliadosDe(img, id, { aliados, tuyo }, nuevo, caras);
    nuevo.capturas += 1;
    informe.push(linea);
  }
  if (hallazgos.length) nuevo.picks = ajustarPosiciones(aprendido?.picks ?? posicionesBase, hallazgos).map((p) => p.map((v) => Math.round(v * 10) / 10));
  return { aprendido: nuevo, informe };
}

/** Lo que se dice en Termux de un informe. */
export function resumirAprendizaje({ aprendido, informe }) {
  const lineas = [];
  for (const l of informe) {
    if (l.descartada) { lineas.push(`${l.id} no es la pantalla del draft (no se lee su fila de baneos): no se aprende de ella.`); continue; }
    for (const n of l.aliados?.aprendidos ?? []) lineas.push(`Aprendido en tu equipo: ${n} (confirmado en dos drafts) de ${l.id}.`);
    for (const n of l.aliados?.pendientes ?? []) lineas.push(`Cara de ${n} en tu equipo de ${l.id}: pendiente de verla en otro draft.`);
    for (const n of l.aliados?.vacios ?? []) lineas.push(`El hueco de ${n} en ${l.id} aún no había elegido: no se aprende.`);
    for (const c of l.aliados?.confundibles ?? []) lineas.push(`La cara de ${c.nombre} en ${l.id} se parece a la aprendida de ${c.con}: no se aprende.`);
    for (const a of l.aprendidos) lineas.push(`Aprendido: ${a.nombre} en el hueco ${a.hueco + 1} de ${l.id} (parecido ${a.parecido.toFixed(2)}).`);
    for (const s of l.sinEncontrar) lineas.push(s.fuera ? `${s.nombre} se parece (${s.parecido.toFixed(2)}) en (${s.fuera[0]}, ${s.fuera[1]}) de ${l.id}, fuera de los huecos de picks: no se aprende.` : `No encuentro a ${s.nombre} en ${l.id} (lo más parecido ${s.parecido.toFixed(2)}${s.confundible ? `, se confunde con ${s.confundible}` : ''}): manda esa captura.`);
  }
  if (aprendido.picks) lineas.push(`Huecos de picks: ${aprendido.picks.map((p) => `(${Math.round(p[0])}, ${Math.round(p[1])})`).join(' ')}.`);
  return lineas;
}

export { LADO, cargarCaras, PARECIDO_MINIMO };
