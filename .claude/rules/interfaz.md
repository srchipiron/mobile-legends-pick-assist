---
paths:
  - "src/app/**"
  - "src/styles.css"
  - "src/main.jsx"
  - "vite.config.js"
  - "pruebas/interfaz/**"
  - "pruebas/app/**"
---

# La interfaz

Se carga al tocar la interfaz, el estilo o las pruebas de navegador.

## Meter el draft deprisa (3.16.0)

Javi: «hay veces que empieza la partida y me veo super agobiado para ir
buscando campeones». Antes de cambiar nada se midió qué entrada mueve la
recomendación (`valor-entradas.mjs` en el scratch de la sesión, sobre sus
42 drafts reales con la maestría efectiva y 300 sintéticos de roam):

- **Los baneos de otras líneas no cambian nada**: quitando todos los
  baneos, el nº1 real sigue siendo el primero no baneado en el 100% de sus
  drafts (96% en los sintéticos); lo único que hacen los de TU línea es
  tachar al que no puedes coger (sin ellos el nº1 enseñado estaba baneado
  en el 19% de sus drafts). De sus 4,4 baneos por partida, 1,8 eran de su
  línea.
- **Los compañeros sí pesan**: sin aliados el nº1 cambia en el 52% de sus
  drafts (59% en los sintéticos), y queda fuera del top 3 real en un tercio.

Así que: el selector de picks es UNA hoja para los dos equipos
(`bandos`/`onBando` en `SelectorDeHeroe`, `hoja` pasa de `enemigos` a
`aliados` sin desmontarse), multi-toque como el de baneos desde 1.28.0,
otro toque quita (`quitar`), el otro bando y los baneados deshabilitados y
el tope por bando (`TOPES`); y el de baneos arranca filtrado a tu línea
(`pool`, «Tu línea (37)» / «Todos»; buscando sale cualquiera). La pista de
la fase de baneos lo dice. Pruebas en `rapido.e2e.mjs`, verificadas por
tres mutaciones (cerrar al elegir, no quitar con otro toque, sin filtro).
Leer el draft de una captura de pantalla se propuso y Javi lo descartó («no
hacen falta pantallazos»): con el selector rápido le basta.

**El orden de las caras (3.17.0)**, `probablesDelBando` en `draft.js`:
cuota de pick × (0,05 + la parte de las líneas del héroe que ese equipo aún
tiene libres, con el reparto de `lineasOcupadas`; para tu equipo, sin tu
línea). Medido en sus drafts reales (`orden-caras.mjs` en el scratch: cada
héroe en el orden en que lo metió, con los anteriores de su bando y sus
baneos): el que salió cae entre las 12 primeras caras (lo que se ve sin
bajar) el 33% de los enemigos y el 45% de los compañeros; posición mediana
23 y 15. Cuota de pick sola (lo de antes): 22% / 14%, mediana 34 / 28.
Variantes probadas y peores: disponibilidad (cuota/(1−ban), la de «por
ver») en lugar de cuota, 31% / 34% (en Gloria se pickea lo que se pickea,
no lo que sobrevive al ban); castigo fijo 0,1 o 0,3 a los de línea
cerrada en vez de la fracción, 30–33% / 32–39%. El 0,05 es un suelo para
que un reparto deducido equivocado no esconda a nadie (sigue en la
rejilla, detrás), no una constante calibrada: con 0,001 da lo mismo. El
orden se calcula en `abrir` (App.jsx) al abrir la hoja o cambiar de
pestaña y NO en cada render: tocar un enemigo cambia las líneas libres y
la rejilla se reordenaría bajo el dedo. Pruebas en `draft.test`
(propiedades) y `rapido.e2e` (la rejilla sigue al motor y no se mueve al
tocar), verificadas por tres mutaciones.

## El material de la interfaz (3.7.0)

Desde 3.7.0 la interfaz sigue el lenguaje visual de iOS 26 («Liquid
Glass»): fondo negro con dos resplandores, superficies translúcidas con
arista de luz (`--line`) y brillo en la arista superior (`--brillo`),
esquinas grandes y CONCÉNTRICAS (`--r` 14 para tarjetas, `--r-sm` 10 para
lo que va dentro, `--r-lg` 20), controles en píldora, letra del sistema
(SF Pro donde la haya; Inter, Segoe o Roboto donde no) con títulos gruesos
y seguimiento negativo, y números con `--font-num` (la variante redondeada)
y cifras tabulares. Los colores son los del sistema en modo oscuro
(amarillo `#FFD60A` como acento único, azul aliado, rojo enemigo, verde,
morado, naranja). Todo está en las variables de `:root` de `styles.css`;
el diagnóstico y el código del perfil siguen en `--font-mono`, porque son
texto preformateado.

Tres decisiones que conviene no deshacer sin medir:

- **Ningún alto, relleno ni hueco cambió respecto a 3.6.0.** Lo que decide
  dónde cae la tarjeta nº1 (`primera-pantalla.e2e.mjs`) y los 32 px de
  toque (`responsive.e2e.mjs`) son los mismos números; el rediseño es de
  material, tipografía y color. Si se cambia un relleno, se vuelve a medir.
- **El desenfoque de fondo (`backdrop-filter`) solo va en lo que FLOTA
  sobre contenido que se mueve**: el pie, la cabecera fija de la maestría
  y el panel del draft en escritorio. En las ocho tarjetas y los chips
  sería un repintado por toque en un móvil de gama media y no se vería,
  porque debajo solo hay el degradado del fondo.
- **Las hojas siguen opacas**: al sol no se leía lo translúcido, y una hoja
  es una pantalla entera (ver el comentario de `.sheet`).

El modo claro (Apple lo adapta al sistema) NO está: el acento amarillo y
los seis colores de término están elegidos para negro y sobre blanco no
aguantan el contraste; hacerlo pide una segunda paleta medida, no una
consulta de medios. Está en «Candidatos descartados».

## Movimiento y tacto (3.22.0)

Pedido: «mejorar la UI con las últimas tendencias en diseño de apps». Lo
que entró es lo que las apps de 2025–2026 hacen en todas partes (iOS 26,
Material 3 Expressive) y que aquí tiene un porqué en el draft, sin tocar
un píxel de alto de lo que decide dónde cae la nº1:

- **Un solo muelle** (`--muelle` en `:root`, un resorte con amortiguación
  0,75 muestreado en `linear()`, sube al 1,028 y se asienta). Las tarjetas
  lo leen de ahí; un navegador sin `linear()` usa `ease`.
- **Las tarjetas se deslizan (FLIP)**: `useDeslizar` (app/componentes)
  mide `offsetTop`/`offsetLeft` (no incluyen transformaciones, así que una
  animación a medias no ensucia la medida) y anima con Web Animations solo
  las que CAMBIAN DE PUESTO; la que entra entre las ocho, con fundido.
  GUARDA medida al escribirlo: al cargar, el ranking con solo el catálogo
  y el de con el meta son órdenes distintos y ocho tarjetas volaban 800
  px. Con otra línea, otro rango o el meta recién llegado (`contexto`) se
  colocan sin animar. La transformación va en la tarjeta, que no tiene
  descendientes `fixed` (las hojas se montan en App).
- **Las hojas entran con `@starting-style`** (24 px y opacidad, 260 ms: poco
  recorrido a propósito, la rejilla se toca nada más abrir) y **se cierran
  arrastrando** desde el asa o el título (`CERRAR_PX` 80, o un tirón de
  `CERRAR_VELOCIDAD` 0,6 px/ms; decisiones de producto, como las de iOS),
  NUNCA desde la rejilla, un botón o un campo. Cierran con la misma
  `onCerrar`, así que el historial se retira igual que con el botón. El
  asa va en el relleno superior (absoluta); el relleno pasa de 16/10 a
  24/22 px.
- **Vibración** (`src/app/tacto.js`, 10 ms): solo desde lo que toca el dedo
  (selector, chips de baneo, ×, nombre de la tarjeta, consejo), nunca desde
  el estado: la limpieza de nombres al cargar cambia el draft y no vibra
  (hay prueba). Interruptor «Vibrar al tocar» junto al idioma, solo si el
  navegador tiene `navigator.vibrate`; se guarda en `roam-picker:tacto`
  (clave NUEVA, sin migración: sin ella, vibra).
- Todo se apaga con «reducir movimiento». `movimiento.e2e.mjs` lo prueba
  con diez mutaciones (sin arrastre, arrastre desde cualquier sitio, sin
  deslizar, sin la guarda de contexto, sin reducir movimiento, animar sin
  cambio de puesto, sin `@starting-style`, el interruptor ignorado o sin
  guardar, la × sin pulso). `primera-pantalla.e2e` da los mismos píxeles
  que en 3.21.1.

**Deshacer (3.23.0)**: «Nuevo draft» (pegado a «Apuntar partida», los dos
del mismo tamaño) y la × vaciaban el draft sin preguntar ni vuelta atrás.
Ahora `vaciarConDeshacer` y `quitarConDeshacer` (useDraft) guardan el draft
de antes y el que dejan, y `AvisoDeshacer` (montado en App, `fixed`, por
encima del pie y por debajo de las hojas; con una hoja abierta no sale)
ofrece «Deshacer» durante `DESHACER_MS` (6 s, decisión de producto; Material
dice 4–10). Solo vale mientras el draft siga siendo el que dejó la acción:
cualquier otro cambio lo anula, porque deshacer entonces se llevaría lo
nuevo. Se prefirió a un «¿Seguro?»: una confirmación cuesta un toque cada
vez que SÍ quieres vaciar, que es casi siempre. El reinicio tras apuntar una
partida (`reiniciar`) NO lo ofrece: deshacer no desapuntaría la partida. La
foto se saca de una referencia al último draft, FUERA del updater.
`deshacer.e2e.mjs`, seis mutaciones. Desde 3.24.1 vaciar un draft que ya
está vacío no ofrece deshacer (salía el aviso sin nada que devolver).

**Sin teclado al abrir el selector (3.24.0)**: `SelectorDeHeroe` enfocaba el
buscador al abrirse, y en Android eso saca el teclado: medido con el
selector de picks, 22 caras visibles a 360×740 sin teclado y 8 con él (26
y 12 a 390×844, 30 y 16 a 430×932, teclado de 330 px). El orden de las caras
de 3.17.0 se midió contando «las 12 primeras, lo que se ve sin bajar». Hoy
solo se enfoca con puntero fino (`(pointer: coarse)` no enfoca); el foco va
a la hoja (`useCerrarConAtras`), así que atrás y Escape siguen igual. Prueba
en `rapido.e2e` con un contexto táctil (`paginaCon({ tactil: true })`),
verificada por mutación. Y el **icono adaptable**: el manifiesto lleva los
dos iconos también con `purpose: 'maskable'`; `compilacion.test` lee el
manifiesto publicado y mide que el dibujo quepa en el círculo seguro (165
de 205 px), dos mutaciones. El contraste de todo el texto se midió en picks,
hoja y baneos (fondo compuesto capa a capa, WCAG AA): ninguno por debajo.

Examinado y NO hecho, con su porqué: la barra de búsqueda de la hoja ABAJO,
en la zona del pulgar (como Safari en iOS 26): cambia la memoria muscular
de Javi en mitad de partidas y con el teclado de Android abierto hay que
medir dónde queda; se reabre si él lo pide. La API View Transitions: con
React hay que envolver cada cambio de estado en `flushSync` y el FLIP hace
lo mismo sin tocar el estado. Contar el número de la probabilidad al
cambiar: un número que se mueve se lee peor con prisa. Una barra apilada
con los términos en la tarjeta: más alto en la nº1 o menos preciso que los
puntos. Esqueletos de carga: instalada, la app y los datos salen de la
caché del instalador al abrir, así que no hay espera que tapar.

**La nº1 asoma en 360×640 (3.38.0)**, pedido: «mejoras, céntrate en UI».
Medido con los altos de cada bloque en picks (1v0, 3v1, 5v4): la tarjeta
nº1 empezaba en 655–687 px de 640 y queda en 555–590 (390×844: 607–623 →
551–570). Lo que se quitó no decía nada nuevo: la composición pintaba un
«✓» por cada cosa cubierta (dos filas, 80 px; ahora solo «sin …», 56–59);
«Leer solo» iba en la fila de botones y a 360 la partía en dos (92 → 44 px;
va en «Ajustes» en picks, en la fila en baneos, y la línea de estado de la
última lectura sigue fuera); y la nota de la estimación llevaba en dos
líneas la advertencia de que es un modelo (pasa a la leyenda de «Ver por
qué», `leyenda.modelo`). `primera-pantalla.e2e` exige ahora que en
360×640 la nº1 ASOME (`top < alto`) y que la composición no pinte «✓». Y
el selector pone al final los héroes que no se pueden tocar (otro bando,
baneados): ocupaban caras de las doce primeras, que es donde se midió el
orden de 3.17.0 (`rapido.e2e`). Tres mutaciones.

**Los huecos del draft (3.59.0)**, pedido: «mejoramos la UI… hace mucho que
no repasamos la interfaz». Con ○ + cara + × en fila, a 360 px la cara se
quedaba en 22 px y se cortaba. Hoy la cara (30 px) ES el botón de marcar al
rival en los enemigos (`.mark.slot-cuerpo`, todo el hueco menos la ×), y el
relleno vertical baja de 6 a 4 px para que el hueco siga en 38 (4 + 30 + 4):
la nº1 baja 4 px (360×640: 589–594 de 640). Se probó la × como insignia en
la esquina (como iOS) y no entró: su caja de 32 px tapaba media cara (marcar
al rival quitaba al héroe) y pisaba el texto de encima. Lo que puso el
lector lleva un punto verde (`.slot.leido`, de `draft.lectura`). Los
plegables (`.more`, `.equipo`) llevan una flecha que gira. Prueba en
`pick.e2e` (punto, tamaño, marcar/desmarcar, la × no marca), tres
mutaciones. Desde 3.60.1 el punto no sale en lo metido A MANO (`draft.aMano`,
en memoria: quitado y vuelto a meter, el nombre sigue en `lectura` para que
el lector no lo meta otra vez), el consejo «si tú vas con X» va tras la
tarjeta de X aunque «Sinergia» la mueva (`trasDe`; si X no está entre las
ocho, tras la primera) y «Sinergia» se apaga sin compañeros. Prueba en
`pick.e2e`, tres mutaciones.

**Las hojas en las dos fases (3.60.2)**: desde 3.60.2 la maestría, las
partidas, Meta, el perfil, Plan y objetos y el Diagnóstico se montan en
baneos y en picks (`hojas` en App.jsx, en el mismo hueco del árbol), como
ya pasaba con el aviso y el selector.
- Una partida apuntada sola reinicia a baneos. Antes cerraba la hoja que
  usabas y se perdía lo escrito.
- Apuntada sola solo cierra los selectores del draft.
- Cambiar de línea suelta un pick fijado a mano que no se juega en ella
  (`cambiarLinea`). Uno leído (`miPickLeido`) se queda.
- `pedirPublicada` corta a los `PLAZO_PUBLICADA_MS` (4 s).

Pruebas en `lector.e2e`, `pick.e2e` y `app/publicada`.

**La segunda pasada (3.59.1)**: los motivos y la frase de «detrás» van en
una segunda fila de la tarjeta que ocupa las dos columnas (`.pick-abajo`,
`grid-column: 2 / -1`), con «Plan y objetos» al pie a la derecha: a 390 px
las ocho tarjetas pasan de 2.978 a 2.840 px. Se probó `display: contents`
en la lista para que botón y motivos compartieran fila y salió peor (2.948).
La hoja de Plan y objetos lleva `.build-saltos` (fijo arriba, con
desenfoque porque flota sobre texto que se mueve): los objetos empezaban a
1.118 px en una pantalla de 844. Y la coma decimal en español va en el
TRADUCTOR (`decimal` en `crearT`): un parámetro que es solo un número con
un punto («57.1», «−4.5», 0,5) sale con coma; una versión «3.58.1» o
«2.268 partidas» no se tocan. Pruebas en `pick.e2e`, `plan.e2e` e
`i18n.test`, cuatro mutaciones (la del ancho sobrevivía con un umbral de
180 px; medido: 278 a lo ancho, 183 en la columna).

**La pantalla de baneos (3.59.2)**: los diez huecos en una rejilla de
cinco columnas (`.side.bans .slots`): con `flex-wrap` a 390 px salían seis y
cuatro. El tachado va en `.slot-name`, no en el hueco: la decoración se
hereda a la × y no se puede quitar desde ella (y no sale en su estilo
calculado: la prueba mira el hueco). La cara del baneado, en gris. Prueba en
`fases.e2e` a 320, 390 y 430, dos mutaciones.

## Los idiomas

Español e inglés, en `src/app/i18n/` (`es.js`, `en.js` y el traductor). Lo importante: **los motivos que salen en
las tarjetas NO son frases dentro del motor**. `reglas.js` guarda una CLAVE en
`why`, el motor devuelve `{ clave, params }` y traduce la interfaz. Si añades
una regla, añade su clave a los DOS idiomas: hay una prueba que falla si un
idioma se queda a medias, y otra que comprueba que toda clave usada existe.

La identidad de un motivo ya no es su texto sino `idRazon()` (clave + a quién
señala). El filtro de motivos comunes y el dedupe dependen de eso.

**La API dice que acepta 17 idiomas y devuelve inglés en todos.** Comprobado
sobre los 152 objetos (`lang=es` da 0 nombres distintos de `lang=en`) y sobre
las habilidades de un héroe. Traducir los nombres de objeto significaría
escribirlos a mano, y ahí un error no es cosmético: te manda a comprar otra cosa
en mitad del draft. Por eso los objetos llevan icono, que es lo que se reconoce
en cualquier idioma. Si algún día se escriben, que sea con nombres confirmados
por quien juega en español, no adivinados.

Los NOMBRES de héroe no se traducen en pantalla: son la clave de todos los
datos, y enseñar "Cíclope" mientras el motor busca "Cyclops" es justo el fallo
invisible que ya costó una corrección. Lo que sí acepta los dos idiomas es la
BÚSQUEDA, con `src/motor/alias.js`. Javi juega con el móvil en español y
escribía "Cíclope" sin encontrar nada. Un alias no envejece con los
reequilibrios, pero solo se apunta lo comprobado: uno equivocado saca el héroe
de al lado, que es peor que no tenerlo. Hay una prueba que comprueba que cada
alias apunta a un héroe real, que ninguno pisa el nombre de otro y que el
buscador de verdad los usa.

El diagnóstico (`motor/diagnostico/`) sigue en español a propósito: es depuración.

## Las novedades en la app

Desde 1.30.0 la versión del pie abre el CHANGELOG (`scripts/changelog.mjs`,
metido en `__CHANGELOG__` al compilar). Es el MISMO fichero que exige
`comprobar/version.mjs`: no hay que escribir las novedades dos veces ni pueden
desincronizarse. Formato: `## X.Y.Z` y viñetas `- ` con continuación
indentada; el resumen es la primera frase de cada viñeta, así que escribe
primero QUÉ cambia y después el porqué. Hay una prueba de que la primera
entrada es la versión de `package.json`.

Y un detalle de los bots: un push hecho con `GITHUB_TOKEN` NO dispara
`on: push`. Por eso `deploy.yml` escucha por `workflow_run` a los bots
que commitean datos; si añades otro bot que commitee, ponlo en esa lista o
lo suyo no se publica hasta el siguiente push de código (pasó con
`pro.json`: 304 partidas en el repositorio y cero en la app).

## Saber qué versión estás usando

Desde 1.13.0. El service worker guarda la app ENTERA y los datos se refrescan
por su cuenta (`StaleWhileRevalidate`), así que se puede acabar con los datos de
hoy y la app de hace dos versiones. Pasó, y el diagnóstico decía «todo correcto»
porque todo lo que comprobaba estaba bien: solo que comprobaba una app que ya no
era la publicada.

`vite.config.js` emite un `version.json` diminuto en cada compilación, la app lo
pide con `cache: 'no-store'` antes del diagnóstico y `motor/diagnostico/` compara. Si no
hay red no avisa: no poder preguntarlo no es un problema. NO lo metas en la
precarga ni bajo `/data/`, o se serviría de caché y diría siempre que estás al
día, que es peor que no comprobarlo.

Desde 1.15.0 además se actualiza sola: la app pregunta al volver a primer plano
y **se recarga cuando el worker nuevo toma el control** (`controllerchange`).
Ese es el mecanismo imprescindible —comprobado en un navegador de verdad,
publicando una versión nueva con la pestaña abierta: quitándolo, no se
actualiza—. El `visibilitychange` es el refuerzo para cuando la pestaña lleva
horas dormida y el navegador no comprueba por su cuenta; en la prueba no se
distingue, porque ahí el navegador ya revalida solo. La recarga lleva pestillo:
sin él, un navegador que reinstale el worker podría dejarla en bucle.

Los datos van con `StaleWhileRevalidate`: la primera respuesta es la de la
caché y lo nuevo llega a la caché DESPUÉS. Por eso desde 3.60.5
`useDatos` vuelve a pedir `roam-meta.json` a los `RELEER_DATOS_MS` (5 s) y,
si su huella (`huellaDeDatos`: las tres fechas) cambia, lo usa. No se pasó
a `NetworkFirst` porque con poca cobertura la app tardaría segundos en
abrir al empezar un draft. Prueba en `hojas.e2e` (`sinServiceWorker`: las
peticiones del service worker no pasan por `route`).

Recargar es seguro porque el draft, la maestría y las partidas se guardan en
`localStorage` en cada cambio. Si algún día se añade estado que NO se guarde,
esto hay que revisarlo antes.

## Llevarse los datos a otro dispositivo

`src/motor/perfil.js`. El almacenamiento del navegador va por dispositivo, así
que la maestría no viaja sola. NO se ha montado una base de datos con códigos
por persona: haría falta un servidor -la app es estática en GitHub Pages-,
alguien pagándolo, y convertiría a Javi en responsable de datos de otras
personas. Todo eso para mover kilobyte y medio.

En su lugar, los datos van DENTRO del código: JSON, gzip si el navegador sabe, y
base64url, con marca de versión delante y suma de control detrás. Unos 500
caracteres. La promesa de "tus datos no salen de tu móvil" sigue siendo cierta:
salen porque los saca él.

Al importar se FUNDE, nunca se reemplaza (`fundirPerfil`): de cada héroe gana la
copia con más partidas y las partidas se juntan sin duplicar; en el empate
gana la que trae fecha (3.14.0). NO gana «la más reciente» aunque las dos
tengan `desde`: se probó en 3.14.0 y la prueba de navegador lo tumbó, porque
la fecha la pone también la app sola (`fecharMaestria`, 3.13.1) y dice cuándo
la vio ESE dispositivo, no cuándo se copiaron los números del juego: un móvil
con 10 partidas de Diggie fechado después borraba las 3.821 del otro. Por eso
una errata a la alta (5640 donde era 564) no se corrige sola en
`historial/partidas.json`; si pasa, se edita el fichero a mano. Sin eso, pegar un
código viejo en el dispositivo bueno borraría la maestría de verdad. Hay una
prueba que lo comprueba EN LAS DOS DIRECCIONES: la primera versión solo miraba
la fácil y pasaba aunque se quitara el mecanismo entero.
