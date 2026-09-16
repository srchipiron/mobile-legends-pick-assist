/**
 * Con el móvil en inglés no se cuela español: «37/37 con datos» estaba
 * escrito a mano dentro de App.jsx y salía tal cual. Se recorren la fase de
 * picks, el consejo, los ajustes, las tres hojas y la fase de baneos. Las
 * novedades (CHANGELOG) van en español a propósito y quedan fuera.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const ESPANOL = /[áéíóúñ¿¡]|\b(de la|del|para|según|contra|con|sin|añadir|equipo|partida|baneo|banear|ajustes|cambiar|nuevo|buscar|cerrar|listo|gané|perdí|apuntar)\b/i;
const sospechosas = (txt) => [...new Set(txt.split('\n').map((s) => s.trim()).filter((s) => s && ESPANOL.test(s)))];

await prueba('la interfaz en inglés no enseña español', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    locale: 'en-US',
    almacen: {
      'roam-picker:linea': 'roam',
      'roam-picker:draft': { enemies: ['Layla', 'Fanny'], allies: ['Chou'], bans: ['Ling'], enemyRoam: null, fase: 'picks' },
      'roam-picker:mastery': { Khufra: { games: 40, winRate: 0.6 } },
    },
  });
  eq(await pagina.evaluate(() => document.documentElement.lang), 'en', 'el html no lleva lang=en');
  const fugas = [];
  const mirar = (txt, donde) => { for (const s of sospechosas(txt)) fugas.push(`[${donde}] ${s}`); };
  mirar(await pagina.locator('body').innerText(), 'picks');
  await pagina.locator('.equipo > summary').click(); await pagina.waitForTimeout(200);
  mirar(await pagina.locator('.equipo').innerText(), 'equipo');
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  mirar(await pagina.locator('.more').innerText(), 'ajustes');
  for (const [nombre, i] of [['maestria', 0], ['historial', 1], ['perfil', 2]]) {
    await pagina.locator('.more .tools .reset').nth(i).click(); await pagina.waitForTimeout(300);
    const d = pagina.locator('[role=dialog]').last();
    mirar(await d.innerText(), nombre);
    await pagina.keyboard.press('Escape'); await pagina.waitForTimeout(200);
  }
  await pagina.locator('.bans-resumen').click(); await pagina.waitForTimeout(300);
  mirar(await pagina.locator('body').innerText(), 'baneos');
  ok(!fugas.length, `español en la interfaz en inglés:\n    ${fugas.slice(0, 12).join('\n    ')}`);
  ok(!errores.length, `errores: ${errores}`);
  await contexto.close();
});

await terminar('interfaz/idioma');
await navegador.close();
await cerrar();
