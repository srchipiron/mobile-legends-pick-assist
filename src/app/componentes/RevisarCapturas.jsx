import { useEffect, useMemo, useState } from 'react';
import { bajarRecortes, bajarMisRecortes, claveDeJugadorValida } from '../basedatos.js';
import { revisiones, cambiosDeRevision, encuadre, tusMasJugados, companerosHabituales, carasParaHueco, sinResultado, HORAS_DE_RECORTES } from '../revisar.js';
import { Cara as CaraDeHeroe } from './Imagen.jsx';
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
export function RevisarCapturas({ partidas, olvidadas = [], datos, comunidad, perfil, onImportar, onGuardar, onApuntar, onDescartar, onCerrar, t = tPorDefecto }) {
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
  // Las pantallas del final con la partida sin resultado (3.90.2): solo las subidas con TU clave.
  const [propios, setPropios] = useState([]);
  const clave = comunidad?.clave ?? null;
  useEffect(() => {
    if (!config || !claveDeJugadorValida(clave)) return undefined;
    let vivo = true;
    bajarMisRecortes(config, { clave, horas: HORAS_DE_RECORTES }).then((r) => { if (vivo && !r.error) setPropios(r.recortes); });
    return () => { vivo = false; };
  }, [config, clave]);
  const nombres = useMemo(() => (datos?.heroes ?? []).map((h) => h.name), [datos]);
  const lista = useMemo(() => (recortes ? revisiones(recortes, partidas, nombres) : []), [recortes, partidas, nombres]);
  const pendientes = lista.filter((r) => r.pendiente);
  const sinAcabar = useMemo(() => sinResultado(propios, partidas, nombres, olvidadas), [propios, partidas, nombres, olvidadas]);
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
        {sinAcabar.length > 0 && onApuntar && <SinResultado lista={sinAcabar} onApuntar={onApuntar} onDescartar={onDescartar} t={t} />}
        <div className="revisar-lista">
          {vistas.map((r) => <Revision key={r.t} r={r} datos={datos} nombres={nombres} partidas={partidas} escala={escala} onGuardar={(t0, c) => { onGuardar(t0, c); setGuardada(true); aLaSiguiente(t0); }} onCambio={() => setGuardada(false)} t={t} />)}
        </div>
      </div>
    </Hoja>
  );
}

/**
 * Las partidas que la tablet no supo cómo acabaron (3.89.4): sus pantallas
 * del final (la explosión de la base o el «DEFEAT» suelen decirlo) y Gané /
 * Perdí con un toque. Así llegan a tus números las que no contestaste en la
 * tablet mientras jugabas, que casi siempre son derrotas.
 */
function SinResultado({ lista, onApuntar, onDescartar, t }) {
  return (
    <section className="revisar-sin-resultado" aria-label={t('revisar.sinResultado', { n: lista.length })}>
      <h3>{t('revisar.sinResultado', { n: lista.length })}</h3>
      <p className="nota">{t('revisar.sinResultadoQueEs')}</p>
      {lista.map((s) => (
        <div key={s.t} className="revisar-fin">
          <strong>{new Date(s.t).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {s.partida.pick}{s.partida.supuesto ? ` (${t('revisar.supuesto')})` : ''}</strong>
          {s.pantallas.length > 0 && (
            <div className="revisar-fin-pantallas">
              {s.pantallas.map((png, i) => <img key={i} alt={t('revisar.pantallaFinal', { n: i + 1 })} src={`data:image/png;base64,${png}`} />)}
            </div>
          )}
          <div className="revisar-fin-botones">
            <button type="button" className="reset partida-bien" onClick={() => onApuntar({ ...s.partida, gane: true, editada: Date.now() })}>{t('revisar.gane')}</button>
            <button type="button" className="reset partida-mal" onClick={() => onApuntar({ ...s.partida, gane: false, editada: Date.now() })}>{t('revisar.perdi')}</button>
            {onDescartar && <button type="button" className="filtro" onClick={() => onDescartar(s.t)}>{t('revisar.noJugada')}</button>}
          </div>
        </div>
      ))}
    </section>
  );
}

function Cara({ png, lado, i, etiqueta, escala, abierto, onTocar }) {
  const e = encuadre(lado, i, escala);
  const estilo = { width: e.ancho, height: e.alto, backgroundImage: `url("data:image/png;base64,${png}")`, backgroundSize: e.fondo, backgroundPosition: e.posicion };
  // La cara es el botón (3.89.0): tocarla abre las caras para elegir quién es, sin escribir.
  return <button type="button" className="revisar-cara" aria-label={etiqueta} aria-expanded={abierto} style={estilo} onClick={onTocar} />;
}

/**
 * Elegir quién va en un hueco tocando su cara (3.89.0). Javi: «juego una
 * partida detrás de otra… no me da tiempo a ir corrigiendo». Revisar varias
 * de golpe tenía que ser tocar, no escribir: aquí salen las caras más
 * probables (tus héroes o tus compañeros de siempre delante, luego el
 * motor) y un buscador para el resto.
 */
function ElegirCara({ datos, opciones, onElegir, t }) {
  const [buscar, setBuscar] = useState('');
  const caras = useMemo(() => carasParaHueco(datos, { ...opciones, buscar }), [datos, opciones, buscar]);
  return (
    <div className="revisar-elegir">
      <input type="search" autoComplete="off" value={buscar} placeholder={t('app.buscar')} aria-label={t('revisar.buscarHeroe')} onChange={(ev) => setBuscar(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === 'Enter' && caras[0]) onElegir(caras[0].name); }} />
      <div className="hero-grid revisar-caras">
        {caras.map((h) => (
          <button key={h.name} type="button" onClick={() => onElegir(h.name)}>
            <CaraDeHeroe heroe={h} className="grid-cara" tam={40} />
            <span className="grid-nombre">{h.name}</span>
          </button>
        ))}
        {!caras.length && <p className="empty-state">{t('app.sinNombre')}</p>}
      </div>
    </div>
  );
}

function Revision({ r, datos, nombres, partidas, escala, onGuardar, onCambio, t }) {
  const [captura, setCaptura] = useState(0);
  const [entera, setEntera] = useState(false);
  const [enemigos, setEnemigos] = useState(() => r.enemigos.map((n) => n ?? ''));
  const [aliados, setAliados] = useState(() => r.aliados.map((n) => n ?? ''));
  const [tuyo, setTuyo] = useState(r.tuyoFila < 0 && !r.partida.supuesto ? r.partida.pick ?? '' : '');
  const [aviso, setAviso] = useState(null);
  // El hueco con las caras abiertas: { lado, i } o null.
  const [abierto, setAbierto] = useState(null);
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
  const enDraft = [...enemigos, ...aliados, ...(r.tuyoFila < 0 ? [tuyo] : [])].filter(Boolean);
  // Lo que se ofrece al tocar una cara: en tu fila, tus héroes; en tu equipo, tus compañeros de siempre; en el suyo, el motor.
  const opcionesDe = (lado, i) => {
    const lista = lado === 'enemigos' ? enemigos : aliados;
    const equipo = lista.filter((n, k) => n && k !== i && !(lado === 'aliados' && k === r.tuyoFila));
    const primeros = lado === 'enemigos' ? [] : i === r.tuyoFila ? tuyos : companerosHabituales(partidas, nombres, enDraft);
    return { lado, equipo, fuera: enDraft, linea: r.partida.draft?.linea ?? null, primeros };
  };
  const opciones = useMemo(() => (abierto ? opcionesDe(abierto.lado, abierto.i) : null), [abierto, enemigos, aliados, tuyo, tuyos, partidas]);
  // Elegida una, se abre el siguiente hueco vacío: revisar un draft son unos pocos toques seguidos.
  const elegir = (lado, i, nombre) => {
    const poner = lado === 'enemigos' ? setEnemigos : setAliados;
    const nuevos = { enemigos: [...enemigos], aliados: [...aliados] };
    nuevos[lado][i] = nombre;
    poner(nuevos[lado]);
    setAviso(null); onCambio?.();
    const huecos = [...nuevos.aliados.map((n, k) => ['aliados', k, n]), ...nuevos.enemigos.map((n, k) => ['enemigos', k, n])];
    const siguiente = huecos.find(([l, k, n]) => !n && !(l === lado && k === i));
    setAbierto(siguiente ? { lado: siguiente[0], i: siguiente[1] } : null);
  };
  const tocar = (lado, i) => setAbierto((a) => (a?.lado === lado && a.i === i ? null : { lado, i }));
  const elegirAqui = (lado, i) => abierto?.lado === lado && abierto.i === i && (
    <ElegirCara datos={datos} opciones={opciones} onElegir={(n) => elegir(lado, i, n)} t={t} />
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
              <Cara png={png} lado="aliados" i={i} escala={escala} etiqueta={t('revisar.cara', { equipo: t('revisar.aliados'), n: i + 1 })} abierto={abierto?.lado === 'aliados' && abierto.i === i} onTocar={() => tocar('aliados', i)} />
              {campo('aliados', aliados, setAliados, i)}
              {i === r.tuyoFila && !aliados[i] && botonesTuyos}
              {elegirAqui('aliados', i)}
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
              <Cara png={png} lado="enemigos" i={i} escala={escala} etiqueta={t('revisar.cara', { equipo: t('revisar.enemigos'), n: i + 1 })} abierto={abierto?.lado === 'enemigos' && abierto.i === i} onTocar={() => tocar('enemigos', i)} />
              {campo('enemigos', enemigos, setEnemigos, i)}
              {elegirAqui('enemigos', i)}
            </div>
          ))}
        </div>
      </div>
      <button className="reset revisar-guardar" onClick={guardar}>{t('revisar.guardar')}</button>
      {aviso && <p className={`nota ${aviso.mal ? 'mal' : 'bien'}`}>{aviso.texto}</p>}
    </section>
  );
}
