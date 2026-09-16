import { useMemo } from 'react';
import { buildsDe, objetosDe, ajustesDeBuild } from '../../motor/builds.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Icono } from './Imagen.jsx';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * Los objetos de un héroe en una línea. Dos bloques que NO valen lo mismo:
 * la build (DATO de la API, ordenada por USO, con el aviso de por qué) y el
 * ajuste por el draft (un CONSEJO: de qué pega cada enemigo más cuánta
 * defensa da cada objeto, con su aviso).
 */
export function Builds({ heroe, linea, builds, equipment, enemigos, onCerrar, t = tPorDefecto }) {
  const lista = useMemo(() => buildsDe(builds, heroe, linea), [builds, heroe, linea]);
  const principal = lista[0] ?? null;
  const ajustes = useMemo(() => (principal ? ajustesDeBuild(principal, equipment, enemigos, linea) : []), [principal, equipment, enemigos, linea]);
  const pct = (n) => (n * 100).toFixed(1);
  const cifras = (b) => (
    <span className="build-cifras">
      {b.pickRate != null && <span>{t('build.uso', { pct: pct(b.pickRate) })}</span>}
      {b.winRate != null && <span>{t('build.wr', { pct: pct(b.winRate) })}</span>}
    </span>
  );
  const extra = (b) => (
    <>
      {b.emblema && <span>{t('build.emblema', { nombre: b.emblema })}</span>}
      {b.hechizo && <span>{t('build.hechizo', { nombre: b.hechizo })}</span>}
    </>
  );

  return (
    <Hoja etiqueta={t('build.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={`${heroe?.name} · ${t('build.deLinea', { linea: t(`linea.${linea}`) })}`}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="build-cuerpo">
        {!principal && <p className="build-vacio">{t('build.sinBuild')}</p>}
        {principal && (
          <>
            <section className="build">
              <p className="build-nucleo">{t('build.nucleo')}</p>
              <ol className="build-objetos">
                {objetosDe(equipment, principal).map((o) => (
                  <li key={o.id}>
                    <Icono id={o.id} nombre={o.nombre} />
                    <span className="obj-nombre">{o.nombre}</span>
                    {(o.magica || o.fisica) && (
                      <span className="obj-def">
                        {o.magica ? `+${o.magica} ${t('build.defMagica')}` : ''}
                        {o.magica && o.fisica ? ' · ' : ''}
                        {o.fisica ? `+${o.fisica} ${t('build.defFisica')}` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <p className="build-extra">{extra(principal)}</p>
              <p className="build-cifras">
                {principal.pickRate != null && <span>{t('build.uso', { pct: pct(principal.pickRate) })}</span>}
                {principal.winRate != null && <span>{t('build.wr', { pct: pct(principal.winRate) })}</span>}
              </p>
            </section>
            {ajustes.length > 0 && (
              <section className="build-ajuste">
                <p className="build-nucleo">{t('build.ajusteTitulo')}</p>
                {ajustes.map((a) => (
                  <div key={a.clave}>
                    <p className="frase bad">{t(a.clave, { ...a.params, objetos: a.objetos.map((o) => o.nombre).join(', ') })}</p>
                    <ul className="build-propuestos">
                      {a.objetos.map((o) => <li key={o.id}><Icono id={o.id} nombre={o.nombre} /><span>{o.nombre}</span></li>)}
                    </ul>
                  </div>
                ))}
                <p className="build-nota">{t('build.ajusteAviso')}</p>
              </section>
            )}
            {lista.length > 1 && (
              <section className="build-otras">
                <p className="build-nucleo">{t('build.otras')}</p>
                {/* El emblema y el hechizo también aquí: hay builds con los mismos
                    tres objetos que solo se diferencian en el hechizo. */}
                {lista.slice(1).map((b, i) => (
                  <p key={i} className="build-otra">
                    <span className="build-otra-objetos">
                      {objetosDe(equipment, b).map((o) => <span key={o.id}><Icono id={o.id} nombre={o.nombre} />{o.nombre}</span>)}
                    </span>
                    <span className="build-cifras">{extra(b)}</span>
                    {cifras(b)}
                  </p>
                ))}
              </section>
            )}
            <p className="build-nota">{t('build.sesgo')}</p>
          </>
        )}
        <p className="build-nota">{t('build.objetosEnIngles')}</p>
      </div>
    </Hoja>
  );
}
