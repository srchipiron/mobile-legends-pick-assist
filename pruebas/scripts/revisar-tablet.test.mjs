/**
 * La revisión automática de la tablet (3.74.0): de los partes que sube cada
 * lector, el más reciente de cada uno dice lo que falla y lo que conviene
 * mirar; y el script sale con 1 si algo falla, para que la revisión
 * programada no tenga que leer.
 */
import { readFileSync } from 'node:fs';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { revisarParte, revisarPartes, informe, PARTE_CALLADO_MIN, DATOS_VIEJOS_H, CIERRE_POR_FALLO, SALUD_CALLADA_MIN, FALLO_ANTERIOR_H } from '../../scripts/revisar-tablet.mjs';
import { subirParte, bajarPartes } from '../../src/app/basedatos.js';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import { parteDeSalud } from '../../scripts/lector/en-tablet.mjs';

const AHORA = Date.parse('2026-10-25T12:00:00Z');
const hace = (min) => new Date(AHORA - min * 60000).toISOString();
const sano = (extra = {}) => ({
  estado: {
    tablet: { apk: '3.74.0', grabando: true, burbuja: true, bateriaLibre: true },
    lector: { lecturas: 100, fallosCaptura: 2 },
    solo: { activo: true },
    datos: { fecha: hace(600), de: 'web' },
    partidas: { apuntadas: 3, sinSubir: 0, clave: true, error: null },
    pendiente: { correccion: false, pregunta: false, vigilando: false },
    ...extra,
  },
  log: ['Lectura 1 (700 ms): baneos …', 'Sin móvil: Estes 50%'],
});

test('una tablet sana: ni fallos ni avisos', () => {
  const r = revisarParte({ j: 1, recibido: hace(5), d: sano() }, { ahora: AHORA });
  eq(JSON.stringify([r.fallos, r.avisos]), '[[],[]]');
  eq(r.minutos, 5); eq(r.apk, '3.74.0');
});

test('lo que falla se dice como FALLO, y lo que conviene mirar como AVISO', () => {
  const fallo = (d) => revisarParte({ j: 1, recibido: hace(5), d }, { ahora: AHORA });
  ok(fallo({ ...sano(), falloNodo: 'SyntaxError: Invalid regular expression' }).fallos.length === 1, 'no ve el fallo de Node');
  ok(fallo({ ...sano(), log: ['ERROR sin recoger: TypeError: x is undefined'] }).fallos.length === 1, 'no ve un error del registro');
  ok(fallo(sano({ tablet: { grabando: true, burbuja: true, burbujaEstado: 'no llega a la pantalla' } })).fallos.length === 1, 'no ve la burbuja que no sale');
  ok(fallo(sano({ lector: { lecturas: 100, fallosCaptura: 50 } })).avisos.some((a) => /capturas/.test(a)), 'no ve las capturas que fallan');
  ok(fallo(sano({ datos: { fecha: hace((DATOS_VIEJOS_H + 1) * 60), de: 'apk' } })).avisos.some((a) => /APK/.test(a)), 'no ve los datos viejos');
  ok(fallo(sano({ partidas: { sinSubir: 4, clave: false } })).avisos.some((a) => /clave/.test(a)), 'no ve las partidas sin clave');
  ok(fallo(sano({ partidas: { apuntadas: 3, sinSubir: 0, clave: true, sinResultado: 2 } })).avisos.some((a) => /2 partidas sin resultado/.test(a)), 'no ve las partidas sin resultado');
  eq(fallo(sano()).avisos.length, 0, 'avisa de partidas sin resultado que no hay');
  ok(fallo(sano({ solo: { activo: false } })).avisos.length === 1, 'no ve el modo solo apagado');
  ok(fallo(sano({ pendiente: { pregunta: true } })).avisos.length === 1, 'no ve la pregunta pendiente');
  ok(fallo(sano({ salida: 'Android la cerró por falta de memoria' })).avisos.length === 1, 'no ve la salida por memoria');
  const callado = revisarParte({ j: 1, recibido: hace(PARTE_CALLADO_MIN + 5), d: sano() }, { ahora: AHORA });
  ok(callado.avisos.some((a) => /se cerró/.test(a)), 'no ve el parte callado con la tablet grabando');
  ok(!revisarParte({ j: 1, recibido: hace(PARTE_CALLADO_MIN + 5), d: sano({ tablet: { grabando: false } }) }, { ahora: AHORA }).avisos.length, 'avisa de un parte callado sin grabar');
});

test('de cada lector cuenta su parte MÁS reciente, y el informe lo dice', () => {
  const r = revisarPartes([
    { j: 1, recibido: hace(30), d: { ...sano(), falloNodo: 'SyntaxError' } },
    { j: 1, recibido: hace(5), d: sano() },
    { j: 2, recibido: hace(5), d: { ...sano(), falloNodo: 'ReferenceError' } },
    { j: 'x', recibido: hace(1), d: {} }, null,
  ], { ahora: AHORA });
  eq(r.lectores.length, 2); eq(r.fallos, 1);
  eq(r.lectores.find((l) => l.j === 1).fallos.length, 0, 'cuenta un parte viejo del lector');
  const md = informe(r);
  ok(/1 fallo/.test(md) && /FALLO: .*ReferenceError/.test(md) && /Todo bien/.test(md), md);
  ok(/ningún parte/.test(informe(revisarPartes([]))), 'sin partes no lo dice');
});

test('subir y bajar partes por la base de datos: con tu clave, uno cada 4 minutos, y sin huellas al bajar', async () => {
  let t = AHORA;
  const s = supabaseFalso({ ahora: () => t });
  const config = { url: 'https://abcdefghijklmnopqrst.supabase.co', clave: s.clavePublica };
  const clave = 'R'.repeat(43);
  eq((await subirParte({ config, clave: 'corta', parte: sano() }, { fetch: s.fetch })).error, 'clave');
  eq(s.llamadas.length, 0, 'llama sin clave');
  ok(!(await subirParte({ config, clave, parte: sano() }, { fetch: s.fetch })).error);
  eq((await subirParte({ config, clave, parte: sano() }, { fetch: s.fetch })).error, 'pronto', 'acepta dos partes seguidos');
  t += 5 * 60000;
  ok(!(await subirParte({ config, clave, parte: { ...sano(), falloNodo: 'TypeError' } }, { fetch: s.fetch })).error);
  const b = await bajarPartes(config, { fetch: s.fetch });
  eq(b.partes.length, 2);
  ok(!JSON.stringify(b.partes).includes(clave), 'al bajar viaja la clave');
  eq(revisarPartes(b.partes, { ahora: t }).fallos, 1, 'la revisión no ve el último parte');
  eq((await bajarPartes(config, { fetch: async () => { throw new TypeError('sin red'); } })).error, 'red');
});

test('los cierres de Android que avisan son justo los que Salidas.kt cuenta como fallo', () => {
  const kt = readFileSync(`${RAIZ}/android/app/src/main/java/es/srchipiron/lector/Salidas.kt`, 'utf8');
  const textos = Object.fromEntries([...kt.matchAll(/REASON_(\w+) -> "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const fallos = new Set([...kt.match(/FALLOS = setOf\(([^)]*)\)/s)[1].matchAll(/REASON_(\w+)/g)].map((m) => m[1]));
  ok(Object.keys(textos).length >= 10 && fallos.size >= 5, 'no encuentra los motivos en Salidas.kt');
  for (const [r, t] of Object.entries(textos)) {
    eq(CIERRE_POR_FALLO.test(`Último cierre (hace 3 min): ${t} · usaba 900 MB`), fallos.has(r), `«${t}» (${r})`);
    eq(revisarParte({ j: 1, recibido: hace(5), d: sano({ salida: `Último cierre (hace 3 min): ${t}` }) }, { ahora: AHORA }).avisos.length, fallos.has(r) ? 1 : 0, `la revisión con «${t}»`);
  }
});

test('los puntos ciegos de la revisión (3.74.2): un error viejo del registro, la salud de la APK parada, sin datos y el fallo de captura legible', () => {
  // Un error en la línea 36 de 180: fuera de las 60 últimas, pero dentro del parte.
  const log = Array.from({ length: 180 }, (_, i) => (i === 36 ? 'No se pudo guardar la captura: ENOSPC' : `Lectura ${i} (700 ms): baneos Hirara, Marcel`)).join('\n');
  const d = parteDeSalud({ estado: sano().estado, log, ahora: AHORA });
  ok(revisarParte({ j: 1, recibido: hace(5), d }, { ahora: AHORA }).fallos.some((f) => /ENOSPC/.test(f)), 'el error de hace más de 60 líneas no llega a la revisión');
  ok(revisarParte({ j: 1, recibido: hace(5), d: { ...sano(), recortado: true } }, { ahora: AHORA }).avisos.some((a) => /recortado/.test(a)), 'no dice que el parte llegó recortado');
  // La APK dejó de escribir salud.json (su hilo murió) con la tablet grabando.
  const parada = { ...sano({ tablet: { grabando: true, burbuja: true, cuando: AHORA - (SALUD_CALLADA_MIN + 10) * 60000 } }), cuando: AHORA };
  ok(revisarParte({ j: 1, recibido: hace(1), d: parada }, { ahora: AHORA }).avisos.some((a) => /no escribe su estado/.test(a)), 'no ve la salud de la APK parada');
  const viva = { ...sano({ tablet: { grabando: true, burbuja: true, cuando: AHORA - 20000 } }), cuando: AHORA };
  eq(revisarParte({ j: 1, recibido: hace(1), d: viva }, { ahora: AHORA }).avisos.length, 0, 'avisa con la salud al día');
  ok(revisarParte({ j: 1, recibido: hace(1), d: sano({ datos: { fecha: null, de: null } }) }, { ahora: AHORA }).avisos.some((a) => /sin estadísticas/.test(a)), 'no ve la tablet sin datos');
  const captura = revisarParte({ j: 1, recibido: hace(1), d: sano({ lector: { lecturas: 50, fallosCaptura: 30, ultimoFallo: { cuando: 1, que: 'la APK no contesta' } } }) }, { ahora: AHORA });
  ok(captura.avisos.some((a) => /la APK no contesta/.test(a) && !/object/.test(a)), JSON.stringify(captura.avisos));
  ok(revisarParte({ j: 1, recibido: hace(1), d: sano({ lector: { lecturas: 0, lecturasSolo: 50, fallosCaptura: 30 } }) }, { ahora: AHORA }).avisos.some((a) => /30 de 50/.test(a)), 'no cuenta las capturas fallidas del modo solo');
});

test('lo que es ruido no es FALLO (3.74.5, con el primer parte de verdad): el fallo de Node de un arranque anterior y la tablet sin grabar', () => {
  const conFallo = (cuandoFallo, minutos = 45) => revisarParte({ j: 1, recibido: hace(1), d: { ...sano({ lector: { lecturas: 100, fallosCaptura: 0, minutos } }), cuando: AHORA, falloNodo: `${new Date(cuandoFallo).toISOString()} al arrancar: SyntaxError: Invalid regular expression` } }, { ahora: AHORA });
  // El de este arranque: FALLO.
  eq(conFallo(AHORA - 10 * 60000).fallos.length, 1, 'un error de este arranque no es FALLO');
  // Del arranque anterior, hace unas horas: aviso, no FALLO.
  const anterior = conFallo(AHORA - 3 * 3600000);
  ok(anterior.fallos.length === 0 && anterior.avisos.some((a) => /arranque anterior/.test(a)), JSON.stringify(anterior));
  // De hace días: nada.
  const viejo = conFallo(AHORA - (FALLO_ANTERIOR_H + 24) * 3600000);
  ok(viejo.fallos.length === 0 && viejo.avisos.length === 0, JSON.stringify(viejo));
  // Sin fecha legible, por si acaso: FALLO.
  eq(revisarParte({ j: 1, recibido: hace(1), d: { ...sano(), cuando: AHORA, falloNodo: 'algo raro' } }, { ahora: AHORA }).fallos.length, 1);
  // La tablet sin grabar: el modo solo lo intenta y lo registra, pero es el uso.
  const sinGrabar = revisarParte({ j: 1, recibido: hace(1), d: { ...sano(), errores: ['No se pudo hacer la captura: La tablet no está grabando la pantalla: abre la app del lector y toca «Empezar».'] } }, { ahora: AHORA });
  eq(sinGrabar.fallos.length, 0, 'la tablet sin grabar sale como FALLO');
  eq(revisarParte({ j: 1, recibido: hace(1), d: { ...sano(), errores: ['No se pudo hacer la captura: timeout'] } }, { ahora: AHORA }).fallos.length, 1, 'un fallo de captura de verdad no sale');
});

test('cuánto reconoce sola el resultado (3.75.0): aviso si pregunta más de la mitad, con partidas de sobra', () => {
  const con = (porTabla, porPregunta) => revisarParte({ j: 1, recibido: hace(1), d: sano({ partidas: { apuntadas: porTabla + porPregunta, sinSubir: 0, clave: true, porTabla, porPregunta } }) }, { ahora: AHORA }).avisos;
  ok(con(1, 4).some((a) => /1 de 5/.test(a)), 'no avisa con 4 de 5 preguntadas');
  eq(con(3, 2).length, 0, 'avisa con la mayoría reconocidas');
  eq(con(0, 4).length, 0, 'avisa con muy pocas partidas');
});

await terminar('scripts/revisar-tablet');
