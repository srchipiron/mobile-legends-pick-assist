---
paths:
  - "scripts/ingesta/**"
  - "scripts/ingest.mjs"
  - "scripts/comparar-ingesta.mjs"
  - "scripts/actualizar-tiers.mjs"
  - "scripts/huellas.mjs"
  - "src/motor/ventana.js"
  - "src/motor/matrices.js"
  - "src/motor/catalogo.js"
  - "public/data/**"
  - "public/heroes/**"
  - "public/objetos/**"
  - ".github/workflows/update-data.yml"
  - "pruebas/scripts/ingesta*.mjs"
  - "pruebas/scripts/api-simulada.mjs"
  - "pruebas/scripts/comparar*.mjs"
---

# Los datos y la ingesta

Qué son los datos de verdad, cómo los baja la ingesta y qué la protege. La
crónica de 3.x está en `docs/archivo/reglas-3.102/datos.md`.

## Qué son los datos (medido; si cambias de fuente, vuelve a medirlo)

- **`pickRate` es cuota de picks**: los 133 suman 1,0000 (presencia = ×10).
- **`counters[A][B] > 0,5` = A va por delante** (Phoveus +1,66 contra los de
  dash, −0,22 contra Layla). Antisimétricos: c[a][b] + c[b][a] = 1.
- **Los cruces no llevan la fuerza de nadie**: media de fila 0,494 con winrate
  0,445 o 0,543; r = −0,003 con el winrate del rival. `counter` no duplica `meta`.
- **Ni ruido de muestreo**: el winrate de un héroe se mueve 0,0002–0,0003 entre
  corridas frente a 0,0316 entre héroes; los cruces, 1,16× de dispersión entre
  cuartiles (el muestreo daría 2,65×) y 0,00003 entre dos corridas a 9 min.
  Por eso nada se encoge por muestra.
- **La fuerza va a 3 días, el resto a 7** (`ventana.js`): 3 frente a 7 días
  σ 0,27 pp, r = 0,997, 12× bajo la señal; 1 día r = 0,09. GUARDA
  `COHERENCIA_MINIMA = 0,9`: si la corta no casa o trae imposibles, manda la
  de 7. Tras un reinicio de temporada salta unos días (normal; si dura más de
  una semana, mirar la ruta). La ingesta NO conserva la ventana corta.
- **Gloria se vacía en cada reinicio** (`elegirRango`): si su winrate no se
  parece al de Mítico a `COHERENCIA_DE_RANGO_MINIMA = 0,8` (0,86–0,90 sano,
  0,63 roto), manda Mítico entero; con menos de 20 héroes para comparar, el
  rango que TIENE datos. `meta.fuerza` dice de dónde sale.
- **Cruces y parejas también, y más tarde** (no tienen días: acumulan la
  temporada). La ingesta baja también `RANGO_DE_RESPALDO` (Mítico) y
  `elegirRangoDeRelaciones` decide con la PEOR de las dos matrices a 0,8
  (0,91 sano, 0,64 roto), con ≥ `CELDAS_PARA_COMPARAR` (500) celdas comunes y
  el respaldo casi entero (90 % de los pedidos). Sin poder comprobar sigue lo
  que dijo la última medida (`relaciones.ultima`). Se decide en la ingesta:
  dos matrices doblarían lo que baja el móvil.
- Medidos y dejados: «tu héroe N puntos por encima» `>= 0,02` (lo supera el
  63 % de los pares, σ entre héroes ≈ 3 pp) y el empate 0,015 (21 % de drafts).

## La API

Rone Arena, retransmite datos internos de Moonton; no hay API oficial y ha
cambiado de dominio y de rutas. **Ninguna ruta escrita a mano**: se lee el
OpenAPI de la primera base de `BASES` que lo sirva y se buscan por patrón las
candidatas de cada recurso (`descubrimiento.mjs`, `BUSCADAS`; con `{id}`
primero para `CON_ID`). Cruces y parejas se ELIGEN midiendo (`medirRutas`:
gana la que trae MÁS pares; un error no es un cero, se reintenta). Sin
esquema hay un camino a ciegas (bases × `PREFIJOS`, GET y POST ante 405):
cambia solo el caso «sin esquema» y se conserva. **Las rutas de la cuenta no
se tocan nunca**: el descubrimiento las quita y `request` las para
(`RUTA_PROHIBIDA`), dos puertas. Lo que llega es DATO: speciality con forma
(`ES_SPECIALITY`), ids de imagen numéricos y URLs https.

## La ingesta (`scripts/ingest.mjs` → `scripts/ingesta/`)

`contexto` (opciones y contexto de la corrida; nada se lee al importar),
`descarga` (`request` con tope de 15 s, `callRoute`: ante un 422 reintenta
solo con `rank, rank_id, lane`, que nunca se sueltan; `days` soltado es
error), `descubrimiento`, `extraccion` (lectores POR FORMA sobre un recorrido
común hasta `HONDURA` 12: la línea vive en el nivel 8), `peticiones`,
`relaciones`, `fusion` (todo puro), `imagenes`, `tiers`, `salida`, `cli`.

**Si un endpoint falla se conserva lo anterior** (`intentar`) y la corrida
sale con 0: una mala se parece a una buena en el diff, por eso existe el
comparador. «Lo anterior» es `--previo`, luego `public/data/roam-meta.json`,
luego `--out` (los workflows escriben a un temporal que no existe). Orden:

1. Lista de héroes (o la guardada). Fichas: cada héroe hereda por nombre
   `damage, habilidades, retrato, cara, speciality, kitTexto, kitCifras` y lo
   que llega manda (`habilidades` siempre, aunque vacía).
2. Estadísticas a 7 días de `ranks` (el pedido y su respaldo se añaden
   siempre); los fallos de paso (5xx, 429) se repiten tras 20 y 60 s
   (`REINTENTOS_ESTADISTICAS_MS`; sin red o 4xx, no). Ventana de 3 días igual,
   NUNCA conservada.
3. Tier list (opinión de mlbb.gg: se enseña, no puntúa). Medida de rutas.
4. Objetos de TODAS las rutas campo a campo (`fundirEquipo`: sin ninguna
   defensa fresca, cada objeto conserva defensa, tipo y efectos; con una ruta
   caída se conservan los guardados que no llegan; con todas, el que falta se
   quita). Talentos. Builds, winrate por línea y curva: una petición por héroe
   y línea que juega, fundidas PAR A PAR (`fundirPorHeroeYLinea`).
5. Iconos (solo objetos en builds o con defensa/efecto) y retratos por id.
6. Cruces y parejas por héroe, en paralelo, 250 ms entre héroes. Fila de menos
   de `FILA_CORTA` (20): se vuelve a medir la ruta (≤ 3 veces). Segunda pasada
   UNA vez a los que quedan sin cruces o sin parejas: con la mitad o menos tras
   20 s; con más, tras 60 s y solo si la API contestó con un error suyo. Una
   respuesta vacía no pisa una fila ya llegada. Si el pedido llegó al 90 % y
   el respaldo no, el respaldo se pide otra vez tras 60 s.
7. `relacionesDeLaCorrida`: sin fila nueva, la guardada con SU etiqueta; de
   otro rango, se empieza de cero (no se funden rangos); una fila con menos de
   la mitad de celdas que la guardada no entra (`esCorta`); luego `recoser`
   (la celda de una fila de ayer contra un héroe de hoy sale de la de hoy).
8. Fechas: `generatedAt` sigue a las ESTADÍSTICAS que deciden (pedido Y
   respaldo frescos); la matriz lleva la suya (`relaciones.descargada`, nueva
   si llegó el 90 % de cruces Y de parejas). `diagnostics.conservado`,
   `frescos`, `frescosRecursos` lo dicen.
9. `kitsRehechos` (huella de heroes.json), `anotarHistoria` (una foto por día
   de pedido y respaldo frescos, 10 días), `anotarParche`.
10. `serializar(out) + '\n'`: matrices, builds, winrate, curva e historia en una
    línea por héroe, matrices a 4 decimales. INVARIANTE:
    `serializar(JSON.parse(f)) + '\n' === f` (lo exige `actualizar-tiers.mjs`).

Flags: `--out`, `--previo`, `--iconos`, `--retratos`, `--rank` (glory),
`--ranks`, `--days` (7), `--base`/`MLBB_API_BASE` (esa y solo esa; apaga
mlbb.gg), `--tiers <base>|off`, `--pausa N` (sustituye toda espera),
`--celdas-para-comparar N` (solo la simulación).

**Fuera de la salida desde 4.0** (nadie los leía): `heroes[].lane`,
`stats.*.matches`, `roamCoverage`, `patchAvgWinRate`, `diagnostics.ok`. Un
fichero de 3.x se limpia al leerlo (`sinCamposMuertos`).

## Los tocados por el parche

`huellaDeKit` quita las cifras a propósito (las etiquetas van por mecánicas);
`kitCifras` (`huellaDeHabilidades`: nombre, texto y `skillcd&cost`, con
cifras) ve un nerf de números. `anotarParche` deja en `tocados` `{héroe:
fecha}` los que cambian hoy y los de antes mientras tengan menos de `days`.
GUARDA: más de la mitad de los comparables a la vez (`PARCHE_MAX_PROPORCION`)
es la API reescribiendo textos, no un parche (el del 11-11 tocó 32 de 133):
no marca a nadie. Sin `kitCifras` previas no compara.

## El comparador (`comparar-ingesta.mjs`)

Sale con 1 si la corrida nueva resuelve MENOS (`medir`: héroes con línea,
rol, daño, speciality, habilidades; rangos y el pedido; pares de cruces y
parejas; objetos con defensa y efecto; builds y talentos; pares de winrate y
curva por línea). `MARGEN` 0,9. Las `FIJAS` se comparan también con el
máximo del historial de salud (sin eso era un trinquete hacia abajo). Una
matriz conservada NO tira la corrida (lleva su fecha; perder cruces sí); con
la matriz nueva entera tampoco `rangoFresco`; sin NADA fresco, siempre
(`nadaFresco`). Perder un día de la historia dentro de su ventana, también.
Guardada ilegible: sale con 2 (solo «no existe» se acepta).

## Winrate y curva por línea

`winrateLinea` (`total_win_rate` de `/win-rate/timeline`) y `curvaLinea` (sus
seis tramos `TRAMOS_CURVA`, 10–20 min; en porcentaje no se guarda). Se ENSEÑAN
y no puntúan: su población es Gloria a 15–30 días (r = 0,99), no la de la
fuerza, y en pro no mejora la predicción. `winrateEnLinea` (draft.js) es el
único acceso.

## Las imágenes

`public/objetos/{id}.png` y `public/heroes/{id}.jpg`, servidas por la app
(el CDN contaría tu IP y sin cobertura no llega), fuera de la precarga, con
`?v=` por la huella del CONTENIDO (`huellas.mjs`). Se baja lo que falta o
cambió de origen (`fuentes.json`), solo si la cabecera es PNG/JPEG/WEBP. El
retrato es `head` (210×220), nunca `smallmap`; la cara del juego, `head` del
objeto con `heroid` (la del lector). Por id: un nombre puede cambiar. Un
proxy (`?url=`) se desenvuelve: se guarda la de Moonton.

## Las pruebas

- `ingesta.test`: lectores por forma, 422, rutas de la cuenta, fusiones,
  `serializar`, `recoser`, `anotarParche`, opciones y campos muertos.
- `ingesta-simulada.test`: la ingesta COMO PROCESO contra
  `pruebas/scripts/api-simulada.mjs` (la forma real de cada respuesta y cada
  fallo encendible) en diez corridas y contra una base inalcanzable; mira que
  sale lo SERVIDO. Lo guardado lleva sus imágenes en la propia máquina:
  ninguna prueba sale a internet. Siempre `--out`, `--iconos`, `--retratos`
  a temporales y `--previo`.
- `comparar.test`. La paridad de 4.0 contra 3.102.0 se midió con la misma API
  simulada: 16 escenarios byte a byte y el comparador 2.448 de 2.448 pares.
- Si cambias la forma de una respuesta simulada, cambia la real a la vez.
