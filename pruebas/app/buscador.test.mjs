/**
 * Que la BÚSQUEDA de la app use de verdad los alias del motor.
 *
 * Sin esto se podía quitar `filtrarPorNombre` del selector y las pruebas
 * seguían en verde: el módulo funcionaba perfectamente y no lo llamaba
 * nadie. La comprobación vivía junto a la del motor (que no debe leer la
 * interfaz) y se perdió al partir el proyecto en `src/motor` y `src/app`.
 *
 * Se mira el código SIN comentarios: una guarda por texto que pase porque la
 * palabra aparece en un comentario no vigila nada, y este proyecto ya tuvo
 * tres de esas.
 */
import { test, ok, terminar, leerTexto } from '../arnes.mjs';
import { filtrarPorNombre } from '../../src/motor/alias.js';
import { heroes } from '../fixtures/catalogo.mjs';

/** El código de un fichero sin comentarios de línea ni de bloque. */
const sinComentarios = (ruta) => leerTexto(ruta).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('el selector de héroes busca con los alias del motor', () => {
  const src = sinComentarios('src/app/componentes/SelectorDeHeroe.jsx');
  ok(/import\s*\{[^}]*\bfiltrarPorNombre\b[^}]*\}\s*from\s*'[^']*motor\/alias\.js'/.test(src),
    'el selector ya no importa filtrarPorNombre del motor');
  ok(/filtrarPorNombre\(\s*heroes\s*,\s*q\s*\)/.test(src),
    'el selector importa filtrarPorNombre pero ya no lo llama con lo escrito: los alias no harían nada');
});

test('escribiendo el nombre en español sale el héroe que la app enseña en inglés', () => {
  // El caso que lo motivó: Javi tiene el juego en español, ve «Cíclope» y no
  // encontraba nada. Lo que se ENSEÑA sigue siendo el nombre en inglés, que
  // es la clave de todos los datos; solo se amplía por dónde se busca.
  const nombres = (q) => filtrarPorNombre(heroes, q).map((h) => h.name);
  ok(nombres('Cíclope').includes('Cyclops'), 'no encuentra a Cyclops escribiendo Cíclope');
  ok(nombres('Ciclope').includes('Cyclops'), 'no encuentra a Cyclops sin tilde');
  ok(nombres('Minotauro').includes('Minotaur'), 'no encuentra a Minotaur escribiendo Minotauro');
  // Y sin sacar de paso a media plantilla: el alias es un atajo, no un comodín.
  ok(nombres('Cíclope').length <= 2, `«Cíclope» saca ${nombres('Cíclope').length} héroes`);
});

await terminar('app/buscador');
