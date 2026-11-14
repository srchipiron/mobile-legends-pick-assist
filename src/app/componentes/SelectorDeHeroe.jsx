import { useEffect, useMemo, useRef, useState } from 'react';
import { filtrarPorNombre } from '../../motor/alias.js';
import { nombreClave, buscar } from '../../motor/nombres.js';
import { tic } from '../tacto.js';
import { Hoja } from './Hoja.jsx';
import { Cara } from './Imagen.jsx';
import { RejillaDeHeroes } from './RejillaDeHeroes.jsx';
import { useOrdenEstable } from './useOrdenEstable.js';
import { useT } from '../i18n/contexto.js';

/**
 * El selector de héroe a pantalla completa. En `multi` (baneos y picks) no
 * se cierra al tocar: se marca, otro toque quita, y se sigue. Los picks son
 * UNA hoja con pestañas (`bandos`); los baneos empiezan por tu línea
 * (`pool`) con los siguientes probables arriba, estables. La búsqueda acepta
 * el nombre del juego en otros idiomas; lo que se enseña es el nombre en
 * inglés, que es la clave de los datos.
 *
 * @param orden  'ban' (más baneados), 'pick' (más jugados) o 'dado' (el orden en que llegan)
 */
export function SelectorDeHeroe({ heroes, cogidos, stats, onElegir, onCerrar, multi = false, seleccionados = null, max = 10, sugeridos = [], orden = 'pick', bandos = null, onBando = null, cuenta = null, pool: poolDado = null }) {
  const t = useT();
  const [q, setQ] = useState('');
  // Un pool vacío (el meta aún no ha llegado) no filtra: «Tu línea (0)» no enseñaba nada.
  const pool = poolDado?.size ? poolDado : null;
  const [soloPool, setSoloPool] = useState(!!pool);
  const inputRef = useRef(null);
  // [M] Foco UNA vez y solo con puntero fino: en el móvil el teclado tapaba media rejilla (22 caras → 8).
  useEffect(() => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    inputRef.current?.focus();
  }, []);

  // Los que no se pueden tocar al RECIBIR el orden van al final y ahí se quedan: nada se mueve bajo el dedo.
  const fueraAlOrdenar = useMemo(() => cogidos, [heroes]);
  const lista = useMemo(() => {
    const pickRate = (h) => buscar(stats, h.name)?.pickRate ?? -1;
    const banRate = (h) => buscar(stats, h.name)?.banRate ?? -1;
    const posicion = new Map(heroes.map((h, i) => [h.name, -i]));
    const criterio = orden === 'ban' ? banRate : orden === 'dado' ? (h) => posicion.get(h.name) : pickRate;
    // Buscando, primero los que EMPIEZAN por lo escrito («la» + Intro cogía a Angela habiendo Layla).
    const qk = nombreClave(q);
    const empieza = (h) => (qk && nombreClave(h.name).startsWith(qk) ? 1 : 0);
    const fuera = (h) => (fueraAlOrdenar.has(h.name) ? 1 : 0);
    const base = pool && soloPool && !q ? heroes.filter((h) => pool.has(h.name)) : heroes;
    return filtrarPorNombre(base, q).sort((a, b) => fuera(a) - fuera(b) || (q ? empieza(b) - empieza(a) : 0) || criterio(b) - criterio(a) || a.name.localeCompare(b.name));
  }, [heroes, q, stats, orden, pool, soloPool, fueraAlOrdenar]);

  const marcado = (h) => !!seleccionados?.has(h.name);
  const lleno = multi && seleccionados && seleccionados.size >= max;
  const nombresSugeridos = useMemo(() => sugeridos.filter((h) => !cogidos.has(h.name)).map((h) => h.name), [sugeridos, cogidos]);
  const marcadosSet = useMemo(() => new Set(seleccionados ?? []), [seleccionados]);
  const ordenSugeridos = useOrdenEstable(nombresSugeridos, marcadosSet, 10);
  const porNombre = useMemo(() => new Map(heroes.map((h) => [h.name, h])), [heroes]);
  const chips = ordenSugeridos.map((n) => porNombre.get(n)).filter(Boolean);

  const elegir = (h) => {
    if (cogidos.has(h.name) || (lleno && !marcado(h))) return;
    tic();
    onElegir(h);
    if (multi) setQ('');
  };
  // Intro coge el primero que se puede tocar y, en multi, no marcado (tocar un marcado lo QUITA).
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
      <RejillaDeHeroes
        heroes={lista} caras={30} onElegir={elegir} elegido={marcado} pulsado={multi ? marcado : null}
        bloqueado={(h) => cogidos.has(h.name) || (lleno && !marcado(h))}
      >
        {!lista.length && <p className="empty-state">{t('app.sinNombre')}</p>}
      </RejillaDeHeroes>
    </Hoja>
  );
}
