import { CUOTA_ROBUSTA } from '../robustez.js';

/**
 * El draft que tienes delante, al principio del informe: es lo que hace
 * falta para reproducir una partida. Desde que los huecos enseñan la cara y
 * no el nombre, una captura no dice quién estaba enfrente.
 *
 * @typedef {object} DraftDiagnostico
 * @property {object[]} enemigos
 * @property {object[]} aliados
 * @property {object[]} baneos
 * @property {{ nombre: string|null, marcado: boolean }} rival
 * @property {object[]} ranking        lo que devuelve ordenarPicks
 * @property {object[]} analisis       lo que devuelve analizarDraft
 * @property {object|null} robustez    lo que devuelve simularFinales
 * @property {object|null} composicion lo que devuelve analizarComposicion
 * @property {object[]} estimaciones   [{ yo, p, puntos, vistos }] de los tres primeros
 */

/** @param {import('./informe.js').Informe} inf */
export function seccionDraft(inf, { draft = null, linea, entorno = {} } = {}) {
  inf.seccion('DRAFT ACTUAL');
  if (!draft || !(draft.enemigos?.length || draft.aliados?.length)) {
    inf.linea('(sin draft: no hay ningún héroe elegido)');
    return;
  }
  const nombres = (lista) => (lista?.length ? lista.map((h) => h.name).join(', ') : '(nadie)');
  inf.linea(`Línea: ${linea} · rango: ${entorno.rango ?? '?'}`);
  inf.linea(`Enemigos: ${nombres(draft.enemigos)}`);
  inf.linea(`Tu equipo: ${nombres(draft.aliados)}`);
  if (draft.baneos?.length) inf.linea(`Baneados: ${nombres(draft.baneos)}`);
  const rival = draft.rival ?? {};
  inf.linea(`Tu rival: ${rival.nombre ?? '(sin detectar)'}${rival.marcado ? ' (marcado a mano)' : rival.nombre ? ' (deducido)' : ''}`);
  for (const [i, r] of (draft.ranking ?? []).slice(0, 3).entries()) {
    const motivos = (r.motivos ?? []).map((m) => m.clave.replace(/^regla\.|^necesidad\./, '')
      + (m.params?.e ? `:${m.params.e}` : m.params?.a ? `:${m.params.a}` : '')).join(' ');
    inf.linea(`  ${i + 1}. ${r.heroe.name} ${Math.round(r.p * 100)}%${motivos ? ` · ${motivos}` : ''}`);
  }
  for (const f of draft.analisis ?? []) inf.linea(`  > ${f.clave.replace(/^analisis\./, '')} ${JSON.stringify(f.params ?? {})}`);

  // Por qué gana el nº1: qué término lo separa del nº2 y por cuánto. Es lo
  // que hace falta para discutir una recomendación en vez de creérsela.
  const [a, b] = draft.ranking ?? [];
  if (a?.puntos && b?.puntos) {
    const dif = Object.entries(a.puntos).map(([k, v]) => [k, v - (b.puntos[k] ?? 0)]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    const margen = ((a.p - b.p) * 100).toFixed(1);
    const con = (d) => `${d[0]} (${d[1] >= 0 ? '+' : ''}${d[1]})`;
    inf.linea(`Por qué ${a.heroe.name} y no ${b.heroe.name}: ${margen} puntos de margen · lo decide ${con(dif[0])}${dif[1] ? `, luego ${con(dif[1])}` : ''}`);
  }
  if (draft.miPick) inf.linea(`Tu pick fijado: ${draft.miPick}${a && a.heroe.name !== draft.miPick ? ` (el nº1 es ${a.heroe.name})` : ''}`);
  const signo = (v) => (v > 0 ? `+${v}` : `${v}`);
  for (const e of draft.estimaciones ?? []) {
    if (e?.p == null) continue;
    inf.linea(`Estimación con ${e.yo}: ${Math.round(e.p * 100)}% · héroes ${signo(e.puntos.heroes)} · cruces ${signo(e.puntos.cruces)} · parejas ${signo(e.puntos.parejas)} · equilibrio ${signo(e.puntos.equilibrio ?? 0)} · tú ${signo(e.puntos.tu)} · por ver ${signo(e.puntos.porVer ?? 0)} (${e.vistos}/10 a la vista)`);
  }
  const comp = (c) => (c?.n ? `${c.n} héroes · físico ${c.dano.fisico} · mágico ${c.dano.magico} · mixto ${c.dano.mixto}`
    + (c.huecos.length ? ` · sin ${c.huecos.join(', ')}` : ' · sin huecos')
    + (c.dobles.length ? ` · doble: ${c.dobles.map((d) => `${d.rol}×${d.n} (${d.pp})`).join(', ')}` : '') : null);
  if (draft.composicion) {
    const m = comp(draft.composicion.mio); const s = comp(draft.composicion.suyo);
    if (m) inf.linea(`Tu equipo (con el nº1): ${m}${draft.composicion.tapa.length ? ` · el nº1 tapa ${draft.composicion.tapa.join(', ')}` : ''}`);
    if (s) inf.linea(`Ellos: ${s}`);
  }
  if (draft.robustez?.lineasAbiertas?.length && a) {
    const r = draft.robustez;
    const top3 = Object.entries(r.cuota).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, c]) => `${n} ${Math.round(c * 100)}%`).join(' · ');
    inf.linea(`Líneas enemigas abiertas: ${r.lineasAbiertas.join(', ')} · en ${r.n} finales plausibles, nº1: ${top3}`);
    const cuota = r.cuota[a.heroe.name] ?? 0;
    inf.linea(`  ${a.heroe.name} aguanta el ${Math.round(cuota * 100)}%: ${cuota >= CUOTA_ROBUSTA ? 'pick seguro' : 'depende de lo que saquen'}`);
  }
}
