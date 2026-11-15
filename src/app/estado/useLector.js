import { useCallback, useEffect, useRef, useState } from 'react';
import { INTERVALO_DRAFT_MS, PROTOCOLO } from '../../comun/contrato.js';
import {
  pedirDraft, corregirDraft, mandarAjustes, mandarResultado, pedirEstadoLector, pedirClaveDeLaTablet,
  buscarTabletUnaVez, sinLlegarALaTablet, FALLOS_DEL_LECTOR,
} from '../lector.js';
import { correccionDe, huellaDeNombres, huellaDeLaTablet } from './draftMovil.js';

/** [P] Lo que se queda a la vista el aviso de un fallo: lo que se lee con prisa no se queda tapando. */
const AVISO_MS = 12000;
/** [P] Cada cuánto se mira si la tablet sigue en su dirección (y si no, se busca). */
const SALUD_MS = 5 * 60 * 1000;
/** [P] Lo que se espera tras un toque antes de mandar la corrección: varios toques seguidos, una petición. */
const CORREGIR_TRAS_MS = 800;

/**
 * La tablet desde el móvil (protocolo 2): copia su draft cada
 * INTERVALO_DRAFT_MS con la app a la vista, «Leer solo» encendido y sin hoja
 * abierta; le manda lo que corriges, tus ajustes y el resultado; recoge la
 * partida que apunta; pide su clave si no tienes una; y si deja de contestar
 * la busca en la wifi. Sin tablet vinculada no hace nada.
 *
 * @param p.onPartida  (partida) la tablet trae una partida apuntada (`partida.registro`)
 */
export function useLector({ lectorTablet, setLectorTablet, lectorAuto, hoja, draft, pool, conCatalogo, ajustes, comunidad, onPartida }) {
  const [lector, setLector] = useState({ estado: 'libre', aviso: null, ultimo: null });
  const [partida, setPartida] = useState(null);
  const ocupado = useRef(false);
  // 401/429: no se insiste hasta volver a vincular (insistir bloquearía al móvil). 404: la APK es del protocolo viejo.
  const codigoMalo = useRef(false);
  const viejo = useRef(false);
  const ultimaTablet = useRef(null);
  // Lo que la tablet tiene ahora de ESE draft (lo copiado o lo corregido con éxito): se manda solo lo que difiere.
  const conocida = useRef('');
  const ajustesMandados = useRef('');
  const ultimo = useRef({});
  ultimo.current = { draft, pool, ajustes, onPartida, hoja };

  useEffect(() => {
    codigoMalo.current = false; viejo.current = false; ultimaTablet.current = null; conocida.current = ''; ajustesMandados.current = '';
    setLector({ estado: 'libre', aviso: null, ultimo: null });
    setPartida(null);
  }, [lectorTablet]);

  useEffect(() => {
    if (!lector.aviso) return undefined;
    const reloj = setTimeout(() => setLector((l) => (l.aviso ? { ...l, aviso: null } : l)), AVISO_MS);
    return () => clearTimeout(reloj);
  }, [lector.aviso]);

  const mandarAjustesSiFaltan = useCallback(async () => {
    const a = ultimo.current.ajustes;
    const huella = a ? JSON.stringify(a) : '';
    if (!huella || huella === ajustesMandados.current) return;
    if (await mandarAjustes(a)) ajustesMandados.current = huella;
  }, []);

  /** Copia el draft de la tablet. `silencioso` (leyendo solo): lo que falla no saca aviso salvo el código o la versión. */
  const copiar = useCallback(async ({ silencioso = false } = {}) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setLector((l) => ({ ...l, estado: 'leyendo', aviso: silencioso ? l.aviso : null }));
    try {
      const r = await pedirDraft();
      viejo.current = false;
      setPartida(r.partida);
      const { draft: d, pool: p, onPartida: alApuntar, hoja: abierta } = ultimo.current;
      // Una copia que vuelve con una hoja ya abierta no toca el draft: lo estás tocando tú (la siguiente, al cerrarla).
      if (abierta) { setLector((l) => ({ ...l, estado: 'libre' })); return; }
      // La partida apuntada primero: cierra el draft que se seguía, y un draft nuevo que llega con ella entra después.
      if (r.partida?.registro) alApuntar?.(r.partida);
      // El draft cuya partida ya está apuntada no se vuelve a copiar: se cierra con ella.
      const yaApuntado = r.partida?.registro && r.draft && r.partida.desde >= r.draft.desde;
      let nuevos = 0;
      if (r.draft && !yaApuntado) {
        ultimaTablet.current = r.draft;
        conocida.current = huellaDeLaTablet(r.draft);
        const f = d.fundir(r.draft, { pool: p });
        nuevos = f.nuevos.baneos + f.nuevos.enemigos + f.nuevos.aliados + (f.nuevos.tuyo ? 1 : 0);
      }
      const algo = !!r.draft && (r.draft.baneos.length + r.draft.enemigos.filter(Boolean).length + r.draft.aliados.filter(Boolean).length) > 0;
      setLector({ estado: 'libre', aviso: silencioso || nuevos ? null : (algo ? 'yaEstaba' : 'nada'), ultimo: { cuando: Date.now(), ok: true, nuevos } });
      mandarAjustesSiFaltan();
    } catch (e) {
      const tipo = FALLOS_DEL_LECTOR.includes(e?.tipo) ? e.tipo : 'error';
      if (tipo === 'codigo' || tipo === 'bloqueado') codigoMalo.current = true;
      if (tipo === 'antigua') viejo.current = true;
      const seDice = !silencioso || codigoMalo.current || viejo.current;
      setLector({ estado: 'libre', aviso: seDice ? tipo : null, ultimo: { cuando: Date.now(), ok: false, tipo } });
    } finally {
      ocupado.current = false;
    }
  }, [mandarAjustesSiFaltan]);

  // Leer solo: con la app a la vista, sin hoja abierta (se está tocando a mano) y con catálogo (sin él no resuelve nadie).
  useEffect(() => {
    if (!lectorTablet || !lectorAuto || !conCatalogo || hoja) return undefined;
    const tic = () => { if (!codigoMalo.current && !viejo.current && document.visibilityState === 'visible') copiar({ silencioso: true }); };
    tic();
    const reloj = setInterval(tic, INTERVALO_DRAFT_MS);
    document.addEventListener('visibilitychange', tic);
    return () => { clearInterval(reloj); document.removeEventListener('visibilitychange', tic); };
  }, [lectorTablet, lectorAuto, conCatalogo, hoja, copiar]);

  // Lo que tocas a mano manda sobre lo leído: se le dice a la tablet (una vez por cambio).
  useEffect(() => {
    if (!lectorTablet) return undefined;
    const c = correccionDe(draft);
    const t = ultimaTablet.current;
    if (!c || !t || t.desde !== c.desde) return undefined;
    const huella = huellaDeNombres(c);
    // Contra lo que la tablet tiene AHORA: un «Deshacer» que vuelve a lo copiado también se le manda.
    if (huella === conocida.current) return undefined;
    const reloj = setTimeout(() => { corregirDraft(c).then((ok) => { if (ok) conocida.current = huella; }); }, CORREGIR_TRAS_MS);
    return () => clearTimeout(reloj);
  }, [lectorTablet, draft.desdeTablet, draft.enemigos, draft.aliados, draft.baneos, draft.miPick]);

  // Tus ajustes (línea, rango, idioma, maestría, clave) cada vez que cambian.
  const huellaAjustes = ajustes ? JSON.stringify(ajustes) : '';
  useEffect(() => { if (lectorTablet && huellaAjustes) mandarAjustesSiFaltan(); }, [lectorTablet, huellaAjustes, mandarAjustesSiFaltan]);

  // Vinculado y sin clave propia: la de la tablet, para ver y arreglar lo mismo que «Mis partidas» de la APK.
  const clavePedida = useRef(false);
  useEffect(() => {
    if (!lectorTablet || !comunidad.config || comunidad.clave || clavePedida.current) return;
    clavePedida.current = true;
    pedirClaveDeLaTablet().then((clave) => { if (clave) comunidad.usarClave(clave); else clavePedida.current = false; });
  }, [lectorTablet, comunidad.config, comunidad.clave]);

  // La tablet cambió de IP: si no contesta, se busca en la wifi y se vincula sola a la nueva.
  useEffect(() => {
    if (!lectorTablet) return undefined;
    const tic = async () => {
      const estado = await pedirEstadoLector();
      if (estado.ok && estado.protocolo === PROTOCOLO) viejo.current = false;
      if (estado.ok || !sinLlegarALaTablet(estado.tipo)) return;
      const nueva = await buscarTabletUnaVez(lectorTablet);
      if (nueva && nueva.direccion !== lectorTablet.direccion) setLectorTablet(nueva);
    };
    tic();
    const reloj = setInterval(tic, SALUD_MS);
    return () => clearInterval(reloj);
  }, [lectorTablet, setLectorTablet]);

  /** El resultado de ESE draft a la tablet (que la apunta ella). */
  const resultado = useCallback((desde, gane, opciones) => mandarResultado({ desde, gane }, opciones), []);

  return { lector, copiar, partida, resultado, corregir: corregirDraft };
}
