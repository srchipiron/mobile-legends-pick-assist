import { useState } from 'react';
import { esPrevia, siguioConsejo } from '../../motor/registro.js';
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
export function HistorialPartidas({ partidas, pool, maestria = {}, onOlvidar, onCorregir, onAnadir, onCerrar, t = tPorDefecto }) {
  const [anadiendo, setAnadiendo] = useState(false);
  const [heroe, setHeroe] = useState(null);
  const [aviso, setAviso] = useState(null);
  const conApp = partidas.filter((p) => !esPrevia(p)).length;

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
