import { useEffect, useMemo, useState } from 'react';
import { resolverNombres } from '../motor/draft.js';
import { buscar } from '../motor/nombres.js';
import { diagnosticar } from '../motor/diagnostico/index.js';
import { IDIOMAS } from './i18n/index.js';
import { useAjustes } from './estado/useAjustes.js';
import { useDatos } from './estado/useDatos.js';
import { useDraft } from './estado/useDraft.js';
import { usePersonal } from './estado/usePersonal.js';
import { useRecomendacion } from './estado/useRecomendacion.js';
import { useActualizacion } from './estado/useActualizacion.js';
import { leerEntorno, pedirPublicada } from './entorno.js';
import { ElegirLinea } from './pantallas/ElegirLinea.jsx';
import { FaseBaneos } from './pantallas/FaseBaneos.jsx';
import { FasePicks } from './pantallas/FasePicks.jsx';
import { SelectorDeHeroe } from './componentes/SelectorDeHeroe.jsx';
import { Pie } from './componentes/Pie.jsx';
import { AvisoLegal } from './componentes/AvisoLegal.jsx';
import { Diagnostico } from './componentes/Diagnostico.jsx';
import { Builds } from './componentes/Builds.jsx';
import { ApuntarPartida } from './componentes/ApuntarPartida.jsx';
import { HistorialPartidas } from './componentes/HistorialPartidas.jsx';
import { Perfil } from './componentes/Perfil.jsx';
import { EditorDeMaestria } from './componentes/EditorDeMaestria.jsx';
import { Meta } from './componentes/Meta.jsx';

/**
 * La app: estado (hooks de ./estado), motor (src/motor, por useRecomendacion)
 * y pantallas. Aquí no se calcula nada del draft: se resuelven los nombres
 * guardados a héroes, se decide qué pantalla y qué hoja se ven, y se cablean
 * las acciones.
 */
export default function App() {
  const { t, linea, setLinea, rango, setRango, idioma, setIdioma } = useAjustes();
  const carga = useDatos(rango);
  const { datos, meta, metaListo, pro, error, generado, edadHoras, sinWinrates } = carga;
  const draft = useDraft();
  const personal = usePersonal();
  useActualizacion();

  // 'enemigos' | 'aliados' | 'baneos' | 'maestria' | 'historial' | 'perfil' | 'linea' | 'apuntar' | { build }
  const [hoja, setHoja] = useState(null);
  const [informe, setInforme] = useState(null);
  const cerrar = () => setHoja(null);

  const enemigos = useMemo(() => resolverNombres(datos, draft.enemigos), [datos, draft.enemigos]);
  const aliados = useMemo(() => resolverNombres(datos, draft.aliados), [datos, draft.aliados]);
  const baneos = useMemo(() => resolverNombres(datos, draft.baneos), [datos, draft.baneos]);
  const miPick = useMemo(() => (draft.miPick ? datos.porNombre.get(draft.miPick) ?? null : null), [datos, draft.miPick]);

  // Un nombre guardado que ya no resuelve (la API renombró al héroe) era
  // invisible, inamovible y contaba como cogido. Se limpia al tener el catálogo.
  const { limpiarDesconocidos } = draft;
  useEffect(() => {
    if (!carga.catalogo || !metaListo) return;
    limpiarDesconocidos(new Set(datos.heroes.map((h) => h.name)));
  }, [carga.catalogo, metaListo, datos, limpiarDesconocidos]);

  const rec = useRecomendacion({
    datos, linea, enemigos, aliados, baneos, rivalMarcado: draft.rivalMarcado, miPick,
    maestria: personal.maestriaUsada, partidas: personal.partidas,
  });

  const cogidos = useMemo(() => new Set([...draft.enemigos, ...draft.aliados, ...draft.baneos]), [draft.enemigos, draft.aliados, draft.baneos]);
  const cogidosSinBaneos = useMemo(() => new Set([...draft.enemigos, ...draft.aliados]), [draft.enemigos, draft.aliados]);
  const seleccionadosBaneo = useMemo(() => new Set(draft.baneos), [draft.baneos]);
  // Memorizado: la hoja del perfil comprime el código en un efecto sobre
  // `datos`, y un objeto nuevo en cada render lo regeneraba cada vez.
  const datosPerfil = useMemo(
    () => ({ mastery: personal.maestria, partidas: personal.partidas, rango: datos.rango, linea, idioma }),
    [personal.maestria, personal.partidas, datos.rango, linea, idioma],
  );

  const elegirEnSelector = (h) => {
    if (hoja === 'baneos') { draft.alternarBaneo(h); return; }
    if (hoja === 'enemigos') draft.anadir('enemigos', h);
    if (hoja === 'aliados') draft.anadir('aliados', h);
    if (hoja === 'yo') draft.fijarPick(h);
    cerrar();
  };

  /**
   * Apunta la partida con la estimación que había delante para ESE héroe y
   * el draft entero (es lo que la hace medible después), y limpia el draft.
   */
  const guardarPartida = (pick, gane) => {
    const heroe = datos.porNombre.get(pick);
    const est = heroe ? rec.estimacionCon(heroe) : null;
    personal.apuntarPartida({
      pick, gane, rango: datos.rango,
      recomendados: rec.ranking.slice(0, 3).map((r) => r.heroe.name),
      ...(est ? { estimacion: est.p } : {}),
      bans: draft.baneos,
      draft: { linea, enemigos: draft.enemigos, aliados: draft.aliados, rival: rec.rival.nombre },
    });
    cerrar();
    draft.reiniciar();
  };

  /** Trae los datos de otro dispositivo: vienen fundidos, así que solo guarda. */
  const traerPerfil = (fundido) => {
    personal.importarPerfil(fundido);
    if (fundido.rango && !rango) setRango(fundido.rango);
    if (fundido.linea && !linea) setLinea(fundido.linea);
  };

  const lanzarDiagnostico = async () => {
    try {
      const { publicada, historial } = await pedirPublicada();
      setInforme(diagnosticar({
        datos, linea,
        maestria: personal.maestriaUsada, maestriaManual: personal.maestria, partidas: personal.partidas,
        draft: {
          enemigos, aliados, baneos, rival: rec.rival, ranking: rec.ranking, analisis: rec.analisis, miPick: draft.miPick,
          robustez: rec.robustez, composicion: rec.composicion,
          estimaciones: rec.ranking.slice(0, 3).map((r) => ({ yo: r.heroe.name, p: r.p, puntos: r.puntos, terminos: r.terminos, vistos: aliados.length + enemigos.length + 1 })),
        },
        historial, pro,
        entorno: leerEntorno({ version: __APP_VERSION__, buildTime: __BUILD_TIME__, rango: datos.rango, publicada }),
      }));
    } catch (err) {
      // Que el diagnóstico falle no debe dejar la app en blanco: el propio error es información útil.
      setInforme({ texto: `El diagnóstico ha fallado:\n${err?.stack ?? err}`, fallos: 1, avisos: 0 });
    }
  };

  if (error) return <div className="results"><p className="notice">{t('app.errorDatos', { error })}</p></div>;
  if (!carga.catalogo) return <div className="results"><p className="empty-state">{t('app.cargando')}</p></div>;

  // Primer arranque: sin línea no hay nada que recomendar.
  if (!linea) {
    return (
      <div className="app">
        <ElegirLinea valor={null} onElegir={setLinea} t={t} idioma={idioma} onIdioma={setIdioma} idiomas={IDIOMAS} />
        <AvisoLegal t={t} idioma={idioma} onIdioma={setIdioma} idiomas={IDIOMAS} />
      </div>
    );
  }

  const pie = <Pie t={t} meta={meta} generado={generado} edadHoras={edadHoras} rango={datos.rango} cov={rec.cov} />;
  const selector = ['enemigos', 'aliados', 'baneos', 'yo'].includes(hoja) ? (
    <SelectorDeHeroe
      // Para tu pick: solo tu pool, en el orden del ranking.
      heroes={hoja === 'yo' ? rec.ranking.map((c) => c.heroe) : datos.heroes}
      stats={datos.meta.stats}
      // Para banear, los baneados no están «cogidos»: se tocan para quitarlos.
      cogidos={hoja === 'baneos' ? cogidosSinBaneos : cogidos}
      onElegir={elegirEnSelector}
      onCerrar={cerrar}
      multi={hoja === 'baneos'}
      seleccionados={hoja === 'baneos' ? seleccionadosBaneo : null}
      max={10}
      sugeridos={hoja === 'baneos' ? rec.proximos.map((b) => b.heroe) : []}
      orden={hoja === 'baneos' ? 'ban' : hoja === 'yo' ? 'dado' : 'pick'}
      t={t}
    />
  ) : null;

  if (draft.fase === 'baneos') {
    return (
      <>
        <FaseBaneos
          t={t} baneos={baneos} proximos={rec.proximos} sugeridos={rec.baneosSugeridos} plan={rec.plan}
          tasaDe={(n) => buscar(datos.meta.stats, n)?.banRate ?? null}
          sinWinrates={sinWinrates} idioma={idioma} onIdioma={setIdioma}
          onAbrirSelector={() => setHoja('baneos')}
          onBanear={(h) => draft.anadir('baneos', h)}
          onQuitar={(h) => draft.quitar('baneos', h)}
          onAPicks={() => draft.setFase('picks')}
          pie={pie}
        />
        {selector}
      </>
    );
  }

  return (
    <>
      <FasePicks
        t={t} linea={linea} rango={datos.rango} idioma={idioma} onIdioma={setIdioma} onRango={setRango}
        meta={meta} datos={datos} metaListo={metaListo} sinWinrates={sinWinrates} edadHoras={edadHoras} pro={pro}
        draft={draft} equipo={{ enemigos, aliados, baneos }} miPick={miPick} maestria={personal.maestriaUsada} rec={rec} abrir={setHoja} onDiagnostico={lanzarDiagnostico}
        onResultado={(gane) => guardarPartida(draft.miPick, gane)}
        pie={pie}
      />
      {informe && <Diagnostico t={t} resultado={informe} onCerrar={() => setInforme(null)} />}
      {hoja?.build && (
        <Builds heroe={hoja.build} linea={linea} builds={meta?.builds} equipment={meta?.equipment} enemigos={enemigos} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'linea' && (
        <ElegirLinea valor={linea} onElegir={(l) => { setLinea(l); cerrar(); }} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'apuntar' && (
        <ApuntarPartida pool={rec.pool} heroes={datos.heroes} miPick={draft.miPick} recomendados={rec.ranking.slice(0, 3).map((r) => r.heroe.name)} onGuardar={guardarPartida} onCerrar={cerrar} t={t} />
      )}
      {hoja === 'historial' && (
        <HistorialPartidas
          partidas={personal.partidas} maestria={personal.maestria} pool={rec.pool}
          onOlvidar={personal.olvidarPartida} onCorregir={personal.corregirPartida}
          onAnadir={(heroe, gane) => personal.apuntarPartida({ pick: heroe, gane, previa: true, rango: datos.rango })}
          onCerrar={cerrar} t={t}
        />
      )}
      {hoja === 'perfil' && <Perfil datos={datosPerfil} onImportar={traerPerfil} onCerrar={cerrar} t={t} />}
      {hoja === 'meta' && <Meta datos={datos} linea={linea} onCerrar={cerrar} t={t} />}
      {hoja === 'maestria' && (
        <EditorDeMaestria pool={rec.pool} maestria={personal.maestria} onGuardar={personal.guardarMaestria} onCerrar={cerrar} t={t} />
      )}
      {selector}
    </>
  );
}
