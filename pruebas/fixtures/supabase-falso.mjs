/**
 * Un Supabase de pega, en memoria, con las cuatro funciones de
 * `supabase/esquema.sql` y sus mismas respuestas (3.69.0). Lo usan
 * `app/basedatos.test` (como `fetch`) y `comunidad.e2e` (por `page.route`).
 * Lo que valida el esquema de verdad se prueba contra Postgres en
 * `pruebas/sql/esquema.sql.mjs`; si cambias la forma de una respuesta allí,
 * cámbiala aquí a la vez.
 */
export function supabaseFalso({ clavePublica = 'sb_publishable_prueba1234567890' } = {}) {
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
      for (const p of args.lote) j.partidas.set(p.t, p);
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
    return { status: 404, cuerpo: { message: 'no existe' } };
  }

  /** Como `fetch`, para las pruebas de Node. */
  async function fetchFalso(url, { method, headers = {}, body } = {}) {
    const m = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (method !== 'POST' || !m) return new Response('{}', { status: 404 });
    const r = atender(m[1], JSON.parse(body ?? '{}'), headers);
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }

  return { atender, fetch: fetchFalso, llamadas, jugadores, clavePublica };
}
