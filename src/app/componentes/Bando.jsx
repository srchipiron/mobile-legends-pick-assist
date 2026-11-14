import { tic } from '../tacto.js';
import { Cara } from './Imagen.jsx';
import { useT } from '../i18n/contexto.js';

/**
 * Los huecos de un bando (enemigos, tu equipo o baneos). Un hueco vacío abre
 * el selector; la × quita. La cara (30 px) llena el hueco de 38 y, en los
 * enemigos, ES el botón de marcar al rival (todo el hueco menos la ×).
 *
 * @param tipo    'enemy' | 'ally' | 'bans' (la clase CSS)
 * @param yo      tu pick (héroe) o null; con `onYo`, tu equipo lleva el hueco «Tú» delante, como en el juego
 * @param leidos  los nombres que puso la tablet: su hueco lleva un punto verde, para revisarlos de un vistazo
 */
export function Bando({ titulo, tipo, picks, max, onAnadir, onQuitar, marcado, onMarcar, pista, automatico, yo = null, onYo = null, onQuitarYo = null, leidos = null }) {
  const t = useT();
  const huecos = [...picks, ...Array(Math.max(0, max - picks.length)).fill(null)];
  const cuerpo = (heroe) => (
    <>
      <Cara heroe={heroe} className="slot-cara" tam={30} />
      <span className="slot-name">{heroe.name}</span>
    </>
  );
  return (
    <section className={`side ${tipo}`}>
      <div className="side-label">
        <span>{titulo}</span>
        <span>{onMarcar && picks.length ? pista : `${picks.length + (yo ? 1 : 0)}/${max + (onYo ? 1 : 0)}`}</span>
      </div>
      <div className="slots">
        {onYo && (yo ? (
          <div className={`slot yo ${leidos?.has(yo.name) ? 'leido' : ''}`} title={t('app.tuPickDe', { nombre: yo.name })}>
            <span className="slot-cuerpo">{cuerpo(yo)}</span>
            <button className="x" onClick={() => { tic(); onQuitarYo(); }} aria-label={t('app.soltarPick', { nombre: yo.name })}>×</button>
          </div>
        ) : (
          <button className="slot empty yo" onClick={onYo} aria-label={t('app.tuPick')}>{t('app.tuPick')}</button>
        ))}
        {huecos.map((heroe, i) => (heroe ? (
          <div key={heroe.name} className={`slot ${marcado === heroe.name ? 'marked' : ''} ${!marcado && automatico === heroe.name ? 'auto' : ''} ${leidos?.has(heroe.name) ? 'leido' : ''}`} title={leidos?.has(heroe.name) ? t('app.leidoPorElLector', { nombre: heroe.name }) : undefined}>
            {onMarcar ? (
              <button className="mark slot-cuerpo" onClick={() => { tic(); onMarcar(heroe); }} aria-pressed={marcado === heroe.name} aria-label={t('app.marcarRivalDe', { nombre: heroe.name })}>
                {cuerpo(heroe)}
              </button>
            ) : (
              <span className="slot-cuerpo">{cuerpo(heroe)}</span>
            )}
            <button className="x" onClick={() => { tic(); onQuitar(heroe); }} aria-label={t('app.quitar', { nombre: heroe.name })}>×</button>
          </div>
        ) : (
          // [D] Diez huecos de baneo a 360 px no caben con la palabra: «+».
          <button key={`empty-${i}`} className="slot empty" onClick={onAnadir} aria-label={t('app.anadir')}>{tipo === 'bans' ? '+' : t('app.anadir')}</button>
        )))}
      </div>
    </section>
  );
}
