import { useEffect, useRef, useState } from 'react';
import { esPrevia, esSupuesta, siguioConsejo } from '../../motor/registro.js';
import { recogerPerfil, exportarPerfil } from '../../motor/perfil.js';
import { urlDeIncidencia, TOPE_URL, tokenPlausible } from '../github.js';
import { paraSubir } from '../envio.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Veredicto } from './Veredicto.jsx';
import { Comunidad } from './Comunidad.jsx';
import { TusNumeros } from './TusNumeros.jsx';
import { TuSemana } from './TuSemana.jsx';
import { RevisionDraft } from './RevisionDraft.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Tus partidas: verlas, corregirlas y añadir las de antes. Dos cosas
 * distintas viven aquí: las apuntadas CON la app (dicen si la app acierta) y
 * las de tu historial del juego, metidas a mano (cuentan para tu maestría,
 * NO para comprobar si la app acierta: cuando las jugaste no había consejo
 * que seguir).
 */
/** Lo que dura el «Deshacer» de una partida quitada, como el del draft (`DESHACER_MS`, decisión de producto). */
export const QUITAR_MS = 6000;

/** Qué dice la línea de estado de la subida automática. */
function estadoDeEnvio(envio, t) {
  if (envio.enCurso) return t('hist.autoSubiendo');
  if (envio.error) return t(`hist.error.${envio.error}`);
  if (envio.pendiente) return t('hist.autoPendiente');
  if (envio.cuando) return t('hist.autoUltima', { fecha: new Date(envio.cuando).toLocaleString(), numero: envio.incidencia ?? '?' });
  return t('hist.autoNada');
}

export function HistorialPartidas({ partidas, pool, maestria = {}, datos = null, maestriaUsada = null, perfil = null, envio = null, comunidad = null, onImportar = null, onOlvidar, onCorregir, onCambiarHeroe, onCambiarDraft = null, onAnadir, onCerrar, t = tPorDefecto }) {
  const [anadiendo, setAnadiendo] = useState(false);
  const [heroe, setHeroe] = useState(null);
  const [aviso, setAviso] = useState(null);
  // La partida a la que se le está cambiando el héroe (3.47.0), por su instante.
  const [cambiando, setCambiando] = useState(null);
  // La × no borra en el acto (3.60.2): un toque en el borde de ⇄ caía en ella
  // y la partida se perdía sin vuelta atrás. Durante QUITAR_MS la fila dice
  // «Quitada · Deshacer»; después (o al cerrar la hoja) se borra de verdad.
  // No antes: la subida automática manda la marca de borrado a los 3 s, y en
  // el proyecto esa marca ya no se deshace.
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

  /**
   * Manda tus partidas al proyecto: abre una incidencia de GitHub YA RELLENA
   * con tu código de perfil dentro, y un bot (partidas.yml) la lee, la
   * guarda en historial/partidas.json y responde con la medida del modelo
   * contra tus drafts. Es público (es tu repositorio): se dice antes de
   * tocar. Si el código no cabe en la dirección, se copia al portapapeles y
   * la incidencia se abre vacía para pegarlo.
   *
   * Con la subida automática activada (3.10.0) no se abre nada: se sube por
   * la API a la incidencia de siempre, sin iniciar sesión en el navegador.
   */
  const [aviso2, setAviso2] = useState(null);
  const [tokenNuevo, setTokenNuevo] = useState('');
  const enviar = async () => {
    if (envio?.activo) {
      const r = await envio.enviar();
      setAviso2(r?.error ? t(`hist.error.${r.error}`) : t('hist.subida', { n: conApp, numero: r?.numero ?? '?' }));
      return;
    }
    const codigo = await exportarPerfil(recogerPerfil(paraSubir(perfil ?? { partidas, mastery: maestria })));
    const titulo = t('hist.enviarTitulo', { n: conApp, fecha: new Date().toLocaleDateString() });
    let url = urlDeIncidencia({ titulo, etiquetas: ['partidas'], cuerpo: `${t('hist.enviarCuerpo')}\n\n\`\`\`\n${codigo}\n\`\`\`` });
    if (url.length > TOPE_URL) {
      try { await navigator.clipboard.writeText(codigo); } catch { /* queda el código en «Tu perfil» */ }
      url = urlDeIncidencia({ titulo, etiquetas: ['partidas'], cuerpo: t('hist.enviarPegar') });
      setAviso2(t('hist.enviarCopiado'));
    } else {
      setAviso2(t('hist.enviarAbierto'));
    }
    window.open(url, '_blank', 'noopener');
  };

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
        <Veredicto partidas={partidas} maestria={maestria} t={t} />
        <TuSemana partidas={partidas} t={t} />
        <TusNumeros partidas={partidas} t={t} />
        <RevisionDraft datos={datos} partidas={partidas} maestria={maestriaUsada ?? maestria} t={t} />
        <p className="nota">{t('hist.resumenLineas', { total: partidas.length, conApp, previas: partidas.length - conApp })}</p>
        {/* La base de datos del proyecto: sin tus partidas dentro, el modelo
            no se puede medir en tu cola. */}
        <button className="ancho" disabled={!partidas.length || !!envio?.enCurso} onClick={enviar}>{t('hist.enviar')}</button>
        <p className="nota">{t(envio?.activo ? 'hist.enviarPistaAuto' : 'hist.enviarPista')}</p>
        {aviso2 && <p className="nota bien">{aviso2}</p>}
        {/* La subida automática (3.10.0): con un token de GitHub limitado a
            las incidencias de este repositorio, cada partida apuntada se
            sube sola. Sin pasar por el navegador ni iniciar sesión. */}
        <section className="envio-auto">
          <strong>{t('hist.auto')}</strong>
          {envio?.activo ? (
            <>
              <p className={`nota ${envio.error ? 'mal' : 'bien'}`}>{estadoDeEnvio(envio, t)}</p>
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
            <span className="partida-tipo">{esPrevia(p) ? t('hist.previa') : esSupuesta(p) ? t('hist.supuesta') : (siguioConsejo(p) ? t('hist.seguida') : t('hist.libre'))}</span>
            <button className="x" title={t('hist.cambiar')} aria-label={`${t('hist.cambiar')} · ${p.pick}`} onClick={() => onCorregir(p.t, !p.gane)}>⇄</button>
            <button className="x" title={t('hist.quitar')} aria-label={`${t('hist.quitar')} · ${p.pick}`} onClick={() => quitar(p.t)}>×</button>
          </div>
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
