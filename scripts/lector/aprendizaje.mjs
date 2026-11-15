/**
 * Aprender de lo que dice una persona: la corrección del móvil (`POST
 * /draft`), la tarjeta «Enseña al lector» de la APK y lo arreglado en el
 * historial (recortes de la base de datos). Todo pasa por UNA cola: un
 * aprendizaje a la vez sobre lo aprendido de ese momento, en un hilo aparte
 * (unas decenas de segundos por captura en la tablet). Lo que la tablet leyó
 * sola nunca es la verdad.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { resumirAprendizaje, sinHuecosVacios, VERSION_APRENDIDO } from './aprender.mjs';
import { capturasAMirar, ID_DE_LECTURA } from './capturas.mjs';

/** [D] Drafts arreglados que se aprenden de una vez: unos segundos de hilo cada uno. */
export const ARREGLOS_POR_TANDA = 10;

/** [C] Dónde guarda la tablet lo aprendido (sobrevive a las actualizaciones de la APK). */
export const ficheroAprendido = (casa) => join(casa, '.config', 'lector', 'aprendido.json');

/** Lo aprendido, si es de la versión actual (la 1 se aprendió sin guardas y se descarta), sin iconos de hueco vacío. */
export function leerAprendido(fichero) {
  try { const a = JSON.parse(readFileSync(fichero, 'utf8')); return a && typeof a === 'object' && a.version === VERSION_APRENDIDO ? sinHuecosVacios(a) : null; } catch { return null; }
}
export function guardarAprendido(a, fichero) {
  try { mkdirSync(dirname(fichero), { recursive: true }); writeFileSync(fichero, JSON.stringify(a)); } catch { /* sin disco: se aprende otra vez */ }
}
/** Lo aprendido de disco, diciendo qué hay. */
export function cargarLoAprendido(fichero, registrar) {
  const aprendido = leerAprendido(fichero);
  if (!aprendido && existsSync(fichero)) registrar('Lo aprendido con una versión anterior del lector se descarta (sin las guardas de hoy). Se vuelve a aprender solo.');
  if (aprendido) registrar(`Con lo aprendido de ${aprendido.capturas} capturas: ${Object.keys(aprendido.caras ?? {}).length} caras de esta tablet${aprendido.picks ? ' y los huecos de picks medidos aquí' : ''}.`);
  return aprendido;
}

/** Lo que contesta un hilo de una sola tarea. */
const respuestaDe = (hilo) => new Promise((resolver, rechazar) => {
  hilo.once('message', resolver);
  hilo.once('error', rechazar);
  hilo.once('exit', (codigo) => { if (codigo !== 0) rechazar(new Error(`un hilo del lector salió con ${codigo}`)); });
});
/** El aprendizaje, en su hilo (aprender-tarea.mjs). */
export const aprenderEnHilo = ({ pares, aprendido }) => respuestaDe(new Worker(new URL('aprender-tarea.mjs', import.meta.url), { workerData: { pares, aprendido } }));
/** Los recortes de un draft para medir el lector, en su hilo (recortes-tarea.mjs). */
export const recortarEnHilo = ({ capturas, aprendido }) => respuestaDe(new Worker(new URL('recortes-tarea.mjs', import.meta.url), { workerData: { capturas, aprendido } }));

const nombresDe = (informe) => ({
  aprendidos: informe.flatMap((l) => [...l.aprendidos.map((a) => a.nombre), ...(l.aliados?.aprendidos ?? [])]),
  sinEncontrar: informe.flatMap((l) => l.sinEncontrar.map((x) => x.nombre)),
});

/**
 * La cola. `carpeta`: las capturas (sin ella no hay de qué aprender);
 * `guardar(aprendido)`: a disco. Las capturas que la cola está mirando
 * (también mientras espera) salen en `enUso()`: la poda no se las lleva.
 */
export function crearAprendizaje({ carpeta = null, aprendido: inicial = null, aprender = aprenderEnHilo, recortar = recortarEnHilo, guardar = () => {}, registrar = () => {} } = {}) {
  let aprendido = inicial;
  let cola = Promise.resolve();
  const enUso = new Map();
  const usando = async (ids, fn) => {
    for (const id of ids) enUso.set(id, (enUso.get(id) ?? 0) + 1);
    try { return await fn(); } finally { for (const id of ids) { const n = (enUso.get(id) ?? 1) - 1; if (n > 0) enUso.set(id, n); else enUso.delete(id); } }
  };
  /** Una tanda en la cola: aprende sobre lo aprendido de ESE momento y lo guarda. */
  const tanda = (pares) => {
    const r = cola.then(async () => {
      const hecho = await aprender({ pares, aprendido });
      aprendido = hecho.aprendido;
      guardar(aprendido);
      return hecho;
    });
    cola = r.catch(() => {});
    return r;
  };
  const conCaptura = (id) => typeof id === 'string' && ID_DE_LECTURA.test(id) && !!carpeta && existsSync(join(carpeta, `${id}.png`));

  return {
    aprendido: () => aprendido,
    enUso: () => [...enUso.keys()],
    /** La verdad de un draft (`{ ids, enemigos, aliados, tuyo, baneos }`): se guarda junto a cada captura y se aprende de las repartidas. */
    async corregir({ ids, enemigos, baneos, aliados, tuyo }) {
      if (!carpeta) return { aprendido: false, motivo: 'sin carpeta de capturas' };
      const nombres = (l) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string').slice(0, 10).map((x) => x.slice(0, 40)) : []);
      const verdad = { enemigos: nombres(enemigos).slice(0, 5), baneos: nombres(baneos), aliados: nombres(aliados).slice(0, 4), tuyo: typeof tuyo === 'string' ? tuyo.slice(0, 40) : null, cuando: new Date().toISOString() };
      const validos = (Array.isArray(ids) ? ids : []).filter(conCaptura);
      for (const id of validos) writeFileSync(join(carpeta, `${id}.verdad.json`), JSON.stringify(verdad));
      const pares = capturasAMirar(validos).map((id) => ({ id, png: join(carpeta, `${id}.png`), verdad }));
      if (!pares.length || !verdad.enemigos.length) return { aprendido: false, motivo: 'nada que cruzar' };
      return usando(pares.map((p) => p.id), async () => {
        registrar(`Corrección recibida (${verdad.enemigos.length} enemigos, ${verdad.baneos.length} baneos): aprendiendo de ${pares.length} capturas…`);
        const r = await tanda(pares);
        for (const l of resumirAprendizaje(r)) registrar(l);
        return { aprendido: true, ...nombresDe(r.informe) };
      });
    },
    /**
     * Los drafts arreglados en el historial: sus recortes (`picks`) con la
     * verdad que pusiste. Solo con forma y como mucho una tanda. `hechos`:
     * las claves miradas o sin forma (no se repiten); las que fallan se
     * reintentan la próxima vez.
     */
    async aprenderDeArreglos(drafts) {
      const texto = (x) => (typeof x === 'string' && x.length <= 40 ? x : null);
      const lista = (l, n) => (Array.isArray(l) ? l.map(texto).filter(Boolean).slice(0, n) : []);
      const salida = { mirados: 0, aprendidos: [], hechos: [], fallidos: 0 };
      const claveDe = (d) => (typeof d?.clave === 'string' ? d.clave : null);
      const buenos = (Array.isArray(drafts) ? drafts : []).slice(0, ARREGLOS_POR_TANDA).map((d) => {
        const verdad = { enemigos: lista(d?.verdad?.enemigos, 5), aliados: lista(d?.verdad?.aliados, 4), tuyo: texto(d?.verdad?.tuyo), baneos: [] };
        const pares = (Array.isArray(d?.capturas) ? d.capturas : []).slice(0, 2)
          .filter((c) => typeof c?.id === 'string' && /^lectura-[\w-]{1,80}$/.test(c.id) && typeof c.picks === 'string' && c.picks.length <= 120000 && /^[A-Za-z0-9+/=]+$/.test(c.picks))
          .map((c) => ({ id: c.id, picks: c.picks, verdad }));
        if (verdad.enemigos.length && pares.length) return { pares, clave: claveDe(d) };
        if (claveDe(d)) salida.hechos.push(claveDe(d));
        return null;
      }).filter(Boolean);
      for (const { pares, clave } of buenos) {
        try {
          const r = await tanda(pares);
          salida.mirados += 1;
          if (clave) salida.hechos.push(clave);
          salida.aprendidos.push(...nombresDe(r.informe).aprendidos);
        } catch (e) { salida.fallidos += 1; registrar(`Aprender de lo arreglado: no se pudo (${e.message}).`); }
      }
      return salida;
    },
    /** Los recortes de las capturas de un draft (para medir el lector): [] si no hay o si el hilo falla. */
    async recortesDe(ids) {
      const validos = (Array.isArray(ids) ? ids : []).filter(conCaptura);
      if (!validos.length) return [];
      try {
        const mirar = capturasAMirar(validos);
        const r = await usando(mirar, () => recortar({ capturas: mirar.map((id) => ({ id, png: join(carpeta, `${id}.png`) })), aprendido }));
        return Array.isArray(r) ? r : [];
      } catch (e) { registrar(`No se pudieron recortar las capturas del draft: ${e.message}`); return []; }
    },
  };
}
