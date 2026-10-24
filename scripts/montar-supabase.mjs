#!/usr/bin/env node
/**
 * Monta la base de datos de partidas (3.69.0) en el Supabase de Javi, de un
 * tirón, con la API de gestión: crea el proyecto (o usa el que ya se llame
 * así), espera a que arranque, pega supabase/esquema.sql, saca la clave
 * PUBLICABLE, comprueba que las funciones contestan con ella y escribe
 * public/comunidad.json. Se puede repetir: no crea dos proyectos ni borra
 * nada.
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/montar-supabase.mjs [--nombre pick-assist] [--region eu-central-1]
 *
 * El token (Supabase → Account → Access Tokens) da acceso a toda la cuenta
 * de Supabase: solo viaja a api.supabase.com en la cabecera Authorization,
 * no se escribe en ningún sitio ni sale por pantalla. Bórralo en cuanto esto
 * acabe. De las claves del proyecto solo se toca la publicable; la secreta
 * ni se pide en claro (`reveal=false`). La contraseña de la base de datos se
 * genera al azar y no se guarda: la app no la usa, y si algún día hace
 * falta se cambia desde el panel.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { sanearConfig, clavePublicable, llamar } from '../src/app/basedatos.js';

export const API = 'https://api.supabase.com';
const ESQUEMA = new URL('../supabase/esquema.sql', import.meta.url);
const SALIDA = new URL('../public/comunidad.json', import.meta.url);

/** Una petición a la API de gestión. `{ datos }` o `{ error, estado, mensaje }`; nunca lleva el token en el mensaje. */
async function pedir(token, metodo, ruta, cuerpo, { fetch }) {
  let r;
  try {
    r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) { return { error: 'red', mensaje: e?.message ?? String(e) }; }
  let datos;
  try { datos = await r.json(); } catch { datos = null; }
  if (r.ok) return { datos };
  return { error: r.status === 401 ? 'token' : 'api', estado: r.status, mensaje: String(datos?.message ?? datos?.error ?? '').replaceAll(token, '…').slice(0, 300) };
}

const refDe = (p) => p?.ref ?? p?.id ?? null;

/**
 * Todo el montaje. Devuelve `{ config, ref, creado }` o lanza un Error con
 * qué hacer. `esperar` y `fetch` se inyectan para la prueba.
 */
export async function montar({ token, nombre = 'pick-assist', region = 'eu-central-1', fetch = globalThis.fetch, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), avisar = () => {}, esquema = readFileSync(ESQUEMA, 'utf8') }) {
  if (!token || typeof token !== 'string') throw new Error('Falta SUPABASE_ACCESS_TOKEN (Supabase → Account → Access Tokens).');
  const o = { fetch };
  const fallo = (paso, r) => new Error(`${paso}: ${r.error === 'token' ? 'el token no vale o ha caducado' : `${r.error}${r.estado ? ` ${r.estado}` : ''} ${r.mensaje ?? ''}`.trim()}`);

  const proyectos = await pedir(token, 'GET', '/v1/projects', undefined, o);
  if (proyectos.error) throw fallo('Listar proyectos', proyectos);
  let proyecto = (Array.isArray(proyectos.datos) ? proyectos.datos : []).find((p) => p?.name === nombre);
  let creado = false;
  if (!proyecto) {
    const orgs = await pedir(token, 'GET', '/v1/organizations', undefined, o);
    if (orgs.error) throw fallo('Listar organizaciones', orgs);
    const org = Array.isArray(orgs.datos) ? orgs.datos[0] : null;
    if (!org) throw new Error('La cuenta de Supabase no tiene ninguna organización: crea una en el panel (es un paso de la primera vez).');
    const cuerpo = { name: nombre, region, db_pass: randomBytes(24).toString('base64url') };
    // La API ha pedido la organización por id y, después, por slug: se prueba con las dos.
    let r = await pedir(token, 'POST', '/v1/projects', { ...cuerpo, organization_id: org.id }, o);
    if (r.error === 'api' && org.slug && org.slug !== org.id) r = await pedir(token, 'POST', '/v1/projects', { ...cuerpo, organization_slug: org.slug }, o);
    if (r.error) throw fallo('Crear el proyecto (el plan gratuito deja dos activos)', r);
    proyecto = r.datos; creado = true;
    avisar(`Proyecto «${nombre}» creado en ${region}.`);
  } else avisar(`Proyecto «${nombre}» ya existía: se usa ese.`);
  const ref = refDe(proyecto);
  if (!/^[a-z0-9]{20}$/.test(String(ref))) throw new Error(`La API no dio una referencia de proyecto con forma: ${String(ref).slice(0, 40)}`);

  // Arrancar tarda un par de minutos.
  for (let i = 0; ; i += 1) {
    const r = await pedir(token, 'GET', `/v1/projects/${ref}`, undefined, o);
    if (r.error) throw fallo('Mirar el proyecto', r);
    if (r.datos?.status === 'ACTIVE_HEALTHY') break;
    if (/PAUSED|INACTIVE/.test(String(r.datos?.status))) throw new Error('El proyecto está pausado: reactívalo en el panel de Supabase (Restore) y vuelve a lanzar esto.');
    if (i >= 60) throw new Error(`El proyecto no arranca (${r.datos?.status}) tras 10 minutos: vuelve a lanzar esto más tarde.`);
    if (i === 0) avisar('Esperando a que arranque el proyecto…');
    await esperar(10000);
  }

  const sql = await pedir(token, 'POST', `/v1/projects/${ref}/database/query`, { query: esquema }, o);
  if (sql.error) throw fallo('Pegar el esquema', sql);
  avisar('Esquema pegado.');

  const claves = await pedir(token, 'GET', `/v1/projects/${ref}/api-keys?reveal=false`, undefined, o);
  if (claves.error) throw fallo('Leer las claves', claves);
  const lista = Array.isArray(claves.datos) ? claves.datos : [];
  // La publicable nueva si la hay; si no, la anon de siempre. Nunca otra: lo comprueba clavePublicable.
  const elegida = [
    ...lista.filter((k) => k?.type === 'publishable'),
    ...lista.filter((k) => k?.name === 'anon'),
  ].map((k) => k?.api_key).find((k) => clavePublicable(k));
  if (!elegida) throw new Error('El proyecto no tiene clave publicable: créala en Project Settings → API Keys y vuelve a lanzar esto.');
  const config = sanearConfig({ url: `https://${ref}.supabase.co`, clave: elegida });
  if (!config) throw new Error('La dirección o la clave no tienen la forma esperada.');

  // Que de verdad conteste con la clave que va a llevar la app (la caché del esquema tarda unos segundos).
  let prueba;
  for (let i = 0; i < 12; i += 1) {
    prueba = await llamar(config, 'partidas_comunidad', { tras_jugador: 0, tras_t: 0, cuantas: 1 }, { fetch });
    if (!prueba.error) break;
    await esperar(5000);
  }
  if (prueba.error) throw new Error(`Las funciones no contestan con la clave publicable (${prueba.error}${prueba.estado ? ` ${prueba.estado}` : ''}).`);
  avisar('La base de datos contesta.');
  return { config, ref, creado };
}

const esPrincipal = process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;
if (esPrincipal) {
  const args = process.argv.slice(2);
  const opcion = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  try {
    const { config, ref, creado } = await montar({ token: process.env.SUPABASE_ACCESS_TOKEN, nombre: opcion('--nombre', 'pick-assist'), region: opcion('--region', 'eu-central-1'), avisar: (m) => console.log(m) });
    writeFileSync(SALIDA, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`Listo: public/comunidad.json apunta a ${config.url} (${creado ? 'proyecto nuevo' : 'proyecto que ya había'}, ${ref}). Falta commitear y publicar.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
