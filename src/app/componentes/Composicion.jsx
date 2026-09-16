import { tPorDefecto } from './tPorDefecto.js';

/** Qué tiene cada equipo: de qué pega y si hay primera línea, control e inicio. En una tira. */
export function Composicion({ comp, t = tPorDefecto }) {
  if (!comp) return null;
  const fila = (nombre, c) => {
    if (!c.n) return null;
    const d = c.dano;
    const dano = [['fisico', d.fisico], ['magico', d.magico], ['mixto', d.mixto]].filter(([, n]) => n > 0).map(([k, n]) => `${n} ${t(`comp.${k}`)}`).join(' · ');
    return (
      <div className="comp-fila">
        <span className="comp-quien">{nombre}</span>
        <span className="comp-dano">{dano}</span>
        {['tanky', 'cc_hard', 'engage', 'peel'].map((tag) => (
          <span key={tag} className={`comp-chip ${c.cubiertos[tag] ? 'si' : 'falta'}`}>{c.cubiertos[tag] ? '✓' : '✗'} {t(`comp.${tag}`)}</span>
        ))}
        {c.dobles.map((db) => <span key={db.rol} className="comp-chip doble">{t('comp.doble', { n: db.n, rol: t(`rol.${db.rol}`), pp: db.pp })}</span>)}
      </div>
    );
  };
  return (
    <section className="comp">
      {fila(t('comp.tu'), comp.mio)}
      {fila(t('comp.ellos'), comp.suyo)}
    </section>
  );
}
