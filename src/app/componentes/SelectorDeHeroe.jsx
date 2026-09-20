import { useEffect, useMemo, useRef, useState } from 'react';
import { filtrarPorNombre } from '../../motor/alias.js';
import { nombreClave, buscar } from '../../motor/nombres.js';
import { Hoja } from './Hoja.jsx';
import { Cara } from './Imagen.jsx';
import { useOrdenEstable } from './useOrdenEstable.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Selector a pantalla completa: buscador enfocado y rejilla de toque grande.
 *
 * Modo `multi` (baneos): no se cierra al tocar, se marca y se sigue. En la
 * fase de baneos hay diez toques en medio minuto, y abrir-buscar-cerrar por
 * cada uno no daba tiempo. Los sugeridos van arriba, con orden estable.
 *
 * La búsqueda acepta el nombre que el juego usa en otros idiomas («Cíclope»)
 * y, si aun así no sale nadie, las letras en orden. Lo que se ENSEÑA es el
 * nombre en inglés, que es la clave de los datos.
 */
export function SelectorDeHeroe({
  heroes, cogidos, stats, onElegir, onCerrar, t = tPorDefecto,
  multi = false, seleccionados = null, max = 10, sugeridos = [], orden = 'pick',
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  // Enfocar UNA vez al abrir: con `onCerrar` en las dependencias el efecto se
  // repetía con cada baneo y el teclado volvía a salir encima de la rejilla.
  useEffect(() => { inputRef.current?.focus(); }, []);

  const lista = useMemo(() => {
    const pickRate = (h) => buscar(stats, h.name)?.pickRate ?? -1;
    // Para banear, primero los más baneados: es lo que se va a buscar.
    const banRate = (h) => buscar(stats, h.name)?.banRate ?? -1;
    // `dado`: el orden en que llegan (el ranking, para fijar tu pick).
    const posicion = new Map(heroes.map((h, i) => [h.name, -i]));
    const criterio = orden === 'ban' ? banRate : orden === 'dado' ? (h) => posicion.get(h.name) : pickRate;
    // Buscando, primero los que EMPIEZAN por lo escrito: «la» + Intro cogía a
    // Angela habiendo Lancelot, Layla y Lapu-Lapu. Sin buscar, los más
    // jugados: el pick que necesitas suele estar entre los veinte primeros.
    const qk = nombreClave(q);
    const empieza = (h) => (qk && nombreClave(h.name).startsWith(qk) ? 1 : 0);
    return filtrarPorNombre(heroes, q)
      .sort((a, b) => (q ? empieza(b) - empieza(a) : 0) || criterio(b) - criterio(a) || a.name.localeCompare(b.name));
  }, [heroes, q, stats, orden]);

  const marcado = (h) => !!seleccionados?.has(h.name);
  const lleno = multi && seleccionados && seleccionados.size >= max;
  const nombresSugeridos = useMemo(() => sugeridos.filter((h) => !cogidos.has(h.name)).map((h) => h.name), [sugeridos, cogidos]);
  const marcadosSet = useMemo(() => new Set(seleccionados ?? []), [seleccionados]);
  const ordenSugeridos = useOrdenEstable(nombresSugeridos, marcadosSet, 10);
  const porNombre = useMemo(() => new Map(heroes.map((h) => [h.name, h])), [heroes]);
  const chips = ordenSugeridos.map((n) => porNombre.get(n)).filter(Boolean);

  const elegir = (h) => {
    if (cogidos.has(h.name)) return;
    if (multi && lleno && !marcado(h)) return;
    onElegir(h);
    if (multi) setQ('');
  };
  // Intro coge el primero de la lista: tres letras y darle es más rápido que
  // apuntar al botón con el teclado del móvil abierto.
  const conIntro = (e) => {
    if (e.key !== 'Enter') return;
    const primero = lista.find((h) => !cogidos.has(h.name));
    if (primero) elegir(primero);
  };

  return (
    <Hoja etiqueta={t('app.elegirHeroe')} onCerrar={onCerrar}>
      <div className="sheet-head">
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('app.buscar')} autoComplete="off" onKeyDown={conIntro} />
        <button className="close" onClick={onCerrar}>{multi ? t('sheet.listo') : t('app.cerrar')}</button>
      </div>
      {multi && seleccionados && <p className="sheet-cuenta">{t('sheet.baneados', { n: seleccionados.size, max })}</p>}
      {multi && !q && chips.length > 0 && (
        <div className="sheet-sugeridos">
          <span className="side-label">{t('sheet.sugeridos')}</span>
          {chips.map((h) => (
            <button key={h.name} className={`chip ${marcado(h) ? 'elegido' : ''}`} aria-pressed={marcado(h)} disabled={lleno && !marcado(h)} onClick={() => elegir(h)}>
              <Cara heroe={h} className="grid-cara" tam={22} />
              {h.name}
            </button>
          ))}
        </div>
      )}
      <div className="hero-grid">
        {lista.map((h) => (
          <button
            key={h.name}
            className={marcado(h) ? 'elegido' : ''}
            disabled={cogidos.has(h.name) || (lleno && !marcado(h))}
            aria-pressed={multi ? marcado(h) : undefined}
            onClick={() => elegir(h)}
          >
            <Cara heroe={h} className="grid-cara" tam={30} />
            <span className="grid-nombre">{h.name}</span>
          </button>
        ))}
        {!lista.length && <p className="empty-state">{t('app.sinNombre')}</p>}
      </div>
    </Hoja>
  );
}
