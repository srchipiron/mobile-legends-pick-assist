/**
 * Una Lector MLBB de mentira que habla el protocolo 2 (src/comun/contrato.js)
 * para las pruebas de navegador: contesta en el `route` del contexto a las
 * peticiones que la app hace a la tablet vinculada y apunta cada una. Como
 * la de verdad: sin el código, 401; `/reto` sin código con la prueba PBKDF2;
 * `POST /draft` a otro draft, 409; `POST /resultado` puede apuntar la partida.
 */
import { pbkdf2Sync } from 'node:crypto';
import { PROTOCOLO, RETO_VUELTAS, sanearCorreccion, sanearResultado, sanearAjustes } from '../../src/comun/contrato.js';

export const TABLET = { direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' };
const CORS = (origen) => ({
  'Access-Control-Allow-Origin': origen ?? '*', 'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Allow-Headers': 'Content-Type, X-Lector-Codigo', 'Access-Control-Allow-Methods': 'GET, POST', 'Content-Type': 'application/json',
});

/**
 * @param o.draft      el draft que lleva (forma del contrato) o null
 * @param o.apuntar    al recibir `POST /resultado`, apunta la partida con ese `t` (o null: no apunta)
 * @param o.estado     lo que añade a `GET /estado`
 */
export function tabletFalsa({ direccion = TABLET.direccion, codigo = TABLET.codigo, draft = null, partida = null, fase = 'draft', apuntar = null, estado = {}, clave = null } = {}) {
  const t = {
    direccion, codigo, draft, partida, fase, apuntar, estado, clave,
    viejo: false, caida: false, retener: null,
    pedidas: [],
    /** Las peticiones a una ruta (`'GET /draft'`). */
    de: (ruta) => t.pedidas.filter((p) => `${p.metodo} ${p.ruta}` === ruta),
  };
  const responder = async (ruta) => {
    const q = ruta.request();
    const u = new URL(q.url());
    const origen = q.headers().origin;
    if (q.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: CORS(origen) });
    if (t.caida) return ruta.abort('connectionrefused');
    const cuerpo = q.postData() ? JSON.parse(q.postData()) : undefined;
    t.pedidas.push({ metodo: q.method(), ruta: u.pathname, codigo: q.headers()['x-lector-codigo'] ?? null, cuerpo, origen, cuando: Date.now() });
    const json = (status, c) => ruta.fulfill({ status, headers: CORS(origen), body: JSON.stringify(c) });
    if (u.pathname === '/reto') return json(200, { prueba: pbkdf2Sync(t.codigo, `lector-reto:${u.searchParams.get('n')}`, RETO_VUELTAS, 32, 'sha256').toString('hex') });
    if (q.headers()['x-lector-codigo'] !== t.codigo) return json(401, { error: 'codigo' });
    if (t.retener) await t.retener;
    const ruta2 = `${q.method()} ${u.pathname}`;
    if (ruta2 === 'GET /estado') return json(200, { ok: true, protocolo: t.viejo ? undefined : PROTOCOLO, lector: { minutos: 3, lecturas: 0, lecturasSolo: 12, fallosCaptura: 0 }, tablet: { apk: t.viejo ? '3.102.0' : '4.0.0', grabando: true }, ...t.estado });
    if (ruta2 === 'GET /draft') return t.viejo ? json(404, { error: 'ruta' }) : json(200, { protocolo: PROTOCOLO, fase: t.fase, draft: t.draft, partida: t.partida });
    if (ruta2 === 'POST /draft') {
      const c = sanearCorreccion(cuerpo);
      if (!c || c.desde !== t.draft?.desde) return json(409, { error: 'otro draft' });
      return json(200, { ok: true });
    }
    if (ruta2 === 'POST /resultado') {
      const r = sanearResultado(cuerpo);
      if (!r) return json(400, { error: 'resultado' });
      if (t.apuntar && r.gane !== null) t.partida = { desde: r.desde, estado: 'apuntada', gane: r.gane, registro: { t: t.apuntar, pick: t.draft?.tuyo ?? 'Tigreal', gane: r.gane, recomendados: [], rango: 'glory', origen: 'lector' } };
      return json(200, { ok: true });
    }
    if (ruta2 === 'POST /ajustes') return sanearAjustes(cuerpo) ? json(200, { ok: true }) : json(400, { error: 'ajustes' });
    if (ruta2 === 'GET /clave') return t.clave ? json(200, { clave: t.clave }) : json(404, { error: 'sin clave' });
    return json(404, { error: 'ruta' });
  };
  /** Engancha la tablet al contexto de una página (antes de cargarla). */
  t.enganchar = (pagina) => pagina.context().route(`http://${t.direccion}/**`, responder);
  return t;
}

/** Un draft de la tablet con la forma del contrato. */
export const draftTablet = (o = {}) => ({ desde: Date.now() - 60000, enemigos: [null, null, null, null, null], aliados: [null, null, null, null, null], tuyoFila: -1, baneos: [], ...o });
