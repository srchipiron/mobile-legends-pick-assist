#!/usr/bin/env node
/**
 * El esquema de la base de datos de la comunidad (supabase/esquema.sql)
 * contra un Postgres DE VERDAD (3.69.0): `npm run test:sql`. No va en
 * `npm test` por lo mismo que las de navegador: publicar no puede depender
 * de tener un Postgres a mano.
 *
 * Monta un servidor temporal con los roles de Supabase (`anon` y
 * `authenticated`, sin entrar; el dueño de las tablas NO es superusuario,
 * como `postgres` en Supabase), pega el esquema DOS veces (se puede volver a
 * pegar) y prueba como `anon`, que es lo que es la app.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';

const BIN = ['/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/lib/postgresql/14/bin'].find((d) => existsSync(join(d, 'initdb')))
  ?? (existsSync('/usr/lib/postgresql') ? readdirSync('/usr/lib/postgresql').map((v) => `/usr/lib/postgresql/${v}/bin`).find((d) => existsSync(join(d, 'initdb'))) : null);
if (!BIN) { console.error('No hay Postgres (initdb): esta prueba necesita uno'); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), 'esquema-'));
chmodSync(dir, 0o777);
const datos = join(dir, 'datos');
// initdb no corre como root: en el contenedor se lanza como el usuario postgres.
const comoRoot = process.getuid?.() === 0;
const lanzar = (prog, args, opciones = {}) => {
  const r = comoRoot
    ? spawnSync('runuser', ['-u', 'postgres', '--', join(BIN, prog), ...args], { encoding: 'utf8', ...opciones })
    : spawnSync(join(BIN, prog), args, { encoding: 'utf8', ...opciones });
  return r;
};
const PUERTO = String(54000 + (process.pid % 1000));
const iniciar = lanzar('initdb', ['-D', datos, '-U', 'super', '-A', 'trust']);
if (iniciar.status !== 0) { console.error(iniciar.stderr); process.exit(2); }
const arrancar = lanzar('pg_ctl', ['-D', datos, '-o', `-k ${dir} -p ${PUERTO} -c listen_addresses=''`, '-l', join(dir, 'log'), '-w', 'start']);
if (arrancar.status !== 0) { console.error(arrancar.stderr || arrancar.stdout); process.exit(2); }

/** Una orden SQL. `{ salida, error }`; la salida, el valor de la última fila sin adornos. */
function sql(orden, { usuario = 'dueno', base = 'comunidad' } = {}) {
  const r = spawnSync('psql', ['-h', dir, '-p', PUERTO, '-U', usuario, '-d', base, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', orden], { encoding: 'utf8' });
  return { salida: r.stdout.trim(), error: r.status === 0 ? null : r.stderr.trim() };
}
const comoAnon = (orden) => sql(`set role anon; ${orden}`);
const json = (r) => { if (r.error) throw new Error(r.error); return JSON.parse(r.salida.split('\n').pop()); };
const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

try {
  for (const o of [
    'create role anon nologin', 'create role authenticated nologin',
    'create role dueno login', 'grant anon to dueno', 'create database comunidad owner dueno',
  ]) { const r = sql(o, { usuario: 'super', base: 'postgres' }); if (r.error) throw new Error(r.error); }
  // Como Supabase: todo lo nuevo de `public` se le da a anon y authenticated
  // por defecto. El esquema tiene que quitárselo él.
  for (const o of [
    'grant usage on schema public to anon, authenticated',
    'alter default privileges in schema public grant all on tables to anon, authenticated',
    'alter default privileges in schema public grant all on functions to anon, authenticated',
  ]) { const r = sql(o); if (r.error) throw new Error(r.error); }
  const pegar = () => spawnSync('psql', ['-h', dir, '-p', PUERTO, '-U', 'dueno', '-d', 'comunidad', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', join(RAIZ, 'supabase/esquema.sql')], { encoding: 'utf8' });
  const p1 = pegar();
  const p2 = pegar();

  test('el esquema se pega entero y se puede volver a pegar', () => {
    ok(p1.status === 0, `la primera vez falla: ${p1.stderr}`);
    ok(p2.status === 0, `la segunda vez falla: ${p2.stderr}`);
  });

  const CLAVE = 'a'.repeat(20) + 'B'.repeat(12) + '_-x';
  const OTRA = 'z'.repeat(40);
  const partida = (t, extra = {}) => ({ t, pick: 'Rafaela', gane: true, recomendados: ['Rafaela'], ...extra });
  const T0 = 1788000000000;

  test('la app (anon) no puede leer ni escribir las tablas', () => {
    for (const o of ['select * from public.partidas', 'select * from public.jugadores', "insert into public.jugadores (huella) values ('x')", 'delete from public.partidas']) {
      ok(comoAnon(o).error, `anon puede: ${o}`);
    }
    // Con una clave VÁLIDA: con una mala fallaría por la clave, no por el permiso.
    const h = comoAnon(`select public.huella_de('${'a'.repeat(40)}')`);
    ok(h.error && /permission denied/.test(h.error), `anon puede llamar a huella_de: ${h.error ?? h.salida}`);
    // Las dos capas, cada una por su lado: sin permisos sobre las tablas Y con RLS sin políticas.
    eq(sql("select count(*) from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_name in ('partidas', 'jugadores')").salida, '0', 'anon o authenticated tienen permisos sobre las tablas');
    eq(sql("select count(*) from pg_class where relname in ('partidas', 'jugadores') and relrowsecurity").salida, '2', 'una tabla sin RLS');
    eq(sql("select count(*) from pg_policies where tablename in ('partidas', 'jugadores')").salida, '0', 'una política abre las tablas');
  });

  test('subir guarda, reemplaza por instante y quita lo borrado', () => {
    const r = json(comoAnon(`select public.subir_partidas('${CLAVE}', ${lit([partida(T0), partida(T0 + 1, { gane: false })])}, '[]'::jsonb, ${lit({ winRate: 0.513, partidas: 10534 })})`));
    eq(r.guardadas, 2); eq(r.total, 2);
    const r2 = json(comoAnon(`select public.subir_partidas('${CLAVE}', ${lit([partida(T0 + 1, { gane: true })])}, ${lit([T0])})`));
    eq(r2.quitadas, 1, 'no quita la partida borrada'); eq(r2.total, 1);
    const r3 = json(comoAnon(`select public.subir_partidas('${CLAVE}', ${lit([partida(T0 + 2, { gane: false }), partida(T0 + 2, { gane: true })])})`));
    eq(r3.total, 2, 'un instante repetido en el lote');
    json(comoAnon(`select public.subir_partidas('${CLAVE}', '[]'::jsonb, ${lit([T0 + 2])})`));
    const mias = json(comoAnon(`select public.mis_partidas('${CLAVE}')`));
    eq(mias.partidas.length, 1); eq(mias.partidas[0].gane, true, 'no reemplaza la corregida');
    eq(mias.referencia.winRate, 0.513, 'sin la referencia, o la pisa un envío sin ella');
  });

  test('cada clave ve solo lo suyo, y lo publicado no lleva ni la clave ni su huella', () => {
    json(comoAnon(`select public.subir_partidas('${OTRA}', ${lit([partida(T0 + 5)])})`));
    eq(json(comoAnon(`select public.mis_partidas('${OTRA}')`)).partidas.length, 1);
    eq(json(comoAnon(`select public.mis_partidas('${'q'.repeat(32)}')`)).partidas.length, 0, 'una clave sin partidas ve las de otro');
    const todo = json(comoAnon('select public.partidas_comunidad()'));
    eq(todo.filas.length, 2);
    eq(new Set(todo.filas.map((f) => f.j)).size, 2, 'dos jugadores, un número cada uno');
    const texto = JSON.stringify(todo);
    ok(!texto.includes(CLAVE) && !texto.includes(OTRA), 'publica la clave');
    const huellas = sql('select string_agg(huella, \',\') from public.jugadores').salida.split(',');
    ok(huellas.length === 2 && huellas.every((h) => /^[0-9a-f]{64}$/.test(h) && !texto.includes(h)), 'publica la huella, o no la guarda como SHA-256');
    ok(!sql(`select count(*) from public.jugadores where huella like '%${CLAVE.slice(0, 10)}%'`).salida.startsWith('1'), 'guarda la clave en claro');
    const r = Object.values(todo.referencias);
    eq(r.length, 1, 'las referencias de la página no van');
  });

  test('las páginas de la comunidad siguen tras el último (jugador, instante)', () => {
    const p1 = json(comoAnon('select public.partidas_comunidad(0, 0, 1)'));
    eq(p1.filas.length, 1); eq(p1.mas, true);
    const { j, t } = p1.filas[0];
    const p2 = json(comoAnon(`select public.partidas_comunidad(${j}, ${t}, 1)`));
    eq(p2.filas.length, 1); ok(p2.filas[0].j !== j || p2.filas[0].t !== t, 'repite la fila');
    const p3 = json(comoAnon(`select public.partidas_comunidad(${p2.filas[0].j}, ${p2.filas[0].t}, 1)`));
    eq(p3.filas.length, 0); eq(p3.mas, false);
    eq(json(comoAnon('select public.partidas_comunidad(0, 0, 999999)')).filas.length, 2, 'cuantas sin tope');
  });

  test('rechaza lo que no tiene forma, y entonces no guarda nada del lote', () => {
    const antes = json(comoAnon(`select public.mis_partidas('${CLAVE}')`)).partidas.length;
    const malos = [
      [`'corta'`, lit([partida(T0 + 9)])],
      [`'${CLAVE}'`, lit([partida(T0 + 9), { t: T0 + 10, pick: 'X' }])],
      [`'${CLAVE}'`, lit([partida(T0 + 9), partida(1000)])],
      [`'${CLAVE}'`, lit([partida(Date.now() + 3 * 86400000)])],
      [`'${CLAVE}'`, lit([partida(T0 + 9.5)])],
      [`'${CLAVE}'`, lit([partida(T0 + 9, { pick: 'x'.repeat(41) })])],
      [`'${CLAVE}'`, lit([partida(T0 + 9, { relleno: 'x'.repeat(5000) })])],
      [`'${CLAVE}'`, lit(Array.from({ length: 201 }, (_, i) => partida(T0 + 100 + i)))],
      [`'${CLAVE}'`, lit({ t: T0 })],
    ];
    for (const [c, l] of malos) ok(comoAnon(`select public.subir_partidas(${c}, ${l})`).error, `acepta ${l.slice(0, 80)}`);
    eq(json(comoAnon(`select public.mis_partidas('${CLAVE}')`)).partidas.length, antes, 'un lote rechazado deja algo guardado');
    const ref = comoAnon(`select public.subir_partidas('${CLAVE}', '[]'::jsonb, '[]'::jsonb, ${lit({ winRate: 7, partidas: 3 })})`);
    ok(!ref.error, ref.error);
    eq(json(comoAnon(`select public.mis_partidas('${CLAVE}')`)).referencia.winRate, 0.513, 'una referencia sin sentido pisa la buena');
  });

  test('un jugador no pasa de 5.000 partidas', () => {
    const tope = 'w'.repeat(36);
    let error = null;
    for (let i = 0; i < 26 && !error; i += 1) {
      error = comoAnon(`select public.subir_partidas('${tope}', ${lit(Array.from({ length: 200 }, (_, k) => partida(T0 + i * 200 + k)))})`).error;
    }
    ok(error && /tope/.test(error), `no para en 5.000: ${error}`);
    eq(json(comoAnon(`select public.mis_partidas('${tope}')`)).partidas.length, 5000, 'el lote que se pasa se queda a medias');
    // Con más de 1.000 filas, una página no pasa de 1.000 pida lo que pida.
    eq(json(comoAnon('select public.partidas_comunidad(0, 0, 999999)')).filas.length, 1000, 'una página sin tope');
  });

  test('solo se guardan los campos conocidos, y un instante con «.0» vale', () => {
    const c = 'k'.repeat(40);
    const r = comoAnon(`select public.subir_partidas('${c}', '[{"t": 1788000000000.0, "pick": "Chou", "gane": true, "__proto__": {"x": 1}, "raro": "<script>"}]'::jsonb, '[1788000000001.0]'::jsonb)`);
    ok(!r.error, r.error);
    const d = json(comoAnon(`select public.mis_partidas('${c}')`)).partidas[0];
    eq(JSON.stringify(Object.keys(d).sort()), JSON.stringify(['gane', 'pick', 't']), `guarda lo que no conoce: ${JSON.stringify(d)}`);
    ok(comoAnon(`select public.subir_partidas('${c}', '[]'::jsonb, '[1.5]'::jsonb)`).error, 'acepta un instante a quitar con decimales');
    json(comoAnon(`select public.subir_partidas('${c}', '[]'::jsonb, '[]'::jsonb, ${lit({ winRate: 0.0001, partidas: 1000000 })})`));
    eq(json(comoAnon(`select public.mis_partidas('${c}')`)).referencia, null, 'guarda un winrate de siempre imposible');
  });

  test('con el proyecto lleno de jugadores, uno nuevo no entra y los de antes siguen subiendo', () => {
    const r = sql("insert into public.jugadores (huella) select md5(g::text) || md5((g + 1)::text) from generate_series(1, 20000) g");
    ok(!r.error, r.error);
    const nuevo = comoAnon(`select public.subir_partidas('${'n'.repeat(40)}', ${lit([partida(T0 + 77)])})`);
    ok(nuevo.error && /lleno/.test(nuevo.error), `entra un jugador nuevo con el proyecto lleno: ${nuevo.error ?? nuevo.salida}`);
    const viejo = comoAnon(`select public.subir_partidas('${CLAVE}', ${lit([partida(T0 + 78)])})`);
    ok(!viejo.error, `uno de antes no puede subir: ${viejo.error}`);
    sql("delete from public.jugadores where huella ~ '^[0-9a-f]{64}$' and id not in (select jugador from public.partidas)");
  });

  test('borrar se lleva al jugador y todas sus partidas', () => {
    eq(comoAnon(`select public.borrar_mis_partidas('${OTRA}')`).salida, 't');
    eq(json(comoAnon(`select public.mis_partidas('${OTRA}')`)).partidas.length, 0);
    eq(comoAnon(`select public.borrar_mis_partidas('${OTRA}')`).salida, 'f', 'borrar dos veces dice que había algo');
    eq(sql('select count(*) from public.partidas p left join public.jugadores j on j.id = p.jugador where j.id is null').salida, '0', 'quedan partidas sin jugador');
  });
} finally {
  await terminar();
  lanzar('pg_ctl', ['-D', datos, '-m', 'immediate', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
