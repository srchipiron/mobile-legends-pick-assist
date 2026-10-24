import { useMemo } from 'react';
import { fichaDeHeroe } from '../../motor/draft.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Cara } from './Imagen.jsx';
import { ETIQUETAS_RANGO } from './SelectorDeRango.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * La ficha de un héroe (3.67.0): lo que el motor ya sabe de él, para
 * cualquier aficionado. Se abre tocando un héroe en Meta; tocar otro de las
 * listas abre el suyo. Nada se calcula aquí: todo sale de `fichaDeHeroe`
 * (draft.js), con los mismos datos que deciden las recomendaciones.
 */
export function FichaDeHeroe({ datos, nombre, onOtro, onCerrar, t = tPorDefecto }) {
  const f = useMemo(() => fichaDeHeroe(datos, nombre), [datos, nombre]);
  // Solo el número: el «%» va en la frase y el traductor pone la coma decimal en español.
  const num = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d));
  const pct = (v, d = 1) => (v == null ? '—' : t('ficha.pct', { v: num(v, d) }));
  const lista = (titulo, filas, clase) => (
    <section className="ficha-seccion">
      <h3 className="meta-titulo">{titulo}</h3>
      {!filas.length && <p className="nota">{t('ficha.sinDatos')}</p>}
      <ul className="ficha-lista">
        {filas.map((x) => (
          <li key={x.heroe.name}>
            <button className="ficha-otro" onClick={() => onOtro(x.heroe.name)}>
              <Cara heroe={x.heroe} className="grid-cara" tam={28} alt="" />
              <span className="meta-nombre">{x.heroe.name}</span>
              <span className={`ficha-valor ${clase}`}>{pct(x.valor)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <Hoja etiqueta={t('ficha.titulo', { heroe: nombre })} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={f?.heroe.name ?? nombre}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body">
        {!f && <p className="nota">{t('ficha.noExiste')}</p>}
        {f && (
          <>
            <div className="ficha-cab">
              <Cara heroe={f.heroe} className="ficha-cara" tam={64} alt="" />
              <div>
                <p className="ficha-linea-dato">
                  {f.stat ? t('ficha.datos', { wr: num(f.stat.winRate), pick: num(f.stat.pickRate), ban: num(f.stat.banRate, 0), rango: ETIQUETAS_RANGO[f.rango] ?? f.rango }) : t('ficha.sinDatos')}
                </p>
                {f.tier && <p className="nota">{t('ficha.tier', { tier: f.tier })}</p>}
                {f.tendencia != null && <p className={`nota ${f.tendencia > 0 ? 'bien' : 'mal'}`}>{t(f.tendencia > 0 ? 'ficha.sube' : 'ficha.baja', { puntos: (Math.abs(f.tendencia) * 100).toFixed(1) })}</p>}
                {f.lineas.length > 0 && (
                  <p className="nota">{f.lineas.map((l) => (l.winRate != null ? t('ficha.enLinea', { linea: t(`linea.${l.linea}`), wr: num(l.winRate) }) : t(`linea.${l.linea}`))).join(' · ')}</p>
                )}
              </div>
            </div>
            {lista(t('ficha.leGanaA'), f.leGanaA, 'bien')}
            {lista(t('ficha.leGanan'), f.leGanan, 'mal')}
            {lista(t('ficha.combinaCon'), f.combinaCon, 'bien')}
            {lista(t('ficha.peorCon'), f.peorCon, 'mal')}
            <p className="nota">{t('ficha.pista')}</p>
          </>
        )}
      </div>
    </Hoja>
  );
}
