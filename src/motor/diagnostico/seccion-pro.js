/** Mismo umbral que medir-pro.mjs («menos de 30 partidas: no hay nada que medir»). */
export const MINIMO_PARA_MEDIR_PRO = 30;

/**
 * Las partidas profesionales (pro.json): cuántas, de cuándo, y la medida del
 * motor contra ellas, que es lo único que dice si la probabilidad estimada
 * se parece a algo.
 *
 * @param {import('./informe.js').Informe} inf
 */
export function seccionPro(inf, pro = null) {
  inf.seccion('PROFESIONAL');
  if (!pro) {
    inf.linea('Sin partidas profesionales (public/data/pro.json no llega): la app funciona igual, sin la línea «Pro» de las tarjetas');
    return;
  }
  inf.linea(`${pro.partidas ?? 0} partidas de ${pro.torneos ?? 0} torneos desde ${pro.desde ?? '?'} (${pro.primera ?? '?'} → ${pro.ultima ?? '?'}) · ${pro.total ?? '?'} guardadas en total`);
  const edadDias = pro.generatedAt ? (Date.now() - Date.parse(pro.generatedAt)) / 86400e3 : null;
  if (edadDias != null) inf.linea(`Corrida de hace ${edadDias.toFixed(1)} días · ${pro.peticiones ?? '?'} peticiones · ${(pro.errores ?? []).length} errores`);
  for (const e of (pro.errores ?? []).slice(0, 3)) inf.linea(`  ${e}`);
  const m = pro.medicion;
  if (m?.terminos?.modelo) {
    const t = m.terminos;
    // Tolerante a un término que falte: el informe entero no puede caerse
    // por una medición a medias.
    const f = (r) => (r ? `AUC ${r.auc?.toFixed(2)} · pendiente ${r.pendiente?.toFixed(2)} ± ${r.errorPendiente?.toFixed(2)}` : '—');
    inf.linea(`Estimación contra ${m.usables} partidas pro desde ${m.desde}: acierto ${Math.round((t.modelo?.acierto ?? 0) * 100)}% · ${f(t.modelo)}`);
    inf.linea(`  héroes ${f(t.heroes)} · cruces ${f(t.cruces)} · parejas ${f(t.parejas)} · lado azul ${Math.round((m.azul ?? 0.5) * 100)}%`);
    // AUC por debajo de 0.5 es ordenar al revés, y eso sí es un fallo del motor.
    if (m.usables >= 200) {
      inf.check(t.modelo.auc >= 0.5, 'La estimación ordena las partidas pro en el sentido correcto',
        `La estimación ordena las partidas pro AL REVÉS (AUC ${t.modelo.auc?.toFixed(2)} en ${m.usables}): revisar el modelo`, true);
    }
  } else if (m && (m.usables ?? 0) < MINIMO_PARA_MEDIR_PRO) {
    // medir-pro escribe siempre el resumen, también con pocas usables: eso
    // no es un fallo del bot.
    inf.linea(`Medición del motor pendiente: ${m.usables ?? 0} partidas usables de ${pro.partidas} (mínimo ${MINIMO_PARA_MEDIR_PRO})`);
  } else {
    // pro.yml escribe pro.json SIN medición y la añade después: si el script
    // revienta, el bot commitea el fichero sin ella. Con partidas de sobra,
    // esa ausencia es un fallo del bot, no una falta de datos.
    inf.check((pro.partidas ?? 0) < MINIMO_PARA_MEDIR_PRO, 'Sin medición del motor contra las partidas pro (aún hay pocas)',
      `pro.json trae ${pro.partidas} partidas y NINGUNA medición del motor: medir-pro.mjs falló en pro.yml y el bot commiteó igual`);
  }
  const sinMapear = Object.entries(pro.sinMapear ?? {});
  inf.check(!sinMapear.length, 'Todos los nombres de Liquipedia se reconocen',
    `Nombres de Liquipedia sin reconocer: ${sinMapear.map(([s, n]) => `${s} (${n})`).join(', ')}: añade el alias en ingesta-pro.mjs`, true);
  const conPicks = Object.keys(pro.heroes ?? {}).length;
  inf.check(conPicks >= 50 || (pro.partidas ?? 0) < 30, `${conPicks} héroes con presencia profesional`,
    `Solo ${conPicks} héroes con presencia en ${pro.partidas} partidas: la ventana o el mapeo están mal`, true);
}
