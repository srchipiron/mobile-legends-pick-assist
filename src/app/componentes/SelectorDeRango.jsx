import { tPorDefecto } from './tPorDefecto.js';

export const ETIQUETAS_RANGO = { epic: 'Epic', legend: 'Legend', mythic: 'Mythic', honor: 'Honor', glory: 'Glory' };

/**
 * Selector del rango del que salen los winrates. Los cruces, las parejas y
 * las builds no cambian con él: con otro rango elegido se mezclan dos
 * poblaciones, y hay que decirlo donde se elige. Desde 3.35.0 los cruces y
 * las parejas pueden ser de OTRO rango que las builds (Mítico mientras
 * Gloria se rellena; las builds siguen en el de la ingesta), y se dice cada
 * uno con el suyo (3.37.0: decía «las builds son de Mythic»).
 */
export function SelectorDeRango({ rangos, valor, onCambiar, rangoDeCruces = null, rangoDeBuilds = null, t = tPorDefecto }) {
  const etiqueta = (r) => ETIQUETAS_RANGO[r] ?? r;
  const builds = rangoDeBuilds ?? rangoDeCruces;
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
      {rangoDeCruces && valor && (valor !== rangoDeCruces || valor !== builds) && (
        <p className="build-nota">{builds === rangoDeCruces
          ? t('rango.crucesDe', { rango: etiqueta(rangoDeCruces) })
          : t('rango.crucesYBuildsDe', { rango: etiqueta(rangoDeCruces), builds: etiqueta(builds) })}</p>
      )}
    </>
  );
}
