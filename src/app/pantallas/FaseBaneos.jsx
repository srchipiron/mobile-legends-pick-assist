import { Bando } from '../componentes/Bando.jsx';
import { ProximosBaneos } from '../componentes/ProximosBaneos.jsx';
import { BaneosSugeridos } from '../componentes/BaneosSugeridos.jsx';
import { AvisoLegal } from '../componentes/AvisoLegal.jsx';
import { Cara } from '../componentes/Imagen.jsx';
import { IDIOMAS } from '../i18n/index.js';

/**
 * Fase 1: los baneos, solos. Diez toques en medio minuto: el selector
 * multi-toque se abre desde cualquier hueco o desde el botón grande, y el
 * único camino hacia delante es «Ir a los picks».
 */
export function FaseBaneos({ t, baneos, proximos, sugeridos, plan = [], tasaDe, rangoDatos = '', sinWinrates, idioma, onIdioma, onAbrirSelector, onBanear, onQuitar, onAPicks, pie }) {
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
        <Bando t={t} titulo={t('app.baneados')} tipo="bans" picks={baneos} max={10} onAnadir={onAbrirSelector} onQuitar={onQuitar} />
        <ProximosBaneos t={t} items={proximos} baneos={baneos} visibles={baneos.length < 10 ? 8 : 0} tasaDe={tasaDe} rango={rangoDatos} onBanear={onBanear} onQuitar={onQuitar} />
        <button className="reset" onClick={onAbrirSelector}>{t('fase.buscarBaneo')}</button>
        <button className="reset primario" onClick={onAPicks}>{baneos.length ? t('fase.aPicks') : t('fase.sinBaneosAPicks')}</button>
        {/* Tu plan antes de que salga nadie: la mitad de las veces el plan A
            llega baneado (Marcel 55% de ban), y verlo aquí ahorra los 30
            segundos del pick. Un plan ya baneado sale tachado. */}
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
        {/* Con los diez marcados no hay más que banear: el undécimo no existe. */}
        <BaneosSugeridos t={t} items={baneos.length < 10 ? sugeridos : []} onBanear={onBanear} rango={rangoDatos} plan={plan.map((x) => x.heroe.name)} />
        {/* Sin winrates (API caída en el primer arranque) la fase quedaba con huecos «+» y un selector alfabético sin explicación. */}
        {sinWinrates ? <div className="notice">{t('app.sinWinrates')}</div> : null}
        <AvisoLegal t={t} idioma={idioma} onIdioma={onIdioma} idiomas={IDIOMAS} />
      </aside>
      {pie}
    </div>
  );
}
