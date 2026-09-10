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
con tags deducidos de su rol y de la «speciality» de Moonton (`tagsDeducidos` en `src/engine/score.js`),
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
(`src/engine/modelo.js`; el ranking en `src/engine/ranking.js`).

Tres decisiones que conviene entender antes de tocar nada:

**El winrate no se encoge.** Medido el ruido entre corridas de la ingesta (0,0003 frente a 0,03 de
dispersión entre héroes), no hay nada que encoger; tampoco el cruce por lo raro que sea el rival.

**Los counters usan el dato real si existe, y reglas por tags si no.** Las reglas están en
`COUNTER_RULES` y son legibles: "si el enemigo tiene dashes, un roamer con anti-mobility sube". Solo
entran con un héroe recién salido del que no hay ni un cruce, a la misma equivalencia que en 1.x.

**Lo que falta por salir cuenta como esperanza, no como castigo.** Para cada línea enemiga abierta se
suma el cruce esperado contra lo que se juega ahí, ponderado por pickrate. El aviso de «arriesgado
como pick ciego» sigue como aviso.

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
npm test    # orden de declaraciones + estilos + versión documentada + ~100 pruebas del motor
```

Las cuatro corren en GitHub **antes** de compilar, así que un cambio que rompa la
lógica no llega a publicarse: te quedas con la versión anterior funcionando.

- `check-order.mjs` — consts usadas antes de declararse. Ese fallo no da error al
  compilar: deja la pantalla en negro al arrancar, y en el móvil no hay consola.
- `check-css.mjs` — que nada esencial quede oculto en móvil (la × de quitar un
  pick llegó a estarlo), variables sin declarar y clases sin estilo.
- `test-engine.mjs` — desde el encogido del winrate hasta que ningún roamer
  acapare las recomendaciones. Varias son regresiones de fallos ya publicados.

## Estructura

```
scripts/ingest.mjs        descarga y normaliza el meta
src/engine/modelo.js      EL modelo: los términos y la escala medida
src/engine/ranking.js     el ranking, los baneos y el margen de empate
src/engine/rules.js       reglas de counter y necesidades de equipo (solo sin dato)
src/engine/score.js       utilidades: nombres, matrices, catálogo, maestría, pools
scripts/ajustar-modelo.mjs  qué coeficiente sale para cada término, con validación cruzada
src/components/ui.jsx     selector de héroes, slots, tarjeta, pie de versión
scripts/test-engine.mjs   pruebas del motor
scripts/check-order.mjs   uso antes de declarar
scripts/check-css.mjs     estilos y clases
public/data/heroes.json   catálogo de roles y tags escrito a mano (esto es el activo real)
```

Datos © Moonton. Proyecto personal, sin relación con Moonton ni con los mantenedores de la API.
