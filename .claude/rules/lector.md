---
paths:
  - "scripts/lector/**"
  - "scripts/revisar-tablet.mjs"
  - "scripts/medir-lector.mjs"
  - "scripts/caras-nuevas.mjs"
  - "src/comun/contrato.js"
  - "src/app/lector.js"
  - "android/**"
  - ".github/workflows/apk.yml"
  - "pruebas/scripts/*lector*.test.mjs"
  - "pruebas/scripts/android*.test.mjs"
  - "pruebas/scripts/{en-tablet,solo,captura-cruda,aprender,recortes,resultado,revisar-tablet,caras-nuevas}.test.mjs"
  - "pruebas/fixtures/juego/**"
---

# El lector de la tablet (4.0)

La tablet (APK **Lector MLBB**) graba su propia pantalla, lee el draft, lo
LLEVA (protocolo 2), decide el consejo de la burbuja, vigila el final y apunta
la partida. El móvil copia el draft y manda lo que tú tocas. La crónica de 3.x
está en `docs/archivo/reglas-3.102/lector.md`; los fallos con su prueba, en
`docs/lecciones.md` («Lector»); lo medido y dejado, en `docs/descartados.md`;
lo que decidió Javi, en `docs/decisiones.md`; lo abierto, en `docs/pendiente.md`.

## Seguridad (manda sobre todo lo demás)

Su cuenta vale dinero. Todo se exige por FORMA y cada guarda se ha mutado:

- **Nada lanza programas ni toca el juego** (S1–S5, `lector-seguridad.test`):
  ningún fichero de `scripts/lector/` importa `child_process`, nombra adb ni
  `input`/`tap`; cada fichero solo importa los módulos de Node de su lista
  (`DE_NODE`); un solo `import()` (en `arranque-apk.mjs`); los `Worker` con URL
  literal; sin `eval`/`new Function`/`vm`.
- **Tres destinos de red** (S7): el puerto interno de la captura
  (`${base}/captura`, `esInterno`), las dos URL fijas de github.io
  (`DATOS_DE_LA_WEB`) y la base de datos con `sanearConfig`. Nunca la API del
  juego ni `/api/user/*`; el token de GitHub no existe en la tablet.
- **El servidor** (puerto `PUERTO` 47323, escucha en la wifi): `Host` solo
  127.0.0.1/localhost o IP privada tal cual (rebinding); `Origin` solo la app
  publicada (403 sin CORS); el código de vinculación (`X-Lector-Codigo`,
  tiempo constante, `FALLOS_CODIGO` por APARATO, sin código no cuenta); las
  rutas de la app exigen `Origin`, las de la APK `deLaApk` (bucle local y SIN
  `Origin`). El origen local de las pruebas de navegador solo con
  `LECTOR_ORIGEN_DE_PRUEBA=1`, que la APK nunca pone (H5). Cuerpos con tope
  (`CUERPO_MAXIMO`); el reto PBKDF2 (`RETO_VUELTAS`) con tope por aparato y
  total. La imagen nunca sale: al móvil van nombres (H6/H7: ni `/leer` ni
  `/final`, y `GET /draft` sin imágenes).
- **La APK** (`android-seguridad.test`, H1–H4): sin `ProcessBuilder`,
  `Runtime.exec`, accesibilidad, gestos, `Instrumentation`, `input`, `su`;
  nueve permisos exactos en el manifiesto; UN `getLaunchIntentForPackage(JUEGO)`
  (`com.mobile.legends`) detrás de `abrirJuego`, en la misma línea; URL solo a
  `http://127.0.0.1:`, `releases/latest` del repositorio y Pick Assist;
  el `ServerSocket` de la captura solo en 127.0.0.1 con el secreto
  comparado con `MessageDigest.isEqual`.
- **Los nombres de otros jugadores** no salen: franjas con lo de debajo de la
  cabecera en negro (`franjaSinNombres`), recortes de caras sin la caja del nombre.

## El protocolo 2 (`src/comun/contrato.js`)

`RUTAS` es la tabla de quién llama a qué; `servir.mjs` atiende EXACTAMENTE
esas claves (`manejadores`, la prueba lo compara) y comprueba Host → Origin →
ruta → código → quién → cuerpo en un solo sitio (`atender`).

| Ruta | Quién | Qué |
|---|---|---|
| `GET /reto` | cualquiera | prueba PBKDF2 del código (la app busca la tablet tras un cambio de IP) |
| `GET /estado` | ambos | `protocolo`, salud, `movil.consultas`, `pendiente`, datos, partidas, `solo` |
| `GET /clave` | app | la clave con la que suben las partidas |
| `GET /draft` | app | `{protocolo, fase, draft, partida}` (`sanearRespuestaDraft`) |
| `POST /draft` | app | tu corrección del draft `desde` (`sanearCorreccion`); 409 si ya no está |
| `POST /resultado` | app | `{desde, gane|null}` de la partida del último draft cerrado; 409 si no |
| `POST /ajustes` | app | línea, rango, idioma, maestría, clave (`sanearAjustes`) |
| `GET /consejo` | apk | burbuja: `{consejo, resumen, enPartida, fase, pendiente:{pregunta}}` |
| `GET/POST /correccion` | apk | «Enseña al lector» |
| `GET/POST /pregunta` | apk | «¿Cómo acabó?» |
| `GET /partidas`, `POST /partida` | apk | «Mis partidas» |

- El bucle del modo solo SIEMPRE conduce si hay línea (la de la APK en
  `solo.json` o la del móvil en `solo-movil.json`; «Apagado» manda). No hay
  «el móvil lee, la tablet se aparta».
- La corrección del móvil manda en ESE draft (`registrarCorreccion` guarda
  también lo que quitaste, `rechazados`; `conCorreccion` la aplica): en la
  burbuja (siguiente vuelta), en la partida que se apunte (o ya apuntada) y en
  lo que se aprende (una vez por draft cerrado).
- El motor se llama SIN maestría (`decidirSolo`); la maestría solo da tus
  habituales (`tusHabituales`) para la corrección.

## Los módulos

| Fichero | Qué |
|---|---|
| `en-tablet.mjs` | `principal`: lo monta todo (servidor, modo solo, partidas, subidas, relojes) |
| `arranque-apk.mjs` | lo que arranca Node: vigilantes ANTES de cargar nada, `principal` en un try |
| `servir.mjs` | el servidor por tabla, `hacerLectura`, `servidor.interno` para el modo solo |
| `acceso.mjs` | Host, Origin, `deLaApk`, portero, retos, cuerpo |
| `solo.mjs` | el bucle (`INTERVALOS_SOLO`: 1,5 s draft, 12 s sin draft, 20 s en partida), consejo, partida |
| `acumular.mjs` | `acumularDraft` (puro), `faseDe`, `registrarCorreccion`, `conCorreccion` |
| `vigilancia.mjs` | el final: minimapa, tabla, ráfaga, duración |
| `aprendizaje.mjs` | UNA cola: correcciones, arreglos del historial, recortes; lo que mira no se poda |
| `capturas.mjs` | poda (`RETENCION_CAPTURAS_MS` = `PREGUNTA_CADUCA_MS`, `MAX_CAPTURAS`), `capturasAMirar` |
| `datos.mjs` | datos de decisión (los más nuevos), `comunidad.json`, `salud.json`, ajustes |
| `partidas.mjs` | `partidas.json` (tope 500, 50 sin resultado), «Mis partidas», subir |
| `subidas.mjs` | parte de salud, recortes, pantallas del final, comprobantes, clave del lector |
| `leer.mjs`, `caras.mjs`, `lectura.mjs` | reconocer caras (en tres hilos: `lectura-tarea.mjs`) |
| `aprender.mjs`, `recortes.mjs` | aprender caras, componer recortes (en hilos: `*-tarea.mjs`) |
| `resultado.mjs`, `partida.mjs`, `miniatura.mjs`, `png.mjs` | tabla, minimapa, miniaturas, PNG puro |

`src/comun/` va dentro de la APK (Node 18 de nodejs-mobile): sin `\p{}`, sin
indicador `v`, sin `crypto` global (`android.test` lo exige en todo el grafo
desde `arranque-apk.mjs`, sin contar comentarios). Todo lo que importa el lector
tiene que estar en `copiarLector` (build.gradle.kts) y en `paths:` de `apk.yml`.

## Leer la pantalla (constantes medidas, [M])

- Medido a 2400×1504 (`REFERENCIA`), se escala. Caras de referencia = la cara
  del juego de la API (`hero.data.head`), nunca el retrato de la web;
  `sacar-caras.mjs` rehace `caras.json`; `caras-nuevas.mjs` lo vigila (no va en
  `npm test`: tiraría el despliegue).
- `PARECIDO_MINIMO` 0,80; criba a 8×8 con `FINALISTAS` 32 y `AFINADOS` 3;
  tal cual Y en espejo; `CRIBA_PICKS` 1,2. Rivales: `CERCA_ENEMIGO` 0,77 con
  `MARGEN_CERCA_ENEMIGO` 0,08. Tu equipo: `ALIADO_MINIMO` 0,92, `MARGEN_ALIADO`
  0,03; tu fila por el nombre amarillo (`AMARILLO_MINIMO`, el doble que el resto).
- La geometría de la fila de baneos (`BANEOS`) y de los paneles NO se toca sin
  una captura nueva medida: desde el parche del 11-11-2026 la fila sale «?»
  (ver `docs/pendiente.md`).
- Caras de serie del panel (`caras-panel.json`): solo con tres drafts, el mismo
  recorte se parece entre ellos y nada sin él se acerca. Iconos de hueco vacío
  de serie (`VACIOS_ALIADO`, `MINIMO_VACIO` 0,85), purgados de lo aprendido.
- Paridad de la reescritura: 43 imágenes, 1.032 valores iguales a 3.102
  (nombres, candidatos, parecido a 3 decimales, minimapa, resultado).

## El draft en la tablet (`acumularDraft`)

- Abre con `BANEOS_EN_EL_DRAFT` (2) baneos DISTINTOS o, sin fila, con
  `PICKS_SIN_BANEOS` (4) héroes distintos (`porPicks`, sin capturas para
  aprender). Otro draft: `BANEOS_DE_OTRO_DRAFT` huecos de baneo cambiados,
  `MINUTOS_PARA_OTRO_DRAFT` tras el cierre o `MINUTOS_DRAFT_ABANDONADO` quieto.
- Huecos por jugador: lo leído pisa, un «?» no borra, un héroe en un solo hueco;
  más de `CAMBIOS_A_LA_VEZ` huecos cambiados a la vez es la fase de skins y no
  toca ese equipo. Tu fila por mayoría de votos (`filaVotada`).
- Cierra con `LECTURAS_EN_PARTIDA` (2) lecturas con minimapa; la burbuja se
  esconde con las mismas. `faseDe`: «fuera» solo tras `LECTURAS_PARA_FUERA`.
- Guarda hasta `IDS_POR_DRAFT` capturas espaciadas `SEPARACION_IDS_MS`;
  `protegerLecturas` las saca de la poda (abierto). Sin fila, las `IDS_SIN_FILA` primeras, para la cabecera.

## La partida y el final

- Al cerrar: `interno.vigilar(cerradoEn)`; la misma partida vista tarde no
  vigila otra; un `desde` anterior no pisa la vigilancia en marcha.
- `VIGILANCIA`: inicio por el minimapa (`UMBRAL_PARTIDA` 0,47, dos seguidas) o
  por la última lectura fuera y la primera dentro (`HUECO_MAXIMO_LECTURAS_MS`);
  ráfaga cada 2 s al dejar de ver el minimapa; las de la ráfaga no las saca el vestíbulo.
- El resultado con plantillas FIJAS medidas (`tabla-victoria-*`, `tabla-derrota-*`,
  `ZONA_PALABRA`, `TABLA_MINIMA` 0,70): nada se aprende en marcha. Mientras se
  vigila el final, ni burbuja ni píldora (tapan la tabla).
- Sin resultado: «¿Cómo acabó?» (`ponerPregunta`, caduca con las capturas); sin
  respuesta, la partida queda sin resultado en «Mis partidas» y sube con las
  pantallas del final. `MINUTOS_ENTRE_TABLAS` (10) entre dos tablas apuntadas.
- La partida apuntada (`partidaSolo`, forma de `apuntar`) va en `GET /draft`
  como `partida.registro` con el MISMO `t`: el móvil la funde sin duplicar.

## Aprender

- Solo lo que dice una persona: tu corrección (móvil o «Enseña al lector»), lo
  que arreglas en el historial (`draftsArreglados`: draft entero, recortes de
  ESTA tablet con `mis_recortes` y la clave del lector). Nunca sus propias
  lecturas (`docs/descartados.md`).
- Lo aprendido nunca manda sobre lo medido: solo pantallas del draft
  (`BANEOS_PARA_APRENDER`), a menos de medio hueco del medido, compañeros
  confirmados en dos drafts (`MINUTOS_ENTRE_DRAFTS`). `VERSION_APRENDIDO` 2.

## Lo que sube a la base de datos

Por `comunidad.json` (bajado o el de la APK, `sanearConfig`): partidas con tu
clave (si el móvil la mandó) o la del lector (`clave-lector.txt`); el parte de
salud cada `PARTE_CADA_MS` con la del lector, sin IPs, código ni claves y con
tope `TOPE_PARTE_BYTES`; recortes del draft sin leer entero (clave del lector);
pantallas del final y el comprobante de cada partida de la tabla (tu clave:
el móvil los lee con `mis_recortes`). Un draft cerrado sin la fila (4.0.1,
`alSinBaneos`) sube su cabecera (`tipo: 'cabecera'`, clave del lector): SOLO
`REGION_CABECERA` (15 % de arriba) a 1200 px, en el hilo de los recortes, una
al día (`cabecera.json`, al subir). Cada salida deja su línea; las de fallo
dicen «no se pudo» (`LINEA_DE_ERROR`, la misma en `revisar-tablet.mjs`).

## La APK (`android/`)

- `Nodo.kt` arranca `arranque-apk.mjs` una vez por proceso (copia el lector si
  cambia el `versionCode`). `Lector.kt`: MediaProjection, la captura en crudo
  por 127.0.0.1 con un secreto por proceso, `salud.json`.
- `Cliente.kt`: lo ÚNICO que habla con el lector (127.0.0.1, `PUERTO`, código,
  sin `Origin`); cada ruta que usa es de la APK en `RUTAS` (`android.test`).
- `Contestar.kt`: «¿Cómo acabó?» y «Enseña al lector», los MISMOS en la tarjeta
  (`Principal`) y en el panel encima del juego (`Pendiente`, solo con
  `pendiente.pregunta`, fase «fuera» y sin partida; lo único tocable encima del
  juego). `Burbuja.kt`: NOT_TOUCHABLE, opacidad 0,8.
- `Principal.kt` (estado, guía, «Sin móvil», vincular, ajustes), `Fallos.kt`
  (fallos sin ver, «Copiar»), `Vinculo.kt` (código, IP, QR), `Solo.kt`,
  `Partidas.kt`, `Guia.kt`, `Actualizar.kt`, `Salidas.kt`, `Estilo.kt`.
- Lo que no puede cambiar (instalar encima): `applicationId`, la firma
  (`firma.jks.cifrado`, alias `lector`, secreto `LECTOR_FIRMA_CLAVE`), las
  preferencias `lector` y sus claves, los ficheros de `filesDir`.
  `versionCode = mayor·1e6 + menor·1e3 + parche` (nunca baja de 40200).
- `apk.yml`: push a main → pruebas, compila y PUBLICA `lector-vX.Y.Z`; a mano →
  artefacto, salvo `publicar`. Sin la firma o el secreto, FALLA (nunca crea otra).
- Compilar aquí: SDK con `sdkmanager` (dl.google.com) y
  `gradle :app:compileReleaseKotlin`; la APK entera necesita nodejs-mobile
  (GitHub), así que solo la compila `apk.yml`. Sin emulador: lo de Android de
  verdad solo se ve en la tablet.

## Pruebas

`lector-seguridad` (servidor), `android-seguridad` y `android` (APK, grafo de
Node 18), `en-tablet` (de punta a punta con una APK de pega: draft, corrección,
resultado, subidas), `solo` (modo solo y protocolo 2), `puente-lector`
(servidor e hilos), `directo-lector` (vigilancia con reloj simulado),
`captura-cruda`, `lector` (reconocer), `aprender`, `recortes`, `resultado`,
`revisar-tablet`, `caras-nuevas`. El servidor de prueba se cierra en `after()`
o en `finally`: uno abierto deja la corrida colgada.
