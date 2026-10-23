import { useCallback, useEffect, useMemo, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { crearT, idiomaPorDefecto } from '../i18n/index.js';
import { activarTacto } from '../tacto.js';
import { sanearLectorTablet, lectorTabletDeEnlace, ponerLectorEnTablet } from '../lector.js';

/**
 * El enlace del QR de la tablet (`#lector=IP:PUERTO&codigo=…`), una vez: se
 * quita de la barra de direcciones (que no se quede a la vista ni en el
 * historial) y queda PENDIENTE de un toque: cualquier mensaje podría traer
 * un enlace así hacia otro aparato de la wifi (revisión de seguridad de
 * 3.61.0). Al confirmarlo se guarda y se enciende «Leer solo».
 */
let enlaceLeido;
function vinculoDelEnlace() {
  // Una sola vez por carga: el modo estricto llama dos veces al inicializador y la segunda ya no vería el enlace.
  if (enlaceLeido !== undefined) return enlaceLeido;
  try {
    enlaceLeido = lectorTabletDeEnlace(window.location.hash);
    if (enlaceLeido) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { enlaceLeido = null; }
  return enlaceLeido;
}

/**
 * Lo que se toca UNA vez y se recuerda: la línea que juegas (sin ella la app
 * no sabe qué recomendar, así que en el primer arranque se pregunta), el
 * rango del que salen los winrates y el idioma (el del móvil si lo hablamos;
 * si no, inglés). Y si el móvil vibra al tocar (3.22.0).
 */
export function useAjustes() {
  const [rango, setRango] = useState(() => leer(CLAVES.rango, null));
  const [linea, setLinea] = useState(() => leer(CLAVES.linea, null));
  const [idioma, setIdioma] = useState(() => leer(CLAVES.idioma, null) ?? idiomaPorDefecto());
  const [tacto, setTacto] = useState(() => leer(CLAVES.tacto, true) !== false);
  // El lector leyendo solo (3.28.0): apagado hasta que se enciende una vez. Sin
  // lector, encendido solo costaría una petición fallida cada pocos segundos.
  const [lectorAuto, setLectorAuto] = useState(() => leer(CLAVES.lectorAuto, false) === true);
  // El lector en la tablet (3.61.0): null es el de Termux, en este móvil.
  const [lectorTablet, setLectorTabletCrudo] = useState(() => sanearLectorTablet(leer(CLAVES.lectorTablet, null)));
  // Estable (3.65.4): la búsqueda de la tablet la tiene en sus dependencias.
  const setLectorTablet = useCallback((x) => setLectorTabletCrudo(sanearLectorTablet(x)), []);
  const [vinculoPendiente, setVinculoPendiente] = useState(vinculoDelEnlace);
  const confirmarVinculo = (si) => {
    if (si && vinculoPendiente) { setLectorTablet(vinculoPendiente); setLectorAuto(true); }
    setVinculoPendiente(null);
  };
  // Antes de que nada pida al lector (efectos incluidos): es un valor del módulo.
  ponerLectorEnTablet(lectorTablet);
  // La voz de los consejos en directo, callada (3.53.0). Clave nueva: sin ella, habla.
  const [vozCallada, setVozCallada] = useState(() => leer(CLAVES.vozCallada, false) === true);
  const t = useMemo(() => crearT(idioma), [idioma]);

  useEffect(() => { if (rango) guardar(CLAVES.rango, rango); }, [rango]);
  useEffect(() => { if (linea) guardar(CLAVES.linea, linea); }, [linea]);
  useEffect(() => { guardar(CLAVES.idioma, idioma); }, [idioma]);
  useEffect(() => { document.documentElement.lang = idioma; }, [idioma]);
  useEffect(() => { activarTacto(tacto); guardar(CLAVES.tacto, tacto); }, [tacto]);
  useEffect(() => { guardar(CLAVES.lectorAuto, lectorAuto); }, [lectorAuto]);
  useEffect(() => { guardar(CLAVES.vozCallada, vozCallada); }, [vozCallada]);
  useEffect(() => { guardar(CLAVES.lectorTablet, lectorTablet); }, [lectorTablet]);

  return { rango, setRango, linea, setLinea, idioma, setIdioma, tacto, setTacto, lectorAuto, setLectorAuto, vozCallada, setVozCallada, lectorTablet, setLectorTablet, vinculoPendiente, confirmarVinculo, t };
}
