/**
 * scripts/medir-fases.mjs (3.43.0): la medida de las fases contra las
 * partidas pro. Se ejecuta ENTERO y se mira el código de salida (CLAUDE.md:
 * `matchup is not defined` después del último OK), y el tramo de cada
 * duración, que es lo único que decide con qué minuto se compara cada
 * partida.
 */
import { spawnSync } from 'node:child_process';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { tramoDe } from '../../scripts/medir-fases.mjs';

test('el tramo de cada duración: 10–12 es el primero, 20 o más el último, y lo ilegible no cuenta', () => {
  eq(tramoDe('11:23'), 0); eq(tramoDe('12:00'), 1); eq(tramoDe('14:20'), 2);
  eq(tramoDe('19:59'), 4); eq(tramoDe('20:53'), 5); eq(tramoDe('34:10'), 5);
  eq(tramoDe('8:40'), 0, 'una partida de menos de 10 minutos no va al primer tramo');
  eq(tramoDe(null), null); eq(tramoDe('rendición'), null); eq(tramoDe('1:00'), null);
});

test('el script corre entero con los datos del repositorio y sale con 0', () => {
  const r = spawnSync(process.execPath, ['scripts/medir-fases.mjs', '--semillas', '1'], { cwd: RAIZ, encoding: 'utf8', timeout: 120000 });
  eq(r.status, 0, `salida ${r.status}: ${(r.stderr || r.stdout).slice(-400)}`);
  ok(/con las curvas: .* coeficiente/.test(r.stdout) && /curvas barajadas:/.test(r.stdout), `no da la medida: ${r.stdout.slice(0, 400)}`);
});

await terminar('scripts/medir-fases');
