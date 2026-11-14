import { useEffect, useRef, useState } from 'react';
import { bajarMisRecortes, claveDeJugadorValida } from '../../comun/basedatos.js';
import { esPrevia, esSupuesta, esDudosa, siguioConsejo } from '../../motor/registro.js';
import { comprobantes as comprobantesDe } from '../revisar.js';
import { tokenPlausible } from '../github.js';
import { ComprobarTablet } from './ComprobarTablet.jsx';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Veredicto } from './Veredicto.jsx';
import { Comunidad } from './Comunidad.jsx';
import { TusNumeros, TuSemana } from './TusNumeros.jsx';
import { RevisionDraft } from './RevisionDraft.jsx';
import { RejillaDeHeroes } from './RejillaDeHeroes.jsx';
import { useT } from '../i18n/contexto.js';

/** [P] Un mes de comprobantes (`mis_recortes` da como mucho los 50 últimos). */
const HORAS_DE_COMPROBANTES = 720;
/** [P] Lo que dura el «Deshacer» de una partida quitada, como el del draft. */
export const QUITAR_MS = 6000;
/** [D] Lo que cabe en cada equipo: cinco enemigos y cuatro compañeros (tú eres el quinto). */
const TOPE_EQUIPO = { enemigos: 5, aliados: 4 };

/**
 * Tus partidas: comprobar las de la tablet, tus números, el token de
 * administración, la base de datos, añadir las de antes y la lista para
 * corregir resultado, héroe y equipos. La × no borra en el acto: la fila dice
 * «Quitada · Deshacer» QUITAR_MS (al cerrar la hoja, se quita), ANTES de que
 * la marca llegue a la base de datos, donde ya no se deshace.
 */
export function HistorialPartidas({ personal, datos, pool, perfil, token, comunidad, onImportar, onRevisar, onAnalisis, onCerrar }) {
  const t = useT();
  const { partidas, maestria, maestriaUsada } = personal;
  const [anadiendo, setAnadiendo] = useState(false);
  const [heroe, setHeroe] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [cambiando, setCambiando] = useState(null);
  const [tokenNuevo, setTokenNuevo] = useState('');
  const [quitando, setQuitando] = useState(null);
  const pendiente = useRef(null);
  const confirmarQuitada = () => {
    const q = pendiente.current;
    if (!q) return;
    clearTimeout(q.reloj);
    pendiente.current = null;
    setQuitando(null);
    personal.olvidarPartida(q.t);
  };
  const quitar = (t0) => {
    confirmarQuitada();
    pendiente.current = { t: t0, reloj: setTimeout(confirmarQuitada, QUITAR_MS) };
    setQuitando(t0);
  };
  const deshacerQuitada = () => {
    if (pendiente.current) clearTimeout(pendiente.current.reloj);
    pendiente.current = null;
    setQuitando(null);
  };
  useEffect(() => () => confirmarQuitada(), []);

  // Los comprobantes de la tablet, con TU clave. Atado a los valores, no al objeto (se rehace en cada subida).
  const [deLaTablet, setDeLaTablet] = useState(() => new Map());
  const url = comunidad?.config?.url ?? null;
  const publica = comunidad?.config?.clave ?? null;
  const clave = comunidad?.clave ?? null;
  useEffect(() => {
    if (!url || !publica || !claveDeJugadorValida(clave)) return undefined;
    let vivo = true;
    bajarMisRecortes({ url, clave: publica }, { clave, horas: HORAS_DE_COMPROBANTES }).then((r) => { if (vivo && !r.error) setDeLaTablet(comprobantesDe(r.recortes)); });
    return () => { vivo = false; };
  }, [url, publica, clave]);

  const conApp = partidas.filter((p) => !esPrevia(p)).length;
  const guardar = (gane) => {
    if (!heroe) return;
    personal.apuntarPartida({ pick: heroe, gane, previa: true, rango: datos.rango });
    setAviso(t('hist.anadida', { hero: heroe, resultado: gane ? t('hist.gane') : t('hist.perdi') }));
    setHeroe(null);
  };
  const tipo = (p) => (esDudosa(p) ? t('hist.dudosa') : esPrevia(p) ? t('hist.previa') : esSupuesta(p) ? t('hist.supuesta') : siguioConsejo(p) ? t('hist.seguida') : t('hist.libre'));

  return (
    <Hoja etiqueta={t('hist.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('hist.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body">
        {partidas.length > 0 && <button className="reset revisar-abrir ana-abrir" onClick={onAnalisis}>{t('ana.abrir')}</button>}
        {comunidad?.config && <button className="reset revisar-abrir" onClick={onRevisar}>{t('revisar.abrir')}</button>}
        <ComprobarTablet personal={personal} comprobantes={deLaTablet} pool={pool} />
        <Veredicto partidas={partidas} maestria={maestria} />
        <TuSemana partidas={partidas} />
        <TusNumeros partidas={partidas} />
        <RevisionDraft datos={datos} partidas={partidas} maestria={maestriaUsada ?? maestria} />
        <p className="nota">{t('hist.resumenLineas', { total: partidas.length, conApp, previas: partidas.length - conApp })}</p>
        {/* El token de GitHub, solo para administrar (licencias, comunidad.json). */}
        <section className="envio-auto">
          <strong>{t('hist.auto')}</strong>
          {token.activo ? (
            <>
              <p className="nota bien">{t('hist.autoActivo')}</p>
              <button className="ancho" onClick={() => token.guardarToken(null)}>{t('hist.autoQuitar')}</button>
            </>
          ) : (
            <>
              <p className="nota">{t('hist.autoPista')}</p>
              <input type="password" autoComplete="off" spellCheck={false} placeholder={t('hist.autoPlaceholder')} aria-label={t('hist.autoPlaceholder')} value={tokenNuevo} onChange={(e) => setTokenNuevo(e.target.value)} />
              <button className="ancho" disabled={!tokenPlausible(tokenNuevo)} onClick={() => { token.guardarToken(tokenNuevo); setTokenNuevo(''); }}>{t('hist.autoActivar')}</button>
              <p className="nota"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">{t('hist.autoCrear')}</a> {t('hist.autoComo')}</p>
            </>
          )}
        </section>
        <Comunidad comunidad={comunidad} perfil={perfil} onImportar={onImportar} />
        <button className="ancho" onClick={() => setAnadiendo((v) => !v)}>{t('hist.anadir')}</button>
        {anadiendo && (
          <>
            <p className="nota">{t('hist.anadirPista')}</p>
            <strong>{t('hist.elegirHeroe')}</strong>
            <RejillaDeHeroes className="corto" heroes={pool} elegido={(h) => heroe === h.name} onElegir={(h) => setHeroe(h.name)} />
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
              <button className="partida-hero" aria-expanded={cambiando === p.t} aria-label={`${t('hist.cambiarHeroe')} · ${p.pick}`} onClick={() => setCambiando((c) => (c === p.t ? null : p.t))}>{p.pick}</button>
              <span className={p.gane ? 'partida-bien' : 'partida-mal'}>{p.gane ? t('hist.gane') : t('hist.perdi')}</span>
              <span className="partida-tipo">{tipo(p)}</span>
              {/* Confirmar tal cual: la marca `editada` la saca de las dudosas. */}
              {esDudosa(p) && <button className="x" title={t('hist.confirmar')} aria-label={`${t('hist.confirmar')} · ${p.pick}`} onClick={() => personal.corregirPartida(p.t, p.gane)}>✓</button>}
              <button className="x" title={t('hist.cambiar')} aria-label={`${t('hist.cambiar')} · ${p.pick}`} onClick={() => personal.corregirPartida(p.t, !p.gane)}>⇄</button>
              <button className="x" title={t('hist.quitar')} aria-label={`${t('hist.quitar')} · ${p.pick}`} onClick={() => quitar(p.t)}>×</button>
            </div>
            {deLaTablet.get(p.t) && <img className="partida-comprobante" src={`data:image/png;base64,${deLaTablet.get(p.t).tira}`} alt={t('comprobar.pantalla')} />}
            {cambiando === p.t && (
              <div className="partida-cambiar">
                <strong>{t('hist.cambiarHeroePregunta')}</strong>
                <RejillaDeHeroes className="corto" heroes={pool} elegido={(h) => p.pick === h.name} onElegir={(h) => { personal.cambiarHeroePartida(p.t, h.name); setCambiando(null); }} />
                {datos?.heroes && <EditarDraft partida={p} heroes={datos.heroes} onCambiar={(cambios) => personal.cambiarDraftPartida(p.t, cambios)} />}
              </div>
            )}
          </div>
        )))}
      </div>
    </Hoja>
  );
}

/**
 * Quién iba en cada equipo, para arreglarlo como en «Mis partidas» de la
 * tablet: × para quitar y un campo con la lista de héroes para añadir. Se
 * guarda al momento, con la hora del arreglo.
 */
function EditarDraft({ partida, heroes, onCambiar }) {
  const t = useT();
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
