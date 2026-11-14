import { useCallback, useEffect, useMemo, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { crearT, idiomaPorDefecto } from '../i18n/index.js';
import { activarTacto } from '../tacto.js';
import { sanearLectorTablet, lectorTabletDeEnlace, ponerLectorEnTablet } from '../lector.js';

/**
 * El enlace del QR de la tablet (`#lector=IP:PUERTO&codigo=…`), una vez por
 * carga (el modo estricto llama dos veces al inicializador): sale de la barra
 * de direcciones y queda PENDIENTE de un toque, porque cualquier mensaje
 * podría traer un enlace así hacia otro aparato de la wifi.
 */
let enlaceLeido;
function vinculoDelEnlace() {
  if (enlaceLeido !== undefined) return enlaceLeido;
  try {
    enlaceLeido = lectorTabletDeEnlace(window.location.hash);
    if (enlaceLeido) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { enlaceLeido = null; }
  return enlaceLeido;
}

/**
 * Lo que se toca UNA vez y se recuerda: tu línea (sin ella no hay qué
 * recomendar), el rango, el idioma (el del móvil si lo hablamos; si no,
 * inglés), la vibración, «Leer solo» y la tablet vinculada.
 */
export function useAjustes() {
  const [rango, setRango] = useState(() => leer(CLAVES.rango, null));
  const [linea, setLinea] = useState(() => leer(CLAVES.linea, null));
  const [idioma, setIdioma] = useState(() => leer(CLAVES.idioma, null) ?? idiomaPorDefecto());
  const [tacto, setTacto] = useState(() => leer(CLAVES.tacto, true) !== false);
  // [P] Apagado hasta que se enciende (o se vincula una tablet).
  const [lectorAuto, setLectorAuto] = useState(() => leer(CLAVES.lectorAuto, false) === true);
  const [lectorTablet, setLectorTabletCrudo] = useState(() => sanearLectorTablet(leer(CLAVES.lectorTablet, null)));
  // Estable (la búsqueda de la tablet la tiene en sus dependencias); desvincular apaga «Leer solo».
  const setLectorTablet = useCallback((x) => { const tablet = sanearLectorTablet(x); setLectorTabletCrudo(tablet); if (!tablet) setLectorAuto(false); }, []);
  const [vinculoPendiente, setVinculoPendiente] = useState(vinculoDelEnlace);
  const confirmarVinculo = (si) => {
    if (si && vinculoPendiente) { setLectorTablet(vinculoPendiente); setLectorAuto(true); }
    setVinculoPendiente(null);
  };
  // Antes de que nada pida a la tablet (efectos incluidos): es un valor del módulo.
  ponerLectorEnTablet(lectorTablet);
  const t = useMemo(() => crearT(idioma), [idioma]);

  useEffect(() => { if (rango) guardar(CLAVES.rango, rango); }, [rango]);
  useEffect(() => { if (linea) guardar(CLAVES.linea, linea); }, [linea]);
  useEffect(() => { guardar(CLAVES.idioma, idioma); document.documentElement.lang = idioma; }, [idioma]);
  useEffect(() => { activarTacto(tacto); guardar(CLAVES.tacto, tacto); }, [tacto]);
  useEffect(() => { guardar(CLAVES.lectorAuto, lectorAuto); }, [lectorAuto]);
  useEffect(() => { guardar(CLAVES.lectorTablet, lectorTablet); }, [lectorTablet]);

  return { rango, setRango, linea, setLinea, idioma, setIdioma, tacto, setTacto, lectorAuto, setLectorAuto, lectorTablet, setLectorTablet, vinculoPendiente, confirmarVinculo, t };
}
