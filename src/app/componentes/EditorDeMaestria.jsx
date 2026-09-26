import { useMemo, useState } from 'react';
import { Hoja } from './Hoja.jsx';
import { leerDecimal } from './numero.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Tu maestría: partidas y winrate con cada héroe de tu línea. Es el término
 * «tú» del modelo, el que separa tus picks de una tier list. Se trabaja en
 * porcentaje (50,6) porque es como sale en el perfil del juego; la
 * conversión a fracción se hace solo al guardar.
 */
export function EditorDeMaestria({ pool, maestria, onGuardar, onCerrar, t = tPorDefecto }) {
  const [borrador, setBorrador] = useState(() => Object.fromEntries(
    Object.entries(maestria).map(([nombre, m]) => [nombre, { games: String(m.games ?? ''), wr: m.winRate != null ? String(+(m.winRate * 100).toFixed(1)) : '' }]),
  ));
  const poner = (nombre, campo, valor) => setBorrador((prev) => ({ ...prev, [nombre]: { games: '', wr: '', ...(prev[nombre] ?? {}), [campo]: valor } }));

  const guardar = () => {
    const limpia = {};
    // Guardar es decir «estos son mis números del juego HOY» (3.13.0): cada
    // héroe lleva la fecha, y las partidas que apuntes después se le suman
    // (motor/maestria.js). Un héroe que no has tocado y ya tenía fecha la
    // conserva: sus números siguen siendo los de aquel día.
    const ahora = Date.now();
    for (const [nombre, e] of Object.entries(borrador)) {
      const games = leerDecimal(e.games);
      const wr = leerDecimal(e.wr);
      const antes = maestria?.[nombre];
      const igual = antes && antes.games === games && Math.abs(antes.winRate - wr / 100) < 1e-9;
      if (games > 0 && wr > 0 && wr <= 100) limpia[nombre] = { games, winRate: wr / 100, desde: igual && Number.isFinite(antes.desde) ? antes.desde : ahora };
      // Una fila con errata («50.6%», un campo vaciado a medias) no borra lo
      // que había. Borrar es dejar los dos campos vacíos.
      else if ((e.games ?? '') !== '' || (e.wr ?? '') !== '') { if (maestria?.[nombre]) limpia[nombre] = maestria[nombre]; }
    }
    onGuardar(limpia);
    onCerrar();
  };

  // Ordenado UNA vez por la maestría guardada: ordenando por lo tecleado, la
  // fila en la que escribías saltaba de sitio con la primera tecla.
  const ordenados = useMemo(() => [...pool].sort((a, b) => {
    const relleno = (h) => (maestria[h.name]?.games ? 0 : 1);
    return relleno(a) - relleno(b) || a.name.localeCompare(b.name);
  }), [pool, maestria]);

  const invalido = (crudo, max) => {
    if (!crudo) return false;
    const n = leerDecimal(crudo);
    return Number.isNaN(n) || n <= 0 || (max && n > max);
  };

  return (
    <Hoja etiqueta={t('app.maestria')} onCerrar={onCerrar}>
      <div className="sheet-head">
        <strong style={{ flex: 1, alignSelf: 'center' }}>{t('app.maestria')}</strong>
        <button className="close" onClick={onCerrar}>{t('app.cancelar')}</button>
        <button className="close" style={{ color: 'var(--gold)' }} onClick={guardar}>{t('app.guardar')}</button>
      </div>
      <p className="empty-state" style={{ padding: '0 0 8px' }}>{t('maestria.explicacion')}</p>
      <div className="mastery-list">
        <div className="mastery-row head">
          <span>{t('maestria.heroe')}</span><span>{t('maestria.partidas')}</span><span>{t('maestria.winrate')}</span>
        </div>
        {ordenados.map((h) => (
          <div className="mastery-row" key={h.name}>
            <span>{h.name}</span>
            <input type="text" inputMode="numeric" placeholder="0" className={invalido(borrador[h.name]?.games) ? 'bad' : ''} value={borrador[h.name]?.games ?? ''} onChange={(e) => poner(h.name, 'games', e.target.value)} />
            <input type="text" inputMode="decimal" placeholder={t('maestria.placeholderWr')} className={invalido(borrador[h.name]?.wr, 100) ? 'bad' : ''} value={borrador[h.name]?.wr ?? ''} onChange={(e) => poner(h.name, 'wr', e.target.value)} />
          </div>
        ))}
      </div>
    </Hoja>
  );
}
