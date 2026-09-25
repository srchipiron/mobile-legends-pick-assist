import { useState } from 'react';
import { esPrevia, siguioConsejo } from '../../motor/registro.js';
import { recogerPerfil, exportarPerfil } from '../../motor/perfil.js';
import { urlDeIncidencia, TOPE_URL, tokenPlausible } from '../github.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Veredicto } from './Veredicto.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Tus partidas: verlas, corregirlas y añadir las de antes. Dos cosas
 * distintas viven aquí: las apuntadas CON la app (dicen si la app acierta) y
 * las de tu historial del juego, metidas a mano (cuentan para tu maestría,
 * NO para comprobar si la app acierta: cuando las jugaste no había consejo
 * que seguir).
 */
/** Qué dice la línea de estado de la subida automática. */
function estadoDeEnvio(envio, t) {
  if (envio.enCurso) return t('hist.autoSubiendo');
  if (envio.error) return t(`hist.error.${envio.error}`);
  if (envio.pendiente) return t('hist.autoPendiente');
  if (envio.cuando) return t('hist.autoUltima', { fecha: new Date(envio.cuando).toLocaleString(), numero: envio.incidencia ?? '?' });
  return t('hist.autoNada');
}

export function HistorialPartidas({ partidas, pool, maestria = {}, perfil = null, envio = null, onOlvidar, onCorregir, onAnadir, onCerrar, t = tPorDefecto }) {
  const [anadiendo, setAnadiendo] = useState(false);
  const [heroe, setHeroe] = useState(null);
  const [aviso, setAviso] = useState(null);
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
    const codigo = await exportarPerfil(recogerPerfil(perfil ?? { partidas, mastery: maestria }));
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
        {partidas.map((p) => (
          <div key={p.t} className="partida">
            <span className="partida-fecha">{new Date(p.t).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
            <span className="partida-hero">{p.pick}</span>
            <span className={p.gane ? 'partida-bien' : 'partida-mal'}>{p.gane ? t('hist.gane') : t('hist.perdi')}</span>
            <span className="partida-tipo">{esPrevia(p) ? t('hist.previa') : (siguioConsejo(p) ? t('hist.seguida') : t('hist.libre'))}</span>
            <button className="x" title={t('hist.cambiar')} aria-label={`${t('hist.cambiar')} · ${p.pick}`} onClick={() => onCorregir(p.t, !p.gane)}>⇄</button>
            <button className="x" title={t('hist.quitar')} aria-label={`${t('hist.quitar')} · ${p.pick}`} onClick={() => onOlvidar(p.t)}>×</button>
          </div>
        ))}
      </div>
    </Hoja>
  );
}
