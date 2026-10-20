import { useEffect, useMemo, useState } from 'react';
import { prepararDatos } from '../../motor/draft.js';

/**
 * Los ficheros de datos: el catálogo (imprescindible), el meta de la API
 * (puede faltar en el primer arranque: la app sigue siendo útil sin él) y
 * las partidas profesionales (un extra). Y `datos`, que es lo que el motor
 * consume: todo indexado UNA vez por cambio de fichero o de rango.
 */
export function useDatos(rango) {
  const [catalogo, setCatalogo] = useState(null);
  const [meta, setMeta] = useState(null);
  // Hasta que roam-meta.json responda (o falle) no se enseñan los avisos de
  // «sin winrates» / «sin pool»: el catálogo llega antes y parecían fallos.
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
    // Con el service worker al mando, la primera respuesta es la de la caché
    // (StaleWhileRevalidate: abre al instante, también sin cobertura) y lo
    // nuevo llega a la caché DESPUÉS: se veían siempre los datos de la
    // visita anterior (3.60.5). Pasados unos segundos se pide otra vez y, si
    // son otros, se usan.
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

/**
 * La antigüedad de los datos (3.60.1). Desde 3.59.6 `generatedAt` es la de
 * las estadísticas y la matriz de cruces y parejas lleva la suya
 * (`relaciones.descargada`): con la matriz conservada semanas, la cabecera
 * decía «0 h» y no se marcaba vieja. `edadHoras` es la de lo MÁS viejo de
 * las dos, que es lo que marca «viejo»; sin `descargada` (ficheros de antes)
 * la matriz es de `generatedAt`.
 */
/** Cuándo se vuelven a pedir los datos, para coger lo que la caché trajo al abrir (decisión de producto). */
export const RELEER_DATOS_MS = 5000;

/** Lo que distingue una corrida de datos de otra: sus fechas. */
export const huellaDeDatos = (m) => (m ? `${m.generatedAt}|${m.relaciones?.descargada ?? ''}|${m.tiers?.fecha ?? ''}` : '');

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
