import { useT } from '../i18n/contexto.js';

/** [D] Lo que se dice que FALTA en cada equipo; lo que sí tiene no se pinta (empujaba la nº1 fuera de la pantalla). */
const HUECOS = ['tanky', 'cc_hard', 'engage', 'peel'];

/** Qué tiene cada equipo: de qué pega, lo que le falta y los papeles repetidos, en una tira. */
export function Composicion({ comp }) {
  const t = useT();
  if (!comp) return null;
  const fila = (nombre, c) => {
    if (!c.n) return null;
    const d = c.dano;
    const dano = [['fisico', d.fisico], ['magico', d.magico], ['mixto', d.mixto]].filter(([, n]) => n > 0).map(([k, n]) => `${n} ${t(`comp.${k}`)}`).join(' · ');
    return (
      <div className="comp-fila">
        <span className="comp-quien">{nombre}</span>
        <span className="comp-dano">{dano}</span>
        {HUECOS.filter((tag) => !c.cubiertos[tag]).map((tag) => <span key={tag} className="comp-chip falta">{t('comp.sin', { que: t(`comp.${tag}`) })}</span>)}
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
