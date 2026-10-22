import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { sanearLicencias, comprobarClave, claveDeEnlace, crearClaveDeAdministrador, firmarClave, enlaceDeClave, pasaLaPuerta } from '../licencia.js';

/** Lo que se espera a licencias.json antes de dar por buena la copia guardada. Decisión de producto. */
const PLAZO_LICENCIAS_MS = 4000;
const RUTA = 'public/licencias.json';

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
export function useLicencia({ escribir = null, leerRepositorio = null } = {}) {
  const [clave, setClaveCruda] = useState(() => claveDelEnlace() ?? leer(CLAVES.clave, null));
  const [licencias, setLicencias] = useState(() => (leer(CLAVES.licencias, null) ? sanearLicencias(leer(CLAVES.licencias, null)) : null));
  const [admin, setAdmin] = useState(() => leer(CLAVES.admin, null));
  const [emitidas, setEmitidas] = useState(() => (Array.isArray(leer(CLAVES.emitidas, [])) ? leer(CLAVES.emitidas, []) : []));
  const [comprobada, setComprobada] = useState(null);

  useEffect(() => { guardar(CLAVES.clave, clave); }, [clave]);
  // Lo leído del repositorio (con el token) manda sobre la copia de Pages,
  // que tarda minutos en rehacerse tras cada cambio (3.65.1).
  const delRepositorio = useRef(false);
  const ponerLicencias = useCallback((l) => { setLicencias(l); guardar(CLAVES.licencias, l); }, []);
  useEffect(() => {
    let vivo = true;
    fetch(`./licencias.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(PLAZO_LICENCIAS_MS) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo && j && !delRepositorio.current) ponerLicencias(sanearLicencias(j)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [ponerLicencias]);
  useEffect(() => {
    let vivo = true;
    if (!leerRepositorio) return undefined;
    leerRepositorio({ ruta: RUTA }).then((r) => {
      if (!vivo || r?.error) return;
      let j;
      try { j = r.contenido ? JSON.parse(r.contenido) : null; } catch { return; }
      delRepositorio.current = true;
      ponerLicencias(sanearLicencias(j));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [leerRepositorio, ponerLicencias]);
  useEffect(() => {
    let vivo = true;
    if (!clave) { setComprobada(null); return undefined; }
    comprobarClave(clave, { publica: licencias?.publica, revocadas: licencias?.revocadas ?? [] }).then((c) => { if (vivo) setComprobada(c); });
    return () => { vivo = false; };
  }, [clave, licencias]);

  const esAdministrador = mismaPublica(admin?.publica, licencias?.publica) || (!!admin && !licencias?.publica);
  const setClave = useCallback((c) => setClaveCruda(typeof c === 'string' && c.trim() ? c.trim() : null), []);

  /**
   * Publica licencias.json aplicando `cambio` a lo que hay AHORA en el
   * repositorio (no a la copia de aquí, que puede ser vieja: dos cambios
   * seguidos se pisaban), y lo deja ya puesto aquí sin esperar al despliegue.
   */
  const publicar = useCallback(async (cambio, mensaje) => {
    if (!escribir) return { error: 'sinToken' };
    let limpias = null;
    const r = await escribir({
      ruta: RUTA, mensaje,
      contenido: (actual) => {
        let j;
        try { j = actual ? JSON.parse(actual) : null; } catch { j = null; }
        const base = sanearLicencias(j);
        // Sin pública en el repositorio y con la clave de administrador aquí, se
        // vuelve a poner la suya (3.65.1: una copia vieja la borró una vez).
        limpias = sanearLicencias(cambio(!base.publica && admin?.publica ? { ...base, publica: admin.publica } : base));
        return `${JSON.stringify(limpias, null, 2)}\n`;
      },
    });
    if (!r.error && limpias) { delRepositorio.current = true; ponerLicencias(limpias); }
    return r;
  }, [escribir, ponerLicencias, admin]);

  /**
   * La primera vez: la clave de administrador, guardada aquí y su parte
   * pública publicada. Si ya hay OTRA publicada, no se pisa sin `forzar`:
   * pisarla deja sin valor todas las claves dadas (lo normal es restaurar
   * la copia de seguridad).
   */
  const crearAdministrador = useCallback(async ({ forzar = false } = {}) => {
    const par = await crearClaveDeAdministrador();
    const r = await publicar((l) => {
      if (l.publica && !forzar) throw new Error('yaHay');
      return { ...l, publica: par.publica, revocadas: [] };
    }, 'Licencias: clave pública del administrador');
    if (!r.error) { setAdmin(par); guardar(CLAVES.admin, par); }
    return r;
  }, [publicar]);

  const emitir = useCallback(async ({ nombre, dias = null }) => {
    if (!admin?.privada) return { error: 'sinAdmin' };
    const c = await firmarClave({ nombre, dias, privada: admin.privada });
    const { datos } = await comprobarClave(c, { publica: admin.publica });
    const lista = [{ id: datos.id, nombre: datos.nombre, emitida: datos.emitida, caduca: datos.caduca }, ...emitidas].slice(0, 500);
    setEmitidas(lista); guardar(CLAVES.emitidas, lista);
    return { clave: c, enlace: enlaceDeClave(c), datos };
  }, [admin, emitidas]);

  const revocar = useCallback((id) => publicar((l) => ({ ...l, revocadas: [...new Set([...l.revocadas, id])] }), 'Licencias: clave revocada'), [publicar]);
  /** Vuelve a publicar la pública del administrador si falta (sin tocar lo demás). */
  const republicar = useCallback(() => publicar((l) => l, 'Licencias: clave pública del administrador'), [publicar]);
  const exigir = useCallback((si) => publicar((l) => ({ ...l, exigir: !!si }), si ? 'Licencias: se exige clave para entrar' : 'Licencias: la app vuelve a estar abierta'), [publicar]);

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
    crearAdministrador, emitir, revocar, exigir, republicar, copiaDeAdministrador, restaurarAdministrador,
  };
}
