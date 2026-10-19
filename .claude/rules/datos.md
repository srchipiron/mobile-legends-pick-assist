---
paths:
  - "scripts/ingesta/**"
  - "scripts/ingest.mjs"
  - "scripts/comparar-ingesta.mjs"
  - "scripts/huellas.mjs"
  - "src/motor/ventana.js"
  - "src/motor/matrices.js"
  - "src/motor/catalogo.js"
  - "public/data/**"
  - "public/heroes/**"
  - "public/objetos/**"
  - ".github/workflows/update-data.yml"
  - "pruebas/scripts/ingesta*.mjs"
  - "pruebas/scripts/comparar*.mjs"
---

# Los datos y la ingesta

Se carga al tocar la ingesta, los datos publicados o lo que decide qué ventana o rango manda.

## Qué son los datos, de verdad

Medido, no supuesto. Si cambias de fuente, vuelve a medir esto ANTES de tocar
ninguna constante.

- **`pickRate` es cuota de picks, no presencia.** Los 133 suman exactamente
  1,0000. La presencia real en una partida es diez veces eso (hay diez picks).
- **La matriz de counters está orientada como se espera**: `counters[A][B] > 0.5`
  significa que A va por delante. Comprobado con héroes de diseño público:
  Phoveus saca +1,66 puntos contra los que hacen dash y −0,22 contra Layla, que
  no tiene dash. Khufra +0,98, Minsitthar +0,49.
- **Los cruces NO llevan dentro la fuerza general de ninguno de los dos.** La
  media de los 132 cruces de cada héroe es 0,494 tanto si su winrate global es
  0,445 como si es 0,543, y la correlación dentro de cada fila con el winrate
  del rival es −0,003. Son índices de cruce ya centrados, así que `counter` NO
  duplica lo que mide `meta`.
- **El winrate tampoco.** Medido entre 14 corridas consecutivas de la
  ingesta (agosto-septiembre de 2026, ventana de 7 días): la desviación del
  winrate de un héroe entre corridas es 0,0002-0,0003 en TODOS los cuartiles
  de pickrate, frente a 0,0316 de dispersión entre héroes. Por eso desde
  1.39.0 el término de héroe no encoge nada: el prior 400 sobre `pickRate ×
  40000` eran dos números inventados que conservaban el 18% del desvío de un
  héroe raro (Masha 57,7% valía como 50,5%) y cambiaban el nº1 en el 30% de
  los drafts. Si cambias de fuente, mide el ruido entre corridas antes de
  reponer un prior (`ruido-wr.mjs` en el scratch de la sesión lo hacía con
  `git show` de las corridas anteriores).
- **Los cruces no son estimaciones ruidosas.** Dos comprobaciones: (1) si el
  ruido fuera de muestreo, el cuartil menos jugado tendría sus cruces 2,65 veces
  más dispersos que el más jugado, y lo que se mide es 1,16; (2) dos corridas de
  la ingesta separadas nueve minutos dan los mismos cruces con una diferencia
  mediana de 0,00003. Por eso en 1.x `PICKRATE_FIABLE` bajó de 0,004 a
  0,00041 y desde 2.0 el cruce no se encoge por muestra en absoluto: el dato
  no lo pide. El diagnóstico vigila las dos cosas y avisa si cambian.

- **La ventana de la fuerza de un héroe es de 3 días, la del resto de 7**
  (3.2.0, `src/motor/ventana.js`). La ruta `/api/heroes/rank` admite 1, 3,
  7, 15 y 30 días con la misma población, así que se puede comparar sin
  cambiar de fuente. Medido el 18 de septiembre de 2026 sobre los 133 héroes
  en Gloria: 3 días frente a 7, σ 0,27 pp, mediana 0,18 pp, máximo 1,16 pp,
  r = 0,9969, 14 de los 15 primeros iguales, con 3,2 pp de dispersión entre
  héroes (ruido 12 veces por debajo de la señal); 1 día frente a 3, σ 34,7
  pp, r = 0,09, héroes al 0% y al 100%. Así que se usa la más corta cuya
  precisión aguanta, sin peso ni mezcla, y hay GUARDA: si la corta no es
  coherente con la de 7 (`COHERENCIA_MINIMA = 0.9`, lejos del 0,997 bueno y
  del 0,09 malo) o trae valores imposibles, manda la de 7 héroe a héroe o
  entera, y el diagnóstico dice por qué. La ingesta NO conserva la ventana
  corta de la corrida anterior (unos «recientes» viejos son peores que
  ninguno) y su fallo no tira la corrida. Cruces y parejas siguen a 7: son
  17.556 celdas con muchas menos partidas cada una y nadie ha medido su
  ruido a 3. `prepararDatos` es el único sitio donde se decide, y el centro
  del término de héroe (`mediaDelRango`) es la media de la MISMA ventana. El
  arnés de paridad quita `meta.recientes` porque 2.0.2 no la conoce.
  **La guarda saltó de verdad el 19 de septiembre de 2026**, tres días
  después del reinicio de temporada (2.2.16, Temporada 42): en la corrida
  de la mañana la de 3 días de Gloria iba a r = 0,997 con la de 7, y en la
  de la tarde vino vacía (Lolita al 100%, Terizla 87%, σ 0,168 frente a
  0,032, 34 héroes fuera de lo posible, r = −0,01 entre los posibles);
  Mítico a r = 0,27 y Épico a 0,999. La de 7 días NO se movió entre las dos
  corridas (r = 0,9999, mediana 0,0003): la API reconstruye las ventanas
  cortas alrededor del reinicio y la de 7 aguanta. La app cayó a 7 días
  sola y el diagnóstico lo dijo. Una prueba que exigía que con los datos
  reales entrara la de 3 habría bloqueado el despliegue por un dato
  legítimo: hoy exige que `prepararDatos` decida lo mismo que
  `elegirVentana`, no cuál. Cada temporada nueva, esperar este aviso unos
  días es normal; si dura más de una semana, mirar la ruta.

- **La dispersión del winrate entre héroes no es constante**: 3,2–3,3 pp
  en un parche asentado (agosto–20 de septiembre de 2026) y 5,0 pp en las
  DOS ventanas una semana después del reinicio de temporada (23–24 de
  septiembre). OJO (3.11.0): eso NO era el parche separando a los héroes,
  era Gloria sin partidas (ver el punto siguiente); Mítico siguió en 3,3.
  El término de héroe es lineal en el logit, así que la banda de
  probabilidades se abre con la dispersión; si `medir-pro.mjs` saca una
  pendiente que se aleja de 1 tras un reinicio, mirar primero de qué rango
  sale la fuerza.
- **Gloria se vacía en cada reinicio de temporada y su winrate pasa a ser
  ruido durante semanas** (3.11.0, `elegirRango` en `ventana.js`). Es el
  rango más alto: todos bajan y vuelven a subir poco a poco. Medido en la
  historia de `roam-meta.json`: r(Gloria 7 días, Mítico 7 días) 0,86–0,90
  en las 40 corridas del 3 al 22 de septiembre de 2026, σ de Gloria 3,2 pp;
  el 23 por la tarde, cuando la ventana de 7 días quedó entera dentro de la
  temporada nueva (reinicio el 16), 0,63 y σ 5,3 pp, y Mítico no se movió.
  El 25, con la ruta `/api/heroes/rank` a 1, 3, 7, 15 y 30 días en Gloria,
  Mítico y «todos»: Gloria a 1/3/7 se parece a todo lo demás a r ≈ 0,4
  (incluso a «todos» en los MISMOS días, 0,40), Mítico a 7 se parece a
  «todos» a 7 a 0,89, y Gloria a 15 y a 30 dan r = 1,00 entre sí: los
  nueve días desde el reinicio casi no aportaban partidas. La ventana corta
  no lo caza (3 y 7 días salen de las mismas pocas partidas, r = 0,99). Hoy
  si Gloria no se parece a Mítico a `COHERENCIA_DE_RANGO_MINIMA = 0.8`,
  manda Mítico entero (winrate, pick y ban) y la ventana se decide dentro de
  Mítico; `rango` sigue siendo el tuyo (va en cada partida) y
  `meta.fuerza` dice de dónde sale. Rejugada sobre las 63 corridas
  guardadas, solo salta desde el 23 por la tarde. Cambia el nº1 en 162 de
  300 drafts de roam y 119 de 300 de exp (el de Gloria sigue entre los tres
  primeros en 201 y 249). No se pudo medir contra resultados: no hay
  partidas pro posteriores al reinicio; es una decisión por calidad del
  dato, como la guarda de la ventana. Mítico–Leyenda va a 0,97 asentado y
  bajó a 0,77 del 18 al 20 (Mítico también se vació un poco): si alguna
  vez hace falta guardar Mítico, su umbral es otro y se mide aparte. Los
  cruces no se degradaron (r = 0,96 con los de antes del reinicio, σ igual)
  ESE día; hacia el 28 sí, ver el punto siguiente.
  La fila de salud lleva `fuerza` y `coherenciaRango`: la serie dice cuándo
  vuelve Gloria. Desde 3.14.0, si no hay 20 héroes para comparar, manda el
  rango que TIENE datos (antes se caía siempre a Mítico, también con Mítico
  vacío: los 133 sin fuerza y el motivo culpando a Gloria), y todo lo que
  dice «en tu rango» dice el rango de verdad (`meta.fuerza.rango`: fase de
  baneos, pie, Meta). Las comprobaciones de valores imposibles del
  diagnóstico miran `statsSemana`, las que deciden.
- **Cruces y parejas también se vacían en Gloria, y más tarde** (3.35.0,
  `elegirRangoDeRelaciones` en `ventana.js`, aplicada en la INGESTA). La
  ruta de cruces y la de parejas no tienen parámetro de días (solo
  `rank`), así que acumulan la temporada y tardan más en degradarse que la
  fuerza: la σ de los cruces de Gloria fue 0,0128 estable del 30 de agosto
  al 27 de septiembre de 2026 y saltó a 0,018–0,020 del 1 al 3 de octubre
  (parejas, 0,020 → 0,033–0,037). Medido el 3 de octubre sobre las 17.556
  celdas: cruces de Gloria de hoy contra los de Mítico de hoy r = 0,64 y
  contra los de Gloria del 20 de septiembre 0,62, mientras Mítico de hoy y
  Gloria del 20 van a 0,91 (parejas: 0,43 / 0,39 / 0,87); la razón de
  ruido entre cuartiles de pick (sana 1,16) es 1,93 en Gloria y 1,53 en
  Mítico, y la σ de Mítico (0,0133 / 0,0222) es la de Gloria asentada.
  Efecto en roam (300 drafts): el nº1 cambia en 98, y el de antes queda
  entre los tres de Mítico en 259. Por eso la ingesta baja también las de
  `RANGO_DE_RESPALDO` y, si la PEOR de las dos matrices no se parece a
  `COHERENCIA_DE_RANGO_MINIMA` (con `CELDAS_PARA_COMPARAR` = 500 celdas en
  común como mínimo; si no, se queda la pedida y lo dice), guarda las de
  Mítico; `relaciones` en `roam-meta.json` dice de dónde salen (lo lee el
  diagnóstico, la hoja Meta y la fila de salud: `relaciones`,
  `coherenciaCruces`, `coherenciaParejas`). Se decide en la ingesta y no en
  la app porque guardar las dos matrices doblaría lo que baja el móvil. El
  umbral es el de la fuerza: no hay serie con la que calibrar otro, y lo
  medido (0,91 sano, 0,64 roto) cae a los dos lados. Cuesta 266
  peticiones más por corrida. Desde 3.37.0 (revisión de lo de 3.35.0): el
  respaldo solo sustituye si llega casi entero (`filasMinimas`, el 90% de
  los héroes pedidos: con 500 celdas bastaban cuatro héroes de Mítico para
  tirar los 133 de Gloria); sin ninguna fila del rango pedido no se pide
  el de respaldo; y `relacionesDeLaCorrida` (fusion.mjs) no funde filas de
  OTRO rango (empieza de cero y el comparador cuenta las que falten) y,
  sin ninguna fila nueva, conserva la matriz CON su etiqueta (antes salía
  la de Mítico etiquetada como Gloria). Ajustes dice el rango de los cruces
  y el de las builds por separado (`rango.crucesYBuildsDe`).
  Desde 3.57.3 la guarda recuerda su última MEDIDA (`relaciones.ultima`:
  rango, coherencia y fecha) y, sin poder comprobar hoy (respaldo a
  medias, caído o con pocas celdas en común), sigue con lo que dijo ella
  en vez de volver al pedido: el 11 y el 12 de octubre de 2026 Mítico llegó
  con 32 y 50 de 120 héroes y la app volvió a los cruces de Gloria que
  había medido rotos del 6 al 10 (parejas a r = 0,46–0,57). Si la matriz
  guardada es de otro rango, las filas a medias no se funden y el
  comparador descarta la corrida: mejor estadísticas de hace dos días que
  cruces rotos (los rotos cambiaban el nº1 en 98 de 300 drafts).
  Desde 3.57.5 `fetchRelations` pide OTRA VEZ, tras `REINTENTO_RELACIONES_MS`
  (20 s), a los héroes que se quedaron sin cruces o sin parejas, si son
  como mucho la mitad (con la API caída entera reintentarlo todo doblaría
  el tiempo). El 14 de octubre de 2026 la API daba 500/503/403 a ratos y el
  bot bajó 106 de 133: por debajo del 90% de `anotarFrescura`, el
  comparador tiró la corrida con las estadísticas, los talentos y las
  builds frescos. En la segunda pasada una respuesta vacía no borra lo que
  ya llegó: la ingesta simulada lo provoca en los dos sentidos (parejas
  vacías y luego cruces vacíos, y al revés) y con la API caída entera
  comprueba que no hay segunda pasada.
  `diagnostics.relations.reintentados` y `recuperados` dicen cuántos.
  `relaciones.ultima` se sembró a mano el 14 de octubre de 2026 (3.57.7)
  con la medida de la ingesta del despliegue de las 09:42 (Mítico; cruces
  0,82, parejas 0,61), porque la guardada era la Gloria sin comprobar del
  12. Con la matriz guardada de Gloria y `ultima` en Mítico, un Mítico a
  medias tira la corrida (no se funden filas de otro rango): lo correcto,
  y el diagnóstico avisa de que se sirven cruces de un rango que la última
  comprobación descartó.

**La tier list de mlbb.gg y el 403 (3.59.4)**: desde el 4 de octubre de
2026 `back.mlbb.gg` contesta 403 a los runners de GitHub (desde la sesión y
desde un móvil contesta 200), y `fetchTiers` conservaba la anterior con su
fecha: dos semanas enseñando a Rafaela en SS con ella nerfeada. Hoy
`tiersVigentes` (ventana.js) no la enseña pasados `TIERS_CADUCAN_DIAS` (14) y
el diagnóstico avisa a los 7 con el porqué (`diagnostics.tiers`). La del 19
de octubre se bajó desde la sesión con el mismo `fetchTiers` y se escribió
con `serializar` cambiando SOLO `tiers` (la ingesta entera de esa noche la
tiró el comparador: la API daba error 1101 y solo bajaron cruces de 16
héroes). Mientras el bot reciba 403, la tier hay que bajarla desde fuera de
GitHub.

Dos constantes que se midieron y se dejaron como estaban, para no volver a
medirlas: el umbral de «tu héroe está N puntos por encima» (`>= 0.02` en
`analisis.js`) lo supera el 63% de los pares y la σ del winrate global entre
héroes es ≈3 puntos, así que 2 puntos es una diferencia real y no ruido; y el
margen de empate (`empatados`, 0.015) declara empate en el 21% de los drafts
—p25 de la distancia nº1–nº2 es 0.017—, que es una decisión de cuántas veces
decir «está reñido», no una calibración contra una distribución.

## La API

Proyecto comunitario (Rone Arena), retransmite los datos internos de Moonton.
No hay API oficial de desarrollador. Ha cambiado de dominio y de rutas más de
una vez, así que `ingest.mjs` **no fija ninguna URL**: lee el esquema OpenAPI y
descubre rutas, método y parámetros. Si algo falla, el diagnóstico lo enseña en
el móvil. No vuelvas a poner rutas a mano.

La ingesta se degrada en silencio y de forma legítima: si un endpoint falla,
conserva los datos anteriores y solo cambia `diagnostics`. Eso hace que una
corrida mala se parezca mucho a una buena en el diff: mismos números, solo
`generatedAt` nuevo y menos rangos resueltos. Si ves ese diff, la corrida fue
peor que la que ya está subida y toca descartarla, no commitearla.

Por eso la prueba que ejecuta la ingesta de verdad escribe en un temporal
(`--out`) y nunca en `public/data`. En 0.3.1 esto era un fallo real: escribía en
su sitio, así que cada `npm test` ensuciaba el repo y, como en el workflow las
pruebas van antes de compilar, el diagnóstico degradado era el que se publicaba
y el botón Diagnóstico mentía sobre los rangos. No le quites el `--out`.

## El winrate por línea (3.12.0)

`winrateLinea` en `roam-meta.json`: `{ héroe: { línea: winrate } }`, 165
pares (solo las líneas que cada héroe juega). La ingesta lo baja de
`/api/academy/heroes/{id}/win-rate/timeline?lane=&rank=` (`fetchWinrateLinea`,
el `total_win_rate` que va junto a la curva por duración; objetivo `lineas`
en `WANTED`, descubierto por la forma de la ruta como todo lo demás), una
petición por héroe y línea con 200 ms de pausa (~35 s más de ingesta). Si
falla, se conserva el anterior PAR A PAR desde 3.14.0 (`fundirWinrateLinea`,
solo las líneas que el héroe juega hoy; antes una corrida con un solo par
sustituía a la guardada entera), y `comparar-ingesta` cuenta los PARES
héroe-línea (`winrateLinea`, en `FIJAS` y en la fila de salud: se compara
también con el máximo del historial): una corrida que los pierda no se
commitea. La ingesta simulada sirve la ruta con la forma real y
comprueba que sale lo servido (verificado por mutación: sin la ruta en
`CON_ID` o sin el lector, falla).

Se ENSEÑA y no puntúa (medido en 3.11.0, ver «Candidatos descartados»).
`winrateEnLinea(datos, héroe, línea)` en `draft.js` es el único acceso, por
clave normalizada (el catálogo dice «X Borg», la API «X.Borg»); la tarjeta
lo pone bajo el winrate general (`.pick-wrlinea`, en la columna derecha, que
no es la que marca el alto: `primera-pantalla.e2e` sigue en verde) y
«Meta» en la línea de uso de cada fila. Hay una prueba de que el ranking es
idéntico con y sin el dato. Su población es la de Gloria a 15–30 días
(r = 0,99 con esa ventana), NO la de la fuerza: tras un reinicio de
temporada tarda semanas en ponerse al día, y el texto lo dice («unas semanas
de Gloria»). La primera tanda se metió a mano el 25 de septiembre de 2026
con lo bajado de la misma ruta en la medida de 3.11.0 (y el serializador de
la ingesta, que reescribe el fichero byte a byte igual); desde ahí la trae
el bot. Comprobado el 26 de septiembre con la ingesta REAL a un temporal,
como la corre el bot: la ruta se descubre sola, 165 pares sin errores,
idénticos a los metidos a mano (diferencia máxima 0,00 pp: es una ventana
larga), el comparador la acepta (`winrateLinea=165` en las dos) y la
corrida entera tardó 11 min 15 s bajando además TODAS las imágenes desde
cero (73 iconos, 133 retratos), que el bot ya tiene: lejos del tope de 20.

## Las imágenes

Iconos de objeto (`public/objetos/{id}.png`, 71) y caras de héroe
(`public/heroes/{id}.jpg`, 133). Unos 4,6 MB en el repositorio.

- **Se sirven desde la app, no desde el CDN de Moonton.** Enlazar la imagen le
  cuenta tu IP a un tercero, y la app promete que tus datos no salen del móvil.
  Además, sin cobertura una imagen enlazada no llega, que es justo cuando estás
  en un draft.
- **Pero NO entran en la precarga del instalador** (`globPatterns` en
  `vite.config.js` excluye los png que no sean los de la app). Instalar seguiría
  costando 241 KB y no 5 MB; cada imagen se guarda en cuanto se ve, con una
  regla `CacheFirst`. Hay una prueba que falla si vuelven a colarse.
- Los retratos salen de la ficha que la ingesta YA pide para los 133 héroes: no
  cuestan ni una petición más. Se coge `head` (210x220, 22 KB), nunca
  `smallmap`, que es el dibujo de cuerpo entero: 165 KB por héroe, 22 MB.
- Los ficheros van **por id**, no por nombre: un id no cambia aunque Moonton
  reescriba el nombre. Por eso `mergeCatalog` añade ahora el `id` de la API a
  cada héroe del catálogo, y hay una prueba de que no se queda ninguno sin él.
- Si la imagen falta, el componente `Imagen` se quita solo y queda el texto. En
  el hueco del draft es al revés: manda la cara y el nombre se retira con
  `:has(.slot-cara)`, porque a 390px no caben los dos (medido: 0 píxeles para el
  nombre). Si no hay cara, el nombre recupera su sitio.
- **El prop se llama `className`, no `clase`.** `comprobar/css.mjs` busca
  literalmente `className=` para saber qué clases usa la interfaz; con otro
  nombre, una clase sin estilo pasa el control sin que nadie se entere.
