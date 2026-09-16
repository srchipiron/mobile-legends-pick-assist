/**
 * Pruebas de src/motor/builds.js, que tiene dos mitades que NO valen lo
 * mismo: `buildsDe` es DATO (las builds más jugadas, ordenadas por USO,
 * nunca por winrate) y `ajustesDeBuild`/`ajusteDefensivo` son CONSEJO.
 * No sale de medir builds contra este draft -ese dato no existe-, sino de dos
 * hechos medidos (de qué pega cada enemigo, cuánta defensa da cada objeto)
 * más una regla evidente del juego, así que lo que hay que vigilar es dónde
 * pone el listón de «esta build ya lleva defensa».
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import {
  ajusteDefensivo, ajustesDeBuild, amenazaEnemiga, buildsDe, coberturaBuilds, conEfecto, mejoresDefensas,
  DESEQUILIBRIO, ENEMIGOS_PARA_HABLAR, TOPE_AVISOS,
} from '../../src/motor/builds.js';
import { LINEAS } from '../../src/motor/catalogo.js';
import { prepararDatos } from '../../src/motor/draft.js';
import { catalogo } from '../fixtures/catalogo.mjs';

test('revision linea a linea del motor: quince de armadura no son «ya lleva defensa»', () => {
  // 7. «Ya lleva defensa» es defensa COMPARABLE a la propuesta: con `> 0`,
  //    los 15 de armadura de Immortality callaban el aviso contra tres
  //    físicos (9 de 431 builds). El umbral es la mitad del mejor objeto
  //    propuesto.
  const fis = (n) => ({ name: n, damage: { fisico: 6, magico: 0 } });
  const equipment = { 1: { nombre: 'Blade Armor', fisica: 80 }, 2: { nombre: 'Immortality', fisica: 15 }, 3: { nombre: 'Hunter Strike' } };
  const enemigos = [fis('A'), fis('B'), fis('C'), fis('D'), fis('E')];
  const conImmortality = ajusteDefensivo({ objetos: [2, 3] }, equipment, enemigos);
  ok(conImmortality && conImmortality.lado === 'fisica', 'Immortality (15) calla el aviso de defensa física');
  eq(ajusteDefensivo({ objetos: [1, 3] }, equipment, enemigos), null, 'con Blade Armor sigue avisando');
});

test('las builds se ordenan por USO, no por winrate', () => {
  // Esto no es una preferencia estetica. El winrate de una build lleva dentro
  // a QUIEN la compra: el que se sale de la build normal suele ser el que mas
  // domina el heroe. Se ve en los datos de verdad -las builds del 3% de uso
  // salen por encima de las del 13%-, asi que ordenar por winrate seria
  // recomendar el sesgo del jugador como si fuera el objeto.
  const builds = {
    Paquito: {
      exp: [
        { objetos: [1, 2, 3], pickRate: 0.03, winRate: 0.60 },
        { objetos: [4, 5, 6], pickRate: 0.13, winRate: 0.56 },
      ],
    },
  };
  const lista = buildsDe(builds, { name: 'Paquito' }, 'exp');
  eq(lista[0].pickRate, 0.13, 'la primera build no es la mas jugada');
  ok(lista[0].winRate < lista[1].winRate, 'la prueba no esta midiendo lo que cree');
});

test('dos builds que se ven iguales en pantalla se juntan en una', () => {
  // La API separa builds que solo se diferencian en un talento del emblema, y
  // los talentos no se descargan: en pantalla salen los MISMOS tres objetos
  // dos veces con dos porcentajes distintos. Parece un fallo y ademas miente,
  // porque esa build se usa la suma de las dos.
  const builds = {
    Rafaela: {
      roam: [
        { objetos: [1, 2, 3], pickRate: 0.04, winRate: 0.60, emblema: 'Support', hechizo: 'Purify' },
        { objetos: [1, 2, 3], pickRate: 0.02, winRate: 0.66, emblema: 'Support', hechizo: 'Purify' },
        // Mismos objetos, OTRO hechizo: son dos builds distintas y la app las
        // ensena como tales. Juntarlas seria perder informacion de verdad.
        { objetos: [1, 2, 3], pickRate: 0.03, winRate: 0.55, emblema: 'Support', hechizo: 'Revitalize' },
      ],
    },
  };
  const lista = buildsDe(builds, { name: 'Rafaela' }, 'roam');
  eq(lista.length, 2, 'no se han juntado las dos builds indistinguibles');
  const [junta] = lista;
  ok(Math.abs(junta.pickRate - 0.06) < 1e-9, `el uso deberia sumarse: ${junta.pickRate}`);

  // Y el winrate junto, PONDERADO por uso: (0.60*0.04 + 0.66*0.02)/0.06.
  ok(Math.abs(junta.winRate - 0.62) < 1e-9,
    `el winrate junto deberia ir ponderado por uso, no promediado: ${junta.winRate}`);
  ok(lista.some((b) => b.hechizo === 'Revitalize'), 'se ha perdido la build del otro hechizo');
});

test('no se proponen objetos que ese jugador no puede comprar', () => {
  // Salio contra el sitio publicado, no aqui: a un ROAMER con tres enemigos de
  // control duro se le proponian las tres botas de JUNGLA. Mismo efecto y misma
  // defensa que las normales, y no puede comprarlas. El tipo lo trae la propia
  // API, asi que no hace falta ninguna lista escrita a mano.
  const equipment = {
    1: { nombre: 'Tough Boots', tipo: 'Movement', magica: 18, efectos: ['cortaControl'] },
    2: { nombre: "Ice Hunter's Tough Boots", tipo: 'Jungle', magica: 18, efectos: ['cortaControl'] },
    // A proposito: MAS defensa y un nombre que ordena ANTES que el universal.
    // Si la prueba no lo hiciera asi, pasaria por suerte del alfabeto aunque se
    // quitara la regla, que es como ya colaron dos invariantes en su dia.
    3: { nombre: 'Blessed Tough Boots', tipo: 'Roam', magica: 25, efectos: ['cortaControl'] },
    4: { nombre: "Athena's Shield", tipo: 'Defense', magica: 48 },
    5: { nombre: "Ice Hunter's Wings", tipo: 'Jungle', magica: 60 },
  };

  const paraRoam = conEfecto(equipment, 'cortaControl', 'roam').map((o) => o.nombre);
  ok(!paraRoam.some((n) => n.includes("Hunter's")), `a un roamer se le proponen objetos de jungla: ${paraRoam}`);
  const paraMid = conEfecto(equipment, 'cortaControl', 'mid').map((o) => o.nombre);
  eq(paraMid.length, 1, `a un mid se le proponen objetos de otra linea: ${paraMid}`);
  eq(paraMid[0], 'Tough Boots', 'el objeto universal deberia ser el primero');

  // Y el de linea propia sirve, pero DETRAS del universal: dice lo mismo y no
  // depende de la bendicion que lleves.
  eq(paraRoam[0], 'Tough Boots', `el primero para un roamer deberia ser el universal: ${paraRoam}`);
  ok(paraRoam.includes('Blessed Tough Boots'), 'las botas de roam deberian seguir valiendo para un roamer');

  // Lo mismo con la defensa: 60 de defensa magica no valen si no puedes
  // comprar el objeto.
  const def = mejoresDefensas(equipment, 'magica', 'roam').map((o) => o.nombre);
  ok(!def.includes("Ice Hunter's Wings"), `propone un objeto de jungla a un roamer: ${def}`);
  eq(def[0], "Athena's Shield", 'no manda el que mas defensa da de los que si puede comprar');
  const defJungla = mejoresDefensas(equipment, 'magica', 'jungle').map((o) => o.nombre);
  ok(defJungla.includes("Ice Hunter's Wings"), 'a un jungla si deberia proponerle el objeto de jungla');
  // Pero DETRAS del universal, aunque de mas defensa (60 contra 48): el objeto
  // de linea ata la build a esa bendicion y el universal dice lo mismo.
  eq(defJungla[0], "Athena's Shield", `el objeto de linea se ha colado delante: ${defJungla}`);

  // Y el aviso completo, con la linea puesta, no cuela ninguno.
  const mag = (n) => ({ name: n, damage: { fisico: 0, magico: 6 }, tags: [] });
  const avisos = ajustesDeBuild({ objetos: [] }, equipment, [mag('A'), mag('B')], 'roam');
  for (const a of avisos) {
    for (const o of a.objetos) ok(o.tipo !== 'Jungle', `el aviso propone ${o.nombre}, que es de jungla`);
  }
});

test('las builds se encuentran aunque el nombre se escriba distinto', () => {
  // El fallo invisible de siempre: la API escribe "X.Borg" y el catalogo
  // "X Borg". Sin normalizar, ese heroe se queda sin build y nadie se entera
  // porque la pantalla simplemente dice "todavia no hay builds".
  const builds = { 'X.Borg': { exp: [{ objetos: [1], pickRate: 0.2 }] } };
  eq(buildsDe(builds, { name: 'X Borg' }, 'exp').length, 1, 'no encuentra la build por nombre normalizado');
  eq(buildsDe(builds, 'X.Borg', 'exp').length, 1, 'no encuentra la build por la clave cruda');
  eq(buildsDe(builds, { name: 'Layla' }, 'exp').length, 0, 'se inventa una build de otro heroe');
  eq(buildsDe(builds, { name: 'X.Borg' }, 'roam').length, 0, 'devuelve la build de otra linea');
});

test('la amenaza enemiga se calla cuando no sabe y no reparte lo que no tiene', () => {
  const fis = (n) => ({ name: n, damage: { fisico: 6, magico: 0 } });
  const mag = (n) => ({ name: n, damage: { fisico: 0, magico: 6 } });
  const mix = (n) => ({ name: n, damage: { fisico: 5, magico: 5 } });
  const sin = (n) => ({ name: n });

  // Con un solo enemigo con dato no se puede decir de que pega el equipo.
  eq(amenazaEnemiga([mag('A')]), null, 'se moja con un solo enemigo');
  eq(amenazaEnemiga([]), null, 'se moja sin enemigos');

  // Un mixto amenaza por los dos lados: medio a cada uno.
  const m = amenazaEnemiga([mag('A'), mix('B')]);
  eq(m.magico, 1.5, 'el mixto no cuenta medio al lado magico');
  eq(m.fisico, 0.5, 'el mixto no cuenta medio al lado fisico');

  // Y los que no tienen dato NO se reparten a medias: eso seria inventarse la
  // mitad de la respuesta. Se cuentan aparte y ya.
  const s = amenazaEnemiga([mag('A'), mag('B'), sin('C')]);
  eq(s.cuotaMagica, 1, 'el heroe sin dato se ha colado en el reparto');
  eq(s.sinDato, 1, 'no se esta contando a quien falta el dato');
  eq(amenazaEnemiga([fis('A'), fis('B')]).cuotaMagica, 0, 'un equipo todo fisico no sale a 0 de cuota magica');
});

test('el ajuste defensivo solo habla cuando el desequilibrio es claro y falta el objeto', () => {
  const mag = (n) => ({ name: n, damage: { fisico: 0, magico: 6 } });
  const fis = (n) => ({ name: n, damage: { fisico: 6, magico: 0 } });
  const equipment = {
    1: { nombre: 'Blade Armor', fisica: 80 },
    2: { nombre: "Athena's Shield", magica: 48 },
    3: { nombre: 'Hunter Strike' },
    4: { nombre: 'Radiant Armor', magica: 40 },
  };
  const buildSinDefensa = { objetos: [3] };

  // 1. Equipo enemigo repartido: no hay nada que decir.
  eq(ajusteDefensivo(buildSinDefensa, equipment, [mag('A'), mag('B'), fis('C'), fis('D')]), null,
    'aconseja con el dano enemigo repartido');

  // 2. Cuatro de cinco magicos y la build sin defensa magica: ahi si.
  const a = ajusteDefensivo(buildSinDefensa, equipment, [mag('A'), mag('B'), mag('C'), mag('D'), fis('E')]);
  ok(a && a.lado === 'magica', 'no detecta un equipo enemigo mayoritariamente magico');
  ok(a.cuotaMagica >= DESEQUILIBRIO, 'ha hablado por debajo del umbral');

  // 3. Nunca propone un objeto del lado equivocado. Comprar Blade Armor contra
  //    un equipo magico es cambiar de objeto para nada.
  ok(a.alternativas.length, 'no propone ningun objeto');
  for (const o of a.alternativas) {
    ok((o.magica ?? 0) > 0, `propone ${o.nombre}, que no da defensa magica`);
    ok((o.magica ?? 0) >= (o.fisica ?? 0), `propone ${o.nombre}, que da mas defensa del otro lado`);
  }

  // 4. Si la build YA lleva defensa de ese lado, se calla. Una app que siempre
  //    tiene un consejo deja de leerse.
  eq(ajusteDefensivo({ objetos: [2, 3] }, equipment, [mag('A'), mag('B'), mag('C'), mag('D'), fis('E')]), null,
    'aconseja defensa magica a una build que ya lleva Athena');

  // 5. Sin enemigos con dato, silencio.
  eq(ajusteDefensivo(buildSinDefensa, equipment, [{ name: 'X' }]), null, 'aconseja sin datos de dano enemigo');
});

test('la build se adapta al draft, y se calla cuando ya lo cubre', () => {
  const mag = (n) => ({ name: n, damage: { fisico: 0, magico: 6 }, tags: [] });
  const cura = (n) => ({ name: n, damage: { fisico: 3, magico: 3 }, tags: ['heal'] });
  const control = (n) => ({ name: n, damage: { fisico: 3, magico: 3 }, tags: ['cc_hard'] });
  const equipment = {
    1: { nombre: "Athena's Shield", magica: 48 },
    2: { nombre: 'Sea Halberd', efectos: ['antiCuracion'] },
    3: { nombre: 'Tough Boots', magica: 18, efectos: ['cortaControl'] },
    4: { nombre: 'Hunter Strike' },
    5: { nombre: 'Dominance Ice', magica: 40, fisica: 40, efectos: ['antiCuracion'] },
  };

  // 1. Un enemigo que cura no es una composicion que cura: con uno, silencio.
  eq(ajustesDeBuild({ objetos: [4] }, equipment, [cura('A'), mag('B')])
    .filter((x) => x.clave === 'build.ajusteCuracion').length, 0,
  `habla de curacion con menos de ${ENEMIGOS_PARA_HABLAR} enemigos`);

  // 2. Con dos, lo dice y propone objetos que de verdad la cortan.
  const conCura = ajustesDeBuild({ objetos: [4] }, equipment, [cura('A'), cura('B'), mag('C')]);
  const aviso = conCura.find((x) => x.clave === 'build.ajusteCuracion');
  ok(aviso, 'no avisa contra dos enemigos que se curan');
  ok(aviso.objetos.every((o) => o.efectos.includes('antiCuracion')),
    'propone objetos que no cortan la curacion');
  ok(aviso.params.quien.includes('A'), 'no dice quien cura');

  // 3. Si la build YA lleva anti-curacion, se calla. Una app que siempre tiene
  //    un consejo deja de leerse.
  eq(ajustesDeBuild({ objetos: [2] }, equipment, [cura('A'), cura('B')])
    .filter((x) => x.clave === 'build.ajusteCuracion').length, 0,
  'avisa de curacion a una build que ya lleva Sea Halberd');

  // 4. Y como mucho TOPE_AVISOS, aunque el draft dispare las tres cosas.
  const todo = ajustesDeBuild({ objetos: [4] }, equipment, [
    { name: 'A', damage: { fisico: 0, magico: 6 }, tags: ['heal', 'cc_hard'] },
    { name: 'B', damage: { fisico: 0, magico: 6 }, tags: ['heal', 'cc_hard'] },
    { name: 'C', damage: { fisico: 0, magico: 6 }, tags: [] },
  ]);
  eq(todo.length, TOPE_AVISOS, `salen ${todo.length} avisos y el tope es ${TOPE_AVISOS}`);
  // Y manda el que mas mueve: la defensa son 40-80 puntos, no un efecto.
  eq(todo[0].clave, 'build.ajusteMagica', 'el aviso mas importante no va primero');

  // 5. Sin objetos que proponer no se abre la boca: un aviso sin salida es ruido.
  eq(ajustesDeBuild({ objetos: [4] }, { 4: { nombre: 'Hunter Strike' } }, [cura('A'), cura('B')]).length, 0,
    'avisa sin tener ningun objeto que proponer');
  eq(ajustesDeBuild({ objetos: [4] }, equipment, [control('A')]).length, 0, 'habla con un solo enemigo');

  // 6. Un heroe con tags DEDUCIDOS (no esta en el catalogo escrito a mano)
  //    cuenta menos: dos adivinados no bastan para abrir la boca. Es la misma
  //    regla que ya costo una version con Marcel, acumulando etiquetas dudosas
  //    hasta que parecian un hecho.
  const adivinado = (n) => ({ ...cura(n), inferred: true });
  eq(ajustesDeBuild({ objetos: [4] }, equipment, [adivinado('A'), adivinado('B')])
    .filter((x) => x.clave === 'build.ajusteCuracion').length, 0,
  'dos heroes con tags adivinados disparan el aviso ellos solos');
  ok(ajustesDeBuild({ objetos: [4] }, equipment, [cura('A'), adivinado('B'), adivinado('C')])
    .some((x) => x.clave === 'build.ajusteCuracion'),
  'uno seguro y dos adivinados deberian bastar');
});

test('lo que hace un objeto se lee de su texto, no de una lista escrita a mano', () => {
  const meta = leerJson('public/data/roam-meta.json');
  const objetos = Object.values(meta.equipment ?? {});
  if (!objetos.length) return;

  const porNombreObjeto = Object.fromEntries(objetos.map((o) => [o.nombre, o]));
  const tiene = (n, e) => porNombreObjeto[n]?.efectos?.includes(e);

  // Objetos de efecto público. Si la API cambia el formato del texto, esto se
  // entera: sin efectos, los avisos contra el draft enmudecen SIN fallar.
  ok(tiene('Sea Halberd', 'antiCuracion'), 'Sea Halberd sin efecto anti-curacion');
  ok(tiene('Dominance Ice', 'antiCuracion'), 'Dominance Ice sin efecto anti-curacion');
  ok(tiene('Tough Boots', 'cortaControl'), 'Tough Boots sin efecto de acortar control');
  ok(tiene('Winter Crown', 'cortaControl'), 'Winter Crown sin efecto de acortar control');
  ok(!tiene('Hunter Strike', 'antiCuracion'), 'Hunter Strike no corta curacion y sale como si');

  const conEfectos = objetos.filter((o) => o.efectos?.length).length;
  ok(conEfectos >= 5, `solo ${conEfectos} objetos con efecto leido: el texto ha cambiado de forma`);
});

test('la defensa de cada objeto sale del texto del juego, no de su categoria', () => {
  const meta = leerJson('public/data/roam-meta.json');
  const eq5 = meta.equipment ?? {};
  if (!Object.keys(eq5).length) return; // todavia sin datos de objetos

  const porNombre = Object.fromEntries(Object.values(eq5).map((o) => [o.nombre, o]));

  // Objetos de diseno publico, con su defensa conocida. Si la API cambia el
  // formato de `equiptips`, esto se entera: sin ellos el ajuste defensivo
  // seguiria funcionando en silencio SIN proponer nunca nada.
  ok((porNombre["Athena's Shield"]?.magica ?? 0) > 0, "Athena's Shield sin defensa magica");
  ok(!(porNombre["Athena's Shield"]?.fisica > 0), "Athena's Shield con defensa fisica");
  ok((porNombre['Blade Armor']?.fisica ?? 0) > 0, 'Blade Armor sin defensa fisica');
  ok(!(porNombre['Blade Armor']?.magica > 0), 'Blade Armor con defensa magica');
  ok((porNombre['Dominance Ice']?.magica ?? 0) > 0 && (porNombre['Dominance Ice']?.fisica ?? 0) > 0,
    'Dominance Ice deberia dar las dos defensas');

  // Y el caso que demuestra por que NO vale el tipo del objeto: Tough Boots
  // esta catalogado como "Movement" y da 18 de defensa magica.
  const tough = porNombre['Tough Boots'];
  if (tough) ok((tough.magica ?? 0) > 0, 'Tough Boots sin defensa magica: se esta mirando el tipo, no el texto');

  const conDefensa = Object.values(eq5).filter((o) => o.magica || o.fisica).length;
  ok(conDefensa >= 20, `solo ${conDefensa} objetos con defensa medida: el texto ha cambiado de forma`);
});

test('hay builds para los heroes que de verdad se recomiendan', () => {
  const meta = leerJson('public/data/roam-meta.json');
  if (!meta.builds || !Object.keys(meta.builds).length) return; // todavia sin builds

  // Lo que importa no es que el fichero tenga builds, sino que las tenga PARA
  // EL POOL DE CADA LINEA. Es el mismo fallo que costo la matriz de counters:
  // 34 heroes con datos de 133 y la app recomendando a ciegas.
  // (Los pools salen de prepararDatos, que es lo que monta la app de verdad.)
  const datos = prepararDatos({ catalogo, meta });
  for (const linea of LINEAS) {
    const pool = datos.poolsPorLinea[linea] ?? [];
    if (!pool.length) continue;
    const { total, con } = coberturaBuilds(pool, meta.builds, linea);
    ok(con / total >= 0.8, `${linea}: solo ${con} de ${total} heroes del pool tienen build`);
  }

  // Y las builds tienen que traer objetos que estemos en condiciones de
  // nombrar: un id sin nombre sale en pantalla como "#3009".
  const primera = buildsDe(meta.builds, { name: Object.keys(meta.builds)[0] },
    Object.keys(Object.values(meta.builds)[0])[0])[0];
  ok(primera?.objetos?.length, 'la primera build no trae objetos');
  for (const id of primera.objetos) {
    ok(meta.equipment?.[id]?.nombre, `el objeto ${id} no tiene nombre en el catalogo`);
  }
});

await terminar('motor/builds');
