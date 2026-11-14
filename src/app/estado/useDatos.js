import { useEffect, useMemo, useState } from 'react';
import { prepararDatos } from '../../motor/draft.js';

/** [P] Cuándo se vuelve a pedir el meta: el service worker da primero la copia de la caché. */
export const RELEER_DATOS_MS = 5000;

/** Lo que distingue una corrida de datos de otra: sus tres fechas. */
export const huellaDeDatos = (m) => (m ? `${m.generatedAt}|${m.relaciones?.descargada ?? ''}|${m.tiers?.fecha ?? ''}` : '');

/**
 * La antigüedad de los datos: la de las estadísticas (`generatedAt`) y la
 * de la matriz de cruces (`relaciones.descargada`, o la misma si no viene).
 * `edadHoras` es la de lo MÁS viejo, que es lo que marca «viejo».
 */
export function edadDeLosDatos(meta, ahora = Date.now()) {
  const fecha = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
  const generado = fecha(meta?.generatedAt);
  const matriz = fecha(meta?.relaciones?.descargada) ?? generado;
  const horas = (d) => (d ? (ahora - d) / 3.6e6 : null);
  const edadStats = horas(generado);
  const edadMatrizHoras = horas(matriz);
  const edadHoras = edadStats == null ? edadMatrizHoras : Math.max(edadStats, edadMatrizHoras ?? edadStats);
  return { generado, edadHoras, edadMatrizHoras };
}

/**
 * Los ficheros de datos: el catálogo (imprescindible), el meta (puede faltar
 * la primera vez) y las partidas pro (un extra). `datos` es lo que consume
 * el motor, indexado UNA vez por cambio de fichero o de rango.
 */
export function useDatos(rango) {
  const [catalogo, setCatalogo] = useState(null);
  const [meta, setMeta] = useState(null);
  // Hasta que el meta conteste (o falle) no se avisa de «sin winrates»: el catálogo llega antes.
  const [metaListo, setMetaListo] = useState(false);
  const [pro, setPro] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const traer = async (ruta) => {
      const res = await fetch(ruta, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${ruta}: ${res.status}`);
      return res.json();
    };
    traer('./data/heroes.json').then(setCatalogo).catch((e) => setError(e.message));
    traer('./data/roam-meta.json').then(setMeta).catch(() => setMeta(null)).finally(() => setMetaListo(true));
    traer('./data/pro.json').then(setPro).catch(() => setPro(null));
    // Lo nuevo llega a la caché DESPUÉS de abrir: se vuelve a pedir y, si es otro, se usa.
    const otraVez = setTimeout(() => {
      traer('./data/roam-meta.json').then((m) => setMeta((antes) => (huellaDeDatos(m) !== huellaDeDatos(antes) ? m : antes))).catch(() => {});
    }, RELEER_DATOS_MS);
    return () => clearTimeout(otraVez);
  }, []);

  const datos = useMemo(() => prepararDatos({ catalogo, meta, rango }), [catalogo, meta, rango]);
  const { generado, edadHoras, edadMatrizHoras } = edadDeLosDatos(meta);
  const sinWinrates = metaListo && (!datos.meta.stats || !Object.keys(datos.meta.stats).length);
  return { catalogo, meta, metaListo, pro, error, datos, generado, edadHoras, edadMatrizHoras, sinWinrates };
}
