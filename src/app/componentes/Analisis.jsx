import { useT } from '../i18n/contexto.js';

/** Las dos o tres frases sobre el draft, encima de las tarjetas: lo que se lee en los tres segundos que hay. */
export function Analisis({ frases }) {
  const t = useT();
  if (!frases?.length) return null;
  return (
    <section className="analisis">
      {frases.map((f) => <p key={f.clave} className={`frase ${f.tono}`}>{t(f.clave, f.params)}</p>)}
    </section>
  );
}
