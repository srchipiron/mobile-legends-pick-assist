import { useEffect, useRef, useState } from 'react';
import { bajarMisRecortes, claveDeJugadorValida } from '../basedatos.js';
import { comprobantes as comprobantesDe } from '../revisar.js';
import { ComprobarTablet } from './ComprobarTablet.jsx';
import { esPrevia, esSupuesta, esDudosa, siguioConsejo } from '../../motor/registro.js';
import { tokenPlausible } from '../github.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Veredicto } from './Veredicto.jsx';
import { Comunidad } from './Comunidad.jsx';
import { TusNumeros } from './TusNumeros.jsx';
import { TuSemana } from './TuSemana.jsx';
import { RevisionDraft } from './RevisionDraft.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/** Cuántas horas atrás se buscan los comprobantes: un mes (`mis_recortes` da como mucho los 50 últimos). */
const HORAS_DE_COMPROBANTES = 720;

/**
 * Tus partidas: verlas, corregirlas y añadir las de antes. Dos cosas
 * distintas viven aquí: las apuntadas CON la app (dicen si la app acierta) y
 * las de tu historial del juego, metidas a mano (cuentan para tu maestría,
 * NO para comprobar si la app acierta: cuando las jugaste no había consejo
 * que seguir).
 */
/** Lo que dura el «Deshacer» de una partida quitada, como el del draft (`DESHACER_MS`, decisión de producto). */
export const QUITAR_MS = 6000;

export function HistorialPartidas({ partidas, pool, maestria = {}, datos = null, maestriaUsada = null, perfil = null, envio = null, comunidad = null, comprobadas = [], onComprobar = null, onImportar = null, onOlvidar, onCorregir, onCambiarHeroe, onCambiarDraft = null, onRevisar = null, onAnalisis = null, onAnadir, onCerrar, t = tPorDefecto }) {
  const [anadiendo, setAnadiendo] = useState(false);
  const [heroe, setHeroe] = useState(null);
  const [aviso, setAviso] = useState(null);
  // La partida a la que se le está cambiando el héroe (3.47.0), por su instante.
  const [cambiando, setCambiando] = useState(null);
  // La × no borra en el acto (3.60.2): un toque en el borde de ⇄ caía en ella
  // y la partida se perdía sin vuelta atrás. Durante QUITAR_MS la fila dice
  // «Quitada · Deshacer»; después (o al cerrar la hoja) se borra de verdad.
  // No antes: la base de datos recibe la marca de borrado a los pocos segundos
  // (useComunidad), y allí esa marca ya no se deshace.
  const [quitando, setQuitando] = useState(null);
  const pendiente = useRef(null);
  const confirmarQuitada = () => {
    const q = pendiente.current;
    if (!q) return;
    clearTimeout(q.reloj);
    pendiente.current = null;
    setQuitando(null);
    onOlvidar(q.t);
  };
  const quitar = (t) => {
    confirmarQuitada();
    pendiente.current = { t, reloj: setTimeout(confirmarQuitada, QUITAR_MS) };
    setQuitando(t);
  };
  const deshacerQuitada = () => {
    if (pendiente.current) clearTimeout(pendiente.current.reloj);
    pendiente.current = null;
    setQuitando(null);
  };
  // Al cerrar la hoja, lo que estaba quitándose se quita.
  useEffect(() => () => confirmarQuitada(), []);
  const conApp = partidas.filter((p) => !esPrevia(p)).length;
  // Los comprobantes de la tablet (3.101.0): la pantalla del final de cada partida que apuntó sola, con TU clave.
  const [deLaTablet, setDeLaTablet] = useState(() => new Map());
  // Por sus valores y no por el objeto: la configuración se rehace al releer comunidad.json o al guardar, y cada vez se volvería a pedir.
  const url = comunidad?.config?.url ?? null;
  const publica = comunidad?.config?.clave ?? null;
  const clave = comunidad?.clave ?? null;
  useEffect(() => {
    if (!url || !publica || !claveDeJugadorValida(clave)) return undefined;
    let vivo = true;
    bajarMisRecortes({ url, clave: publica }, { clave, horas: HORAS_DE_COMPROBANTES }).then((r) => { if (vivo && !r.error) setDeLaTablet(comprobantesDe(r.recortes)); });
    return () => { vivo = false; };
  }, [url, publica, clave]);

  const [tokenNuevo, setTokenNuevo] = useState('');

  const guardar = (gane) => {
    if (!heroe) return;
    onAnadir(heroe, gane);
    setAviso(t('hist.anadida', { hero: heroe, resultado: gane ? t('hist.gane') : t('hist.perdi') }));
    setHeroe(null);
  };

  return (
    <Hoja etiqueta={t('hist.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('hist.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body">
        {/* Lo primero al abrir tus partidas: para qué las estás apuntando.
            Dentro del cuerpo que se desplaza: fijo arriba dejaba 208 px para
            la lista en un móvil de 640 de alto. */}
        {/* Con las capturas del lector (3.86.0): lo que no vio, cara a cara. También desde el PC. */}
        {onAnalisis && partidas.length > 0 && <button className="reset revisar-abrir ana-abrir" onClick={onAnalisis}>{t('ana.abrir')}</button>}
        {onRevisar && comunidad?.config && <button className="reset revisar-abrir" onClick={onRevisar}>{t('revisar.abrir')}</button>}
        {onComprobar && <ComprobarTablet partidas={partidas} comprobadas={comprobadas} comprobantes={deLaTablet} pool={pool} onComprobar={onComprobar} onCorregir={onCorregir} onCambiarHeroe={onCambiarHeroe} t={t} />}
        <Veredicto partidas={partidas} maestria={maestria} t={t} />
        <TuSemana partidas={partidas} t={t} />
        <TusNumeros partidas={partidas} t={t} />
        <RevisionDraft datos={datos} partidas={partidas} maestria={maestriaUsada ?? maestria} t={t} />
        <p className="nota">{t('hist.resumenLineas', { total: partidas.length, conApp, previas: partidas.length - conApp })}</p>
        {/* El token de GitHub (3.10.0), desde 3.98.0 solo para administrar
            (licencias, comunidad.json): tus partidas van a la base de datos. */}
        <section className="envio-auto">
          <strong>{t('hist.auto')}</strong>
          {envio?.activo ? (
            <>
              <p className="nota bien">{t('hist.autoActivo')}</p>
              <button className="ancho" onClick={() => envio.guardarToken(null)}>{t('hist.autoQuitar')}</button>
            </>
          ) : (
            <>
              <p className="nota">{t('hist.autoPista')}</p>
              <input type="password" autoComplete="off" spellCheck={false} placeholder={t('hist.autoPlaceholder')} aria-label={t('hist.autoPlaceholder')} value={tokenNuevo} onChange={(e) => setTokenNuevo(e.target.value)} />
              <button className="ancho" disabled={!envio || !tokenPlausible(tokenNuevo)} onClick={() => { envio.guardarToken(tokenNuevo); setTokenNuevo(''); }}>{t('hist.autoActivar')}</button>
              <p className="nota"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">{t('hist.autoCrear')}</a> {t('hist.autoComo')}</p>
            </>
          )}
        </section>
        {/* La base de datos de todos (3.69.0): solo con comunidad.json publicado. */}
        <Comunidad comunidad={comunidad} perfil={perfil ?? { partidas, mastery: maestria }} onImportar={onImportar ?? (() => {})} t={t} />
        <button className="ancho" onClick={() => setAnadiendo((v) => !v)}>{t('hist.anadir')}</button>
        {anadiendo && (
          <>
            <p className="nota">{t('hist.anadirPista')}</p>
            <strong>{t('hist.elegirHeroe')}</strong>
            <div className="hero-grid corto">
              {pool.map((h) => (
                <button key={h.name} className={heroe === h.name ? 'elegido' : ''} onClick={() => setHeroe(h.name)}>{h.name}</button>
              ))}
            </div>
            <div className="resultado">
              <button className="reset" disabled={!heroe} onClick={() => guardar(false)}>{t('hist.perdi')}</button>
              <button className="reset" disabled={!heroe} onClick={() => guardar(true)}>{t('hist.gane')}</button>
            </div>
            {aviso && <p className="nota bien">{aviso}</p>}
          </>
        )}
        <hr />
        {!partidas.length && <p className="nota">{t('hist.vacio')}</p>}
        {partidas.map((p) => (quitando === p.t ? (
          <div key={p.t} className="partida partida-quitada">
            <span>{t('hist.quitada', { hero: p.pick })}</span>
            <button className="filtro" onClick={deshacerQuitada}>{t('deshacer.boton')}</button>
          </div>
        ) : (
          <div key={p.t}>
          <div className="partida">
            <span className="partida-fecha">{new Date(p.t).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
            {/* Tocar el héroe lo cambia (3.47.0): el lector puede apuntar uno que no jugaste. */}
            <button className="partida-hero" aria-expanded={cambiando === p.t} aria-label={`${t('hist.cambiarHeroe')} · ${p.pick}`} onClick={() => setCambiando((c) => (c === p.t ? null : p.t))}>{p.pick}</button>
            <span className={p.gane ? 'partida-bien' : 'partida-mal'}>{p.gane ? t('hist.gane') : t('hist.perdi')}</span>
            <span className="partida-tipo">{esDudosa(p) ? t('hist.dudosa') : esPrevia(p) ? t('hist.previa') : esSupuesta(p) ? t('hist.supuesta') : (siguioConsejo(p) ? t('hist.seguida') : t('hist.libre'))}</span>
            {/* Confirmar el resultado tal cual (3.100.0): la marca `editada` la saca de las dudosas. */}
            {esDudosa(p) && <button className="x" title={t('hist.confirmar')} aria-label={`${t('hist.confirmar')} · ${p.pick}`} onClick={() => onCorregir(p.t, p.gane)}>✓</button>}
            <button className="x" title={t('hist.cambiar')} aria-label={`${t('hist.cambiar')} · ${p.pick}`} onClick={() => onCorregir(p.t, !p.gane)}>⇄</button>
            <button className="x" title={t('hist.quitar')} aria-label={`${t('hist.quitar')} · ${p.pick}`} onClick={() => quitar(p.t)}>×</button>
          </div>
          {/* La pantalla del final que leyó la tablet (3.101.0): para comprobar el resultado de un vistazo. */}
          {deLaTablet.get(p.t) && <img className="partida-comprobante" src={`data:image/png;base64,${deLaTablet.get(p.t).tira}`} alt={t('comprobar.pantalla')} />}
          {cambiando === p.t && (
            <div className="partida-cambiar">
              <strong>{t('hist.cambiarHeroePregunta')}</strong>
              <div className="hero-grid corto">
                {pool.map((h) => (
                  <button key={h.name} className={p.pick === h.name ? 'elegido' : ''} onClick={() => { onCambiarHeroe?.(p.t, h.name); setCambiando(null); }}>{h.name}</button>
                ))}
              </div>
              {onCambiarDraft && datos?.heroes && <EditarDraft partida={p} heroes={datos.heroes} onCambiar={(cambios) => onCambiarDraft(p.t, cambios)} t={t} />}
            </div>
          )}
          </div>
        )))}
      </div>
    </Hoja>
  );
}

/** Lo que cabe en cada equipo: cinco enemigos y cuatro compañeros (tú eres el quinto). */
const TOPE_EQUIPO = { enemigos: 5, aliados: 4 };

/**
 * Quién iba en cada equipo (3.78.0), para arreglarlo desde el móvil como en
 * «Mis partidas» de la tablet: quitar con la × o añadir escribiendo el
 * nombre (la lista de todos los héroes, en su grafía). Se guarda al momento,
 * con la hora del arreglo: así llega a la tablet y no lo pisa su copia.
 */
function EditarDraft({ partida, heroes, onCambiar, t }) {
  const [escrito, setEscrito] = useState({ enemigos: '', aliados: '' });
  const nombres = heroes.map((h) => h.name);
  const porClave = new Map(nombres.map((n) => [n.toLowerCase(), n]));
  const draft = partida.draft ?? {};
  const listaId = `heroes-${partida.t}`;
  const equipo = (lado) => {
    const actuales = draft[lado] ?? [];
    const nombre = porClave.get(escrito[lado].trim().toLowerCase());
    const yaEsta = nombre && (nombre === partida.pick || [...(draft.enemigos ?? []), ...(draft.aliados ?? [])].includes(nombre));
    const anadir = () => { onCambiar({ [lado]: [...actuales, nombre] }); setEscrito((e) => ({ ...e, [lado]: '' })); };
    return (
      <div className={`editar-equipo ${lado}`}>
        <strong>{t(`hist.draft.${lado}`)}</strong>
        <div className="editar-chips">
          {actuales.map((n) => (
            <span key={n} className="editar-chip">{n}<button className="x" aria-label={`${t('hist.draft.quitar')} · ${n}`} onClick={() => onCambiar({ [lado]: actuales.filter((x) => x !== n) })}>×</button></span>
          ))}
        </div>
        {actuales.length < TOPE_EQUIPO[lado] && (
          <div className="editar-anadir">
            <input type="text" list={listaId} autoComplete="off" placeholder={t('hist.draft.escribe')} aria-label={`${t('hist.draft.anadir')} · ${t(`hist.draft.${lado}`)}`} value={escrito[lado]} onChange={(e) => setEscrito((x) => ({ ...x, [lado]: e.target.value }))} />
            <button className="reset" disabled={!nombre || yaEsta} onClick={anadir}>{t('hist.draft.anadir')}</button>
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="editar-draft">
      <datalist id={listaId}>{nombres.map((n) => <option key={n} value={n} />)}</datalist>
      {equipo('enemigos')}
      {equipo('aliados')}
    </div>
  );
}
