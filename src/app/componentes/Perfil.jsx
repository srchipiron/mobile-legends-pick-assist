import { useEffect, useState } from 'react';
import { recogerPerfil, exportarPerfil, leerPerfil, fundirPerfil } from '../../motor/perfil.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Tu perfil: el código que lleva tus datos a otro dispositivo. Sin servidor
 * y sin cuenta. Al traerlos se FUNDEN con lo que ya haya, nunca se
 * sustituye: si juegas en los dos sitios las copias divergen, y un «pegar y
 * reemplazar» te borraría medio historial.
 */
export function Perfil({ datos, onImportar, onCerrar, t = tPorDefecto }) {
  const [codigo, setCodigo] = useState('');
  const [pegado, setPegado] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    let vivo = true;
    exportarPerfil(recogerPerfil(datos)).then((c) => { if (vivo) setCodigo(c); });
    return () => { vivo = false; };
  }, [datos]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch { /* sin permiso de portapapeles queda el texto a la vista */ }
  };

  const traer = async () => {
    const { perfil, error } = await leerPerfil(pegado);
    if (error) {
      setAviso({ mal: true, texto: t(`perfil.error${error[0].toUpperCase()}${error.slice(1)}`) });
      return;
    }
    const fundido = fundirPerfil(datos, perfil);
    onImportar(fundido);
    const r = fundido.resumen;
    setAviso({ mal: false, texto: t('perfil.fundido', { ma: r.maestriaAntes, md: r.maestriaDespues, pa: r.partidasAntes, pd: r.partidasDespues }) });
    setPegado('');
  };

  return (
    <Hoja etiqueta={t('perfil.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('perfil.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body">
        <p className="nota">{t('perfil.queEs')}</p>
        <p className="nota">{t('perfil.noSale')}</p>
        <strong>{t('perfil.tuCodigo')}</strong>
        <p className="nota">{t('perfil.contiene', { heroes: Object.keys(datos.mastery ?? {}).length, partidas: (datos.partidas ?? []).length })}</p>
        <textarea className="codigo" readOnly rows={4} value={codigo} onFocus={(e) => e.target.select()} />
        <button className="ancho" onClick={copiar}>{copiado ? t('perfil.copiado') : t('perfil.copiar')}</button>
        <hr />
        <strong>{t('perfil.pegaAqui')}</strong>
        <textarea className="codigo" rows={4} value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="MLPA1..." />
        <button className="ancho" onClick={traer} disabled={!pegado.trim()}>{t('perfil.importar')}</button>
        {aviso && <p className={aviso.mal ? 'nota mal' : 'nota bien'}>{aviso.texto}</p>}
      </div>
    </Hoja>
  );
}
