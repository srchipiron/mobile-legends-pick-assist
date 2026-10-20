---
paths:
  - "scripts/lector/**"
  - "src/app/lector.js"
  - "src/app/estado/useDraft.js"
  - "src/app/componentes/BotonLector.jsx"
  - "src/motor/directo.js"
  - "pruebas/scripts/*lector*.mjs"
  - "pruebas/scripts/aprender.test.mjs"
  - "pruebas/scripts/recortes.test.mjs"
  - "pruebas/app/lector*.mjs"
  - "pruebas/app/lectura-draft.test.mjs"
  - "pruebas/interfaz/lector.e2e.mjs"
---

# El lector de la tablet y la voz

Se carga al tocar el lector, la voz o lo que aplica sus lecturas al draft. La SEGURIDAD de la cuenta de Javi manda sobre todo lo demás.

## Leer la pantalla del juego (3.19.0, picks en 3.21.0)

Javi juega en la TABLET y usa la app en el MÓVIL. `scripts/lector/` lee
los diez baneos y los cinco picks ENEMIGOS de la pantalla del draft desde
Termux, por depuración inalámbrica (`adb exec-out screencap -p`). Desde
3.25.0 también desde un botón de la app (ver «El botón "Leer del juego"»
abajo), a petición de Javi antes de probarlo en su tablet: se aprende de
sus partidas.

- **SEGURIDAD, no negociable**: su cuenta vale dinero. El lector solo hace
  `adb connect` y `adb exec-out screencap -p` (o `screencap` sin `-p`, la
  misma captura sin comprimir, desde 3.45.0): nada de `input tap`,
  `shell`, `install`, ni rutas `/api/user/*` de la API. Tocar la pantalla
  por adb sería automatizar el juego (bot). La prueba de seguridad de
  `lector.test` va por FORMA desde 3.21.0 (la de 3.19.0 buscaba texto y se
  saltaba con un alias en el import, con `cp['execFileSync']` o partiendo
  'input', 'tap' en dos argumentos): solo `leer.mjs` importa
  `child_process`, exactamente `{ execFileSync }`, con dos llamadas
  permitidas, ningún literal de mandato de adb peligroso en toda la carpeta
  (subcarpetas incluidas). Cinco mutaciones.
- **Las caras de referencia son la cara del juego ACTUAL que da la API**
  (`hero.data.head`, un PNG del cliente; la ingesta la guarda como `cara`
  junto a `retrato` desde 3.21.0, buscando el objeto que lleva `heroid`, y
  la conserva con la ficha caída). NO el `retrato`: ese es de la web de
  Moonton y tiene el arte VIEJO de los rehechos. Medido con sus capturas:
  retrato de la web 35 de 40; caras recortadas de sus capturas 54 de 54
  pero sin 18 héroes; cara del juego de la API **177 de 178, cero errores**
  (el único «no sé», Argus a 0,75). Un acierto va de 0,75 a 0,99, el mejor
  equivocado 0,60 (baneos y rejilla) y 0,72 (panel de picks vacío o con
  skin): `PARECIDO_MINIMO = 0.80`. Su tercer baneo «que nadie reconocía» era
  Masha, rehecha en 2.2.16 (0,974). `sacar-caras.mjs` rehace `caras.json`
  de las URL de `roam-meta.json` y guarda la fuente de cada cara; el lector
  avisa si alguna se queda atrás (héroe nuevo o rehecho). NO hay prueba de
  que estén todas: un héroe nuevo llegaría con los datos del bot y tumbaría
  el despliegue.
- **Los picks enemigos**: el dibujo de la derecha es esa misma cara,
  AMPLIADA y en ESPEJO (centro al 54,7%/48,6% del hueco, radio 34,3% del
  alto; Clint 0,98, Khufra 0,93). La búsqueda es más ancha que en los
  baneos (±5 pasos, escalas 0,88–1,12): cada dibujo encuadra la cara en
  otro sitio. Solo mientras se elige: en la fase de skins no casa (máximo
  0,66) y sale «?». Los de TU equipo no se leen: se ven con la skin de cada
  uno (ninguno pasaba de 0,72), y la geometría de ese panel no está medida.
- **Tal cual Y en espejo (3.31.0)**: en la captura de Javi del 1 de octubre
  de 2026 (fase de picks, 2400×1504, la primera entera que mandó) Rafaela,
  Eudora y Gloo iban SIN reflejar y Lesley y Aamon reflejados, en la misma
  pantalla. Comparando solo en espejo (3.21.0–3.30.1) salían 2 de 5; con
  `ambasOrientaciones`, 4 de 5 (Gloo a 0,80 por un pelo: su cara cae 47
  px por encima del centro del hueco y la búsqueda alcanza ±23) y en los
  tres huecos vacíos de la captura de Clint lo más parecido queda en 0,74.
  Buena parte de los «?» de la tarde del 1 de octubre eran esto, no solo
  el aprendizaje torcido. `picks-enemigos-2.png` es ese recorte.
- **TU equipo también se lee (3.31.0)**, y con las skins: `ALIADOS` en
  leer.mjs, cinco filas de 216 px desde y = 228 con la cara alrededor de
  (165, 321 + 216·i), r ≈ 72, pero cada skin la encuadra en otro sitio (x
  124–173, r 67–98), así que `leerAliados` busca ±5 pasos de r/8 (misma
  llegada que ±8 de r/16 por la mitad de tiempo: 1,3 s aquí frente a
  2,6; a r/6 con ±4 se pierden dos) y hasta 1,25 de escala. Medido en esa
  captura con las dos orientaciones: Clint 0,92, Guinevere 0,92, Novaria
  0,87, Leomord 0,94, Estes 0,89; en 3.21.0 «ninguno pasaba de 0,72»
  porque se comparaba solo en espejo. **Tu fila es la del nombre en
  amarillo** (`filaPropia`, `NOMBRES_ALIADOS`, `fraccionAmarilla`): en su
  captura el 10,7% de la caja de la quinta fila frente al 0,7–1,7% de las
  otras; se exige `AMARILLO_MINIMO` 0,05 y el doble que cualquier otra
  fila, si no, −1 y la app NO mete a nadie como compañero (uno de ellos
  serías tú). El lector devuelve `aliados`, `tuyoFila` y `tuyo`;
  `nombresDeLectura` saca los compañeros de las otras cuatro filas y
  `aplicarLectura` fija tu pick (`miPickLeido` en el draft: una lectura
  posterior puede cambiarlo, uno fijado a mano no se toca) y lo quita de
  los compañeros. `aliados.png` es el recorte de ese panel con los
  nombres de los otros jugadores tapados; el amarillo de la prueba es
  sintético (trazos al 12%). Cuatro mutaciones en el lector (solo
  espejo, sin mínimo de amarillo, sin «el doble que el resto», alcance
  corto) y dos en el navegador. La lectura entera pasa de ~1,2 a ~3,1 s
  aquí (baneos 0,55, enemigos 1,2, equipo 1,3): en el móvil, 12–18 s por
  lectura leyendo solo; se espacian solas.
- Todo en JavaScript puro (`png.mjs`: RGB/RGBA/gris/paleta, 8/16 bits,
  entrelazado Adam7, con una imagen entrelazada REAL de la API en las
  pruebas porque escritor y lector comparten la tabla Adam7), porque en
  Termux no hay navegador ni librerías de imagen: ~1 s por captura en el
  contenedor. La posición de todo está medida a 2400×1504 y se escala con
  la resolución. `leer.mjs` se ejecuta también por un enlace o desde una
  carpeta con espacios (antes no hacía nada y salía con 0).

**El botón «Leer del juego» (3.25.0)**, la variante (a) del puente local de
abajo: `scripts/lector/servir.mjs` en Termux, en el MÓVIL, escucha SOLO en
`127.0.0.1:47323` (`PUERTO`, el mismo que `PUERTO_LECTOR` de
`src/app/lector.js`; hay prueba), hace la misma captura de `leer.mjs`
(`capturarTablet`, exportada: servir.mjs no lanza programas, la prueba de
seguridad lo sigue exigiendo para toda la carpeta) y devuelve NOMBRES, nunca
la imagen. Solo contesta con datos a la app publicada y a su copia local
(`origenPermitido`); a otra web, 403 sin cabecera CORS; la comprobación
previa lleva `Access-Control-Allow-Private-Network`. En la app,
`pedirLectura` (tipos de fallo `sinPuente`/`plazo`/`captura`/`error`, cada
uno con su frase de qué hacer) y `nombresDeLectura` (grafía del catálogo,
sin «?») alimentan `aplicarLectura` (useDraft), que SOLO AÑADE (la captura
real trae a Hirara en los dos lados: con `alternarBaneo` el segundo la
quitaba), no toca lo que está en otro bando, pasa a picks si entran
enemigos y deja «Deshacer» (`tipo: 'leido'`). **El aprendizaje**: el draft
guarda `lectura` (unión de lo leído, en `roam-picker:draft`) y la partida
apuntada la lleva como `lector` (`sanearLectura` en registro.js, también en
`sanear` del perfil); `aciertosDelLector` mide de lo leído cuánto seguía en
el draft al apuntar, y qué nombres hubo que quitar (`fallos`): sale en
`medir-mias.mjs` (la respuesta del bot) y en el diagnóstico. Con eso se
decide qué afinar (caras, posiciones, `PARECIDO_MINIMO`) con datos de su
tablet, no a ojo; `--guardar-capturas` deja las capturas que falten para
reproducirlo. NO medible desde aquí: el permiso de red local en Chrome para
Android (la prueba de navegador corre de 127.0.0.1 a 127.0.0.1, sin
permiso). Si al primer uso dice «No encuentro el lector» con Termux
abierto, es eso. Pruebas: `puente-lector.test` (servidor), `app/lector.test`,
`registro.test` y `lector.e2e` (la app con el servidor de verdad en su
puerto y la captura real compuesta en `pruebas/fixtures/juego/captura.mjs`),
verificadas por ocho mutaciones. Los tres botones de `.tools` caben en una
fila a 320 px (`flex-basis` 84 px). Al mutar, la prueba de navegador se
quedaba COLGADA: una comprobación fallaba antes de cerrar el servidor de
prueba y el proceso de Node no terminaba nunca; hoy el cierre va en
`finally` y otra vez al final. Un servidor abierto en una prueba se cierra
pase lo que pase, o un fallo se convierte en una corrida que no acaba.

**La primera prueba real y lo que enseñó (1 de octubre de 2026, 3.26.0)**.
Javi lo montó en su móvil con la tablet en `192.168.5.161`. Lo que pasó,
por orden, y lo que se cambió por cada cosa:

- La app llegó al lector a la primera: Chrome para Android dejó pasar la
  petición de la web publicada a `http://127.0.0.1:47323` (no dijo si
  hubo aviso de permiso; la petición entró). Lo que no se podía medir
  desde aquí, medido.
- `adb` daba «device offline» hasta hacer `adb pair` una vez; después
  `adb devices` decía `device` y la captura salió a 2400×1504 (la
  resolución medida). Con la tablet fuera del draft todo sale «?», que
  es lo esperado.
- **El puerto de «Dirección IP y puerto» cambió TRES veces en una tarde**
  (43593, 34995, 45199: cada vez que se apaga y enciende la depuración
  inalámbrica) y Javi lo escribía a mano en Termux cada vez, «un coñazo»
  e «incomodísimo». Y **el lector viejo seguía vivo en otra sesión de
  Termux** contestando a la app con el puerto que ya no valía: «El puerto
  47323 ya está en uso» y en la app «no llega a la tablet» hiciera lo que
  hiciera. Un servidor que se queda atrás con un dato caducado es peor
  que ninguno.
- Por eso 3.26.0: **el lector encuentra la tablet solo** (`encontrarTablet`
  en leer.mjs, `scripts/lector/tablet.mjs`): primero la última que
  funcionó (`~/.config/lector/tablet.json`, ip y puerto), luego las que
  anuncia la wifi por mDNS (`_adb-tls-connect._tcp`, con el bit QU para
  que la respuesta llegue unicast aunque el wifi filtre multicast: es lo
  que hace `adb mdns services`, pero **el adb de Termux viene compilado
  SIN mDNS**, `ANDROID_TOOLS_ADB_ENABLE_MDNS` apagado en nmeum/android-tools,
  así que la pregunta DNS de 45 bytes se manda desde Node), y si nadie
  contesta pero se sabe la IP, los puertos abiertos del rango efímero de
  Android (32768–60999, donde cayeron los cuatro vistos; 28.000 puertos en
  ~2 s en local, más en wifi); cada candidata se comprueba con
  `adb connect` y «failed to authenticate» se distingue como «falta
  emparejar». `capturaAutomatica` (servir.mjs) la busca al arrancar
  (`preparar()`, una sola búsqueda compartida con el primer toque) y, si
  una captura falla, la olvida y la busca otra vez antes de rendirse. La
  app recibe tres fallos de captura distintos (`tablet`, `emparejar`,
  `captura`), cada uno con qué hacer. Y `scripts/lector/lector.sh`
  (mandato `lector`, se instala solo; acceso directo para Termux:Widget y
  arranque con Termux:Boot si están) hace lo que había que escribir: se
  pone en el repositorio, `git pull`, mata el lector anterior y arranca
  este guardando capturas en `~/capturas`. La prueba de seguridad mira
  también los `.sh`: no llaman a adb. Catorce mutaciones. Sin comprobar
  en su móvil todavía: que el mDNS conteste desde Termux (si no, entra
  el escaneo con la IP recordada: la primera vez hay que decírsela con
  `lector --tablet 192.168.5.161`, o con el puerto, y ya se recuerda).
- Para probar sin clasificatoria: en su versión Personalizado solo deja
  meter IA en coliseo y clásica, no en selección de draft; la clásica
  tiene picks (sin baneos) y vale para medir esa mitad.

**El lector aprende de las correcciones (3.27.0)**, pedido por Javi tras la
primera partida («que el programa cruce el pantallazo con los picks que yo
voy corrigiendo a mano y aprenda»). Cómo va:

- Cada lectura lleva `id` (el nombre de su captura en la carpeta) y el
  draft los guarda en `lectura.ids` (`sanearLectura`, hasta 20; NO viajan
  en la partida ni en el perfil: son ficheros del móvil). Cuando el draft
  se completa (`completoDesde`, una vez por draft) y al apuntar la
  partida, `corregirLectura` (src/app/lector.js) hace `POST /corregir`
  con ids, enemigos y baneos finales; nunca lanza y sin ids o sin enemigos
  no pide nada.
- `servir.mjs` guarda la verdad junto a cada captura nombrada
  (`<id>.verdad.json`, solo ids con forma `lectura-…` que existan en la
  carpeta: nada de rutas), aprende de las ÚLTIMAS `CAPTURAS_POR_CORRECCION`
  (3: las últimas de un draft tienen más picks) en un hilo aparte
  (`aprender-tarea.mjs`, `worker_threads`: unas decenas de segundos por
  captura en un móvil y el botón tiene que seguir contestando), una tanda
  a la vez, y guarda `~/.config/lector/aprendido.json` (`version`, `picks`,
  `caras`, `capturas`). Sin cabecera `Origin` no se escribe nada.
- `aprender.mjs` (puro): para cada enemigo de la verdad que la geometría
  de ahora NO lee, `buscarCara` recorre el quinto derecho de la pantalla
  (rejilla a r/4, cinco tamaños, cara tal cual y en espejo a la vez,
  afinando alrededor de las 8 mejores cimas: con una sola cima el máximo
  grueso de otro héroe tapaba al bueno y Khufra se quedaba en 0,75) y
  entra si llega a `APRENDER_MINIMO = 0.78` (por encima del peor
  equivocado medido, 0,72) y ningún otro héroe se le parece a menos de
  `MARGEN_SOBRE_OTRO` en ese sitio. De cada hallazgo salen un recorte
  (`caras[nombre]`, los dos últimos, en la orientación de la pantalla:
  `leerPicksEnemigos` los suma SIN espejo) y la posición;
  `ajustarPosiciones` desplaza el panel ENTERO (mediana) y conserva el
  espacio entre huecos: con dos hallazgos vecinos una recta amplificaba
  20 px de error a 60 en el quinto hueco y lo perdía (medido); solo con
  tres huecos distintos se reajusta, acotado al ±10%. Medido con la
  captura real y la columna movida 60×90 px: antes «?,?,?,?,?», después
  Clint y Khufra; Layla (no está) no se aprende y se pide su captura.
- Pruebas: `aprender.test` (desplazamiento, solo-cara-aprendida con la
  cara de la API cambiada como en un rework, umbral, posiciones, el hilo
  de verdad), `puente-lector.test` (`/corregir`: verdad en disco, últimas
  tres, lo aprendido manda en la siguiente lectura y se acumula, 403 sin
  origen), `app/lector.test`, `registro.test` (ids saneados) y
  `lector.e2e` (al apuntar, el lector recibe la corrección con el id de la
  captura y los enemigos finales). Catorce mutaciones; la decimotercera
  («leer sin las caras aprendidas») pasaba con solo desplazamiento y pidió
  el caso del rework.
- **La primera tarde entera con 3.26.0 (27 lecturas, cuatro drafts)**: los
  picks enemigos SÍ se leen mientras se elige (Minsitthar, Vexana,
  Fredrinn, Beatrix en un draft; Fredrinn y Clint en otro); el primer
  draft con todo «?» era cuestión de cuándo se tocaba (sin picks aún, o en
  skins). Y los DOS equipos pueden banear al mismo héroe (Belerick en los
  huecos 5 y 6, Atlas en el 4 y el 6, como Hirara en la captura de la
  prueba): `sinRepetidos` (3.27.1) solo quita repetidos DENTRO de los
  cinco de un equipo, nunca entre lados; la primera versión los cruzaba y
  la prueba con la captura real la tumbó.
- **Leer solo (3.28.0)**, pedido por Javi («quiero preocuparme de jugar y
  que todo lo demás se haga solo, solo teniendo la app abierta»):
  `lectorAuto` en `useAjustes` (`roam-picker:lector-auto`, clave NUEVA,
  apagado por defecto: encendido para todo el mundo haría una petición
  fallida a 127.0.0.1 cada pocos segundos y, en Chrome, el aviso de red
  local a quien no tiene lector). `tocaLeerSolo` (src/app/lector.js, con
  prueba) decide: modo encendido, app a la vista (`visibilityState`), sin
  hoja abierta (se está tocando a mano) y draft sin completar (con cinco
  enemigos y cuatro compañeros ya no hay nada que leer y seguir
  capturando durante la partida gasta por nada). `INTERVALO_AUTO_MS` 5 s
  (una lectura tarda 4–6 s en el móvil: va una tras otra sin acumularse) y
  `INTERVALO_AUTO_VACIO_MS` 12 s con el draft vacío (buscar si ha empezado
  uno), decisiones de producto. El efecto espera al catálogo (sin él los
  nombres no resuelven a nadie: la primera versión leía antes y la prueba
  lo cazó) y no repite una lectura si acaba de haber una (`ultimaLectura`:
  la primera lectura cambia el draft de vacío a lleno y rearma el efecto).
  Leyendo solo los fallos no sacan aviso: quedan en `lector.ultimo` y la
  línea `.lector-estado` dice qué pasó con la última lectura. Y una
  lectura que no añade nada NO se lleva el «Deshacer» de la anterior
  (`aplicarLectura` lo reapunta al draft nuevo): cada 5 s habría anulado
  el deshacer antes de poder tocarlo. **Lo leído viaja con la partida**:
  `lectura.dudas` (los huecos sin reconocer de la ÚLTIMA lectura, con
  candidato y parecido; `dudasDeLectura`) y `lectura.aprendizaje` (lo que
  contestó `/corregir` al completar el draft; `anotarAprendizaje`), ambos
  saneados en `sanearLectura` y agregados por nombre en
  `aciertosDelLector` (`dudas`, `aprendidos`, `sinEncontrar`): salen en
  `medir-mias.mjs` (la respuesta del bot a cada subida) y en el
  diagnóstico. Así no hay que copiar nada de Termux: las partidas se suben
  solas (3.10.0) y cualquier sesión puede leer `historial/partidas.json`.
  Pruebas: `app/lector.test`, `registro.test`, `partidas.test` (informe) y
  `lector.e2e` (lee sin tocar nada, el «Deshacer» sobrevive a una lectura
  vacía, el interruptor se recuerda). Siete mutaciones.
- **Apuntar el resultado solo: la vigilancia TEMPORAL del final de la
  partida (3.29.0 → 3.30.0)**. Javi preguntó si el lector puede leer
  VICTORIA/DERROTA de la tablet. Se puede, pero esa pantalla no está
  medida (ninguna captura suya). 3.29.0 puso dos botones para mandar la
  pantalla a mano y Javi los rechazó el mismo día («intenta siempre
  automatizar todo, que yo no tenga que hacer nada»): en 3.30.0 no hay
  botones. Con «Leer solo» y el draft completo, desde `DESDE_FINAL_MIN`
  (8: antes es jugar, y una captura en una teamfight puede dar un tirón en
  la tablet) hasta `HASTA_FINAL_MIN` (25) la app pide cada
  `INTERVALO_FINAL_MS` (30 s) `GET /captura?fotograma=1`; el lector
  (`fotogramaDe` en `scripts/lector/miniatura.mjs`) reduce a 160 px,
  compara con el fotograma anterior (`diferencia`, media por canal;
  `CAMBIO_MINIMO` 12 de 255) y solo cuando la pantalla CAMBIA devuelve la
  miniatura y la franja de arriba (28% del alto, a 320 px, tope 20.000
  caracteres) y guarda la captura entera como `fotograma-<id>.png`. La
  app las acumula (`MAX_FOTOGRAMAS` 8, en un ref) y las vuelca
  (`volcarFotogramas`) al apuntar la partida, con el resultado, o al
  dejar de estar completo el draft (nuevo draft), sin él: una incidencia
  nueva con etiqueta `pantalla` (`cuerpoDeFotogramas`: miniaturas en el
  cuerpo, franjas en un comentario, cada mensaje bajo `TOPE_MENSAJE`
  60.000; `subirAparte` en useEnvio, con el token que no sale de ahí).
  Es lo ÚNICO que sale del lector como imagen: reducido, a petición de
  Javi, a su repositorio público, y la pantalla de resultado lleva los
  nombres de los diez jugadores. Las miniaturas van en base64 como TEXTO
  porque la API no admite adjuntos y un mensaje admite 65.536
  caracteres; paleta 6×7×6 (252 colores) y cajas promediadas
  (`reducir`, `cuantizar`, `pngQueQuepa` parte el ancho hasta caber).
  Para leerlas desde una sesión: `issue_read`, decodificar a PNG y
  mirarlas con Read. Con una ganada y una perdida se mide el cartel
  (dónde, color, en qué otras pantallas sale) y entra el lector del
  resultado; entonces esta vigilancia y la ruta se quitan. Pruebas:
  `puente-lector.test` (cambio/no cambio, la ruta recuerda el anterior,
  tamaños, 403 sin origen) y `app/lector.test` (cuándo se vigila, la
  petición, el cuerpo que cabe); el volcado al apuntar no tiene prueba
  de navegador (son 8 minutos de reloj). Siete mutaciones. Y un fallo que
  destapó: el `keepAliveTimeout` de Node (5 s) coincidía con el ritmo de
  «Leer solo» (5 s) y con el bucle ocupado daba ECONNRESET en una
  conexión reutilizada; hoy el lector lo pone a 65 s.
- **El resultado se lee de la tabla y la partida se apunta sola (3.32.0)**,
  con los cuatro fotogramas que subió la vigilancia de 3.30.0 el 1 de
  octubre de 2026 (incidencias #14–#17, franjas de arriba a 320 px): el
  final pasa por VARIAS pantallas (la tabla «28 DEFEAT 25», azul, con las
  palabras en inglés aunque el juego vaya en español; la de estrellas de
  rango; la de estadísticas «Primera Fase de Bloqueo»), y a 30 s se cazaba
  una cualquiera: `INTERVALO_FINAL_MS` baja a 10 s. `scripts/lector/
  resultado.mjs` (puro): la PALABRA va en x 33–67%, y 3–12% de la pantalla
  (`ZONA_PALABRA`, en fracciones de la franja); entre pantallas distintas
  esa zona correlaciona 0,36–0,64, la misma franja desplazada 1 px 0,87 y
  2 px 0,78 → búsqueda ±`DESPLAZAMIENTO` 2 px y `RESULTADO_MINIMO` 0,85
  con `MARGEN_RESULTADO` 0,10 sobre el otro resultado. La PUERTA es
  `esTabla`: la cabecera SIN la palabra (`vectorCabecera`) tiene que
  parecerse a una tabla conocida a `TABLA_MINIMA` 0,70 (las otras tres
  pantallas dan −0,04, 0,46 y 0,37); sin ella, la de estadísticas de una
  derrota se aprendería como derrota y daría por perdida la victoria
  siguiente. Solo se reconoce y solo se APRENDE en la tabla. De serie va
  la derrota de #15 (`scripts/lector/tabla-derrota.png`, 320×56 con lo de
  debajo de la cabecera tapado: nombres de otros jugadores); la victoria
  llega con `POST /resultado` (ids de fotogramas + `gane`, lo que Javi
  contesta o lo que se apuntó solo), que quita las plantillas del OTRO
  resultado que se parezcan (una contestación contraria corrige) y guarda
  `~/.config/lector/resultados.json` (`VERSION_RESULTADOS`). La app: el
  fotograma trae `tabla`, `resultado` y `resultadoParecido`; con
  `resultado`, `apuntarSola` apunta UNA vez por draft (`apuntadaSola`,
  `origen: 'lector'` en la partida, que `apuntar` y `sanear` conservan)
  con `AvisoDeshacer` de tipo `apuntada` durante `DESHACER_APUNTADA_MS`
  (20 s: nadie lo esperaba) que olvida la partida y devuelve el draft
  (`draft.foto()` / `restaurar`). Lo que NO está medido: una segunda
  tabla real (otros marcadores, otro reloj) contra la cabecera de serie,
  y la de VICTORIA; si `esTabla` queda corto, no pasa nada automático y
  Javi sigue contestando (fallo seguro); si se aprende algo mal, su
  siguiente Gané/Perdí lo quita. Cinco mutaciones en el módulo. La
  vigilancia de 3.30.0 (subir fotogramas al proyecto) sigue: es como se
  mide esto. Desde 3.33.0 el apuntado automático SÍ tiene prueba de
  navegador (`lector.e2e`, con los plazos del lector encogidos).
- **La vigilancia del final, en la app, que no está a la vista mientras
  se juega** (3.30.0 → 3.33.0, tres partidas el 2 de octubre de 2026) —
  la app pedía un fotograma cada 10 s SOLO con la pestaña visible
  (`visibilityState`), y Javi juega en la tablet con el móvil en el
  bolsillo: las incidencias #18–#20 traían 1–2 pantallas por partida, las
  de los momentos en que miraba el móvil (la de rango, la de MVP con
  «VICTORY» arriba a la izquierda, una en partida, la de estadísticas),
  nunca la tabla; las tres partidas se apuntaron a mano (`origen`
  ausente) y él creía que «ya diferencia entre ganada y perdida». Desde
  3.33.0 vigila el LECTOR (`VIGILANCIA` y `/vigilar`, `/final` en
  servir.mjs): la app le manda `completoDesde` nada más completar el
  draft (y cada vez que `/final` no es de este draft: así sobrevive a un
  reinicio del lector) y él captura por su cuenta del minuto 8 al 25,
  guarda hasta 8 pantallas distintas (la de la tabla siempre) y el
  resultado con su instante (`resultadoEn`, que es la fecha de la
  partida apuntada sola: la app puede recogerla horas después). La app
  solo recoge (`pedirFinal`, `fundirFinal`: solo lo de ESTE draft, sin
  repetir ids) cada 10 s mientras está a la vista. El reloj es el mismo
  (los dos en el móvil), así que `desde` se compara tal cual. Lección:
  lo que tiene que pasar mientras el móvil está en el bolsillo no puede
  depender de una pestaña del navegador; va en el proceso que sigue
  despierto (Termux con `termux-wake-lock`, que lector.sh ya pedía). Y
  la prueba de navegador nueva cazó un segundo fallo que 3.32.0 ya tenía:
  el `tic` del efecto llamaba a la `apuntarSola` del render en que se
  creó, con el `rec` de antes de llegar el meta (sin nº1, `pick` nulo),
  y marcaba el draft como apuntado sin apuntar nada. Hoy llama a la
  última por una referencia (`apuntarSolaAhora`) y solo marca si apuntó.
  Un efecto con pocas dependencias que llama a una función del render
  tiene que llamarla por referencia a la última.
  Desde 3.38.0 la vigilancia PARA en cuanto reconoce el resultado
  (`pararVigilancia` en `vigilarTic`): seguía capturando cada 10 s hasta
  el minuto 25 con la partida acabada. Se vio porque `lector.e2e` (con
  capturas cada 200 ms y el lector en el MISMO proceso de Node que
  Playwright) ahogaba al proceso y el aviso de 20 s caducaba antes del
  toque: fallaba igual con 3.37.0. Y el aviso de «Deshacer» va en el
  mismo hueco del árbol en las dos fases (App.jsx), o React lo volvía a
  montar al pasar a baneos. Una prueba de navegador con un servidor en su
  proceso no puede medir plazos con esperas fijas: se mira dentro de la
  página, en el instante que importa.
- **Las capturas llenando el móvil** (3.26.0 → 3.34.0, «se me está
  llenando el móvil de fotos de partidas») — `lector.sh` las guardaba en
  `~/storage/downloads/capturas` para que salieran en la galería y se
  pudieran mandar, y «Leer solo» hace 12 por minuto a 3–4 MB cada una:
  cientos de MB por tarde, y en la galería. Hoy van a `~/capturas` (casa de
  Termux, fuera de la galería), `podarCapturas` borra al guardar cada una
  las de más de `RETENCION_CAPTURAS_MS` (3 h) y las que pasan de
  `MAX_CAPTURAS` por tipo (40 lecturas, 24 fotogramas, 8 resultados: lo
  que el aprendizaje llega a mirar), sin tocar nada que no sea una captura
  del lector, y `lector` quita la carpeta de Descargas al arrancar. Todo
  lo que un proceso automático escribe en disco lleva su límite desde el
  primer día, o el primer día que se usa de verdad lo llena. Y desde
  3.37.0 de Descargas se borran SOLO las capturas del lector (era un `rm
  -rf` de `Download/capturas`, una carpeta pública con un nombre
  corriente), y la poda no toca las pantallas que `/final` aún enseña.
- **El héroe que el jugador solo MIRABA (3.37.0)**: el juego pinta en el
  hueco de cada jugador el héroe que está mirando antes de confirmarlo, y
  el lector solo sumaba. En las 29 partidas leídas hasta el 3 de octubre
  de 2026, 30 de 407 nombres leídos hubo que quitarlos después (Joy cinco
  veces, Wanwan y Miya tres), todos en picks y ninguno en baneos.
  `nombresDeLectura` devuelve también `huecos` (quién se ve en cada
  jugador, null en los «?» y en tu fila) y `cambiosDeHueco` (lector.js,
  puro) quita al de antes si el MISMO hueco reconoce ahora a otro y él no
  sale en otro hueco; un «?» (skins) no quita nada. `useDraft` guarda los
  huecos en un ref (no en el almacén: tras recargar solo se pierde ese
  cambio) y saca lo cambiado de `lectura` (no fue un fallo del lector).
  Pruebas: `app/lector.test` y `lector.e2e` con las dos columnas reales
  (Clint y Khufra en los huecos de Rafaela y Eudora).
- **Lo que una revisión de 3.33–3.34 encontró (3.37.0)**: la tabla de
  VICTORIA (sin plantilla de serie: `tabla` sin `resultado`) se tiraba con
  ocho pantallas ya guardadas, en el lector y en `fundirFinal`, así que no
  se aprendía nunca: hoy entra siempre en el sitio de la última que no es
  tabla. «Más tarde» sin pick reescribía `completoDesde`, que identifica
  el draft ante la vigilancia, y la reiniciaba (se perdía la tabla y se
  vigilaba la partida siguiente): hoy apunta `recordarDesde`. Una partida
  apuntada sola y deshecha se volvía a apuntar tras recargar: la marca va
  en el draft (`apuntadaSola`). Y el tic que espera al lector comprueba
  después de cada `await` que el draft sigue siendo el suyo, y
  `vigilarTic` que el final sigue siendo el mismo.
- **La primera tanda real de aprendizaje rompió los picks (1 de octubre
  de 2026, 3.30.1)**: a las 20:44 aprendió a Rafaela y a Selena de las
  tres últimas capturas de un draft, y desde entonces los cinco huecos
  de picks salían «?» con parecidos de 0,60–0,77 (antes, cinco de cinco
  leídos) mientras los baneos seguían bien; se vio en `historial/
  partidas.json` (`lector.dudas` y `lector.aprendizaje` de sus partidas),
  no en Termux. La causa: con «Leer solo» se captura cada 5 s hasta
  completar el draft, y el draft se completa A MANO (los compañeros)
  ya en la pantalla de carga o en la partida, así que «las tres últimas»
  no eran el draft; `buscarCara` encontró a los dos a ≥0,78 en otra
  pantalla y el desplazamiento en bloque (mediana) se llevó el panel.
  Desde 3.30.1: `leerPicksEnemigos` lee PRIMERO con la geometría medida
  y el hueco aprendido solo entra donde esa no lee a nadie (y nunca con
  un nombre que la medida ya leyó: estaría mirando al vecino); al
  aprender, `esPantallaDeDraft` descarta la captura si no lee al menos
  `BANEOS_PARA_APRENDER` (2) de los baneos de la verdad (la fila de
  arriba no se mueve en picks ni en skins y no existe en la carga ni en
  la partida; en una clásica sin baneos no se puede saber y pasa), se
  miran las últimas `CAPTURAS_A_MIRAR` (8, decodificadas una a una) para
  quedarse con las 3 últimas que sí son el draft, y `huecoDe` exige que
  el hallazgo caiga a menos de medio hueco de SU hueco medido
  (`PICKS_ENEMIGOS`, no del aprendido: así no deriva): fuera de eso no
  se aprende ni la cara ni la posición. Lo aprendido lleva
  `VERSION_APRENDIDO` 2 y la 1 se descarta al arrancar (Termux lo dice).
  Seis mutaciones. Lección: lo que se aprende solo no puede mandar sobre
  lo que se midió, y «las últimas capturas» de un proceso automático no
  son las de la pantalla que uno tiene en la cabeza.
- **Más rápido y más fino (3.39.0)**, pedido por Javi («va demasiado mal y
  lento»). Medido antes de tocar nada, en sus 39 partidas leídas: baneos
  337 de 338; de los picks, leídos 2 de cada 3 y uno de cada cinco de lo
  leído sobraba (Joy y Wanwan 8 veces en 16 partidas: el héroe que el
  rival enseña antes de elegir, que solo se cambia si una lectura POSTERIOR
  ve otro en ese hueco). Y una lectura costaba 4,8 s aquí: el 80% era
  comparar cada hueco en 157 posiciones con 266 caras a 24×24. Tres cosas,
  cada una contra la versión de antes:
  (1) `reconocer` en dos pasadas: todas las caras reducidas a 8×8 y solo
  los `FINALISTAS` (32) que más se parecen, a 24×24. En 260 casos (caras
  reales, desplazadas, sin su héroe, sitios al azar) da EXACTAMENTE lo
  mismo que la búsqueda de antes, también el segundo candidato (con 16
  cambiaba en 4, con 24 en 1); la prueba guarda la búsqueda exhaustiva
  dentro y compara. Comparar cada finalista solo en sus 8 mejores
  posiciones reducidas bajaba algún parecido 0,06: descartado. `muestra`
  da los mismos números con las coordenadas precalculadas (prueba contra
  la de antes, también en el borde), y el PNG deshace cada filtro con su
  propio bucle (y el RGBA de `screencap -p` no se copia otra vez).
  (2) Los tres trozos (baneos, enemigos, tu equipo) en tres hilos
  (`lectorEnHilos`, `lectura-tarea.mjs`, `lectura.mjs`) con la captura en
  memoria compartida: 1,4 → 0,7 s aquí. `lectura.mjs` va aparte de
  servir.mjs porque un hilo que importara servir.mjs vería su mismo
  `process.argv[1]` y arrancaría otro servidor. Si un hilo falla, esa
  lectura se hace en uno solo; la prueba exige que sin fallo NO se use ese
  plan B (con el plan B tapando, cruzar las partes pasaba la prueba).
  (3) `AFINADOS` (3): los tres mejores se afinan subiendo un paso de
  posición o de tamaño mientras se parezcan más. Lo destapó la prueba de
  equivalencia con un fallo propio (los límites del bucle de tamaños se
  movían): con un poco más de búsqueda Gloo daba 0,87 donde se quedaba en
  0,65. Medido en 81 casos con el héroe y 167 sin él: aciertos 76 → 81,
  falsos 0 → 0, el falso más alto el mismo 0,7996 (con 5 afinados, igual).
  El MARGEN sobre el segundo se midió y NO entra: con las caras en su sitio
  separa (aciertos ≥ 0,14, falsos ≤ 0,064), pero desplazadas se solapan
  (falsos hasta 0,15), y bajar el umbral a 0,75 con margen metía 3–6
  falsos de 167. Cada lectura lleva `ms` y `msCaptura` (lo que tardó la
  tablet en dar la imagen) y la partida se lleva los 20 últimos
  (`sanearLectura`): `medir-mias` y el diagnóstico dicen la mediana. Lo que
  falta por medir en su móvil: cuánto es la captura (adb codifica un PNG
  de 2400×1504 en la tablet y lo manda por wifi; `screencap` sin `-p` da
  14 MB en crudo y cambiaría el mandato permitido: se decide con esa cifra
  delante). Doce mutaciones; sobrevive una inofensiva (la versión reducida
  sin normalizar elige los mismos finalistas).
- **La captura sin comprimir (3.45.0)**, pedida por Javi tras medir que
  3,8 de los 4,9 s de cada lectura eran la captura (146 lecturas): `adb
  exec-out screencap` SIN `-p` da la imagen tal cual (cabecera de 12 o 16
  bytes y RGBA_8888/RGBX_8888, `leerCrudo` en png.mjs; ~14 MB a
  2400×1504), así la tablet no comprime y el móvil no descomprime. Cuál va
  antes depende de su tablet y su wifi y no se mide desde aquí, así que
  `crearElectorDeCaptura` (servir.mjs, solo en `/leer`) alterna hasta tener
  3 de cada una, usa la de menor mediana (de las últimas 5, captura + imagen
  lista) y cada 10 lecturas prueba la otra; una crudo que falla o no se sabe
  leer se reintenta comprimida en la MISMA petición y, si esa sale, la crudo
  se descarta hasta reiniciar (si fallan las dos, es la tablet y no se
  descarta nada). La captura en crudo se guarda para el aprendizaje como
  PNG sin filtros, comprimido FUERA del hilo principal (`escribirPngRapido`,
  87 ms aquí; el CRC pasó a tabla). Las de la partida (inicio, final) siguen
  en PNG: 14 MB cada 10 s por la wifi mientras se juega podrían meter lag.
  Cada lectura lleva `formato` y la partida `lector.formatos` (alineado por
  el final con `ms`): `medir-mias` y el diagnóstico dicen la mediana de cada
  forma. La prueba de seguridad admite la tercera llamada a adb, con su
  forma exacta. Pruebas en `captura-cruda.test` (cabeceras, RGBX, rechazos,
  la misma lectura que en PNG, el PNG guardado, la vuelta a la comprimida y
  la tablet apagada) y `registro.test`. Sin medir todavía en su tablet: si
  la crudo va más rápida; lo dirán sus partidas.
- **Los recortes de los picks (3.52.0)**, pedido por Javi el 9 de octubre de
  2026 («le está costando bastante detectar bien los héroes en la fase de
  picks»). Medido antes en sus 28 partidas del 5 al 9 de octubre: baneos
  el 100%; enemigos 7 de cada 10 (los que más se escapan, Barats, Rafaela,
  Cyclops, Minotaur), tu equipo la mitad (Kadita, Badang, Hanabi), y de lo
  leído de más, Joy, Yi Sun-shin, Zetian y Gord. El umbral NO es el
  problema: de las dudas con el candidato correcto, 12 pasan de 0,75; de
  las equivocadas, 16. Y `lector.dudas` es de la ÚLTIMA lectura, que muchas
  veces ya no es el draft (un «Gord 0,74» en todos los huecos). Sin ver
  cómo pinta su tablet a esos héroes, cualquier cambio era a ciegas, así
  que (preguntado: «Automático») al completar el draft el hilo de
  aprendizaje compone, de las DOS últimas capturas que dio por pantalla del
  draft (`recortesDelDraft`, scripts/lector/recortes.mjs), una imagen con
  las diez caras (`CAJAS_ALIADOS` sin la caja del nombre, `CAJAS_ENEMIGOS`
  sin la franja de abajo, donde va el nombre del jugador), a un tercio y con
  una paleta de 256 colores sacada de la imagen (~35 mil caracteres; la
  fija de 6×7×6 deja las caras en manchas), y lo leído hueco a hueco. Va en
  la respuesta de `/corregir` (`recortes`) y la app lo sube como una
  incidencia `pantalla` (`cuerpoDePicks`) SOLO si a la lectura se le escapó
  alguien (`faltoAlguien`) y hay token; lo que llega del puerto se valida
  por forma (`recorteValido`) y los nombres salen del catálogo (uno que no
  esté sale «?»). Devuelto a su sitio, el lector lee las diez caras de la
  captura de referencia igual (±0,05). Pruebas: `scripts/recortes.test`
  (que quepa, que se lea igual, que no lleve nombres, otra resolución, las
  dos últimas no descartadas), `app/lector.test` y `puente-lector.test`;
  trece mutaciones (sobrevive una inofensiva: alargar la caja de tu equipo
  sin alargar la fila; con las dos, cazada). Sin prueba de navegador: la
  subida tras `/corregir` necesita el token y la API de GitHub. Lo
  siguiente es mirar esas incidencias y medir con ellas. Y destapó un fallo
  de antes: `/corregir` hacía `writeHead(200)` antes del `await`, así que
  un aprendizaje que fallaba (un hilo sin memoria) contestaba 500 con la
  cabecera ya enviada y TIRABA EL LECTOR entero; hoy se espera el resultado
  antes (prueba: el aprendizaje que lanza contesta 500 y `/estado` sigue).
- **Callar la voz (3.53.0)**, pedido por Javi («un botón para callar al
  tts cuando no quiera que hable»): `BotonVoz` (BotonLector.jsx, «Voz: sí /
  callada», clase `lector-callar`) guarda `vozCallada` en
  `roam-picker:voz-callada` (clave NUEVA, sin ella habla) y llama a
  `callarVoz` (`POST /voz {callar}`, solo con el origen de la app; 400 si
  no es sí o no). En el lector, `callada` es GLOBAL (vale para las partidas
  siguientes hasta reactivarla): `decir` no encola nada y lo ya encolado no
  se dice (comprobado al sonar, como el draft que ya no es el vigilado); la
  frase que suena acaba (cortarla pediría matar el proceso de
  `termux-tts-speak`, y voz.mjs tiene la forma fijada por la prueba de
  seguridad). Lo callado cuenta en `saltados` con «voz callada» en el
  registro. Cada `/vigilar` lleva `callar` (huella y `f.callada` distinta
  del ajuste: se vuelve a avisar), así que un lector reiniciado se entera
  solo. En la fila de picks sale SOLO con el draft completo (`completoDesde`):
  antes es cuando no habla y pasaría la fila a dos líneas, bajando la nº1;
  en baneos y en Ajustes, siempre con «Leer solo». Pruebas:
  `directo-lector.test` (cola callada, otro draft callado, reactivar, el
  aviso con `callar` de un lector recién arrancado, 403/400),
  `app/lector.test` y `lector.e2e` (toque, se guarda, recarga, lector que
  no se enteró, otro toque); seis mutaciones. Y un aviso al probar: no
  reutilizar `lector-auto` para otro botón, la prueba de «Leer solo» lo
  busca por esa clase.
- **La fase de skins, separada de la de picks (3.54.0)**, de los 11 drafts
  de recortes subidos del 10 al 12 de octubre de 2026 (#60–#79; 22 imágenes
  de diez caras). Lo medido: (1) la mitad de las imágenes eran ya la fase de
  skins (o una ventana que oscurece el panel, #65): el draft se completa a
  menudo ahí, y tanto los recortes como el aprendizaje cogían las ÚLTIMAS
  capturas; el aprendizaje del 10–12 dejó «sin encontrar» a los cinco
  enemigos de un draft que un momento antes se leía entero (#73) y solo
  aprendió 3 veces en 15 partidas. Hoy `aprenderDe` mira todas las de la
  pantalla del draft y se queda con las que más enemigos de la verdad leen
  (`aciertos` en el informe; a igualdad, las más nuevas), y
  `recortesDelDraft` igual. (2) En esas pantallas el lector «reconocía» a
  imanes (Wanwan 0,81–0,87, Esmeralda 0,80–0,82, Joy 0,81, Beatrix 0,89,
  Harley 0,90 en la oscurecida): 13 de 220 huecos con los ajustes de hoy, y
  `cambiosDeHueco` quitaba por ellos al héroe bueno. Hoy `fueraDeLosPicks`
  (src/app/lector.js): si en un equipo cambian a la vez más huecos ya
  leídos que `CAMBIOS_A_LA_VEZ` (2, el orden 1-2-2-2-2-1 del juego), esa
  lectura no toca ese equipo (ni tu fila, con el tuyo). Un «?» cuenta como
  cambio; un hueco que se llena, no. (3) Lo que sí es de geometría:
  buscando más ancho (±8 pasos, escalas 0,8–1,4) Johnson sale a 0,86,
  Kadita 0,86, Selena 0,83–0,85, Hanabi 0,83, Nana 0,80 en su hueco; en
  enemigos +6 aciertos de 110 huecos por +1 falso, en tu equipo PEOR (de 43
  a 41 aciertos y de 6 a 13 falsos, los imanes otra vez) y cuesta 2,4 veces
  la primera pasada. No entra: con el aprendizaje mirando ya la fase de
  picks, Johnson y compañía deberían aprenderse solos; si no, se mide eso.
  (4) Gord no es una cara vieja: la de la API es el mismo dibujo, encuadrado
  distinto (0,75–0,77 en tres compañeros distintos). Medido sobre los
  recortes a un tercio (±0,05 del original) con `variantes.mjs` y
  `medir-recortes.mjs` del scratch de la sesión. Pruebas en `app/lector`,
  `aprender`, `recortes` y `lector.e2e` (cinco mutaciones).
- **La criba a dos tamaños (3.55.0)**, con las primeras partidas de 3.54.0
  (#84–#87; el aprendizaje ya aprende: Kadita y X.Borg el 12 de octubre).
  `reconocer` elegía los 32 finalistas solo con la cara a tamaño 1, y el
  tamaño se buscaba después alrededor de la mejor posición de TODOS: un
  héroe pintado un 20–30% más grande no llegaba a finalista. Medido con
  búsqueda exhaustiva en los recortes: Hanabi 0,92 a 1,2 (salía «Wanwan»
  0,81–0,83 en #67 y #86), Johnson 0,86 a 1,3 («?»). Hoy `criba` (escalas
  de más en la primera pasada, `CRIBA_PICKS`, 1,2) y `saltoCriba` (en
  los enemigos uno de cada dos pasos: mismos aciertos, la mitad de coste;
  en tu equipo no, se pierde lo ganado). En las 16 capturas de la fase de
  picks: enemigos 59 → 64 de 90 (falsos 1 → 0), tu equipo 51 → 53 (falsos
  4 → 2); con 0,85 además, tu equipo 57 pero el triple de coste. Coste por
  captura aquí, enemigos 294 → 370 ms y equipo 293 → 513 ms (van en hilos
  a la vez). Lo que NO arregla: Gord no pasa de 0,775 a ningún tamaño ni
  posición (mismo dibujo que la API, otro encuadre) y Barats 0,73: esos
  necesitan su cara aprendida, y el aprendizaje de tu equipo no existe
  (las skins). Prueba en `lector.test` (caras ampliadas a 1,2 y 1,25;
  cuatro mutaciones).
- **Las caras de tu equipo se aprenden (3.58.0)**, con los 30 drafts de
  recortes del 10 al 14 de octubre de 2026 (#56–#114): de tu equipo se leía
  la mitad (18 de 37 los dos últimos días) y los que más se escapaban son
  los que juegan con Javi a menudo, siempre con la misma skin (Selena 11
  veces, Gord 9, Kadita 7, «¿Claude? 73%» en el hueco de Selena en cada
  partida). La misma skin en el mismo panel sale entre 0,93 y 1,00 de una
  partida a otra (mediana 0,98) y el héroe equivocado más parecido, 0,81:
  `ALIADO_MINIMO` 0,92 y `MARGEN_ALIADO` 0,03 (leer.mjs). La app manda en
  `/corregir` también `aliados` y `tuyo` (al completar el draft, el pick
  fijado; al apuntar, el apuntado). `aprenderDe` etiqueta con
  `etiquetarAliados`: tu fila (`filaPropia`) es tu pick, y si de los cuatro
  compañeros se leen tres, el hueco que queda es el que falta; nada más (con
  dos sin leer no se adivina). Solo de capturas que leen al menos
  `ENEMIGOS_PARA_ALIADOS` (3) enemigos de la verdad y NINGUNO de fuera: el
  13 de octubre una corrección (#93) traía una captura de la partida
  anterior, y la fase de skins lee imanes. Cada recorte queda en
  `aliadosPendientes` y pasa a `aliados` (hasta `RECORTES_POR_ALIADO` 4
  por héroe) cuando otro de un draft distinto (`MINUTOS_ENTRE_DRAFTS` 10
  entre las capturas, por el instante del nombre `lectura-…`; la misma
  captura corregida dos veces cuenta una) se le parece a `ALIADO_MINIMO`:
  sin confirmar, en la repetición salían 43 lecturas más con 1 falsa (la
  verdad de #98 y #99, el mismo draft, no coincide); confirmando, 15 y 0
  (`replay-aliados.mjs` del scratch de la sesión, con el código de verdad).
  `leerAliados` las usa como los picks enemigos: manda la API, lo aprendido
  solo entra en un hueco que ella no lee y nunca con un nombre ya leído.
  Tope de `PENDIENTES_MAXIMOS` (40) recortes pendientes; con los 30 drafts,
  aprendido.json pesa ~100 KB. Pruebas en `aprender.test`, `puente-lector`
  y `app/lector`; dieciocho mutaciones (la de «manda la API» sobrevivía hasta probar con la cara aprendida apuntada como otro héroe).
  **El hueco de quien aún no ha elegido (3.58.1)**: el juego pinta en él
  siempre el mismo icono (mano blanca sobre azul) y, por eliminación, se
  etiquetaba como «el que falta»: un amigo que elige último dos veces lo
  habría confirmado como su cara. Medido: el icono contra sí mismo
  0,96–1,00 (seis huecos), cualquier cara 0,75 como mucho:
  `VACIO_ALIADO` (`vacio-aliado.json`, de #60) y `MINIMO_VACIO` 0,85; ni se
  aprende ni se usa lo ya aprendido así (`aliadasAprendidas`). Y un
  recorte que se parece a la cara aprendida o pendiente de OTRO héroe no
  se aprende (`confundibles`). Lo mismo descarta la eliminación para los
  ENEMIGOS: el hueco enemigo vacío (rojo) salía etiquetado Joy en un draft
  y Esmeralda en otro a 0,985, Martis y Natan a 0,98; y las skins de los
  rivales cambian en cada partida, así que no hay nada que confirmar.
- **Las caras del panel (3.59.3)**: Minotaur, de rival, salía a
  0,71–0,73 contra su cara de la API en sus cuatro drafts (#58, #70, #80,
  #108) a cualquier tamaño y encuadre (±14 pasos, escalas 0,6–2,0), y
  ninguna de sus 16 imágenes de la API pasaba de 0,72: el juego pinta un
  dibujo rojo con cuernos que la API aún no tiene. Por eso el aprendizaje
  tampoco lo encontraba («sin encontrar» en 5 partidas): `buscarCara`
  busca la cara de la API. Su recorte del panel se parece a sí mismo entre
  drafts a 0,97–0,99 y en 290 casillas sin él lo más parecido es 0,64, así
  que va como referencia fija (`caras-panel.json`, recortes de #108 y #58,
  en la orientación de la pantalla; `carasDelPanel` en leer.mjs, en
  `leerPicksEnemigos` siempre). La prueba lee la columna de #80
  (`picks-minotaur.png`, otro draft), una mutación. Barats (0,73) solo
  aparece en un draft: sin un segundo con que confirmarlo, no entra. Para
  añadir otro héroe: el mismo criterio (tres drafts, el recorte se parece a
  sí mismo entre ellos y nada sin él se le acerca), nunca de una captura.
- **TU hueco sin elegir y las caras de tu equipo de serie (3.59.5)**, con
  los 37 drafts de recortes (#56–#125). Tu fila antes de elegir no pinta la
  mano de 3.58.1 sino un cuadro azul con un emblema blanco (0,60–0,69
  contra la mano); como Javi elige el último y casi siempre lo mismo, en
  #58 y #80 se aprendió como «Estes» y se confirmó, y desde entonces su
  fila sin elegir se leía Estes (#117, #119, #125, jugando Rafaela y
  Diggie). El icono contra sí mismo 0,95–1,00 en 12 huecos, cualquier otra
  cosa 0,62: `vacio-aliado.json` lleva hoy los DOS iconos
  (`VACIOS_ALIADO`). Y las caras de tu equipo que el lector aprendería
  partida a partida van de serie en `caras-panel.json` (`panel:
  'aliados'`): la repetición con `aprenderDe` sobre los 37 drafts confirma
  Gord, Selena, Kadita y Diggie (la skin del búho, mirada a mano), dos
  recortes de cada uno; una skin es siempre del mismo héroe, así que vale
  quien la lleve. Aprendiendo hasta #114 y midiendo en #115–#125: Gord en
  sus 4 huecos, 0 falsos; un lector recién instalado con las de serie lee
  a Gord y a Diggie en #121 (draft del que no sale ninguna cara).
  `leerAliados` las suma a las aprendidas (`panel`). Pruebas en
  `aprender.test` (el cuadro azul de #80, `aliado-vacio-tuyo.png`) y
  `lector.test` (la columna de #121, `aliados-gord.png`); dos mutaciones.
  Para añadir más: repetir la repetición con los drafts nuevos y mirar a
  mano cada cara de TU fila (es donde salen los iconos). Desde 3.60.1 los
  recortes que son un icono vacío se PURGAN de lo aprendido
  (`sinHuecosVacios`, al leer el fichero en `leerAprendido` y al empezar
  `aprenderDe`): `aliadasAprendidas` ya no los usaba, pero contaban en
  `/estado` y ocupaban sitio de `RECORTES_POR_ALIADO`.
- **La revisión de 3.60.3 (3.60.4)**:
  - `aplicarLectura` vacía los huecos de antes también sin lectura en el
    draft (`!antes.lectura`). Con un héroe metido a mano tras «Nuevo
    draft», los cinco huecos del draft anterior contaban como cambiados y
    `fueraDeLosPicks` tiraba el bando hasta el siguiente draft.
  - Cada draft tiene su época (`epocaDelDraft`, sube en `reiniciar`,
    `vaciarConDeshacer` y `restaurar`). `leerDelJuego` la captura al pedir
    y una lectura de otra época no se aplica (`otroDraft`).
  - Apuntada sola SIN pick fijado, `/corregir` no lleva `tuyo` (`supuesto`
    en `guardarPartida`): el nº1 supuesto se aprendía como tu cara.
  - `/corregir` espera con `while`: con tres a la vez, dos aprendían juntas.
  - Pruebas en `app/lectura-draft`, `lector.e2e` (intercepta `/corregir`) y
    `puente-lector`; cuatro mutaciones.
- Lo que NO hace, a propósito: aprender a ciegas por orden (asignar el
  enemigo N al hueco N sin encontrarlo): un recorte mal etiquetado
  enseña a confundir a dos héroes para siempre. Si en la tablet de Javi el
  panel pinta algo que no se parece en nada a la cara de la API (todos
  los «?» por debajo de 0,78), el aprendizaje no arranca y hay que mirar
  UNA captura a mano: la geometría se mide ahí y desde entonces las caras
  se aprenden solas. Los baneos no aprenden: salen bien.

**Otras formas de automatizar, investigadas el 29 de septiembre de 2026**
(el puente local entró en 3.25.0):

- **Captura desde el navegador**: `getDisplayMedia` NO existe en Chrome
  para Android (caniuse, Chrome 154: no soportado). La web no puede mirar
  la pantalla del juego sola; hace falta adb o una captura.
- **Compartir una captura a la app** (`share_target` con ficheros en el
  manifiesto, POST multipart recogido por el service worker; Chrome
  Android 76+, solo con la app INSTALADA): funciona en el MISMO aparato.
  Con el juego en la tablet y la app en el móvil habría que mandar la
  captura de uno a otro (Quick Share) y luego compartirla: más toques que
  meter el draft a mano. Solo compensa si la app se usa en la tablet (en
  ventana flotante o pantalla partida junto al juego). El lector es JS puro:
  en el navegador la imagen la decodifica un `canvas` y `caras.json`
  (~325 KB) se pediría solo al usarlo.
- **Puente local, la más prometedora**: el lector de Termux sirve su
  resultado por HTTP y un botón de la app («Leer del juego») lo pide con
  `fetch`. Desde Chrome 142 (Local Network Access) una web HTTPS pública
  puede pedir a `http://127.0.0.1` o a una IP privada tras un permiso
  «acceder a la red local» que se da UNA vez, y esas peticiones quedan
  exentas del bloqueo de contenido mixto. Dos variantes: (a) Termux en el
  MÓVIL con el `adb connect` de siempre y el servidor en `127.0.0.1`
  (solo lo ve el móvil); (b) Termux en la TABLET con adb contra sí misma
  (`adb pair 127.0.0.1:puerto` desde Depuración inalámbrica; el
  emparejamiento sobrevive a reinicios, el puerto de conexión cambia cada
  vez) y el servidor en la red local, que el móvil pide por la IP de la
  tablet. Sin comprobar todavía: que el permiso salga igual en Chrome para
  Android (la documentación no lo dice) y qué cabeceras CORS exige.
  Seguridad: el servidor solo DEVUELVE nombres de héroe (nunca la imagen),
  solo acepta el origen de la app y no toca el juego; sigue siendo el
  mismo `screencap` de solo lectura.
- **El riesgo que no se puede medir desde aquí**: la depuración
  inalámbrica activa en la tablet mientras se juega. MLBB tiene un aviso de
  «aplicación de terceros detectada» (inyectores, herramientas GFX); no hay
  constancia pública de que mire la depuración, pero tampoco de que no.
  Leer píxeles no modifica el cliente; activarla solo para el draft y
  quitarla después es lo prudente.
- **Descartado**: una ruta de la API con el draft en vivo (solo las rutas
  `/api/user/*` tras el inicio de sesión, que no se tocan) y automatizar
  toques por adb (sería un bot).

## Los consejos en directo (3.44.0)

Pedido por Javi: «que los consejos vayan en tiempo real según como vaya la
partida y los minutos… y analizar el resultado». Él eligió (preguntado) la
VOZ en el móvil (Termux:API) y que el lector mire la tablet desde el minuto
1, cada 20 s. Cómo va, por piezas:

- **El guion** (`src/motor/directo.js`, `guionEnDirecto`, lo añade `planear`
  como `plan.directo`, y `cierresPorTramo` como `plan.cierres`): el plan y las
  fases convertidos en avisos por minuto de PARTIDA (inicio 0,25; peleas 5;
  de early «vuestro momento» 9 y «cada minuto en contra» 15; de late
  «aguantad» 8 y «ahora vosotros» 15; su carta y la vuestra 13; el cambio de
  lado dos minutos antes, solo si el plan lo afirma; pasado el 20, 19,5).
  Cada cifra es la probabilidad de SU tramo de fases.js; los minutos son
  decisión de producto. Nada nuevo medido: se decide CUÁNDO decir lo medido.
  La app lo traduce (`guionTraducido`) y lo manda en `POST /vigilar` junto
  con el aviso de draft completo; si cambia (otro pick fijado), lo vuelve a
  mandar (huella), y el lector no repite lo ya pasado.
- **El inicio de la partida** (`scripts/lector/partida.mjs`): por el
  MINIMAPA, correlación de la esquina de arriba a la izquierda (a 160 px,
  con la paleta de `fotogramaDe`) con `minimapa.json`, la media de 37
  pantallas de juego de las incidencias #21–#35 (índice par). Medido con
  las 83: de juego fuera de la plantilla 0,50–0,99 (todas menos una >
  0,62); fuera de partida (draft, tabla, rango, MVP, estadísticas) ≤ 0,42.
  `UMBRAL_PARTIDA` 0,47 y DOS capturas seguidas; inicio = la primera menos
  medio intervalo. Sin verlo al llegar al minuto 8 del draft, se estima en
  el 1 y se marca (`inicioEstimado`: la app no apunta esa duración). Desde
  3.45.1 se mira desde el minuto 0 del draft, no desde el 1: ver «Errores
  ya cometidos». La pantalla de CARGA no está medida (ninguna captura
  suya); si se pareciera al minimapa, el inicio saldría unos segundos antes. `pruebas/fixtures/juego/
  pantallas/` lleva 18 de esas pantallas (9 de juego no usadas en la
  plantilla y las 9 de fuera).
- **La voz** (`scripts/lector/voz.mjs`): `termux-tts-speak -l es|en`, el
  texto por la ENTRADA ESTÁNDAR (como argumento, uno que empezara por «-»
  sería una opción), sin caracteres de control, tope 400. Es el SEGUNDO y
  último fichero del lector que lanza un programa; la prueba de seguridad lo
  exige por forma (import exacto, una sola llamada, solo el idioma de
  argumento). Un aviso más de `RETRASO_MAXIMO_MIN` (2) por detrás no se dice
  (el del inicio, hasta 4). Sin Termux:API, `/final` dice `voz: 'falta'` y
  la app lo enseña bajo el botón del lector (`lector.voz.falta`).
  **Topes de la voz** (revisión de seguridad antes de publicar, reproducido:
  30 `POST /vigilar` dejaban 600 avisos en cola, unas 4 h de voz, y
  cualquier programa del móvil puede poner el `Origin` de la app): por
  draft, su guion y su cierre como mucho; en todo el lector,
  `VOZ_POR_VENTANA` (4) cada `VENTANA_VOZ_MS` (3 min; un guion de verdad
  dice 3 en sus 3 minutos más apretados); lo encolado de un draft que ya no
  es el vigilado no se dice. Y la prueba de seguridad de voz.mjs se saltaba
  con `['sh' + 'ell']: true` más un idioma de la lista ampliada (ejecutó un
  mandato en la copia): hoy exige la LÍNEA entera de la llamada, `lengua =
  idioma === 'en' ? 'en' : 'es'`, `lengua` dos veces y ninguna clave
  calculada, y hay una prueba de comportamiento con un `termux-tts-speak` de
  pega en el `PATH` (argumentos siempre `-l es|en`, texto limpio por la
  entrada). Lo que no tiene arreglo aquí: el texto lo decide quien llame a
  `/vigilar` con el origen de la app (o lo falsifique); un programa del
  móvil podría hacer decir una frase de engaño, con los topes de arriba.
- **El resultado**: con la tabla leída, `duracion` = tabla − inicio y se dice
  el cierre de su tramo («acabó entre el 14 y el 16: el modelo os daba un
  57%»). La partida apuntada guarda `duracion` y `fases` (las seis
  probabilidades del héroe jugado, solo si es el del plan) y
  `medirFasesMias` (registro.js) compara en tus partidas la probabilidad del
  tramo en que acabó con la nota de siempre (Brier pareado con su error):
  sale en `medir-mias`. `tramoDeMinutos` reparte IGUAL que `tramoDe` de
  medir-fases.mjs (prueba con cada décima de minuto).
- **El marcador** (muertes de los dos equipos y reloj, arriba en el centro:
  x 44–58%, y 0–4%, medido en las franjas de 320 px; los dígitos van en el
  1–3% y lo de debajo, donde pueden salir avisos con nombres, se deja fuera): cada fotograma EN
  PARTIDA lleva `marcador`, el recorte a resolución completa (o a la mitad
  si no cabe en 12.000 caracteres), y se sube en el comentario DESPUÉS de
  las franjas, con lo que sobre (un marcador grande no quita una franja). Todavía NO se
  lee: con unas cuantas partidas se sacan las plantillas de los dígitos
  (como `caras.json`), y entonces el guion podrá decir «vais +4». Hasta
  medir con resultados qué vale una ventaja de muertes en cada minuto, eso
  se dirá como hecho, no como probabilidad.
- Pruebas: `motor/directo.test`, `scripts/directo-lector.test` (el recorrido
  entero con un reloj simulado: no busca antes del minuto 1, el draft no
  cuenta, dos capturas arrancan, cada aviso en su minuto y en su idioma, lo
  atrasado no, la duración y el cierre de su tramo, el inicio estimado
  marcado, la voz que falta), `app/lector.test` (guion en el aviso; de vuelta
  duración solo con inicio visto, voz y marcador validados), `registro.test`,
  `perfil.test` y la de seguridad del lector.
- **El draft cerrado por la partida (3.46.0)**, pedido por Javi tras mirar
  las seis partidas del 7 de octubre de 2026: todo lo de la partida (voz,
  vigilancia, resultado, duración) cuelga de `completoDesde`, que solo
  llegaba con cinco enemigos y cuatro compañeros; el lector lee mal a los
  compañeros (8 de 16 el día 6) y 2 de 6 partidas ese día (7 de 46 desde
  el 2 de octubre) se quedaron sin nada. Hoy cada `/leer` lleva `partida`
  (el minimapa, `enPartida`, 13 ms aquí con la captura entera) y con
  `LECTURAS_EN_PARTIDA` (2, las mismas que la vigilancia; prueba de que la
  app y el lector piden las mismas) la app llama a `cerrarConPartida`
  (useDraft): `cerrado: true` se guarda en el draft, `draftCompleto` lo
  cuenta como completo hasta el siguiente draft (meter después al que
  faltaba conserva el instante) y sin ningún enemigo no se cierra (la app
  abierta entre dos partidas). Como la vigilancia llega ya con la partida
  empezada, el lector recuerda la última lectura FUERA y la primera DENTRO
  (`leidas`) y, si no las separan más de `HUECO_MAXIMO_LECTURAS_MS` (60 s),
  el inicio es su punto medio y sale medido. Cerrado, deja de leer (tampoco
  tu fila: `tocaLeerSolo` con `cerrado`). Pruebas: `identidad-draft`,
  `app/lector`, `directo-lector` (el inicio de las lecturas, con la primera
  de dentro lejos de la última para que se note cuál se coge) y
  `lector.e2e` (dos lecturas en partida cierran el draft, el lector vigila
  ESE instante, se para de leer y sobrevive a una recarga). Seis
  mutaciones. Sin medir: la pantalla de CARGA contra el minimapa (si se
  pareciera, se cerraría unos segundos antes, sin más efecto).
- **La revisión a la contra de 3.44.0 (3.44.1)**, con `silent-failure-hunter`
  y `click-path-audit` antes de la primera partida real, encontró doce cosas,
  todas arregladas; las nueve primeras con su prueba y su mutación:
  (1) un inicio NO visto salía como medido: si la primera captura ya era de
  juego (draft completado tarde a mano, lector reiniciado a mitad), la
  partida medía minutos de menos y se apuntaba. Hoy hace falta haber visto
  la tablet fuera de partida (`vistoFuera`); si no, `inicioEstimado`;
  (2) las partidas de más de ~23 minutos no tenían tabla, duración ni cierre
  (vigilancia hasta el 25 del DRAFT): con el inicio visto se vigila hasta
  `partidaHastaMin` (40) de partida, y desde la primera tabla solo dos
  minutos más;
  (3) el cierre se decía con un inicio estimado (tramo posiblemente falso,
  dicho como hecho): hoy no;
  (4) un aviso atrasado o cortado por un tope contaba como dicho y no dejaba
  rastro: hoy `saltados` en `/final` y una línea en el registro;
  (5) `tramoDeMinutos` daba tramo a 1–3 minutos y `sanearDuracion` cortaba en
  60, cuando medir-fases tira por debajo de 3 y por encima de 90: hoy los
  tres usan `esDuracionPosible` (directo.js);
  (6) con tu pick fijado fuera del ranking de tu línea, la voz decía el plan
  del nº1: hoy se calla (guion vacío). Hacer el plan del pick fijado pediría
  que `eleccionDe` admita héroes fuera del ranking: no se ha hecho;
  (7) corregir un enemigo con el draft completo arrancaba otro `completoDesde`
  y el lector tiraba la partida vigilada (repetía el aviso del inicio,
  retrasaba todo 8 minutos, perdía fotogramas y resultado): hoy `conCompleto`
  (useDraft) recupera el instante si vuelve a completarse con 7 de los 9
  héroes dentro de 30 minutos (`ultimoCompleto`, en memoria, NO se guarda);
  (8) la voz seguía con la partida acabada si no veía la tabla: hoy calla
  con la primera tabla (aunque no conozca la palabra) y cuando la app apunta
  la partida (`/resultado` lleva `desde`);
  (9) si eliges el último, el draft se completaba antes de tu pick y la
  lectura paraba: hoy sigue `LEER_TU_PICK_MS` (90 s) leyendo tu fila;
  (10) tras recargar, el primer `/vigilar` llevaba el guion vacío y se perdía
  el aviso de ese minuto: hoy sin datos del día no se manda guion (`listo`).
  Sin prueba propia (tiempos del navegador; reproducidas por el agente con
  `page.route`): (10), el reintento del
  aviso cuando falla `/final` y que el aviso «falta la voz» se quede hasta
  que vuelva a sonar (antes se borraba al empezar otro draft). Lección: el
  estado de un proceso que vive aparte (el lector) se identifica por algo que
  la persona puede tocar sin querer (`completoDesde`); toda corrección a mano
  tiene que conservar esa identidad.
