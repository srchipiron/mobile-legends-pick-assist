import { useEffect, useState } from 'react';
import { sanearLectorTablet, pedirEstadoLector, lineasDelSistema, pedirUltimaApk, queApk, claveDeFallo, buscarTabletUnaVez, sinLlegarALaTablet, DESCARGA_APK } from '../lector.js';
import { useT } from '../i18n/contexto.js';

/** Al día o mirando, en gris; lo demás, en rojo: hay que hacer algo. */
const claseDeApk = (estado) => (['alDia', 'nose', 'mirando', 'buscando'].includes(estado) ? 'empty-state' : 'nota mal');

/** Qué decir de la Lector MLBB de la tablet: SIEMPRE algo (callado, no se sabía por qué no iba). */
function textoDeApk(apk, vinculo, t) {
  if (apk.estado === 'sinRespuesta') return `${t('lectorTablet.apk.sinRespuesta', { direccion: vinculo.direccion })} ${t(claveDeFallo(apk.tipo))}`;
  if (apk.estado === 'nose') return apk.tuya ? t('lectorTablet.apk.solo', { tuya: apk.tuya }) : t('lectorTablet.apk.nose');
  return t(`lectorTablet.apk.${apk.estado}`, { tuya: apk.tuya, ultima: apk.ultima });
}

/**
 * La tablet en Ajustes. Vinculada: dónde, qué Lector MLBB tiene (con el
 * enlace para bajarla si es vieja), «El sistema» (lo que dice de sí misma),
 * «Volver a mirar» y desvincular; si no contesta, se la busca en la wifi.
 * Sin vincular: dirección y código a mano (lo normal es escanear su QR).
 */
export function LectorTablet({ vinculo = null, onVinculo }) {
  const t = useT();
  const [direccion, setDireccion] = useState('');
  const [codigo, setCodigo] = useState('');
  const [apk, setApk] = useState(null);
  const [mirar, setMirar] = useState(0);
  const [sistema, setSistema] = useState([]);
  useEffect(() => {
    if (!vinculo) return undefined;
    let vivo = true;
    setApk({ estado: 'mirando' });
    Promise.all([pedirEstadoLector(), pedirUltimaApk()]).then(async ([estado, ultima]) => {
      if (!vivo) return;
      setSistema(lineasDelSistema(estado));
      const q = queApk(estado, ultima);
      if (q.estado !== 'sinRespuesta' || !sinLlegarALaTablet(q.tipo)) { setApk(q); return; }
      setApk({ estado: 'buscando' });
      const nueva = await buscarTabletUnaVez(vinculo);
      if (!vivo) return;
      if (nueva && nueva.direccion !== vinculo.direccion) onVinculo(nueva);
      else setApk(q);
    });
    return () => { vivo = false; };
  }, [vinculo, mirar, onVinculo]);

  if (vinculo) {
    return (
      <div className="lector-tablet">
        <p className="empty-state">{t('lectorTablet.vinculado', { direccion: vinculo.direccion })}</p>
        {apk && <p className={claseDeApk(apk.estado)} role="status">{textoDeApk(apk, vinculo, t)}</p>}
        {sistema.length > 0 && (
          <div className="sistema" role="status" aria-label={t('sistema.titulo')}>
            <strong>{t('sistema.titulo')}</strong>
            {sistema.map((l) => <p key={l.clave} className={l.mal ? 'nota mal' : 'empty-state'}>{t(l.clave, l.params)}</p>)}
          </div>
        )}
        {apk?.estado === 'sinRespuesta' && <button className="reset" onClick={() => setMirar((n) => n + 1)}>{t('lectorTablet.apk.otraVez')}</button>}
        {(apk?.estado === 'antigua' || apk?.estado === 'atrasada') && <a className="reset lector-traer" href={DESCARGA_APK} target="_blank" rel="noopener noreferrer">{t('lectorTablet.apk.descargar')}</a>}
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

/** «¿Vincular con la tablet en …?» al abrir el enlace de su QR: sin el toque no se guarda nada. */
export function ConfirmarVinculo({ vinculo, onResponder }) {
  const t = useT();
  return (
    <div className="aviso-deshacer" role="dialog" aria-label={t('lectorTablet.titulo')}>
      <span>{t('lectorTablet.confirmar', { direccion: vinculo.direccion })}</span>
      <button className="deshacer" onClick={() => onResponder(true)}>{t('lectorTablet.vincular')}</button>
      <button className="x" aria-label={t('app.cerrar')} onClick={() => onResponder(false)}>×</button>
    </div>
  );
}
