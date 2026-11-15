/**
 * El lector DENTRO de la tablet: lo arranca la APK (arranque-apk.mjs) con
 * Node embebido. La captura es la pantalla de la propia tablet, que la APK
 * graba (MediaProjection) y da por 127.0.0.1 con un secreto. Aquí se monta
 * todo: el servidor, el modo solo, las partidas y lo que sube a la base de
 * datos. No lanza programas ni toca la pantalla: solo LEE lo que se ve.
 *
 * Variables (las pone la APK): LECTOR_INTERNO (http://127.0.0.1:PUERTO),
 * LECTOR_SECRETO, LECTOR_CODIGO, LECTOR_CASA (su carpeta), LECTOR_ULTIMA_SALIDA.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUERTO } from '../../src/comun/contrato.js';
import { claveDeJugadorValida, subirParte, subirRecorte, traerMisPartidas, bajarMisRecortes } from '../../src/comun/basedatos.js';
import { maestriaEfectiva } from '../../src/motor/maestria.js';
import { tusNumeros } from '../../src/motor/habitos.js';
import { crearServidor, VISTAZO_MS } from './servir.mjs';
import { podarCapturas } from './capturas.mjs';
import { leerCrudo } from './png.mjs';
import { ficheroAprendido, cargarLoAprendido, guardarAprendido, ARREGLOS_POR_TANDA } from './aprendizaje.mjs';
import { crearSolo, datosDelSolo } from './solo.mjs';
import { lectorDeDatos, bajarDatos, leerComunidad, leerSaludDeLaApk, ajustesDeLaTablet, REFRESCAR_DATOS_MS, FICHEROS } from './datos.mjs';
import { partidasDeLaTablet, sanearEdicion, ultimasDeTabla, listaParaLaApk, subirLoDeLaTablet } from './partidas.mjs';
import { parteDeSalud, recorteParaSubir, finalParaSubir, comprobanteParaSubir, draftsArreglados, claveDelLector, PARTE_CADA_MS, ARREGLOS_CADA_MS, DIAS_DE_RECORTES, FINAL_DEL_REGISTRO_BYTES } from './subidas.mjs';


/** [C] La captura solo puede venir de la APK, en 127.0.0.1. */
export const esInterno = (u) => typeof u === 'string' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(u);
/** [C] Un código de vinculación decente: 8 o más letras o cifras. */
export const codigoValido = (c) => typeof c === 'string' && /^[A-Za-z0-9]{8,64}$/.test(c);

/** La captura de la APK, en crudo (cabecera de `screencap` + RGBA: la APK no comprime nada) y con su secreto: da la imagen decodificada. */
export function capturaDeLaApk(base, secreto, { pedir = fetch } = {}) {
  if (!esInterno(base)) throw new Error('la captura solo puede venir de 127.0.0.1');
  return async () => {
    let r;
    try { r = await pedir(`${base}/captura`, { headers: { 'X-Secreto': secreto }, signal: AbortSignal.timeout(15000) }); } catch (e) { throw new Error(`la app del lector no contesta (${e.message})`, { cause: e }); }
    if (!r.ok) throw new Error(r.status === 409 ? 'La tablet no está grabando la pantalla: abre la app del lector y toca «Empezar».' : `captura ${r.status}`);
    return leerCrudo(Buffer.from(await r.arrayBuffer()));
  };
}

const aqui = dirname(fileURLToPath(import.meta.url));

/**
 * Arranca el lector. `pedirBaseDeDatos` es el fetch de la base de datos
 * (las pruebas inyectan uno de pega); `datosDeLaApk` la carpeta con los datos
 * que trae la APK (heroes.json, roam-meta.json, comunidad.json).
 */
export async function principal(env = process.env, { pedirBaseDeDatos = globalThis.fetch, datosDeLaApk = join(aqui, '..', '..', 'datos') } = {}) {
  const registrar = (m) => console.log(m);
  const base = env.LECTOR_INTERNO, secreto = env.LECTOR_SECRETO, codigo = env.LECTOR_CODIGO;
  if (!esInterno(base) || !secreto || !codigoValido(codigo)) throw new Error('faltan LECTOR_INTERNO, LECTOR_SECRETO o un LECTOR_CODIGO válido');
  const casa = env.LECTOR_CASA || '.';
  const carpeta = join(casa, 'capturas');
  mkdirSync(carpeta, { recursive: true });
  podarCapturas(carpeta);
  const bajados = join(casa, 'datos');
  const leerDatos = lectorDeDatos([bajados, datosDeLaApk]);
  const comunidad = () => leerComunidad([bajados, datosDeLaApk]);
  const nombresDelCatalogo = () => (leerDatos().catalogo?.heroes ?? []).map((h) => h.name).filter(Boolean);
  const partidas = partidasDeLaTablet(casa);
  const fichero = ficheroAprendido(casa);
  const aprendido = cargarLoAprendido(fichero, registrar);
  registrar('Resultado de la partida: se lee de la tabla del final con las plantillas de serie (victoria y derrota).');

  let solo = null, ajustes = null, ultimaSubida = { cuando: null, error: null }, subiendo = null, deLaBase = new Map();
  /** [D] Tu clave si el móvil la mandó; si no, la del lector: así cuentan para medir el modelo aunque no salgan en el móvil. */
  const claveConLaQueSube = () => { const tuya = ajustes?.delMovil()?.clave; return claveDeJugadorValida(tuya) ? tuya : claveDelLector(casa); };
  const subir = () => {
    if (subiendo) return subiendo;
    const clave = claveConLaQueSube(), config = comunidad();
    subiendo = subirLoDeLaTablet({ partidas, clave, config, fetch: pedirBaseDeDatos })
      .then((r) => {
        const error = r.error ?? (!partidas.pendientes().length ? null : !claveDeJugadorValida(clave) ? 'sinClave' : !config ? 'sinBaseDeDatos' : null);
        if (error && error !== ultimaSubida.error) registrar(`${partidas.pendientes().length} partidas sin subir (${error === 'sinClave' ? 'falta tu clave: abre Pick Assist en el móvil con «Guardar mis partidas» y la tablet vinculada una vez' : error}).`);
        ultimaSubida = { cuando: Date.now(), error };
        if (r.subidas) registrar(`${r.subidas} partidas subidas a la base de datos.`);
      })
      .catch(() => {})
      .finally(() => { subiendo = null; });
    return subiendo;
  };
  const alCorregir = ({ partida, enemigos, aliados, tuyo }) => {
    if (Number.isFinite(partida) && partidas.corregir(partida, { enemigos, aliados, tuyo })) { registrar('La partida apuntada lleva ya los héroes que dijiste.'); subir(); }
  };
  const listar = async () => {
    const config = comunidad(), clave = claveConLaQueSube();
    const r = config && claveDeJugadorValida(clave) ? await traerMisPartidas({ config, clave }, { fetch: pedirBaseDeDatos }).catch(() => ({ error: 'red' })) : { error: 'sinBaseDeDatos' };
    if (!r.error) {
      deLaBase = new Map(r.partidas.filter((p) => Number.isFinite(p?.t)).map((p) => [p.t, p]));
      const n = partidas.alDiaCon(deLaBase);
      if (n) registrar(`${n} partidas arregladas en el móvil, al día en la tablet.`);
    }
    return { de: r.error ? 'tablet' : 'base', error: r.error ?? null, ...listaParaLaApk({ almacen: partidas, deLaBase }), heroes: nombresDelCatalogo().sort() };
  };
  const editar = (cuerpo) => {
    const e = sanearEdicion(cuerpo, nombresDelCatalogo());
    if (e.error) return { ok: false, estado: 400, error: e.error };
    const hecho = partidas.editar(e.t, e.cambios, deLaBase.get(e.t) ?? null);
    if (!hecho) return { ok: false, estado: 404, error: 'no existe' };
    registrar(`Partida arreglada en la tablet (${Object.keys(e.cambios).join(', ')}).`);
    subir();
    return { ok: true };
  };
  const estadoTablet = () => {
    const d = leerDatos(), todas = partidas.todas();
    return {
      salida: String(env.LECTOR_ULTIMA_SALIDA ?? '').slice(0, 500) || null,
      tablet: leerSaludDeLaApk(join(casa, 'salud.json')),
      ...(solo ? { solo: solo.resumen() } : {}),
      datos: { fecha: d.meta?.generatedAt ?? null, de: d.de === 0 ? 'web' : d.de == null ? null : 'apk' },
      partidas: {
        apuntadas: todas.length, sinSubir: partidas.pendientes().length, porTabla: todas.filter((p) => p.resultadoDe === 'tabla').length, porPregunta: todas.filter((p) => p.resultadoDe === 'pregunta').length,
        sinResultado: partidas.sinResultado().length, ultimasTabla: ultimasDeTabla(todas), clave: claveDeJugadorValida(claveConLaQueSube()), deQuien: claveDeJugadorValida(ajustes?.delMovil()?.clave) ? 'tuya' : 'lector', error: ultimaSubida.error,
      },
    };
  };

  const servidor = crearServidor({
    capturar: capturaDeLaApk(base, secreto), codigo, conductor: () => solo, carpeta, registrar, aprendido,
    guardar: (a) => guardarAprendido(a, fichero), estadoExtra: estadoTablet, alCorregir, historial: { listar, editar },
    claveDeLaTablet: () => { const c = claveConLaQueSube(); return claveDeJugadorValida(c) ? c : null; },
  });
  await new Promise((r) => servidor.listen(Number(env.LECTOR_PUERTO ?? PUERTO), env.LECTOR_ESCUCHA ?? '0.0.0.0', r));
  registrar(`Lector en la tablet esperando en el puerto ${servidor.address().port}.`);
  ajustes = ajustesDeLaTablet(casa, servidor.interno);

  /** Una subida a la base de datos con su línea en el registro (las de fallo dicen «no se pudo»: van a los errores del parte). */
  const subirA = async (que, clave, recorte, hecho) => {
    const decir = (m) => { registrar(m); return m; };
    const config = comunidad();
    if (!claveDeJugadorValida(clave) || !config) return decir(`${que}: no se pudo (${config ? 'sin clave' : 'sin comunidad.json'}).`);
    const r = await recorte();
    if (typeof r === 'string') return decir(`${que}: no se pudo (${r}).`);
    const subida = await subirRecorte({ config, clave, recorte: r }, { fetch: pedirBaseDeDatos });
    return decir(subida.error ? `${que}: no se pudo (${subida.error}).` : hecho(r));
  };
  const versionDeLaApk = () => leerSaludDeLaApk(join(casa, 'salud.json'))?.apk ?? null;
  // Con la clave del LECTOR: son para medir el lector, no tuyos.
  servidor.subirRecortesDe = (c) => subirA('Subir los recortes del draft', claveDelLector(casa), async () => {
    const recortes = await servidor.interno.recortesDe(c?.ids);
    return recorteParaSubir({ correccion: c, recortes, version: versionDeLaApk() }) ?? (recortes.length ? 'no caben o sin la partida' : 'ninguna captura del draft se pudo recortar');
  }, (r) => `Recortes del draft subidos para medir el lector (${r.capturas.length} capturas, ${r.faltan} sin reconocer).`);
  // Con la clave con la que suben tus partidas: el móvil las lee con `mis_recortes` y TU clave.
  servidor.subirFinalDe = (f) => subirA('Subir las pantallas del final', claveConLaQueSube(), async () => finalParaSubir({ ...f, version: versionDeLaApk() }) ?? 'ninguna pantalla fuera de la partida',
    (r) => `Pantallas del final subidas para ver por qué no se reconoció (${r.capturas.length}).`);
  servidor.subirComprobanteDe = (c) => subirA('Subir el comprobante', claveConLaQueSube(), async () => comprobanteParaSubir({ ...c, version: versionDeLaApk() }) ?? 'la tabla no tiene franja',
    (r) => `Comprobante de la partida subido (${r.gane ? 'ganada' : 'perdida'}).`);
  const intentar = (fn) => (x) => { fn(x).catch((e) => registrar(`Subir a la base de datos: no se pudo (${e.message}).`)); };

  solo = crearSolo({
    interno: servidor.interno, ajustes, datosPara: datosDelSolo(leerDatos), registrar,
    apuntar: (p) => { if (partidas.apuntar(p)) subir(); },
    alCorregir,
    partidaGuardada: (t) => partidas.una(t),
    alCambiarResultado: (t, gane) => { const hecho = partidas.editar(t, { gane }); if (hecho) subir(); return hecho?.nueva ?? null; },
    numerosDe: () => tusNumeros(partidas.todas()),
    guardarSinResultado: (p) => partidas.guardarSinResultado(p),
    alFinalSinLeer: intentar(servidor.subirFinalDe),
    alApuntarTabla: intentar(servidor.subirComprobanteDe),
    alSinLeer: intentar(servidor.subirRecortesDe),
    // Tus habituales: la maestría del móvil más lo que la tablet apuntó DESPUÉS (lo de antes ya va dentro).
    maestriaDe: () => { const m = ajustes.delMovil(); return maestriaEfectiva(m?.maestria ?? {}, partidas.todas().filter((p) => p.t > (m?.cuando ?? 0))); },
  });

  /** Aprender de lo que arreglaste en el historial: los recortes de ESTA tablet (clave del lector) con la verdad de tus partidas. */
  servidor.aprenderDeLoArreglado = async () => {
    const decir = (m) => { registrar(m); return m; };
    const config = comunidad(), clave = claveConLaQueSube();
    if (!config || !claveDeJugadorValida(clave)) return decir(`Aprender de lo arreglado: no se pudo (${config ? 'sin clave' : 'sin comunidad.json'}).`);
    const [r, m] = await Promise.all([bajarMisRecortes(config, { clave: claveDelLector(casa), horas: DIAS_DE_RECORTES * 24, fetch: pedirBaseDeDatos }), traerMisPartidas({ config, clave }, { fetch: pedirBaseDeDatos })]);
    if (r.error || m.error) return decir(`Aprender de lo arreglado: no se pudo (${r.error ?? m.error}).`);
    const ficheroArreglos = join(casa, 'arreglos.json');
    let hechos = [];
    try { const j = JSON.parse(readFileSync(ficheroArreglos, 'utf8')); if (Array.isArray(j?.hechos)) hechos = j.hechos.filter((x) => typeof x === 'string'); } catch { /* primera vez */ }
    const drafts = draftsArreglados({ recortes: r.recortes, partidas: m.partidas, nombres: nombresDelCatalogo(), hechos });
    if (!drafts.length) return null;
    const hecho = await servidor.interno.aprenderDeArreglos(drafts.slice(0, ARREGLOS_POR_TANDA));
    try { writeFileSync(`${ficheroArreglos}.tmp`, JSON.stringify({ hechos: [...hechos, ...(hecho.hechos ?? [])].slice(-500) })); renameSync(`${ficheroArreglos}.tmp`, ficheroArreglos); } catch { /* sin disco: se repetirá */ }
    const fallidos = hecho.fallidos ? ` ${hecho.fallidos} no se pudo, lo intento la próxima vez.` : '';
    return decir(`Aprendido de ${hecho.mirados} drafts que arreglaste${hecho.aprendidos.length ? `: ${[...new Set(hecho.aprendidos)].join(', ')}` : ' (nada nuevo que no supiera)'}.${fallidos}`);
  };
  /** El parte de salud, con la clave del LECTOR y sin secretos: la revisión de la tablet lo lee de la base de datos. */
  servidor.subirParte = async () => {
    const clave = claveDelLector(casa), config = comunidad();
    if (!claveDeJugadorValida(clave) || !config) return;
    const leer = (f) => { try { return readFileSync(join(casa, f), 'utf8'); } catch { return null; } };
    const parte = parteDeSalud({ estado: servidor.interno.estado(), log: (leer('lector.log') ?? '').slice(-FINAL_DEL_REGISTRO_BYTES), falloNodo: leer('fallo-nodo.txt'), secretos: [codigo, clave, ajustes.delMovil()?.clave] });
    const r = await subirParte({ config, clave, parte }, { fetch: pedirBaseDeDatos });
    if (r.error && r.error !== 'pronto') registrar(`El parte de salud no se pudo subir (${r.error}).`);
  };
  servidor.partidas = partidas;
  servidor.subirPartidas = subir;
  servidor.solo = solo;

  // [D] Los relojes: subir partidas cada 10 min (la primera a los 30 s), el parte cada 15 (el primero a los 2),
  // lo arreglado cada 6 h (lo primero a los 5 min), el vistazo al minimapa y, con el modo solo, los datos de la web.
  const relojes = [
    setInterval(subir, 10 * 60 * 1000), setTimeout(subir, 30000),
    setInterval(() => { servidor.subirParte().catch(() => {}); }, PARTE_CADA_MS), setTimeout(() => { servidor.subirParte().catch(() => {}); }, 2 * 60 * 1000),
    setInterval(() => { servidor.aprenderDeLoArreglado().catch((e) => registrar(`Aprender de lo arreglado: no se pudo (${e.message}).`)); }, ARREGLOS_CADA_MS),
    setTimeout(() => { servidor.aprenderDeLoArreglado().catch((e) => registrar(`Aprender de lo arreglado: no se pudo (${e.message}).`)); }, 5 * 60 * 1000),
    setInterval(() => { servidor.interno.mirarPartida().catch(() => {}); }, VISTAZO_MS),
  ];
  if (env.LECTOR_SIN_SOLO !== '1') {
    solo.arrancar();
    const refrescar = async () => { const n = await bajarDatos(bajados); if (n) registrar(`Datos de Pick Assist al día (${n} ficheros).`); };
    relojes.push(setTimeout(refrescar, existsSync(join(bajados, FICHEROS.meta)) ? REFRESCAR_DATOS_MS : 30000), setInterval(refrescar, REFRESCAR_DATOS_MS));
  }
  servidor.on('close', () => { solo.parar(); for (const r of relojes) { clearInterval(r); clearTimeout(r); } });
  return servidor;
}
