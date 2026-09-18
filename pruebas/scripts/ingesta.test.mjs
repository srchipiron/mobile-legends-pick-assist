/**
 * La ingesta, por partes. Lo que se comprueba aquí es la lectura de las
 * respuestas (ids, counters, rol y línea hondos), el aflojado ante un 422 y el
 * guardado compacto del JSON. La corrida ENTERA contra una API simulada está
 * en `ingesta-simulada.test.mjs`, que levanta un servidor y lanza procesos.
 *
 * Desde 3.0 la ingesta vive en `scripts/ingesta/` y `scripts/ingest.mjs` es
 * una entrada fina de 39 líneas: aquí se importa de donde vive cada cosa, no
 * de la entrada, para que una prueba no acabe mirando un fichero vacío.
 */
import { readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ, leerTexto } from '../arnes.mjs';
import { extraerLineas, extraerRol } from '../../scripts/ingesta/extraccion.mjs';
import { callRoute } from '../../scripts/ingesta/descarga.mjs';
import { idPrincipal, esIdDeHeroe, recogerPares, relationMap, pick } from '../../scripts/ingesta/relaciones.mjs';
import { serializar } from '../../scripts/ingesta/salida.mjs';
import { kitsRehechos } from '../../scripts/ingesta/fusion.mjs';

test('el rol y la línea se leen aunque vengan hondos en la respuesta', () => {
  // Forma REAL de la API: el titulo de la linea vive en el nivel 8. El limite de
  // profundidad estaba en 6, asi que los 133 heroes salian sin rol y sin linea
  // sin que nada fallara: los que no estan en el catalogo se quedaban con CERO
  // tags, y la deteccion del roamer enemigo perdia su senal principal.
  const fila = {
    data: {
      hero: {
        data: {
          name: 'Marcel',
          roadsort: [{ data: { road_sort_title: 'Roam', road_sort_icon: 'https://x/y.svg' } }, ''],
          sortid: [{ data: { sort_title: 'support' } }, ''],
        },
      },
    },
  };
  ok(extraerLineas(fila).includes('roam'), `no encuentra la linea: [${extraerLineas(fila)}]`);
  ok(extraerRol(fila) === 'support', `no encuentra el rol: "${extraerRol(fila)}"`);

  // Y no se inventa nada donde no lo hay.
  ok(extraerRol({ data: { hero: { data: { name: 'Gold Lane Guy' } } } }) === '',
    'saca un rol de donde no hay');
});

test('el diagnóstico de la ingesta no lee campos sin inicializar', () => {
  // Esto estuvo publicado: se leia diagnostics.relations.ejemplos.length sin
  // que 'ejemplos' existiera, y saltaba un TypeError por cada roamer al que SI
  // le llegaban los counters. La prueba de humo no lo veia porque corre contra
  // una base inalcanzable, donde ese camino nunca se ejecuta.
  //
  // Al partir la ingesta en modulos el literal y sus lecturas dejaron de vivir
  // en el mismo fichero (`diagnostics.relations` se inicializa en
  // relaciones.mjs y tambien se lee en cli.mjs), asi que se leen TODOS los
  // ficheros de scripts/ingesta/ juntos y se comprueban TODOS los grupos de
  // `diagnostics`, no solo `relations`. Y se quitan los comentarios antes de
  // mirar: si no, dejar el porque escrito y borrar el campo pasaria la prueba.
  const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const fuente = readdirSync(join(RAIZ, 'scripts/ingesta'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => sinComentarios(leerTexto(`scripts/ingesta/${f}`)))
    .join('\n');

  // El literal que sigue a `diagnostics.X = {`, con las llaves equilibradas.
  const literalDesde = (texto, desde) => {
    let prof = 0;
    for (let i = desde; i < texto.length; i += 1) {
      if (texto[i] === '{') prof += 1;
      else if (texto[i] === '}') { prof -= 1; if (prof === 0) return texto.slice(desde, i + 1); }
    }
    return '';
  };

  const inicializados = new Map();
  for (const m of fuente.matchAll(/diagnostics\.(\w+)\s*=\s*\{/g)) {
    const literal = literalDesde(fuente, m.index + m[0].length - 1);
    const claves = inicializados.get(m[1]) ?? new Set();
    for (const k of literal.matchAll(/[{,]\s*(\w+)\s*:/g)) claves.add(k[1]);
    inicializados.set(m[1], claves);
  }

  const asignados = new Set([...fuente.matchAll(/diagnostics\.(\w+)\.(\w+)\s*=[^=]/g)].map((m) => `${m[1]}.${m[2]}`));
  const leidos = [...new Set([...fuente.matchAll(/diagnostics\.(\w+)\.(\w+)/g)].map((m) => `${m[1]}.${m[2]}`))];

  const sinInicializar = leidos.filter((campo) => {
    const [grupo, k] = campo.split('.');
    // Un grupo que nunca se inicializa con un literal (se crea con ??= y
    // claves dinamicas) no se juzga aqui: no hay lista con la que comparar.
    if (!inicializados.has(grupo)) return false;
    return !inicializados.get(grupo).has(k) && !asignados.has(campo);
  });
  ok(!sinInicializar.length,
    `campos leidos sin inicializar en diagnostics: ${sinInicializar.join(', ')}`);
  // Y que la prueba esté mirando algo: si el escaneo dejara de encontrar el
  // literal, la lista de campos sin inicializar saldría vacía y pasaría.
  // Si el escaneo dejara de casar, `sinInicializar` saldria vacia y la prueba
  // pasaria sin vigilar nada. Se ancla en los grupos que HOY se inicializan
  // con un literal: borrar uno de esos literales tambien tiene que chillar,
  // porque exime de juicio a todos sus campos.
  for (const g of ['relations', 'speciality', 'builds']) {
    ok(inicializados.has(g), `el escaneo no encuentra el literal de diagnostics.${g}`);
  }
  ok(inicializados.get('relations')?.has('ejemplos'), 'el escaneo no encuentra diagnostics.relations.ejemplos, que es el campo que reventaba');
});

test('el id del héroe no se confunde con el id del canal', () => {
  // Caso real: main_hero_channel.id vale 2678829 y aparece ANTES que
  // main_heroid en la respuesta. La API rechazaba con 422 diciendo que el
  // identificador debe ser <= 133, y se perdían los 34 counters.
  const registro = {
    _id: 'x',
    data: {
      main_hero: { data: { name: 'Atlas' } },
      main_hero_channel: { id: 2678829 },
      main_heroid: 93,
      sub_hero: [{ hero_channel: { id: 2678756 }, heroid: 20, increase_win_rate: 0.041 }],
    },
  };

  ok(idPrincipal(registro) === 93, `esperaba 93, salió ${idPrincipal(registro)}`);
  ok(idPrincipal({ name: 'Atlas', hero_id: 93 }) === 93, 'falla con el formato plano');
  ok(idPrincipal({ data: { main_hero_channel: { id: 2678829 } } }) === null,
    'acepta un id de canal como si fuera de héroe');
  ok(!esIdDeHeroe(2678829) && esIdDeHeroe(93), 'el rango válido de ids está mal');
});

test('un 422 se reintenta con menos parámetros en vez de perderlo todo', async () => {
  const peticiones = [];
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    peticiones.push(u.search);
    res.setHeader('content-type', 'application/json');
    // Imita a la API real: rechaza el parámetro days con error de validación.
    if (u.searchParams.has('days')) {
      res.statusCode = 422;
      return res.end(JSON.stringify({ code: 'VALIDATION_ERROR', details: [{ loc: ['query', 'days'] }] }));
    }
    return res.end(JSON.stringify({ code: 0, data: { records: [{ data: { main_heroid: 93 } }] } }));
  });
  // Puerto libre: con el 8815 fijo, dos suites a la vez (o una que murió sin
  // cerrar) daban EADDRINUSE y tumbaban la corrida entera.
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const puerto422 = srv.address().port;

  try {
    const ruta = {
      template: `http://127.0.0.1:${puerto422}/api/heroes/{hero_identifier}/counters`,
      method: 'GET', params: ['rank', 'days'],
    };
    const { data } = await callRoute(ruta, { rank: 'glory', days: 7 }, 'Atlas');
    ok(peticiones.length === 2, `esperaba 2 intentos, hubo ${peticiones.length}`);
    ok(data?.data?.records?.length, 'no recupera los datos tras el 422');
  } finally {
    srv.close();
  }
});

test('se leen los counters con la forma real que devuelve la API', () => {
  // Respuesta REAL capturada con el diagnóstico en el móvil. Los rivales vienen
  // identificados solo por heroid, sin nombre: solo traen la URL de su icono.
  const real = {
    code: 0, message: 'OK',
    data: { records: [{
      _createdAt: 1724837698334, _id: '66ceef43af5771f18c501376', _updatedAt: 1788014700432,
      data: {
        bigrank: '7', camp_type: '0',
        main_hero: { data: { head: 'https://x/a.png', name: 'Atlas' } },
        main_hero_appearance_rate: 0.008016, main_hero_ban_rate: 0.140859,
        main_hero_win_rate: 0.538425, main_heroid: 93,
        sub_hero: [
          { hero: { data: { head: 'https://x/b.png' } }, hero_win_rate: 0.55588,
            heroid: 20, increase_win_rate: 0.041158, min_win_rate10_12: 0.543624 },
          { hero: { data: { head: 'https://x/c.png' } }, hero_win_rate: 0.47,
            heroid: 17, increase_win_rate: -0.028 },
        ],
      },
    }] },
  };

  ok(pick(real, ['main_heroid']) === 93, 'no encuentra el id del héroe principal');

  const mapa = relationMap(recogerPares(real), new Map([[20, 'Franco'], [17, 'Fanny']]));
  ok(Math.abs(mapa.Franco - 0.541158) < 1e-6, `Franco mal leído: ${mapa.Franco}`);
  ok(Math.abs(mapa.Fanny - 0.472) < 1e-6, `Fanny mal leída: ${mapa.Fanny}`);
  ok(mapa.Franco > mapa.Fanny, 'el signo del delta está invertido');

  // Sin el mapa de ids no hay forma de nombrar a los rivales: debe quedar vacío
  // en vez de inventarse nombres.
  ok(!Object.keys(relationMap(recogerPares(real), new Map())).length,
    'nombra rivales sin tener su id');
});

test('el JSON de datos se guarda compacto y se vuelve a leer entero', () => {
  // Con MAS de cuatro decimales a proposito: con `/10000` los valores ya
  // venian redondeados y la asercion del redondeo no podia fallar (verificado
  // por mutacion: quitar el redondeo de `serializar` pasaba).
  const fila = (n) => Object.fromEntries(
    Array.from({ length: 132 }, (_, i) => [`H${i}`, 0.5 + ((n * 7 + i) % 100) / 1e6 + 1 / 3e7]));
  const datos = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    heroes: [{ name: 'H0', lanes: ['roam'] }],
    counters: Object.fromEntries(Array.from({ length: 133 }, (_, i) => [`H${i}`, fila(i)])),
    synergies: Object.fromEntries(Array.from({ length: 133 }, (_, i) => [`H${i}`, fila(i)])),
  };

  const texto = serializar(datos);
  const vuelta = JSON.parse(texto);

  const pares = (m) => Object.values(m).reduce((n, f) => n + Object.keys(f).length, 0);
  eq(pares(vuelta.counters), pares(datos.counters), 'se pierden cruces al guardar');
  eq(pares(vuelta.synergies), pares(datos.synergies), 'se pierden sinergias al guardar');
  eq(vuelta.generatedAt, datos.generatedAt, 'se pierde algo fuera de las matrices');

  // La marca de sustitucion no puede quedarse en el fichero: la primera
  // version usaba un caracter de control y JSON.stringify lo escapaba, asi que
  // el fichero salia con basura donde iban los datos y seguia siendo JSON
  // valido.
  ok(!texto.includes('@@fila'), 'la marca interna se ha quedado en el fichero');
  ok(!/\\u0000/.test(texto), 'quedan caracteres de control escapados en el fichero');

  // Una linea por heroe, no una por numero: es lo que hace el diff legible
  // desde el movil. 133 + 133 filas y el resto de campos, no 35.000 lineas.
  ok(texto.split('\n').length < 1000,
    `el fichero se ha vuelto a partir en una linea por numero: ${texto.split('\n').length} lineas`);

  // Y redondeado: la quinta cifra de un winrate es ruido y ocupa. Se
  // comprueban TODAS las filas, no la primera: con un fixture de cuatro
  // decimales y un solo valor mirado, esta asercion no podia fallar (se
  // verifico por mutacion quitando el redondeo de `serializar`: pasaba).
  const decimales = [];
  for (const fila of Object.values(vuelta.counters)) {
    for (const v of Object.values(fila)) decimales.push(String(v).replace(/^-?0\./, '').length);
  }
  ok(decimales.length > 50, `solo ${decimales.length} cruces en la vuelta: el fixture no ejercita el redondeo`);
  ok(Math.max(...decimales) <= 4, `winrates sin redondear a cuatro decimales: hasta ${Math.max(...decimales)} cifras`);
});

test('las builds sobreviven al guardado compacto', () => {
  const datos = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    counters: {},
    synergies: {},
    equipment: { 3009: { nombre: 'Hunter Strike' } },
    builds: {
      Paquito: {
        exp: [{ objetos: [3009, 2014, 3001], pickRate: 0.13, winRate: 0.5671, emblema: 'Assassin' }],
        jungle: [{ objetos: [3009], pickRate: 0.2, winRate: 0.51 }],
      },
    },
  };
  const vuelta = JSON.parse(serializar(datos));
  eq(vuelta.builds.Paquito.exp[0].objetos.length, 3, 'se pierden objetos al guardar');
  eq(vuelta.builds.Paquito.exp[0].emblema, 'Assassin', 'se pierde el emblema al guardar');
  eq(Object.keys(vuelta.builds.Paquito).length, 2, 'se pierde una linea al guardar');
  eq(vuelta.equipment['3009'].nombre, 'Hunter Strike', 'se pierde el catalogo de objetos');
});

test('los heroes con el kit rehecho se avisan, y una peticion caida no inventa un aviso', () => {
  // El catalogo guarda la huella del kit CON LA QUE se escribieron los tags a
  // mano. Si la API deja de dar esa huella, es que le han rehecho las
  // habilidades y los tags hablan de otro heroe.
  const catalogo = [
    { name: 'Akai', kit: 'fisico|Crowd Control,Guard' },
    { name: 'Nana', kit: 'magico|Burst,Poke' },
    { name: 'Marcel', kit: 'fisico|Crowd Control,Support' },
    // Uno sin huella: es un heroe que nadie ha revisado todavia.
    { name: 'Hirara' },
  ];
  const conKit = (name, tipo, esp) => ({
    name,
    damage: tipo === 'magico' ? { fisico: 0, magico: 3, verdadero: 0 } : { fisico: 3, magico: 0, verdadero: 0 },
    speciality: esp,
  });

  // Sin cambios, ni un aviso.
  eq(kitsRehechos([
    conKit('Akai', 'fisico', ['Guard', 'Crowd Control']),
    conKit('Nana', 'magico', ['Burst', 'Poke']),
  ], catalogo).length, 0, 'avisa de un kit que no ha cambiado');

  // A Nana le rehacen el kit: sale, y con el antes y el despues, que es lo
  // que hace falta para decidir si los tags siguen valiendo.
  const rehechos = kitsRehechos([
    conKit('Akai', 'fisico', ['Crowd Control', 'Guard']),
    conKit('Nana', 'magico', ['Burst', 'Guard']),
  ], catalogo);
  eq(rehechos.length, 1, 'no ve el kit rehecho de Nana');
  eq(rehechos[0].name, 'Nana');
  eq(rehechos[0].antes, 'magico|Burst,Poke');
  eq(rehechos[0].ahora, 'magico|Burst,Guard');

  // Una ficha que no llego se queda sin speciality y conserva la anterior: eso
  // NO es un rework, y avisarlo llenaria la incidencia de ruido cada vez que
  // la API se cae a medias. Es el mismo criterio que «conservo lo anterior».
  eq(kitsRehechos([{ name: 'Akai', damage: null, speciality: [] }], catalogo).length, 0,
    'una ficha caida se cuenta como kit rehecho');
  eq(kitsRehechos([{ name: 'Akai' }], catalogo).length, 0, 'un heroe sin ficha se cuenta como kit rehecho');

  // Y un heroe sin huella en el catalogo no se mira: ese caso lo cubre
  // `newHeroes`, que avisa de que no tiene tags propios.
  eq(kitsRehechos([conKit('Hirara', 'magico', ['Chase'])], catalogo).length, 0,
    'avisa de un heroe que aun no tiene huella escrita');

  // Un heroe que la API conoce y el catalogo no, tampoco: no hay tags que
  // revisar todavia.
  eq(kitsRehechos([conKit('Desconocido', 'fisico', ['Burst'])], catalogo).length, 0,
    'avisa de un heroe que no esta en el catalogo');
});

await terminar('scripts/ingesta');
