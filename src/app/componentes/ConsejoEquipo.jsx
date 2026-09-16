import { Cara } from './Imagen.jsx';
import { idMotivo } from '../../motor/nombres.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Qué pueden coger tus compañeros en las líneas abiertas (motor/equipo.js).
 * Plegado por defecto y DESPUÉS de tu nº1: no puede empujarlo fuera de la
 * primera pantalla. Cada opción se toca para meterla en tu equipo.
 */
export function ConsejoEquipo({ consejos, yo, onElegir, t = tPorDefecto }) {
  if (!consejos?.length || !yo) return null;
  return (
    <details className="equipo">
      <summary>
        <span>{t('equipo.titulo')}</span>
        <span className="equipo-vistos">{t('equipo.lineas', { n: consejos.length })}</span>
      </summary>
      <p className="equipo-pista">{t('equipo.con', { yo: yo.name })}</p>
      {consejos.map((c) => {
        const mejor = c.sugerencias[0];
        // Lo bueno delante: coger «el primero» sin mirar el signo enseñaba
        // «pierde contra Selena» como si ESA fuera la razón para cogerlo.
        const motivos = [...(mejor?.motivos ?? [])].sort((a, b) => (b.bueno ? 1 : 0) - (a.bueno ? 1 : 0)).slice(0, 3);
        return (
          <div className="equipo-linea" key={c.linea}>
            <span className="equipo-nombre">
              {t(`linea.${c.linea}`)}
              {c.rival ? <span className="inferred">{t('equipo.contra', { rival: c.rival })}</span> : null}
            </span>
            <div className="equipo-chips">
              {c.sugerencias.map((s, i) => (
                <button
                  key={s.heroe.name}
                  className={`chip ${i === 0 ? 'mejor' : ''}`}
                  onClick={() => onElegir?.(s.heroe)}
                  aria-label={t('equipo.anadir', { nombre: s.heroe.name })}
                  title={t('equipo.anadir', { nombre: s.heroe.name })}
                >
                  <Cara heroe={s.heroe} className="grid-cara" tam={22} />
                  {s.heroe.name}
                  {s.p != null && <span className="chip-pct">{Math.round(s.p * 100)}%</span>}
                </button>
              ))}
            </div>
            {motivos.length > 0 && (
              <div className="equipo-motivo">
                <span>{mejor.heroe.name}</span>
                <ul className="reasons">
                  {motivos.map((m) => <li key={idMotivo(m)} className={m.bueno ? '' : 'bad'}>{t(m.clave, m.params)}</li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })}
      <p className="build-nota">{t('equipo.nota')}</p>
    </details>
  );
}
