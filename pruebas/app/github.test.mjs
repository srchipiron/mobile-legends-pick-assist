/**
 * El enlace a una incidencia de GitHub ya rellena (src/app/github.js): el
 * repositorio sale de la dirección de Pages y el cuerpo va codificado.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { repositorioDe, urlDeIncidencia, TOPE_URL } from '../../src/app/github.js';

test('el repositorio se deduce de la dirección de Pages', () => {
  const pages = repositorioDe({ hostname: 'srchipiron.github.io', pathname: '/mobile-legends-pick-assist/' });
  eq(pages.duenno, 'srchipiron'); eq(pages.repo, 'mobile-legends-pick-assist');
  const local = repositorioDe({ hostname: 'localhost', pathname: '/' });
  eq(local.duenno, 'localhost'); eq(local.repo, 'mlbb-roam-picker');
});

test('la dirección lleva título, etiquetas y cuerpo codificados', () => {
  const url = new URL(urlDeIncidencia({ titulo: 'Partidas: 3 · hoy', etiquetas: ['partidas'], cuerpo: 'a\n```\nMLPA1.x.y\n```' }, { hostname: 'srchipiron.github.io', pathname: '/mobile-legends-pick-assist/' }));
  eq(url.origin + url.pathname, 'https://github.com/srchipiron/mobile-legends-pick-assist/issues/new');
  eq(url.searchParams.get('title'), 'Partidas: 3 · hoy');
  eq(url.searchParams.get('labels'), 'partidas');
  ok(url.searchParams.get('body').includes('MLPA1.x.y'), 'el cuerpo no lleva el código');
  ok(TOPE_URL > 2000 && TOPE_URL < 8200, `un tope de ${TOPE_URL} no es el de los navegadores`);
});

await terminar('app/github');
