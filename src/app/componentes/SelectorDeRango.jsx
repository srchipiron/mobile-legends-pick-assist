import { tPorDefecto } from './tPorDefecto.js';

export const ETIQUETAS_RANGO = { epic: 'Epic', legend: 'Legend', mythic: 'Mythic', honor: 'Honor', glory: 'Glory' };

/**
 * Selector del rango del que salen los winrates. Los cruces, las parejas y
 * las builds son siempre del rango de la ingesta: con otro rango elegido se
 * mezclan dos poblaciones, y hay que decirlo donde se elige.
 */
export function SelectorDeRango({ rangos, valor, onCambiar, rangoDeCruces = null, t = tPorDefecto }) {
  if (!rangos?.length) return null;
  return (
    <>
      <div className="rank-picker">
        {rangos.map((r) => (
          <button key={r} aria-pressed={r === valor} onClick={() => onCambiar(r)}>
            {r === 'all' ? t('rango.todos') : (ETIQUETAS_RANGO[r] ?? r)}
          </button>
        ))}
      </div>
      {rangoDeCruces && valor && valor !== rangoDeCruces && (
        <p className="build-nota">{t('rango.crucesDe', { rango: ETIQUETAS_RANGO[rangoDeCruces] ?? rangoDeCruces })}</p>
      )}
    </>
  );
}
