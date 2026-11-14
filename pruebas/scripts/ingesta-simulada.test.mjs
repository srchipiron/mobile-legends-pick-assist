/**
 * La ingesta ejecutada DE VERDAD, como proceso (`scripts/ingest.mjs`, la
 * entrada de los workflows): contra una API simulada en local que sirve la
 * FORMA real de las respuestas (`api-simulada.mjs`) y contra una base
 * inalcanzable. Se comprueba que lo que sale es lo SERVIDO, no lo
 * conservado: «no reventó» no es «funciona».
 *
 * NUNCA escribe en public/: `--out`, `--iconos` y `--retratos` van a un
 * temporal, y lo guardado (`--previo`) lleva sus imágenes en la propia
 * máquina, así que ninguna corrida sale a internet.
 */
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { after, before } from 'node:test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';
import { comparar } from '../../scripts/comparar-ingesta.mjs';
import { huellaTexto, huellaDeHabilidades } from '../../scripts/ingesta/extraccion.mjs';
import { DESCRIPCION, JPG2, SIN_CRUCES, correr, levantarApiSimulada } from './api-simulada.mjs';

const INGESTA = resolve(RAIZ, 'scripts/ingest.mjs');
const REAL = resolve(RAIZ, 'public/data/roam-meta.json');
const hoy = () => new Date().toISOString().slice(0, 10);
const errorDeProgramacion = /is not defined|is not a function|Cannot read|TypeError|ReferenceError/;

let api, dir, previoSim;
const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));
/** Una corrida contra la API simulada; devuelve lo escrito. */
async function corrida(nombre, { previo = previoSim, ranks = 'glory', extra = [] } = {}) {
  const out = resolve(dir, `${nombre}.json`);
  const r = await correr(INGESTA, [
    '--base', api.base, '--tiers', api.tiers, '--previo', previo, '--ranks', ranks, '--rank', 'glory', '--pausa', '0',
    '--out', out, '--iconos', resolve(dir, 'objetos'), '--retratos', resolve(dir, 'heroes'), ...extra,
  ]);
  const salida = `${r.stdout}\n${r.stderr}`;
  eq(r.status, 0, `${nombre}: la ingesta acaba con ${r.status}: ${salida.slice(-600)}`);
  ok(!errorDeProgramacion.test(salida), `${nombre}: error de programación: ${salida.split('\n').find((l) => errorDeProgramacion.test(l))}`);
  return { d: leer(out), out, salida };
}

before(async () => {
  api = await levantarApiSimulada();
  dir = mkdtempSync(resolve(tmpdir(), 'ingesta-simulada-'));
  // Lo guardado: el fichero real con las filas recortadas a los cuatro rivales que sirve la API
  // (con 132 celdas, las de cuatro serían «cortas») y sus imágenes en la propia máquina.
  const real = leer(REAL);
  const local = (id) => `http://127.0.0.1:${api.puerto}/img/${id}.png`;
  const recortar = (m) => Object.fromEntries(Object.entries(m ?? {}).map(([h, f]) => [h, Object.fromEntries(Object.entries(f ?? {}).filter(([k]) => ['Khufra', 'Tigreal', 'Alice', 'Layla'].includes(k)))]));
  previoSim = resolve(dir, 'previo.json');
  writeFileSync(previoSim, JSON.stringify({
    ...real, counters: recortar(real.counters), synergies: recortar(real.synergies),
    equipment: Object.fromEntries(Object.entries(real.equipment).map(([id, o]) => [id, { ...o, icono: local(id) }])),
    heroes: real.heroes.map((h) => ({ ...h, retrato: local(`r${h.id}`), cara: local(`c${h.id}`) })),
  }));
});
after(async () => {
  await api?.cerrar();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

let d1, out1;
test('1. con la API sana se llama a todo y sale lo servido, sin campos muertos ni rutas de la cuenta', async () => {
  const antes = Date.now();
  const { d, out, salida } = await corrida('sana', { ranks: 'mythic,glory' });
  d1 = d; out1 = out;
  ok(!/fallo \(/.test(salida), `algún endpoint falló contra la API simulada: ${salida.split('\n').filter((l) => /fallo \(/.test(l)).join(' | ')}`);
  for (const k of ['esquema', 'rank:mythic', 'rank:glory', 'rank3:glory', 'position', 'detail', 'counters', 'academy', 'academy:glory', 'academy:mythic', 'compat', 'compat:glory', 'compat:mythic', 'equipo', 'equipoCorto', 'talentos', 'builds:roam', 'lineas:roam', 'img', 'tiers', 'tier']) {
    ok(api.golpes[k] > 0, `la ingesta no ha llamado a ${k}: ${JSON.stringify(api.golpes)}`);
  }
  ok(Date.parse(d.generatedAt) >= antes - 1000, `la fecha no es la de esta corrida: ${d.generatedAt}`);
  eq(d.diagnostics.conservado, false, 'dice que conserva teniendo datos nuevos');
  ok(d.diagnostics.frescos.includes('glory') && d.diagnostics.frescos.includes('mythic'), `rangos frescos: ${d.diagnostics.frescos}`);
  eq(d.stats.Atlas?.winRate, 0.51, `winrate de Atlas: ${JSON.stringify(d.stats.Atlas)}`);
  eq(d.statsByRank.mythic?.Khufra?.winRate, 0.52, 'las estadísticas por rango no son las servidas');
  // La ventana corta, aparte y con lo servido (0.512), sin pisar la de 7 días.
  eq(d.recientes?.dias, 3);
  eq(d.recientes?.statsByRank?.glory?.Atlas?.winRate, 0.512, `la ventana corta no es la servida: ${JSON.stringify(d.recientes?.statsByRank?.glory?.Atlas)}`);
  eq(d.historia?.at(-1)?.fecha, hoy(), 'la historia no lleva la foto de hoy');
  eq(d.historia?.at(-1)?.glory?.Atlas?.[0], 0.51);
  eq(d.historia?.at(-1)?.mythic?.Khufra?.[0], 0.52);
  eq(d.tiers?.tiers?.Atlas, 'S', `la tier de Atlas no es la servida: ${JSON.stringify(d.tiers)}`);
  eq(d.tiers?.tiers?.Khufra, 'B');
  const atlas = d.heroes.find((h) => h.name === 'Atlas');
  ok(atlas && atlas.id === 1 && atlas.role === 'tank' && atlas.lanes.includes('roam'), `ficha de Atlas: ${JSON.stringify(atlas)}`);
  eq(atlas?.damage?.magico, 1, `tipo de daño de Atlas: ${JSON.stringify(atlas?.damage)}`);
  eq(atlas?.kitTexto, huellaTexto({ skilldesc: DESCRIPCION }), 'la huella del texto no es la de la ficha SERVIDA');
  eq(atlas?.kitCifras, huellaDeHabilidades([
    { skillname: 'Frigid Breath', skilldesc: 'Removes all debuffs on allies.' },
    { skillname: 'Fatal Links', skilldesc: DESCRIPCION },
    { skillname: 'Time Journey', skilldesc: 'Removes all debuffs on allies.' },
  ]), 'la huella de las habilidades no es la de la ficha SERVIDA');
  eq(JSON.stringify(atlas?.habilidades), JSON.stringify([{ n: 'Fatal Links', e: ['area', 'cc'] }, { n: 'Time Journey', e: ['aliados', 'limpia'] }]));
  ok(atlas?.cara?.endsWith('/cara/1.png'), `la cara del juego no es la de hero.data.head: ${atlas?.cara}`);
  ok(atlas?.retrato?.endsWith('/img/1.jpg'), `el retrato no es el de la web: ${atlas?.retrato}`);
  // Academy trae 4 pares y la del esquema 2: gana la que MÁS trae.
  eq(d.counters.Atlas?.Khufra, 0.5123, `cruce Atlas→Khufra: ${JSON.stringify(d.counters.Atlas)}`);
  eq(d.counters.Atlas?.Layla, 0.53, 'no ha elegido la ruta con MÁS cruces');
  ok(/^4 pares .*academy/.test(d.diagnostics.rutasMedidas?.counter ?? ''), `rutas medidas: ${JSON.stringify(d.diagnostics.rutasMedidas)}`);
  eq(api.golpes.user ?? 0, 0, 'la ingesta ha llamado a una ruta de la cuenta (/api/user/)');
  ok(!/prohibida|\/api\/user\//.test(salida + JSON.stringify(d.diagnostics)), 'el descubrimiento ofrece una ruta de la cuenta como candidata');
  eq(d.synergies.Atlas?.Tigreal, 0.48);
  const obj = d.equipment?.['90001'];
  ok(obj && obj.nombre === 'Objeto de Prueba' && obj.magica === 18 && obj.fisica === 5 && obj.tipo === 'Defense', `objeto servido: ${JSON.stringify(obj)}`);
  ok(['antiCuracion', 'antiEscudo', 'antiCritico'].every((e) => obj?.efectos?.includes(e)) && !obj?.efectos?.includes('critico'), `efectos del objeto: ${JSON.stringify(obj?.efectos)}`);
  ok(['antiCuracion', 'critico'].every((e) => d.equipment?.['90002']?.efectos?.includes(e)), 'los efectos de dos rutas no se juntan');
  eq(JSON.stringify(d.equipment?.['90004']?.efectos ?? []), '[]', 'las estadísticas de unas botas salen como antisanación');
  const build = d.builds?.Atlas?.roam?.[0];
  ok(build && build.objetos.join(',') === '90001,90002,90003' && build.emblema === 'Tank' && build.hechizo === 'Flicker' && build.winRate === 0.555, `build de Atlas: ${JSON.stringify(build)}`);
  eq(JSON.stringify(build?.talentos), '[611,621,131]');
  eq(JSON.stringify(d.talentos?.['611']), JSON.stringify({ nombre: 'Inspire', nivel: 1, texto: 'Gain 5% extra Cooldown Reduction.' }));
  eq(d.winrateLinea?.Atlas?.roam, 0.4331);
  eq(d.winrateLinea?.Khufra?.roam, 0.4341, 'el winrate por línea no es el de cada héroe');
  ok(!d.diagnostics.lineas?.errores?.length && d.diagnostics.lineas?.valores === 3 && d.diagnostics.lineas?.curvas === 3, `diagnóstico del winrate por línea: ${JSON.stringify(d.diagnostics.lineas)}`);
  // La curva, en el orden de los tramos aunque la API los dé desordenados.
  eq(JSON.stringify(d.curvaLinea?.Atlas?.roam), JSON.stringify([0.401, 0.421, 0.441, 0.461, 0.481, 0.501]));
  eq(d.curvaLinea?.Khufra?.roam?.[0], 0.402);
  ok(existsSync(resolve(dir, 'objetos', '90001.png')) && existsSync(resolve(dir, 'heroes', '1.jpg')), 'no baja el icono o el retrato');
  const esp = atlas?.speciality ?? [];
  ok(esp.includes('Guard') && !esp.some((x) => x.includes("'")), `una speciality con comillas se guarda: ${JSON.stringify(esp)}`);
  for (const [k, v] of Object.entries({ speciality: d.diagnostics.speciality?.errores, builds: d.diagnostics.builds?.errores, relations: d.diagnostics.relations?.errores })) {
    ok(!(v ?? []).length, `errores de ${k}: ${JSON.stringify(v)}`);
  }
  // Los campos que nadie lee no se escriben (4.0).
  const texto = readFileSync(out, 'utf8');
  ok(!/"(patchAvgWinRate|roamCoverage|matches|lane)"/.test(texto) && !('ok' in d.diagnostics), 'la salida lleva campos muertos');
  // La guarda de rango: Gloria y Mítico sirven lo mismo; los cruces llegan y casan, las parejas (tres) no cuentan.
  ok(d.relaciones?.rango === 'glory' && d.relaciones?.coherencia?.counters > 0.99 && d.relaciones?.coherencia?.synergies === null && !d.relaciones?.motivo, `relaciones: ${JSON.stringify(d.relaciones)}`);
});

test('2. con la ruta de cruces caída: fecha nueva, la matriz con la suya, una segunda pasada que no recupera y el comparador la acepta', async () => {
  Object.assign(api.f, { fallaCounters: true, fallaRecientes: true });
  const mitico = api.golpes['rank:mythic'];
  const { d } = await corrida('sin-cruces');
  ok(api.golpes['rank:mythic'] > mitico, 'con --ranks glory no se pide el rango de respaldo');
  Object.assign(api.f, { fallaCounters: false, fallaRecientes: false });
  const guardada = leer(previoSim);
  ok(d.generatedAt !== guardada.generatedAt, 'con estadísticas nuevas y la matriz conservada no sale con fecha de hoy');
  eq(d.relaciones?.descargada, guardada.relaciones?.descargada ?? guardada.generatedAt, 'la matriz conservada no lleva su fecha');
  eq(d.diagnostics.conservado, true);
  ok(d.diagnostics.relations?.reintentados > 0 && d.diagnostics.relations?.recuperados === 0, `con todo caído no se reintenta una vez: ${JSON.stringify(d.diagnostics.relations)}`);
  // La ventana corta caída no se conserva ni se inventa: la app cae a 7.
  ok(d.recientes === undefined && /fallo:/.test(d.diagnostics.recientes?.glory ?? ''), `ventana corta: ${JSON.stringify(d.diagnostics.recientes)}`);
  eq(d.diagnostics.frescosRecursos?.relaciones, 0);
  eq(JSON.stringify(d.counters?.Atlas), JSON.stringify(guardada.counters.Atlas), 'la fila de Atlas no se conserva');
  eq(JSON.stringify({ ...d.relaciones, descargada: undefined }), JSON.stringify({ ...guardada.relaciones, descargada: undefined }), 'la matriz conservada sale con otra etiqueta de rango');
  eq(comparar(d, d1).peores.map((p) => p.clave).join(), '', 'el comparador tira una corrida con estadísticas nuevas por llevar la matriz conservada');
});

test('3. Mítico caído y Gloria con dos 500: se reintenta, la fecha NO avanza y sin matriz nueva no hay nada fresco', async () => {
  Object.assign(api.f, { fallaMitico: true, fallaGloriaVeces: 2 });
  const { d } = await corrida('sin-mitico');
  api.f.fallaMitico = false;
  const guardada = leer(previoSim);
  eq(api.f.fallaGloriaVeces, 0, 'no se volvió a pedir Gloria tras su 500');
  ok(d.diagnostics.frescos.includes('glory') && !d.diagnostics.frescos.includes('mythic'), `rangos frescos: ${d.diagnostics.frescos}`);
  eq(JSON.stringify(d.diagnostics.reintentoEstadisticas), JSON.stringify({ vueltas: 2, recuperados: ['glory'], sinRecuperar: ['mythic'] }));
  ok(d.diagnostics.frescosRecursos?.parejas > 100, 'con la matriz entera no cuenta las parejas');
  eq(d.generatedAt, guardada.generatedAt, 'con Mítico conservado la corrida se fecha como nueva');
  eq(d.diagnostics.conservado, true);
  ok(!comparar(d, guardada).peores.some((p) => p.clave === 'rangoFresco'), 'con la matriz nueva entera el comparador tira la corrida por rangoFresco');
  const sinMatriz = { ...d, diagnostics: { ...d.diagnostics, frescosRecursos: { ...d.diagnostics.frescosRecursos, relaciones: 0, parejas: 0 } } };
  ok(comparar(sinMatriz, guardada).peores.some((p) => p.clave === 'nadaFresco'), 'sin matriz nueva el comparador acepta una corrida sin el rango de respaldo');
});

test('4. parejas vacías y curva en porcentaje: parejas 0, se tira por perder parejas (no por frescura) y lo conservado se cuenta', async () => {
  Object.assign(api.f, { parejasVacias: true, curvaEnPorcentaje: true });
  const { d } = await corrida('sin-parejas');
  Object.assign(api.f, { parejasVacias: false, curvaEnPorcentaje: false });
  const guardada = leer(previoSim);
  eq(d.diagnostics.frescosRecursos?.parejas, 0);
  ok(d.diagnostics.frescosRecursos?.relaciones > 100, 'los cruces no se descargaron');
  ok(d.generatedAt !== guardada.generatedAt);
  eq(d.relaciones?.descargada, guardada.relaciones?.descargada ?? guardada.generatedAt);
  const peores = comparar(d, d1).peores.map((p) => p.clave);
  ok(peores.includes('sinergias') && !peores.includes('relacionesFrescas'), `peores: ${peores}`);
  ok(d.diagnostics.lineas?.curvasConservadas > 0 && d.diagnostics.lineas?.curvas === 0 && d.diagnostics.lineas?.conservados === 0, `líneas: ${JSON.stringify(d.diagnostics.lineas)}`);
});

let atlas1;
test('5. ficha, academy, una medida y la línea de Khufra caídas: se conserva cada cosa, la ruta buena sigue y lo de hoy se funde par a par', async () => {
  atlas1 = d1.heroes.find((h) => h.name === 'Atlas');
  Object.assign(api.f, { fallaDetail: true, academyVacia: true, fallosCountersPendientes: 1, fallaLineaDe: '2', desplazaLinea: 0.01, fallaEquipoLargo: true });
  const ayer = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const previo = resolve(dir, 'previo-ayer.json');
  writeFileSync(previo, JSON.stringify({ ...d1, historia: [...d1.historia, { fecha: ayer, glory: { Atlas: [0.49, 0.01] }, mythic: { Atlas: [0.5, 0.01] } }] }));
  const { d } = await corrida('ficha-caida', { previo });
  Object.assign(api.f, { fallaDetail: false, academyVacia: false, fallaLineaDe: null, fallaEquipoLargo: false });
  ok(d.historia.find((e) => e.fecha === ayer)?.glory?.Atlas?.[0] === 0.49 && new Set(d.historia.map((e) => e.fecha)).size === d.historia.length, 'la historia de ayer no se conserva');
  const obj = d.equipment?.['90001'];
  ok(obj?.magica === 18 && obj?.fisica === 5 && obj?.efectos?.length, `con la ruta larga caída se pierde la defensa: ${JSON.stringify(obj)}`);
  const atlas = d.heroes.find((h) => h.name === 'Atlas');
  ok(atlas?.speciality?.includes('Guard') && atlas?.kitTexto === huellaTexto({ skilldesc: DESCRIPCION }) && atlas?.habilidades?.length === 2 && atlas?.cara?.endsWith('/cara/1.png'), `con la ficha caída no se conserva: ${JSON.stringify(atlas)}`);
  ok(atlas?.kitCifras === atlas1.kitCifras && d.tocados?.Atlas !== hoy(), 'con la ficha caída se marca a Atlas como tocado hoy');
  // Un 500 suelto al medir no cambia la ruta por una vacía (0 > −1).
  ok(/^2 pares /.test(d.diagnostics.rutasMedidas?.counter ?? '') && !/academy/.test(d.diagnostics.rutasMedidas?.counter ?? ''), `rutas medidas: ${d.diagnostics.rutasMedidas?.counter}`);
  ok(d.counters.Atlas?.Khufra === 0.5123 && d.diagnostics.frescosRecursos?.relaciones > 100, 'la matriz no se descargó por la ruta buena');
  eq(d.winrateLinea?.Atlas?.roam, 0.4431, 'Atlas no trae el winrate de hoy');
  eq(d.winrateLinea?.Khufra?.roam, 0.4341, 'el winrate de Khufra se pierde con su ruta caída');
  eq(d.curvaLinea?.Atlas?.roam?.[0], 0.411);
  eq(d.curvaLinea?.Khufra?.roam?.[0], 0.402);
  ok(d.diagnostics.lineas?.conservados === 1 && d.diagnostics.lineas?.curvasConservadas === 1, `líneas: ${JSON.stringify(d.diagnostics.lineas)}`);
  ok(d.builds?.Atlas?.roam?.length && d.builds?.Khufra?.roam?.length && d.diagnostics.builds?.conservadas === 1, `builds: ${JSON.stringify(d.diagnostics.builds)}`);
});

let d4, out4;
test('6. Gloria ruidosa y la ruta corta de objetos caída: cruces y parejas de Mítico, objetos guardados conservados y el retrato rehecho rebajado', async () => {
  Object.assign(api.f, { gloriaRuidosa: true, fallaEquipoCorto: true, retratoNuevo: true });
  ({ d: d4, out: out4 } = await corrida('gloria-ruidosa', { ranks: 'mythic,glory', extra: ['--celdas-para-comparar', '1'] }));
  api.f.fallaEquipoCorto = false;
  const guardados = Object.keys(leer(previoSim).equipment);
  ok(guardados.length > 100 && guardados.every((id) => d4.equipment?.[id]), 'con la ruta corta caída se pierden objetos guardados');
  ok(d4.equipment?.['90004']?.nombre === 'Botas Rápidas' && d4.diagnostics.equipo?.caidas === 1 && d4.diagnostics.equipo.conservados === guardados.length, `equipo: ${JSON.stringify(d4.diagnostics.equipo)}`);
  eq(d4.relaciones?.rango, 'mythic', `con Gloria incoherente los cruces no salen de Mítico: ${JSON.stringify(d4.relaciones)}`);
  ok(d4.relaciones?.coherencia?.counters < 0.8 && /no se parecen/.test(d4.relaciones?.motivo ?? '') && d4.relaciones?.ultima?.rango === 'mythic', `relaciones: ${JSON.stringify(d4.relaciones)}`);
  eq(d4.counters.Atlas?.Khufra, 0.5123, 'el cruce guardado no es el de Mítico (el de Gloria ruidosa sería 0.4877)');
  eq(d4.synergies.Atlas?.Tigreal, 0.48, 'la pareja guardada no es la de Mítico');
  eq(d4.diagnostics.imagenes?.heroes?.cambiados, 1, 'el retrato rehecho no se vuelve a bajar');
  ok(readFileSync(resolve(dir, 'heroes', '1.jpg')).equals(JPG2), 'el fichero del retrato sigue siendo el de antes');
  ok(leer(resolve(dir, 'heroes', 'fuentes.json'))['1']?.endsWith('?n=2'), 'no se apunta de dónde salió el retrato nuevo');
});

let out5;
test('7. Gloria coherente con 20 caídas y respuestas vacías cruzadas: segunda pasada, matriz fresca, kit sin control y Atlas tocado hoy', async () => {
  Object.assign(api.f, { gloriaRuidosa: false, kitSinControl: true, fallarPrimeros: 20, parejasVaciasActivas: true });
  const kits = new Map(d1.heroes.map((h) => [h.name, h.kitCifras]));
  const conKits = leer(previoSim);
  conKits.heroes = conKits.heroes.map((h) => (kits.get(h.name) ? { ...h, kitCifras: kits.get(h.name) } : h));
  const previo = resolve(dir, 'previo-con-kits.json');
  writeFileSync(previo, JSON.stringify(conKits));
  const { d, out } = await corrida('gloria-buena', { previo, ranks: 'mythic,glory', extra: ['--celdas-para-comparar', '1'] });
  out5 = out;
  api.f.parejasVaciasActivas = false;
  eq(api.e.fallaronYa.size, 20, 'la prueba no ha llegado a fallar a veinte');
  eq(api.e.sinParejas.size, 5);
  ok(api.e.crucesPedidos.size === 5 && [...api.e.crucesPedidos.values()].every((n) => n >= 2), 'los que solo traían cruces no se reintentan');
  ok(SIN_CRUCES.every((h) => api.e.pedidosSinCruces.get(`s:${h}`) >= 2), 'los que solo traían parejas no se reintentan');
  const vacias = (m) => Object.entries(m ?? {}).filter(([, f]) => !Object.keys(f ?? {}).length).map(([n]) => n);
  eq(vacias(d.counters).join(), '', 'la segunda pasada borra cruces que habían llegado bien');
  eq(vacias(d.synergies).join(), '', 'las parejas vacías no se recuperan, o la segunda pasada borra las buenas');
  eq(d.diagnostics.relations?.recuperados, d.diagnostics.relations?.reintentados);
  ok(d.diagnostics.relations?.reintentados >= 20 && !d.diagnostics.conservado && d.diagnostics.frescosRecursos?.relaciones === d.diagnostics.frescosRecursos?.pedidas, `matriz: ${JSON.stringify(d.diagnostics.frescosRecursos)}`);
  ok(d.relaciones?.rango === 'glory' && d.relaciones?.coherencia?.counters > 0.99 && !d.relaciones?.motivo, `relaciones: ${JSON.stringify(d.relaciones)}`);
  eq(d.diagnostics.imagenes?.heroes?.bajados, 0, 'se vuelven a bajar retratos que no han cambiado');
  eq(JSON.stringify(d.heroes.find((h) => h.name === 'Atlas')?.habilidades), '[]', 'una ficha sin habilidades deja las de antes');
  const otros = [...kits.keys()].filter((n) => n !== 'Atlas' && kits.get(n));
  ok(d.tocados?.Atlas === hoy() && otros.length && otros.every((n) => d.tocados?.[n] !== hoy()) && d.diagnostics.parche?.cambiados === 1, `tocados: ${JSON.stringify({ t: d.tocados, p: d.diagnostics.parche })}`);
});

test('8. Mítico a medias: tras una Gloria buena se queda Gloria «entero»; tras una que midió Mítico, sigue Mítico («última comprobación»)', async () => {
  Object.assign(api.f, { gloriaRuidosa: true, miticoAMedias: true });
  const tras = await corrida('mitico-a-medias', { previo: out5, ranks: 'mythic,glory', extra: ['--celdas-para-comparar', '1'] });
  ok(tras.d.relaciones?.rango === 'glory' && /entero/.test(tras.d.relaciones?.motivo ?? ''), `cambia a un Mítico a medias: ${JSON.stringify(tras.d.relaciones)}`);
  api.e.miticosServidos = 0;
  const { d } = await corrida('mitico-a-medias-tras-medir', { previo: out4, ranks: 'mythic,glory', extra: ['--celdas-para-comparar', '1'] });
  Object.assign(api.f, { gloriaRuidosa: false, miticoAMedias: false });
  ok(d.relaciones?.rango === 'mythic' && /última comprobación/.test(d.relaciones?.motivo ?? '') && d.relaciones?.ultima?.rango === 'mythic', `vuelve a la Gloria medida como rota: ${JSON.stringify(d.relaciones)}`);
  ok(d.counters.Atlas?.Khufra === 0.5123 && d.synergies.Atlas?.Tigreal === 0.48, 'lo guardado no es de Mítico');
});

test('9. Mítico caído en su pasada: se pide otra vez y Gloria se comprueba; Gloria caída entera: segunda pasada y matriz fresca', async () => {
  api.f.miticoCaido = true;
  const mc = await corrida('mitico-caido', { previo: out5, ranks: 'mythic,glory', extra: ['--celdas-para-comparar', '1'] });
  api.f.miticoCaido = false;
  ok(api.e.miticoYaCaido.size >= 20, 'la prueba no ha llegado a tirar Mítico');
  ok(mc.d.relaciones?.rango === 'glory' && mc.d.relaciones?.coherencia?.counters > 0.99 && !mc.d.relaciones?.motivo, `relaciones: ${JSON.stringify(mc.d.relaciones)}`);
  ok(mc.d.diagnostics.respaldoReintentado?.antes === 0 && mc.d.diagnostics.respaldoReintentado?.despues > 0, `respaldo: ${JSON.stringify(mc.d.diagnostics.respaldoReintentado)}`);
  api.f.gloriaCaida = true;
  const gc = await corrida('gloria-caida', { previo: out5, ranks: 'mythic,glory', extra: ['--celdas-para-comparar', '1'] });
  api.f.gloriaCaida = false;
  ok(api.e.gloriaYaCaida.size >= 20, 'la prueba no ha llegado a tirar Gloria');
  ok(gc.d.relaciones?.rango === 'glory' && gc.d.relaciones?.coherencia?.counters > 0.99 && !gc.d.diagnostics.conservado, `relaciones: ${JSON.stringify(gc.d.relaciones)}`);
});

test('10. academy con 500 al medir: con dos, la primera fila corta vuelve a medir y sigue por academy; con uno, la medida reintenta; un error no pierde contra una vacía', async () => {
  api.f.academyFallaAlMedir = 2;
  const dos = await corrida('ruta-corta', { previo: out1 });
  ok(dos.d.counters.Atlas?.Layla != null && dos.d.diagnostics.relations?.rutaCambiada?.some((x) => /academy/.test(x)), `ruta cambiada: ${JSON.stringify(dos.d.diagnostics.relations?.rutaCambiada)}`);
  api.f.academyFallaAlMedir = 1;
  const uno = await corrida('ruta-un-fallo', { previo: out1 });
  api.f.academyFallaAlMedir = 0;
  ok(/academy/.test(uno.d.diagnostics.rutasMedidas?.counter ?? '') && !uno.d.diagnostics.relations?.rutaCambiada?.length, `medida: ${JSON.stringify(uno.d.diagnostics.rutasMedidas)}`);
  // La del esquema falla las DOS medidas y academy responde vacía: un error no es un cero (0 > −1 cambiaba a la vacía).
  Object.assign(api.f, { fallosCountersPendientes: 2, academyVacia: true });
  const vacia = await corrida('ruta-vacia', { previo: out1 });
  Object.assign(api.f, { fallosCountersPendientes: 0, academyVacia: false });
  ok(!/academy/.test(vacia.d.diagnostics.rutasMedidas?.counter ?? '') && !vacia.d.diagnostics.relations?.rutaCambiada?.length, `cambia a una ruta vacía: ${vacia.d.diagnostics.rutasMedidas?.counter}`);
  ok(vacia.d.counters.Atlas?.Khufra === 0.5123 && vacia.d.diagnostics.frescosRecursos?.relaciones > 100, 'la matriz no se descargó por la ruta que sí responde');
});

test('con la base inalcanzable arranca, escribe, no toca public/ y conserva la fecha: el comparador no ve nada fresco', async () => {
  const caja = mkdtempSync(resolve(tmpdir(), 'ingesta-'));
  const out = resolve(caja, 'roam-meta.json');
  copyFileSync(REAL, out);
  try {
    // Las imágenes a una COPIA de las publicadas: vacía, bajaría las 206; en public/, las reescribiría.
    for (const c of ['objetos', 'heroes']) cpSync(resolve(RAIZ, 'public', c), resolve(caja, c), { recursive: true });
    const tocado = () => ['objetos', 'heroes'].flatMap((c) => readdirSync(resolve(RAIZ, 'public', c)).map((f) => statSync(resolve(RAIZ, 'public', c, f)).mtimeMs)).reduce((a, b) => Math.max(a, b), 0);
    const antes = tocado();
    const r = await correr(INGESTA, ['--base', 'http://127.0.0.1:1/api', '--ranks', 'mythic', '--pausa', '0', '--out', out, '--iconos', resolve(caja, 'objetos'), '--retratos', resolve(caja, 'heroes')]);
    const salida = `${r.stdout}\n${r.stderr}`;
    eq(tocado(), antes, 'la prueba escribe en public/objetos o public/heroes');
    eq(r.status, 0, `contra una base inalcanzable acaba con ${r.status}: ${salida.slice(-400)}`);
    ok(!errorDeProgramacion.test(salida) && salida.includes('Escrito'), `no llega a escribir: ${salida.slice(-400)}`);
    const guardada = leer(REAL);
    const nueva = leer(out);
    eq(nueva.generatedAt, guardada.generatedAt, 'una corrida sin red se fecha como si trajera datos nuevos');
    eq(nueva.diagnostics?.conservado, true);
    ok(nueva.diagnostics.imagenes?.objetos?.bajados === 0 && nueva.diagnostics.imagenes?.heroes?.bajados === 0, 'sin red intenta bajar imágenes');
    ok(comparar(nueva, guardada).peores.some((p) => p.clave === 'nadaFresco'), 'el comparador acepta una corrida que no ha descargado nada');
  } finally {
    rmSync(caja, { recursive: true, force: true });
  }
});
