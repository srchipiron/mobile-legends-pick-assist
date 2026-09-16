import { tPorDefecto } from './tPorDefecto.js';

/** Las dos o tres frases sobre el draft. Arriba del todo: es lo que se lee en los tres segundos que hay de verdad. */
export function Analisis({ frases, t = tPorDefecto }) {
  if (!frases?.length) return null;
  return (
    <section className="analisis">
      {frases.map((f) => <p key={f.clave} className={`frase ${f.tono}`}>{t(f.clave, f.params)}</p>)}
    </section>
  );
}
