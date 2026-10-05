/**
 * Lo que pasa al TOCAR (3.40.0), con «Leer solo» leyendo a la vez: los seis
 * fallos que encontró la auditoría de caminos de toque
 * (.claude/skills/click-path-audit) y se reprodujeron aquí antes de
 * arreglarlos. Cada uno funcionaba por separado; juntos, una lectura
 * deshacía lo tocado. El lector es falso (`page.route` sobre su puerto):
 * contesta al instante, así que los plazos no dependen de este ordenador.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const PUERTO = 47323;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
const leer = (p, k = 'roam-picker:draft') => p.evaluate((clave) => JSON.parse(localStorage.getItem(clave) ?? 'null'), k);
const fila = (n) => (n ? { nombre: n } : null);

/** Un lector falso: `respuesta()` da la lectura; con `puerta`, la respuesta espera a que se abra. */
const lectorFalso = (estado) => async (p) => {
  await p.route(`http://127.0.0.1:${PUERTO}/**`, async (ruta) => {
    const req = ruta.request();
    if (req.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: CORS });
    const camino = new URL(req.url()).pathname;
    if (camino === '/leer') {
      estado.lecturas = (estado.lecturas ?? 0) + 1;
      if (estado.puerta) await estado.puerta;
      return ruta.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ id: `lectura-${estado.lecturas}`, ...estado.respuesta() }) });
    }
    if (camino === '/corregir' && estado.corregir) {
      estado.corregidas = (estado.corregidas ?? 0) + 1;
      if (estado.puertaCorregir) await estado.puertaCorregir;
      return ruta.fulfill({ status: 200, headers: CORS, body: JSON.stringify(estado.corregir) });
    }
    if (camino === '/final') return ruta.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ desde: null, fotogramas: [] }) });
    return ruta.fulfill({ status: 200, headers: CORS, body: '{}' });
  });
};
const conLector = (draft, estado, extra = {}) => paginaCon(navegador, url, { almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': draft, 'roam-picker:lector-auto': true }, antes: lectorFalso(estado), ...extra });

await prueba('lo que quitas con la × no vuelve con la siguiente lectura (el lector sigue viéndolo en la tablet)', async () => {
  const e = { respuesta: () => ({ enemigos: [fila('Layla'), fila('Fanny')], tuyos: [], suyos: [], aliados: [] }) };
  const { contexto, pagina, errores } = await conLector({ enemies: [], allies: [], bans: [], fase: 'picks' }, e);
  let d = null;
  for (let i = 0; i < 40 && d?.enemies?.length !== 2; i++) { await pagina.waitForTimeout(250); d = await leer(pagina); }
  eq(d.enemies.join(), 'Layla,Fanny', 'la primera lectura no mete a los dos');
  await pagina.getByRole('button', { name: 'Quitar Fanny' }).click();
  const antes = e.lecturas;
  for (let i = 0; i < 60 && e.lecturas < antes + 2; i++) await pagina.waitForTimeout(250);
  ok(e.lecturas >= antes + 2, 'no hubo lecturas después de quitar');
  eq((await leer(pagina)).enemies.join(), 'Layla', 'el héroe quitado con la × vuelve con la lectura siguiente');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('tampoco vuelven un baneo ni un compañero quitados con la ×', async () => {
  // Baneos: en su fase (sin enemigos leídos no se pasa a picks).
  const eB = { respuesta: () => ({ enemigos: [], tuyos: [fila('Hirara'), fila('Atlas')], suyos: [], aliados: [] }) };
  const b = await conLector({ enemies: [], allies: [], bans: [], fase: 'baneos' }, eB);
  let d = null;
  for (let i = 0; i < 40 && d?.bans?.length !== 2; i++) { await b.pagina.waitForTimeout(250); d = await leer(b.pagina); }
  eq(d?.bans?.join(), 'Hirara,Atlas', 'la lectura no mete los dos baneos (la prueba no prueba nada)');
  await b.pagina.locator('button.x[aria-label="Quitar Hirara"]').click();
  let antes = eB.lecturas;
  for (let i = 0; i < 60 && eB.lecturas < antes + 2; i++) await b.pagina.waitForTimeout(250);
  eq((await leer(b.pagina)).bans.join(), 'Atlas', 'el baneo quitado con la × vuelve con la lectura siguiente');
  await b.contexto.close();
  // Compañeros.
  const eA = { respuesta: () => ({ enemigos: [fila('Layla')], tuyos: [], suyos: [], aliados: [fila('Khufra'), fila('Chou'), fila('Miya')], tuyoFila: 0 }) };
  const a = await conLector({ enemies: [], allies: [], bans: [], fase: 'picks' }, eA);
  d = null;
  for (let i = 0; i < 40 && d?.allies?.length !== 2; i++) { await a.pagina.waitForTimeout(250); d = await leer(a.pagina); }
  eq(d?.allies?.join(), 'Chou,Miya', 'la lectura no mete a los compañeros (la prueba no prueba nada)');
  await a.pagina.getByRole('button', { name: 'Quitar Chou' }).click();
  antes = eA.lecturas;
  for (let i = 0; i < 60 && eA.lecturas < antes + 2; i++) await a.pagina.waitForTimeout(250);
  eq((await leer(a.pagina)).allies.join(), 'Miya', 'el compañero quitado con la × vuelve con la lectura siguiente');
  await a.contexto.close();
});

await prueba('lo que deshaces de una lectura no lo vuelve a meter la siguiente', async () => {
  const e = { respuesta: () => ({ enemigos: [fila('Layla'), fila('Fanny')], tuyos: [], suyos: [], aliados: [] }) };
  const { contexto, pagina } = await conLector({ enemies: [], allies: [], bans: [], fase: 'picks' }, e);
  let d = null;
  for (let i = 0; i < 40 && d?.enemies?.length !== 2; i++) { await pagina.waitForTimeout(250); d = await leer(pagina); }
  eq(d?.enemies?.join(), 'Layla,Fanny', 'la lectura no mete a los dos (la prueba no prueba nada)');
  await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click();
  const antes = e.lecturas;
  // Con el draft vacío se lee cada 12 s (INTERVALO_AUTO_VACIO_MS): dos lecturas, hasta 40 s.
  for (let i = 0; i < 160 && e.lecturas < antes + 2; i++) await pagina.waitForTimeout(250);
  ok(e.lecturas >= antes + 2, 'no hubo lecturas después de deshacer');
  eq((await leer(pagina)).enemies.join(), '', 'lo deshecho vuelve a entrar con la lectura siguiente');
  await contexto.close();
});

await prueba('el pick que fijó el lector y sueltas a mano no se vuelve a fijar solo', async () => {
  const e = { respuesta: () => ({ enemigos: [fila('Layla')], tuyos: [], suyos: [], aliados: [fila('Khufra'), fila('Chou')], tuyoFila: 0 }) };
  const { contexto, pagina } = await conLector({ enemies: [], allies: [], bans: [], fase: 'picks' }, e);
  let d = null;
  for (let i = 0; i < 40 && d?.miPick !== 'Khufra'; i++) { await pagina.waitForTimeout(250); d = await leer(pagina); }
  eq(d?.miPick, 'Khufra', 'el lector no fija tu pick');
  await pagina.getByRole('button', { name: /Soltar a Khufra/ }).click();
  const antes = e.lecturas;
  for (let i = 0; i < 60 && e.lecturas < antes + 2; i++) await pagina.waitForTimeout(250);
  eq((await leer(pagina)).miPick ?? null, null, 'el pick soltado a mano se vuelve a fijar con la lectura siguiente');
  await contexto.close();
});

await prueba('el «Deshacer» de una × se va a su plazo aunque «Leer solo» siga leyendo', async () => {
  const e = { respuesta: () => ({ enemigos: [fila('Layla')], tuyos: [], suyos: [], aliados: [] }) };
  const { contexto, pagina } = await conLector({ enemies: ['Layla', 'Tigreal'], allies: [], bans: [], fase: 'picks' }, e);
  await pagina.waitForTimeout(800);
  await pagina.getByRole('button', { name: 'Quitar Tigreal' }).click();
  await pagina.waitForTimeout(1000);
  eq(await pagina.locator('.aviso-deshacer').count(), 1, 'la × no deja «Deshacer»');
  const antes = e.lecturas;
  await pagina.waitForTimeout(9000);
  ok(e.lecturas > antes, 'no hubo lecturas mientras se esperaba');
  eq(await pagina.locator('.aviso-deshacer').count(), 0, 'cada lectura vuelve a poner en marcha el plazo del «Deshacer»: no caduca nunca');
  await contexto.close();
});

await prueba('una lectura que llega con el selector de baneos abierto no lo cierra ni borra lo escrito', async () => {
  let abrirPuerta;
  const e = { puerta: new Promise((r) => { abrirPuerta = r; }), respuesta: () => ({ enemigos: [fila('Layla')], tuyos: [fila('Hirara')], suyos: [], aliados: [] }) };
  const { contexto, pagina } = await conLector({ enemies: [], allies: [], bans: ['Masha'], fase: 'baneos' }, e, { esperar: 'load' });
  for (let i = 0; i < 40 && !e.lecturas; i++) await pagina.waitForTimeout(100);
  await pagina.getByRole('button', { name: 'Buscar héroe para banear' }).click();
  await pagina.waitForTimeout(300);
  await pagina.locator('.sheet input').fill('ti');
  abrirPuerta(); e.puerta = null;
  await pagina.waitForTimeout(1500);
  eq((await leer(pagina)).fase, 'picks', 'la lectura con enemigos no pasa a picks (la prueba no prueba nada)');
  eq(await pagina.locator('.sheet').count(), 1, 'el selector abierto se cierra al llegar la lectura');
  eq(await pagina.locator('.sheet input').inputValue(), 'ti', 'se pierde lo escrito en el buscador');
  await contexto.close();
});

await prueba('una lectura que mete a alguien con el selector de picks abierto no mueve las caras', async () => {
  let abrirPuerta, objetivo = null;
  const e = { puerta: new Promise((r) => { abrirPuerta = r; }), respuesta: () => ({ enemigos: [], tuyos: [], suyos: [], aliados: [fila('Khufra'), fila(objetivo)], tuyoFila: 0 }) };
  const { contexto, pagina } = await conLector({ enemies: ['Layla'], allies: [], bans: [], fase: 'picks' }, e, { esperar: 'load' });
  await pagina.waitForTimeout(800);
  await pagina.locator('.side.enemy .slot.empty').first().click();
  await pagina.waitForTimeout(400);
  const nombres = () => pagina.locator('.hero-grid button .grid-nombre').allInnerTexts();
  const antes = await nombres();
  objetivo = antes[2];
  abrirPuerta(); e.puerta = null;
  await pagina.waitForTimeout(1500);
  ok((await leer(pagina)).allies.includes(objetivo), 'la lectura no mete al compañero (la prueba no prueba nada)');
  eq((await nombres()).join(), antes.join(), `las caras se mueven bajo el dedo: ${objetivo} cambia de sitio`);
  ok(await pagina.locator('.hero-grid button', { hasText: objetivo }).first().isDisabled(), `${objetivo}, ya compañero, se puede tocar como enemigo`);
  await contexto.close();
});

await prueba('con tu pick fijado fuera del ranking de tu línea, la pregunta y lo apuntado son tu pick, no el nº1', async () => {
  const draft = { enemies: ['Layla', 'Fanny', 'Tigreal'], allies: ['Chou'], bans: [], fase: 'picks', miPick: 'Khufra', miPickDesde: Date.now() - 11 * 60 * 1000 };
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { 'roam-picker:linea': 'exp', 'roam-picker:draft': draft } });
  await pagina.waitForTimeout(500);
  ok(/Khufra/.test(await pagina.locator('.recordatorio p').innerText()), `la pregunta no es por tu pick: ${await pagina.locator('.recordatorio p').innerText()}`);
  await pagina.locator('.recordatorio button.gane').click();
  await pagina.waitForTimeout(400);
  eq((await leer(pagina, 'roam-picker:partidas'))?.map((p) => p.pick).join(), 'Khufra', 'se apunta otro héroe que tu pick fijado');
  await contexto.close();
});

await prueba('las dudas del draft no las tapa una lectura de otra pantalla (carga, partida) que no reconoce a nadie', async () => {
  let enDraft = true;
  const e = { respuesta: () => (enDraft
    ? { enemigos: [fila('Layla')], tuyos: [], suyos: [{ nombre: null, candidato: 'Saber', parecido: 0.7 }], aliados: [] }
    : { enemigos: [{ nombre: null, candidato: 'Joy', parecido: 0.55 }], tuyos: [], suyos: [], aliados: [] }) };
  const { contexto, pagina } = await conLector({ enemies: [], allies: [], bans: [], fase: 'picks' }, e);
  let d = null;
  for (let i = 0; i < 40 && !d?.lectura?.dudas?.length; i++) { await pagina.waitForTimeout(250); d = await leer(pagina); }
  eq(d?.lectura?.dudas?.map((x) => x.candidato).join(), 'Saber', 'la lectura del draft no guarda su duda (la prueba no prueba nada)');
  enDraft = false;
  const antes = e.lecturas;
  for (let i = 0; i < 60 && e.lecturas < antes + 2; i++) await pagina.waitForTimeout(250);
  eq((await leer(pagina)).lectura?.dudas?.map((x) => x.candidato).join(), 'Saber', 'una pantalla sin nadie reconocido tapa las dudas del draft');
  await contexto.close();
});

await prueba('lo que el lector aprendió llega a SU draft, no al siguiente si entre tanto empezaste otro', async () => {
  const completo = { enemies: ['Layla', 'Fanny', 'Tigreal', 'Eudora', 'Chou'], allies: ['Khufra', 'Alice', 'Miya', 'Saber'], bans: [], fase: 'picks', completoDesde: Date.now() - 1000, lectura: { enemigos: ['Layla'], ids: ['lectura-1'] } };
  // Sin «Leer solo»: aquí solo importa la corrección. Con `load` y no
  // `networkidle`: la corrección retenida no deja la red quieta y la carga
  // esperaría a que caducara (20 s), con lo que no habría nada que probar.
  const sinAuto = (estado) => paginaCon(navegador, url, { almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': completo }, antes: lectorFalso(estado), esperar: 'load' });
  // Con el draft quieto, lo aprendido se queda en él.
  const quieto = { corregir: { aprendido: true, aprendidos: ['Fanny'], sinEncontrar: [] } };
  const a = await sinAuto(quieto);
  let d = null;
  for (let i = 0; i < 40 && !d?.lectura?.aprendizaje; i++) { await a.pagina.waitForTimeout(250); d = await leer(a.pagina); }
  eq(d?.lectura?.aprendizaje?.aprendidos?.join(), 'Fanny', 'lo aprendido no llega al draft corregido (la prueba no prueba nada)');
  await a.contexto.close();
  // Y si llega cuando ya hay otro draft, no se le pega.
  let abrir;
  const tarde = { corregir: { aprendido: true, aprendidos: ['Fanny'], sinEncontrar: [] }, puertaCorregir: new Promise((r) => { abrir = r; }) };
  const b = await sinAuto(tarde);
  for (let i = 0; i < 40 && !tarde.corregidas; i++) await b.pagina.waitForTimeout(250);
  ok(tarde.corregidas, 'no se pide la corrección');
  await b.pagina.getByRole('button', { name: 'Nuevo draft' }).click();
  abrir();
  await b.pagina.waitForTimeout(800);
  eq((await leer(b.pagina))?.lectura ?? null, null, 'lo aprendido en el draft anterior se pega al nuevo');
  await b.contexto.close();
});

await terminar('interfaz/toques');
await navegador.close();
await cerrar();
