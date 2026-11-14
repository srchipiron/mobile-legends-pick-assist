/**
 * La API simulada de la ingesta: un OpenAPI con las rutas de verdad y la
 * FORMA real de cada respuesta (rank `data.records[].data.main_hero…`,
 * positions con `roadsort/sortid`, ficha con `head` por el proxy wsrv.nl,
 * counters `data.sub_hero[]`, objetos, emblemas, builds, timeline, mlbb.gg e
 * imágenes por cabecera). Cada fallo se enciende en `f` (los contadores
 * cuentan hacia abajo) y lo que ya falló una vez queda en `e`.
 *
 * Incluye `/api/user/heroes/{hero_id}/counters`, que da MÁS pares que
 * ninguna: la ingesta no puede llamarla (la cuenta de Javi vale dinero).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

/** Como sirve la API las imágenes: por el proxy wsrv.nl. */
export const proxy = (url) => `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
/** Larga a propósito: la huella del texto solo cuenta cadenas de ≥ 40 caracteres sin cifras ni espacios. */
export const DESCRIPCION = 'Deals 300 <font color="x">Magic Damage</font> to enemies in a line and slows them by 40% for 1.5 seconds, then heals allies';
export const HEROES = [
  { id: 1, name: 'Atlas', linea: 'Roam', rol: 'Tank' },
  { id: 2, name: 'Khufra', linea: 'Roam', rol: 'Tank' },
  { id: 3, name: 'Tigreal', linea: 'Roam', rol: 'Tank' },
];
const imagen = (firma, n = 300, relleno = 0) => Buffer.concat([firma, Buffer.alloc(n, relleno)]);
export const PNG = imagen(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
export const JPG = imagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
/** El retrato rehecho: otra URL y otros bytes para el mismo héroe. */
export const JPG2 = imagen(Buffer.from([0xff, 0xd8, 0xff, 0xe1]), 400, 7);
/** Los que reciben respuestas VACÍAS (no errores) en la primera o la segunda pasada. */
export const SIN_PAREJAS = ['Ruby', 'Terizla', 'Uranus', 'Yve', 'Zilong'];
export const SIN_CRUCES = ['Vexana', 'Wanwan', 'Xavier', 'Yin', 'Yu Zhong'];

const FALLOS = {
  fallaCounters: false, fallaRecientes: false, fallaDetail: false, fallaEquipoLargo: false, fallaEquipoCorto: false,
  fallaMitico: false, parejasVacias: false, curvaEnPorcentaje: false, kitSinControl: false, academyVacia: false,
  gloriaRuidosa: false, miticoAMedias: false, miticoCaido: false, gloriaCaida: false, parejasVaciasActivas: false, retratoNuevo: false,
  // Un héroe cuya ruta de líneas y builds falla, y un desplazamiento para distinguir lo de hoy de lo conservado.
  fallaLineaDe: null, desplazaLinea: 0,
  // Contadores: fallan las N primeras peticiones.
  fallaGloriaVeces: 0, academyFallaAlMedir: 0, fallosCountersPendientes: 0, fallarPrimeros: 0,
};

/** `signo` −1: los cruces de Gloria «ruidosos» tras un reinicio, lo contrario de los de Mítico. */
const pares = (n, signo = 1) => ({ data: { sub_hero: [
  { hero_name: 'Khufra', increase_win_rate: 0.0123 }, { hero_name: 'Tigreal', increase_win_rate: -0.02 },
  { hero_name: 'Alice', increase_win_rate: 0.01 }, { hero_name: 'Layla', increase_win_rate: 0.03 },
].slice(0, n).map((p) => ({ ...p, increase_win_rate: signo * p.increase_win_rate })) } });
const parametros = (...n) => ({ get: { parameters: n.map((name) => ({ name, in: 'query' })) } });
const ESQUEMA = { paths: {
  '/api/heroes/hero-rank/': parametros('rank', 'days', 'size', 'index'),
  '/api/heroes/hero-position/': parametros('size', 'index'),
  '/api/heroes/{hero_id}/': parametros('lang'),
  '/api/heroes/{hero_id}/counters': parametros('rank', 'days', 'size', 'index'),
  '/api/academy/heroes/{hero_id}/counters': parametros('rank', 'days', 'size', 'index'),
  '/api/heroes/{hero_id}/compatibility': parametros('rank', 'days', 'size', 'index'),
  '/api/equipment/expanded': parametros('size', 'index', 'lang'),
  '/api/equipment': parametros('size', 'index', 'lang'),
  '/api/heroes/{hero_id}/builds': parametros('lane', 'rank', 'size', 'index'),
  '/api/academy/emblems': parametros('size', 'index', 'lang'),
  '/api/academy/heroes/{hero_id}/win-rate/timeline': parametros('lane', 'rank', 'size', 'index'),
  '/api/user/heroes/{hero_id}/counters': parametros('rank', 'days', 'size', 'index'),
} };

/**
 * Levanta la API en `puerto` (0: uno libre). Devuelve `{ puerto, base, tiers,
 * golpes, f, e, cerrar }`: `golpes` cuenta las peticiones por recurso.
 */
export async function levantarApiSimulada({ puerto = 0 } = {}) {
  const golpes = {};
  const f = { ...FALLOS };
  const e = {
    fallaronYa: new Set(), sinParejas: new Set(), crucesPedidos: new Map(), pedidosSinCruces: new Map(),
    miticoYaCaido: new Map(), gloriaYaCaida: new Set(), miticosServidos: 0,
  };
  const heroeDe = (ruta, i) => decodeURIComponent(ruta.split('/')[i]);
  const deGloria = (u) => u.searchParams.get('rank') === 'glory';
  const cuenta = (m, h) => { m.set(h, (m.get(h) ?? 0) + 1); return m.get(h); };
  // Los `fallarPrimeros` héroes de Gloria (menos Atlas, el del sondeo de rutas) dan 500 la PRIMERA vez.
  const fallaUnaVez = (u, ruta, i) => {
    const h = heroeDe(ruta, i);
    if (f.fallarPrimeros <= 0 || h === '1' || h === 'Atlas' || e.fallaronYa.has(h) || !deGloria(u)) return false;
    e.fallaronYa.add(h); f.fallarPrimeros -= 1; return true;
  };
  // SIN_PAREJAS: parejas vacías la primera vez y cruces vacíos la segunda; SIN_CRUCES, al revés.
  const parejaVacia = (u, ruta) => {
    const h = heroeDe(ruta, 3);
    if (!f.parejasVaciasActivas || !SIN_PAREJAS.includes(h) || e.sinParejas.has(h) || !deGloria(u)) return false;
    e.sinParejas.add(h); return true;
  };
  const cruceVacioAlReintentar = (u, ruta, i) => {
    const h = heroeDe(ruta, i);
    if (!f.parejasVaciasActivas || !SIN_PAREJAS.includes(h) || !deGloria(u)) return false;
    return cuenta(e.crucesPedidos, h) >= 2;
  };
  const cruceVacioPrimero = (u, ruta, i) => {
    const h = heroeDe(ruta, i);
    return f.parejasVaciasActivas && SIN_CRUCES.includes(h) && deGloria(u) && cuenta(e.pedidosSinCruces, `c:${h}`) === 1;
  };
  const parejaVaciaAlReintentar = (u, ruta) => {
    const h = heroeDe(ruta, 3);
    return f.parejasVaciasActivas && SIN_CRUCES.includes(h) && deGloria(u) && cuenta(e.pedidosSinCruces, `s:${h}`) >= 2;
  };
  const error1101 = '{"title":"Error 1101: Worker threw exception"}';
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const ruta = u.pathname;
    const marca = (k) => { golpes[k] = (golpes[k] ?? 0) + 1; };
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const falla = (status = 500, cuerpo = '{}') => { res.statusCode = status; res.end(cuerpo); };
    const vacia = () => json({ data: { sub_hero: [] } });
    const academy = /^\/api\/academy\/heroes\/[^/]+\/counters$/.test(ruta);
    const delEsquema = /^\/api\/heroes\/[^/]+\/counters$/.test(ruta);
    const compat = /^\/api\/heroes\/[^/]+\/compatibility$/.test(ruta);
    let m;
    if (/^\/api\/user\//.test(ruta)) { marca('user'); return json(pares(8, 1)); }
    if (/openapi\.json$/.test(ruta)) { marca('esquema'); return json(ESQUEMA); }
    if (ruta === '/api/heroes/hero-rank/') {
      // La ventana corta se sirve DISTINTA para ver que sale la servida, y se puede tirar sola.
      const corta = u.searchParams.get('days') === '3';
      if (corta && f.fallaRecientes) return falla();
      if (f.fallaMitico && u.searchParams.get('rank') === 'mythic') return falla();
      if (!corta && f.fallaGloriaVeces > 0 && deGloria(u)) { f.fallaGloriaVeces -= 1; return falla(500, error1101); }
      marca(`${corta ? 'rank3' : 'rank'}:${u.searchParams.get('rank')}`);
      return json({ code: 0, data: { records: HEROES.map((h) => ({ data: {
        main_heroid: h.id, main_hero: { data: { name: h.name } },
        main_hero_win_rate: 0.5 + h.id / 100 + (corta ? 0.002 : 0), main_hero_appearance_rate: 0.01 * h.id, main_hero_ban_rate: 0.2,
      } })) } });
    }
    if (ruta === '/api/heroes/hero-position/') {
      marca('position');
      return json({ code: 0, data: { records: HEROES.map((h) => ({ data: { hero_id: h.id, hero: { data: {
        name: h.name, roadsort: [{ data: { road_sort_title: h.linea } }], sortid: [{ data: { sort_title: h.rol } }],
      } } } })) } });
    }
    if ((m = ruta.match(/^\/api\/heroes\/([^/]+)\/$/))) {
      if (f.fallaDetail) return falla();
      marca('detail');
      const h = HEROES.find((x) => String(x.id) === m[1]) ?? HEROES[0];
      // El retrato de la web fuera; la cara del juego dentro del objeto con `heroid`. La primera habilidad es la pasiva.
      const skilllist = f.kitSinControl && h.id === 1 ? [
        { skillname: 'Frigid Breath', skilldesc: 'Passive.', skilltag: [{ tagname: 'Buff' }] },
        { skillname: 'Fatal Links', skilldesc: DESCRIPCION, skilltag: [{ tagname: 'Buff' }] },
      ] : [
        { skillname: 'Frigid Breath', skilldesc: 'Removes all debuffs on allies.', skilltag: [{ tagname: 'CC Immune' }] },
        { skillname: 'Fatal Links', skilldesc: DESCRIPCION, skilltag: [{ tagname: 'CC' }, { tagname: 'AOE' }] },
        { skillname: 'Time Journey', skilldesc: 'Removes all debuffs on allies.', skilltag: [{ tagname: 'Speed Up' }] },
      ];
      return json({ code: 0, data: { records: [{ data: { head: proxy(`http://127.0.0.1:${api.puerto}/img/${h.id}.jpg${f.retratoNuevo && h.id === 1 ? '?n=2' : ''}`), hero: { data: {
        heroid: h.id, name: h.name, head: proxy(`http://127.0.0.1:${api.puerto}/cara/${h.id}.png`), speciality: ['Guard', 'Crowd Control', "x':(globalThis.P=1),'y"],
        skill: { skilllist },
      } } } }] } });
    }
    if ((academy || delEsquema) && f.fallaCounters) return falla();
    if (delEsquema) {
      if (f.fallosCountersPendientes > 0) { f.fallosCountersPendientes -= 1; return falla(); }
      if (fallaUnaVez(u, ruta, 3)) return falla();
      if (cruceVacioAlReintentar(u, ruta, 3) || cruceVacioPrimero(u, ruta, 3)) return vacia();
      marca('counters'); return json(pares(2));
    }
    if (academy) {
      if (f.academyFallaAlMedir > 0) { f.academyFallaAlMedir -= 1; return falla(); }
      if (f.miticoCaido && u.searchParams.get('rank') === 'mythic' && (e.miticoYaCaido.get(ruta) ?? 0) < 2) { cuenta(e.miticoYaCaido, ruta); return falla(500, error1101); }
      if (f.gloriaCaida && deGloria(u) && !e.gloriaYaCaida.has(ruta)) { e.gloriaYaCaida.add(ruta); return falla(500, error1101); }
      if (f.miticoAMedias && u.searchParams.get('rank') === 'mythic' && ++e.miticosServidos > 3) return vacia();
      if (fallaUnaVez(u, ruta, 4)) return falla();
      if (cruceVacioAlReintentar(u, ruta, 4) || cruceVacioPrimero(u, ruta, 4)) return vacia();
      marca('academy'); marca(`academy:${u.searchParams.get('rank')}`);
      return json(f.academyVacia ? { data: { sub_hero: [] } } : pares(4, f.gloriaRuidosa && deGloria(u) ? -1 : 1));
    }
    if (compat) {
      if (f.parejasVacias || parejaVacia(u, ruta) || parejaVaciaAlReintentar(u, ruta)) return vacia();
      marca('compat'); marca(`compat:${u.searchParams.get('rank')}`);
      return json(pares(3, f.gloriaRuidosa && deGloria(u) ? -1 : 1));
    }
    if (ruta === '/api/equipment/expanded') {
      if (f.fallaEquipoLargo) return falla();
      marca('equipo');
      return json({ code: 0, data: { records: [{ data: {
        equipid: 90001, equipname: 'Objeto de Prueba', equiptypename: 'Defense',
        equipicon: proxy(`http://127.0.0.1:${api.puerto}/img/90001.png`),
        equiptips: '+18 Extra Magic Defense<br>+5 Extra Physical Defense<br>+20% Crit Damage Reduction', equipskill1: 'Reduces HP Regen effects by 50%',
        equipskill2: ' Lifebane: Dealing damage to a target will reduce the Shield and HP Regen effects on them to 60% of normal for 3s.',
      } }, { data: {
        equipid: 90002, equipname: 'Segundo Objeto', equiptypename: 'Attack', equipskill1: 'Reduces the target HP Regen by 40%.',
      } }, { data: {
        // Como Rapid Boots: «Slow Reduction» y «HP Regen» en las estadísticas NO son antisanación.
        equipid: 90004, equipname: 'Botas Rápidas', equiptypename: 'Movement',
        equiptips: '+65 Movement Speed<br>+35% Slow Reduction<br>+12 HP Regen', equipskill1: ' Side Effect: Loses 20 Movement Speed for 5s upon dealing or taking damage.',
      } }] } });
    }
    if (ruta === '/api/equipment') {
      if (f.fallaEquipoCorto) return falla();
      marca('equipoCorto');
      // El crítico por las estadísticas solo en esta: los efectos de las dos rutas se juntan.
      return json({ code: 0, data: { records: [{ data: { equipid: 90001, equipname: 'Objeto de Prueba' } }, { data: { equipid: 90002, equipname: 'Segundo Objeto', equiptips: '+25% Crit Chance' } }] } });
    }
    if (ruta === '/api/academy/emblems') {
      marca('talentos');
      return json({ code: 0, data: { records: [
        { data: { giftid: 611, gifttiers: 1, emblemskill: { skillname: 'Inspire', skilldescemblem: 'Gain <font color="x">5%</font> extra Cooldown Reduction.' } } },
        { data: { giftid: 621, gifttiers: 2, emblemskill: { skillname: 'Bargain Hunter', skilldescemblem: 'Equipment can be purchased at 95% of their base price.' } } },
        { data: { giftid: 131, gifttiers: 3, emblemskill: { skillname: 'Impure Rage', skilldesc: 'Deal extra damage.' } } },
      ], total: 3 } });
    }
    if ((m = ruta.match(/^\/api\/heroes\/([^/]+)\/builds$/))) {
      if (m[1] === f.fallaLineaDe) return falla();
      marca(`builds:${u.searchParams.get('lane')}`);
      return json({ code: 0, data: [{ equipid: [90001, 90002, 90003], build_win_rate: 0.555, build_pick_rate: 0.1,
        emblem: { data: { emblemname: 'Tank' } }, battleskill: { data: { skillname: 'Flicker' } }, new_rune_skill: [611, 621, 131] }] });
    }
    if ((m = ruta.match(/^\/api\/academy\/heroes\/([^/]+)\/win-rate\/timeline$/))) {
      if (!u.searchParams.get('lane') || m[1] === f.fallaLineaDe) return falla(422);
      marca(`lineas:${u.searchParams.get('lane')}`);
      const id = Number(m[1]);
      // Seis tramos desordenados a propósito, distintos por héroe y por corrida.
      return json({ code: 0, data: { records: [{ data: { heroid: id, real_road: 3, big_rank: '9', total_win_rate: 0.4321 + f.desplazaLinea + id / 1000,
        time_win_rate: [20, 10, 12, 14, 16, 18].map((t) => ({ time_min: t, ...(t < 20 ? { time_max: t + 2 } : {}), win_rate: (f.curvaEnPorcentaje ? 100 : 1) * (0.4 + (t - 10) / 100 + f.desplazaLinea + id / 1000) })) } }], total: 1 } });
    }
    if (ruta === '/api/v1/heroes') { marca('tiers'); return json(HEROES.map((h) => ({ id: h.id, name: h.name }))); }
    if ((m = ruta.match(/^\/api\/v1\/heroes\/(\d+)$/))) { marca('tier'); return json({ id: Number(m[1]), name: HEROES.find((x) => String(x.id) === m[1])?.name, tier: m[1] === '1' ? 'S' : 'B' }); }
    if (ruta.startsWith('/img/')) {
      marca('img');
      res.setHeader('content-type', 'image/png');
      return res.end(u.searchParams.get('n') === '2' ? JPG2 : ruta.endsWith('.jpg') ? JPG : PNG);
    }
    return falla(404);
  });
  await new Promise((r) => srv.listen(puerto, '127.0.0.1', r));
  const api = { puerto: srv.address().port, golpes, f, e };
  api.base = `http://127.0.0.1:${api.puerto}/api`;
  api.tiers = `${api.base}/v1`;
  api.cerrar = () => new Promise((r) => srv.close(r));
  return api;
}

/** Lanza `script` como proceso y espera (no `spawnSync`: la API vive en ESTE proceso). */
export const correr = (script, args) => new Promise((listo) => {
  const hijo = spawn(process.execPath, [script, ...args], { timeout: 120000 });
  let stdout = ''; let stderr = '';
  hijo.stdout.on('data', (b) => { stdout += b; });
  hijo.stderr.on('data', (b) => { stderr += b; });
  hijo.on('close', (status) => listo({ status, stdout, stderr }));
});
