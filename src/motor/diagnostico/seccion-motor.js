import { cruce } from '../matrices.js';
import { ordenarPicks } from '../ranking.js';
import { ESCALA, ESCALA_SE, AJUSTE, terminoHeroe } from '../modelo.js';

/**
 * Que el motor haga lo que tiene que hacer con los datos de hoy: que el
 * draft mande, que el counter ordene por el dato, que el winrate influya.
 * Son comprobaciones de sensatez, no calibración: la calibración está en
 * ajustar-modelo.mjs contra partidas con resultado.
 *
 * @param {import('./informe.js').Informe} inf
 */
export function seccionMotor(inf, { datos, linea, maestria = {}, cov }) {
  const pool = datos.poolsPorLinea[linea] ?? [];
  inf.seccion('MOTOR');
  const H = (n) => datos.porNombre.get(n);
  const nombresTop = (enemigos) => ordenarPicks(pool, { enemigos: enemigos.map(H).filter(Boolean), meta: datos.meta, maestria }).slice(0, 5).map((r) => r.heroe.name);

  // Ante dos equipos enemigos opuestos tiene que cambiar la RECOMENDACIÓN,
  // no solo el primer nombre. (Hasta 1.5.0 se exigía que el nº1 cortara
  // dashes: solo se cumplía porque mandaban las reglas por tags; medido con
  // la matriz completa, los anti-dash promedian 0.5042 contra los dashers.)
  const dashes = nombresTop(['Fanny', 'Ling', 'Lancelot']);
  const curacion = nombresTop(['Esmeralda', 'Uranus', 'Thamuz']);
  inf.linea(`Contra dashes: ${dashes.slice(0, 3).join(', ')}`);
  inf.linea(`Contra curación: ${curacion.slice(0, 3).join(', ')}`);
  const comunes = dashes.filter((n) => curacion.includes(n)).length;
  inf.check(comunes < dashes.length,
    `La recomendación cambia según el equipo enemigo (${dashes.length - comunes} de ${dashes.length} distintos)`,
    'MISMA recomendación ante equipos enemigos opuestos: el draft no influye');

  // Que el término de cruces ordene por el DATO: quien mejor cruce real
  // tiene contra esos tres puntúa más alto en cruces que quien peor lo tiene.
  if (datos.meta.counters) {
    const enemigos = ['Fanny', 'Ling', 'Lancelot'].map(H).filter(Boolean);
    const cruceMedio = (heroe) => {
      const v = enemigos.map((e) => cruce(datos.meta.counters, heroe.name, e.name)).filter((x) => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const conCounter = ordenarPicks(pool, { enemigos, meta: datos.meta, maestria })
      .filter((r) => cruceMedio(r.heroe) != null)
      .sort((a, b) => b.terminos.cruces - a.terminos.cruces);
    if (conCounter.length >= 4) {
      const mejor = cruceMedio(conCounter[0].heroe);
      const peor = cruceMedio(conCounter[conCounter.length - 1].heroe);
      inf.check(mejor > peor,
        `El counter ordena por el dato real (${(mejor * 100).toFixed(1)}% vs ${(peor * 100).toFixed(1)}%)`,
        `El counter NO ordena por el dato real: el mejor puntuado cruza al ${(mejor * 100).toFixed(1)}% y el peor al ${(peor * 100).toFixed(1)}%`);
    }
  }

  // Que el winrate influya de verdad y no todo valga 0.50.
  const valores = pool.map((h) => terminoHeroe(h, datos.meta.stats, datos.meta.mediaDelRango).valor);
  const rango = valores.length ? Math.max(...valores) - Math.min(...valores) : 0;
  inf.check(rango > 0.05, `Winrate influye (dispersión ${rango.toFixed(2)} log-odds)`,
    `Winrate NO influye: todos los héroes puntúan igual (dispersión ${rango.toFixed(2)})`);

  if (cov?.conCounters) {
    const conRiesgo = pool
      .map((heroe) => ({ heroe, r: ordenarPicks([heroe], { meta: datos.meta, candidatos: datos.heroes })[0]?.riesgo }))
      .filter((x) => x.r != null)
      .sort((a, b) => b.r - a.r);
    if (conRiesgo.length) inf.linea(`Más arriesgados como pick ciego: ${conRiesgo.slice(0, 3).map((x) => `${x.heroe.name} ${x.r.toFixed(2)}`).join(', ')}`);
  }
}

/**
 * El modelo: cuánto de la recomendación sale de partidas reales y cuánto de
 * las tuyas (rango de cada término en un draft de ejemplo), y si la escala
 * medida por el bot sigue valiendo.
 */
export function seccionModelo(inf, { datos, linea, maestria = {}, pro = null }) {
  const pool = datos.poolsPorLinea[linea] ?? [];
  const H = (n) => datos.porNombre.get(n);
  inf.seccion('MODELO');
  const muestra = ordenarPicks(pool, {
    enemigos: ['Fanny', 'Esmeralda', 'Melissa'].map(H).filter(Boolean),
    // Dos físicos de aliados a propósito: así el equilibrio de daño (3.4.0)
    // varía entre candidatos y su rango dice algo; con un mago y un tirador
    // todo candidato daba el mismo mínimo y el rango salía 0.
    aliados: ['Lancelot', 'Granger'].map(H).filter(Boolean),
    meta: datos.meta, maestria,
  });
  if (muestra.length) {
    const rango = (k) => { const v = muestra.map((x) => x.puntos?.[k] ?? 0); return Math.max(...v) - Math.min(...v); };
    const deDatos = rango('heroes') + rango('cruces') + rango('parejas') + rango('equilibrio') + rango('porVer');
    const tuyo = rango('tu');
    const total = deDatos + tuyo || 1;
    inf.linea(`Partidas reales: ${((deDatos / total) * 100).toFixed(0)}% · tus partidas: ${((tuyo / total) * 100).toFixed(0)}% (rango en puntos: héroes ${rango('heroes')}, cruces ${rango('cruces')}, parejas ${rango('parejas')}, equilibrio ${rango('equilibrio')}, tú ${rango('tu')})`);
    inf.check(deDatos / total >= 0.6, 'La recomendación se apoya sobre todo en datos', `Solo el ${((deDatos / total) * 100).toFixed(0)}% viene de datos`);
    const sinDato = muestra.filter((x) => !x.dato).length;
    inf.check(sinDato === 0, 'Todos los candidatos tienen dato de winrate', `${sinDato} candidatos sin winrate: mandan las reglas por etiqueta`, true);
    inf.linea(`Ejemplo (vs Fanny/Esmeralda/Melissa): ${muestra.slice(0, 3).map((x) => `${x.heroe.name} ${Math.round(x.p * 100)}%`).join(', ')}`);
  }
  inf.linea(`Escala ${ESCALA} ± ${ESCALA_SE} (ajustada con ${AJUSTE.partidas} partidas pro desde ${AJUSTE.desde}, datos del ${AJUSTE.datosDe})`);
  // Con la escala ya aplicada, la pendiente medida por el bot debería ser 1.
  // Solo si midió con ESTA escala: una medida anterior a un cambio del
  // modelo daría un aviso falso hasta que pro.yml vuelva a correr.
  const pend = pro?.medicion?.terminos?.modelo;
  if (pend?.pendiente != null && pend.errorPendiente != null && (pro.medicion.usables ?? 0) >= 300 && pro.medicion.escala === ESCALA) {
    const lejos = Math.abs(pend.pendiente - 1) > 2 * pend.errorPendiente;
    inf.check(!lejos,
      `La escala sigue valiendo: pendiente ${pend.pendiente.toFixed(2)} ± ${pend.errorPendiente.toFixed(2)} sobre ${pro.medicion.usables} partidas`,
      `La escala ya no encaja: pendiente ${pend.pendiente.toFixed(2)} ± ${pend.errorPendiente.toFixed(2)} (debería ser 1): vuelve a medir con scripts/ajustar-modelo.mjs`,
      true);
  }
}
