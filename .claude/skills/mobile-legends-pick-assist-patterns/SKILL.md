---
name: mobile-legends-pick-assist-patterns
description: "Use when working in mobile-legends-pick-assist, especially before touching src/ or scripts/, placing a test, bumping the version or writing a commit — conventions measured from its git history (793 commits, 14 Oct 2026), not from memory"
metadata:
  version: "1.1.0"
  source: local-git-analysis
  analyzed_commits: "793"
---

# Mobile Legends Pick Assist Patterns

Medido el 14 de octubre de 2026 sobre los 793 commits del repositorio (los
25 commits de código de los últimos 150). `CLAUDE.md` y las reglas de
`.claude/rules/` son la fuente de verdad del proyecto y mandan sobre esto;
este fichero solo dice qué hace de verdad el historial, para no suponerlo.
Para volver a medirlo: `git log -150 --format='%H %s'` y quedarse con los
asuntos `X.Y.Z:`.

## Commit Conventions

- Un commit de código = una versión. El asunto es `X.Y.Z: qué cambia para
  quien usa la app`, en español (los 25 commits de código de los últimos 150). El cuerpo
  explica el porqué y qué cazó la prueba. Sin prefijos `feat:`/`fix:`.
- Los bots firman con su prefijo: `salud: <fecha>` (vigilancia-bot, 314),
  `partidas: …` (partidas-bot, 142), `datos: …` (meta-bot, 93). No se
  imitan a mano.
- Cada commit de código toca `package.json` y `CHANGELOG.md` a la vez (23
  de 25) y hasta el 14 de octubre de 2026 también `CLAUDE.md` (24 de 25):
  la versión sube, se documenta para quien usa la app y lo aprendido se
  escribe donde la siguiente sesión lo lea. Desde esa fecha lo aprendido va
  a la regla de su zona (`.claude/rules/`) o a `docs/historia/`, nunca a
  `CLAUDE.md`, que tiene tope.
- Un commit, un push, con `npm test` en verde antes. Mediana de 12 ficheros
  por commit: código, pruebas, docs y versión juntos, nunca a medias.

## Code Architecture

- `src/motor/` es puro (sin React, red ni almacenamiento): un módulo por
  cosa (`draft.js` es el único cerebro; `modelo.js`, `matrices.js`,
  `registro.js`, `perfil.js`, `ventana.js`, `diagnostico/`…).
- `src/app/` es la interfaz: `App.jsx`, `estado/use*.js` (toda la
  persistencia en `estado/almacen.js`, claves `roam-picker:*`),
  `pantallas/`, `componentes/`, `i18n/` y módulos puros de app
  (`lector.js`, `envio.js`, `motivos.js`).
- `scripts/` son la ingesta, la medición, el diagnóstico, los guardarraíles
  (`comprobar/`) y el lector de Termux (`scripts/lector/`, que nunca toca
  la tablet: solo capturas).
- Lo más tocado en los últimos 150 commits: `App.jsx` (11), los dos
  idiomas (10) y `pruebas/scripts/directo-lector.test.mjs` (10), es decir,
  la interfaz y el puente app↔lector.

## Workflows

- Todo cambio en `src/` llega con su prueba: 19 de 19 commits que tocan
  `src/` tocan también `pruebas/`.
- `src/app/i18n/es.js` y `en.js` cambian SIEMPRE juntos (10 de 10): un
  texto nuevo va en los dos idiomas y hay prueba que lo exige.
- Un guardarraíl nuevo se verifica por mutación antes de fiarse de él (se
  rompe lo que vigila y se mira que falle); el commit lo cuenta.
- Publicar es `/publicar` (`.claude/commands/publicar.md`): `npm test` →
  `npm run build` → pruebas de navegador sobre `dist/` → push a `main` →
  esperar a que Pages sirva la versión (`version.json`) →
  `node scripts/diagnostico.mjs` con código de salida 0.

## Testing Patterns

- Un fichero de prueba por módulo, espejo del árbol: `pruebas/motor/*.test.mjs`
  (26), `pruebas/app/`, `pruebas/scripts/`; las de navegador en
  `pruebas/interfaz/*.e2e.mjs` (playwright-core, fuera de `npm test`).
- Arnés propio (`pruebas/arnes.mjs`: `test`, `ok`, `eq`, `casi`,
  `terminar`); `pruebas/correr.mjs` lanza un proceso por fichero.
- Fixtures deterministas en `pruebas/fixtures/` (meta sintético, capturas
  reales de la tablet): una prueba sobre datos reales comprueba cómo
  reacciona el código, nunca que el dato del día sea bueno.
- Las pruebas que miden un estadístico llevan su margen medido con varias
  semillas, o no son pruebas.
