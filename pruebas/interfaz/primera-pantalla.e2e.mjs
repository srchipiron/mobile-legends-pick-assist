/**
 * La tarjeta nº1 en la primera pantalla. Cada bloque nuevo encima de las
 * tarjetas la fue empujando: en 390×844 asomaba 156 px. Se mide en tres
 * fases del draft y tres tamaños; en 390×844 y 430×932 tiene que caber
 * ENTERA. En 360×640 no cabe (medido desde 1.38.0) y solo se apunta.
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
      await contexto.close();
    }
    console.log(`  ${ancho}×${alto}: ${salida.join(' · ')}`);
  });
}

await terminar('interfaz/primera-pantalla');
await navegador.close();
await cerrar();
