import { tic } from '../tacto.js';
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
 * Desde 3.16.0 los picks van igual: el selector de enemigos y el de tu
 * equipo son UNO, con pestañas (`bandos`), y no se cierra al tocar. Antes
 * cada pick era abrir, buscar y cerrar, y a Javi se le echaba encima la
 * partida metiendo el draft. Y el de baneos enseña primero tu línea
 * (`pool`): medido sobre sus 42 drafts, los baneos de otras líneas no
 * cambian el nº1 en NINGUNO; los de la tuya solo tachan al que no puedes
 * coger.
 *
 * La búsqueda acepta el nombre que el juego usa en otros idiomas («Cíclope»)
 * y, si aun así no sale nadie, las letras en orden. Lo que se ENSEÑA es el
 * nombre en inglés, que es la clave de los datos.
 */
export function SelectorDeHeroe({
  heroes, cogidos, stats, onElegir, onCerrar, t = tPorDefecto,
  multi = false, seleccionados = null, max = 10, sugeridos = [], orden = 'pick',
  bandos = null, onBando = null, cuenta = null, pool: poolDado = null,
}) {
  const [q, setQ] = useState('');
  // Con `pool` (tu línea), empieza enseñando solo esos; buscando, todos. Un
  // pool vacío (el meta aún no ha llegado) no filtra: «Tu línea (0)» no enseñaba nada.
  const pool = poolDado?.size ? poolDado : null;
  const [soloPool, setSoloPool] = useState(!!pool);
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
    const base = pool && soloPool && !q ? heroes.filter((h) => pool.has(h.name)) : heroes;
    return filtrarPorNombre(base, q)
      .sort((a, b) => (q ? empieza(b) - empieza(a) : 0) || criterio(b) - criterio(a) || a.name.localeCompare(b.name));
  }, [heroes, q, stats, orden, pool, soloPool]);

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
    tic();
    onElegir(h);
    if (multi) setQ('');
  };
  // Intro coge el primero de la lista: tres letras y darle es más rápido que
  // apuntar al botón con el teclado del móvil abierto. En multi-toque se
  // salta a los ya marcados: tocarlos los QUITA, y con Alice metida, «al» +
  // Intro buscando a Alucard la quitaba sin avisar.
  const conIntro = (e) => {
    if (e.key !== 'Enter') return;
    const primero = lista.find((h) => !cogidos.has(h.name) && !(multi && marcado(h)));
    if (primero) elegir(primero);
  };

  return (
    <Hoja etiqueta={t('app.elegirHeroe')} onCerrar={onCerrar}>
      <div className="sheet-head">
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('app.buscar')} autoComplete="off" onKeyDown={conIntro} />
        <button className="close" onClick={onCerrar}>{multi ? t('sheet.listo') : t('app.cerrar')}</button>
      </div>
      {bandos && (
        <div className="sheet-bandos" role="tablist">
          {bandos.map((b) => (
            <button key={b.id} role="tab" aria-selected={b.activo} className={`bando-${b.id} ${b.activo ? 'activo' : ''}`.trim()} onClick={() => onBando?.(b.id)}>
              {b.etiqueta} <span className="chip-pct">{b.n}/{b.max}</span>
            </button>
          ))}
        </div>
      )}
      {multi && seleccionados && <p className="sheet-cuenta">{cuenta ?? t('sheet.baneados', { n: seleccionados.size, max })}</p>}
      {pool && !q && (
        <div className="sheet-filtro" role="group">
          <button aria-pressed={soloPool} onClick={() => setSoloPool(true)}>{t('sheet.tuLinea', { n: pool.size })}</button>
          <button aria-pressed={!soloPool} onClick={() => setSoloPool(false)}>{t('sheet.todos')}</button>
          {soloPool && <span className="sheet-cuenta">{t('sheet.soloTuLinea')}</span>}
        </div>
      )}
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
