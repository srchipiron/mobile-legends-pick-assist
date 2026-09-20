import { Cara } from './Imagen.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Fila de huecos de un bando (enemigos, tu equipo o baneos). Tocar un hueco
 * abre el selector. Manda la cara y el nombre se retira (`:has(.slot-cara)`)
 * porque a 390px no caben los dos; sin cara, el nombre recupera su sitio.
 *
 * @param tipo  'enemy' | 'ally' | 'bans' (la clase CSS)
 * @param yo    tu pick fijado (héroe) o null; con `onYo`, tu equipo lleva un
 *              hueco «Tú» delante de los cuatro compañeros, como en el draft
 *              del juego. Tocarlo abre tu pool en el orden del ranking.
 */
export function Bando({ titulo, tipo, picks, max, onAnadir, onQuitar, marcado, onMarcar, pista, automatico, yo = null, onYo = null, onQuitarYo = null, t = tPorDefecto }) {
  const huecos = [...picks, ...Array(Math.max(0, max - picks.length)).fill(null)];
  return (
    <section className={`side ${tipo}`}>
      <div className="side-label">
        <span>{titulo}</span>
        <span>{onMarcar && picks.length ? pista : `${picks.length + (yo ? 1 : 0)}/${max + (onYo ? 1 : 0)}`}</span>
      </div>
      <div className="slots">
        {onYo && (yo ? (
          <div className="slot yo" title={t('app.tuPickDe', { nombre: yo.name })}>
            <Cara heroe={yo} className="slot-cara" tam={22} />
            <span className="slot-name">{yo.name}</span>
            <button className="x" onClick={onQuitarYo} aria-label={t('app.soltarPick', { nombre: yo.name })}>×</button>
          </div>
        ) : (
          <button className="slot empty yo" onClick={onYo} aria-label={t('app.tuPick')}>{t('app.tuPick')}</button>
        ))}
        {huecos.map((heroe, i) => (heroe ? (
          <div key={heroe.name} className={`slot ${marcado === heroe.name ? 'marked' : ''} ${!marcado && automatico === heroe.name ? 'auto' : ''}`}>
            {onMarcar ? (
              <button
                className="mark"
                onClick={() => onMarcar(heroe)}
                aria-pressed={marcado === heroe.name}
                aria-label={t('app.marcarRivalDe', { nombre: heroe.name })}
                title={t('app.marcarRivalDe', { nombre: heroe.name })}
              >
                {marcado === heroe.name ? '◉' : (!marcado && automatico === heroe.name ? '◎' : '○')}
              </button>
            ) : null}
            <Cara heroe={heroe} className="slot-cara" tam={22} />
            <span className="slot-name">{heroe.name}</span>
            <button className="x" onClick={() => onQuitar(heroe)} aria-label={t('app.quitar', { nombre: heroe.name })}>×</button>
          </div>
        ) : (
          <button key={`empty-${i}`} className="slot empty" onClick={onAnadir} aria-label={t('app.anadir')}>
            {/* Diez huecos de baneo en 360px no caben con la palabra: «+». */}
            {tipo === 'bans' ? '+' : t('app.anadir')}
          </button>
        )))}
      </div>
    </section>
  );
}
