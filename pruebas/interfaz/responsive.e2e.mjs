/**
 * La interfaz cabe en el ancho de la pantalla y todo lo que se toca mide
 * 32 px. Medido en 3.6.0 sobre doce tamaños (de 320×568 a 1920×1080, con
 * dos apaisados): lo que se salía era la fila de uso de la hoja «Meta» a
 * 320 y 360 px (+48 y +8 px) y la × del hueco enemigo a 320 (+1 px), y lo
 * que no llegaba a 32 px eran la ×, el ○ del rival y el pie. Aquí se
 * repite la medida en los cuatro tamaños donde fallaba o cambia el diseño
 * (teléfono estrecho, teléfono normal, tableta, apaisado), en las dos
 * fases del draft y con las hojas que más cosas meten en fila.
 */
import { servirDist, abrirNavegador, paginaCon, abrirAjustes, prueba, ok, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();

const DRAFT = {
  enemies: ['Layla', 'Fanny', 'Pharsa', 'Tigreal', 'Ling'],
  allies: ['Chou', 'Miya', 'Kagura', 'Popol and Kupa'],
  bans: ['Hirara', 'Ling', 'Eudora', 'Belerick', 'Paquito', 'Marcel', 'Gloo', 'Hanzo', 'Kaja', 'Melissa'],
  enemyRoam: null, fase: 'picks', miPick: 'Tigreal', miPickDesde: Date.now() - 11 * 60000,
};
const MASTERY = { Tigreal: { games: 300, winRate: 0.55 }, 'Popol and Kupa': { games: 50, winRate: 0.5 } };

const medir = (pagina) => pagina.evaluate(() => {
  const w = window.innerWidth;
  const visible = (el) => { const s = window.getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none'; };
  const nombre = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const fuera = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > w + 1 && visible(el)) fuera.push(`${nombre(el)}(+${Math.round(r.right - w)})`);
  }
  const pequenos = [];
  for (const b of document.querySelectorAll('button, [role=button], input')) {
    const r = b.getBoundingClientRect();
    if (r.width && r.height && (r.height < 32 || r.width < 32)) pequenos.push(`${nombre(b)}(${Math.round(r.width)}×${Math.round(r.height)})`);
  }
  const hoja = document.querySelector('.sheet');
  return {
    scroll: document.documentElement.scrollWidth, w,
    fuera: [...new Set(fuera)], pequenos: [...new Set(pequenos)],
    hoja: hoja ? { scroll: hoja.scrollWidth, ancho: hoja.clientWidth } : null,
  };
});

const comprobar = async (pagina, donde) => {
  const m = await medir(pagina);
  ok(m.scroll <= m.w, `${donde}: la página mide ${m.scroll} px en ${m.w}`);
  ok(m.fuera.length === 0, `${donde}: se sale por la derecha ${m.fuera.slice(0, 5).join(' ')}`);
  ok(!m.hoja || m.hoja.scroll <= m.hoja.ancho + 1, `${donde}: la hoja mide ${m.hoja?.scroll} px en ${m.hoja?.ancho}`);
  ok(m.pequenos.length === 0, `${donde}: por debajo de 32 px ${m.pequenos.slice(0, 5).join(' ')}`);
};

const cerrarHoja = async (pagina) => {
  for (let i = 0; i < 4 && (await pagina.locator('.sheet').count()); i++) { await pagina.keyboard.press('Escape'); await pagina.waitForTimeout(150); }
};

for (const [ancho, alto] of [[320, 568], [360, 640], [768, 1024], [640, 360]]) {
  await prueba(`nada se sale ni queda pequeño en ${ancho}×${alto}`, async () => {
    const almacen = { 'roam-picker:linea': 'roam', 'roam-picker:mastery': MASTERY, 'roam-picker:draft': DRAFT };
    const { contexto, pagina } = await paginaCon(navegador, url, { viewport: { width: ancho, height: alto }, almacen });
    await pagina.waitForTimeout(300);
    const tam = `${ancho}×${alto}`;
    await comprobar(pagina, `${tam} picks`);

    const hojas = {
      meta: async () => { await abrirAjustes(pagina); await pagina.locator('.more .tools .reset').nth(3).click(); },
      maestria: async () => { await abrirAjustes(pagina); await pagina.locator('.more .tools .reset').nth(0).click(); },
      builds: async () => pagina.locator('.pick-build').first().click(),
      apuntar: async () => pagina.getByRole('button', { name: 'Apuntar partida' }).click(),
    };
    for (const [nombre, abrir] of Object.entries(hojas)) {
      await abrir();
      await pagina.locator('.sheet').first().waitFor();
      await pagina.waitForTimeout(250);
      await comprobar(pagina, `${tam} hoja ${nombre}`);
      await cerrarHoja(pagina);
    }

    await pagina.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('roam-picker:draft'));
      d.fase = 'baneos';
      localStorage.setItem('roam-picker:draft', JSON.stringify(d));
    });
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.waitForTimeout(300);
    await comprobar(pagina, `${tam} baneos`);
    await pagina.getByRole('button', { name: 'Buscar héroe para banear' }).click();
    await pagina.locator('.sheet').first().waitFor();
    await pagina.waitForTimeout(250);
    await comprobar(pagina, `${tam} selector de baneos`);
    await contexto.close();
  });
}

await terminar('interfaz/responsive');
await navegador.close();
await cerrar();
