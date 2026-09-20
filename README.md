# Mobile Legends Pick Assist

Qué héroe coger en tu línea, según el draft que tienes delante y el meta del parche actual.
Eliges tu línea (roam, jungla, mid, gold o exp) y la app recomienda para esa, con los
datos de partidas reales de tu rango. En español e inglés.

Proyecto de aficionado, sin relación con Moonton. Mobile Legends: Bang Bang y sus
héroes son marcas de sus propietarios. Tus datos no salen de tu móvil: no hay
cuentas, ni servidor, ni seguimiento.
PWA: se instala en el móvil desde el navegador y funciona sin conexión con los últimos datos descargados.

## Arrancar

```bash
npm install
npm run ingest      # descarga el meta actual -> public/data/roam-meta.json
npm run dev         # http://localhost:5173
```

Sin ejecutar `ingest` la app funciona igualmente, pero solo con composición y counters por rol.
En cuanto hay datos meta, entran los winrates reales.

## Publicar

```bash
npm run build       # -> dist/
```

Sube `dist/` a GitHub Pages, Netlify o Vercel. En GitHub Pages la ruta base la pone el despliegue con la
variable `BASE_PATH` (ver `deploy.yml` y `vite.config.js`). Desde el navegador del móvil: menú → "Añadir a pantalla de inicio".

Si quieres un APK, ver [APK.md](APK.md): se genera desde el móvil con PWABuilder, sin tocar el código.

## Cómo se mantiene solo al día

`.github/workflows/update-data.yml` corre `scripts/ingest.mjs` dos veces al día a un fichero temporal,
`scripts/comparar-ingesta.mjs` comprueba que la corrida nueva no resuelva menos que la guardada, y solo
entonces se commitea el JSON con los iconos y retratos nuevos. El service worker sirve el fichero cacheado al instante y lo refresca por detrás,
así que en el draft nunca esperas a la red.

La ingesta también descarga la **lista completa de héroes** con su rol, así que el catálogo escrito a
mano nunca deja a nadie fuera: un héroe que exista en el juego y no esté en `heroes.json` entra igual,
con tags deducidos de su rol y de la «speciality» de Moonton (`tagsDeducidos` en `src/motor/catalogo.js`),
descontados como deducidos. El workflow avisa de cuáles son. Escribirle sus tags propios lo hace
mejor, pero es opcional, no un requisito.

## Fuente de datos

Las **partidas profesionales** (picks, baneos y resultado de cada partida de MPL, MSC, M-Series y
demás torneos S/A) salen de [Liquipedia](https://liquipedia.net/mobilelegends), bajo licencia
[CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Se leen por su API (nunca el HTML),
con un User-Agent identificado y una petición cada 5 segundos, como piden sus condiciones de uso.
`scripts/ingesta-pro.mjs` las guarda en `historial/pro-partidas.jsonl` (la muestra, para
`scripts/medir-pro.mjs`) y en `public/data/pro.json` (lo poco que lee la app).

API pública de la comunidad (Rone Arena, `api-mobilelegends` de ridwaanhall): winrate, pickrate y
banrate por rango, además de counters y compatibilidad por héroe. No es oficial de Moonton.

El proyecto ha cambiado de dominio y de prefijo de rutas más de una vez (`mlbb.rone.dev`, `arena.rone.dev`,
hoy `arena-hv.fastapicloud.dev`), así que `scripts/ingest.mjs` **no fija ninguna URL**: prueba las
bases conocidas, se queda con la primera que responde y lo anota en `diagnostics` dentro del JSON. Los campos también se buscan por varios nombres posibles, y si un endpoint falla se conservan los
datos anteriores en vez de dejarte sin nada.

Más aún: antes de pedir nada, la ingesta **lee el esquema OpenAPI de la API** y saca de ahí las rutas
reales, su método (unas son GET y otras POST) y qué parámetros acepta cada una. Los nombres se buscan
por patrón (`WANTED` en el script), no por ruta literal, así que un cambio de nombre no la rompe. Solo
si no hay esquema cae a probar rutas conocidas a ciegas.

Si algún día deja de funcionar del todo, la app lo dice y el JSON lleva el esquema y lo que se probó.
Se añade la nueva base a `BASES` en `scripts/ingest.mjs`, o se pasa con `--base https://loquesea/api`.

No hay una segunda fuente de estadísticas viva: se buscaron (ver CLAUDE.md) y las que había están muertas
o bloquean robots. Antes de añadir una, pídele datos; no te fíes de su README.

## De dónde sale cada decisión

El objetivo es que la app siga siendo correcta dentro de un año, cuando haya
héroes nuevos y reequilibrados. Para eso, cuanto menos criterio humano fijo
lleve dentro, mejor: las reglas escritas a mano envejecen, los datos no.

Desde 2.0 no hay pesos: la nota de cada pick es la **probabilidad de ganar el
draft que resulta**, y sale de un único modelo aditivo en log-odds cuya escala
está medida contra 902 partidas profesionales con resultado (Liquipedia), con
validación cruzada (`scripts/ajustar-modelo.mjs`).

| Término | Qué es | Origen |
|---|---|---|
| Héroes | winrate público de los tuyos menos los suyos | partidas ranked de tu rango |
| Cruces | cada uno de los tuyos contra cada uno de los suyos | matriz de counters (17.556 cruces) |
| Parejas | cómo rinden juntos los tuyos, menos los suyos | matriz de sinergias |
| Tú | tu winrate con el héroe, en lugar del público | tus partidas |
| Por ver | lo que cabe esperar contra lo que falta por salir | pickrate por línea |

Lo medido: los tres términos de datos pesan lo mismo dentro del error (un
coeficiente libre por término no mejora la validación cruzada), la escala es
0,44 ± 0,12 (con coeficiente 1 el modelo exageraba: error peor que una moneda),
el cruce contra tu rival de línea NO vale más que los otros, y los huecos de
composición por etiqueta valen 0,00 ± 0,07: se dicen, no se puntúan. El botón
**Diagnóstico** enseña la escala y avisa si el bot mide otra cosa.

## Cómo puntúa

Cada tarjeta enseña la probabilidad y, en puntos, cuánto aporta cada término
(`src/motor/modelo.js`; el ranking en `src/motor/ranking.js`).

Tres decisiones que conviene entender antes de tocar nada:

**El winrate no se encoge.** Medido el ruido entre corridas de la ingesta (0,0003 frente a 0,03 de
dispersión entre héroes), no hay nada que encoger; tampoco el cruce por lo raro que sea el rival.

**La fuerza de un héroe es la de los últimos 3 días; cruces y parejas, de 7.** Una media de 7 días
tarda una semana en recoger un parche. La ventana de 3 dice lo mismo que la de 7 cuando no lo hay
(r = 0,997, mediana 0,18 puntos) y su ruido queda doce veces por debajo de la dispersión entre héroes;
la de 1 día no vale (héroes al 0% y al 100%). Si la de 3 viene rara, manda la de 7 y el Diagnóstico
lo dice (`src/motor/ventana.js`). El botón **Meta** de Ajustes enseña esa tier list por línea, con la
deriva de cada héroe, y al lado la tier de **mlbb.gg** (SS…D), que el bot baja con los datos: es
opinión curada, se enseña para comparar y no cuenta en la nota (medido: sabiendo el winrate no añade
nada; donde discrepa es por dificultad, Fanny en S al 41% y Argus en C al 54%).

**Los counters usan el dato real si existe, y reglas por tags si no.** Las reglas están en
`COUNTER_RULES` y son legibles: "si el enemigo tiene dashes, un roamer con anti-mobility sube". Solo
entran con un héroe recién salido del que no hay ni un cruce, a la misma equivalencia que en 1.x.

**Tu pick se fija tocando el nombre de la tarjeta** (o el hueco «Tú» de tu equipo). Desde ahí el
análisis, la composición, el consejo a los compañeros y la estimación hablan de ÉL, no del nº1, y
diez minutos después la app pregunta cómo fue: Gané/Perdí apuntan la partida con su draft entero en un
toque. El filtro **Mis héroes** deja solo los que llevas, y en la fase de baneos sale tu plan A · B · C
con su tasa de ban.

**Lo que falta por salir cuenta como esperanza, no como castigo.** Para cada línea enemiga abierta se
suma el cruce esperado contra lo que se juega ahí, ponderado por lo que se juega cuando no está
baneado (pickrate/(1−banrate): un héroe baneado el 80% de las veces sale poco en las estadísticas,
pero en tu partida no lo han baneado; medido, acierta más lo que falta por salir). El aviso de
«arriesgado como pick ciego» sigue como aviso.

**El equilibrio de daño puntúa; los huecos por etiqueta, no.** Un equipo con físicos y mágicos de
verdad gana más que uno que pega todo de un tipo (en 1.830 partidas pro, sin ningún mago puro se gana
el 42,9%; con dos, el 51,6%), y es el único término de doce probados en 3.4.0 que predice mejor
fuera de muestra. Se cuenta min(físicos, mágicos) de los tuyos menos el de los suyos, un mixto no
cuenta para ninguno, y pesa la mitad que un cruce (medido). La tarjeta lo dice cuando tu pick es el
que mete el tipo que faltaba. Los demás huecos de composición (tanque, control, iniciador...) se
dicen como consejo y no puntúan: medidos, no predicen.

Tu maestría se edita desde el botón **Tu maestría**: partidas y winrate de cada roamer, tal como
salen en tu perfil del juego. El winrate va en porcentaje (`50,6` o `50.6`, las dos formas valen) y
la conversión a fracción se hace al guardar. Los héroes que ya tienen datos suben arriba de la lista.
Se guarda en `localStorage` y no sale del móvil.

## Rival de línea

La app deduce sola quién va a tu línea en el equipo enemigo (de las líneas en
las que se juega cada héroe, dato de la API), lo marca con un círculo punteado
y puedes corregirlo tocando otro. Se usa en el análisis («ganas tu cruce contra
X») y para el consejo a los compañeros; desde 2.0 no pesa doble, porque medido
en las partidas pro el cruce de línea no vale más que los otros veinte.

**Se calla cuando hay duda.** Con dos tanques o dos supports enfrente podría ser
cualquiera, y equivocarse es peor que no decir nada. Exige un margen mínimo
sobre el segundo candidato.

## Pick a ciegas

Como roam sueles elegir pronto, sin ver el equipo enemigo entero. Cada roamer
tiene un riesgo 0..1 medido por el percentil 10 de sus matchups (el mal día
típico); los muy castigables se marcan como "arriesgado como pick ciego". Es un
aviso: el orden de pick de Liquipedia no lleva señal de contrapick medible, así
que no hay castigo inventado. Lo que sí entra en la nota es la esperanza del
cruce contra lo que se juega en cada línea abierta.

## Baneos

El draft va en dos fases. La primera son los baneos, solos en pantalla: diez huecos, el selector
multi-toque, y el **siguiente baneo probable** en fichas para tocar en vez de escribir (los más
baneados de tu rango que aún no están marcados; con tus partidas apuntadas, también lo que suele caer
junto a lo ya marcado). Debajo, a quién conviene banear por tu equipo: lo fuerte que está el héroe,
ordenado por lo que te quita: la probabilidad que pierdes si sale ese héroe (su fuerza y sus cruces
contra tus aliados ya elegidos), por lo que sale cuando no está baneado. Un toque en «Ir a los
picks» pasa a la segunda fase, con la tira de baneos arriba para volver.

## Lo que esto no hace

- **El winrate global no es tu winrate.** Elige tu rango en "Ajustes": la ingesta descarga
  Epic, Legend, Mythic y Glory, y el meta cambia bastante entre ellos.
- **Un cruce no decide una partida.** Están medidos como índices de cruce ya centrados, sin ruido de
  muestreo apreciable, pero pesan lo mismo que la fuerza general del héroe: en 902 partidas pro el
  modelo entero acierta el 55% y ordena bien el 57% de los pares (AUC). El draft inclina, no gana.
- **No lee la pantalla del juego.** Los picks enemigos los metes tú a mano. En 30 segundos de draft
  da tiempo a tres o cuatro toques, no a más: por eso la rejilla tiene botones grandes y buscador.

## Diagnóstico desde el móvil

Botón **Diagnóstico** en "Ajustes". Ejecuta las comprobaciones contra
los datos que la app tiene cargados en ese momento y deja un texto para copiar
o compartir: entorno, frescura de los datos, cobertura de winrates y counters,
nombres que no casan, sensatez táctica del motor y si tu maestría se aplica.

Es distinto de `npm test`: aquellas pruebas corren en GitHub contra datos
sintéticos y comprueban que el motor es correcto. Esta comprueba que la descarga
de hoy salió bien y que tu móvil está mostrando lo que debe.

## Comprobaciones

```bash
npm test          # guardarraíles + ESLint + todas las pruebas (pruebas/**/*.test.mjs)
npm run test:ui   # pruebas de navegador sobre dist/ (compila antes con npm run build)
node pruebas/correr.mjs motor/modelo   # solo los ficheros que casen con el patrón
```

Todo corre en GitHub **antes** de compilar, así que un cambio que rompa la
lógica no llega a publicarse: te quedas con la versión anterior funcionando.

- `scripts/comprobar/orden.mjs` — variables usadas antes de declararse en los
  componentes. Ese fallo no da error al compilar: deja la pantalla en negro al
  arrancar, y en el móvil no hay consola.
- `scripts/comprobar/css.mjs` — que nada esencial quede oculto en móvil (la ×
  de quitar un pick llegó a estarlo), variables sin declarar, consultas de
  medios al final y clases sin estilo, recorriendo todos los componentes.
- `scripts/comprobar/version.mjs` — la versión que se publica tiene entrada en
  el CHANGELOG.
- ESLint — un identificador que no existe o un import muerto (un
  `ReferenceError` llegó a producción pasando todas las pruebas).
- `pruebas/motor/*.test.mjs` — un fichero por módulo del motor; desde el
  encogido del winrate hasta que ningún héroe acapare las recomendaciones.
  Cada guardarraíl se verificó rompiendo lo que vigila.
- `pruebas/app/`, `pruebas/scripts/` — idiomas completos, forma del código
  (el motor no importa de la app ni de React, sin ciclos), guardarraíles con
  ficheros rotos, ingesta contra una API simulada, workflows.
- `pruebas/interfaz/*.e2e.mjs` — Chrome de verdad: fases, hojas, foco, botón
  atrás, chips estables, inglés sin fugas y la tarjeta nº1 en la primera
  pantalla. En GitHub las corre `pruebas-ui.yml` con el Chrome del runner.

## Estructura

```
src/motor/                el motor, puro (sin React, sin red, sin almacén)
  draft.js                EL cerebro: prepara los datos y recomienda; lo usan la app, el diagnóstico y las pruebas
  modelo.js               el modelo: los términos y la escala medida
  ranking.js              el ranking y el margen de empate
  baneos.js               a quién banear y el siguiente baneo probable
  lineas.js               líneas de cada héroe, líneas abiertas, rival de línea
  robustez.js             ¿aguanta el nº1 lo que falta por salir?
  equipo.js               qué pueden coger tus compañeros
  analisis.js             las frases sobre el draft
  composicion.js          qué tiene y qué le falta a cada equipo
  builds.js               objetos: lo que se compra y el ajuste al draft
  maestria.js             tu nivel, el prior medido y la nota de maestría
  matrices.js             cruces y parejas, cobertura, umbrales medidos
  catalogo.js             el catálogo fundido con la API, tags deducidos, pools
  reglas.js               reglas por etiqueta (solo sin dato) y tablas deducidas
  nombres.js              la clave de todos los datos
  registro.js, perfil.js, alias.js
  diagnostico/            el informe del botón Diagnóstico y del bot, por secciones
src/app/                  la interfaz
  App.jsx                 pantallas, hojas y acciones
  estado/                 hooks: almacén (claves roam-picker:*), draft, ajustes, datos, personal, recomendación, actualización
  pantallas/              ElegirLinea, FaseBaneos, FasePicks
  componentes/            un fichero por componente, con nombre propio
  i18n/                   es.js, en.js y el traductor
scripts/ingest.mjs        descarga y normaliza el meta (entrada fina de scripts/ingesta/)
scripts/ingesta/          descubrimiento de rutas, descarga, extracción, relaciones, fusión, imágenes, salida
scripts/ajustar-modelo.mjs  qué coeficiente sale para cada término, con validación cruzada
scripts/diagnostico.mjs   el diagnóstico del bot, contra lo publicado
scripts/comprobar/        orden, css y versión
pruebas/                  arnés, runner, un fichero de pruebas por módulo, e2e en interfaz/
public/data/heroes.json   catálogo de roles y tags escrito a mano (esto es el activo real)
```

Datos © Moonton. Proyecto personal, sin relación con Moonton ni con los mantenedores de la API.
