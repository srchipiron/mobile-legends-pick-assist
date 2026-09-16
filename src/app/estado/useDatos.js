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
  }, []);

  const datos = useMemo(() => prepararDatos({ catalogo, meta, rango }), [catalogo, meta, rango]);

  const generado = meta?.generatedAt ? new Date(meta.generatedAt) : null;
  const fechaValida = !!generado && !Number.isNaN(generado.getTime());
  const edadHoras = fechaValida ? (Date.now() - generado) / 3.6e6 : null;
  const sinWinrates = metaListo && (!datos.meta.stats || !Object.keys(datos.meta.stats).length);

  return { catalogo, meta, metaListo, pro, error, datos, generado: fechaValida ? generado : null, edadHoras, sinWinrates };
}
