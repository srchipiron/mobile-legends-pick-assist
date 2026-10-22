import { useCallback, useEffect, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { sanearLicencias, comprobarClave, claveDeEnlace, crearClaveDeAdministrador, firmarClave, enlaceDeClave, pasaLaPuerta } from '../licencia.js';

/** Lo que se espera a licencias.json antes de dar por buena la copia guardada. Decisión de producto. */
const PLAZO_LICENCIAS_MS = 4000;

/** La clave del enlace (`#clave=…`), una vez por carga, y fuera de la barra de direcciones. */
let enlaceLeido;
function claveDelEnlace() {
  if (enlaceLeido !== undefined) return enlaceLeido;
  try {
    enlaceLeido = claveDeEnlace(window.location.hash);
    if (enlaceLeido) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { enlaceLeido = null; }
  return enlaceLeido;
}

const mismaPublica = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

/**
 * Las claves de invitación (3.65.0): la clave de este usuario, la lista
 * publicada (`licencias.json`, sin caché; sin red, la última vista) y, en el
 * móvil de Javi, la administración: crear su clave de administrador, dar
 * claves, revocarlas y exigir clave para entrar. Publicar es escribir
 * `public/licencias.json` en el repositorio (`escribir`, de useEnvio: el
 * token no llega aquí).
 */
export function useLicencia({ escribir = null } = {}) {
  const [clave, setClaveCruda] = useState(() => claveDelEnlace() ?? leer(CLAVES.clave, null));
  const [licencias, setLicencias] = useState(() => (leer(CLAVES.licencias, null) ? sanearLicencias(leer(CLAVES.licencias, null)) : null));
  const [admin, setAdmin] = useState(() => leer(CLAVES.admin, null));
  const [emitidas, setEmitidas] = useState(() => (Array.isArray(leer(CLAVES.emitidas, [])) ? leer(CLAVES.emitidas, []) : []));
  const [comprobada, setComprobada] = useState(null);

  useEffect(() => { guardar(CLAVES.clave, clave); }, [clave]);
  useEffect(() => {
    let vivo = true;
    fetch(`./licencias.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(PLAZO_LICENCIAS_MS) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo && j) { const l = sanearLicencias(j); setLicencias(l); guardar(CLAVES.licencias, l); } })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    let vivo = true;
    if (!clave) { setComprobada(null); return undefined; }
    comprobarClave(clave, { publica: licencias?.publica, revocadas: licencias?.revocadas ?? [] }).then((c) => { if (vivo) setComprobada(c); });
    return () => { vivo = false; };
  }, [clave, licencias]);

  const esAdministrador = mismaPublica(admin?.publica, licencias?.publica) || (!!admin && !licencias?.publica);
  const setClave = useCallback((c) => setClaveCruda(typeof c === 'string' && c.trim() ? c.trim() : null), []);

  /** Publica licencias.json (y la deja ya puesta aquí, sin esperar al despliegue). */
  const publicar = useCallback(async (nuevas, mensaje) => {
    if (!escribir) return { error: 'sinToken' };
    const limpias = sanearLicencias(nuevas);
    const r = await escribir({ ruta: 'public/licencias.json', contenido: `${JSON.stringify(limpias, null, 2)}\n`, mensaje });
    if (!r.error) { setLicencias(limpias); guardar(CLAVES.licencias, limpias); }
    return r;
  }, [escribir]);

  /** La primera vez: la clave de administrador, guardada aquí y su parte pública publicada. */
  const crearAdministrador = useCallback(async () => {
    const par = await crearClaveDeAdministrador();
    const r = await publicar({ ...(licencias ?? {}), publica: par.publica, revocadas: [] }, 'Licencias: clave pública del administrador');
    if (!r.error) { setAdmin(par); guardar(CLAVES.admin, par); }
    return r;
  }, [licencias, publicar]);

  const emitir = useCallback(async ({ nombre, dias = null }) => {
    if (!admin?.privada) return { error: 'sinAdmin' };
    const c = await firmarClave({ nombre, dias, privada: admin.privada });
    const { datos } = await comprobarClave(c, { publica: admin.publica });
    const lista = [{ id: datos.id, nombre: datos.nombre, emitida: datos.emitida, caduca: datos.caduca }, ...emitidas].slice(0, 500);
    setEmitidas(lista); guardar(CLAVES.emitidas, lista);
    return { clave: c, enlace: enlaceDeClave(c), datos };
  }, [admin, emitidas]);

  const revocar = useCallback((id) => publicar({ ...licencias, revocadas: [...new Set([...(licencias?.revocadas ?? []), id])] }, 'Licencias: clave revocada'), [licencias, publicar]);
  const exigir = useCallback((si) => publicar({ ...licencias, exigir: !!si }, si ? 'Licencias: se exige clave para entrar' : 'Licencias: la app vuelve a estar abierta'), [licencias, publicar]);

  /** La copia de seguridad de la clave de administrador (para no perderla al cambiar de móvil). */
  const copiaDeAdministrador = admin ? JSON.stringify({ lectorAdmin: 1, ...admin }) : null;
  const restaurarAdministrador = useCallback((texto) => {
    try {
      const j = JSON.parse(texto);
      if (j?.lectorAdmin !== 1 || !j.privada || !j.publica) return false;
      const par = { publica: j.publica, privada: j.privada };
      setAdmin(par); guardar(CLAVES.admin, par);
      return true;
    } catch { return false; }
  }, []);

  return {
    clave, setClave, comprobada, licencias, esAdministrador, emitidas,
    pasa: pasaLaPuerta({ licencias, comprobada, esAdministrador }),
    crearAdministrador, emitir, revocar, exigir, copiaDeAdministrador, restaurarAdministrador,
  };
}
