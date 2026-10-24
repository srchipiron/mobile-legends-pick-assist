import { useState } from 'react';
import { fundirPerfil, sanear } from '../../motor/perfil.js';
import { tPorDefecto } from './tPorDefecto.js';

const pct = (x) => Math.round(x * 1000) / 10;

/** Una línea del informe: diferencia en puntos, su margen y si se distingue del azar. */
function Comparacion({ c, clave, t }) {
  if (!c?.jugadores) return <p className="nota">{t(`comunidad.${clave}.pocos`)}</p>;
  const dif = pct(c.dif);
  return (
    <p className="nota">
      {t(`comunidad.${clave}`, { jugadores: c.jugadores, n: c.n ?? 0, real: c.real != null ? pct(c.real) : 0, esperado: c.esperado != null ? pct(c.esperado) : 0, signo: dif > 0 ? '+' : '', dif, margen: pct(c.margen) })}
      {' '}
      {t(c.seVe ? (c.dif > 0 ? 'comunidad.mejor' : 'comunidad.peor') : 'comunidad.noSeVe')}
    </p>
  );
}

/**
 * La base de datos de partidas de todos (3.69.0), dentro de «Tus partidas».
 * Solo sale con `comunidad.json` publicado. Guardar las tuyas es una casilla
 * que se pone a propósito (las partidas salen del móvil); ver si la app
 * ayuda, con las de todos, no pide nada.
 */
export function Comunidad({ comunidad, perfil, onImportar, t = tPorDefecto }) {
  const [pegada, setPegada] = useState('');
  const [aviso, setAviso] = useState(null);
  if (!comunidad?.config) return null;
  const e = comunidad.estadisticas;

  const usar = async () => {
    const r = await comunidad.usarClave(pegada);
    if (r.error) { setAviso({ mal: true, texto: t(`comunidad.error.${['clave', 'red', 'config'].includes(r.error) ? r.error : 'otro'}`) }); return; }
    onImportar(fundirPerfil(perfil, sanear({ partidas: r.partidas, mastery: {}, olvidadas: [] })));
    setPegada('');
    setAviso({ mal: false, texto: t('comunidad.traidas', { n: r.partidas.length }) });
  };
  const borrar = async () => {
    if (!window.confirm(t('comunidad.borrarSeguro'))) return;
    const r = await comunidad.borrar();
    setAviso(r.error ? { mal: true, texto: t(`comunidad.error.${r.error === 'red' ? 'red' : 'otro'}`) } : { mal: false, texto: t('comunidad.borradas') });
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(comunidad.clave); setAviso({ mal: false, texto: t('comunidad.copiada') }); } catch { /* queda a la vista para copiarla a mano */ }
  };

  return (
    <section className="comunidad">
      <strong>{t('comunidad.titulo')}</strong>
      {comunidad.activo ? (
        <>
          <p className={`nota ${comunidad.error ? 'mal' : 'bien'}`} role="status">
            {comunidad.error
              ? t(`comunidad.error.${['red', 'tope', 'lleno', 'partida', 'permiso'].includes(comunidad.error) ? comunidad.error : 'otro'}`)
              : (comunidad.cuando ? t('comunidad.guardadas', { n: comunidad.total ?? 0, hora: new Date(comunidad.cuando).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('comunidad.subiendo'))}
          </p>
          <p className="nota">{t('comunidad.tuClave')}</p>
          <textarea className="codigo comunidad-clave" readOnly rows={2} value={comunidad.clave ?? ''} aria-label={t('comunidad.tuClave')} onFocus={(ev) => ev.target.select()} />
          <button className="ancho" onClick={copiar}>{t('comunidad.copiar')}</button>
          <button className="ancho" disabled={comunidad.enCurso} onClick={() => comunidad.subir({ todas: true })}>{t('comunidad.subirTodas')}</button>
          <button className="ancho" onClick={comunidad.desactivar}>{t('comunidad.parar')}</button>
          <button className="ancho reset" onClick={borrar}>{t('comunidad.borrar')}</button>
        </>
      ) : (
        <>
          <p className="nota">{t('comunidad.queEs')}</p>
          <button className="ancho" onClick={comunidad.activar}>{t('comunidad.activar')}</button>
          <p className="nota">{t('comunidad.yaTengo')}</p>
          <input type="password" autoComplete="off" spellCheck={false} value={pegada} placeholder={t('comunidad.pegaClave')} aria-label={t('comunidad.pegaClave')} onChange={(ev) => setPegada(ev.target.value)} />
          <button className="ancho" disabled={!pegada.trim()} onClick={usar}>{t('comunidad.usarClave')}</button>
        </>
      )}
      {aviso && <p className={aviso.mal ? 'nota mal' : 'nota bien'} role="status">{aviso.texto}</p>}

      <strong>{t('comunidad.ayuda')}</strong>
      {!e && <button className="ancho" onClick={comunidad.cargarEstadisticas}>{t('comunidad.ver')}</button>}
      {e?.cargando && <p className="nota">{t('comunidad.cargando')}</p>}
      {e?.error && (
        <>
          <p className="nota mal">{t(`comunidad.error.${e.error === 'red' ? 'red' : 'otro'}`)}</p>
          <button className="ancho" onClick={comunidad.cargarEstadisticas}>{t('comunidad.ver')}</button>
        </>
      )}
      {e && !e.cargando && !e.error && (
        <div className="comunidad-informe">
          <p className="nota">{t('comunidad.cuantas', { jugadores: e.jugadores, partidas: e.partidas })}{e.incompleto ? ` ${t('comunidad.incompleto')}` : ''}</p>
          {e.siguiendo.n > 0 && e.libre.n > 0 && (
            <p className="nota">{t('comunidad.ramas', { a: pct(e.siguiendo.winrate), na: e.siguiendo.n, b: pct(e.libre.winrate), nb: e.libre.n })}</p>
          )}
          <Comparacion c={e.entreRamas} clave="entreRamas" t={t} />
          <Comparacion c={e.contraReferencia} clave="contraReferencia" t={t} />
          <Comparacion c={e.soloLector} clave="soloLector" t={t} />
          {e.calibracion?.n > 0 && (
            <p className="nota">{t('comunidad.calibracion', { n: e.calibracion.n, prevista: pct(e.calibracion.prevista), real: pct(e.calibracion.real), brier: Math.round(e.calibracion.brier * 1000) / 1000 })}</p>
          )}
          <p className="nota">{t('comunidad.trampa')}</p>
        </div>
      )}
    </section>
  );
}
