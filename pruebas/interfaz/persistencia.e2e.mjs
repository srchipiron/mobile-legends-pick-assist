/**
 * Que lo tuyo se GUARDE de verdad. Las demás pruebas de navegador siembran el
 * almacén y comprueban que la app lo lee; aquí se comprueba el camino
 * contrario, que es el que puede costar caro: la maestría escrita a mano son
 * miles de partidas de tu historial y no se pueden volver a teclear.
 *
 * Cubre lo que nadie vigilaba: que el editor de maestría escriba su clave,
 * que el perfil viaje de un dispositivo a otro fundiéndose, y que el rango y
 * el idioma sobrevivan a una recarga.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, abrirAjustes } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const LINEA = { 'roam-picker:linea': 'roam' };
const PICKS = { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' };
const leer = (pagina, clave) => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);
const abrirHoja = async (pagina, i) => {
  await abrirAjustes(pagina);
  await pagina.locator('.more .tools .reset').nth(i).click(); await pagina.waitForTimeout(400);
};

await prueba('el editor de maestría escribe roam-picker:mastery y el motor la usa', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': PICKS } });
  eq(await leer(pagina, 'roam-picker:mastery'), null, 'ya había maestría guardada');
  await abrirHoja(pagina, 0);
  const fila = pagina.locator('.mastery-row:not(.head)').first();
  const heroe = (await fila.locator('span').first().textContent()).trim();
  await fila.locator('input').nth(0).fill('380');
  // Con coma, que es lo que pone el teclado español: `Number()` la rechaza.
  await fila.locator('input').nth(1).fill('57,5');
  await pagina.getByRole('button', { name: 'Guardar' }).click(); await pagina.waitForTimeout(400);
  const guardada = await leer(pagina, 'roam-picker:mastery');
  ok(guardada && guardada[heroe], `no se guardó la maestría de ${heroe}: ${JSON.stringify(guardada)}`);
  eq(guardada[heroe].games, 380, 'las partidas no se guardaron');
  ok(Math.abs(guardada[heroe].winRate - 0.575) < 1e-9, `el winrate se guardó como ${guardada[heroe].winRate}, no 0.575 (¿la coma?)`);
  // Y sobrevive a la recarga, que es lo que de verdad importa.
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(600);
  eq((await leer(pagina, 'roam-picker:mastery'))[heroe].games, 380, 'la maestría no sobrevive a una recarga');
  // Y el motor la aplica: el diagnóstico lo dice con el héroe y su puesto.
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Diagnóstico' }).click(); await pagina.waitForTimeout(2500);
  const texto = await pagina.locator('.sheet pre').first().innerText();
  ok(/Tu maestría se está aplicando/.test(texto), `el diagnóstico no dice que la maestría se aplique:\n${texto.split('\n').filter((l) => /MAESTR|maestr/i.test(l)).join('\n')}`);
  ok(new RegExp(`Ejemplo: ${heroe}`).test(texto), `el diagnóstico no usa ${heroe} de ejemplo`);
  ok(!errores.length, `errores: ${errores}`);
  await contexto.close();
});

await prueba('el perfil viaja a otro dispositivo y se funde sin borrar nada', async () => {
  // Dispositivo A: maestría y una partida apuntada.
  const a = await paginaCon(navegador, url, {
    almacen: {
      ...LINEA, 'roam-picker:draft': PICKS,
      'roam-picker:mastery': { Diggie: { games: 3821, winRate: 0.55 }, Tigreal: { games: 200, winRate: 0.5 } },
      'roam-picker:partidas': [{ t: 1000, pick: 'Diggie', gane: true, recomendados: ['Diggie'], rango: 'glory' }],
    },
  });
  await abrirHoja(a.pagina, 2);
  const codigo = await a.pagina.locator('textarea.codigo').first().inputValue();
  ok(codigo.startsWith('MLPA1.') && codigo.length > 80, `el código exportado no tiene la pinta esperada: ${codigo.slice(0, 40)}…`);
  await a.contexto.close();

  // Dispositivo B: otra maestría, con MENOS partidas en un héroe y más en otro.
  const b = await paginaCon(navegador, url, {
    almacen: {
      ...LINEA, 'roam-picker:draft': PICKS,
      'roam-picker:mastery': { Diggie: { games: 10, winRate: 0.9 }, Franco: { games: 500, winRate: 0.52 } },
      'roam-picker:partidas': [{ t: 2000, pick: 'Franco', gane: false, recomendados: [], rango: 'glory' }],
    },
  });
  await abrirHoja(b.pagina, 2);
  await b.pagina.locator('textarea.codigo').nth(1).fill(codigo);
  await b.pagina.getByRole('button', { name: 'Traer esos datos' }).click(); await b.pagina.waitForTimeout(600);
  const m = await leer(b.pagina, 'roam-picker:mastery');
  const p = await leer(b.pagina, 'roam-picker:partidas');
  eq(m.Diggie.games, 3821, 'de cada héroe no gana la copia con MÁS partidas');
  eq(m.Franco.games, 500, 'se ha perdido un héroe que solo estaba en este dispositivo');
  eq(m.Tigreal.games, 200, 'no ha llegado un héroe que solo estaba en el otro');
  eq(p.length, 2, `las partidas no se han juntado sin duplicar: ${JSON.stringify(p)}`);
  // Y persiste: si solo estuviera en memoria, al recargar se perdería.
  await b.pagina.reload({ waitUntil: 'networkidle' }); await b.pagina.waitForTimeout(600);
  eq((await leer(b.pagina, 'roam-picker:mastery')).Diggie.games, 3821, 'lo importado no sobrevive a una recarga');
  ok(!b.errores.length, `errores: ${b.errores}`);
  await b.contexto.close();
});

await prueba('el rango y el idioma se recuerdan', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': PICKS } });
  await abrirAjustes(pagina);
  const rangos = pagina.locator('.rank-picker button');
  const otro = await rangos.first().textContent();
  await rangos.first().click(); await pagina.waitForTimeout(300);
  eq((await leer(pagina, 'roam-picker:rank')).toLowerCase(), otro.trim().toLowerCase(), 'el rango elegido no se guarda');
  await pagina.locator('.aviso .idiomas button', { hasText: 'EN' }).first().click(); await pagina.waitForTimeout(400);
  eq(await leer(pagina, 'roam-picker:idioma'), 'en', 'el idioma elegido no se guarda');
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(600);
  eq(await pagina.evaluate(() => document.documentElement.lang), 'en', 'el idioma no sobrevive a una recarga');
  eq((await leer(pagina, 'roam-picker:rank')).toLowerCase(), otro.trim().toLowerCase(), 'el rango no sobrevive a una recarga');
  ok(!errores.length, `errores: ${errores}`);
  await contexto.close();
});

await terminar('interfaz/persistencia');
await navegador.close();
await cerrar();
