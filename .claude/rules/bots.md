---
paths:
  - ".github/workflows/**"
  - "scripts/diagnostico.mjs"
  - "scripts/tendencia.mjs"
  - "scripts/ingesta-pro.mjs"
  - "scripts/medir-pro.mjs"
  - "scripts/medir-rival.mjs"
  - "src/motor/diagnostico/**"
  - "pruebas/scripts/workflows.test.mjs"
---

# Los bots, el despliegue y la vigilancia

Se carga al tocar los workflows, el diagnóstico o las partidas pro.

## Cuándo descarga datos el despliegue

Desde 1.25.0 el despliegue **no descarga datos si los del repositorio tienen
menos de 24 horas**: el bot ya lo hace dos veces al día. Son 24 y no 12 porque
**GitHub ejecuta el cron con 3–5 horas de retraso** (medido en las seis
corridas del bot: cron a las 05:17 y 17:17 UTC, arranques reales entre las
10:05 y las 11:35 y entre las 19:50 y las 21:53), así que los datos del
repositorio tienen normalmente entre 12 y 17 horas. No es un fallo del bot; si
cambias el umbral, mide antes el retraso real. Cada push de código
costaba diez minutos de ingesta y, con `cancel-in-progress`, cada push
reiniciaba la del anterior: cinco commits seguidos dejaron lo publicado 25
minutos por detrás. Si ves que un despliegue tarda doce minutos, es que el bot
lleva medio día sin traer datos, y eso es lo que hay que mirar.

Con datos de más de 72 horas el despliegue publica IGUAL y deja un
`::warning::` (3.57.4, decidido por Javi el 14 de octubre de 2026): hasta
entonces se paraba, y con la API caída desde el 13 eso solo impedía publicar
CÓDIGO, porque los datos que habría publicado eran los mismos que ya servía
Pages. Que vengan sin estadísticas o sin matriz de cruces sigue parando el
despliegue. Lo viejo lo dice el diagnóstico (aviso a las 36 h).

Sin datos nuevos (ingesta caída o rechazada), el despliegue mira antes los
que YA sirve Pages (3.57.6, decidido por Javi): si son más nuevos que los
del repositorio y `comparar-ingesta` los acepta, publica con ellos. El
despliegue no commitea, así que los datos frescos que publicó uno se
perdían en el siguiente push de código: el 14 de octubre de 2026 la app
pasó de los datos de las 09:42 a los del 12 por la noche. Solo lee (curl a
la propia Pages); no hace push. Prueba en `workflows.test` con un `curl`
de pega y copias de scripts/ y src/ (por un enlace simbólico el comparador
no se cree programa principal y sale con 0 sin comparar).

**Una matriz conservada ya no tira la corrida (3.59.6).** Del 10 al 19 de
octubre de 2026 el bot falló 13 de 16 veces: la ruta de cruces y parejas
de arena.rone.dev daba «Error 1101» (10–16 de 133 héroes) y el comparador
tiraba la corrida por `relacionesFrescas: 1 → 0`, con sus estadísticas,
builds y tier frescas dentro (el nerf de Rafaela llegó con días de
retraso). Hoy `generatedAt` sigue a las ESTADÍSTICAS (`fechaDeLaCorrida`),
la matriz lleva su propia fecha (`relaciones.descargada`,
`fechaDeLaMatriz`), el comparador no cuenta `relacionesFrescas` como
regresión (sí PERDER cruces o parejas: `cruces`, `sinergias` en `FIJAS`) y
el diagnóstico avisa con la matriz de más de 7 días. Prueba en
`ingesta-simulada` (tres mutaciones) y `diagnostico.test`. Desde 3.60.1 la
cabecera y el pie de la app cuentan la edad de lo MÁS viejo de las dos
fechas (`edadDeLosDatos` en useDatos.js; el pie dice aparte la de la
matriz) y el paso «Comprobar que los datos valen» de `deploy.yml` avisa
con la matriz de más de 72 h. Y al revés desde 3.60.2: con la matriz nueva
ENTERA (`relacionesFrescas`), el comparador no tira la corrida por
`rangoFresco`. Los winrates se conservan con su fecha, porque `generatedAt`
sigue a las estadísticas. El 20 de octubre de 2026 la API dio los 133
cruces y 500 en los winrates de Gloria y Mítico. Sin nada fresco se
rechaza SIEMPRE (`nadaFresco`), aunque lo guardado tampoco lo esté: con los
winrates guardados ya conservados, comparar solo contra lo guardado dejaba
commitear corridas que solo cambiaban el diagnóstico.

**Lo que llega de la API, como dato (3.60.4)**: de la revisión de
seguridad de los workflows.
- La speciality solo entra con su forma (`ES_SPECIALITY`, extraccion.mjs)
  y `pintarTabla` (derivar-tags.mjs) solo escribe claves y tags con forma.
  Una con comillas acababa como código en `src/motor/reglas.js`, y `npm
  test` la ejecutaba en `mantenimiento.yml`, con permiso de escritura.
- `mantenimiento.yml` sustituye el bloque con una función: con una cadena,
  un `$&` del texto nuevo se interpretaba.
- `bajarImagenes` solo acepta ids numéricos y URLs https o de la propia
  máquina. Un id «../x» escribía fuera de la carpeta, y en el despliegue
  eso acaba en lo publicado.
- `deploy`, `pruebas-pr` y `pruebas-ui` hacen checkout con
  `persist-credentials: false`.
- Prueba en `scripts/datos-de-fuera` e `ingesta-simulada`; cuatro
  mutaciones.

Queda propuesto, sin hacer:
- proteger `main`;
- bajar `claude.yml` a `contents: read`;
- `git rebase --abort` entre reintentos;
- avisar si `medir-pro` falla;
- limpiar los nombres de la API en los textos de incidencias.

**La revisión de la vigilancia (3.60.5)**:
- Las matrices se validan por VALOR (`valoresDeMatrices`, seccion-datos.js):
  - una celda fuera de 0–1 o menos del 99% de pares que sumen 1 es FALLO;
  - menos del 98% de celdas con nombres del catálogo es aviso.
  Hoy cumplen las 17.556. Antes, cruces invertidos o simétricos daban
  idéntico a la base.
- Se avisa de `diagnostics.failed`, de las imágenes que fallaron y de los
  héroes sin id.
- `diagnostico.mjs` acaba con un `=== RESUMEN ===` de todos los avisos y
  fallos. La vigilancia sube los últimos 5.000 caracteres y el informe mide
  11 KB: un FALLO de roam se quedaba fuera.
- `filasDeSalud` (scripts/salud.mjs) lee el historial línea a línea, y lo
  usan los tres sitios que lo leen. Una línea rota lo vaciaba.
- El falso FALLO «tu maestría no se aplica», con un héroe justo en tu nivel,
  ya no sale.

Queda propuesto, sin hacer, porque cambia cuándo saltan las alarmas:
- Un canal para los AVISOS: hoy solo un FALLO abre incidencia, y la caída
  del 10 al 19 de octubre dejó 353 filas sin un solo fallo. La propuesta es
  abrirla si el mismo aviso dura N corridas o si los datos pasan de 72 h.
- Hacer FALLO los valores imposibles de winrate, cuotas y ban.
- La mediana del historial, solo con filas sanas.
- `tendencia.mjs` con más campos y por tramos.
- Validar todos los rangos y no solo el de la ingesta.

**La tier list fuera de GitHub.** mlbb.gg contesta 403 a los runners de
GitHub (y 200 a cualquier otro sitio): `scripts/actualizar-tiers.mjs`
cambia SOLO `tiers` en roam-meta.json (sale con 1 y no escribe si falla;
prueba contra un mlbb.gg simulado) y lo corre una tarea programada de
Claude Code en la nube, que hace `npm test` y sube el cambio a `main`.

## La vigilancia automática

Desde 0.9.0 la app no espera a que Javi note algo raro. `vigilancia.yml` corre
dos veces al día y tras cada despliegue: ejecuta `npm test` y
`scripts/diagnostico.mjs`, que es el MISMO `runSelfTest` del botón pero contra
**lo que la app sirve**, no contra el repositorio. Esa distinción es la clave:
dos veces en un mismo día el repo estaba impecable y lo publicado estaba roto.

Si falla, abre una incidencia con la etiqueta `vigilancia` y el informe dentro;
si ya hay una abierta, comenta en ella en vez de crear otra. Cuando vuelve a
pasar, la cierra sola.

En modo automático no hay móvil, así que la maestría y las partidas no se ven.
Esas comprobaciones se apagan con `env.sinDatosPersonales` en vez de convertirse
en avisos: si no, todos los informes vendrían con avisos y dejaríamos de leerlos.

Desde 1.27.0 el diagnóstico del móvil también se compara con ese historial:
`vite.config.js` embebe las últimas 40 filas en `historial.json` (fuera de la
precarga y de `/data/`, como `version.json`) y `motor/diagnostico/` avisa si cruces,
sinergias, objetos, builds o el pool de la línea caen por debajo de la mediana
de la serie más 3 MAD. Y detecta datos imposibles (winrate fuera de 35–65%,
cuotas de pick que no suman 1, filas de counters planas): la ingesta conserva lo
anterior cuando un endpoint falla, así que una API rota se nota en los VALORES.

Cada corrida deja además una fila en `historial/salud.jsonl` con sus cifras
(cobertura, ruido, cruces, edad de los datos, pools por línea). Un umbral solo
salta cuando ya es tarde; una serie enseña la pendiente. `node
scripts/tendencia.mjs` la resume. No lleva nada personal: son corridas
automáticas contra lo publicado.

`mantenimiento.yml` (lunes) regenera las tablas de deducción y propone el cambio
en un pull request, y avisa de héroes nuevos SIN inventarles tags.

## Las partidas profesionales (Liquipedia)

Desde 1.29.0, `scripts/ingesta-pro.mjs` y `pro.yml` (lunes). Es la ÚNICA
fuente pública con drafts completos y resultado partida a partida; la API
comunitaria solo tiene las del propio usuario, tras el login que no se toca
(la cuenta de Javi vale dinero). Se buscaron otras APIs y no hay: la de
`sixthmelb` está muerta, `mlbb.rone.dev` no resuelve, mlbb.io bloquea
robots, mlbb.gg es una web. Antes de añadir una fuente, compruébala como
aquí: pidiéndole datos, no leyendo su README.

- **Se lee por la API y como piden sus condiciones**: `Accept-Encoding:
  gzip` (sin eso, 406), User-Agent con contacto, una petición cada 5 s, y
  NUNCA `action=parse` (una cada 30 s): el wikitext se lee con
  `prop=revisions`. Desde una IP compartida Liquipedia corta mucho antes de
  lo que dice (429 con Turnstile durante minutos): por eso hay retroceso de
  2/4/8 minutos, tope de peticiones, y se guarda lo leído en vez de tirarlo.
  Los picks van en `{{Map}}` (`t1h1..t2b5`, `winner`, `team1side`) dentro de
  `{{Match}}` (`date`, `opponentN`) en las SUBPÁGINAS del torneo (Regular
  Season, Playoffs...), no en la portada. La portada trae `sdate`/`edate`/
  `patch` en la infobox.
- **La revisión de 3.60.4 (3.60.5)**, con el corpus de 2.850 partidas:
  - «ceci» es Cecilion, no Cici: en 6 de 20 partidas iba con «cici». La
    prueba de alias exige ahora que un alias que es prefijo de algún héroe
    lo sea SOLO de su destino.
  - `claveDe` sin la duración y con los picks ordenados: Liquipedia la
    rellena o la reescribe, y había 8 repetidas.
  - `partidaPosible` descarta un héroe repetido (13 erratas) y
    `limpiarBans` quita el baneo que también se eligió (47).
  - Cada `{{Match}}` empieza sin la fecha ni los equipos del anterior, y
    `lado1` va en minúsculas.
  - `resumirPro` deja fuera de la ventana las partidas sin fecha, como
    `medir-pro`.
  - El corpus se limpió una vez (2.850 → 2.829) y `pro.json` se rehízo
    con `--max-peticiones 0`.
  - `medir-pro` dice la base del acierto: el equipo 1 gana el 54%.

  Pendiente de Javi: la línea «Pro» de la tarjeta enseña porcentaje desde 5
  picks (±22 puntos), y mezcla seis parches.
- **Los nombres son slugs y abreviaturas** (`yss`, `lance`, `esme`, `gatot`,
  `luo yi`). `ALIAS` en el script solo lleva lo visto en wikitext real, y un
  slug sin mapear descarta la partida y aparece en `pro.json` y en el
  diagnóstico. Un alias adivinado mete al héroe de al lado: peor que perder
  la partida. Desde 1.41.1 el criterio está en una prueba: todo alias que
  sea prefijo de algún nombre del catálogo tiene que serlo de UNO solo
  («ha» casa con cinco y no vale; «yu» solo con Yu Zhong). Y «none» es un
  hueco del draft, no un nombre (`SIN_PICK`). Cuando el diagnóstico avise
  de slugs nuevos, se comprueban contra el catálogo, no de memoria.
- **Lo medido con 164 partidas de MPL ID S16 (agosto–octubre 2025, un año
  antes que los datos)**: modelo completo AUC 0.54, pendiente 0.29 ± 0.31;
  solo cruces AUC 0.56, pendiente 1.05 ± 0.67; solo héroes 0.09 ± 0.40; lado
  azul 50%. Con ese ± no se concluye nada de la escala. En pro los dos
  equipos eligen del mismo meta, así que el término de héroes discrimina
  poco ahí; en solo queue de Javi no tiene por qué ser igual. **No toques la
  escala del modelo por esto**: hacen falta miles de partidas de la
  misma época (`--dias 120`) y `medir-pro.mjs` corre en cada corrida del bot.
- **Lo medido con 233 partidas de 2026 (misma época que los datos), primera
  corrida del bot**: modelo completo acierto 57,5%, AUC 0.61, Brier 0.244,
  pendiente 0.62 ± 0.23; solo héroes AUC 0.60 (pendiente 0.75 ± 0.28); solo
  cruces AUC 0.51; parejas 0.54; lado azul 52%. O sea: CON datos de la
  misma época el modelo sí distingue (0.61 es lo que consiguen los
  predictores de draft en MOBA), el término de héroes es el que manda y la
  escala parece algo optimista (habría que multiplicar el log-odds por
  ~0.6), pero con ±0.23 no se toca todavía: la medida se guarda en
  `pro.json.medicion` en cada corrida y el diagnóstico la enseña. Cuando el
  ± baje de 0.1 y la pendiente siga por debajo de 0.8, se calibra con ese
  factor y se documenta aquí. Y ojo con lo contrario: con 164 partidas de
  un año antes salía lo opuesto (cruces con señal, héroes sin ella), así
  que la época de la muestra decide, no el tamaño.
- **OJO (1.39.0)**: las cifras del punto siguiente salían de una frecuencia
  de líneas VACÍA (ver «Errores ya cometidos»). Con la de la app: bR 0,24 ±
  1,15, bO 0,77 ± 0,73, razón 0,32; log-verosimilitud igual con k=1, 2 y 3.
  Sigue sin apoyar el ×2 y sigue sin poder descartarlo.
- **El peso doble del rival de línea, medido y NO apoyado** (1.31.2,
  `scripts/medir-rival.mjs`): con las líneas repartidas como en la app,
  `gana ~ a + bR·R + bO·O` (R = los cinco cruces de línea, O = los otros
  veinte) da, sobre 532 partidas, bR 0.10 ± 0.83 y bO 1.23 ± 0.45: la señal
  de los cruces está en los veinte que NO son de línea, y el cruce de línea
  no añade nada medible (razón 0.08 donde el motor supone 2; la hipótesis
  bR = 2·bO queda a 1,9 σ). La verosimilitud con el rival a peso 1 es mejor
  que a peso 2 (diferencia 1,3, no concluyente). Ganar tres o más cruces de
  línea no hace ganar la partida (55,6% frente a 58,6%). **En 2.0 se quitó
  el ×2** con la medida de `ajustar-modelo.mjs` sobre 902 partidas (R −0.56
  ± 0.62 frente a O 0.78 ± 0.32): ningún cruce pesa distinto. La medida de
  `medir-rival.mjs` sigue corriendo en cada corrida de `pro.yml` (solo al
  log).
- Es incremental y monótona: funde por `claveDe` y `pro.yml` rechaza una
  corrida con menos partidas que las guardadas. `claveDe` es el CONTENIDO
  (fecha, equipos, picks, duración), no la página: la categoría de torneos
  lista también algunas subpáginas (`.../Season 11/Qualifier`) y con la
  página en la clave sus partidas entraban dos veces (20 de 304, 1.31.2).
  `sinSubpaginas` quita esas portadas antes de pedirlas, y hay una prueba de
  que el corpus guardado no tiene repetidas. `pro.json` es un EXTRA para
  la app (la línea «Pro» de las tarjetas): sin él, la app funciona igual.
