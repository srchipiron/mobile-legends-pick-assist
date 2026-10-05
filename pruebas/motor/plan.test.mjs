/**
 * Pruebas de src/motor/plan.js: el plan de partida. Con un fixture
 * determinista: los nombres que salen en cada frase tienen que ser los que
 * dicen los datos (cruces, parejas, habilidades), y una frase sin dato
 * detrás no sale.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { planDePartida, amenazaDe, MAX_EQUIPO, MAX_ETAPA } from '../../src/motor/plan.js';
import { PENDIENTE_DE_HEROE } from '../../src/motor/fases.js';
import { indexarPorNombre } from '../../src/motor/nombres.js';
import { CRUCE_FUERTE, CRUCE_FUERTE_EN_CONTRA, PAREJA_DESTACABLE } from '../../src/motor/matrices.js';
import { prepararDatos, planear, recomendar } from '../../src/motor/draft.js';

const H = (name, tags = [], extra = {}) => ({ name, tags, ...extra });
const diggie = H('Diggie', ['peel', 'sustain', 'immobile'], { habilidades: [{ n: 'Reverse Time', e: ['cc'] }, { n: 'Time Journey', e: ['aliados', 'limpia'] }] });
const atlas = H('Atlas', ['tanky', 'engage', 'cc_chain'], { habilidades: [{ n: 'Perfect Match', e: ['cc'] }, { n: 'Fatal Links', e: ['area', 'cc'] }] });
const layla = H('Layla', ['hypercarry', 'immobile'], { damage: { fisico: 3, magico: 0, verdadero: 0 } });
const fanny = H('Fanny', ['dive', 'dash', 'burst'], { damage: { fisico: 3, magico: 0, verdadero: 0 } });
const lylia = H('Lylia', ['poke', 'burst'], { damage: { fisico: 0, magico: 3, verdadero: 0 } });
const mia = H('Miya', ['hypercarry', 'immobile'], { damage: { fisico: 3, magico: 0, verdadero: 0 } });
const gord = H('Gord', ['poke', 'burst'], { damage: { fisico: 0, magico: 3, verdadero: 0 } });

/** Cruces del enemigo contra los nuestros: la amenaza los lee del lado del enemigo. */
function meta({ counters = {}, synergies = {}, stats = {} } = {}) {
  return { counters: indexarPorNombre(counters, 2), synergies: indexarPorNombre(synergies, 2), stats: indexarPorNombre(stats), mediaDelRango: 0.5 };
}

test('focus: el enemigo blando que más os gana (fuerza + sus cruces contra los vuestros), nunca el tanque', () => {
  const enemigos = [atlas, fanny, lylia];
  const nos = [diggie, mia];
  // Lylia más fuerte por winrate, Fanny por cruces; Atlas el que más, pero tanque.
  const m = meta({
    stats: { Lylia: { winRate: 0.52 }, Fanny: { winRate: 0.50 }, Atlas: { winRate: 0.56 } },
    counters: { Fanny: { Diggie: 0.56, Miya: 0.56 }, Lylia: { Diggie: 0.50, Miya: 0.50 }, Atlas: { Diggie: 0.58, Miya: 0.58 } },
  });
  ok(amenazaDe(fanny, nos, m) > amenazaDe(lylia, nos, m), 'la amenaza no suma los cruces');
  const p = planDePartida({ yo: diggie, aliados: [mia], enemigos, meta: m });
  eq(p.equipo[0]?.clave, 'partida.focus');
  eq(p.equipo[0]?.params.e, 'Fanny', `el focus no es el que más os gana sin contar al tanque: ${JSON.stringify(p.equipo)}`);
  // Sin los cruces, manda la fuerza: Lylia.
  const sinCruces = planDePartida({ yo: diggie, aliados: [mia], enemigos, meta: meta({ stats: { Lylia: { winRate: 0.52 }, Fanny: { winRate: 0.50 } } }) });
  eq(sinCruces.equipo[0]?.params.e, 'Lylia');
  // Con un solo enemigo no hay a quién elegir.
  ok(!planDePartida({ yo: diggie, enemigos: [fanny], meta: m }).equipo.some((f) => f.clave === 'partida.focus'), 'focus con un solo enemigo');
});

test('habilidades: separarse del control en área del iniciador, guardar la limpieza para él, y nada sin el dato', () => {
  const m = meta();
  const p = planDePartida({ yo: diggie, aliados: [mia], enemigos: [atlas, lylia], meta: m });
  const sep = p.equipo.find((f) => f.clave === 'partida.separaos');
  eq(JSON.stringify(sep?.params), JSON.stringify({ e: 'Atlas', hab: 'Fatal Links' }));
  const guarda = p.tuyo.find((f) => f.clave.startsWith('partida.guardaLimpieza'));
  eq(guarda?.clave, 'partida.guardaLimpiezaAliados', 'la limpieza de Diggie es para los aliados');
  eq(JSON.stringify(guarda?.params), JSON.stringify({ hab: 'Time Journey', e: 'Atlas' }));
  // Sin habilidades (datos de antes de 3.36.0): ni separarse ni guardar nada.
  const sinDatos = planDePartida({ yo: { ...diggie, habilidades: undefined }, aliados: [mia], enemigos: [{ ...atlas, habilidades: undefined }, lylia], meta: m });
  ok(!sinDatos.equipo.some((f) => f.clave === 'partida.separaos') && !sinDatos.tuyo.some((f) => f.clave.startsWith('partida.guardaLimpieza')), JSON.stringify(sinDatos));
  // Sin nadie con control enfrente, no hay nada que guardar.
  ok(!planDePartida({ yo: diggie, enemigos: [lylia, layla], meta: m }).tuyo.some((f) => f.clave.startsWith('partida.guardaLimpieza')), 'guarda la limpieza sin control enemigo');
  // Una habilidad que solo limpia a uno mismo dice la otra frase.
  const valir = H('Valir', [], { habilidades: [{ n: 'Vengeance Flame', e: ['limpia'] }] });
  eq(planDePartida({ yo: valir, enemigos: [atlas, lylia], meta: m }).tuyo[0]?.clave, 'partida.guardaLimpieza');
  // Quien se vuelve intocable.
  const argus = H('Argus', [], { habilidades: [{ n: 'Eternal Evil', e: ['inmortal', 'limpia'] }] });
  ok(planDePartida({ yo: diggie, enemigos: [argus, lylia], meta: m }).equipo.some((f) => f.clave === 'partida.intocable' && f.params.hab === 'Eternal Evil'), 'no avisa del intocable');
});

test('tu peor y tu mejor cruce solo cuando son claros (p05/p95), y tu mejor pareja', () => {
  const eps = 1e-4;
  const con = (cf, cl) => planDePartida({ yo: diggie, aliados: [mia, layla], enemigos: [fanny, lylia], meta: meta({
    counters: { Diggie: { Fanny: cf, Lylia: cl } },
    synergies: { Diggie: { Miya: PAREJA_DESTACABLE + 0.01, Layla: PAREJA_DESTACABLE + 0.02 } },
  }) }).tuyo;
  const claves = (l) => l.map((f) => f.clave);
  ok(claves(con(CRUCE_FUERTE_EN_CONTRA - eps, 0.5)).includes('partida.evita'), 'no dice el peor cruce claro');
  ok(!claves(con(CRUCE_FUERTE_EN_CONTRA + eps, 0.5)).includes('partida.evita'), 'dice «evita» por un cruce que no es claro');
  ok(claves(con(0.5, CRUCE_FUERTE + eps)).includes('partida.buscaA'), 'no dice el mejor cruce claro');
  ok(!claves(con(0.5, CRUCE_FUERTE - eps)).includes('partida.buscaA'), 'dice «busca a» por un cruce que no es claro');
  eq(con(CRUCE_FUERTE_EN_CONTRA - eps, 0.5).find((f) => f.clave === 'partida.evita').params.e, 'Fanny');
  // Diggie protege (peel): con quien mejor combina de los que escalan, y
  // entonces la pareja no se repite.
  const t = con(0.5, 0.5);
  eq(t[0]?.clave, 'partida.quedateCon');
  eq(t[0]?.params.a, 'Layla', `se queda con quien no combina mejor: ${JSON.stringify(t)}`);
  ok(!t.some((f) => f.clave === 'partida.juegaCon' && f.params.a === 'Layla'), 'nombra la misma pareja dos veces');
  // A un asesino que salta no se le acompaña, aunque escale y combine mejor;
  // y el tirador inmóvil manda sobre la pareja.
  const asesino = H('Fanny2', ['assassin_late', 'dive', 'dash']);
  const conAsesino = planDePartida({ yo: diggie, aliados: [asesino, mia], enemigos: [fanny, lylia], meta: meta({ synergies: { Diggie: { Fanny2: 0.56, Miya: 0.50 } } }) }).tuyo;
  eq(conAsesino.find((f) => f.clave === 'partida.quedateCon')?.params.a, 'Miya', `se queda con el asesino: ${JSON.stringify(conAsesino)}`);
  const granger = H('Granger', ['hypercarry', 'dash']);
  const sinInmovil = planDePartida({ yo: diggie, aliados: [asesino, granger], enemigos: [fanny, lylia], meta: meta({ synergies: { Diggie: { Fanny2: 0.56, Granger: 0.50 } } }) }).tuyo;
  eq(sinInmovil.find((f) => f.clave === 'partida.quedateCon')?.params.a, 'Granger', `sin tirador inmóvil se queda con el asesino: ${JSON.stringify(sinInmovil)}`);
  const conAmbos = planDePartida({ yo: diggie, aliados: [granger, mia], enemigos: [fanny, lylia], meta: meta({ synergies: { Diggie: { Granger: 0.56, Miya: 0.50 } } }) }).tuyo;
  eq(conAmbos.find((f) => f.clave === 'partida.quedateCon')?.params.a, 'Miya', `el tirador inmóvil no manda sobre la pareja: ${JSON.stringify(conAmbos)}`);
});

test('equipo: escalado por diferencia, daño solo si es todo de un tipo, antisanación con dos curanderos, proteger al tirador', () => {
  const m = meta();
  const tres = (enemigos, aliados = [mia, layla]) => planDePartida({ yo: diggie, aliados, enemigos, meta: m }).equipo.map((f) => f.clave);
  // Relleno sin etiquetas ni daño, para completar equipos.
  const x = (n) => H(`X${n}`);
  const nosCinco = [mia, layla, x(1), x(2)];
  // El escalado solo con los dos equipos enteros (3.37.0): con picks tuyos por salir no se sabe.
  ok(tres([fanny, lylia, gord, x(3), x(4)], nosCinco).includes('partida.aguantad'), 'escaláis con dos más y no lo dice');
  ok(!tres([fanny, lylia, H('Kimmy', ['hypercarry']), x(3), x(4)], nosCinco).includes('partida.aguantad'), 'lo dice con uno de diferencia');
  ok(tres([layla, mia, H('Irithel', ['hypercarry']), x(3), x(4)], [fanny, lylia, x(1), x(2)]).includes('partida.cerradPronto'), 'ellos escalan con dos más y no lo dice');
  ok(!tres([layla, mia, H('Irithel', ['hypercarry']), x(3), x(4)], [fanny, lylia]).includes('partida.cerradPronto'), 'dice quién escala con dos picks tuyos por salir');
  // Todo de un daño: con cuatro enemigos o más.
  ok(tres([fanny, layla, mia, x(3)]).includes('partida.todoFisico'), 'todo físico y no lo dice');
  ok(!tres([fanny, layla, mia]).includes('partida.todoFisico'), 'dice todo físico con solo tres enemigos vistos');
  ok(!tres([fanny, layla, lylia, x(3)]).includes('partida.todoFisico'), 'dice todo físico con un mago');
  ok(tres([lylia, gord, H('Kagura', [], { damage: { fisico: 0, magico: 2, verdadero: 0 } }), x(3)]).includes('partida.todoMagico'), 'todo mágico y no lo dice');
  const cura = (n) => H(n, ['heal']);
  ok(tres([cura('Estes'), cura('Floryn'), lylia]).includes('partida.antisanacion'), 'dos curanderos y no lo dice');
  ok(!tres([cura('Estes'), lylia, gord]).includes('partida.antisanacion'), 'antisanación por un solo curandero');
  const prot = planDePartida({ yo: diggie, aliados: [layla], enemigos: [fanny, lylia], meta: m }).equipo.find((f) => f.clave === 'partida.protegedA');
  eq(JSON.stringify(prot?.params), JSON.stringify({ a: 'Layla', e: 'Fanny' }));
  // Un tirador que se mueve solo se protege solo.
  const granger = H('Granger', ['hypercarry', 'dash']);
  ok(!planDePartida({ yo: diggie, aliados: [granger], enemigos: [fanny, lylia], meta: m }).equipo.some((f) => f.clave === 'partida.protegedA'), 'proteger a un tirador que no es inmóvil');
});

test('sin héroe no hay plan, y nunca pasa del tope', () => {
  const vacio = planDePartida({ yo: null, enemigos: [fanny] });
  ok(!vacio.equipo.length && !vacio.tuyo.length && !vacio.problemas.length && vacio.fases === null && Object.values(vacio.etapas).every((e) => !e.length), JSON.stringify(vacio));
  const todo = planDePartida({ yo: diggie, aliados: [mia, layla], enemigos: [atlas, fanny, H('Estes', ['heal']), H('Floryn', ['heal']), H('Argus', [], { habilidades: [{ n: 'Eternal Evil', e: ['inmortal'] }] })], meta: meta() });
  ok(todo.equipo.length <= MAX_EQUIPO && todo.tuyo.length <= MAX_ETAPA * 4 && Object.values(todo.etapas).every((e) => e.length <= MAX_ETAPA), JSON.stringify(todo));
});

/** Unas fases de mentira con la forma de fases.js: tendencia, cambio y quién empuja a cada lado. */
function fasesDe({ tendencia = 'igual', ini = 0.5, fin = 0.5, cambio = null, nos = {}, ellos = {}, yo = null } = {}) {
  const puntos = [10, 12, 14, 16, 18, 20].map((desde, i) => ({ desde, hasta: desde < 20 ? desde + 2 : null, p: ini + ((fin - ini) * i) / 5 }));
  const fila = (h, pendiente) => ({ heroe: h, linea: 'roam', curva: pendiente < 0 ? [0.6, 0.58, 0.56, 0.54, 0.52, 0.5] : [0.45, 0.47, 0.49, 0.51, 0.53, 0.55], forma: [], pendiente });
  return {
    puntos, pBase: 0.5, tendencia, cambio,
    nos: { pronto: nos.pronto ? fila(nos.pronto, -1) : null, tarde: nos.tarde ? fila(nos.tarde, 1) : null, porHeroe: yo ? [fila(yo.h, yo.p)] : [] },
    ellos: {
      pronto: ellos.pronto ? fila(ellos.pronto, -1) : null, tarde: ellos.tarde ? fila(ellos.tarde, 1) : null,
      porHeroe: [...(ellos.pronto ? [fila(ellos.pronto, -1)] : []), ...(ellos.tarde ? [fila(ellos.tarde, 1)] : []), ...(ellos.otros ?? [])],
    },
  };
}

test('por etapas (3.43.0): tu héroe por fases, tu rival de línea, quién empuja en cada equipo y cuándo cambia la partida', () => {
  const m = meta({ counters: { Diggie: { Fanny: 0.53, Lylia: 0.47 } } });
  // Diggie de early (con su curva de verdad en el texto), Mia vuestra carta del final, Fanny la suya.
  const f = fasesDe({ tendencia: 'pronto', ini: 0.6, fin: 0.42, cambio: { minuto: 16, aFavor: false }, nos: { pronto: diggie, tarde: mia }, ellos: { pronto: lylia, tarde: fanny }, yo: { h: diggie, p: -PENDIENTE_DE_HEROE } });
  const p = planDePartida({ yo: diggie, aliados: [mia, gord], enemigos: [atlas, fanny, lylia], meta: m, fases: f, rival: fanny });
  const claves = (l) => l.map((x) => x.clave);
  ok(claves(p.etapas.temprano).includes('etapa.tuHeroePronto'), `tu héroe de early no sale: ${JSON.stringify(p.etapas)}`);
  eq(p.etapas.temprano.find((x) => x.clave === 'etapa.tuHeroePronto').params.ini, 60, 'el winrate de tu héroe en la partida corta no es el de su curva');
  eq(p.etapas.temprano.find((x) => x.clave === 'etapa.rivalGanas')?.params.e, 'Fanny', 'no dice que le ganas el cruce a tu rival de línea');
  ok(!claves(p.etapas.temprano).includes('etapa.aliadoPronto'), 'te manda ir contigo mismo al principio');
  eq(p.etapas.temprano.find((x) => x.clave === 'etapa.enemigoPronto')?.params.e, 'Lylia', 'no avisa de su héroe de early');
  eq(p.etapas.tarde.find((x) => x.clave === 'etapa.enemigoTarde')?.params.e, 'Fanny', 'no nombra su carta del final');
  eq(p.etapas.tarde.find((x) => x.clave === 'etapa.aliadoTarde')?.params.a, 'Miya', 'no nombra vuestra carta del final');
  eq(p.etapas.tarde.find((x) => x.clave === 'etapa.cambiaEnContra')?.params.min, 16, 'no dice en qué minuto pasan a ir por delante');
  // «Cerrad pronto» sale de la curva, no de las etiquetas (Miya escala y Fanny no, y aun así).
  ok(claves(p.equipo).includes('partida.cerradPronto') && !claves(p.equipo).includes('partida.aguantad'), `el equipo no lo dice la curva: ${JSON.stringify(p.equipo)}`);
  ok(claves(p.problemas).includes('problema.largaEnContra'), `no avisa de que la partida larga va en contra: ${JSON.stringify(p.problemas)}`);
  // El rival no sale dos veces (al principio y como «busca a»).
  ok(!p.etapas.medio.some((x) => x.params?.e === 'Fanny'), 'el rival de línea sale también en las peleas');
  ok(Object.values(p.etapas).every((e) => e.length <= MAX_ETAPA) && p.problemas.length <= MAX_ETAPA, 'una etapa pasa del tope');
  // Su héroe más de late es un tanque: «matadlo el primero» no se dice de él (contradiría el focus).
  const conTanque = fasesDe({ ellos: { tarde: fanny, otros: [{ heroe: atlas, linea: 'roam', curva: [0.4, 0.42, 0.45, 0.5, 0.55, 0.6], forma: [], pendiente: 3 }] } });
  const pt = planDePartida({ yo: diggie, aliados: [mia], enemigos: [atlas, fanny], meta: m, fases: conTanque });
  eq(pt.etapas.tarde.find((x) => x.clave === 'etapa.enemigoTarde')?.params.e, 'Fanny', `nombra a un tanque como su carta para matar primero: ${JSON.stringify(pt.etapas.tarde)}`);
  // Lo del equipo no se repite en los problemas.
  ok(!p.problemas.some((x) => x.clave.startsWith('partida.') && x.clave !== 'partida.evita'), `los problemas repiten lo del equipo: ${JSON.stringify(p.problemas)}`);
  // Contra Lylia pierdes el cruce: si es tu rival, juega seguro.
  const r2 = planDePartida({ yo: diggie, aliados: [mia], enemigos: [lylia], meta: m, fases: fasesDe(), rival: lylia });
  eq(r2.etapas.temprano.find((x) => x.clave === 'etapa.rivalPierdes')?.params.e, 'Lylia', 'no dice que tu rival te gana el cruce');
  // Sin tendencia, ni «cerrad» ni «aguantad», ni cambio, ni problema de fase.
  const llano = planDePartida({ yo: diggie, aliados: [mia, layla], enemigos: [atlas, fanny, lylia], meta: m, fases: fasesDe() });
  ok(!llano.equipo.some((x) => ['partida.cerradPronto', 'partida.aguantad'].includes(x.clave)) && !llano.problemas.some((x) => x.clave.startsWith('problema.')), `sin tendencia habla de fases: ${JSON.stringify(llano)}`);
  // De late con la partida corta en contra.
  const late = planDePartida({ yo: diggie, aliados: [mia, layla], enemigos: [atlas, fanny, lylia], meta: m, fases: fasesDe({ tendencia: 'tarde', ini: 0.44, fin: 0.58, yo: { h: diggie, p: PENDIENTE_DE_HEROE } }) });
  ok(late.equipo.some((x) => x.clave === 'partida.aguantad'), 'de late no dice «aguantad»');
  ok(late.problemas.some((x) => x.clave === 'problema.cortaEnContra' && x.params.p === 44), `no avisa de la partida corta en contra: ${JSON.stringify(late.problemas)}`);
  ok(late.etapas.temprano.some((x) => x.clave === 'etapa.tuHeroeTarde'), 'tu héroe de late no sale');
});

test('de punta a punta: las habilidades de la API llegan al catálogo fundido y al plan, y el plan no toca el ranking', () => {
  // El catálogo escrito a mano no lleva habilidades: vienen de roam-meta.json.
  const sinHab = (h) => ({ name: h.name, role: 'support', tags: h.tags, roam: true });
  const catalogo = { heroes: [sinHab(diggie), sinHab(atlas), sinHab(lylia), sinHab(mia)] };
  const api = [diggie, atlas, lylia, mia].map((h) => ({ name: h.name, lanes: ['roam'], ...(h.habilidades ? { habilidades: h.habilidades } : {}) }));
  const datos = prepararDatos({ catalogo, meta: { heroes: api, stats: {}, statsByRank: {}, counters: {}, synergies: {} } });
  const yo = datos.porNombre.get('Diggie');
  eq(yo?.habilidades?.length, 2, `el catálogo fundido pierde las habilidades: ${JSON.stringify(yo)}`);
  const enemigos = ['Atlas', 'Lylia'].map((n) => datos.porNombre.get(n));
  const p = planear(datos, { yo, aliados: [datos.porNombre.get('Miya')], enemigos });
  ok(p.tuyo.some((f) => f.clave === 'partida.guardaLimpiezaAliados'), JSON.stringify(p));
  const r = recomendar(datos, { linea: 'roam', enemigos, conSimulacion: false });
  ok(r.partida && Array.isArray(r.partida.equipo), 'recomendar no devuelve el plan del héroe elegido');
});

await terminar('motor/plan');
