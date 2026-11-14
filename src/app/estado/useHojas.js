import { useEffect, useRef, useState } from 'react';
import { probablesDelBando } from '../../motor/draft.js';
import { atajoDe, escribiendoEn } from '../atajos.js';

/** [P] Las páginas que se abren solas desde un enlace (el ordenador): hash → hoja. */
const PAGINAS_SUELTAS = { '#capturas': 'revisar', '#analisis': 'analisis' };
/** [D] Lo que se espera al «atrás» de la hoja que se cierra antes de abrir la siguiente. */
const DE_HOJA_A_HOJA_MS = 400;

const paginaDelHash = () => PAGINAS_SUELTAS[window.location.hash] ?? null;
// El hash se quita al leerlo, antes de que la hoja meta su entrada: si no, «atrás» la reabría.
const quitarHash = () => { try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`); } catch { /* sin historial */ } };

/**
 * Qué hoja se ve: 'enemigos' | 'aliados' | 'baneos' | 'yo' | 'linea' | 'apuntar' | 'historial' |
 * 'revisar' | 'analisis' | 'perfil' | 'meta' | 'admin' | 'maestria' | { build } | { ficha }.
 * El orden de las caras del selector de picks se calcula al ABRIR (o al
 * cambiar de pestaña, o al llegar los datos) y no se mueve mientras se toca.
 */
export function useHojas({ datos, linea, enemigos, aliados, fase }) {
  const [soloPagina, setSoloPagina] = useState(() => { const p = paginaDelHash(); if (p) quitarHash(); return p; });
  const [hoja, setHoja] = useState(() => soloPagina);
  const [ordenPick, setOrdenPick] = useState(null);
  const ordenar = (h) => setOrdenPick(probablesDelBando(datos, { equipo: h === 'aliados' ? aliados : enemigos, linea, bando: h }));
  const abrir = (h) => { if (h === 'enemigos' || h === 'aliados') ordenar(h); setHoja(h); };
  const cerrar = () => setHoja(null);
  const cerrarSuelta = () => { setSoloPagina(null); setHoja(null); };

  /** De una hoja a otra: la que se cierra retira su entrada con un «atrás» que llega DESPUÉS. */
  const deHojaAHoja = (nueva) => {
    setHoja(null);
    let hecho = false;
    const abrirYa = () => { if (hecho) return; hecho = true; window.removeEventListener('popstate', abrirYa); clearTimeout(reloj); setHoja(nueva); };
    window.addEventListener('popstate', abrirYa);
    const reloj = setTimeout(abrirYa, DE_HOJA_A_HOJA_MS);
  };

  useEffect(() => {
    const alCambiar = () => { const p = paginaDelHash(); if (p) { quitarHash(); setSoloPagina(p); setHoja(p); } };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  // El meta llega con la hoja de picks ya abierta: se ordena entonces (tocar un héroe NO reordena).
  useEffect(() => { if (hoja === 'enemigos' || hoja === 'aliados') ordenar(hoja); }, [datos]);

  // Las teclas del ordenador: E enemigos, A tu equipo, B baneos, solo con el draft a la vista.
  const tecla = useRef(null);
  tecla.current = (e) => {
    if (!linea || soloPagina) return;
    const tapado = !document.querySelector('.app .draft') || !!document.querySelector('.sheet, [role="dialog"]');
    const destino = atajoDe({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, enCampo: escribiendoEn(e.target) }, { hoja: hoja ?? (tapado ? 'otra' : null), fase });
    if (!destino) return;
    e.preventDefault();
    abrir(destino);
  };
  useEffect(() => {
    const alPulsar = (e) => tecla.current?.(e);
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  return { hoja, setHoja, soloPagina, ordenPick, abrir, cerrar, cerrarSuelta, deHojaAHoja };
}
