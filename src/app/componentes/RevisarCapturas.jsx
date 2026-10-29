import { useEffect, useMemo, useState } from 'react';
import { bajarRecortes } from '../basedatos.js';
import { revisiones, cambiosDeRevision, encuadre, HORAS_DE_RECORTES } from '../revisar.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/** A qué escala se pintan las caras (píxeles por píxel de la referencia): 85 px de ancho las de tu equipo. Decisión de producto. */
const ESCALA = 0.45;

/**
 * Revisar lo que no vio el lector, con sus capturas (3.86.0): las caras de
 * cada draft que la tablet no leyó entero, junto a un campo por hueco. Se
 * hace igual desde el móvil que desde el PC (la misma app, con tu clave de
 * la base de datos). Guardar arregla la partida: llega a la tablet y la
 * tablet aprende de ella.
 */
export function RevisarCapturas({ partidas, datos, comunidad, onGuardar, onCerrar, t = tPorDefecto }) {
  const [recortes, setRecortes] = useState(null);
  const [error, setError] = useState(null);
  const [todas, setTodas] = useState(false);
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

  return (
    <Hoja etiqueta={t('revisar.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('revisar.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body revisar">
        <p className="nota">{t('revisar.queEs')}</p>
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
        {vistas.map((r) => <Revision key={r.t} r={r} nombres={nombres} onGuardar={onGuardar} t={t} />)}
      </div>
    </Hoja>
  );
}

function Cara({ png, lado, i, etiqueta }) {
  const e = encuadre(lado, i, ESCALA);
  return <span className="revisar-cara" role="img" aria-label={etiqueta} style={{ width: e.ancho, height: e.alto, backgroundImage: `url("data:image/png;base64,${png}")`, backgroundSize: e.fondo, backgroundPosition: e.posicion }} />;
}

function Revision({ r, nombres, onGuardar, t }) {
  const [captura, setCaptura] = useState(0);
  const [enemigos, setEnemigos] = useState(() => r.enemigos.map((n) => n ?? ''));
  const [aliados, setAliados] = useState(() => r.aliados.map((n) => n ?? ''));
  const [tuyo, setTuyo] = useState(r.tuyoFila < 0 && !r.partida.supuesto ? r.partida.pick ?? '' : '');
  const [aviso, setAviso] = useState(null);
  const png = r.capturas[captura]?.png ?? r.capturas[0].png;
  const campo = (lado, lista, poner, i) => (
    <input
      type="text" list="revisar-heroes" autoComplete="off" value={lista[i]}
      aria-label={`${t(`revisar.${lado}`)} ${i + 1}`}
      placeholder={lado === 'aliados' && i === r.tuyoFila ? t('revisar.tu') : t('revisar.quien')}
      onChange={(ev) => { const v = ev.target.value; poner((x) => x.map((n, k) => (k === i ? v : n))); setAviso(null); }}
    />
  );
  const guardar = () => {
    const c = cambiosDeRevision({ enemigos, aliados, tuyoFila: r.tuyoFila, tuyo }, nombres);
    if (c.error) { setAviso({ mal: true, texto: t(`revisar.error.${c.error}`) }); return; }
    onGuardar(r.t, c);
    setAviso({ mal: false, texto: t('revisar.guardada') });
  };
  return (
    <section className={`revisar-partida${r.pendiente ? ' pendiente' : ''}`}>
      <h3>
        {new Date(r.t).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {' · '}<span className={r.partida.gane ? 'partida-bien' : 'partida-mal'}>{r.partida.gane ? t('hist.gane') : t('hist.perdi')}</span>
        {r.capturas.length > 1 && <button className="filtro" onClick={() => setCaptura((c) => 1 - c)}>{t('revisar.otraCaptura', { n: captura + 1, total: r.capturas.length })}</button>}
      </h3>
      <div className="revisar-equipos">
        <div className="revisar-equipo">
          <strong>{t('revisar.aliados')}</strong>
          {aliados.map((_, i) => (
            <div key={i} className={`revisar-hueco${i === r.tuyoFila ? ' tuyo' : ''}`}>
              <Cara png={png} lado="aliados" i={i} etiqueta={t('revisar.cara', { equipo: t('revisar.aliados'), n: i + 1 })} />
              {campo('aliados', aliados, setAliados, i)}
            </div>
          ))}
          {r.tuyoFila < 0 && (
            <label className="revisar-tu">{t('revisar.tuSinFila')}
              <input type="text" list="revisar-heroes" autoComplete="off" value={tuyo} aria-label={t('revisar.tu')} onChange={(ev) => { setTuyo(ev.target.value); setAviso(null); }} />
            </label>
          )}
        </div>
        <div className="revisar-equipo">
          <strong>{t('revisar.enemigos')}</strong>
          {enemigos.map((_, i) => (
            <div key={i} className="revisar-hueco">
              <Cara png={png} lado="enemigos" i={i} etiqueta={t('revisar.cara', { equipo: t('revisar.enemigos'), n: i + 1 })} />
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
