/**
 * Las partidas profesionales de Liquipedia: la ÚNICA fuente pública con
 * drafts completos y resultado partida a partida, y por tanto lo único con lo
 * que se puede medir el motor contra un resultado.
 *
 * Lo que se vigila aquí: que el wikitext se lea como es (los picks van en
 * `{{Map}}` dentro de `{{Match}}`), que la clave de una partida sea su
 * CONTENIDO y no la página (con la página dentro, la misma partida leída del
 * torneo y de su subpágina entraba dos veces: 20 de 304 en 1.31.2), que cada
 * alias apunte a un héroe real y sea inequívoco (un alias adivinado mete al
 * héroe de al lado, que es peor que perder la partida) y que la medida
 * (`medir-pro.mjs`) distinga un predictor bueno de uno malo.
 *
 * El workflow (`pro.yml`) se lee POR FORMA y su guardarraíl se EJECUTA: el
 * original buscaba `-lt` y `wc -l` sueltos en el YAML, y eso lo pasa
 * cualquier comentario. Ver `CLAUDE.md`, «Guardas por texto, no por forma».
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar, leerTexto } from '../arnes.mjs';
import { heroes } from '../fixtures/catalogo.mjs';
import { leerWorkflow, mandatos, ejecuta } from '../fixtures/yaml-workflows.mjs';
import { nombreClave } from '../../src/motor/nombres.js';
import {
  parsearPartidas, resumirPro, resolverHeroe, fechaISO, claveDe, sinSubpaginas, ALIAS,
} from '../../scripts/ingesta-pro.mjs';
import { evaluar, cargarPartidas, opciones } from '../../scripts/medir-pro.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'pro-'));

test('la ingesta profesional lee los drafts de Liquipedia y reconoce a los heroes', async () => {
  // `--json` a solas dejaba NaN dias y la medida reventaba en el bot.
  eq(opciones(['--json', '/tmp/x']).dias, 120, 'sin --dias deberian ser 120');
  eq(opciones(['--json', '/tmp/x']).json, '/tmp/x', 'no lee --json');
  eq(opciones(['--dias', '400']).dias, 400, 'no lee --dias');
  // Un trozo real de wikitext (MPL ID S16, fase regular): dos partidas de un
  // {{Match}} con fecha y equipos, y un {{Map}} sin picks (no jugado).
  const w = `{{Match
    |date=August 22, 2025 - 15:15{{abbr/ICT}}
    |opponent1={{TeamOpponent|ONIC}} |opponent2={{TeamOpponent|Dewa United Esports}}
    {{Map|vod=x
        |team1side=red |team2side=blue |length=11:44 |winner=1
        |t1h1=cici |t1h2=joy |t1h3=pharsa |t1h4=claude |t1h5=hylos
        |t2h1=esmeralda |t2h2=lancelot |t2h3=helcurt |t2h4=harith |t2h5=gatotkaca
        |t1b1=wanwan |t1b2=yss |t1b3=fanny |t1b4=selena |t1b5=uranus
        |t2b1=zhuxin |t2b2=kalea |t2b3=phoveus |t2b4=bruno |t2b5=granger
    }}
    {{Map|team1side=blue |team2side=red |length=14:02 |winner=2
        |t1h1=luo yi |t1h2=lance |t1h3=xborg |t1h4=yuzhong |t1h5=lapu-lapu
        |t2h1=esme |t2h2=haya |t2h3=valen |t2h4=arlot |t2h5=gatot
    }}
    {{Map|winner=skip}}
}}`;
  const ps = parsearPartidas(w, 'T');
  eq(ps.length, 2, `deberian salir dos partidas jugadas, no ${ps.length}`);
  eq(ps[0].fecha, '2025-08-22', 'la fecha del {{Match}} no llega a la partida');
  eq(ps[0].equipos.join('|'), 'ONIC|Dewa United Esports', 'los equipos no llegan');
  eq(ps[0].ganador, 1, 'el ganador no se lee'); eq(ps[1].ganador, 2, 'el ganador del segundo mapa no se lee');
  eq(ps[0].picks[1][4], 'gatotkaca', 'los picks del equipo 2 no se leen en orden');
  eq(ps[0].bans[0][1], 'yss', 'los baneos no se leen');
  eq(ps[0].lado1, 'red', 'el lado no se lee');
  ok(claveDe(ps[0]) !== claveDe(ps[1]), 'dos partidas distintas comparten clave');
  eq(fechaISO('October 19, 2025 - 20:15{{abbr/ICT}}'), '2025-10-19', 'fechaISO');
  // La misma partida leida de dos paginas (el torneo y su subpagina, que
  // tambien esta en la categoria) es UNA: la clave es el contenido.
  const otra = parsearPartidas(w, 'T/Qualifier')[0];
  eq(claveDe(otra), claveDe(ps[0]), 'la misma partida en otra pagina tiene otra clave y cuenta doble');
  eq(sinSubpaginas(['MPL/Cambodia/Season 11', 'MPL/Cambodia/Season 11/Qualifier', 'MSC/2026']).join('|'),
    'MPL/Cambodia/Season 11|MSC/2026', 'una subpagina de otro torneo se lee como torneo aparte');
  // Y el corpus guardado no tiene partidas repetidas por contenido.
  const corpus = leerTexto('historial/pro-partidas.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const clavesCorpus = new Set(corpus.map(claveDe));
  eq(clavesCorpus.size, corpus.length, `hay ${corpus.length - clavesCorpus.size} partidas repetidas en historial/pro-partidas.jsonl`);

  // Cada alias apunta a un heroe REAL del catalogo, y los slugs del fixture
  // (los abreviados de Liquipedia incluidos) se resuelven todos.
  const indice = new Map(heroes.map((x) => [nombreClave(x.name), x]));
  for (const [slug, nombre] of Object.entries(ALIAS)) {
    ok(indice.has(nombreClave(nombre)), `el alias ${slug} -> ${nombre} no apunta a un heroe del catalogo`);
    eq(resolverHeroe(slug, indice)?.name, nombre, `el alias ${slug} no resuelve a ${nombre}`);
  }
  const slugs = ps.flatMap((p) => [...p.picks.flat(), ...p.bans.flat()]);
  const sinMapear = slugs.filter((s) => !resolverHeroe(s, indice));
  eq(sinMapear.length, 0, `slugs sin reconocer: ${sinMapear.join(', ')}`);
  eq(resolverHeroe('yss', indice)?.name, 'Yi Sun-shin', 'yss deberia ser Yi Sun-shin');
  eq(resolverHeroe('lance', indice)?.name, 'Lancelot', 'lance deberia ser Lancelot');
  // Los abreviados del corpus real (1.41.1). Y cada alias que es un prefijo
  // tiene que serlo de UN solo héroe del catálogo: si Moonton saca un
  // «Yuki», «yu» deja de ser inequívoco y esta prueba lo dirá.
  eq(resolverHeroe('bene', indice)?.name, 'Benedetta', 'bene deberia ser Benedetta');
  eq(resolverHeroe('yu', indice)?.name, 'Yu Zhong', 'yu deberia ser Yu Zhong');
  eq(resolverHeroe('sele', indice)?.name, 'Selena', 'sele deberia ser Selena');
  for (const [slug, nombre] of Object.entries(ALIAS)) {
    const s = nombreClave(slug);
    const candidatos = heroes.filter((x) => nombreClave(x.name).startsWith(s));
    if (candidatos.length && candidatos.some((x) => nombreClave(x.name) === nombreClave(nombre))) {
      eq(candidatos.length, 1, `el alias ${slug} es prefijo de ${candidatos.length} héroes: ${candidatos.map((x) => x.name).join(', ')}`);
    }
  }
  // Un hueco sin héroe («none») no es un nombre sin reconocer.
  const conHueco = resumirPro([{ torneo: 'x', fecha: '2026-01-01', picks: [['none', 'layla', 'fanny', 'hylos', 'chou'], ['tigreal', 'zilong', 'eudora', 'miya', 'saber']], bans: [['NONE'], []], ganador: 1 }], heroes);
  eq(Object.keys(conHueco.sinMapear).length, 0, `«none» se cuenta como slug sin mapear: ${JSON.stringify(conHueco.sinMapear)}`);
  eq(Object.values(conHueco.heroes).reduce((a, x) => a + x.picks, 0), 9, 'el hueco no cuenta como pick');

  // El resumen cuenta picks, victorias y baneos por heroe, y respeta la ventana.
  const r = resumirPro(ps, heroes);
  eq(r.partidas, 2, 'no cuenta las partidas');
  eq(r.heroes.Cici?.picks, 1, 'no cuenta el pick de Cici'); eq(r.heroes.Cici?.ganadas, 1, 'Cici gano y no se cuenta');
  eq(r.heroes.Esmeralda?.picks, 2, 'Esmeralda jugo las dos'); eq(r.heroes.Esmeralda?.ganadas, 1, 'Esmeralda gano una');
  eq(r.heroes['Yi Sun-shin']?.bans, 1, 'el baneo de yss no se cuenta');
  eq(resumirPro(ps, heroes, { desde: '2026-01-01' }).partidas, 0, 'la ventana no filtra');
  eq(Object.keys(r.sinMapear).length, 0, `sin mapear en el resumen: ${JSON.stringify(r.sinMapear)}`);

  // La medida: un predictor perfecto da AUC 1 y pendiente grande; uno al
  // reves, AUC 0; el ruido, alrededor de 0.5 y pendiente ~0.
  const perfecto = Array.from({ length: 60 }, (_, i) => ({ L: (i % 2 ? 1 : -1) * (0.5 + (i % 5) / 10), y: i % 2 }));
  const ev = evaluar(perfecto);
  eq(ev.auc, 1, `AUC de un predictor perfecto ${ev.auc}`); ok(ev.pendiente > 1.5, `pendiente de un predictor perfecto ${ev.pendiente}`); ok(ev.acierto === 1, 'acierto');
  const alReves = evaluar(perfecto.map((x) => ({ L: -x.L, y: x.y })));
  eq(alReves.auc, 0, `AUC al reves ${alReves.auc}`);
  let s = 9; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ruido = evaluar(Array.from({ length: 400 }, () => ({ L: rnd() * 2 - 1, y: rnd() < 0.5 ? 1 : 0 })));
  ok(Math.abs(ruido.auc - 0.5) < 0.08 && Math.abs(ruido.pendiente) < 0.5, `ruido: AUC ${ruido.auc} pendiente ${ruido.pendiente}`);
  const { usables } = cargarPartidas(ps, heroes);
  eq(usables.length, 2, 'cargarPartidas descarta partidas con todos los heroes reconocidos');

  // El workflow: a temporales, con tope de tiempo, y sin perder partidas. El
  // original miraba el YAML como texto (`/-lt/.test(yml)`), que lo pasa
  // cualquier comentario; aquí el paso se lee por forma y su guardarraíl se
  // EJECUTA con menos partidas de las guardadas, que es lo que tiene que
  // parar.
  const pro = leerWorkflow('pro.yml');
  const pIngesta = pro.pasos.find((p) => ejecuta(p.run, /^node scripts\/ingesta-pro\.mjs\b/));
  ok(pIngesta, 'pro.yml ya no ejecuta la ingesta profesional');
  const mandato = mandatos(pIngesta.run).find((c) => /^node scripts\/ingesta-pro\.mjs\b/.test(c));
  const salidaJson = mandato.match(/--out\s+(\S+)/);
  const salidaPartidas = mandato.match(/--out-partidas\s+(\S+)/);
  ok(salidaJson && salidaPartidas, 'pro.yml escribe directo sobre lo guardado');
  ok(!/^(historial|public)\//.test(salidaJson[1]) && !/^(historial|public)\//.test(salidaPartidas[1]),
    'pro.yml apunta la ingesta a lo guardado en vez de a un temporal');
  ok(Number.isFinite(Number(pIngesta['timeout-minutes'])), 'pro.yml no tiene tope de tiempo');
  for (const j of pro.jobs) ok(/^\d+$/.test(j.claves['timeout-minutes'] ?? ''), `pro.yml: el job ${j.nombre} no tiene tope de tiempo`);

  // El paso que descarta una corrida con menos partidas, ejecutado de verdad.
  // El temporal absoluto del workflow se sustituye por uno de la caja para no
  // pisar /tmp, pero la comparación que se ejecuta es la suya.
  const pDescarte = pro.pasos.find((p) => p !== pIngesta && p.run?.includes(salidaPartidas[1]));
  ok(pDescarte, 'pro.yml no comprueba que no se pierdan partidas');
  const correrDescarte = (guardadas, nuevas) => {
    const caja = mkdtempSync(join(tmp, 'descarte-'));
    const ahora = join(caja, 'pro-partidas.jsonl');
    writeFileSync(join(caja, 'guardadas.jsonl'), '{}\n'.repeat(guardadas));
    writeFileSync(ahora, '{}\n'.repeat(nuevas));
    const guion = pDescarte.run
      .replace(/\$\{\{[^}]*\}\}/g, '')
      .split(salidaPartidas[1]).join(ahora)
      .split('historial/pro-partidas.jsonl').join(join(caja, 'guardadas.jsonl'));
    return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', guion], { cwd: caja, encoding: 'utf8', timeout: 60000 });
  };
  eq(correrDescarte(10, 12).status, 0, 'pro.yml descarta una corrida que trae MÁS partidas que las guardadas');
  ok(correrDescarte(10, 9).status !== 0, 'pro.yml acepta una corrida con menos partidas que las guardadas');
});

test('el corpus profesional es el que mide el motor: fechas, picks completos y baneos', () => {
  // `pro.json` es un extra para la app, pero `historial/pro-partidas.jsonl` es
  // la muestra con la que se miden ESCALA y los coeficientes del modelo. Si
  // una corrida degradada mete filas a medias, la medida sale mal y nada
  // falla: `claveDe` las acepta y el comparador del workflow solo cuenta
  // líneas. Aquí se comprueba la FORMA de cada fila.
  const corpus = leerTexto('historial/pro-partidas.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(corpus.length >= 300, `el corpus tiene ${corpus.length} partidas: con menos no se mide nada`);
  for (const p of corpus) {
    // La fecha puede faltar (un {{Match}} sin `date`): entonces la partida se
    // queda FUERA de toda ventana, que es lo correcto. Lo que no puede es
    // venir con otro formato, porque las ventanas se comparan como texto.
    ok(p.fecha === null || /^\d{4}-\d{2}-\d{2}$/.test(p.fecha ?? ''), `fecha que no es ISO: ${JSON.stringify(p.fecha)}`);
    ok(Array.isArray(p.picks) && p.picks.length === 2, 'una partida sin los dos equipos');
    for (const lado of p.picks) eq(lado.length, 5, `un equipo con ${lado.length} picks`);
    ok(p.ganador === 1 || p.ganador === 2, `ganador raro: ${p.ganador}`);
  }
});

await terminar('scripts/pro');
