import { Bando } from '../componentes/Bando.jsx';
import { BotonLector } from '../componentes/BotonLector.jsx';
import { ProximosBaneos } from '../componentes/ProximosBaneos.jsx';
import { BaneosSugeridos } from '../componentes/BaneosSugeridos.jsx';
import { AvisoLegal } from '../componentes/AvisoLegal.jsx';
import { Cara } from '../componentes/Imagen.jsx';
import { useT } from '../i18n/contexto.js';

/**
 * Fase 1: los baneos, solos. Diez toques en medio minuto: el selector
 * multi-toque se abre desde cualquier hueco o desde «Buscar», y el único
 * camino hacia delante es «Ir a los picks».
 *
 * @param lector  lo de la tablet (null sin tablet vinculada: ni botón ni petición)
 * @param plan    tu plan A·B·C antes de que salga nadie (uno ya baneado sale tachado)
 */
export function FaseBaneos({ baneos, proximos, sugeridos, plan = [], tasaDe, rangoDatos = '', sinWinrates, idioma, onIdioma, tacto, onTacto, onAbrirSelector, onBanear, onQuitar, onAPicks, lector = null, pie, barra = null }) {
  const t = useT();
  const baneados = new Set(baneos.map((h) => h.name));
  return (
    <div className="app fase-baneos">
      <aside className="draft">
        <div className="brand">
          <h1>{t('fase.baneos')}</h1>
          <span className="freshness">{t('fase.baneosResumen', { n: baneos.length, max: 10 })}</span>
          <span className="freshness version">v{__APP_VERSION__}</span>
        </div>
        <p className="fase-pista">{t('fase.baneosPista')}</p>
        <Bando titulo={t('app.baneados')} tipo="bans" picks={baneos} max={10} onAnadir={onAbrirSelector} onQuitar={onQuitar} />
        <ProximosBaneos items={proximos} baneos={baneos} visibles={baneos.length < 10 ? 8 : 0} tasaDe={tasaDe} rango={rangoDatos} onBanear={onBanear} onQuitar={onQuitar} />
        <div className="tools">
          <button className="reset" onClick={onAbrirSelector}>{t('fase.buscarBaneo')}</button>
          {lector && <BotonLector lector={lector} conAuto />}
        </div>
        <button className="reset primario" onClick={onAPicks}>{baneos.length ? t('fase.aPicks') : t('fase.sinBaneosAPicks')}</button>
        {plan.length > 0 && (
          <section className="plan">
            <div className="side-label"><span>{t('plan.titulo')}</span><span>{t('plan.segun')}</span></div>
            <div className="equipo-chips">
              {plan.map((x, i) => (
                <span key={x.heroe.name} className={`chip ${baneados.has(x.heroe.name) ? 'elegido' : ''}`.trim()}>
                  <Cara heroe={x.heroe} alt="" className="grid-cara" tam={22} />
                  {String.fromCharCode(65 + i)} · {x.heroe.name}
                  <span className="chip-pct">{Math.round(x.p * 100)}%{x.banRate != null ? ` · ${t('ban.tasa', { pct: Math.round(x.banRate * 100) })}` : ''}</span>
                </span>
              ))}
            </div>
          </section>
        )}
        <BaneosSugeridos items={baneos.length < 10 ? sugeridos : []} onBanear={onBanear} rango={rangoDatos} plan={plan.map((x) => x.heroe.name)} />
        {sinWinrates ? <div className="notice">{t('app.sinWinrates')}</div> : null}
        {barra}
        <AvisoLegal idioma={idioma} onIdioma={onIdioma} tacto={tacto} onTacto={onTacto} />
      </aside>
      {pie}
    </div>
  );
}
