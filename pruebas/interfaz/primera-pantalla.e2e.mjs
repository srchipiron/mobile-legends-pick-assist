/**
 * La tarjeta nº1 en la primera pantalla. Cada bloque nuevo encima de las
 * tarjetas la fue empujando: en 390×844 asomaba 156 px. Se mide en tres
 * fases del draft y tres tamaños; en 390×844 y 430×932 tiene que caber
 * ENTERA. En 360×640 no cabe (medido desde 1.38.0), pero desde 3.38.0
 * tiene que ASOMAR: estaba en 655–687 px de 640 (la composición con sus
 * «✓», «Leer solo» en la fila de botones y la nota de la estimación en dos
 * líneas) y bajó a 555–590.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const FASES = [
  { e: ['Layla'], a: [] },
  { e: ['Layla', 'Fanny', 'Pharsa'], a: ['Chou'] },
  { e: ['Layla', 'Fanny', 'Pharsa', 'Tigreal', 'Ling'], a: ['Chou', 'Miya', 'Kagura', 'Lukas'] },
];

for (const [ancho, alto] of [[360, 640], [390, 844], [430, 932]]) {
  await prueba(`la tarjeta nº1 en ${ancho}×${alto}`, async () => {
    const salida = [];
    for (const f of FASES) {
      const { contexto, pagina } = await paginaCon(navegador, url, {
        viewport: { width: ancho, height: alto },
        almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: f.e, allies: f.a, bans: ['Hirara'], enemyRoam: null, fase: 'picks' } },
      });
      await pagina.waitForTimeout(300);
      const r = await pagina.locator('.pick').first().evaluate((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
      salida.push(`${f.e.length}v${f.a.length}: top=${r.top} bottom=${r.bottom}`);
      if (alto >= 844) ok(r.bottom <= alto, `en ${ancho}×${alto} con ${f.e.length}v${f.a.length} la tarjeta nº1 no cabe entera (top ${r.top}, bottom ${r.bottom})`);
      else ok(r.top < alto, `en ${ancho}×${alto} con ${f.e.length}v${f.a.length} la tarjeta nº1 ni asoma (top ${r.top})`);
      // La composición dice lo que FALTA: un «✓» por cada cosa cubierta no dice nada y ocupa una fila.
      const comp = await pagina.locator('.comp').innerText().catch(() => '');
      ok(!comp.includes('✓'), `la composición pinta lo que sí está cubierto: ${comp}`);
      await contexto.close();
    }
    console.log(`  ${ancho}×${alto}: ${salida.join(' · ')}`);
  });
}

// «Para ti» (3.68.0): con 30 partidas o más con estimación sale tu número al
// lado del del modelo, en la MISMA línea: la nº1 tiene que seguir asomando.
await prueba('con tu historial sale «Para ti» y la nº1 sigue asomando en 360×640', async () => {
  const partidas = Array.from({ length: 40 }, (_, i) => ({ t: 1_700_000_000_000 + i * 3_600_000, pick: 'Tigreal', gane: i % 3 !== 0, estimacion: 0.5 + (i % 5) * 0.02, rango: 'glory' }));
  for (const f of FASES) {
    const { contexto, pagina } = await paginaCon(navegador, url, {
      viewport: { width: 360, height: 640 },
      almacen: { 'roam-picker:linea': 'roam', 'roam-picker:partidas': partidas, 'roam-picker:draft': { enemies: f.e, allies: f.a, bans: ['Hirara'], enemyRoam: null, fase: 'picks' } },
    });
    await pagina.waitForTimeout(300);
    const tuya = await pagina.locator('.estimacion-tuya').innerText().catch(() => '');
    ok(/Para ti: \d+%/.test(tuya), `con ${partidas.length} partidas no sale «Para ti»: «${tuya}»`);
    const r = await pagina.locator('.pick').first().evaluate((e) => Math.round(e.getBoundingClientRect().top));
    ok(r < 640, `con «Para ti» la nº1 ya no asoma en 360×640 (${f.e.length}v${f.a.length}, top ${r})`);
    await contexto.close();
  }
});

await terminar('interfaz/primera-pantalla');
await navegador.close();
await cerrar();
