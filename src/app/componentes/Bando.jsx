import { tic } from '../tacto.js';
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
 * @param leidos  nombres que puso el lector de la tablet (3.59.0): su hueco
 *              lleva una marca, para ver de un vistazo qué hay que revisar.
 *
 * Desde 3.59.0 la cara llena el hueco (30 px en vez de 22) y la × va en la
 * esquina, como el aspa de borrar de iOS: con ○, cara y × en fila, a 360 px
 * la cara se quedaba en 22 px y se cortaba. En los enemigos, la cara ES el
 * botón de marcar al rival (todo el hueco menos la ×).
 */
export function Bando({ titulo, tipo, picks, max, onAnadir, onQuitar, marcado, onMarcar, pista, automatico, yo = null, onYo = null, onQuitarYo = null, leidos = null, t = tPorDefecto }) {
  const huecos = [...picks, ...Array(Math.max(0, max - picks.length)).fill(null)];
  return (
    <section className={`side ${tipo}`}>
      <div className="side-label">
        <span>{titulo}</span>
        <span>{onMarcar && picks.length ? pista : `${picks.length + (yo ? 1 : 0)}/${max + (onYo ? 1 : 0)}`}</span>
      </div>
      <div className="slots">
        {onYo && (yo ? (
          <div className={`slot yo ${leidos?.has(yo.name) ? 'leido' : ''}`} title={t('app.tuPickDe', { nombre: yo.name })}>
            <span className="slot-cuerpo">
              <Cara heroe={yo} className="slot-cara" tam={30} />
              <span className="slot-name">{yo.name}</span>
            </span>
            <button className="x" onClick={() => { tic(); onQuitarYo(); }} aria-label={t('app.soltarPick', { nombre: yo.name })}>×</button>
          </div>
        ) : (
          <button className="slot empty yo" onClick={onYo} aria-label={t('app.tuPick')}>{t('app.tuPick')}</button>
        ))}
        {huecos.map((heroe, i) => (heroe ? (
          <div key={heroe.name} className={`slot ${marcado === heroe.name ? 'marked' : ''} ${!marcado && automatico === heroe.name ? 'auto' : ''} ${leidos?.has(heroe.name) ? 'leido' : ''}`} title={leidos?.has(heroe.name) ? t('app.leidoPorElLector', { nombre: heroe.name }) : undefined}>
            {onMarcar ? (
              <button
                className="mark slot-cuerpo"
                onClick={() => { tic(); onMarcar(heroe); }}
                aria-pressed={marcado === heroe.name}
                aria-label={t('app.marcarRivalDe', { nombre: heroe.name })}
              >
                <Cara heroe={heroe} className="slot-cara" tam={30} />
                <span className="slot-name">{heroe.name}</span>
              </button>
            ) : (
              <span className="slot-cuerpo">
                <Cara heroe={heroe} className="slot-cara" tam={30} />
                <span className="slot-name">{heroe.name}</span>
              </span>
            )}
            <button className="x" onClick={() => { tic(); onQuitar(heroe); }} aria-label={t('app.quitar', { nombre: heroe.name })}>×</button>
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
