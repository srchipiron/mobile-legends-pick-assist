/**
 * Un Supabase de pega, en memoria, con las funciones de
 * `supabase/esquema.sql` y sus mismas respuestas (3.69.0). Lo usan
 * `app/basedatos.test` (como `fetch`) y `comunidad.e2e` (por `page.route`).
 * Lo que valida el esquema de verdad se prueba contra Postgres en
 * `pruebas/sql/esquema.sql.mjs`; si cambias la forma de una respuesta allí,
 * cámbiala aquí a la vez.
 */
export function supabaseFalso({ clavePublica = 'sb_publishable_prueba1234567890', ahora = () => Date.now() } = {}) {
  const partes = [];
  const recortes = [];
  const jugadores = new Map(); // huella (aquí, la clave) → { id, referencia, partidas: Map(t → datos) }
  let siguiente = 1;
  const llamadas = [];
  const error = (message, status = 400) => ({ status, cuerpo: { code: 'P0001', message } });
  const claveValida = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(c);

  function atender(funcion, args, cabeceras) {
    llamadas.push({ funcion, args, cabeceras });
    if (cabeceras.apikey !== clavePublica) return { status: 401, cuerpo: { message: 'Invalid API key' } };
    if (funcion === 'subir_partidas') {
      if (!claveValida(args.clave)) return error('clave');
      if (!Array.isArray(args.lote) || args.lote.length > 200) return error('lote');
      if (args.lote.some((p) => !p || !Number.isInteger(p.t) || typeof p.gane !== 'boolean' || typeof p.pick !== 'string')) return error('partida');
      let j = jugadores.get(args.clave);
      if (!j) { j = { id: siguiente++, referencia: null, partidas: new Map() }; jugadores.set(args.clave, j); }
      const r = args.referencia;
      if (r && typeof r.winRate === 'number' && r.winRate >= 0 && r.winRate <= 1 && r.partidas >= 1) j.referencia = { winRate: r.winRate, partidas: Math.floor(r.partidas) };
      let quitadas = 0;
      for (const t of args.quitar ?? []) if (j.partidas.delete(t)) quitadas += 1;
      // Una copia arreglada más tarde no la pisa otra más vieja (3.76.0), como el esquema.
      const editadaDe = (x) => (Number.isFinite(x?.editada) ? x.editada : 0);
      for (const p of args.lote) if (!j.partidas.has(p.t) || editadaDe(p) >= editadaDe(j.partidas.get(p.t))) j.partidas.set(p.t, p);
      if (j.partidas.size > 5000) return error('tope');
      return { status: 200, cuerpo: { guardadas: args.lote.length, quitadas, total: j.partidas.size } };
    }
    if (funcion === 'mis_partidas') {
      if (!claveValida(args.clave)) return error('clave');
      const j = jugadores.get(args.clave);
      return { status: 200, cuerpo: { partidas: j ? [...j.partidas.values()].sort((a, b) => b.t - a.t) : [], referencia: j?.referencia ?? null } };
    }
    if (funcion === 'borrar_mis_partidas') {
      if (!claveValida(args.clave)) return error('clave');
      return { status: 200, cuerpo: jugadores.delete(args.clave) };
    }
    if (funcion === 'partidas_comunidad') {
      const lim = Math.min(Math.max(args.cuantas ?? 1000, 1), 1000);
      const todas = [...jugadores.values()].flatMap((j) => [...j.partidas.values()].map((d) => ({ j: j.id, t: d.t, d })))
        .sort((a, b) => a.j - b.j || a.t - b.t)
        .filter((f) => f.j > (args.tras_jugador ?? 0) || (f.j === (args.tras_jugador ?? 0) && f.t > (args.tras_t ?? 0)));
      const filas = todas.slice(0, lim);
      const referencias = {};
      for (const j of jugadores.values()) if (j.referencia && filas.some((f) => f.j === j.id)) referencias[String(j.id)] = j.referencia;
      return { status: 200, cuerpo: { filas, referencias, mas: filas.length === lim } };
    }
    // Los partes de la tablet (3.74.0), como `subir_parte` y `partes_recientes` del esquema.
    if (funcion === 'subir_parte') {
      if (!claveValida(args.clave)) return error('clave');
      if (!args.parte || typeof args.parte !== 'object' || Array.isArray(args.parte) || JSON.stringify(args.parte).length > 16000) return error('parte');
      const ya = partes.filter((x) => x.clave === args.clave);
      if (ya.length && ahora() - ya[ya.length - 1].recibido < 4 * 60000) return error('pronto');
      partes.push({ clave: args.clave, j: (jugadores.get(args.clave)?.id ?? 999), recibido: ahora(), d: args.parte });
      return { status: 200, cuerpo: { ok: true } };
    }
    // Los recortes del draft (3.81.0), como `subir_recorte` del esquema.
    if (funcion === 'subir_recorte') {
      if (!claveValida(args.clave)) return error('clave');
      const c = args.recorte?.capturas;
      if (!args.recorte || typeof args.recorte !== 'object' || !Array.isArray(c) || c.length < 1 || c.length > 2 || JSON.stringify(args.recorte).length > 120000) return error('recorte');
      const ya = recortes.filter((x) => x.clave === args.clave);
      if (ya.length && ahora() - ya[ya.length - 1].recibido < 60000) return error('pronto');
      recortes.push({ clave: args.clave, recibido: ahora(), d: args.recorte });
      return { status: 200, cuerpo: { ok: true } };
    }
    if (funcion === 'recortes_recientes') {
      const desde = ahora() - Math.min(Math.max(args.horas ?? 168, 1), 1440) * 3600000;
      return { status: 200, cuerpo: recortes.filter((x) => x.recibido > desde).slice(-50).reverse().map((x) => ({ j: 1, recibido: new Date(x.recibido).toISOString(), d: x.d })) };
    }
    if (funcion === 'mis_recortes') {
      if (!claveValida(args.clave)) return { status: 200, cuerpo: [] };
      const desde = ahora() - Math.min(Math.max(args.horas ?? 720, 1), 1440) * 3600000;
      return { status: 200, cuerpo: recortes.filter((x) => x.clave === args.clave && x.recibido > desde).slice(-50).reverse().map((x) => ({ recibido: new Date(x.recibido).toISOString(), d: x.d })) };
    }
    if (funcion === 'partes_recientes') {
      const desde = ahora() - Math.min(Math.max(args.horas ?? 48, 1), 168) * 3600000;
      return { status: 200, cuerpo: partes.filter((x) => x.recibido > desde).sort((a, b) => b.recibido - a.recibido).map(({ j, recibido, d }) => ({ j, recibido: new Date(recibido).toISOString(), d })) };
    }
    return { status: 404, cuerpo: { message: 'no existe' } };
  }

  /** Como `fetch`, para las pruebas de Node. */
  async function fetchFalso(url, { method, headers = {}, body } = {}) {
    const m = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (method !== 'POST' || !m) return new Response('{}', { status: 404 });
    const r = atender(m[1], JSON.parse(body ?? '{}'), headers);
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }

  return { atender, fetch: fetchFalso, llamadas, jugadores, clavePublica, partes, recortes };
}
