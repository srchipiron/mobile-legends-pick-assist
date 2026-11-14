---
paths:
  - ".github/workflows/**"
  - ".github/actions/**"
  - "scripts/bots/**"
  - "scripts/diagnostico.mjs"
  - "scripts/tendencia.mjs"
  - "scripts/salud.mjs"
  - "scripts/datos-rancios.mjs"
  - "scripts/ingesta-pro.mjs"
  - "scripts/medir-pro.mjs"
  - "scripts/medir-rival.mjs"
  - "src/motor/diagnostico/**"
  - "historial/**"
  - "pruebas/scripts/workflows.test.mjs"
  - "pruebas/scripts/bots.test.mjs"
  - "pruebas/scripts/pro.test.mjs"
  - "pruebas/scripts/salud.test.mjs"
  - "pruebas/fixtures/yaml-workflows.mjs"
---

# Los bots, el despliegue y la vigilancia

Los workflows, el diagnóstico de lo publicado y las partidas pro. La crónica
de 3.x está en `docs/archivo/reglas-3.102/bots.md`.

## Los workflows (el NOMBRE es contrato: `workflow_run` escucha por nombre)

| fichero | nombre | qué hace |
|---|---|---|
| `update-data.yml` | Actualizar datos meta | cron `17 5,17`: ingesta a `/tmp`, comparador, commit de datos e imágenes |
| `deploy.yml` | Publicar la app | push, dispatch y `workflow_run` de los dos bots que cambian lo servido |
| `vigilancia.yml` | Vigilar la app publicada | cron `40 6,18` y tras cada despliegue que PUBLICÓ |
| `pro.yml` | Partidas profesionales | lunes: Liquipedia, `pro.json`, medidas |
| `modelo.yml` | Propuesta del modelo | tras las pro: propone recalibrar, nunca commitea |
| `mantenimiento.yml` | Mantenimiento automático | lunes: avisos de tags y PR con las tablas |
| `pruebas-pr.yml`, `pruebas-ui.yml` | | `npm test` y build en cada PR; e2e y SQL aparte |
| `claude.yml` | Claude a petición | solo `@claude` del dueño en SU comentario |
| `apk.yml` | APK del lector | zona del lector (`lector.md`) |

Un push con `GITHUB_TOKEN` NO dispara otros workflows: por eso el despliegue
escucha por `workflow_run` a los bots que commitean bajo `public/` (si añades
uno, ponlo en la lista o lo suyo no se publica). Con un PAT, vigilancia y
despliegue entrarían en bucle.

**Piezas comunes** (y probadas): `.github/actions/instalar` (node 22,
`node_modules` en caché por lockfile y versión de node, `npm ci` solo sin
acierto: la caché de npm sola dejaba 3,7–4,7 min); `scripts/bots/subir.sh`
(rebase y push, tres intentos, en ROJO si fallan: un bucle que acaba en
`sleep` sale con 0); `scripts/bots/incidencia.mjs` (abrir, comentar y cerrar
por etiqueta, y los cuerpos; lo llama `actions/github-script` con su cliente,
así que se prueba con un GitHub de mentira); `scripts/bots/sustituir-tablas.mjs`
(reglas.js por FUNCIÓN: con una cadena, un `$&` se interpretaba).

**Reglas de forma** (`workflows.test`, por forma y EJECUTANDO): toda llamada
a la ingesta con `--out` y el comparador como MANDATO en los tres que la
corren (deploy, update-data, mantenimiento) y en ninguno más; tope de tiempo
en cada job y en todo paso con red (ingesta 15–40 min: a medias tardaba 140);
`shell: bash` (pipefail) en todo paso con tubería; `permissions:` en todos;
concurrencia en los que suben; acciones de terceros fijadas a SHA `# vX.Y.Z`,
la misma en todos; las locales, tras el checkout. `persist-credentials:
false` donde no se hace push. Guardas por texto (`echo "…comparar…"`,
`h > 7200`) no valen.

## El despliegue (`deploy.yml`)

- **Solo descarga si los datos del repositorio pasan de 24 h**: el cron llega
  3–5 h tarde y lo normal son 12–17 h (si cambias el umbral, mide el retraso);
  queda muy por debajo del rancio. La ingesta va a temporales (imágenes desde
  una copia) con `continue-on-error`; decide el paso siguiente.
- **Con qué datos se publica**: la corrida nueva si el comparador la acepta;
  si no, los que YA sirve Pages si son más nuevos y el comparador los acepta
  (el despliegue no commitea, y un push de código volvía a datos viejos); si
  no, los del repositorio. Con la API caída se publica igual: el código no
  depende de que la API viva.
- **Con más de 72 h se publica IGUAL con aviso** (decidido por Javi: la app ya
  los sirve), también con la matriz de más de 72 h. Sin estadísticas
  (`heroCount` 0) o con menos de 1.000 cruces, se para.
- Una sola definición de «las pruebas»: `npm test`. Las de navegador no.
- **La concurrencia va en los JOBS** (grupo `pages`): a nivel de workflow, la
  corrida de un bot fallido cancelaba un despliegue en marcha. El build se
  salta si el bot no acabó con éxito.

## La vigilancia (`vigilancia.yml`)

Mira lo que la app SIRVE, no el repositorio (dos veces el repo estaba bien y
lo publicado roto). `npm test | tee`, luego `scripts/diagnostico.mjs` (el
MISMO `diagnosticar` del botón sobre `prepararDatos`, en las cinco líneas,
sin datos personales) hasta tres veces con 45 s (Pages tarda); también con
las pruebas en rojo. El intento que decide deja SU fila en
`historial/salud.jsonl`, también la mala, y se sube con `subir.sh` (con
`continue-on-error`, pero los avisos miran `steps.guardar.outcome`). Después
`datos-rancios.mjs` (más de `DATOS_RANCIOS_H` = 72 h abre incidencia) y
`caras-nuevas.mjs` (la cara del juego cambió: arreglar con `sacar-caras.mjs`).
Con algo mal, la incidencia `vigilancia` (o un comentario en la abierta) con
lo que obliga a mirar arriba y los últimos 5.000 caracteres de diagnóstico y
pruebas; todo bien, la cierra. `probar_alarma` falla a propósito.

El diagnóstico acaba con `=== RESUMEN ===` (todos los FALLO y AVISO, porque
la incidencia sube la cola), cuenta en la fila los avisos DISTINTOS, y su URL
sale de `GITHUB_REPOSITORY` o del nombre del paquete (escrita a mano daba
404). Tras un despliegue, otra versión en Pages es FALLO; programado, aviso.

**La fila de salud**: cifras de cada corrida (edad, cruces, sinergias,
cobertura, ruido, objetos, builds, pools, fuerza y rango de los cruces con
su coherencia) y toda clave de `FIJAS` contada como el comparador (si falta,
su máximo es 0 y el trinquete no existe). `filasDeSalud` salta las líneas
rotas (una rota vaciaba el historial). La leen `vite.config.js` (las 40
últimas al móvil), el diagnóstico, `tendencia.mjs` y el comparador. Nada
personal.

## Los bots de los lunes

- **Mantenimiento**: ingesta a `/tmp` con comparador (los pasos leen
  `public/data`); incidencia `tags` por héroes nuevos o kits rehechos sin
  duplicar el título abierto (NO se inventan tags); `derivar-tags.mjs` (tope
  15 min) y, si las tablas cambian, `npm test` y PR en
  `mantenimiento/tablas-de-tags` con `git` y `gh` (no una acción de terceros
  con escritura).
- **Modelo**: `medir-comunidad.mjs` (sin base de datos sigue) y
  `proponer-modelo.mjs`; abre o comenta la incidencia `modelo` solo si
  `decision.proponer` (`contents: read`).
- **Claude a petición**: solo el dueño, `@claude` en SU comentario o
  asignación, nunca en incidencias `pantalla`, `partidas`, `vigilancia` o
  `modelo` (su texto viene de fuera); apagado sin `ANTHROPIC_API_KEY`;
  herramientas sin red.
- **Tier list fuera de GitHub**: mlbb.gg da 403 a los runners;
  `actualizar-tiers.mjs` cambia SOLO `tiers` (sale con 1 y no escribe si
  falla) y lo corre una tarea programada de Claude, con `npm test` y push.

## Las partidas profesionales (`ingesta-pro.mjs`, `pro.yml`)

La única fuente pública con drafts completos y resultado (la API de la
comunidad solo da las del usuario tras el login, que no se toca).
- Por la API de Liquipedia como piden sus condiciones: `Accept-Encoding:
  gzip` (sin él, 406), User-Agent con contacto, una petición cada 5 s, NUNCA
  `action=parse` (wikitext con `prop=revisions`); 429/503 → retroceso 2/4/8
  min; tope de peticiones; se guarda lo leído.
- Los picks van en `{{Map}}` dentro de `{{Match}}` en las SUBPÁGINAS de cada
  torneo; la portada trae `sdate`/`edate`/`patch`. Cada `{{Match}}` empieza
  sin la fecha ni los equipos del anterior; fechas en UTC.
- Incremental y monótono: funde por `claveDe` (fecha, equipos y picks
  ordenados; sin duración ni página) y `pro.yml` rechaza menos partidas que
  las guardadas. `partidaPosible` (sin repetidos) y `limpiarBans`.
- `ALIAS` solo lo visto en wikitext: un alias que sea prefijo de un héroe lo
  es de UNO solo (prueba); `SIN_PICK` = hueco; un slug sin mapear descarta la
  partida y sale en `pro.json` y el diagnóstico.
- `medir-pro.mjs` mete su medida en `pro.json.medicion` (el diagnóstico la
  enseña); `medir-rival.mjs` y `ajustar-modelo.mjs` corren al log. La escala
  del modelo se decide en `motor.md`, con miles de partidas de la misma época.
- `pro.json` es un extra: sin él la app funciona.

## Propuesto, sin hacer

- `git rebase --abort` entre reintentos de `subir.sh`; avisar si `medir-pro`
  falla.
- Un canal para los AVISOS repetidos N corridas (la fila cuenta los avisos,
  no dice cuáles); FALLO por winrates o cuotas imposibles; la mediana del
  historial solo con filas sanas; validar todos los rangos.
- Bajar `claude.yml` a `contents: read` y proteger `main` (decisión de Javi,
  `docs/pendiente.md`).
