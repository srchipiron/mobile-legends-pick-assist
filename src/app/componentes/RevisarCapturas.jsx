import { useEffect, useMemo, useState } from 'react';
import { bajarRecortes } from '../basedatos.js';
import { revisiones, cambiosDeRevision, encuadre, tusMasJugados, HORAS_DE_RECORTES } from '../revisar.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { PegarClave } from './Comunidad.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/** A qué escala se pintan las caras (píxeles por píxel de la referencia): 85 px de ancho las de tu equipo. Decisión de producto. */
const ESCALA = 0.45;
/** En el ordenador (3.87.0), más grandes: 133 px las de tu equipo, que es lo que deja ver la skin. Decisión de producto. */
const ESCALA_PC = 0.7;
/** Desde qué ancho es «ordenador»: el mismo corte que pone las tarjetas a dos columnas en styles.css. */
export const ANCHO_PC = 1100;

const esAncho = () => typeof window !== 'undefined' && !!window.matchMedia?.(`(min-width: ${ANCHO_PC}px)`).matches;
function useAncho() {
  const [ancho, setAncho] = useState(esAncho);
  useEffect(() => {
    const m = window.matchMedia?.(`(min-width: ${ANCHO_PC}px)`);
    if (!m?.addEventListener) return undefined;
    const cambio = () => setAncho(m.matches);
    m.addEventListener('change', cambio);
    return () => m.removeEventListener('change', cambio);
  }, []);
  return ancho;
}

/** El enlace que abre la app directamente en «Capturas» (3.87.0): para el ordenador. */
export const enlaceDeCapturas = () => `${window.location.origin}${window.location.pathname}#capturas`;

/**
 * Revisar lo que no vio el lector, con sus capturas (3.86.0): las caras de
 * cada draft que la tablet no leyó entero, junto a un campo por hueco. Se
 * hace igual desde el móvil que desde el PC (la misma app, con tu clave de
 * la base de datos). Guardar arregla la partida: llega a la tablet y la
 * tablet aprende de ella.
 */
export function RevisarCapturas({ partidas, datos, comunidad, perfil, onImportar, onGuardar, onCerrar, t = tPorDefecto }) {
  const [recortes, setRecortes] = useState(null);
  const [error, setError] = useState(null);
  const [todas, setTodas] = useState(false);
  const [avisoClave, setAvisoClave] = useState(null);
  // «Guardada» va aquí y no en la partida (3.87.1): guardada, deja de estar pendiente y sale de la lista.
  const [guardada, setGuardada] = useState(false);
  const escala = useAncho() ? ESCALA_PC : ESCALA;
  const config = comunidad?.config ?? null;
  useEffect(() => {
    if (!config) return undefined;
    let vivo = true;
    bajarRecortes(config, { horas: HORAS_DE_RECORTES }).then((r) => {
      if (!vivo) return;
      if (r.error) setError(r.error); else setRecortes(r.recortes);
    });
    return () => { vivo = false; };
  }, [config]);
  const nombres = useMemo(() => (datos?.heroes ?? []).map((h) => h.name), [datos]);
  const lista = useMemo(() => (recortes ? revisiones(recortes, partidas, nombres) : []), [recortes, partidas, nombres]);
  const pendientes = lista.filter((r) => r.pendiente);
  const vistas = todas ? lista : pendientes;
  // Guardada una, la siguiente que falta sube a la vista: de una en una, sin buscarla.
  const aLaSiguiente = (t0) => {
    const siguiente = pendientes.find((r) => r.t !== t0 && r.t < t0) ?? pendientes.find((r) => r.t !== t0);
    if (siguiente) setTimeout(() => document.getElementById(`revisar-${siguiente.t}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  return (
    <Hoja etiqueta={t('revisar.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('revisar.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body revisar">
        <p className="nota">{t('revisar.queEs')}</p>
        <p className="nota revisar-enlace">{t('revisar.enlace')} <a href={enlaceDeCapturas()}>{enlaceDeCapturas()}</a></p>
        {config && comunidad && !comunidad.clave && (
          <div className="revisar-clave">
            <p className="nota">{t('revisar.pegaClave')}</p>
            <PegarClave comunidad={comunidad} perfil={perfil} onImportar={onImportar} avisar={setAvisoClave} t={t} />
          </div>
        )}
        {avisoClave && <p className={avisoClave.mal ? 'nota mal' : 'nota bien'} role="status">{avisoClave.texto}</p>}
        <datalist id="revisar-heroes">{nombres.map((n) => <option key={n} value={n} />)}</datalist>
        {!config && <p className="nota mal">{t('revisar.sinBase')}</p>}
        {config && !recortes && !error && <p className="nota">{t('revisar.cargando')}</p>}
        {error && <p className="nota mal">{t('revisar.error', { error })}</p>}
        {recortes && (
          <p className="nota">
            {t('revisar.cuantas', { n: pendientes.length, total: lista.length })}
            {lista.length > pendientes.length && <button className="filtro revisar-todas" onClick={() => setTodas((x) => !x)}>{t(todas ? 'revisar.soloPendientes' : 'revisar.verTodas')}</button>}
          </p>
        )}
        {recortes && !partidas.length && <p className="nota">{t('revisar.sinPartidas')}</p>}
        {guardada && <p className="nota bien revisar-guardada" role="status">{t('revisar.guardada')}</p>}
        <div className="revisar-lista">
          {vistas.map((r) => <Revision key={r.t} r={r} nombres={nombres} partidas={partidas} escala={escala} onGuardar={(t0, c) => { onGuardar(t0, c); setGuardada(true); aLaSiguiente(t0); }} onCambio={() => setGuardada(false)} t={t} />)}
        </div>
      </div>
    </Hoja>
  );
}

function Cara({ png, lado, i, etiqueta, escala }) {
  const e = encuadre(lado, i, escala);
  return <span className="revisar-cara" role="img" aria-label={etiqueta} style={{ width: e.ancho, height: e.alto, backgroundImage: `url("data:image/png;base64,${png}")`, backgroundSize: e.fondo, backgroundPosition: e.posicion }} />;
}

function Revision({ r, nombres, partidas, escala, onGuardar, onCambio, t }) {
  const [captura, setCaptura] = useState(0);
  const [entera, setEntera] = useState(false);
  const [enemigos, setEnemigos] = useState(() => r.enemigos.map((n) => n ?? ''));
  const [aliados, setAliados] = useState(() => r.aliados.map((n) => n ?? ''));
  const [tuyo, setTuyo] = useState(r.tuyoFila < 0 && !r.partida.supuesto ? r.partida.pick ?? '' : '');
  const [aviso, setAviso] = useState(null);
  const png = r.capturas[captura]?.png ?? r.capturas[0].png;
  // Tus más jugados para tu hueco (3.87.3), sin los que ya están escritos en esta partida.
  const tuyos = useMemo(() => tusMasJugados(partidas, nombres, [...enemigos, ...aliados.filter((_, i) => i !== r.tuyoFila)]), [partidas, nombres, enemigos, aliados, r.tuyoFila]);
  const ponerTuyo = (h) => {
    if (r.tuyoFila >= 0) setAliados((x) => x.map((n, k) => (k === r.tuyoFila ? h : n))); else setTuyo(h);
    setAviso(null); onCambio?.();
  };
  const botonesTuyos = tuyos.length > 0 && (
    <div className="revisar-tuyos" role="group" aria-label={t('revisar.tuyos')}>
      {tuyos.map((h) => <button key={h} type="button" className="filtro" onClick={() => ponerTuyo(h)}>{h}</button>)}
    </div>
  );
  const campo = (lado, lista, poner, i) => (
    <input
      type="text" list="revisar-heroes" autoComplete="off" value={lista[i]}
      aria-label={`${t(`revisar.${lado}`)} ${i + 1}`}
      placeholder={lado === 'aliados' && i === r.tuyoFila ? t('revisar.tu') : t('revisar.quien')}
      onChange={(ev) => { const v = ev.target.value; poner((x) => x.map((n, k) => (k === i ? v : n))); setAviso(null); onCambio?.(); }}
    />
  );
  const guardar = () => {
    const c = cambiosDeRevision({ enemigos, aliados, tuyoFila: r.tuyoFila, tuyo }, nombres);
    if (c.error) { setAviso({ mal: true, texto: t(`revisar.error.${c.error}`) }); return; }
    onGuardar(r.t, c);
    setAviso(null);
  };
  return (
    <section id={`revisar-${r.t}`} className={`revisar-partida${r.pendiente ? ' pendiente' : ''}`}>
      <h3>
        {new Date(r.t).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {' · '}<span className={r.partida.gane ? 'partida-bien' : 'partida-mal'}>{r.partida.gane ? t('hist.gane') : t('hist.perdi')}</span>
        {r.capturas.length > 1 && <button className="filtro" onClick={() => setCaptura((c) => 1 - c)}>{t('revisar.otraCaptura', { n: captura + 1, total: r.capturas.length })}</button>}
        <button className="filtro revisar-ver-entera" aria-pressed={entera} onClick={() => setEntera((x) => !x)}>{t('revisar.entera')}</button>
      </h3>
      <div className="revisar-equipos">
        {/* La captura entera (3.87.0): con la cara recortada a veces no basta; aquí se ven las diez juntas. En el ordenador, al lado. */}
        {entera && <img className="revisar-entera" alt={t('revisar.entera')} src={`data:image/png;base64,${png}`} />}
        <div className="revisar-equipo">
          <strong>{t('revisar.aliados')}</strong>
          {aliados.map((_, i) => (
            <div key={i} className={`revisar-hueco${i === r.tuyoFila ? ' tuyo' : ''}`}>
              <Cara png={png} lado="aliados" i={i} escala={escala} etiqueta={t('revisar.cara', { equipo: t('revisar.aliados'), n: i + 1 })} />
              {campo('aliados', aliados, setAliados, i)}
              {i === r.tuyoFila && !aliados[i] && botonesTuyos}
            </div>
          ))}
          {r.tuyoFila < 0 && (
            <label className="revisar-tu">{t('revisar.tuSinFila')}
              <input type="text" list="revisar-heroes" autoComplete="off" value={tuyo} aria-label={t('revisar.tu')} onChange={(ev) => { setTuyo(ev.target.value); setAviso(null); }} />
            </label>
          )}
          {r.tuyoFila < 0 && !tuyo && botonesTuyos}
        </div>
        <div className="revisar-equipo">
          <strong>{t('revisar.enemigos')}</strong>
          {enemigos.map((_, i) => (
            <div key={i} className="revisar-hueco">
              <Cara png={png} lado="enemigos" i={i} escala={escala} etiqueta={t('revisar.cara', { equipo: t('revisar.enemigos'), n: i + 1 })} />
              {campo('enemigos', enemigos, setEnemigos, i)}
            </div>
          ))}
        </div>
      </div>
      <button className="reset revisar-guardar" onClick={guardar}>{t('revisar.guardar')}</button>
      {aviso && <p className={`nota ${aviso.mal ? 'mal' : 'bien'}`}>{aviso.texto}</p>}
    </section>
  );
}
