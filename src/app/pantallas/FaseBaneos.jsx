import { Bando } from '../componentes/Bando.jsx';
import { ProximosBaneos } from '../componentes/ProximosBaneos.jsx';
import { BaneosSugeridos } from '../componentes/BaneosSugeridos.jsx';
import { AvisoLegal } from '../componentes/AvisoLegal.jsx';
import { IDIOMAS } from '../i18n/index.js';

/**
 * Fase 1: los baneos, solos. Diez toques en medio minuto: el selector
 * multi-toque se abre desde cualquier hueco o desde el botón grande, y el
 * único camino hacia delante es «Ir a los picks».
 */
export function FaseBaneos({ t, baneos, proximos, sugeridos, tasaDe, sinWinrates, idioma, onIdioma, onAbrirSelector, onBanear, onQuitar, onAPicks, pie }) {
  return (
    <div className="app fase-baneos">
      <aside className="draft">
        <div className="brand">
          <h1>{t('fase.baneos')}</h1>
          <span className="freshness">{t('fase.baneosResumen', { n: baneos.length, max: 10 })}</span>
        </div>
        <p className="fase-pista">{t('fase.baneosPista')}</p>
        <Bando t={t} titulo={t('app.baneados')} tipo="bans" picks={baneos} max={10} onAnadir={onAbrirSelector} onQuitar={onQuitar} />
        <ProximosBaneos t={t} items={proximos} baneos={baneos} visibles={baneos.length < 10 ? 8 : 0} tasaDe={tasaDe} onBanear={onBanear} onQuitar={onQuitar} />
        <button className="reset" onClick={onAbrirSelector}>{t('fase.buscarBaneo')}</button>
        <button className="reset primario" onClick={onAPicks}>{baneos.length ? t('fase.aPicks') : t('fase.sinBaneosAPicks')}</button>
        {/* Con los diez marcados no hay más que banear: el undécimo no existe. */}
        <BaneosSugeridos t={t} items={baneos.length < 10 ? sugeridos : []} onBanear={onBanear} />
        {/* Sin winrates (API caída en el primer arranque) la fase quedaba con huecos «+» y un selector alfabético sin explicación. */}
        {sinWinrates ? <div className="notice">{t('app.sinWinrates')}</div> : null}
        <AvisoLegal t={t} idioma={idioma} onIdioma={onIdioma} idiomas={IDIOMAS} />
      </aside>
      {pie}
    </div>
  );
}
