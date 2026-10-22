import { useState } from 'react';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Administración (3.65.0): solo en el móvil de Javi (con el token de la
 * subida, o ya con su clave de administrador). Crear la clave de
 * administrador, dar una clave a cada invitado (sale un enlace para
 * mandárselo), revocarla, y decidir si la app pide clave para entrar.
 */
export function Administracion({ licencia, onCerrar, t = tPorDefecto }) {
  const [nombre, setNombre] = useState('');
  const [dias, setDias] = useState('');
  const [hecha, setHecha] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [copia, setCopia] = useState('');
  const { licencias, esAdministrador, emitidas } = licencia;
  const revocadas = new Set(licencias?.revocadas ?? []);
  const resultado = (r, bien) => setAviso(r?.error ? { mal: true, texto: t(`admin.error.${['permiso', 'token', 'sinToken', 'red', 'yaHay'].includes(r.error) ? r.error : 'otro'}`) } : { mal: false, texto: bien });

  const crear = async () => {
    let r = await licencia.crearAdministrador();
    // Ya hay una publicada: lo normal es restaurar la copia; pisarla deja sin valor las claves dadas.
    if (r.error === 'yaHay' && window.confirm(t('admin.pisar'))) r = await licencia.crearAdministrador({ forzar: true });
    resultado(r, t('admin.creada'));
  };
  const emitir = async () => {
    const r = await licencia.emitir({ nombre, dias: Number(dias) > 0 ? Number(dias) : null });
    if (r.error) { resultado(r); return; }
    setHecha(r); setNombre(''); setDias('');
  };
  const compartir = async () => {
    try { await navigator.share({ title: 'Pick Assist', text: t('admin.mensaje', { nombre: hecha.datos.nombre }), url: hecha.enlace }); } catch {
      try { await navigator.clipboard.writeText(hecha.enlace); setAviso({ mal: false, texto: t('admin.copiado') }); } catch { /* queda a la vista */ }
    }
  };

  return (
    <Hoja etiqueta={t('admin.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('admin.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body">
        <p className="nota">{t('admin.queEs')}</p>
        {!esAdministrador && (
          <>
            <button className="ancho" onClick={crear}>{t('admin.crear')}</button>
            <strong>{t('admin.restaurar')}</strong>
            <textarea className="codigo" rows={3} value={copia} onChange={(e) => setCopia(e.target.value)} />
            <button className="ancho" disabled={!copia.trim()} onClick={() => setAviso(licencia.restaurarAdministrador(copia) ? { mal: false, texto: t('admin.restaurada') } : { mal: true, texto: t('admin.copiaMala') })}>{t('admin.restaurarBoton')}</button>
          </>
        )}
        {esAdministrador && (
          <>
            {licencias && !licencias.publica && (
              <>
                <p className="nota mal">{t('admin.sinPublica')}</p>
                <button className="ancho" onClick={async () => resultado(await licencia.republicar(), t('admin.publicado'))}>{t('admin.republicar')}</button>
              </>
            )}
            <strong>{t('admin.darClave')}</strong>
            <input className="admin-campo" type="text" value={nombre} maxLength={40} placeholder={t('admin.nombre')} aria-label={t('admin.nombre')} onChange={(e) => setNombre(e.target.value)} />
            <input className="admin-campo" type="text" inputMode="numeric" value={dias} placeholder={t('admin.dias')} aria-label={t('admin.dias')} onChange={(e) => setDias(e.target.value)} />
            <button className="ancho" disabled={!nombre.trim()} onClick={emitir}>{t('admin.emitir')}</button>
            {hecha && (
              <>
                <p className="nota bien">{t('admin.hecha', { nombre: hecha.datos.nombre })}</p>
                <textarea className="codigo" readOnly rows={3} value={hecha.enlace} onFocus={(e) => e.target.select()} />
                <button className="ancho" onClick={compartir}>{t('admin.compartir')}</button>
              </>
            )}
            <hr />
            <strong>{t('admin.puerta')}</strong>
            <p className="nota">{t(licencias?.exigir ? 'admin.exigida' : 'admin.abierta')}</p>
            <button className="ancho" onClick={async () => resultado(await licencia.exigir(!licencias?.exigir), t('admin.publicado'))}>{t(licencias?.exigir ? 'admin.abrir' : 'admin.cerrar')}</button>
            <hr />
            <strong>{t('admin.dadas', { n: emitidas.length })}</strong>
            <ul className="admin-lista">
              {emitidas.map((e) => (
                <li key={e.id}>
                  <span>{e.nombre}{e.caduca ? ` · ${t('admin.hasta', { fecha: new Date(e.caduca).toLocaleDateString() })}` : ''}{revocadas.has(e.id) ? ` · ${t('admin.revocada')}` : ''}</span>
                  {!revocadas.has(e.id) && <button className="reset" onClick={async () => resultado(await licencia.revocar(e.id), t('admin.publicado'))}>{t('admin.revocar')}</button>}
                </li>
              ))}
            </ul>
            <hr />
            <strong>{t('admin.copiaTitulo')}</strong>
            <p className="nota">{t('admin.copiaExplica')}</p>
            <textarea className="codigo" readOnly rows={3} value={licencia.copiaDeAdministrador ?? ''} onFocus={(e) => e.target.select()} />
          </>
        )}
        {aviso && <p className={aviso.mal ? 'nota mal' : 'nota bien'} role="status">{aviso.texto}</p>}
      </div>
    </Hoja>
  );
}

/**
 * La puerta (3.65.0): con `exigir`, quien no tiene una clave válida ve esto
 * en vez de la app. Pegar la clave o abrir el enlace que le dieron.
 */
export function PuertaDeLicencia({ licencia, t = tPorDefecto }) {
  const [pegada, setPegada] = useState('');
  const motivo = licencia.comprobada?.motivo;
  return (
    <main className="puerta">
      <h1>Mobile Legends Pick Assist</h1>
      <p>{t('puerta.queEs')}</p>
      {motivo && <p className="nota mal" role="alert">{t(`puerta.motivo.${motivo}`)}</p>}
      <textarea className="codigo" rows={3} value={pegada} placeholder={t('puerta.pega')} aria-label={t('puerta.pega')} onChange={(e) => setPegada(e.target.value)} />
      <button className="ancho" disabled={!pegada.trim()} onClick={() => licencia.setClave(pegada.trim().replace(/^.*#clave=/, ''))}>{t('puerta.entrar')}</button>
    </main>
  );
}
