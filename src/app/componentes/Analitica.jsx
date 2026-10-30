import { useMemo } from 'react';
import { tusNumeros, tuSemana } from '../../motor/habitos.js';
import { evolucion, porCompaneros, porDia, porLinea, conLaApp, partidasValidas } from '../../motor/analitica.js';
import { nombreClave } from '../../motor/nombres.js';
import { Hoja, CabeceraDeHoja } from './Hoja.jsx';
import { Cara } from './Imagen.jsx';
import { Veredicto } from './Veredicto.jsx';
import { tPorDefecto } from './tPorDefecto.js';

const pct = (v) => Math.round(v * 100);

/**
 * La analítica de tus partidas (3.88.0): un panel con todo lo que dicen tus
 * partidas, las que apunta la tablet y las que apuntas tú. Arriba las cifras
 * de un vistazo; luego cómo vas semana a semana, con qué héroes, con quién y
 * contra quién, cuándo y si te ayuda la app. Cada porcentaje lleva su
 * intervalo y «mejor/peor» solo sale si el intervalo deja fuera tu media:
 * con 10 partidas un 70% cabe en una racha normal.
 */
export function Analitica({ partidas, maestria, datos, onCerrar, t = tPorDefecto, ahora }) {
  const opciones = ahora ? { ahora } : {};
  const r = useMemo(() => {
    const validas = partidasValidas(partidas);
    return {
      n: validas.length,
      numeros: tusNumeros(partidas, opciones),
      semana: tuSemana(partidas, opciones),
      evolucion: evolucion(partidas, opciones),
      aliados: porCompaneros(partidas, { lado: 'aliados' }),
      enemigos: porCompaneros(partidas, { lado: 'enemigos' }),
      dias: porDia(partidas),
      lineas: porLinea(partidas),
      app: conLaApp(partidas),
    };
    // `opciones` es nuevo en cada render; lo que cambia el cálculo es `ahora`.
  }, [partidas, ahora]);
  const porClave = useMemo(() => new Map((datos?.heroes ?? []).map((h) => [nombreClave(h.name), h])), [datos]);
  const heroe = (nombre) => porClave.get(nombreClave(nombre)) ?? null;
  const media = r.numeros.wr;

  return (
    <Hoja etiqueta={t('ana.titulo')} onCerrar={onCerrar}>
      <CabeceraDeHoja titulo={t('ana.titulo')}>
        <button className="close" onClick={onCerrar}>{t('app.cerrar')}</button>
      </CabeceraDeHoja>
      <div className="sheet-body analitica">
        {!r.n ? <p className="nota">{t('ana.vacio')}</p> : (
          <>
            <Cifras r={r} t={t} />
            <section className="ana-bloque" aria-label={t('ana.evolucion')}>
              <h3>{t('ana.evolucion')}</h3>
              <Evolucion semanas={r.evolucion} media={media} t={t} />
            </section>

            <section className="ana-bloque" aria-label={t('ana.heroes')}>
              <h3>{t('ana.heroes')}</h3>
              {r.numeros.heroes.length ? (
                <div className="ana-filas">
                  {r.numeros.heroes.map((h) => <Fila key={h.heroe} heroe={heroe(h.heroe)} nombre={h.heroe} d={{ ...h, ganadas: Math.round(h.wr * h.n) }} media={media} t={t} />)}
                </div>
              ) : <p className="nota">{t('ana.pocasHeroe')}</p>}
              <p className="build-nota">{t('ana.notaIntervalo', { media: pct(media) })}</p>
            </section>

            <div className="ana-dos">
              <Lista titulo={t('ana.aliadosMejores')} items={r.aliados.mejores} heroe={heroe} media={r.aliados.media} vacio={t('ana.pocosCon')} t={t} />
              <Lista titulo={t('ana.aliadosPeores')} items={r.aliados.peores} heroe={heroe} media={r.aliados.media} vacio={t('ana.pocosCon')} t={t} />
              <Lista titulo={t('ana.enemigosMejores')} items={r.enemigos.mejores} heroe={heroe} media={r.enemigos.media} vacio={t('ana.pocosCon')} t={t} />
              <Lista titulo={t('ana.enemigosPeores')} items={r.enemigos.peores} heroe={heroe} media={r.enemigos.media} vacio={t('ana.pocosCon')} t={t} />
            </div>

            <section className="ana-bloque" aria-label={t('ana.cuando')}>
              <h3>{t('ana.cuando')}</h3>
              <Grupos grupos={r.dias} nombre={(id) => t(`ana.dia.${id}`)} t={t} />
              <Grupos grupos={r.numeros.franjas} nombre={(id) => t(`numeros.franja.${id}`)} t={t} />
              <Grupos grupos={r.numeros.duraciones} nombre={(id) => t(`numeros.duracion.${id}`)} t={t} />
              {r.numeros.trasPerder && <Grupos grupos={[{ ...r.numeros.trasPerder, id: 'trasPerder' }]} nombre={() => t('ana.trasPerder')} t={t} />}
              {r.lineas.length > 0 && <Grupos grupos={r.lineas} nombre={(id) => t(`linea.${id}`)} t={t} />}
              <p className="build-nota">{t('ana.notaGrupos')}</p>
            </section>

            <section className="ana-bloque" aria-label={t('ana.app')}>
              <h3>{t('ana.app')}</h3>
              {r.app.n > 0 ? (
                <div className="ana-filas">
                  {['numeroUno', 'entreLosTres', 'porLibre'].filter((k) => r.app[k]).map((k) => <Fila key={k} nombre={t(`ana.app.${k}`)} d={r.app[k]} media={r.app.media} t={t} />)}
                </div>
              ) : <p className="nota">{t('ana.pocasApp')}</p>}
              <Veredicto partidas={partidas} maestria={maestria} t={t} />
            </section>
          </>
        )}
      </div>
    </Hoja>
  );
}

/** Las cifras de un vistazo: partidas, winrate, racha, hoy y esta semana. */
function Cifras({ r, t }) {
  const { numeros: nu, semana: s } = r;
  const a = s.anterior;
  return (
    <div className="ana-cifras">
      <div className="ana-cifra"><span>{t('ana.partidas')}</span><strong>{nu.n}</strong></div>
      <div className="ana-cifra"><span>{t('ana.winrate')}</span><strong>{pct(nu.wr)}%</strong></div>
      <div className="ana-cifra"><span>{t('ana.racha')}</span><strong className={nu.racha.gane ? 'partida-bien' : 'partida-mal'}>{t(nu.racha.gane ? 'ana.rachaG' : 'ana.rachaP', { n: nu.racha.n })}</strong></div>
      <div className="ana-cifra"><span>{t('ana.semana')}</span><strong>{s.n ? `${pct(s.wr)}%` : '—'}</strong>
        <small>{s.n ? t('ana.semanaN', { n: s.n }) : t('ana.semanaVacia')}{a ? ` · ${t('ana.antes', { pct: pct(a.wr) })}` : ''}</small>
      </div>
      {nu.sesion && <div className="ana-cifra"><span>{t('ana.hoy')}</span><strong>{t('ana.hoyGP', { g: nu.sesion.ganadas, p: nu.sesion.n - nu.sesion.ganadas })}</strong></div>}
    </div>
  );
}

/**
 * Semana a semana (una sola serie: winrate por semana, una barra cada una),
 * con tu media de línea de referencia. El número exacto, al pasar por
 * encima (`<title>`) y en la tabla de debajo, que también es la vista sin
 * color. Las semanas sin partidas dejan el hueco.
 */
function Evolucion({ semanas, media, t }) {
  const ancho = 360, alto = 120, abajo = 18, izquierda = 26, barra = (ancho - izquierda) / semanas.length;
  const y = (v) => 4 + (alto - abajo - 4) * (1 - v);
  const fecha = (ms) => new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  return (
    <>
      <svg className="ana-evolucion" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={t('ana.evolucionAria')}>
        {[0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line className="ana-rejilla" x1={izquierda} x2={ancho} y1={y(v)} y2={y(v)} />
            <text className="ana-n" x={izquierda - 4} y={y(v) + 3} textAnchor="end">{pct(v)}%</text>
          </g>
        ))}
        {semanas.map((s, i) => {
          const x = izquierda + i * barra + 2, w = barra - 4;
          if (!s.n) return <rect key={i} className="ana-vacia" x={x} y={y(0) - 2} width={w} height="2"><title>{t('ana.semanaSin', { fecha: fecha(s.hasta) })}</title></rect>;
          const h = Math.max(2, y(0) - y(s.wr));
          return (
            <g key={i}>
              <path className="ana-barra" d={`M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z`}>
                <title>{t('ana.semanaTip', { fecha: fecha(s.hasta), pct: pct(s.wr), g: s.ganadas, n: s.n })}</title>
              </path>
              <text className="ana-n" x={x + w / 2} y={alto - 4} textAnchor="middle">{s.n}</text>
            </g>
          );
        })}
        {media != null && <line className="ana-media" x1={izquierda} x2={ancho} y1={y(media)} y2={y(media)} />}
      </svg>
      <p className="build-nota">{t('ana.evolucionNota', { media: pct(media ?? 0) })}</p>
    </>
  );
}

/** Una fila con su intervalo: la barra es de 0 a 100%, el tramo es el intervalo, el punto tu winrate y la raya tu media. */
function Fila({ heroe, nombre, d, media, t }) {
  return (
    <div className={`ana-fila ${d.lado ?? ''}`}>
      <span className="ana-nombre">{heroe && <Cara heroe={heroe} alt="" className="grid-cara" tam={22} />}{nombre}</span>
      <span className="ana-wr">{pct(d.wr)}%</span>
      <span className="ana-n-fila">{t('ana.de', { g: d.ganadas, n: d.n })}</span>
      <span className="ana-intervalo" role="img" aria-label={t('ana.intervalo', { bajo: pct(d.bajo), alto: pct(d.alto) })} title={t('ana.intervalo', { bajo: pct(d.bajo), alto: pct(d.alto) })}>
        <i className="ana-tramo" style={{ left: `${d.bajo * 100}%`, width: `${(d.alto - d.bajo) * 100}%` }} />
        {media != null && <i className="ana-raya" style={{ left: `${media * 100}%` }} />}
        <i className="ana-punto" style={{ left: `${d.wr * 100}%` }} />
      </span>
      {d.lado && <span className="ana-lado">{t(`ana.lado.${d.lado}`)}</span>}
    </div>
  );
}

function Lista({ titulo, items, heroe, media, vacio, t }) {
  return (
    <section className="ana-bloque" aria-label={titulo}>
      <h3>{titulo}</h3>
      {items.length ? <div className="ana-filas">{items.map((h) => <Fila key={h.heroe} heroe={heroe(h.heroe)} nombre={h.heroe} d={h} media={media} t={t} />)}</div> : <p className="nota">{vacio}</p>}
    </section>
  );
}

/** Cada grupo contra el resto, con el margen al lado; el que se distingue, marcado. */
function Grupos({ grupos, nombre, t }) {
  if (!grupos.length) return null;
  return grupos.map((g) => (
    <p key={g.id} className={`veredicto-cifra ana-grupo ${g.seVe ? (g.dif > 0 ? 'mejor' : 'peor') : ''}`}>
      {t('ana.grupo', { grupo: nombre(g.id), a: pct(g.wr), na: g.n, b: pct(g.wrResto), signo: g.dif >= 0 ? '+' : '−', dif: Math.abs(g.dif * 100).toFixed(1), margen: (g.margen * 100).toFixed(1) })}
      {g.seVe && <> · {t(g.dif > 0 ? 'ana.lado.mejor' : 'ana.lado.peor')}</>}
    </p>
  ));
}
