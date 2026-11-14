/**
 * Las incidencias de los bots, por etiqueta. Lo llama `actions/github-script`
 * (que pone el cliente con el token del workflow), así que aquí no hay red
 * ni token: `github` es ese cliente y las pruebas pasan uno de mentira. Lo
 * que llega de fuera (nombres de héroes, informes) es texto, no órdenes.
 */
import { readFileSync } from 'node:fs';

const abiertas = async (github, repo, etiqueta) => (await github.rest.issues.listForRepo({ ...repo, state: 'open', labels: etiqueta })).data;

/** Comenta en la abierta con esa etiqueta o, si no hay, la abre: doce avisos del mismo problema no son doce problemas [D]. */
export async function avisar(github, repo, { etiqueta, titulo, cuerpo }) {
  const [abierta] = await abiertas(github, repo, etiqueta);
  if (abierta) await github.rest.issues.createComment({ ...repo, issue_number: abierta.number, body: cuerpo });
  else await github.rest.issues.create({ ...repo, title: titulo, body: cuerpo, labels: [etiqueta] });
}

/** La abre solo si no hay una abierta con ese MISMO título (el aviso cambia cuando cambia la lista). */
export async function abrirSiNueva(github, repo, { etiqueta, titulo, cuerpo }) {
  if ((await abiertas(github, repo, etiqueta)).some((i) => i.title === titulo)) return false;
  await github.rest.issues.create({ ...repo, title: titulo, body: cuerpo, labels: [etiqueta] });
  return true;
}

/** Comenta y cierra (completada) todas las abiertas con esa etiqueta. */
export async function cerrarTodas(github, repo, { etiqueta, mensaje }) {
  for (const inc of await abiertas(github, repo, etiqueta)) {
    await github.rest.issues.createComment({ ...repo, issue_number: inc.number, body: mensaje });
    await github.rest.issues.update({ ...repo, issue_number: inc.number, state: 'closed', state_reason: 'completed' });
  }
}

/** Los últimos `n` caracteres de un fichero de salida: el resumen del diagnóstico va al final [D]. */
export function cola(fichero, n = 5000) {
  try { return readFileSync(fichero, 'utf8').slice(-n); } catch { return '(sin salida)'; }
}

export const enlaceDe = (context) => `[Ver la ejecución](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

/** El cuerpo de la vigilancia: lo que obliga a mirar arriba, luego diagnóstico y pruebas. */
export function cuerpoDeVigilancia({ filaPerdida, rancios, caras, enlace, ficheros = {} }) {
  const f = { rancios: '/tmp/rancios.txt', caras: '/tmp/caras.txt', diagnostico: '/tmp/diagnostico.txt', pruebas: '/tmp/pruebas.txt', ...ficheros };
  return [
    ...(filaPerdida ? ['**La fila de esta corrida NO se ha guardado en `historial/salud.jsonl`** (push rechazado tres veces). Si el diagnóstico de abajo dice que todo está bien, es solo eso.', ''] : []),
    ...(rancios ? [`**${cola(f.rancios).trim()}**`, ''] : []),
    ...(caras ? [`**${cola(f.caras).trim()}**`, ''] : []),
    'La vigilancia automática ha encontrado algo. Esto NO lo ha pulsado nadie:',
    'lo ha detectado la comprobación programada contra la app publicada.',
    '',
    '## Diagnóstico de lo publicado', '```', cola(f.diagnostico), '```',
    '## Pruebas', '```', cola(f.pruebas), '```',
    '',
    enlace,
  ].join('\n');
}

/** Héroes que la API conoce y heroes.json no: se avisa, NO se les inventan tags [P]. */
export function cuerpoDeHeroesNuevos(nuevos) {
  return [
    `La API conoce a ${nuevos.length} héroe(s) que no están en heroes.json:`,
    '', nuevos.map((n) => `- ${n}`).join('\n'), '',
    'Mientras tanto juegan con los tags de su rol más lo que se deduzca',
    'de su `speciality`, que acierta el 54% de sus tags reales.',
    '',
    'Para escribirlos bien: la API publica la descripción de sus',
    'habilidades en `/api/heroes/{id}`. De ahí salieron los de Marcel,',
    'Hirara, Sora, Zetian, Obsidia, Cici y Valir; no de la memoria de',
    'nadie. Después toca reejecutar `node scripts/derivar-tags.mjs`.',
  ].join('\n');
}

/** Héroes con el kit distinto del que tenían al escribirles los tags: tampoco se automatiza [P]. */
export function cuerpoDeKitsRehechos(cambiados) {
  return [
    'A estos héroes la API les da hoy un kit distinto del que tenían',
    'cuando se les escribieron los tags a mano:',
    '',
    cambiados.map((h) => `- **${h.name}**: \`${h.antes}\` → \`${h.ahora}\``).join('\n'),
    '',
    'El formato de la huella es `tipoDeDaño|speciality`. NO significa que',
    'los tags estén mal: significa que nadie los ha vuelto a mirar desde',
    'que Moonton le cambió las habilidades.',
    '',
    'Con la matriz de cruces al 100% un tag desfasado no decide ningún',
    'counter (las reglas por etiqueta solo entran sin dato del cruce),',
    'pero sí ensucia el consejo de composición y el texto de los motivos.',
    '',
    'Para revisarlos: la API publica la descripción de sus habilidades en',
    '`/api/heroes/{id}`. Cuando estén revisados, actualiza su `kit` en',
    '`public/data/heroes.json` con lo que dé `huellaDeKit()` y este aviso',
    'se apaga solo.',
  ].join('\n');
}

/** Lo que hace la vigilancia al acabar: con algo mal, avisa; con todo bien, cierra las abiertas. */
export async function vigilancia({ github, context, mal, filaPerdida, rancios, caras }) {
  if (mal) {
    const cuerpo = cuerpoDeVigilancia({ filaPerdida, rancios, caras, enlace: enlaceDe(context) });
    await avisar(github, context.repo, { etiqueta: 'vigilancia', titulo: 'Vigilancia: la app publicada falla', cuerpo });
  } else {
    await cerrarTodas(github, context.repo, { etiqueta: 'vigilancia', mensaje: 'Resuelto: la vigilancia vuelve a pasar sin fallos.' });
  }
}

/** Los avisos del mantenimiento de los lunes, con `roam-meta.json` (héroes nuevos y kits rehechos). */
export async function mantenimiento({ github, context, meta }) {
  const nuevos = meta.newHeroes ?? [];
  if (nuevos.length) await abrirSiNueva(github, context.repo, { etiqueta: 'tags', titulo: `Héroes nuevos sin tags propios: ${nuevos.join(', ')}`, cuerpo: cuerpoDeHeroesNuevos(nuevos) });
  const cambiados = meta.heroesCambiados ?? [];
  if (cambiados.length) await abrirSiNueva(github, context.repo, { etiqueta: 'tags', titulo: `Héroes con el kit rehecho: ${cambiados.map((h) => h.name).join(', ')}`, cuerpo: cuerpoDeKitsRehechos(cambiados) });
}

/** La propuesta del modelo: solo si la medida lo dice (nunca commitea) [P]. Devuelve si la abrió. */
export async function propuestaDelModelo({ github, context, propuesta, texto, core = console }) {
  if (!propuesta.decision?.proponer) { core.info(`Sin propuesta: ${propuesta.decision?.motivo}`); return false; }
  await avisar(github, context.repo, { etiqueta: 'modelo', titulo: 'Propuesta: recalibrar el modelo', cuerpo: [texto, '', enlaceDe(context)].join('\n') });
  return true;
}
