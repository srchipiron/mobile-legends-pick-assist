/**
 * Pruebas de src/motor/catalogo.js y del catálogo escrito a mano con el que
 * trabaja (public/data/heroes.json): sin nombres repetidos y con toda
 * etiqueta documentada en su leyenda. Una etiqueta sin definir no dispara
 * ninguna regla y nadie se entera.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { poolDeLinea, LINEAS, tagsDeducidos, fundirCatalogo, tipoDeDano, perfilDeDano, tapaElHueco, huellaDeKit, equilibrioEsperado } from '../../src/motor/catalogo.js';
import { analizarDraft } from '../../src/motor/analisis.js';
import { evaluarDraft, ESCALA, PESO_EQUILIBRIO_DANO } from '../../src/motor/modelo.js';
import { indexarPorNombre } from '../../src/motor/nombres.js';
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

test('revision linea a linea del motor: fundirCatalogo decide por nombre normalizado', () => {
  // 4. «Ya está en el catálogo» se decide por clave normalizada: con la
  //    cruda, «X.Borg» y «X Borg» serían dos héroes y el id de la API no
  //    llegaría al del catálogo (los retratos van por id).
  const fundido = fundirCatalogo([{ name: 'X Borg', role: 'fighter', tags: ['sustain'] }], [{ name: 'X.Borg', id: 1, role: 'fighter' }]);
  eq(fundido.length, 1, `X Borg / X.Borg son dos héroes: ${fundido.map((x) => x.name)}`);
  eq(fundido[0].id, 1, 'el id de la API no llega al héroe del catálogo con otra grafía');
});

test('el tipo de dano sale del texto de Moonton, no del rol', () => {
  // Los dos casos que el rol se comeria, comprobados contra la API real:
  // Gusion es asesino y pega magico; Hylos es tanque y pega magico.
  eq(tipoDeDano({ name: 'Gusion', role: 'assassin', damage: { fisico: 0, magico: 5 } }), 'magico');
  eq(tipoDeDano({ name: 'Hylos', role: 'tank', damage: { fisico: 0, magico: 2 } }), 'magico');
  eq(tipoDeDano({ name: 'Miya', role: 'marksman', damage: { fisico: 4, magico: 0 } }), 'fisico');
  // Esmeralda pega las dos cosas de verdad: 4 y 4 en sus habilidades.
  eq(tipoDeDano({ name: 'Esmeralda', damage: { fisico: 4, magico: 4 } }), 'mixto');
  // El dano verdadero no decide el lado: atraviesa las dos defensas.
  eq(tipoDeDano({ name: 'Karrie', damage: { fisico: 4, magico: 0, verdadero: 1 } }), 'fisico');
  eq(tipoDeDano({ name: 'Nuevo' }), null, 'se inventa un tipo para un heroe sin dato');

  const fis = (n) => ({ name: n, tags: [], damage: { fisico: 3, magico: 0 } });
  const mag = (n) => ({ name: n, tags: [], damage: { fisico: 0, magico: 3 } });
  const mix = (n) => ({ name: n, tags: [], damage: { fisico: 3, magico: 3 } });

  eq(perfilDeDano([fis('a'), fis('b'), fis('c')]).falta, 'magico');
  eq(perfilDeDano([mag('a'), mag('b')]).falta, 'fisico');
  eq(perfilDeDano([fis('a'), mag('b')]).falta, null, 've un hueco donde hay de las dos');
  eq(perfilDeDano([fis('a'), mix('b')]).falta, null, 'un mixto no cuenta como que tapa el hueco');

  // Con un solo aliado no se puede decir que al equipo le falte nada, y sin
  // dato tampoco: inventar un aviso es peor que callarse.
  eq(perfilDeDano([fis('a')]).falta, null, 'avisa con un solo aliado elegido');
  eq(perfilDeDano([{ name: 'x', tags: [] }, { name: 'y', tags: [] }]).falta, null,
    'avisa sin tener el dato de ninguno');

  ok(tapaElHueco(mag('m'), 'magico'), 'no ve que un magico tapa el hueco magico');
  ok(tapaElHueco(mix('m'), 'magico'), 'no ve que un mixto tapa cualquier hueco');
  ok(!tapaElHueco(fis('f'), 'magico'), 'cree que un fisico tapa el hueco magico');
  ok(!tapaElHueco(mag('m'), null), 'tapa un hueco que no existe');
});

test('el hueco de dano se dice, y no lo encoge la deduccion; pero no puntua', () => {
  const fis = (n) => ({ name: n, tags: ['tanky'], damage: { fisico: 3, magico: 0 } });
  const aliados = [fis('a1'), fis('a2'), fis('a3')];
  const base = { name: 'Yo', tags: ['engage'], damage: { fisico: 3, magico: 0 } };
  const tapa = { ...base, damage: { fisico: 0, magico: 3 } };

  // El hueco sale del texto del juego (perfilDeDano) y el heroe deducido lo
  // tapa igual: el tipo de dano es un dato, no una etiqueta adivinada.
  eq(perfilDeDano(aliados).falta, 'magico', 'no ve que al equipo le falta magia');
  ok(tapaElHueco(tapa, 'magico') && tapaElHueco({ ...tapa, inferred: true }, 'magico') && !tapaElHueco(base, 'magico'), 'tapaElHueco se equivoca');
  const mixtos = [fis('a1'), { name: 'a2', tags: ['tanky'], damage: { fisico: 0, magico: 3 } }];
  eq(perfilDeDano(mixtos).falta, null, 've un hueco donde el equipo esta equilibrado');

  // Se dice en el analisis: tapa -> razon; no tapa -> aviso.
  const frases = (yo) => analizarDraft({ ranking: [{ heroe: yo, p: 0.6 }], enemigos: [{ name: 'E', tags: [] }], aliados, meta: { counters: {} } }).map((f) => f.clave);
  ok(frases(tapa).includes('analisis.todoFisico'), `no dice que el pick tapa el hueco: ${frases(tapa)}`);
  ok(frases(base).includes('analisis.faltaMagico'), `no avisa del hueco sin tapar: ${frases(base)}`);

  // Pero el HUECO como regla NO puntua: 0 de 902 equipos pro lo tienen (un
  // mixto lo tapa), asi que no se puede medir. Lo que si puntua desde 3.4.0
  // es el equilibrio medido, min(fisicos, magicos), y SOLO eso: la diferencia
  // entre tapar y no tapar es exactamente ese termino, sin nada encima.
  const dif = evaluarDraft({ yo: tapa, aliados, meta: {} }).logOdds - evaluarDraft({ yo: base, aliados, meta: {} }).logOdds;
  ok(Math.abs(dif - ESCALA * PESO_EQUILIBRIO_DANO) < 1e-12, `el hueco de dano cambia la nota mas alla del equilibrio medido: ${dif}`);
});

test('el equilibrio esperado de un equipo al azar: por pickrate, creciente y acotado', () => {
  const F = (n) => ({ name: n, damage: { fisico: 3, magico: 0 } });
  const M = (n) => ({ name: n, damage: { fisico: 0, magico: 3 } });
  // Mitad y mitad sin estadisticas (todos pesan igual): con dos heroes,
  // P(uno de cada) = 1/2, asi que E[min] = 0,5; con uno, 0; con nadie, 0.
  const e = equilibrioEsperado([F('a'), M('b')]);
  eq(e.length, 6); eq(e[0], 0); eq(e[1], 0);
  ok(Math.abs(e[2] - 0.5) < 1e-12, `E[2] ${e[2]}`);
  for (let n = 2; n <= 5; n++) ok(e[n] > e[n - 1] && e[n] <= n / 2, `E[${n}] = ${e[n]} no crece o pasa de n/2`);
  // Ponderado por pickrate: si casi nadie juega magos, casi nunca hay mezcla.
  const stats = indexarPorNombre({ a: { pickRate: 0.99 }, b: { pickRate: 0.01 } });
  ok(equilibrioEsperado([F('a'), M('b')], stats)[2] < 0.03, 'no pondera por pickrate');
  // Un heroe SIN estadisticas no pesa nada habiendolas: con `?? 1` un heroe
  // recien salido pesaba tanto como los 133 juntos (las cuotas suman 1).
  const conNuevo = equilibrioEsperado([F('a'), M('b'), M('nuevo')], stats);
  ok(Math.abs(conNuevo[2] - equilibrioEsperado([F('a'), M('b')], stats)[2]) < 1e-12, 'un heroe sin estadisticas pesa en el esperado');
  // Los mixtos no cuentan para ninguno.
  eq(equilibrioEsperado([{ name: 'x', damage: { fisico: 3, magico: 3 } }, F('a')])[2], 0);
  // Con LÍNEAS: un equipo real lleva uno por línea, y si una línea es toda
  // física y otra toda mágica, dos héroes (uno de cada) mezclan SIEMPRE:
  // E[2] = 1, no el 0,5 de sacar dos al azar del conjunto. Medido en los
  // datos reales del 25 de septiembre de 2026: con el centro de «cinco al
  // azar de los 133», 1 contra 5 daba el 48,8% y 5 contra 1 el 51,3% solo
  // por este término; con el de líneas, 50,1 y 50,0.
  const pools = { oro: [F('a'), F('c')], medio: [M('b'), M('d')] };
  const conLineas = equilibrioEsperado([F('a'), M('b'), F('c'), M('d')], null, pools);
  ok(Math.abs(conLineas[2] - 1) < 1e-12, `con una línea física y otra mágica, E[2] debería ser 1 y es ${conLineas[2]}`);
  eq(conLineas[1], 0);
  // Tres líneas, la tercera mixta: con dos héroes, la media de los tres
  // pares de líneas: (1 + 0 + 0) / 3.
  const tres = equilibrioEsperado([], null, { ...pools, mix: [{ name: 'z', damage: { fisico: 3, magico: 3 } }] });
  ok(Math.abs(tres[2] - 1 / 3) < 1e-12, `E[2] con tres líneas ${tres[2]}`);
  // Sin líneas (o vacías) vuelve al multinomial de siempre.
  ok(Math.abs(equilibrioEsperado([F('a'), M('b')], null, {})[2] - 0.5) < 1e-12, 'con pools vacíos no cae al multinomial');
});

test('cada heroe lleva su id, tambien los de nombre raro', () => {
  const meta = leerJson('public/data/roam-meta.json');
  if (!(meta.heroes ?? []).length) return;
  const todos = fundirCatalogo(catalogo.heroes, meta.heroes);

  // El retrato se pide por id (./heroes/{id}.jpg). Sin id no hay cara, y como
  // la imagen que falta se quita sola, no fallaria nada: solo desaparecerian
  // las caras de unos cuantos heroes y nadie se enteraria. Justo el fallo que
  // ya costo una version con los counters de X.Borg.
  const sinId = todos.filter((x) => x.id == null).map((x) => x.name);
  ok(!sinId.length, `heroes sin id: ${sinId.slice(0, 8).join(', ')}`);

  // Y los que escriben distinto la API y el catalogo tienen que cuadrar.
  for (const nombre of ['X.Borg', 'Yi Sun-shin', "Chang'e", 'Popol and Kupa']) {
    const heroe = todos.find((x) => x.name === nombre);
    if (heroe) ok(heroe.id != null, `${nombre} se ha quedado sin id: el nombre no cuadra entre API y catalogo`);
  }
});

test('la huella del kit calla con un reequilibrio y habla con un rework', () => {
  // Para que el aviso sirva tiene que cumplir DOS cosas, y las dos se rompen
  // por los lados contrarios: si salta con cada retoque de numeros, se deja
  // de leer; si no salta nunca, no vigila nada.
  const base = { name: 'X', damage: { fisico: 4, magico: 0, verdadero: 0 }, speciality: ['Burst', 'Chase'] };

  // 1. CALLA con lo que de verdad paso entre el 7 y el 16 de septiembre de
  //    2026: cuatro heroes cambiaron su recuento de habilidades por tipo y
  //    ninguno cambio de kit.
  eq(huellaDeKit({ ...base, damage: { fisico: 5, magico: 0, verdadero: 0 } }), huellaDeKit(base),
    'la huella cambia al sumar una habilidad fisica: avisaria con cada reequilibrio');
  eq(huellaDeKit({ ...base, damage: { fisico: 4, magico: 0, verdadero: 2 } }), huellaDeKit(base),
    'el dano verdadero mueve la huella, y tipoDeDano ni lo mira');
  // Y el orden en que la API devuelva la speciality no es informacion.
  eq(huellaDeKit({ ...base, speciality: ['Chase', 'Burst'] }), huellaDeKit(base),
    'la huella depende del ORDEN de la speciality: avisaria sin que cambie nada');

  // 2. HABLA cuando a Moonton le cambia de qué pega el heroe o como lo
  //    etiqueta, que es lo que deja los tags escritos a mano hablando de otro.
  ok(huellaDeKit({ ...base, speciality: ['Burst', 'Guard'] }) !== huellaDeKit(base),
    'cambiar una speciality no mueve la huella');
  ok(huellaDeKit({ ...base, damage: { fisico: 0, magico: 4, verdadero: 0 } }) !== huellaDeKit(base),
    'pasar de fisico a magico no mueve la huella');
  ok(huellaDeKit({ ...base, damage: { fisico: 4, magico: 4, verdadero: 0 } }) !== huellaDeKit(base),
    'volverse mixto no mueve la huella');

  // Sin ficha no hay huella que comparar, y eso NO puede parecerse a un kit
  // valido: una peticion caida no es un rework.
  eq(huellaDeKit({ name: 'X' }), '?|', 'un heroe sin ficha deberia dar una huella reconocible como vacia');

  // Y el texto de las habilidades: un rework que deja la misma speciality y
  // el mismo tipo de dano (Masha y Bruno, 2.2.16) solo se ve por ahi.
  ok(huellaDeKit({ ...base, kitTexto: 'aaaaaaaa' }) !== huellaDeKit({ ...base, kitTexto: 'bbbbbbbb' }),
    'reescribir las habilidades no mueve la huella');
  eq(huellaDeKit({ ...base, kitTexto: 'aaaaaaaa' }), huellaDeKit(base) + '|aaaaaaaa', 'la huella con texto no extiende a la de dos trozos');
});

test('todos los heroes del catalogo llevan su huella de kit', () => {
  // Sin `kit`, `kitsRehechos` no mira a ese heroe: se quedaria con los tags
  // de otro heroe para siempre y en silencio, que es justo lo que el aviso
  // viene a evitar. Un heroe anadido a mano sin huella es un agujero mudo.
  const sin = catalogo.heroes.filter((h) => !h.kit).map((h) => h.name);
  ok(!sin.length, `heroes del catalogo sin \`kit\`: ${sin.slice(0, 8).join(', ')}`);

  // Y la huella tiene la forma que produce huellaDeKit, no cualquier texto:
  // "tipo|speciality ordenada". Con otra forma no casaria nunca y el aviso
  // saltaria con los 133 a la vez.
  const raras = catalogo.heroes.filter((h) => !/^(fisico|magico|mixto)\|[^|]*(\|[0-9a-f]{8})?$/.test(h.kit)).map((h) => h.name);
  ok(!raras.length, `huellas con forma rara: ${raras.slice(0, 8).join(', ')}`);

  // La huella de hoy tiene que coincidir con la del catalogo, o el aviso
  // estaria encendido de fabrica. Se comprueba contra los datos reales.
  const meta = leerJson('public/data/roam-meta.json');
  const api = Object.fromEntries((meta.heroes ?? []).map((h) => [h.name, h]));
  const descuadran = catalogo.heroes
    .filter((h) => api[h.name] && (api[h.name].speciality ?? []).length && huellaDeKit(api[h.name]) !== h.kit)
    .map((h) => `${h.name}: ${h.kit} vs ${huellaDeKit(api[h.name])}`);
  ok(!descuadran.length,
    `el catalogo dice una huella y la API otra (revisa los tags y actualiza \`kit\`): ${descuadran.slice(0, 6).join(' · ')}`);
});

await terminar('motor/catalogo');
