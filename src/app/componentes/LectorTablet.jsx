import { useEffect, useState } from 'react';
import { sanearLectorTablet, traerDeTermux, pedirEstadoLector, pedirUltimaApk, queApk, DESCARGA_APK } from '../lector.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * El lector en la tablet (3.61.0), en Ajustes: con quién está vinculada la
 * app y, si no, cómo vincularla a mano (lo normal es escanear el QR de la
 * app «Lector MLBB», que ya trae dirección y código).
 */
export function LectorTablet({ vinculo = null, onVinculo, t = tPorDefecto }) {
  const [direccion, setDireccion] = useState('');
  const [codigo, setCodigo] = useState('');
  const [traido, setTraido] = useState(null);
  // Qué Lector MLBB tienes (3.65.2): las anteriores a 3.64.0 no se actualizan solas y nadie lo decía.
  const [apk, setApk] = useState(null);
  useEffect(() => {
    if (!vinculo) return undefined;
    let vivo = true;
    Promise.all([pedirEstadoLector(), pedirUltimaApk()]).then(([estado, ultima]) => { if (vivo) setApk(queApk(estado, ultima)); });
    return () => { vivo = false; };
  }, [vinculo]);
  if (vinculo) {
    const traer = async () => { setTraido({ cargando: true }); setTraido(await traerDeTermux()); };
    return (
      <div className="lector-tablet">
        <p className="empty-state">{t('lectorTablet.vinculado', { direccion: vinculo.direccion })}</p>
        {apk && apk.estado !== 'nose' && (
          <p className={claseDeApk(apk.estado)} role="status">{t(`lectorTablet.apk.${apk.estado}`, { tuya: apk.tuya, ultima: apk.ultima })}</p>
        )}
        {(apk?.estado === 'antigua' || apk?.estado === 'atrasada') && <a className="reset lector-traer" href={DESCARGA_APK} target="_blank" rel="noopener noreferrer">{t('lectorTablet.apk.descargar')}</a>}
        {/* Lo aprendido en Termux, a la tablet (3.64.1): sin las plantillas del final no reconoce si ganaste. */}
        <p className="empty-state">{t('lectorTablet.traerExplicacion')}</p>
        <button className="reset lector-traer" disabled={traido?.cargando} onClick={traer}>{t('lectorTablet.traer')}</button>
        {traido && !traido.cargando && <p className="empty-state" role="status">{traido.error ? t(`lectorTablet.traer.${traido.error}`) : t('lectorTablet.traido', { capturas: traido.capturas, gane: traido.gane, perdi: traido.perdi })}</p>}
        <button className="reset" onClick={() => onVinculo(null)}>{t('lectorTablet.desvincular')}</button>
      </div>
    );
  }
  const valido = sanearLectorTablet({ direccion, codigo });
  return (
    <div className="lector-tablet">
      <strong>{t('lectorTablet.titulo')}</strong>
      <p className="empty-state">{t('lectorTablet.explicacion')}</p>
      <input type="text" inputMode="decimal" autoComplete="off" placeholder={t('lectorTablet.direccion')} aria-label={t('lectorTablet.direccion')} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      <input type="text" autoComplete="off" autoCapitalize="characters" placeholder={t('lectorTablet.codigo')} aria-label={t('lectorTablet.codigo')} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
      <button className="reset" disabled={!valido} onClick={() => onVinculo(valido)}>{t('lectorTablet.vincular')}</button>
    </div>
  );
}

/** Al día, en gris como lo demás; antigua o atrasada, en rojo: hay que hacer algo. */
function claseDeApk(estado) {
  return estado === 'alDia' ? 'empty-state' : 'nota mal';
}

/** «¿Vincular con la tablet en …?» al abrir el enlace de su QR: sin el toque no se guarda nada. */
export function ConfirmarVinculo({ vinculo, onResponder, t = tPorDefecto }) {
  return (
    <div className="aviso-deshacer" role="dialog" aria-label={t('lectorTablet.titulo')}>
      <span>{t('lectorTablet.confirmar', { direccion: vinculo.direccion })}</span>
      <button className="deshacer" onClick={() => onResponder(true)}>{t('lectorTablet.vincular')}</button>
      <button className="x" aria-label={t('app.cerrar')} onClick={() => onResponder(false)}>×</button>
    </div>
  );
}
