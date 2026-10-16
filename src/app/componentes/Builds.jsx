import { useMemo, useRef } from 'react';
import { tic } from '../tacto.js';
import { buildsDe, objetosDe, ajustesDeBuild, buildParaElDraft } from '../../motor/builds.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Icono } from './Imagen.jsx';
import { tPorDefecto } from './tPorDefecto.js';
import { PlanDePartida } from './PlanDePartida.jsx';

/**
 * Los objetos de un héroe en una línea. Dos bloques que NO valen lo mismo:
 * la build (DATO de la API, ordenada por USO, con el aviso de por qué) y el
 * ajuste por el draft (un CONSEJO: de qué pega cada enemigo más cuánta
 * defensa da cada objeto, con su aviso).
 */
export function Builds({ heroe, linea, builds, equipment, talentos = null, enemigos, plan = null, onCerrar, t = tPorDefecto }) {
  const lista = useMemo(() => buildsDe(builds, heroe, linea), [builds, heroe, linea]);
  // De las que se juegan, la que mejor encaja con ESTE draft (3.57.0); sin
  // ninguna mejor, la más usada. Las demás, debajo, con la más usada marcada.
  const eleccion = useMemo(() => buildParaElDraft(lista, equipment, enemigos, linea, { builds }), [lista, equipment, enemigos, linea, builds]);
  const principal = lista[eleccion.indice] ?? null;
  const otras = lista.map((b, i) => ({ b, i })).filter(({ i }) => i !== eleccion.indice);
  const ajustes = useMemo(() => (principal ? ajustesDeBuild(principal, equipment, enemigos, linea, { builds }) : []), [principal, equipment, enemigos, linea, builds]);
  const nombresDeTalentos = (b) => (b.talentos ?? []).map((id) => talentos?.[id]?.nombre).filter(Boolean);
  const pct = (n) => (n * 100).toFixed(1);
  // Saltos (3.59.1): con el plan arriba, los objetos empezaban a 1.118 px en
  // una pantalla de 844 (draft completo a 390): pantalla y media de bajar
  // con prisa. Dos botones fijos arriba llevan a cada parte.
  const cuerpo = useRef(null), objetos = useRef(null), saltos = useRef(null);
  const ir = (destino) => {
    tic();
    const caja = cuerpo.current;
    if (!caja) return;
    const arriba = destino ? destino.getBoundingClientRect().top - caja.getBoundingClientRect().top + caja.scrollTop - (saltos.current?.offsetHeight ?? 0) - 8 : 0;
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    caja.scrollTo({ top: Math.max(0, arriba), behavior: quieto ? 'auto' : 'smooth' });
  };
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
      {nombresDeTalentos(b).length > 0 && <span className="build-talentos">{t('build.talentos', { nombres: nombresDeTalentos(b).join(' · ') })}</span>}
    </>
  );

  return (
    <Hoja etiqueta={t('build.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={`${heroe?.name} · ${t('build.deLinea', { linea: t(`linea.${linea}`) })}`}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="build-cuerpo" ref={cuerpo}>
        {plan && principal && (
          <nav className="build-saltos" ref={saltos} aria-label={t('build.saltos')}>
            <button onClick={() => ir(null)}>{t('build.irPlan')}</button>
            <button onClick={() => ir(objetos.current)}>{t('build.irObjetos')}</button>
          </nav>
        )}
        {plan && <PlanDePartida plan={plan} yo={heroe} t={t} />}
        {!principal && <p className="build-vacio">{t('build.sinBuild')}</p>}
        {principal && (
          <>
            <section className="build" ref={objetos}>
              {eleccion.indice > 0 && (
                <p className="frase bien build-para-draft">{t('build.paraEsteDraft', { pos: eleccion.indice + 1, cubre: eleccion.cubre.map((c) => t(`build.cubre.${c.replace('build.', '')}`)).join(', ') })}</p>
              )}
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
            {otras.length > 0 && (
              <section className="build-otras">
                <p className="build-nucleo">{t('build.otras')}</p>
                {/* El emblema y el hechizo también aquí: hay builds con los mismos
                    tres objetos que solo se diferencian en el hechizo. */}
                {otras.map(({ b, i }) => (
                  <p key={i} className="build-otra">
                    {i === 0 && <span className="build-mas-usada">{t('build.masUsada')}</span>}
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
