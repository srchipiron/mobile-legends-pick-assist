import { Cara } from './Imagen.jsx';

/**
 * La rejilla de héroes de toda la app (selector, apuntar, partidas,
 * comprobar, capturas): un botón por héroe, `.elegido` el marcado.
 *
 * @param caras       tamaño de la cara (con `.grid-nombre` debajo); sin él, solo el nombre
 * @param elegido     (h) → ¿va marcado?
 * @param pulsado     (h) → aria-pressed (selector multi-toque); sin él no se pone
 * @param bloqueado   (h) → disabled
 * @param extra       (h) → lo que va tras el nombre
 * @param children    lo que va al final de la rejilla (otro héroe, «sin nombre»)
 */
export function RejillaDeHeroes({ heroes, onElegir, elegido = () => false, pulsado = null, bloqueado = null, extra = null, caras = null, className = '', children = null }) {
  return (
    <div className={`hero-grid${className ? ` ${className}` : ''}`}>
      {heroes.map((h) => (
        <button
          key={h.name} type="button" className={elegido(h) ? 'elegido' : ''}
          disabled={bloqueado ? bloqueado(h) : undefined} aria-pressed={pulsado ? pulsado(h) : undefined} onClick={() => onElegir(h)}
        >
          {caras ? <><Cara heroe={h} className="grid-cara" tam={caras} /><span className="grid-nombre">{h.name}</span></> : h.name}
          {extra?.(h)}
        </button>
      ))}
      {children}
    </div>
  );
}
