/**
 * Pruebas de src/motor/catalogo.js y del catálogo escrito a mano con el que
 * trabaja (public/data/heroes.json): sin nombres repetidos y con toda
 * etiqueta documentada en su leyenda. Una etiqueta sin definir no dispara
 * ninguna regla y nadie se entera.
 */
import { test, ok, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { poolDeLinea, LINEAS, tagsDeducidos, fundirCatalogo } from '../../src/motor/catalogo.js';
import { SPECIALITY_TAGS, ROLE_VETO, ROLE_DEFAULTS } from '../../src/motor/reglas.js';
import { indiceDeLineas } from '../../src/motor/lineas.js';

test('el catálogo no tiene nombres repetidos', () => {
  const n = catalogo.heroes.map((x) => x.name);
  ok(new Set(n).size === n.length, 'hay nombres duplicados');
});

test('todos los tags del catálogo están documentados', () => {
  const conocidos = new Set(Object.keys(catalogo.tagLegend));
  const malos = catalogo.heroes.flatMap((x) => x.tags).filter((t) => !conocidos.has(t));
  ok(!malos.length, `tags sin definir: ${[...new Set(malos)].join(', ')}`);
});

test('el pool sale de la línea que juegas, no de una lista escrita a mano', () => {
  const idx = indiceDeLineas([
    { name: 'Akai', role: 'tank', lanes: ['roam', 'jungle'] },
    { name: 'Layla', role: 'marksman', lanes: ['gold'] },
    { name: 'Kagura', role: 'mage', lanes: ['mid'] },
  ]);
  const heroes = [
    { name: 'Akai', tags: [], roam: true },
    { name: 'Layla', tags: [], roam: false },
    { name: 'Kagura', tags: [], roam: false },
  ];

  ok(poolDeLinea(heroes, idx, 'gold').map((x) => x.name).join() === 'Layla', 'gold mal');
  ok(poolDeLinea(heroes, idx, 'mid').map((x) => x.name).join() === 'Kagura', 'mid mal');
  // Un héroe que juega dos líneas sale en las dos. Es correcto: Akai hace roam
  // y jungla de verdad.
  ok(poolDeLinea(heroes, idx, 'roam').map((x) => x.name).join() === 'Akai', 'roam mal');
  ok(poolDeLinea(heroes, idx, 'jungle').map((x) => x.name).join() === 'Akai', 'jungle mal');

  ok(LINEAS.length === 5, 'deberían ser cinco líneas');

  // Sin datos de líneas: roam se cae al catálogo, las demás se quedan vacías
  // y la app lo dice en vez de inventarse un pool.
  ok(poolDeLinea(heroes, new Map(), 'roam').map((x) => x.name).join() === 'Akai',
    'sin datos, roam debería caer al catálogo');
  ok(!poolDeLinea(heroes, new Map(), 'gold').length,
    'sin datos, gold debería quedarse vacía en vez de inventarse un pool');
});

test('la speciality de Moonton suma tags al rol, sin contradecirlo', () => {
  // Suma: un support con "Crowd Control" gana control duro sobre sus tags base.
  const marcel = tagsDeducidos('support', ['Crowd Control']);
  for (const t of ROLE_DEFAULTS.support) ok(marcel.includes(t), `pierde el tag de rol ${t}`);
  ok(marcel.includes('cc_hard'), 'no recoge el control duro de "Crowd Control"');

  // Veto: la MISMA speciality no puede hacer tanque a una maga. Es correlacion
  // del catalogo (casi todo "Crowd Control" es tanque), no una propiedad suya,
  // y una maga marcada de primera linea enganaria a la composicion.
  const zetian = tagsDeducidos('mage', ['Crowd Control']);
  ok(!zetian.includes('tanky'), `una maga no puede salir tanky: ${zetian.join(', ')}`);

  // Sin speciality se comporta como siempre.
  const a = tagsDeducidos('marksman', []);
  ok(a.join() === (ROLE_DEFAULTS.marksman ?? []).join(), 'sin speciality debe dar los tags del rol');

  // Las tablas solo hablan de tags que el motor conoce.
  const conocidos = new Set(Object.values(ROLE_DEFAULTS).flat()
    .concat(catalogo.heroes.flatMap((x) => x.tags)));
  const inventados = [...new Set(Object.values(SPECIALITY_TAGS).flat())]
    .filter((x) => !conocidos.has(x));
  ok(!inventados.length, `SPECIALITY_TAGS usa tags que no existen: ${inventados.join(', ')}`);
  const vetoRaro = [...new Set(Object.values(ROLE_VETO).flat())].filter((x) => !conocidos.has(x));
  ok(!vetoRaro.length, `ROLE_VETO usa tags que no existen: ${vetoRaro.join(', ')}`);
});

test('un héroe con speciality entra al catálogo con ella aplicada', () => {
  const fundido = fundirCatalogo(catalogo.heroes, [
    { name: 'RoamerNuevo', role: 'support', speciality: ['Crowd Control', 'Regen'] },
  ]);
  const roamer = fundido.find((x) => x.name === 'RoamerNuevo');
  ok(roamer?.roam, 'un support debe entrar al pool de roam');
  ok(roamer.tags.includes('cc_hard') && roamer.tags.includes('heal'),
    `no aplica la speciality: ${roamer.tags.join(', ')}`);
  ok(roamer.inferred, 'debe quedar marcado como deducido');
});

test('un héroe nuevo de la API entra con los tags de su rol', () => {
  const fundido = fundirCatalogo(catalogo.heroes, [{ name: 'HeroeNuevo', role: 'tank' }]);
  const nuevo = fundido.find((x) => x.name === 'HeroeNuevo');
  ok(nuevo?.roam && nuevo.tags.length, 'no hereda tags de tanque ni entra al pool de roam');
});

await terminar('motor/catalogo');
