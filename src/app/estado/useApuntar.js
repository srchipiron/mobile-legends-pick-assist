import { useCallback, useEffect, useRef, useState } from 'react';
import { fundirPerfil, sanear } from '../../motor/perfil.js';
import { correccionDe } from './draftMovil.js';

/** [P] Lo que dura el «Deshacer» de una partida apuntada: más que el de un toque, porque nadie lo esperaba. */
export const DESHACER_APUNTADA_MS = 20000;
/** [D] Las hojas del draft: una partida apuntada las cierra; las demás (lo que estés escribiendo) no. */
const HOJAS_DEL_DRAFT = ['enemigos', 'aliados', 'baneos', 'yo', 'apuntar'];

/**
 * Apuntar la partida. Sin tablet (o con un draft hecho a mano) la apunta el
 * móvil, con la estimación que había delante para ESE héroe y el draft
 * entero. Con un draft de la tablet la apunta ELLA: el móvil le manda el
 * resultado (`POST /resultado`) pasado el plazo del «Deshacer» y recibe la
 * partida en `partida.registro`, que funde con el mismo `t`. Si la tablet no
 * contesta, el móvil la apunta para no perderla.
 */
export function useApuntar({ datos, rec, draft, personal, perfil, linea, hoja, cerrar, vinculada, tablet, traerPerfil }) {
  // El aviso «Partida apuntada · Deshacer»: { t|null, gane, antes, aMano, desde? }.
  const [apuntada, setApuntada] = useState(null);
  const pendiente = useRef(null);
  const fundidas = useRef(new Set());

  /** La partida tal como la apunta el móvil. */
  const guardarPartida = (pick, gane, { t = Date.now(), supuesto = false } = {}) => {
    const heroe = datos.porNombre.get(pick);
    const est = heroe ? rec.estimacionCon(heroe) : null;
    const l = draft.lectura;
    personal.apuntarPartida({
      t, pick, gane, rango: datos.rango,
      ...(supuesto ? { supuesto: true } : {}),
      recomendados: rec.ranking.slice(0, 3).map((r) => r.heroe.name),
      ...(est ? { estimacion: est.p } : {}),
      bans: draft.baneos,
      draft: { linea, enemigos: draft.enemigos, aliados: draft.aliados, rival: rec.rival.nombre },
      ...(rec.yo?.name === pick && rec.partida?.fases?.puntos ? { fases: rec.partida.fases.puntos.map((x) => x.p) } : {}),
      // Lo que leyó la tablet en este draft, para medir cuánto acierta.
      ...(l ? { lector: { baneos: l.baneos, enemigos: l.enemigos, ...(l.aliados ? { aliados: l.aliados } : {}), ...(l.tuyo ? { tuyo: l.tuyo } : {}) } } : {}),
    });
  };

  /** El resultado que esperaba su plazo sale a la tablet; si no lo toma, se apunta aquí. */
  const mandarResultado = tablet.resultado;
  const enviarPendiente = useCallback(async ({ alSalir = false } = {}) => {
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    clearTimeout(p.reloj);
    const ok = await mandarResultado(p.desde, p.gane, { keepalive: alSalir });
    if (!ok) p.apuntarAqui();
  }, [mandarResultado]);

  /**
   * Gané/Perdí desde el recordatorio o «Apuntar partida», con el MISMO
   * «Deshacer» que una apuntada por la tablet: desapunta y devuelve el draft.
   * `gane` null es «No la terminé» (solo con un draft de la tablet).
   */
  const apuntarAMano = (gane, elegido = null) => {
    const desde = draft.desdeTablet;
    // «No la terminé»: la tablet deja de vigilarla y el draft se vacía (con su «Deshacer»).
    if (gane === null) {
      if (vinculada && desde) tablet.resultado(desde, null);
      cerrar();
      draft.vaciarConDeshacer();
      return;
    }
    const pick = elegido ?? draft.miPick ?? rec.eleccion?.heroe.name;
    if (!pick) return;
    const antes = draft.foto();
    const deshechaAlli = tablet.partida?.desde === desde && tablet.partida?.registro && personal.olvidadas.includes(tablet.partida.registro.t);
    if (vinculada && desde && !deshechaAlli) {
      enviarPendiente();
      if (elegido && elegido !== draft.miPick) tablet.corregir({ ...correccionDe(draft), tuyo: elegido });
      const apuntarAqui = () => guardarPartida(pick, gane, { supuesto: !elegido && !antes.miPick });
      pendiente.current = { desde, gane, apuntarAqui, reloj: setTimeout(() => enviarPendiente(), DESHACER_APUNTADA_MS) };
      setApuntada({ t: null, gane, antes, aMano: true, desde });
    } else {
      const t = Date.now();
      guardarPartida(pick, gane, { t });
      if (vinculada && desde) tablet.resultado(desde, gane);
      setApuntada({ t, gane, antes, aMano: true });
    }
    cerrar();
    draft.reiniciar();
  };

  /**
   * La tablet apuntó una partida (`partida.registro`): se funde con su `t`
   * (una quitada aquí no vuelve). Si es la del draft que tienes delante, el
   * draft se cierra con ella y queda el «Deshacer».
   */
  const deLaTablet = (p) => {
    const r = p.registro;
    if (!r || personal.olvidadas.includes(r.t)) return;
    const llave = `${r.t}|${r.gane}|${r.editada ?? ''}|${r.pick}`;
    if (!fundidas.current.has(llave)) {
      fundidas.current.add(llave);
      traerPerfil(fundirPerfil(perfil, sanear({ partidas: [r], mastery: {}, olvidadas: [] })));
    }
    if (draft.desdeTablet !== p.desde || (draft.ignorarTabletHasta ?? 0) >= p.desde) return;
    setApuntada({ t: r.t, gane: r.gane === true, antes: draft.foto() });
    if (HOJAS_DEL_DRAFT.includes(hoja)) cerrar();
    draft.reiniciar();
  };

  useEffect(() => {
    if (!apuntada) return undefined;
    const reloj = setTimeout(() => setApuntada((a) => (a === apuntada ? null : a)), DESHACER_APUNTADA_MS);
    return () => clearTimeout(reloj);
  }, [apuntada]);

  // Si la app se va (se cierra, se recarga), lo que esperaba su plazo sale ya.
  useEffect(() => {
    const salir = () => enviarPendiente({ alSalir: true });
    window.addEventListener('pagehide', salir);
    return () => window.removeEventListener('pagehide', salir);
  }, [enviarPendiente]);

  const deshacerApuntada = () => {
    if (!apuntada) return;
    if (apuntada.desde && pendiente.current?.desde === apuntada.desde) { clearTimeout(pendiente.current.reloj); pendiente.current = null; }
    if (apuntada.t) personal.olvidarPartida(apuntada.t);
    draft.restaurar(apuntada.antes);
    setApuntada(null);
  };
  const cerrarAviso = () => { setApuntada(null); enviarPendiente(); };

  return { apuntada, apuntarAMano, deLaTablet, deshacerApuntada, cerrarAviso };
}
