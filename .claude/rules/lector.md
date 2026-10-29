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
- **La conexión vieja «offline» (3.60.6)**: tras apagar y encender la
  depuración, adb contesta «already connected» a la dirección de antes
  aunque esté `offline`, así que `encontrarTablet` la daba por buena desde
  la memoria y el lector reintentaba la misma sin fin (20 de octubre de
  2026, 192.168.68.116:39043). Hoy la que acaba de fallar va en
  `descartar` y, si no hay otra, `conPista` dice en Termux «adb disconnect»
  y «adb kill-server»: el lector NO los lanza (solo conecta y captura).
- **El escaneo que no veía el puerto (3.60.9)**: el 21 de octubre de 2026
  la tablet estaba en 192.168.68.116:40461 y `escanearPuertos` no lo
  encontró. Abría 1.024 conexiones a la vez y Android deja 1.024 ficheros
  por proceso: los EMFILE contaban como puerto cerrado. Hoy van 256, un
  fallo del MÓVIL (`FALLOS_DEL_MOVIL`) baja el límite a lo que había
  abierto y el puerto se reintenta (`REINTENTOS_POR_PUERTO` 5). Prueba con
  un `conectar` de pega que se queda sin descriptores; tres mutaciones (la
  del 256 por defecto sobrevive, inofensiva: el límite se adapta).
- **El lector EN LA TABLET (3.61.0)**, elegido por Javi («B») tras otra
  tarde de puertos y conexiones `offline`: la APK `android/` («Lector
  MLBB», Kotlin) graba la pantalla de la propia tablet con MediaProjection
  (el permiso normal de grabar pantalla, un toque al empezar) y corre el
  MISMO lector con Node embebido (nodejs-mobile 18.20.4, `Nodo.kt` +
  `cpp/nodo.cpp`): `scripts/lector/en-tablet.mjs` crea el servidor de
  siempre con la captura de la APK (`capturaDeLaApk`, siempre en crudo con
  la cabecera de `screencap`, por 127.0.0.1 con un secreto por arranque) y
  la voz de Android (`vozDeLaApk`, TextToSpeech). Sin depuración
  inalámbrica, ni adb, ni puertos que cambian. Escucha en la wifi, así que:
  `crearPortero` exige el código de vinculación (`X-Lector-Codigo`, 10
  letras de la tablet, comparado en tiempo constante; tras `FALLOS_CODIGO`
  en `VENTANA_CODIGO_MS` ese APARATO no entra, ni con el bueno: contado por
  IP, porque con un contador global cualquiera en la wifi dejaba fuera al
  móvil de Javi; y la app deja de leer sola con un 401/429, o se bloquearía
  ella misma con un código viejo) y `hostPermitido`
  con `red` acepta solo una IP PRIVADA escrita tal cual (nunca un nombre:
  DNS rebinding). La app se vincula escaneando el QR de la tablet con la
  cámara del móvil (`#lector=IP:PUERTO&codigo=…`, `lectorTabletDeEnlace`:
  se quita de la barra y PREGUNTA, `ConfirmarVinculo`, porque cualquier
  mensaje podría traer un enlace así hacia otro aparato; al confirmar se
  guarda en `roam-picker:lector-tablet` y enciende «Leer solo») o a mano en
  Ajustes (`LectorTablet.jsx`); `pedirAlLector`
  añade el código y `targetAddressSpace: 'local'` (Chrome exime del bloqueo
  de contenido mixto a una IP local). Los avisos dicen qué hacer en la
  tablet, no en Termux (`claveDeFallo`). Termux sigue valiendo: «Usar el de
  Termux» desvincula. La APK se compila y publica sola (`apk.yml`, release
  `lector-vX.Y.Z` con `lector-mlbb.apk`). La contraseña de la firma la
  inventa Javi y solo vive en el secreto `LECTOR_FIRMA_CLAVE` (una
  contraseña generada aquí no se le puede enseñar: el chat no lleva
  credenciales); la primera corrida crea la clave, la sube cifrada
  (`android/firma.jks.cifrado`, por la API) y las siguientes la descifran.
  Sin el secreto no publica: otra firma obliga a desinstalar y se pierde lo
  aprendido; el zip de nodejs-mobile y Gradle van con su
  suma. Lo demás de la revisión de seguridad: la captura y el secreto del
  puerto interno son de PROCESO (`Interno`, como Node, que no se reinicia:
  con uno por servicio, Parar y Empezar dejaba a Node pidiendo a un puerto
  muerto), ese puerto atiende 8 conexiones con plazo de 5 s y 50 cabeceras,
  «Código nuevo» cierra y reabre la app (Node leyó el viejo al arrancar) y
  la app no permite tráfico en claro (no lo necesita: el puerto interno es
  un socket). El código viaja en claro por la wifi (no hay HTTPS con una
  IP privada): solo en una wifi de confianza. La 3.61.0 se cerraba al
  abrirse: `libnode.so` pide `libc++_shared.so` y la APK no lo llevaba
  (`-DANDROID_STL=c++_shared` en build.gradle.kts; mirar las NEEDED con
  `llvm-readelf -d`). Desde 3.61.1 un fallo al cargar se enseña en la
  pantalla (`Nodo.fallo`) y un cierre deja `fallo.txt`, que la app enseña al
  volver a abrirla: sin ordenador no hay logcat. «Se cierra sola y deja
  de leer» (22 de octubre de 2026): desde 3.61.5 `Salidas.kt` lee de
  Android por qué se cerró la última vez (ApplicationExitInfo: memoria,
  fallo nativo, ahorro de batería…, con los MB que usaba) y si Node se paró
  (`salida-nodo.txt`); va en la pantalla de la app y, por
  `LECTOR_ULTIMA_SALIDA` y `estadoExtra`, en el `/estado` que lee el
  Diagnóstico del móvil. Node con el lector gasta ~200 MB aquí (Node 18,
  12 lecturas; con hilos o sin ellos casi igual). Hay botón para quitar el
  ahorro de batería y el ImageReader guarda 2 imágenes, no 3. Pruebas: `en-tablet.test` (captura y voz solo
  de 127.0.0.1, portero, Host, la lectura entera con una APK de pega, ocho
  mutaciones), `app/lector.test` y `lector.e2e` (el enlace del QR vincula,
  lee de la tablet con el código y desvincula). Las pruebas del lector
  corren también con Node 18 (el de la APK). NO medible desde aquí: la APK
  en un Android de verdad (no hay emulador sin KVM), si el juego deja
  grabar su pantalla (si saliera negra, sería FLAG_SECURE) y el permiso de
  red local de Chrome hacia una IP de la wifi.
- **La tablet enseña el consejo (3.62.0)**, de las tres propuestas de fondo
  que Javi aprobó («haz las tres»): la app del móvil manda a la tablet
  (`POST /consejo`, solo con el lector en la tablet, `mandarALaTablet`) tu
  pick con los dos siguientes cada vez que cambian (`consejoParaLaTablet`,
  por su huella) y, al apuntar, el resumen de la partida
  (`resumenParaLaTablet`). El lector lo guarda en memoria, saneado a texto
  plano con tope (`sanearConsejo`, `sanearResumen`); la APK lo lee cada 2 s
  (`GET /consejo`, desde 127.0.0.1 con el código) y pinta la BURBUJA
  (`Burbuja.kt`: TYPE_APPLICATION_OVERLAY, FLAG_NOT_TOUCHABLE y opacidad
  0,8, el máximo con el que Android 12+ deja pasar los toques al juego;
  esquina elegible, abajo por defecto, donde no lee nada el lector) y la
  NOTIFICACIÓN del resumen, una vez por partida. Y la APK se ACTUALIZA SOLA
  (`Actualizar.kt`: `releases/latest`, `PackageInstaller`, Android pide
  confirmar y solo acepta la misma firma; si falla, el enlace en el
  navegador). Pruebas: `en-tablet.test` (/consejo: solo la app escribe, la
  APK lee con código, texto limpio, un id raro no pisa), `app/lector.test`
  y `lector.e2e` (la app manda el consejo a la tablet con el código). Lo
  de Kotlin solo se compila aquí. Sin medir: si la burbuja molesta en algún
  momento del draft o de la partida, y si el juego la tolera (como con la
  depuración, no hay constancia de que mire las superposiciones).
- **El parte de salud de la tablet (3.63.0)**, pedido por Javi («algún
  diagnóstico que te pueda llegar directamente»): la APK escribe cada 15 s
  `salud.json` (versión, modelo, si graba, permisos de burbuja y batería,
  memoria libre y la suya); el lector lo lee con campos y tipos fijos
  (`leerSaludDeLaApk`) y lo añade a `/estado` con sus contadores (`lector`:
  minutos, lecturas, capturas fallidas y la última, memoria de Node). La
  app del móvil lo pide cada 10 min y, con la subida activada, lo sube a
  SU incidencia (etiqueta `tablet`, «Salud de la tablet»; `subirParte` en
  useEnvio, con el token de siempre, que no sale de ahí): uno al día si
  todo va igual (`PARTE_CADA_MS`) y en el acto si cambian los avisos, nunca
  dos en `PARTE_MINIMO_MS` (`tocaParte`). `parteDeLaTablet` escribe los
  avisos (cierre que no sea una actualización o tuyo, sin grabar, ahorro
  de batería, memoria baja, más del 20% de capturas fallidas, la APK sin
  señales en 5 min) y quita cualquier IP. Para mirar cómo va: la incidencia
  con la etiqueta `tablet` del repositorio. Pruebas en `en-tablet.test`,
  `app/lector.test`, `app/envio.test` y `diagnostico.test`; siete mutaciones.
- **Actualización sin preguntar y guía (3.64.0)**: `Actualizar.sola` mira
  GitHub al abrir la app y al parar de leer, y si hay una más nueva y NO
  está leyendo (instalar cierra la app), la instala con
  `USER_ACTION_NOT_REQUIRED` (Android 12+, permiso
  `UPDATE_PACKAGES_WITHOUT_USER_ACTION`): sin confirmar solo si la versión
  instalada la puso la propia app, así que la primera vez Android pregunta.
  La pantalla es una GUÍA: seis pasos que se marcan solos (avisos, batería,
  burbuja, grabando, el móvil ya lee —`/estado` con lecturas— y jugar), cada
  uno con su botón. El README explica Lector MLBB para quien no es Javi.
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

## Qué Lector MLBB contesta (3.65.2)

El parte del 22 de octubre (#148) dijo «Todo bien» con versión, lecturas y
memoria en «?». La APK publicada (3.64.1, mirada por dentro: `servir.mjs`
con `memoriaMB`, `en-tablet.mjs` con `leerSaludDeLaApk`) estaba bien, así
que contestó una APK anterior a 3.63.0: sin bloque `lector` ni `tablet` en
`/estado`, y sin actualizarse sola (eso llegó en 3.64.0).
- `queApk` (lector.js) lo deduce: sin `lector`, 'antigua'; con `tablet.apk`
  anterior a la última publicada, 'atrasada'.
- La última sale de `pedirUltimaApk`: releases/latest, SIN token, solo una
  etiqueta `lector-vX.Y.Z`.
- El parte lo dice como aviso, y Ajustes → Lector en la tablet enseña la
  versión con el enlace fijo `DESCARGA_APK`.
- Con la app abierta dos veces, cada pestaña subía su parte: dos comentarios
  en un segundo. `conLoDeOtraPestana` (envio.js) mira lo guardado antes de
  subir y toma la incidencia de la otra pestaña.
- Pruebas en `app/lector`, `app/envio` y `lector.e2e`, siete mutaciones. Lo
  que no está probado es el cableado de `useEnvio`: es de una línea.
- La prueba de que mDNS acaba al plazo medía el reloj de pared, y las
  pruebas con `spawnSync` del mismo fichero bloquean el bucle: en un
  contenedor nuevo fueron 11,6 s contra un tope de 10 (23 de octubre). Hoy
  se compara con un temporizador del mismo plazo, que sufre el mismo
  bloqueo. Caza un cuelgue (+30 s); +4 s quedan tapados por el bloqueo.
- Desde 3.65.3 Ajustes nunca se calla. Javi vio solo «Vinculado con la
  tablet en …», sin línea de versión: o no contestaba la tablet o no se sabía
  la última, y `queApk` daba 'nose' en los dos casos. Hoy hay 'sinRespuesta'
  (con el `tipo`, y el aviso de `claveDeFallo`) y «Volver a mirar». Con
  'nose' se dice al menos tu versión. Prueba en `lector.e2e`, dos mutaciones.
- Las incidencias #142, #143 y #145 eran la MISMA lectura subida tres
  veces, y la tercera con todo en «?». El efecto de `/corregir` (App.jsx) se
  rearma al recargar: `corregido` es un ref, así que con el draft ya
  completo vuelve a corregir y a subir. Además corría antes de cargar el
  catálogo, y `cuerpoDePicks` saca los nombres de él.
  Desde 3.65.3:
  - espera a `datos.heroes`;
  - `subirAparte` con `id` (`picks:<completoDesde>`) sube una vez: lo
    recuerda en `roam-picker:envio` (`subidas`, hasta `MAX_SUBIDAS`) y lo
    consulta también en lo guardado por otra pestaña.

## La tablet cambia de IP (3.65.4)

El router le dio a la tablet otra dirección (de .116 a .112, 23 de octubre
de 2026) y la app se quedó vinculada a la vieja.
- `buscarTabletEnLaRed` (lector.js) pregunta `/estado` SIN código a las otras
  253 IP de la misma /24, en el mismo puerto, de 32 en 32 (1,5 s de plazo).
  Solo a la que contesta 401 con `error: 'codigo'` le manda el código; vale
  si contesta `ok`. Así el código no se manda a cualquier aparato de la casa.
- `buscarTabletUnaVez` deja una búsqueda a la vez y como mucho cada
  `ENTRE_BUSQUEDAS_MS` (2 min).
- La lanzan App.jsx, al abrir y cada 5 min si `/estado` no llega
  (`sinLlegarALaTablet`), y Ajustes («Buscando la tablet…»). Con lo que
  encuentran, `setLectorTablet`. Ese setter es estable desde ahora
  (`useCallback`): está en las dependencias de los dos efectos.
- En el lector, el `crearPortero` sin código devuelve 'no' SIN contarlo
  como fallo: no se adivina nada. Una APK anterior cuenta cada búsqueda
  como un fallo, de 10 en 10 minutos.
- Pruebas en `app/lector`, `en-tablet` y `lector.e2e`. La prueba de
  navegador empieza en BANEOS, porque en picks el panel de Ajustes está
  montado aunque plegado y la búsqueda de fondo sobrevivía a su mutación.
  Apunta el código de cada IP ANTES de cortar la petición: si no, mandarlo a
  todas sobrevivía. Cuatro mutaciones.

## La pantalla de la APK y la burbuja en baneos (3.65.5)

- Con `targetSdk 35` Android 15 obliga a dibujar de borde a borde: el
  contenido va por debajo de la barra de estado y de la de navegación. Javi:
  «en tablet se me tapan las primeras frases de arriba». `Principal.kt` pone
  de margen los `systemBars | displayCutout` en el `ScrollView`
  (`setOnApplyWindowInsetsListener`) y `clipToPadding = false`.
- Con `screenWidthDp >= 720`, dos columnas: la guía, y vincular más los
  ajustes. Cada bloque en una tarjeta (#1C1C1E, 14 dp). Arriba, la versión
  instalada.
- El Kotlin se compila aquí (`./gradlew --offline :app:compileReleaseKotlin`,
  hay un SDK en /opt/android). Si se mira en un Android de verdad, solo en
  la tablet.
- En la fase de baneos `consejoParaLaTablet` manda «Banea: A · B · C» (los
  tres primeros de `rec.baneosSugeridos`) y tu nº1 de ahora en el detalle.
  Sin sugeridos (los diez ya puestos) o en picks, lo de siempre. Prueba en
  `app/lector`, una mutación.

## Un solo aparato (3.66.0)

Elegido por Javi para «la app definitiva para todo aficionado»: la mayoría
juega en el móvil, sin tablet aparte. `scripts/lector/solo.mjs`:
- `acumularDraft` (puro) junta las lecturas:
  - baneos de los dos lados, sin repetir;
  - huecos por jugador: lo leído pisa al de antes, un «?» no borra, y si
    cambian más de `CAMBIOS_A_LA_VEZ` huecos ya leídos es la fase de skins y
    no se toca ese equipo;
  - tu fila;
  - el cierre con `EN_PARTIDA_PARA_CERRAR` (2) lecturas en partida;
  - otro draft pasados `MINUTOS_PARA_OTRO_DRAFT` (3) con algo leído (las
    pantallas del final no leen nadie), o si el draft lleva
    `MINUTOS_DRAFT_ABANDONADO` (15) sin moverse.
- `consejoSolo` pasa el draft a `recomendar` (draft.js, el único cerebro) y
  saca el mismo texto que `consejoParaLaTablet` de la app: en baneos los tres
  de `baneosSugeridos`, en picks tu nº1 con los dos siguientes.
- `crearSolo` es el bucle (`INTERVALOS_SOLO`: 5 s en draft, 12 s sin draft,
  20 s en partida, 30 s tras un fallo). Se aparta si el móvil hizo `/leer` o
  `POST /consejo` hace menos de `MOVIL_ACTIVO_MS` (60 s), y no pisa el
  consejo del móvil.
- Pide la lectura con `rapida`: `hacerLectura` (servir.mjs, la de `/leer`
  sacada a función y en `servidor.interno`) devuelve solo `partida` sin
  reconocer caras cuando ve el minimapa.
- La línea la elige la APK (`Solo` en Principal.kt, «Sin móvil»). Se guarda
  en `solo.json` en la casa, y `leerAjustesSolo` lo valida en cada vuelta.
  Sin línea, apagado.
- Los datos: dentro de la APK (`copiarLector` copia `public/data/heroes.json`
  y `roam-meta.json` a `datos/`), y `bajarDatos` (en-tablet.mjs) los trae de
  la web pública cada `REFRESCAR_DATOS_MS` (6 h) a la casa, solo si tienen
  forma (`datosValidos`). Es el único sitio al que la APK pide algo fuera de
  127.0.0.1 y GitHub: dos URL fijas de github.io, solo GET.
- `apk.yml` NO escucha `public/data/**`: los datos de dentro solo sirven para
  el primer arranque, y con ellos la APK se recompilaría dos veces al día.
- Lo que NO hace sin el móvil: la voz del guion y aprender de las
  correcciones (las pide la app). Apuntar la partida, desde 3.70.0 sí (abajo).
- Pruebas en `scripts/solo` y `en-tablet`. Esta última es de punta a punta:
  la captura real, la línea en `solo.json` y el consejo en `GET /consejo`.
  Siete mutaciones. Sobrevive una inofensiva: el filtro de «ya baneados»
  repite lo que `baneosSugeridos` ya hace.

## La burbuja y el HTTP en claro (3.68.1)

- Android (targetSdk ≥ 28) bloquea el HTTP en claro, también a 127.0.0.1.
  La APK habla con su propio Node por `http://127.0.0.1:47323` (burbuja y
  guía), así que `res/xml/red.xml` (`networkSecurityConfig`) lo permite SOLO
  a 127.0.0.1; el resto sigue prohibido. Nunca `usesCleartextTraffic`.
- `pruebas/scripts/android.test.mjs` lo exige por forma si algún `.kt` usa
  `http://127.0.0.1`; dos mutaciones (sin config, un dominio de más).
- `Burbuja.estado` («enseñando», «esperando consejo», «no llega al lector:
  …», «Android no deja pintarla: …») va en `salud.json` (`burbujaEstado`,
  `leerSaludDeLaApk`), en el parte (aviso con los de fallo) y en el botón de
  la APK. Pruebas en `en-tablet` y `app/lector`, tres mutaciones.

## La fase en la burbuja (3.69.2)

Pedido por Javi «para saber que está funcionando bien». La segunda línea del
consejo empieza por «Fase de baneos» o «Fase de picks»: en la app
(`consejoParaLaTablet`, por la `fase` del draft, también con los diez
baneos puestos) y en la tablet sola (`consejoSolo`, por lo leído). Va en el
texto y no en un campo nuevo para que la APK ya instalada lo pinte sin
actualizarse. Pruebas en `app/lector`, `scripts/solo` y `en-tablet`, cuatro
mutaciones.

**Fuera mientras se juega (3.69.2)**, pedido por Javi («que no moleste
mientras juegue»): en partida no hay sitio libre (minimapa, marcador,
joystick, habilidades, y abajo en el centro va tu héroe) y la burbuja no
tiene nada que decir hasta el draft siguiente. `servir.mjs` cuenta las
capturas SEGUIDAS con el minimapa (`anotarPartida`: de `/leer`, del modo
solo y de la vigilancia) y con `EN_PARTIDA_PARA_ESCONDER` (2, las mismas que
cierran el draft) `GET /consejo` da `consejo: null` y `enPartida: true`; la
primera captura sin minimapa (la tabla, el draft siguiente) lo devuelve. Una
APK de antes la quita igual (sin consejo, se quita); la nueva dice
«escondida mientras juegas». Prueba en `puente-lector` con una pantalla de
juego real; cinco mutaciones.

## La tablet sin el móvil delante (3.69.3)

Javi, tras la 3.69.2: «sigue apareciendo la burbuja en mitad de partida, y
no llega a detectar bien los picks y bans. Tengo que abrir la app web». Las
partidas de ese día (de la app) leían bien; lo de la tablet sola no dejaba
rastro. Dos causas:
- La burbuja solo se quitaba si alguien capturaba. Con la app del móvil
  cerrada o con la pantalla apagada y sin línea en «Sin móvil», nadie lo
  hacía y el último consejo se quedaba toda la partida. Hoy
  `interno.mirarPartida` (servir.mjs) hace un VISTAZO (captura y
  `enPartida`, sin reconocer caras) si hay consejo y nadie capturó en
  `VISTAZO_MS` (10 s); en-tablet.mjs lo llama cada 10 s. Los vistazos
  cuentan aparte (`salud.vistazos`): como lecturas, la guía de la APK diría
  que el móvil lee.
- El modo solo solo leía con la línea elegida en la APK. Hoy la app manda
  `ajustes` (línea, rango, idioma) con cada consejo, `sanearAjustes` los
  valida, `ajustesDeLaTablet` (en-tablet.mjs) los guarda en
  `solo-movil.json` para después de un reinicio y `ajustesEfectivos`
  (solo.mjs) decide: la de la APK si hay; si no, y sin «Apagado»
  (`apagado`, `activo: false` en solo.json), la del móvil.
- `/estado` lleva `solo` (`resumen` de crearSolo: activo, línea y de dónde,
  si se aparta por el móvil, lecturas y lo último leído) y el parte lo dice
  en una fila «Sin móvil»; sin línea, aviso.
- Pruebas en `puente-lector` (vistazo con una pantalla de juego y otra del
  draft), `solo`, `en-tablet`, `app/lector` y `lector.e2e` (el consejo lleva
  la línea). Quince mutaciones; sobrevive una inofensiva: sanear la línea
  guardada repite lo que `ajustesEfectivos` ya hace.

## Todo desde la tablet (3.70.0)

Pedido por Javi: «que ya no haga falta el móvil para nada… solo abrir el apk
y jugar». Lo único que no se quita es el toque de Android para grabar la
pantalla (lo exige el sistema cada vez, y pulsarlo solo sería tocar la
pantalla por programa).
- **Arrancar**: `Principal.onResume` pide grabar al abrir (una vez por
  pantalla, `pedidoAlAbrir`), pero solo si `Actualizar.sola` no tiene versión
  que instalar: se actualiza solo sin leer, y grabando nada más abrir no se
  actualizaría nunca. Al empezar abre Mobile Legends (`JUEGO`,
  `com.mobile.legends`, `<queries>` en el manifiesto; botón para quitarlo,
  `abrirJuego`). Solo se ABRE: nada lo toca.
- **Apuntar sola**: `crearSolo` (solo.mjs), al cerrarse el draft por la
  partida y sin el móvil activo, llama a `interno.vigilar` (la misma
  vigilancia del final que pide la app) con el instante del cierre y guarda la
  decisión (`decidirSolo`, la misma que da el consejo). Con `final.resultado`
  apunta UNA vez `partidaSolo` (forma de `apuntar` de registro.js: pick de tu
  fila o el nº1 `supuesto`, tres recomendados, estimación y `VERSION_MODELO`,
  baneos, draft, duración solo con el inicio visto; `origen: 'lector'`,
  `fuente: 'tablet'`) y pone el resumen (`resumenSolo`, la notificación).
- **Tu maestría**: la app la manda en `ajustes.maestria` (`maestriaUsada`, 200
  como mucho; `sanearAjustes` exige nombre, partidas y winrate con forma) con
  la hora (`cuando`); la tablet decide con `maestriaEfectiva(esa, lo que
  apuntó DESPUÉS)`: lo de antes ya va dentro y contaría dos veces.
- **Guardar y subir**: `partidasDeLaTablet` (`partidas.json` en la casa, tope
  `TOPE_PARTIDAS_TABLET` 500, `subidas` aparte) y `subirLoDeLaTablet` con TU
  clave (`ajustes.clave`, solo con «Guardar mis partidas» puesto en la app) y
  `comunidad.json` (bajado de la web con los datos o el que trae la APK),
  saneados con `sanearConfig` de src/app/basedatos.js. Sin clave no sube
  nada; un fallo no marca nada y se reintenta cada 10 min.
- **De vuelta al móvil**: `useComunidad` trae al abrir (y cada
  `TRAER_CADA_MS`, 5 min) `mis_partidas`, se queda con lo que no está aquí ni
  se quitó, y App lo funde con `fundirPerfil`. La primera versión cancelaba
  la respuesta al rearmarse el efecto (al llegar `comunidad.json` la
  configuración es otro objeto) y el tope impedía pedirla otra vez: no llegaba
  nunca. Lo cazó la prueba de navegador con la base de datos contestando
  después de `comunidad.json`, el orden de un móvil de verdad.
- **La APK lleva lo que importa el lector**: `copiarLector` copia también
  `src/app/basedatos.js` y `public/comunidad.json`. `android.test` recorre
  los imports de en-tablet.mjs y exige que cada fichero vaya en la copia: uno
  sin copiar tira la APK al arrancar y desde aquí no se ve.
- Pruebas en `solo` (el recorrido entero con un final de pega, una vez, con
  el móvil leyendo no), `en-tablet` (guardar, subir con el Supabase de
  pega, sin clave, sin red, tope), `puente-lector` (maestría y clave con
  forma), `android` y `comunidad.e2e`. Diecisiete mutaciones; sobrevive una
  inofensiva: filtrar las quitadas al traer repite lo que `fundirPerfil` hace.
- Sin hacer todavía: la voz del guion sin el móvil (sus textos están en la
  app) y aprender de las correcciones (sin el móvil nadie corrige).
- **La revisión de seguridad de 3.70.0** encontró que `buscarTabletEnLaRed`
  (3.65.4) daba el código de vinculación a CUALQUIER aparato que contestara
  401 «codigo» y luego ok: un impostor de la wifi se lo quedaba, y con 3.70.0
  también la clave de jugador (que viaja con el consejo). Hoy la app manda un
  reto (`/reto?n=`, 16 bytes al azar, SIN código) y solo da el código a quien
  devuelve `pruebaDelReto` (PBKDF2-SHA256 del código con «lector-reto:» + n,
  `RETO_VUELTAS` 100.000: con una prueba no se adivina el código en años).
  El lector la calcula con node:crypto y la app con WebCrypto: `en-tablet`
  exige que den lo mismo. Tope `RETOS_POR_MINUTO` (6) por aparato. Una APK
  anterior no tiene `/reto`: si cambia de IP antes de actualizarse, no se
  encuentra sola (fallo seguro). Pruebas en `app/lector` y `lector.e2e` (un
  impostor que dice ok a todo no recibe nada) y `en-tablet`; cinco mutaciones.
- **A dónde llama el lector de la tablet**: `android.test` recorre lo que
  importa en-tablet.mjs y exige que cada `fetch(`/`pedir(` esté en su lista
  (el puerto interno, `DATOS_DE_LA_WEB` en github.io, `config.url` de la base
  de datos, que pasa `sanearConfig`). fetch es global: la lista de imports
  permitidos no lo limitaba.

## La voz y el aprendizaje sin el móvil (3.71.0)

Pedido por Javi: «haz también la voz sin el móvil y que poco a poco vaya
mejorando la app sola». Lo que faltaba de 3.70.0: la voz y aprender de las
correcciones, que pasaban los dos por la app del móvil.
- **La voz**: al cerrarse el draft, `crearSolo` manda a `interno.vigilar` el
  guion de `guionSolo` en vez de `{ guion: [] }`. Es el MISMO plan
  (`rec.partida` de `recomendar`) traducido con los MISMOS textos:
  `crearT` y `guionTraducido`, que se mudó de lector.js a
  `src/app/i18n/guion.js` (lector.js lo reexporta) para que la APK lo
  lleve sin React. `copiarLector` copia `src/app/i18n/{index,es,en,guion}.js`.
  El plan es el de `eleccion` (tu pick si es de tu línea; si no, no hay
  guion, como en la app). OJO: `recomendar` no devuelve `yo` (eso es de
  `useRecomendacion`); con `rec.yo` el guion salía siempre vacío, y lo cazó
  la prueba que compara con el de la app.
- **Callar**: `callar` de `ajustesEfectivos` = «Voz en partida» de la APK
  (`voz: false` en solo.json, que `Solo.guardar` conserva al cambiar de
  línea) O `vozCallada` del móvil (va en los ajustes de `/consejo`;
  `sanearAjustes` solo acepta `true`).
- **Enseñar al lector**: el draft guarda los `ids` de sus lecturas (hasta
  `IDS_POR_DRAFT` 20, con forma `lectura-…`; las de partida no traen captura).
  Al cerrarse, `correccionDelDraft` dice cuántos faltan (enemigos y tu
  equipo sin leer, con tu fila) y, si falta alguno, `interno.ponerCorreccion`
  lo guarda (saneado, `sanearCorreccion`: como mucho `CAPTURAS_A_MIRAR` ids
  y la lista de héroes del catálogo). Al apuntar, sabe de qué partida es y la
  notificación del resumen lo dice; tocarla abre la APK, donde la tarjeta
  «Enseña al lector» (Principal.kt, `AutoCompleteTextView` con los héroes)
  pide quién era. `GET`/`POST /correccion` solo para la APK (`deLaApk`:
  127.0.0.1 y SIN `Origin`, que un navegador siempre pone; y el código del
  portero): héroes del catálogo, sin repetir, con enemigos, del mismo `id`.
  Contestar llama a `corregir` (el MISMO aprendizaje que `/corregir` del
  móvil, con sus guardas) y a `alCorregir`, que arregla el draft de la
  partida en partidas.json y la vuelve a subir (si tu pick era otro, sin la
  estimación de otro héroe). La partida se arregla ANTES de aprender: si
  aprender falla, lo que dijiste sigue siendo la verdad. Las capturas de la
  corrección no se podan mientras valga (`RETENCION_CAPTURAS_MS`, 3 h);
  pasado eso no se pregunta: sin capturas no hay de qué aprender. «Ahora no»
  la descarta.
- Pruebas: `solo.test` (el guion es el de la app, en los dos idiomas y
  callado; la corrección con sus ids, cuántos faltan y su partida),
  `en-tablet.test` (quién puede leer y contestar, qué aprende, la poda, la
  partida arreglada) y `lector.e2e` (la app manda `vozCallada`). 37
  mutaciones, todas cazadas; una sobrevivía al principio porque la prueba
  del id sin forma se hacía con el tope ya lleno.
- La revisión de seguridad no encontró nada serio; sí dos cosas, arregladas:
  el POST vuelve a mirar la corrección DESPUÉS de leer el cuerpo (una nueva
  llegada entretanto se perdía; prueba con el cuerpo a medias, mutación
  cazada) y, sin tu fila leída, la tarjeta mandaba cinco compañeros y el
  servidor la rechazaba: hoy enseña cuatro y «Tú» aparte.
- NO hace, a propósito: aprender de sus PROPIAS lecturas sin que nadie diga
  la verdad (ver `descartados.md`). Lo que se aprende lo dice una persona.

## Una sola petición de grabar y el fallo arriba (3.72.1)

«Al darle a pantalla completa la app se cierra», y al abrirla otra vez, igual.
Causa más probable (ver errores.md): dos peticiones de grabar a la vez, la sola
de 3.70.0 y el toque. `Principal.pidiendo` deja una sola, `Lector` no usa un
segundo permiso si ya graba, y el arranque de la grabación va en `try`
(`fallo-grabar.txt`, el servicio se para en vez de tirar la app). El aviso
rojo de arriba (`falloSinVer`: `Salidas.falloDesde`, `salida-nodo.txt`,
`fallo-grabar.txt`, `fallo.txt`, posteriores a «Ya está», `fallosVistos`)
lleva «Copiar» con versión, Android y modelo, y mientras se vea no se pide
grabar sola. Pruebas de forma en `android.test` (cinco mutaciones). Antes de
tocar la grabación se probó el lector entero con Node 18 (el del APK) y una
APK de pega con capturas reales: draft, partida, voz y corrección van bien.
- **Los errores de Node no cierran la app (3.72.2)**: «código 1, estado 1»
  (`REASON_EXIT_SELF`, salida 1) era Node saliendo por un error sin recoger,
  que en nodejs-mobile se lleva el proceso. `vigilarErrores` escucha
  `uncaughtException` y `unhandledRejection`, apunta `fallo-nodo.txt` (el
  aviso rojo lo enseña) y sigue; si `principal()` falla, Node se queda vivo.
  «Copiar» añade las últimas 40 líneas de `lector.log`. Comprobado con Node
  18: arranque fallido, promesa y excepción sueltas, y el proceso sigue.
- **El arranque vigilado (3.72.3)**: con 3.72.2 seguía «código 1, estado 1».
  `vigilarErrores` se ponía DENTRO de en-tablet.mjs, así que un fallo al
  CARGAR sus imports (o en la evaluación de alguno) salía antes de existir.
  Nodo.kt arranca hoy `arranque-apk.mjs`: solo `node:fs` y `node:path`, pone
  los vigilantes y luego `import('./en-tablet.mjs')` y `principal()` dentro de
  un `try`; lo que falle va a `fallo-nodo.txt` y Node se queda vivo.
  `android.test` recorre los imports desde lo que arranca Nodo.kt (también
  los `import()`) y exige el orden. Comprobado con Node 18 sobre la copia de
  la APK: arranca igual y, con un import roto a propósito, sigue vivo y
  apunta `ERR_MODULE_NOT_FOUND`.
- **El Node de la APK no entiende las clases de propiedad Unicode (3.72.4)**:
  la regex de nombres de `sanearAjustes` (3.70.0) no compilaba en
  nodejs-mobile y Lector MLBB se cerraba al empezar a grabar. Hoy
  `NOMBRE_DE_HEROE` (servir.mjs) lista los caracteres (latinas con tilde,
  cifras, espacio, . ' & -; los 133 nombres pasan) y `android.test` prohíbe
  barra-p/P y el indicador `v` en todo el grafo que carga la APK (falla con
  el código de 3.72.3). El Node de escritorio sí las entiende: probar con él
  no basta para esto.

## Cuando no se ve el final (3.73.0)

Javi: «hay veces que no terminas la partida y ya se rompe el programa porque
se queda esperando al ganado o perdido». Dos causas:
- **Sin el móvil, la victoria no se reconocía nunca**: de serie solo va la
  derrota, y la victoria se aprendía de un «Gané» de la app del móvil. Sin
  resultado, la vigilancia esperaba hasta su límite y la partida no se
  apuntaba. Hoy `crearSolo` PREGUNTA (`preguntar`, una vez por partida) si
  vio la tabla sin palabra conocida (`acabada`, ahora en `/final`), si la
  vigilancia acabó sin tabla con la partida empezada, o si empieza otro draft
  sin resultado. `interno.ponerPregunta` (servir.mjs, `sanearPregunta`) y la
  notificación (`resumenPregunta`); la APK enseña «¿Cómo acabó tu partida?»
  (Gané / Perdí / No la terminé, `GET`/`POST /pregunta`, solo `deLaApk`). Con
  la respuesta el lector deja de vigilar, aprende la tabla de esos
  fotogramas (`aprenderDelFinal`, lo mismo que `/resultado`) y el modo solo
  la recoge UNA vez (`interno.respuesta`) y apunta (`apuntarVigilada`).
  Caduca con las capturas (`RETENCION_CAPTURAS_MS`).
- **El draft siguiente esperaba al reloj**: `acumularDraft` solo abría otro
  pasados 3 min del cierre (o 15 sin moverse), así que el siguiente no
  entraba a tiempo y, tras un abandono en pleno draft, se mezclaba con el
  anterior. Hoy guarda los baneos por hueco (`banHuecos`) y abre otro con
  `BANEOS_DE_OTRO_DRAFT` (2) huecos de baneo con otro héroe o, tras la
  partida, dos baneos que no estaban. Dos y no uno: un baneo mal leído (1 de
  338 medidos) no tira el draft. La pantalla de carga (sin baneos) no abre
  otro.
- Pruebas en `solo` (los tres caminos de la pregunta, la respuesta una vez,
  «No la terminé», el draft siguiente por baneos, el abandono, un baneo mal
  leído), `puente-lector` (la tabla real sin palabra: la pregunta, quién la
  ve, 409/400, se aprende la victoria y se deja de vigilar) y `android`.
  Quince mutaciones; sobrevive una inofensiva: con «No la terminé»
  `partidaSolo` ya no apunta sin resultado.
- **Lo que la tablet no decía (iteración del 25 de octubre de 2026, 3.73.1)**:
  (1) `lectorDeDatos` cogía el primer meta válido (los bajados delante), así
  que con la descarga rota decidía con datos viejos aunque la APK trajera
  unos más nuevos: hoy el de mayor `generatedAt`, con el catálogo de su
  carpeta, y `de` dice cuál. (2) `subirLoDeLaTablet` sin clave devolvía «0
  subidas» sin rastro: las partidas se quedaban en la tablet, sin llegar a la
  base de datos, al móvil ni al bot del modelo. `/estado` lleva hoy `datos`
  (fecha y de dónde) y `partidas` (apuntadas, sin subir, si hay clave, el
  último error) y la APK lo enseña en «Sin móvil» (`textoDeCuenta`); el
  registro lo dice una vez, y se sube a los 30 s de arrancar. Pruebas en
  `en-tablet` y `android`, cuatro mutaciones (una sobrevivía hasta exigir
  el «de dónde» exacto).

## El parte de salud (3.74.0)

`en-tablet.mjs` sube cada `PARTE_CADA_MS` (15 min; el primero a los 2) un
`parteDeSalud`: `/estado` entero (`interno.estado()`, que ya lleva
`pendiente`: corrección, pregunta, vigilando), `fallo-nodo.txt` y las
últimas `LINEAS_DEL_PARTE` de `lector.log` (los dos en `filesDir`, la
`LECTOR_CASA`). `lineasLimpias` quita caracteres de control, IPs (`[ip]`) y
el código y la clave (`[oculto]`), y corta a 300. Sin clave de jugador
válida o sin `comunidad.json` no sube nada. Va a `config.url` (la base de
datos) por `llamar`, como las partidas: ningún destino nuevo. Pruebas en
`en-tablet` (el parte limpio y la subida de punta a punta con el Supabase
falso) y `revisar-tablet`; 20 mutaciones, sobrevive una inofensiva: quitar
la guarda de la clave en `subirSuParte` la hace `subirParte` igual.

**La clave del lector (3.74.1)**: el parte va con `claveDelLector(casa)`
(`clave-lector.txt`, al azar con `crearClaveDeJugador` y `randomBytes`), no
con tu clave de jugador: la base de datos tenía 0 jugadores el 26 de octubre
de 2026, así que con la tuya no habría llegado ni uno. Siempre la misma, con
tu clave o sin ella (la revisión agrupa por lector), y tu clave también se
tapa en el parte. Cinco mutaciones, todas cazadas.

**Lo que la revisión no veía (3.74.2, silent-failure-hunter)**: (1) el
parte no tenía tope total y con un `fallo-nodo.txt` largo pasaba de los
16.000 bytes de `subir_parte`: se rechazaba justo con un fallo. Hoy
`parteDeSalud` cabe en `TOPE_PARTE_BYTES` (12.000): quita líneas del
registro, luego acorta el fallo a 2.000 y luego errores, y marca
`recortado` (la revisión lo avisa). (2) Con una lectura cada 5 s, 60
líneas son 5 minutos y el parte sale cada 15: los errores van aparte
(`errores`, los 10 últimos de `LINEA_DE_ERROR`, la misma expresión en la
revisión), del final del registro (`FINAL_DEL_REGISTRO_BYTES`, 256 KB).
(3) `revisarParte` avisa si `salud.json` lleva más de `SALUD_CALLADA_MIN`
sin escribirse con la tablet grabando (el hilo «salud» de Lector.kt traga
sus errores), si no hay fecha de datos, y lee `ultimoFallo.que` (salía
«[object Object]»). Doce mutaciones, todas cazadas tras apretar dos.

**Lo que se perdía sin el móvil (3.74.3, silent-failure-hunter)**: (1) la
APK guarda UNA pregunta: la de antes sin contestar se pierde, y hoy se
registra; la pregunta caduca a las `PREGUNTA_CADUCA_MS` (= la
`RETENCION_CAPTURAS_MS` de servir, con prueba) y también se registra; la
contestada tarde va con `resultadoEn`, o el inicio más la duración, o el
cierre del draft, nunca la hora de contestar (`t` es la identidad). (2)
La corrección contestada con la partida en marcha (`partida` null) se
guarda en servir (`correccionContestada`, se recoge una vez) y
`apuntarVigilada` la aplica con `alCorregir` (nuevo en `crearSolo`, que
en-tablet pasa) y no vuelve a poner la tarjeta. (3) `interno.leer` cuenta
en `lecturasSolo`: `lecturas` es solo del móvil (la APK lo usa para el paso
«el móvil lee»); la revisión suma las dos para las capturas fallidas.
Trece mutaciones; tres sobrevivían hasta poner id de captura en la
prueba, contar `lecturasSolo` en la revisión y mirar el cableado de
`alCorregir` en en-tablet (prueba de forma).

**Escribir PNG sin ir píxel a píxel (3.74.4)**: `escribirPng` copiaba cada
píxel con `subarray` y, con paleta, buscaba su color en un Map por
`join()` de cadena: era lo más caro de `directo-lector` (62 s) y de los
recortes y miniaturas de la tablet. Hoy los bytes de cada fila van tal
cual (RGBA) o como índice (clave numérica de 32 bits), y con filtro 0 la
fila se copia entera. Byte a byte igual que antes en 1.200 casos al azar
(RGBA y paleta, con y sin Adam7, los cinco filtros, más de 256 colores),
6 veces más rápido con RGBA y 4 con paleta. Cuatro mutaciones; sobrevive
una inofensiva (con filtro 0 el bucle general da lo mismo).

**Los primeros partes de verdad (26 de octubre de 2026, 3.74.5)**: siete
partes de la tablet de Javi (APK 3.74.3 y 3.74.4, 176–237 lecturas del
modo solo, Node 480–770 MB sin crecer, 6,5 GB libres). La revisión daba dos
FALLO que eran ruido: `fallo-nodo.txt` se queda en la tablet, y el del 25
de octubre (el de 3.72.4) salía en cada parte; hoy el fallo se fecha (su
primera palabra) contra el arranque (`cuando` − `lector.minutos`): de este
arranque es FALLO, del anterior AVISO durante `FALLO_ANTERIOR_H` (24 h) y
luego nada. Y «no está grabando la pantalla» (el modo solo lo intenta sin
grabar) es el uso (`NO_ES_FALLO`). `recortado` solo cuando se acorta el
fallo o los errores: quitar líneas viejas del registro es lo normal (las de
lectura pasan de 200 caracteres). Seis mutaciones, todas cazadas.

**Las partidas con la clave del lector (3.74.6, decidido por Javi: «la 2,
hazlo tú»)**: sin tu clave del móvil, `subir` usa `claveDelLector` (la de los
partes): las partidas llegan a la base de datos y cuentan para
`proponer-modelo`, pero `mis_partidas` del móvil no las trae. Con tu clave,
las nuevas van con ella; las ya subidas se quedan con la del lector.
`/estado` dice `deQuien` ('tuya'|'lector') y la APK lo explica. `principal`
recibe `pedirBaseDeDatos` (el fetch de la base de datos): las pruebas
cambiaban `globalThis.fetch` y, como el arnés corre las asíncronas a la
vez, se pisaban (la de 3.74.1 pasaba de suerte). Tres mutaciones.

## Mis partidas y la guía en la APK (3.75.0)

Javi: «un log de las partidas con sus fechas, picks… que pueda ver desde el
apk y que sea lo que está en la base de datos… que pueda modificar… y que
esos cambios se apliquen también en el log del programa para mejora», y «me
ha costado encontrar eso de apuntar mis partidas. Haz una suite en el apk
paso por paso».
- `GET /partidas` y `POST /partida` (servir.mjs, solo `deLaApk`, con
  `historial` que pasa en-tablet). `listarPartidas` trae `mis_partidas`
  con la clave con la que sube (`claveConLaQueSube`) y pone ENCIMA lo que la
  tablet aún no subió (`sinSubir`); sin base de datos, lo de la tablet
  (`de: 'tablet'`). Hasta `PARTIDAS_EN_LA_APK` (200) y la lista de héroes.
- `sanearEdicion`: solo héroes del catálogo (en su grafía), sin repetir
  entre pick, enemigos y compañeros, ≤5/4/10. `partidas.editar` cambia la
  partida (si solo estaba en la base de datos, la trae), quita la
  estimación si cambia el pick, marca `editada` y la vuelve a subir.
- Si cambia el RESULTADO, `interno.aprenderResultadoDe(desde, gane)`
  aprende la tabla de ESE draft (`final.desde === desde`, con sus
  fotogramas aún sin podar, 3 h) con `aprenderDelFinal`, que además quita
  las plantillas del otro resultado que se le parezcan. Por eso la partida
  apuntada sola guarda en la tablet `desde` y `resultadoDe` ('tabla' |
  'pregunta'); la base de datos no los guarda (`paraLaComunidad`).
  `/estado.partidas` cuenta `porTabla` y `porPregunta`, y la revisión
  avisa si más de `PREGUNTADAS_MAX` (0,5) de al menos
  `RESULTADOS_PARA_MEDIR` (5) se preguntaron.
- La APK: `Partidas.kt` (lista, tocar abre el editor con Gané/Perdí, pick,
  5 enemigos, 4 compañeros y 10 baneos con autocompletar) y `Guia.kt`
  (`SECCIONES`: qué es, configurarlo paso a paso, draft, partida, cuando
  no está seguro, Mis partidas, la base de datos, el móvil, mantenimiento;
  se abre sola la primera vez, `guiaVista`). Botones arriba en Principal.
  `android.test` exige que cada Activity esté en el manifiesto y que solo
  `Principal` sea `exported`.
- Lo que NO hace: un arreglo en la tablet no cambia la copia que ya tenga
  el móvil (`fundirPerfil` no pisa lo suyo); eso es la 3.76.0 (el móvil
  como centro de mando con la misma clave). Y arreglar los héroes de una
  partida vieja no enseña caras: sin sus capturas (3 h) no hay de qué.
- Pruebas en `en-tablet` (lista con lo pendiente encima, 403 desde un
  navegador, editar la de la tablet y la de la base de datos, volver a
  subir, 400/404, aprender solo si cambia el resultado), `solo` (`desde` y
  `resultadoDe`), `puente-lector` (aprende solo con las pantallas de ese
  draft), `revisar-tablet` y `android`. Catorce mutaciones; cinco
  sobrevivían hasta hacer fallar la subida durante la prueba y mirar
  `desde`/`resultadoDe`.

## El sistema de un vistazo y tus números en la tablet (3.77.0)

Javi: «investiga nuevas funcionalidades y mejora todo el sistema». Las apps
parecidas (MLBB Support, Coach Legend, MLBBHub; en LoL, Porofessor y
Mobalytics) tienen draft, counters y estadísticas personales, que el sistema
ya tenía; lo que les falta a casi todas es seguir al jugador entre partidas.
- `lineasDelSistema` (lector.js, pura): de `/estado` (que
  `pedirEstadoLector` trae ahora también con `partidas`, `datos` y `solo`)
  las líneas de «El sistema» en Ajustes → Lector en la tablet
  (LectorTablet.jsx), con `mal` en rojo: sin grabar, «Sin móvil» apagado,
  más del 20% de capturas fallidas, partidas sin subir con error, datos de
  más de 72 h. Una APK que no lo dice no sale.
- `/partidas` lleva `numeros` (`tusNumeros` de habitos.js con TODAS las
  partidas, el mismo cálculo que «Tus números» del móvil) y `Partidas.kt`
  lo pinta arriba: racha, hoy, tras perder (afirmado solo con `seVe`) y los
  héroes con `lado`.
- `resumenSolo(…, numeros)`: la notificación de la partida dice la sesión
  (desde 2 partidas) y, con `RACHA_PARA_AVISAR` (2) derrotas seguidas, cómo
  te va tras perder; «quizá toca un descanso» SOLO si `trasPerder.seVe` y
  peor. `crearSolo` recibe `numerosDe` (en-tablet: `tusNumeros` de sus
  partidas).
- Pruebas en `solo`, `app/lector` y `en-tablet`; nueve mutaciones, todas
  cazadas. Sin prueba de navegador el cableado de LectorTablet (una línea).

## Leer mejor los picks (3.80.0)

Javi: «mejora la detección de personajes. Falla muchísimo». Medido antes de
tocar nada, con los 51 drafts de recortes (#56–#153, 106 capturas; desde
3.70.0 la tablet no sube recortes y no hay más) y el lector de hoy: rivales
305 de 508, tu equipo 315 de 476, falsos 19 y 34. Casi todo lo que falta NO
es reconocimiento: de las 96 capturas con cinco rivales en la verdad, solo 17
los leen a los cinco, porque son las DOS ÚLTIMAS del draft y ahí el hueco del
último rival aún es rojo o ya lleva la skin (#137, #70). Lo que se cambió:

- **Leer el draft cada 1,5 s en la tablet** (`INTERVALOS_SOLO.draft`, antes
  5 s, el ritmo del móvil, donde una lectura tardaba 4–6 s; en la tablet
  0,6–1,6 s según sus partes). El último pick y el tuyo se ven con su
  dibujo unos segundos antes de las skins. NO medido en la tablet: lo dirán
  sus partes (`Lectura N`) y sus partidas.
- **`aceptarCercanos`** (leer.mjs) en los rivales: por debajo de 0,80, se lee
  si pasa de `CERCA_ENEMIGO` (0,77) y le saca `MARGEN_CERCA_ENEMIGO` (0,08)
  al segundo héroe, sin nombre repetido. +8 leídos (Kaja en tres drafts a
  0,78–0,79, Martis), 0 falsos; eligiendo con los drafts viejos y midiendo en
  los nuevos, +4/0 (corte #100) y +2/0 (#126). En tu equipo la misma idea
  (0,79/0,05) daba +4 y no entra: otra constante por casi nada.
- **Tus skins de serie** (`caras-panel.json`, `panel: 'aliados'`): Estes
  (tres), Ruby (dos), Diggie y Rafaela, por ELIMINACIÓN (tu fila es tu pick;
  si en un equipo queda un hueco sin leer y falta un héroe, es él), con las
  guardas de 3.58.0: el mismo héroe en OTRO draft a ≥ 0,92 y nada de otro
  héroe a ≥ 0,85; sin iconos de hueco vacío. Validación cruzada en diez
  bloques (las caras de nueve, medido en el décimo): tu fila 40 → 52 de 68,
  tu equipo 208 → 223 con 1 «falso» (#145, draft sin verdad, el mismo de
  #142 donde jugaste Floryn). Los scripts (`medir-lector.mjs`, `serie.mjs`,
  `serie-cv.mjs`, `serie-final.mjs`, `split.mjs`) están en el scratch de la
  sesión del 26 de octubre de 2026.
- Pruebas en `lector.test` (Kaja de #146, `picks-kaja.png`; tu Estes de #75,
  `aliados-estes.png`, un draft del que no sale la cara; la función pura) y
  `solo.test` (el ritmo); cinco mutaciones.
- Lo que NO funcionó: el aprendizaje de la tablet (`aprenderDe`) repetido con
  los 40 drafts viejos no mejora los 14 nuevos (57,5% → 57,5%); de los
  rivales, ningún héroe tiene el mismo recorte en dos drafts (las skins de
  la fase de skins), así que no hay caras de serie de rivales nuevas.
- Para seguir midiendo, la tablet manda sus recortes sola desde 3.81.0
  (abajo).

## Los recortes, desde la tablet (3.81.0)

Desde 3.70.0 los recortes del draft solo llegaban si el MÓVIL corregía (con
el token de GitHub, como incidencia): con la tablet sola, ninguno desde el 24
de octubre de 2026. Javi lo aprobó («haz todo lo que has propuesto»).
- Cuándo: al apuntar la tablet sola una partida cuyo draft dejó a alguien
  sin leer (`alSinLeer` de `crearSolo`, con la corrección de ese draft
  aunque ya la hayas contestado: `sinLeer` se toma ANTES de apuntar).
- Qué: `interno.recortesDe(ids)` (servir.mjs; ids con forma que existan,
  las `CAPTURAS_A_MIRAR` últimas) corre `recortes-tarea.mjs` en un hilo, y
  `mejoresRecortes` (recortes.mjs) elige las DOS capturas que más héroes
  leen (sin la verdad no se puede usar `esPantallaDeDraft`). Son las diez
  caras sin nombres de jugadores (`recorteDeDraft`, 3.52.0) y lo leído
  hueco a hueco. `recorteParaSubir` (en-tablet) añade la partida (`partida`,
  su `t`: se cruza con su draft bueno en `partidas`, también con lo que
  contestes en «Enseña al lector» o arregles después), `desde`, `faltan` y
  lo leído del draft; si no caben las dos (`TOPE_RECORTE_BYTES`), la
  primera.
- Dónde: `subir_recorte` (esquema.sql, tabla `recortes` cerrada como
  `partes`; 120 KB, uno por minuto, 300 por lector y 60 días), con la clave
  del LECTOR como los partes, nunca la tuya. Se leen con `recortes_recientes`
  (50 como mucho, sin huella) o desde el conector de Supabase.
- Pruebas en `recortes.test`, `solo.test`, `en-tablet.test` (de punta a punta
  con el hilo de verdad y el Supabase de pega: la clave, que no se cuele un
  id de fuera, sin secretos) y `pruebas/sql`; nueve mutaciones, tres
  sobrevivieron al principio por pruebas flojas (la clave del jugador sin
  poner, la captura de fuera igual que las buenas, y los recortes malos
  frenados por «pronto» antes que por su forma).
- Desde 3.81.2 cada salida de `subirRecortesDe` deja su línea y la
  devuelve (sin comunidad.json, sin clave, ninguna captura recortable, no
  caben, el servidor la rechaza, un fallo suelto), y las de fallo dicen «no
  se pudo», que es lo que `LINEA_DE_ERROR` lleva a los errores del parte:
  la frase de antes («no se pudieron subir») no casaba. Y `listarPartidas`
  pone `supuesto` de la copia de la tablet sobre la de la base de datos
  (que no lo guarda) si el pick no cambió: «Tu semana» y la lista de la APK
  lo perdían al subirse. Pruebas en `en-tablet`, tres mutaciones.

**apk.yml (3.81.2)**: pasa `npm test` antes de compilar (con la caché de
`node_modules` que exige `workflows.test`) y se recompila con todo lo que
`copiarLector` mete en la APK menos los datos. `android.test` lo exige: cada
fichero copiado está en `paths:` y hay un paso `run: npm test` antes de `gh
release` (el mandato, no la palabra: con la palabra bastaba el comentario).
Dos mutaciones.

**Las capturas que recuerda el draft (3.81.4)**: con la lectura cada 1,5 s
(3.80.0), los 20 `ids` del draft eran los últimos 30 s, y las 8 que miran
`/correccion` (`sanearCorreccion`), `corregir` y `recortesDe`, la pantalla
de CARGA (se lee hasta ver el minimapa; el parte del 27 de octubre de 2026
traía diez lecturas seguidas con «Gord 0,77» en los diez baneos) y la fase
de skins. `esPantallaDeDraft` las tiraba y no se aprendía nada; los
recortes salían de ahí. Hoy `acumularDraft` solo guarda capturas con
`BANEOS_EN_EL_DRAFT` (2) baneos leídos y `conCaptura` las espacia
`SEPARACION_IDS_MS` (4 s, el ritmo de antes) con la última siempre: 20
llegan a 80 s del draft. `interno.protegerLecturas` (servir.mjs) las saca de
la poda mientras el draft está abierto: las 40 de `MAX_CAPTURAS` son un
minuto a ese ritmo. Medido sobre los 54 drafts de recortes de las
incidencias (#56–#153, 106 capturas, con el lector de hoy): rivales leídos
en 176 de 255 por draft y compañeros en 157 de 206; en los huecos de rivales
sin leer el mejor candidato es el bueno en 8 de 153: casi todos enseñan la
SKIN del rival (mirado en un mosaico), que la API no da (solo `head` y unos
fondos de 1920×1080 en `/heroes/{id}/wallpapers`, no el retrato del panel).
Pruebas en `solo` y `en-tablet`; cuatro mutaciones.

**Las partidas sin resultado y el final que no se ve (3.81.5)**: en los
partes del 26 y 27 de octubre de 2026, 22 preguntas «¿Cómo acabó?», todas
con el motivo «ya hay otro draft»: la vigilancia no vio la tabla ni una vez
(`porTabla` 0) y sigue hasta el draft siguiente. Sin contestar, la partida
se tiraba. Hoy `crearSolo` la guarda sin `gane` (`sinResultado`,
`guardarSinResultado` → `partidasDeLaTablet.guardarSinResultado`, tope
`TOPE_SIN_RESULTADO` 50, no se sube ni cuenta en `tusNumeros`), `/partidas`
la lista con `sinResultado` y la APK la pinta en naranja sin resultado
marcado (no deja guardar sin elegir: con `optBoolean` se habría apuntado
como perdida). `editar` con `gane` la pasa a partida, la sube y, si quedan
los fotogramas (3 h), aprende la tabla. Y al preguntar, `alFinalSinLeer`
sube (`finalParaSubir`, `subirFinalDe`) las dos primeras pantallas sin
marcador tras la última con él, miniatura y franja, a la tabla `recortes`
con `tipo: 'final'` y la clave del lector: con ellas se mide por qué no se
reconoce la tabla. Pruebas en `solo` y `en-tablet`; siete mutaciones. El
Kotlin de `Partidas.kt` no se compila en el contenedor (sin SDK): lo
compila `apk.yml`.

**Medir y aprender de lo que Javi arregla (3.82.0)**: `scripts/medir-lector.mjs`
baja los recortes (`bajarRecortes`, `recortes_recientes`) y las partidas
(`bajarComunidad`, también las `editada`), cruza cada recorte con su partida
por `partida` = `t`, lee cada captura devuelta a su sitio (`devolverPicks`,
recortes.mjs, la misma de `recortes.test`) y cuenta rivales, compañeros y tu
fila (el pick `supuesto` no es tu fila de verdad). Luego repite `aprenderDe`
sobre todos los drafts en orden y propone (`candidatas`, con `--json` listas
para `caras-panel.json`) las caras de compañero confirmadas que no van de
serie. NO escribe nada: lo que entra de serie se mira antes, como en 3.59.5
y 3.80.0, porque un recorte mal etiquetado confunde a dos héroes para
siempre. Los recortes sin partida (no apuntada, o de otra clave sin
compartir) cuentan aparte; las pantallas del final (`tipo: 'final'`) solo se
cuentan. Uso: `node scripts/medir-lector.mjs [--horas 168] [--json f.json]`
(con la clave pública de `public/comunidad.json`, sin secretos). Pruebas en
`medir-lector` y `app/basedatos`; tres mutaciones.


## Solo la pantalla del draft abre un draft, y aprender de lo arreglado (3.83.0)

**La vigilancia que se perdía**: en los partes del 26 y 27 de octubre de 2026
salían 23 «Draft completo» en una tarde, 7 con «0 consejos en directo»: eran
pantallas que no eran el draft (la del final, la carga, el vestíbulo, con los
diez baneos en «?») donde el lector leía un «Gord» o un «Sun» suelto. Pasados
`MINUTOS_PARA_OTRO_DRAFT` del cierre, `acumularDraft` abría otro draft con eso,
la partida lo cerraba y `interno.vigilar` empezaba otra vigilancia: la de la
partida de verdad se perdía, la tabla no se veía (`porTabla` 0) y todo acababa
en «ya hay otro draft». Hoy una lectura solo cuenta con `BANEOS_EN_EL_DRAFT`
(2) baneos leídos, o sumando a un draft ABIERTO que ya los tuvo (la fase de
skins o una ventana encima siguen sumando). Una clásica sin baneos ya no forma
draft en la tablet sola: Javi juega clasificatorias. Prueba en `solo.test`
(las lecturas de pega llevan ya su fila de baneos, `FILA`); dos mutaciones.

**Aprender de lo arreglado en el historial**: `aprenderDeLoArreglado`
(en-tablet.mjs) cada `ARREGLOS_CADA_MS` (6 h; la primera a los 5 min) baja
los recortes (`bajarRecortes`, `DIAS_DE_RECORTES` 30) y `mis_partidas` con la
clave con la que sube. `draftsArreglados` se queda con los recortes cuya
partida tiene hoy el draft ENTERO (5 + 4, nombres del catálogo): un recorte se
sube porque el draft quedó a medias, así que entero lo completó una persona.
Lo que la tablet leyó sola nunca es la verdad (ver `descartados.md`). Tu pick,
solo si no es `supuesto`. `interno.aprenderDeArreglos` (servir.mjs) valida la
forma (ids `lectura-…`, base64, ≤ `ARREGLOS_POR_TANDA` drafts) y aprende draft
a draft por el mismo hilo (`aprender-tarea.mjs` acepta `picks` y lo devuelve a
su sitio con `devolverPicks`), con las guardas de siempre. Lo hecho queda en
`arreglos.json` (`t:ids`, 500). Pruebas en `en-tablet` (la función, el
servidor y de punta a punta con el hilo de verdad y el Supabase de pega);
siete mutaciones.

La revisión de seguridad antes de publicar encontró que, con
`recortes_recientes` (los de TODOS, legibles con la clave pública),
cualquiera podía subir un recorte con el `partida` de una partida de Javi y
enseñarle una cara falsa con su verdad. Hoy la tablet baja solo los suyos
(`mis_recortes(clave, horas)` con la clave del lector, aplicada en Supabase
el 28 de octubre de 2026), las capturas tienen que ser de las
`HORAS_ANTES_DE_LA_PARTIDA` (3) antes de la partida y con nombre de como
mucho 80, y `devolverPicks` no descomprime un PNG que dice ser mayor que la
composición entera (una bomba de 4000×5600 eran 90 MB). Cuatro mutaciones.

## La revisión a la contra de 3.81.2–3.83.0 (3.83.1)

Hecha por OTRA sesión deprisa (seis versiones en un día), revisada con
`silent-failure-hunter` y `security-reviewer` el 28 de octubre de 2026.
Seguridad: nada que toque la cuenta ni el token; envenenar el lector con
recortes de otro no se puede (`mis_recortes` con la clave del lector, 256
bits). Arreglado, cada uno con su prueba y su mutación (diez, todas cazadas):
- **La bomba de PNG**: `leerPng` inflaba sin tope; un recorte de 117 KB daba
  90 MB (156 MB de memoria). Hoy `maxOutputLength` sale de la cabecera
  (filas con su filtro, y en Adam7 hasta el doble de filas) y
  `MAX_PIXELES` (16 millones) corta una cabecera imposible. Prueba en
  `recortes.test`; dos mutaciones (sin tope, y un tope corto que rompe las
  imágenes de verdad).
- **Aprender de lo arreglado daba la tanda entera por hecha** aunque el
  hilo fallara: esos drafts no se reintentaban nunca y el registro decía
  «nada nuevo». Hoy `aprenderDeArreglos` devuelve `hechos` (mirados o sin
  forma) y `fallidos`, y `arreglos.json` guarda solo los hechos. Prueba en
  `en-tablet` (la función y de punta a punta con un recorte roto que el hilo
  de verdad no puede leer); tres mutaciones.
- **Las `supuesto` subidas antes de 3.81.2** (ya en `subidas`) no llevaban
  la marca a la base de datos: el móvil y la comunidad las contaban como
  «siguió el consejo». `partidasDeLaTablet` las saca de `subidas` UNA vez
  (`supuestoResubido` en partidas.json) y se suben otra vez; el servidor
  acepta la copia si nadie la arregló después. Dos mutaciones.
- `datos-rancios.mjs` decía «Datos al día.» sin saber la edad. Hoy lo dice
  («No sé la edad…»), sin abrir incidencia (eso sigue siendo decisión de
  `datosRancios`, con prueba).
Lo que NO se tocó, con su porqué, en `docs/historia/descartados.md`.

**Partidas jugadas sin apuntar (3.83.2)**: el 27 de octubre de 2026 la tablet
leyó 5 h (2.811 lecturas) y no apuntó ninguna partida, y `revisar-tablet`
no lo vio: miraba lecturas, memoria y capturas, todo bien. Hoy el `resumen`
de `crearSolo` cuenta `partidas` (drafts que acabaron en partida desde que
arrancó) junto a `apuntadas`; la revisión da FALLO con
`PARTIDAS_SIN_APUNTAR` (3) y ninguna apuntada, AVISO con
`PARTIDAS_PARA_MEDIR` (5) y menos de la mitad, y «El sistema» del móvil lo
dice (`sistema.jugadas`, en rojo con tres sin apuntar). Una APK anterior no
lo cuenta y no da fallo. Pruebas en `solo`, `revisar-tablet` y
`app/lector`; cuatro mutaciones.

**Contestar desde la burbuja (3.84.0)**: Javi, el 28 de octubre de 2026:
«que no tenga que salirme del juego para corregir los drafts». `GET
/consejo` da también `pendiente` ({pregunta, correccion}) y `fase`
(«draft» o «fuera», la pone `crearSolo` en cada tic con `interno.ponerFase`;
vale `FASE_VALE_MS`, 30 s, y sin ella es null: con el modo solo parado no se
sabe si hay un draft delante; en partida, «partida»). `Pendiente.kt` pinta un
botoncito TOCABLE arriba en el centro solo con fase «fuera» y sin partida, y
al tocarlo un panel con foco (para el teclado, `FLAG_NOT_TOUCH_MODAL`: lo de
fuera sigue yendo al juego) con lo mismo que las tarjetas de `Principal`,
contra `/pregunta` y `/correccion`. Sin `AutoCompleteTextView` (su lista
desplegable encima de otra app se pierde): al escribir salen botones con los
héroes que empiezan así. La burbuja del consejo sigue NOT_TOUCHABLE. Con un
draft o una partida, botón y panel se quitan solos. Hueco conocido: al
empezar el draft, hasta leer dos baneos la fase sigue «fuera» (no se
distingue la pantalla), así que el botón puede verse unos segundos arriba si
lo pendiente sigue sin contestar. Pruebas en `en-tablet` y `puente-lector`
(fase, caducidad, pendiente), `solo` (la fase que pone) y `android` (por
forma: solo `Pendiente.kt` tiene una ventana tocable, mira la fase, se quita
y solo habla con esas dos rutas); nueve mutaciones.

**Lo que dijeron los recortes del 28 de octubre de 2026 (3.84.1)**: 8
partidas jugadas, 6 apuntadas solas (3.83.0 funciona) y 6 recortes. Con
`medir-lector.mjs` los rivales salen 25 de 25 y tu equipo 17 de 20, pero
**tu fila** solo 1 de 3, y por dos motivos distintos (montaje de los diez
huecos de tu fila, scratch de la sesión):
- **Tu Minotaur con la skin roja** no estaba en ninguna referencia: el
  mismo draft apuntado como «Minotaur» en una partida salió «Floryn
  supuesto» en otra. Va de serie en `caras-panel.json` (`aliados`), con las
  guardas de siempre: 0,976 con la misma skin del otro draft y ningún otro
  héroe por encima de 0,74. Tu fila 1 → 2 de 3, 0 falsos. Prueba en
  `lector.test` (`aliados-minotaur.png`); una mutación (sin la cara).
- **Eliges el último y tu héroe no llega a leerse**: en dos drafts las dos
  mejores capturas tienen tu hueco aún vacío (el icono de hueco, con tu
  pre-selección en un circulito). No hay captura con tu pick para medir.
  Candidato SIN tocar: que la fase de skins (que hoy no toca el equipo si
  cambian más de `CAMBIOS_A_LA_VEZ` huecos) sí rellene un hueco VACÍO; hace
  falta una captura de esa fase para medir que no lee una skin como otro
  héroe.
- **Tu Floryn rosa** (draft de las 21:15 del 28): un solo draft con
  verdad; entra de serie cuando salga en otro.
- `version: null` en todos los recortes: era la versión del puente (ver
  `docs/historia/errores.md`). Hoy va la de la APK (`salud.json`), con
  prueba de punta a punta en `en-tablet`; una mutación.

**Tu héroe con un toque (3.85.0)**: Javi, el 29 de octubre de 2026: «mi
héroe no se lee porque es el último pick casi siempre y al elegirlo se
cambia a la fotillo de la skin». Cuadra con los recortes (tu hueco vacío o
ya con la skin, y la tarde del 28: 9 apuntadas, 4 con «pick supuesto»).
`tusHabituales` (solo.mjs) da los `HABITUALES` (6) héroes de tu línea con
más partidas en la maestría (`deSiempre` o `games`), sin los que ya salen en
el draft; `correccionDelDraft` los pone en `tuyos` SOLO si falta tu fila;
`sanearCorreccion` deja solo nombres de la lista y `GET /correccion` los
manda. La burbuja (`Pendiente.kt`) y la tarjeta de la app (`Principal.kt`)
los enseñan como botones «¿Con quién jugaste tú?» que rellenan «Tú». Con la
respuesta, el lector aprende la cara de ESA skin de las capturas del draft
(las 8 últimas, que ya incluyen el pick puesto) y, confirmada en dos drafts
(las guardas de 3.58.0), la lee sola. Lo que NO se hizo: leer el circulito
de pre-selección del hueco vacío (a 1/3 en los recortes mide 13 px y sale
cortado: sin capturas a tamaño real no se puede medir) ni rellenar huecos
vacíos con la fase de skins (sin captura de esa fase). Pruebas en `solo`,
`en-tablet` y `android`; siete mutaciones.

**Revisar con las capturas, desde el PC o el móvil (3.86.0)**: Javi: «desde
el PC, ¿puedo corregirte los picks? Haz algún sistema para ver las capturas
y ayudarte a identificar cada héroe». `RevisarCapturas.jsx` (desde «Tus
partidas», solo con base de datos) baja `recortes_recientes` (60 días, 50 como
mucho) y `revisiones` (src/app/revisar.js, puro) los cruza con TUS partidas
por `partida` = `t`: las diez caras (fondo CSS de la composición de
recortes.mjs con `encuadre`) y un campo por hueco con lo leído; lo arreglado
después cae en el hueco vacío (`completar`), tu fila sale vacía con el pick
`supuesto`. Guardar (`cambiosDeRevision` → `revisarPartida` de usePersonal:
`cambiarHeroe` + `cambiarDraft` + `marcarEditada`) arregla la partida; la
tablet la aprende con SUS recortes (`aprenderDeLoArreglado`, draft entero).
Lo de la base de datos lo escribe cualquiera: la imagen solo pasa como PNG
en base64 sin comillas y con tope (`imagenValida`), ids con forma, nombres
del catálogo; un recorte ajeno con tu `t` solo enseña una imagen rara a
quien la mira, no enseña nada a la tablet. En el PC hace falta tu clave en
«Guardar mis partidas» (la misma del móvil). Pruebas en `app/revisar` y
`revisar.e2e`; nueve mutaciones.

**La revisión de 3.84–3.86 (3.86.1)**, con `security-reviewer` y
`silent-failure-hunter` el 29 de octubre de 2026 (nada crítico: ni la
cuenta, ni el token, ni el código de vinculación). Arreglado, cada uno con
su prueba y su mutación (ocho, todas cazadas):
- **El botón tocable sobre los primeros baneos**: `ponerFase` daba «fuera»
  en cuanto no se leía nada, y un draft nuevo no se abre hasta leer dos
  baneos. Hoy `faseDe` (solo.mjs) da «fuera» solo tras
  `LECTURAS_PARA_FUERA` (2) lecturas seguidas sin nadie, «partida» con el
  minimapa, y cualquier nombre leído la pone en «draft» (se equivoca hacia
  no enseñar el botón).
- **La fase vieja**: apagado, apartado por el móvil o con la captura
  fallida, `tic` salía sin tocarla y valía 30 s. Hoy `ponerFase(null)`.
- **El panel encima con el lector caído**: `Burbuja.kt` quita botón y panel
  (`pendiente.quitarTodo`) si `/consejo` no contesta o falla.
- `GET /consejo` exige `deLaApk` (solo la tablet lo lee).
- **Recortes ajenos en «Revisar con las capturas»**: cualquiera con la
  clave pública sube recortes, y quien sepa el `t` de una partida tuya
  (`partidas_comunidad` lo enseña) podía poner uno falso. Si una partida
  trae recortes de dos lectores (`j`), no sale. Queda: inundar el top 50
  de `recortes_recientes` y que los tuyos no salgan (no engaña, esconde).
Sin tocar: con el panel abierto el juego recibe los toques de fuera
marcados como «parcialmente tapados» (FLAG_WINDOW_IS_PARTIALLY_OBSCURED);
solo pasa en el vestíbulo y con el panel que abres tú.

