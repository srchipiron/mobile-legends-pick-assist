/**
 * Nombres con los que el juego llama a un héroe en otros idiomas.
 *
 * La app enseña SIEMPRE el nombre en inglés, porque es la clave de todos los
 * datos: si la pantalla dijera «Cíclope» y el motor buscara «Cyclops», un
 * fallo ahí sería invisible. Lo que sí cambia es la BÚSQUEDA: Javi juega con
 * el móvil en español y ve «Cíclope», así que escribe «Cíclope».
 *
 * Se apunta solo lo comprobado. Un alias equivocado es peor que no tenerlo:
 * escribes el nombre bueno y te sale el héroe de al lado. Hay una prueba de
 * que cada alias apunta a un héroe real y de que ninguno pisa a otro.
 */
export const ALIAS = {
  Cyclops: ['Cíclope', 'Ciclope'],
  Minotaur: ['Minotauro'],
  Uranus: ['Urano'],
  Miya: ['Maya'],
  Silvanna: ['Silvana'],
  'Popol and Kupa': ['Popol y Kupa'],
  Angela: ['Ángela'],
  'Yi Sun-shin': ['Yi Sun Shin'],
};

/** Minúsculas y sin tildes, conservando espacios y signos: se busca por trozos de nombre. */
const sinTildes = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Todos los nombres por los que se puede buscar un héroe. El primero es el que la app enseña. */
export function nombresDe(heroe) {
  return [heroe?.name, ...(ALIAS[heroe?.name] ?? [])].filter(Boolean).map(sinTildes);
}

/** ¿Están las letras de `q` dentro de `nombre`, en orden? */
function enOrden(q, nombre) {
  let i = 0;
  for (const ch of nombre) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

/**
 * Los héroes que encajan con lo escrito. Primero, que el nombre CONTENGA lo
 * escrito. Solo si eso no encuentra nada, y con tres letras o más, se prueba
 * con las letras en orden aunque no estén pegadas («Lyla» → Layla): con una o
 * dos letras sueltas encaja media plantilla.
 */
export function filtrarPorNombre(heroes = [], texto = '') {
  const q = sinTildes(texto).trim();
  if (!q) return heroes;
  const contiene = heroes.filter((h) => nombresDe(h).some((n) => n.includes(q)));
  if (contiene.length || q.length < 3) return contiene;
  return heroes.filter((h) => nombresDe(h).some((n) => enOrden(q, n)));
}
