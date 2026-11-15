/**
 * Las partidas que apunta la tablet (`partidas.json` en su casa): guardarlas
 * sin repetir y con tope, arreglarlas (desde la APK, desde el móvil o con
 * una corrección), las que quedan sin resultado, y subirlas a la base de
 * datos con la clave que toque. La forma de cada una es la de `apuntar`
 * (motor/registro.js), más lo que solo sabe la tablet: `desde`,
 * `resultadoDe` y `leida`, que no salen de ella.
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TABLA_SEGUIDAS } from '../../src/comun/contrato.js';
import { sanearConfig, claveDeJugadorValida, subirPartidas } from '../../src/comun/basedatos.js';
import { tusNumeros, tuSemana } from '../../src/motor/habitos.js';

/** [D] Las partidas que guarda la tablet (el tope de la app), las sin resultado y las que enseña «Mis partidas». */
export const TOPE_PARTIDAS_TABLET = 500;
export const TOPE_SIN_RESULTADO = 50;
export const PARTIDAS_EN_LA_APK = 200;

/** [M] Lo que LEYÓ la tablet en la tabla aunque luego lo arreglaras: sin esto, corregir las victorias falsas apagaba el aviso. */
export const leidaAntes = (p, gane) => (p?.resultadoDe === 'tabla' && typeof p.leida !== 'boolean' && typeof p.gane === 'boolean' && p.gane !== gane ? { leida: p.gane }
  : typeof p?.leida === 'boolean' ? { leida: p.leida } : {});
/** Las últimas `TABLA_SEGUIDAS` leídas en la tabla y cuántas salieron victoria (todas iguales es aviso: <1 % por azar). */
export function ultimasDeTabla(todas) {
  const leidas = (Array.isArray(todas) ? todas : []).filter((p) => p?.resultadoDe === 'tabla' && typeof p.gane === 'boolean' && Number.isFinite(p.t)).sort((a, b) => b.t - a.t).slice(0, TABLA_SEGUIDAS);
  return { n: leidas.length, gane: leidas.filter((p) => (typeof p.leida === 'boolean' ? p.leida : p.gane)).length };
}

/** El almacén de la tablet: `{ partidas, subidas, sinResultado }`, escrito a un temporal y luego encima. */
export function partidasDeLaTablet(casa, { registrar = () => {} } = {}) {
  const fichero = join(casa, 'partidas.json');
  let datos;
  try {
    const j = JSON.parse(readFileSync(fichero, 'utf8'));
    datos = {
      partidas: Array.isArray(j?.partidas) ? j.partidas.filter((p) => p && Number.isFinite(p.t) && typeof p.pick === 'string' && typeof p.gane === 'boolean') : [],
      subidas: Array.isArray(j?.subidas) ? j.subidas.filter(Number.isFinite) : [],
      sinResultado: Array.isArray(j?.sinResultado) ? j.sinResultado.filter((p) => p && Number.isFinite(p.t) && typeof p.pick === 'string' && p.gane === undefined) : [],
    };
  } catch (e) {
    datos = { partidas: [], subidas: [], sinResultado: [] };
    // Ilegible: se aparta antes de escribir encima, o la primera partida nueva borraba el historial.
    if (existsSync(fichero)) {
      try { renameSync(fichero, `${fichero}.mala`); } catch { /* sin disco */ }
      registrar(`partidas.json ilegible (${e.message}): apartado a partidas.json.mala, empiezo vacío.`);
    }
  }
  // [C] `supuestoResubido` queda escrito a true: la resubida de una vez ya se hizo en la tablet de Javi.
  const escribir = () => {
    try { writeFileSync(`${fichero}.tmp`, JSON.stringify({ ...datos, supuestoResubido: true })); renameSync(`${fichero}.tmp`, fichero); } catch { /* sin disco: quedan en memoria */ }
  };
  const ordenar = (l, tope) => l.sort((a, b) => b.t - a.t).slice(0, tope);
  const sinEstimacionSiOtro = (antes, pick) => {
    const { supuesto, estimacion, modelo, ...resto } = antes;
    const otro = !!pick && pick !== antes.pick;
    return { ...resto, ...(pick ? { pick } : supuesto ? { supuesto } : {}), ...(otro ? {} : { ...(estimacion != null ? { estimacion } : {}), ...(modelo != null ? { modelo } : {}) }) };
  };
  const almacen = {
    apuntar(p) {
      if (!p || !Number.isFinite(p.t) || datos.partidas.some((x) => x.t === p.t)) return false;
      datos.partidas = ordenar([p, ...datos.partidas], TOPE_PARTIDAS_TABLET);
      escribir();
      return true;
    },
    todas: () => datos.partidas,
    una: (t) => datos.partidas.find((p) => p.t === t) ?? null,
    /** Una partida de la que no se supo cómo acabó: con su draft y sin `gane`; ni se sube ni cuenta. */
    guardarSinResultado(p) {
      if (!p || !Number.isFinite(p.t) || typeof p.pick !== 'string' || datos.partidas.some((x) => x.t === p.t) || datos.sinResultado.some((x) => x.t === p.t)) return false;
      const { gane, ...sin } = p;
      datos.sinResultado = ordenar([sin, ...datos.sinResultado], TOPE_SIN_RESULTADO);
      escribir();
      return true;
    },
    sinResultado: () => datos.sinResultado,
    pendientes: () => { const s = new Set(datos.subidas); return datos.partidas.filter((p) => !s.has(p.t)); },
    marcarSubidas(ts) {
      const vivas = new Set(datos.partidas.map((p) => p.t));
      datos.subidas = [...new Set([...datos.subidas, ...ts])].filter((t) => vivas.has(t));
      escribir();
    },
    /** Quién era quién, dicho en la APK o en el móvil: arregla el draft (y el pick: sin la estimación de otro héroe) y la vuelve a subir. */
    corregir(t, { enemigos = [], aliados = [], tuyo = null } = {}) {
      const i = datos.partidas.findIndex((p) => p.t === t);
      if (i < 0) return false;
      const resto = sinEstimacionSiOtro(datos.partidas[i], tuyo);
      datos.partidas[i] = { ...resto, draft: { ...resto.draft, enemigos: enemigos.slice(0, 5), aliados: aliados.slice(0, 4) } };
      datos.subidas = datos.subidas.filter((x) => x !== t);
      escribir();
      return true;
    },
    /** Lo arreglado en el móvil (la copia de la base de datos, más nueva y ya subida la de aquí): manda la de allí. Cuántas cambiaron. */
    alDiaCon(deLaBase) {
      const subidas = new Set(datos.subidas);
      const editadaDe = (p) => (Number.isFinite(p?.editada) ? p.editada : 0);
      let cambiadas = 0;
      datos.partidas = datos.partidas.map((p) => {
        const b = deLaBase.get(p.t);
        if (!b || !subidas.has(p.t) || editadaDe(b) <= editadaDe(p) || typeof b.pick !== 'string' || typeof b.gane !== 'boolean') return p;
        cambiadas += 1;
        return { ...b, ...(p.desde != null ? { desde: p.desde } : {}), ...(p.resultadoDe ? { resultadoDe: p.resultadoDe } : {}), ...leidaAntes(p, b.gane) };
      });
      if (cambiadas) escribir();
      return cambiadas;
    },
    /**
     * Lo arreglado en «Mis partidas» de la APK o desde el móvil (ya saneado):
     * resultado, pick, enemigos, compañeros, baneos. Una sin resultado pasa a
     * partida; una que solo está en la base de datos (`base`) se trae. Marca
     * `editada` y se vuelve a subir. `{ antes, nueva }` o null.
     */
    editar(t, cambios, base = null) {
      const sin = datos.partidas.some((p) => p.t === t) ? null : datos.sinResultado.find((p) => p.t === t);
      if (sin) {
        if (typeof cambios.gane !== 'boolean') return null;
        datos.sinResultado = datos.sinResultado.filter((p) => p.t !== t);
        datos.partidas = ordenar([{ ...sin, gane: cambios.gane }, ...datos.partidas], TOPE_PARTIDAS_TABLET);
        const hecho = almacen.editar(t, cambios);
        return hecho && { ...hecho, antes: sin };
      }
      let i = datos.partidas.findIndex((p) => p.t === t);
      if (i < 0) {
        if (!base || base.t !== t || typeof base.pick !== 'string' || typeof base.gane !== 'boolean') return null;
        datos.partidas = ordenar([base, ...datos.partidas], TOPE_PARTIDAS_TABLET);
        i = datos.partidas.findIndex((p) => p.t === t);
        if (i < 0) return null;
      }
      const antes = datos.partidas[i];
      const nueva = {
        ...sinEstimacionSiOtro(antes, cambios.pick),
        ...(typeof cambios.gane === 'boolean' ? { gane: cambios.gane, ...leidaAntes(antes, cambios.gane) } : {}),
        ...(cambios.bans ? { bans: cambios.bans } : {}),
        draft: { ...(antes.draft ?? {}), ...(cambios.enemigos ? { enemigos: cambios.enemigos } : {}), ...(cambios.aliados ? { aliados: cambios.aliados } : {}) },
        editada: Date.now(),
      };
      datos.partidas[i] = nueva;
      datos.subidas = datos.subidas.filter((x) => x !== t);
      escribir();
      return { antes, nueva };
    },
  };
  return almacen;
}

/** Lo que se puede cambiar de una partida, saneado: héroes del catálogo (en su grafía), sin repetir en el draft, ≤5/4/10. `{ t, cambios }` o `{ error }`. */
export function sanearEdicion(cuerpo, nombres) {
  if (!cuerpo || !Number.isFinite(cuerpo.t)) return { error: 't' };
  const porClave = new Map(nombres.map((n) => [n.toLowerCase(), n]));
  const heroe = (x) => (typeof x === 'string' && x.trim() ? porClave.get(x.trim().toLowerCase()) ?? false : null);
  const lista = (l, max) => {
    if (l == null) return undefined;
    if (!Array.isArray(l) || l.length > max) return false;
    const h = l.map(heroe).filter((x) => x !== null);
    return h.includes(false) ? false : h;
  };
  const cambios = {};
  if (cuerpo.gane === true || cuerpo.gane === false) cambios.gane = cuerpo.gane;
  else if (cuerpo.gane !== undefined) return { error: 'gane' };
  if (cuerpo.pick !== undefined) { const p = heroe(cuerpo.pick); if (!p) return { error: 'pick' }; cambios.pick = p; }
  for (const [k, max] of [['enemigos', 5], ['aliados', 4], ['bans', 10]]) {
    const l = lista(cuerpo[k], max);
    if (l === false) return { error: k };
    if (l) cambios[k] = l;
  }
  const enDraft = [...(cambios.enemigos ?? []), ...(cambios.aliados ?? []), ...(cambios.pick ? [cambios.pick] : [])];
  if (new Set(enDraft).size !== enDraft.length) return { error: 'repetidos' };
  if (!Object.keys(cambios).length) return { error: 'nada' };
  return { t: cuerpo.t, cambios };
}

/** «Tu semana» para la APK: el mismo cálculo que el móvil (`tuSemana`); null sin partidas esta semana. */
export function semanaParaLaApk(partidas, ahora = Date.now()) {
  const s = tuSemana(partidas, { ahora });
  if (!s.n) return null;
  return {
    n: s.n, ganadas: s.ganadas, wr: s.wr,
    anterior: s.anterior ? { n: s.anterior.n, wr: s.anterior.wr, dif: s.anterior.dif, seVe: !!s.anterior.seVe } : null,
    funcionan: s.funcionan, cuestan: s.cuestan, numeroUno: s.numeroUno,
  };
}

/** «Tus números» para la APK (el mismo cálculo que el móvil), con TODAS las partidas; null sin ninguna. */
export function numerosParaLaApk(partidas) {
  const n = tusNumeros(partidas);
  return n.n ? {
    n: n.n, wr: n.wr, racha: n.racha, sesion: n.sesion,
    trasPerder: n.trasPerder ? { wr: n.trasPerder.wr, n: n.trasPerder.n, wrResto: n.trasPerder.wrResto, nResto: n.trasPerder.nResto, seVe: !!n.trasPerder.seVe, dif: n.trasPerder.dif } : null,
    heroes: n.heroes.filter((h) => h.lado).slice(0, 6).map((h) => ({ heroe: h.heroe, wr: h.wr, n: h.n, lado: h.lado })),
  } : null;
}

/**
 * La lista de «Mis partidas»: la base de datos con lo que la tablet aún no
 * subió encima (y su `supuesto`, que la base de datos no guardaba), las sin
 * resultado arriba si no se contestaron ya (mismo `t`), las 200 más nuevas.
 */
export function listaParaLaApk({ almacen, deLaBase = new Map() }) {
  const sinSubir = new Set(almacen.pendientes().map((p) => p.t));
  const locales = new Map(almacen.todas().map((p) => [p.t, p]));
  const todas = new Map([...deLaBase].map(([t, b]) => [t, locales.get(t)?.supuesto && locales.get(t).pick === b.pick ? { ...b, supuesto: true } : b]));
  for (const p of almacen.todas()) if (sinSubir.has(p.t) || !todas.has(p.t)) todas.set(p.t, { ...p, sinSubir: sinSubir.has(p.t) });
  const contestada = (s) => typeof todas.get(s.t)?.gane === 'boolean';
  const lista = [...almacen.sinResultado().filter((p) => !contestada(p)).map((p) => ({ ...p, sinResultado: true })), ...todas.values()].sort((a, b) => b.t - a.t).slice(0, PARTIDAS_EN_LA_APK).map((p) => ({
    t: p.t, pick: p.pick, ...(typeof p.gane === 'boolean' ? { gane: p.gane } : {}), ...(p.sinResultado ? { sinResultado: true } : {}), ...(p.supuesto ? { supuesto: true } : {}), ...(p.sinSubir ? { sinSubir: true } : {}),
    enemigos: p.draft?.enemigos ?? [], aliados: p.draft?.aliados ?? [], bans: p.bans ?? [], linea: p.draft?.linea ?? null,
    ...(Number.isFinite(p.duracion) ? { duracion: p.duracion } : {}), ...(p.resultadoDe ? { resultadoDe: p.resultadoDe } : {}), ...(p.editada ? { editada: true } : {}),
  }));
  const conResultado = [...todas.values()];
  return { partidas: lista, numeros: numerosParaLaApk(conResultado), semana: semanaParaLaApk(conResultado) };
}

/** Sube lo que la tablet no subió, con la clave dada y la configuración pública. Sin clave o sin configuración, nada. Nunca lanza. */
export async function subirLoDeLaTablet({ partidas, clave, config, fetch = globalThis.fetch }) {
  const conf = sanearConfig(config);
  const pendientes = partidas.pendientes();
  if (!conf || !claveDeJugadorValida(clave) || !pendientes.length) return { subidas: 0 };
  const r = await subirPartidas({ config: conf, clave, partidas: pendientes, completo: false }, { fetch }).catch((e) => ({ error: String(e?.message ?? e) }));
  if (r.error) return r;
  partidas.marcarSubidas(pendientes.map((p) => p.t));
  return { subidas: pendientes.length, total: r.total };
}
