import { useEffect, useMemo, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { crearT, idiomaPorDefecto } from '../i18n/index.js';

/**
 * Lo que se toca UNA vez y se recuerda: la línea que juegas (sin ella la app
 * no sabe qué recomendar, así que en el primer arranque se pregunta), el
 * rango del que salen los winrates y el idioma (el del móvil si lo hablamos;
 * si no, inglés).
 */
export function useAjustes() {
  const [rango, setRango] = useState(() => leer(CLAVES.rango, null));
  const [linea, setLinea] = useState(() => leer(CLAVES.linea, null));
  const [idioma, setIdioma] = useState(() => leer(CLAVES.idioma, null) ?? idiomaPorDefecto());
  const t = useMemo(() => crearT(idioma), [idioma]);

  useEffect(() => { if (rango) guardar(CLAVES.rango, rango); }, [rango]);
  useEffect(() => { if (linea) guardar(CLAVES.linea, linea); }, [linea]);
  useEffect(() => { guardar(CLAVES.idioma, idioma); }, [idioma]);
  useEffect(() => { document.documentElement.lang = idioma; }, [idioma]);

  return { rango, setRango, linea, setLinea, idioma, setIdioma, t };
}
