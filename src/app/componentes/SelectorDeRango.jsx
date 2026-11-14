
import { useT } from '../i18n/contexto.js';
export const ETIQUETAS_RANGO = { epic: 'Epic', legend: 'Legend', mythic: 'Mythic', honor: 'Honor', glory: 'Glory' };

/**
 * El rango del que salen los winrates. Los cruces, las parejas y las builds
 * no cambian con él (se mezclan dos poblaciones, y se dice aquí), y los
 * cruces pueden ser de OTRO rango que las builds (Mítico mientras Gloria se
 * rellena): cada uno con el suyo.
 */
export function SelectorDeRango({ rangos, valor, onCambiar, rangoDeCruces = null, rangoDeBuilds = null }) {
  const t = useT();
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
