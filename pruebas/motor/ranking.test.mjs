/**
 * Pruebas de src/motor/ranking.js: el pool ordenado por probabilidad de
 * ganar, los motivos de cada tarjeta y el pick a ciegas. Sobre los datos
 * reales, montados como los monta la app (draft.js).
 */
import { test, ok, eq, leerJson, terminar, porNombre } from '../arnes.mjs';
import { catalogo, heroes, poolRoam, h, crearRnd } from '../fixtures/catalogo.mjs';
import { idMotivo, indexarPorNombre, nombreClave } from '../../src/motor/nombres.js';
import { esPickCiego, ordenarPicks, motivosDe, riesgoContrapick, empatados, MARGEN_EMPATE } from '../../src/motor/ranking.js';
import { evaluarDraft, terminoCruce, terminoPareja } from '../../src/motor/modelo.js';
import { cruce, densidadCounters } from '../../src/motor/matrices.js';
import { prepararDatos, contextoDe, poolDe } from '../../src/motor/draft.js';

test('los motivos se filtran antes de cortar a tres, y el pick a ciegas es un solo criterio', () => {
  eq(esPickCiego(0.7, 2), true, 'riesgo alto con dos vistos deberia ser a ciegas');
  eq(esPickCiego(0.7, 4), false, 'con cuatro vistos ya no es a ciegas');
  eq(esPickCiego(0.5, 1), false, 'riesgo bajo no es a ciegas');
  eq(esPickCiego(null, 0), false, 'sin riesgo no es a ciegas');

  // Fixture determinista (3.0): un motivo COMÚN a todo el pool y más pesado
  // que los propios (todos pierden con E0: «pierdeMatchup», 1.3) y tres
  // motivos propios por héroe (dos cruces ganados a 1.2, una pareja a 0.7),
  // repartidos para que ninguno pase del 60% del pool. Cortando a tres ANTES
  // de quitar el común, cada tarjeta se quedaría con dos. Está aquí porque
  // con el modelo de 2.0 los motivos comunes casi no existen en los datos
  // reales (medido: 0 de 30 drafts con la semilla de abajo, 1-4 de 30 con
  // otras, y solo «combinaCon»), así que el muestreo de más abajo ya no
  // caza esa mutación, que en 1.x acortaba 478 de 1.017 tarjetas.
  {
    const H = (name) => ({ name, tags: [] });
    const pool = Array.from({ length: 10 }, (_, i) => H(`P${i}`));
    const enemigos = Array.from({ length: 5 }, (_, j) => H(`E${j}`));
    const aliados = Array.from({ length: 4 }, (_, k) => H(`A${k}`));
    const counters = {}; const synergies = {};
    pool.forEach((p, i) => {
      counters[p.name] = { E0: 0.40, [`E${1 + (i % 4)}`]: 0.55, [`E${1 + ((i + 1) % 4)}`]: 0.55 };
      synergies[p.name] = { [`A${i % 4}`]: 0.52 };
    });
    const ranking = ordenarPicks(pool, { enemigos, aliados, meta: { stats: {}, counters: indexarPorNombre(counters, 2), synergies: indexarPorNombre(synergies, 2) } });
    eq(ranking.length, 10, 'el fixture tiene que rankear a los diez');
    for (const r of ranking) {
      ok(!r.motivos.some((m) => m.clave === 'regla.pierdeMatchup'), `${r.heroe.name} enseña el motivo común a todo el pool`);
      eq(r.motivos.length, 3, `${r.heroe.name} enseña ${r.motivos.length} motivos teniendo tres propios: se cortó antes de quitar el común`);
    }
  }

  // Sobre datos reales: ninguna tarjeta enseña menos de tres motivos teniendo
  // un cuarto propio disponible (antes pasaba en el 12% de las tarjetas).
  const meta = leerJson('public/data/roam-meta.json');
  if (!(meta.heroes ?? []).length) return;
  const datos = prepararDatos({ catalogo, meta });
  const todos = datos.heroes;
  const poolReal = poolDe(datos, 'roam');
  const rnd = crearRnd(21);
  let cortas = 0; let tarjetas = 0;
  for (let d = 0; d < 30; d++) {
    const u = new Set(); const coge = () => { let h; do { h = todos[Math.floor(rnd() * todos.length)]; } while (u.has(h.name)); u.add(h.name); return h; };
    const enemigos = [coge(), coge(), coge()]; const aliados = [coge(), coge()];
    const ctx = contextoDe(datos, { enemigos, aliados });
    const ranking = ordenarPicks(poolReal, ctx);
    // Los comunes, recalculados igual que el motor, sobre la lista COMPLETA.
    const completas = poolReal.filter((h) => !u.has(h.name)).map((h) => motivosDe(h, ctx));
    const frec = new Map(); for (const rs of completas) for (const k of new Set(rs.map(idMotivo))) frec.set(k, (frec.get(k) ?? 0) + 1);
    const comunes = new Set([...frec].filter(([, n]) => n > completas.length * 0.6).map(([k]) => k));
    for (const r of ranking) {
      const disponibles = motivosDe(r.heroe, ctx).filter((x) => !comunes.has(idMotivo(x))).length;
      const sinCiego = r.motivos.filter((x) => x.clave !== 'regla.arriesgadoCiego').length;
      tarjetas += 1;
      if (sinCiego < Math.min(3, disponibles) && !r.motivos.some((x) => x.clave === 'regla.arriesgadoCiego')) cortas += 1;
    }
  }
  eq(cortas, 0, `${cortas} de ${tarjetas} tarjetas ensenan menos motivos de los que tienen`);
});

test('ningún cruce pesa doble: el rival marcado no cambia el ranking, y los huecos por etiqueta no puntúan', () => {
  // Medido en 902 partidas pro (ajustar-modelo.mjs): el cruce de línea no
  // vale más que los otros veinte (−0.56 ± 0.62 frente a 0.78 ± 0.32) y los
  // huecos de composición por etiqueta valen 0.00 ± 0.07. Ni lo uno ni lo
  // otro entra en la nota; el rival sigue en el análisis y los huecos en la
  // composición, como información.
  const m = indexarPorNombre({ Khufra: { Fanny: 0.58, Layla: 0.42 }, Tigreal: { Fanny: 0.5, Layla: 0.5 } }, 2);
  const ctx = { enemigos: [h('Fanny'), h('Layla')], meta: { counters: m } };
  const neutro = ordenarPicks(poolRoam, ctx);
  const marcado = ordenarPicks(poolRoam, { ...ctx, rivalDeLinea: 'Fanny' });
  ok(neutro.every((r, i) => r.heroe.name === marcado[i].heroe.name && r.logOdds === marcado[i].logOdds), 'marcar al rival cambia la nota');
  // Con el mismo winrate y sin matrices, un tanque con cinco etiquetas y uno
  // con una valen lo mismo cuando el equipo ya tiene iniciador: no hay
  // término de composición.
  const solo = evaluarDraft({ yo: h('Tigreal'), aliados: [h('Layla')], meta: {} }).logOdds;
  const conOtroTanque = evaluarDraft({ yo: h('Tigreal'), aliados: [h('Layla'), h('Atlas')], meta: {} }).logOdds;
  ok(Number.isFinite(solo) && Number.isFinite(conOtroTanque), 'sin datos la nota no es un numero');
  ok(!('comp' in evaluarDraft({ yo: h('Tigreal'), aliados: [h('Layla')], meta: {} }).terminos), 'sigue habiendo un término de composición');
});

test('la maestría personal sube el puesto de un héroe', () => {
  const sin = ordenarPicks(poolRoam, { meta: {} });
  const con = ordenarPicks(poolRoam, { meta: {}, maestria: { Belerick: { games: 80, winRate: 0.62 } } });
  const puesto = (r) => r.findIndex((x) => x.heroe.name === 'Belerick');
  ok(puesto(con) < puesto(sin), 'llevarlo al 62% no mejora su puesto');
});

test('los héroes ya cogidos o baneados no se recomiendan', () => {
  const r = ordenarPicks(poolRoam, { baneos: [h('Khufra')], aliados: [h('Atlas')], meta: {} });
  ok(!r.some((x) => x.heroe.name === 'Khufra'), 'recomienda un héroe baneado');
  ok(!r.some((x) => x.heroe.name === 'Atlas'), 'recomienda un héroe ya cogido');
});

test('el orden es determinista ante empates', () => {
  const a = ordenarPicks(poolRoam, { meta: {} }).map((x) => x.heroe.name);
  const b = ordenarPicks([...poolRoam].reverse(), { meta: {} }).map((x) => x.heroe.name);
  ok(JSON.stringify(a) === JSON.stringify(b), 'el resultado depende del orden del catálogo');
});

test('la recomendación responde al equipo enemigo', () => {
  // Esta prueba EXIGIA que contra tres asesinos de dash el nº1 cortara dashes.
  // Se cambio en 1.5.0 y conviene saber por que, para no "arreglarla" de vuelta.
  //
  // Con la matriz de counters completa (17.556 cruces reales en vez de 1.330)
  // se puede medir la regla: los heroes con `anti_mobility` promedian 0.5042
  // contra los que tienen `dash`, y los demas 0.4999. Cuatro decimas de punto.
  // La regla es la MEJOR de las doce escritas a mano -las otras once no se ven
  // siquiera-, y aun asi no basta para mandar sobre el resto del motor.
  //
  // Aquella exigencia solo se cumplia porque el dato era escaso: sin winrate de
  // la pareja mandaban las reglas por tags, asi que la sensatez tactica se
  // apoyaba en un agujero, no en una decision. Ahora hay dato para todo.
  //
  // Lo que SI tiene que cumplirse, y es mas fuerte:
  //   1. cambiar el equipo enemigo cambia la recomendacion,
  //   2. el componente de counter ordena el pool igual que el dato real.
  const stats = indexarPorNombre(Object.fromEntries(
    heroes.map((x) => [x.name, { winRate: 0.497 + (porNombre(x.name) - 0.5) * 0.05, matches: 5000, pickRate: 0.02 }])));
  const counters = indexarPorNombre(Object.fromEntries(heroes.map((a) => [a.name,
    Object.fromEntries(heroes.filter((b) => b.name !== a.name)
      .map((b) => [b.name, 0.5 + (porNombre(`${a.name}|${b.name}`) - 0.5) * 0.12]))])), 2);
  const meta = { stats, counters, mediaDelRango: 0.497 };

  const ranking = (nombres) => ordenarPicks(poolRoam, { enemigos: nombres.map(h), meta });

  const unos = ranking(['Fanny', 'Ling', 'Lancelot']);
  const otros = ranking(['Esmeralda', 'Uranus', 'Thamuz']);
  ok(unos[0].heroe.name !== otros[0].heroe.name,
    'la recomendación no cambia entre dos composiciones enemigas opuestas');

  // Y que el counter ordene por el dato: quien mejor cruce tiene contra esos
  // tres tiene que puntuar mas alto en counter que quien peor lo tiene. Sin
  // esto, el componente podria estar leyendo cualquier cosa y nadie se
  // enteraria mientras el ranking siguiera moviendose.
  const enemigos = ['Fanny', 'Ling', 'Lancelot'].map(h);
  const cruceMedio = (nombre) => {
    const v = enemigos.map((e) => cruce(counters, nombre, e.name)).filter((x) => x != null);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  const porCounter = [...unos].sort((a, b) => b.terminos.cruces - a.terminos.cruces);
  ok(cruceMedio(porCounter[0].heroe.name) > cruceMedio(porCounter[porCounter.length - 1].heroe.name),
    'el componente de counter no ordena el pool como el dato real de los cruces');
});

test('ningún héroe acapara por acumular etiquetas', () => {
  // La patología que esto vigila: Carmilla cubría cinco necesidades sobre el
  // papel y salía nº1 en el 94% de los drafts. Para medir SOLO eso, todos los
  // héroes llevan el MISMO winrate: lo que quede de concentración sale de los
  // tags y de nada más. Sin sorteo de winrates, así que no depende de la suerte
  // de una semilla ni del orden del catálogo.
  //
  // Medido hoy: Chou 51%, Carmilla 33%, y 8 roamers distintos llegan a nº1
  // alguna vez. Con datos reales baja al 39%, porque el counter de cada pareja
  // mueve la recomendación de un draft a otro.
  const stats = indexarPorNombre(Object.fromEntries(
    heroes.map((x) => [x.name, { winRate: 0.50, matches: 5000 }])));
  const meta = { stats, mediaDelRango: 0.50 };
  const otros = heroes.filter((x) => !x.roam);

  const r = crearRnd(42);
  const pick = (arr, n) => {
    const c = [...arr];
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c.slice(0, n);
  };

  const cuenta = {};
  for (let i = 0; i < 600; i++) {
    const top = ordenarPicks(poolRoam, { enemigos: pick(otros, 3), aliados: pick(otros, 3), meta })[0].heroe.name;
    cuenta[top] = (cuenta[top] ?? 0) + 1;
  }
  const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  const cuota = orden[0][1] / 600;

  ok(cuota < 0.62,
    `${orden[0][0]} acapara el ${Math.round(cuota * 100)}% con winrates iguales: los tags mandan demasiado`);
  ok(orden.length >= 5,
    `solo ${orden.length} roamers distintos llegan a nº1: el pool está muerto`);
});

test('un winrate afortunado no convierte a nadie en respuesta única', () => {
  // Complementa a la de arriba con el caso realista: winrates distintos por
  // héroe. Aquí SÍ es normal que el que mejor winrate tiene salga mucho, así
  // que el umbral es flojo y solo caza un desastre.
  //
  // El winrate de cada uno sale de SU NOMBRE, no de su posición en el fichero.
  // Con el reparto por posición que había antes, ordenar heroes.json
  // alfabéticamente hacía fallar esta prueba sin tocar una línea del motor:
  // medía el orden del catálogo. Sobre 30 sorteos: media 63%, mediana 65%,
  // máximo 91%. De ahí el umbral flojo: la media real ronda ese 63%.
  const otros = heroes.filter((x) => !x.roam);
  const cuotas = [];

  for (let sorteo = 0; sorteo < 12; sorteo++) {
    const semillaSorteo = 1000 + sorteo * 77;
    const stats = indexarPorNombre(Object.fromEntries(
      heroes.map((x) => [x.name, { winRate: 0.497 + (porNombre(x.name, semillaSorteo) - 0.5) * 0.05, matches: 5000 }])));

    const r = crearRnd(semillaSorteo);
    const pick = (arr, n) => {
      const c = [...arr];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c.slice(0, n);
    };

    const cuenta = {};
    for (let i = 0; i < 100; i++) {
      const top = ordenarPicks(poolRoam, { enemigos: pick(otros, 3), aliados: pick(otros, 3), meta: { stats, mediaDelRango: 0.497 } })[0].heroe.name;
      cuenta[top] = (cuenta[top] ?? 0) + 1;
    }
    cuotas.push(Math.max(...Object.values(cuenta)) / 100);
  }

  const media = cuotas.reduce((a, b) => a + b, 0) / cuotas.length;
  ok(media < 0.75,
    `el líder acapara de media el ${Math.round(media * 100)}% (${cuotas.map((c) => Math.round(c * 100)).join(', ')})`);
});

test('contra dashes sube un anti-mobility; contra curación, un antiheal', () => {
  const vsFanny = ordenarPicks(poolRoam, { enemigos: [h('Fanny')], meta: {} }).slice(0, 8).map((x) => x.heroe.name);
  ok(vsFanny.some((n) => h(n).tags.includes('anti_mobility')),
    `sin anti-mobility en el top 8: ${vsFanny.join(', ')}`);
  const vsEsme = ordenarPicks(poolRoam, { enemigos: [h('Esmeralda')], meta: {} }).slice(0, 8).map((x) => x.heroe.name);
  ok(vsEsme.some((n) => h(n).tags.includes('antiheal')),
    `sin antiheal en el top 8: ${vsEsme.join(', ')}`);
});

test('las reglas por tags siguen mandando donde NO hay dato', () => {
  // Ahora que la matriz viene completa, las reglas escritas a mano no deciden
  // casi nunca. Su trabajo es otro: sostener a un heroe recien salido, del que
  // la API todavia no publica ni un cruce. Si eso se rompe, un heroe nuevo se
  // quedaria sin ninguna lectura tactica y nadie lo notaria.
  const stats = indexarPorNombre(Object.fromEntries(
    heroes.map((x) => [x.name, { winRate: 0.497 + (porNombre(x.name) - 0.5) * 0.05, matches: 5000 }])));
  const meta = { stats, counters: undefined, mediaDelRango: 0.497 };
  const top3 = (nombres) =>
    ordenarPicks(poolRoam, { enemigos: nombres.map(h), meta }).slice(0, 3).map((x) => x.heroe.name);

  const vsDashes = top3(['Fanny', 'Ling', 'Lancelot']);
  const vsCuracion = top3(['Esmeralda', 'Uranus', 'Thamuz']);
  ok(h(vsDashes[0]).tags.includes('anti_mobility'),
    `sin datos, contra tres asesinos móviles el nº1 debería frenar dashes: ${vsDashes.join(', ')}`);
  ok(h(vsCuracion[0]).tags.includes('antiheal'),
    `sin datos, contra tres héroes de curación el nº1 debería cortar curación: ${vsCuracion.join(', ')}`);
  ok(vsDashes[0] !== vsCuracion[0],
    'sin datos, la recomendación no cambia entre dos composiciones enemigas opuestas');
});

test('los empates técnicos se agrupan', () => {
  const e = empatados([{ p: 0.60 }, { p: 0.60 - MARGEN_EMPATE / 2 }, { p: 0.50 }]);
  ok(e.length === 2, `esperaba 2 empatados, hubo ${e.length}`);
});

test('el riesgo de contrapick y la densidad leen la matriz con nombres crudos', () => {
  // Con acceso crudo (fila[nombreClave(x)]) contra un segundo nivel sin
  // normalizar no acertaban ni un matchup: riesgoContrapick devolvia null para
  // los 34 roamers y el diagnostico anunciaba 0% de cobertura. Ambos deben
  // usar `buscar`.
  const rivales = poolRoam.slice(0, 12);
  const fila = Object.fromEntries(rivales.map((x, i) => [x.name, 0.40 + i * 0.01]));
  const matriz = indexarPorNombre({ [poolRoam[0].name]: fila }); // a proposito: solo nivel 1

  ok(riesgoContrapick(poolRoam[0], matriz, rivales) != null,
    'riesgoContrapick devuelve null: no encuentra los matchups');
  ok(densidadCounters([poolRoam[0]], matriz, rivales).cobertura > 0,
    'densidadCounters da 0%: no encuentra los matchups');
});

test('lo que sale de tags deducidos pesa menos que lo escrito a mano', () => {
  // Estuvo a punto de colarse: al deducir los tags de Marcel desde su
  // speciality salia con seis, disparaba mas reglas que nadie y era el nº1 en
  // el 69% de 300 drafts, contra el 43% del lider anterior. Es el mismo sesgo
  // por acumular etiquetas que ya costo una correccion con Carmilla.
  //
  // Se comprueban los DOS descuentos por separado: quitar solo uno dejaba la
  // prueba en verde y el sesgo a medio arreglar.
  const tags = ['peel', 'sustain', 'engage', 'tanky', 'zone', 'cc_hard'];
  const aMano = { name: 'AMano', role: 'support', tags, roam: true };
  const deducido = { ...aMano, name: 'Deducido', inferred: true };
  const enemigo = h('Fanny');

  // 1) reglas por tags (counter), sin matriz: todo el valor sale de los tags
  const cMano = terminoCruce(aMano, enemigo, null).valor;
  const cDed = terminoCruce(deducido, enemigo, null).valor;
  ok(cDed < cMano, `el counter por tags no se descuenta: ${cDed} vs ${cMano}`);

  // 2) parejas por tags, sin matriz
  const fragil = { name: 'F', tags: ['immobile', 'hypercarry', 'dive'], role: 'marksman' };
  const pMano = terminoPareja(aMano, fragil, undefined, 0.5).valor;
  const pDed = terminoPareja(deducido, fragil, undefined, 0.5).valor;
  ok(pMano > 0 && pDed < pMano, `la pareja por tags no se descuenta: ${pDed} vs ${pMano}`);

  // 3) y el efecto neto: baja en el ranking
  const conDeducido = [...catalogo.heroes.filter((x) => x.roam), deducido];
  const conDescuento = ordenarPicks(conDeducido, { enemigos: [enemigo], meta: {} })
    .findIndex((x) => x.heroe.name === 'Deducido');
  const sinDescuento = ordenarPicks(conDeducido.map((x) => (x.name === 'Deducido' ? { ...x, inferred: false } : x)),
    { enemigos: [enemigo], meta: {} }).findIndex((x) => x.heroe.name === 'Deducido');
  ok(conDescuento > sinDescuento,
    `deducido debería quedar por detrás (puesto ${conDescuento + 1} vs ${sinDescuento + 1})`);
});

test('lo que falta por salir cuenta como esperanza del cruce, ponderada por lo que se juega', () => {
  // Los enemigos que faltan no son desconocidos: van a salir por las líneas
  // abiertas y se sabe qué se juega ahí. Chou pierde contra lo POPULAR de la
  // mid y gana contra lo raro; en la media a secas queda igual que los
  // demás, en la esperanza por pickrate, por debajo.
  const otros = heroes.filter((x) => !x.roam);
  const counters = {};
  for (const rh of poolRoam) {
    counters[rh.name] = {};
    for (const e of otros) counters[rh.name][e.name] = rh.name === 'Chou' ? (otros.indexOf(e) % 2 === 0 ? 0.40 : 0.56) : 0.50;
  }
  const stats = indexarPorNombre(Object.fromEntries(heroes.map((x) => [x.name, { winRate: 0.5, pickRate: !x.roam && otros.indexOf(x) % 2 === 0 ? 0.05 : 0.005 }])));
  const meta = { counters: indexarPorNombre(counters, 2), stats, mediaDelRango: 0.5 };
  const puesto = (r) => r.findIndex((x) => x.heroe.name === 'Chou');
  // Un enemigo visto contra el que Chou GANA (indice impar): sin lineas
  // abiertas es el nº1; con la mid abierta y lo popular en contra, baja.
  const enemigo = otros.find((e, i) => i % 2 === 1);

  const sinAbiertas = ordenarPicks(poolRoam, { enemigos: [enemigo], meta, candidatos: heroes });
  eq(puesto(sinAbiertas), 0, `el fixture no vale: Chou deberia ser nº1 sin lineas abiertas y esta el ${puesto(sinAbiertas) + 1}`);
  const conAbiertas = ordenarPicks(poolRoam, { enemigos: [enemigo], meta, candidatos: heroes, lineasAbiertas: ['mid'], poolsPorLinea: { mid: otros } });
  const chou = conAbiertas.find((x) => x.heroe.name === 'Chou');
  ok(chou.terminos.porVer < -0.05, `la esperanza contra la mid abierta deberia ser negativa para Chou: ${chou.terminos.porVer}`);
  ok(puesto(conAbiertas) > puesto(sinAbiertas), `con la mid abierta Chou deberia bajar: ${puesto(sinAbiertas)} → ${puesto(conAbiertas)}`);
  ok(sinAbiertas.find((x) => x.heroe.name === 'Chou').terminos.porVer === 0, 'sin lineas abiertas no hay esperanza que sumar');
  // Y el que sale por la línea no cuenta dos veces: al completar el draft
  // desaparece el término y se queda solo el cruce real.
  const completo = ordenarPicks(poolRoam, { enemigos: [enemigo, otros[0]], meta, candidatos: heroes, lineasAbiertas: [], poolsPorLinea: { mid: otros } });
  ok(completo.every((x) => x.terminos.porVer === 0), 'con el draft cerrado sigue sumando esperanza');
});

test('los motivos que le salen a todo el pool no se muestran', () => {
  // "no hay primera línea" es cierto para los 34 roamers: la primera línea la
  // pone el propio roamer. Ocupaba las tres etiquetas de cada tarjeta.
  const res = ordenarPicks(poolRoam, {
    enemigos: ['Melissa', 'Argus', 'Saber'].map(h),
    aliados: ['Cecilion', 'Granger'].map(h),
    meta: { mediaDelRango: 0.5 },
  });

  const cuenta = new Map();
  for (const r of res) {
    // idMotivo y no el texto: desde que la app habla dos idiomas, los motivos
    // viajan como clave más parámetros y su identidad se arma con las dos.
    for (const t of new Set(r.motivos.map(idMotivo))) {
      cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    }
  }
  const ubicuos = [...cuenta.entries()].filter(([, n]) => n > res.length * 0.6);
  ok(!ubicuos.length, `motivos que le salen a casi todos: ${ubicuos.map(([t]) => t).join(', ')}`);
});

test('eligiendo pronto, el nº1 espera bien lo que se juega en las lineas abiertas', () => {
  // Lo que hace distinto elegir primero: los enemigos que faltan van a salir
  // por las lineas abiertas, y de cada una se sabe que se juega. El nº1 con
  // esas lineas abiertas tiene que cruzar mejor contra lo que se espera de
  // ellas que el nº1 elegido sin mirarlas.
  const stats = indexarPorNombre(Object.fromEntries(
    heroes.map((x) => [x.name, { winRate: 0.497 + (porNombre(x.name) - 0.5) * 0.05, matches: 5000 }])));
  // Cada heroe con SU amplitud: unos tienen cruces planos (dificiles de
  // castigar) y otros muy abiertos (castigables). Con la misma amplitud para
  // todos, el riesgo sale saturado e igual para el pool entero y no hay nada
  // que medir: la primera version de esta prueba fallaba por eso, no por el
  // motor.
  const amplitud = (n) => 0.03 + porNombre(`ancho:${n}`) * 0.17;
  const counters = indexarPorNombre(Object.fromEntries(heroes.map((a) => [a.name,
    Object.fromEntries(heroes.filter((b) => b.name !== a.name)
      .map((b) => [b.name, 0.5 + (porNombre(a.name + b.name) - 0.5) * amplitud(a.name)]))])), 2);
  const meta = { stats, counters, mediaDelRango: 0.497 };

  // Se compara el MISMO draft con y sin las lineas abiertas: con enemigos
  // distintos cambiaria el nº1 de todas formas.
  const otros = heroes.filter((x) => !x.roam);
  const conPick = indexarPorNombre(Object.fromEntries(heroes.map((x) => [x.name, { ...stats[nombreClave(x.name)], pickRate: 0.005 + porNombre(`pr:${x.name}`) * 0.05 }])));
  const abiertas = { lineasAbiertas: ['mid', 'gold'], poolsPorLinea: { mid: otros.slice(0, 40), gold: otros.slice(40, 80) } };
  const esperado = (heroe) => evaluarDraft({ yo: heroe, enemigos: [h('Fanny')], meta: { ...meta, stats: conPick }, ...abiertas }).terminos.porVer;
  const sinMirar = ordenarPicks(poolRoam, { enemigos: [h('Fanny')], meta: { ...meta, stats: conPick } })[0].heroe;
  const mirando = ordenarPicks(poolRoam, { enemigos: [h('Fanny')], meta: { ...meta, stats: conPick }, ...abiertas })[0].heroe;
  ok(esperado(mirando) >= esperado(sinMirar), `mirando las lineas abiertas el nº1 espera peor cruce: ${esperado(mirando).toFixed(3)} vs ${esperado(sinMirar).toFixed(3)}`);
  const todos = ordenarPicks(poolRoam, { enemigos: [h('Fanny')], meta: { ...meta, stats: conPick }, ...abiertas });
  ok(todos.some((x) => x.terminos.porVer !== 0), 'la esperanza contra las lineas abiertas es cero para todo el pool: no se esta calculando');

  // Y con el draft completo no queda nada por ver.
  const completo = ['Fanny', 'Ling', 'Lancelot', 'Gusion', 'Hayabusa'].map(h);
  const cerrado = ordenarPicks(poolRoam, { enemigos: completo, meta: { ...meta, stats: conPick }, lineasAbiertas: [], poolsPorLinea: abiertas.poolsPorLinea });
  ok(cerrado.every((x) => x.terminos.porVer === 0), 'con los cinco enemigos elegidos sigue esperando algo');
});

await terminar('motor/ranking');
