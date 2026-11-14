---
paths:
  - "src/app/**"
  - "src/styles.css"
  - "src/main.jsx"
  - "index.html"
  - "vite.config.js"
  - "pruebas/interfaz/**"
  - "pruebas/app/**"
---

# La interfaz

Se carga al tocar la app del móvil, el estilo o las pruebas de navegador. Lo
que pasó y por qué está en `docs/` (las lecciones y el archivo de 3.x).

## Cómo está montada

- `App.jsx` (~250 líneas) solo compone: un `ContextoT.Provider` (`useT()` en
  cada componente, sin pasar `t` a mano) y los hooks de `src/app/estado/`.
  Los retornos tempranos van DESPUÉS de todos los hooks (licencia, página
  suelta, sin línea) y en el mismo orden.
- `estado/`: `useAjustes` (línea, rango, idioma, tacto), `useDatos` (meta y
  catálogo; relee `roam-meta.json` a los `RELEER_DATOS_MS` 5 s porque el
  service worker sirve primero lo de la caché), `useDraft` + `draftMovil.js`
  (puro), `usePersonal` (maestría y partidas), `useRecomendacion` (llama al
  motor SIN maestría: tus resultados no entran en la nota), `useHojas`,
  `useLector` (la tablet), `useApuntar`, `useComunidad`, `useToken`,
  `useLicencia`, `useNovedades`, `useActualizacion`, `useAhora` (un reloj).
- **La persistencia está solo en `estado/almacen.js`** (`CLAVES`). Las claves
  dicen `roam-picker:` y su forma no cambia: un valor de 3.102 tiene que
  cargar (`herencia.e2e`). `roam-picker:voz-callada` queda reservada. Una
  clave nueva se lee con su valor por defecto, sin migración.
- Lo repetido es UNO: `RejillaDeHeroes` (selector, apuntar, historial,
  comprobar, capturas), `TusNumeros.jsx` (también para Analítica y el
  Veredicto), `BotonLector` y una sola `pedirJson` para la tablet.

## El draft del móvil (`draftMovil.js`, `useDraft`)

- Se guarda en `roam-picker:draft` con las claves de siempre (`enemies`,
  `allies`, `bans`, `enemyRoam`, `fase`, `miPick`, `lectura`, `desde`…) y tres
  opcionales nuevas: `aMano` (lo metido con el dedo), `desdeTablet` (el
  `desde` del draft de la tablet que se copió) e `ignorarTabletHasta`.
- `TOPES` (5/4/10) los dice el juego. `vacio()` es un objeto NUEVO cada vez:
  con uno compartido, apuntar en los segundos de «Nuevo draft» resucitaba su
  aviso.
- **Fundir lo de la tablet** (`fundirTablet`): la tablet manda sobre lo que
  leyó (un nombre que ya no lee y no está en `aMano` se va), lo metido a mano
  se queda, `rechazados` = lo leído que tú quitaste (no vuelve), los baneos
  solo se suman, el pick que soltaste no vuelve y un `tuyo` fuera de tu pool no
  se fija. «Nuevo draft» guarda `ignorarTabletHasta = desdeTablet`: un draft de
  la tablet con `desde` ≤ ese no se copia. Pruebas: `app/lectura-draft`,
  `app/identidad-draft`.
- **Deshacer** (`vaciarConDeshacer`, `quitarConDeshacer`, `DESHACER_MS` 6 s,
  Material dice 4–10): vale mientras el draft siga siendo el que dejó la
  acción; vaciar uno vacío no ofrece nada. La foto se saca de una referencia,
  FUERA del updater. Se prefirió a un «¿Seguro?»: vaciar es casi siempre lo
  que quieres. `deshacer.e2e`.
- Un draft completo corregido (7 de 9 comunes en 30 min) es la misma partida.

## La tablet: el cliente del protocolo 2

El contrato es `src/comun/contrato.js` (rutas, saneadores, constantes); aquí
solo se consume. `src/app/lector.js` es la red, `useLector` el estado.

- **Sin tablet vinculada, ninguna petición**: `pedirJson` lanza `sinPuente`
  sin llamar a `fetch` si falta la dirección o el código. Cada petición lleva el
  código, `targetAddressSpace: 'local'`, `cache: 'no-store'` y
  `PLAZO_LECTOR_MS` (8 s). Fallos con tipo: `plazo`, `codigo` (401),
  `bloqueado` (429), `antigua` (404 en `/draft`: la tablet tiene la APK del
  protocolo viejo y se dice así), `error`. `app/lector.test`.
- **Copiar**: `GET /draft` cada `INTERVALO_DRAFT_MS` (2 s) con la tablet
  vinculada, «Leer solo» encendido, el catálogo cargado, la página visible y
  SIN hoja abierta (se lee con prisa y la rejilla no puede cambiar bajo el
  dedo). «Leer del juego» copia una vez. Lo que llega pasa por
  `sanearRespuestaDraft`.
- **Corregir**: lo que tocas en un draft de la tablet sale en `POST /draft`
  (`correccionDe`, `CORREGIR_TRAS_MS` 800: varios toques, una petición; sin
  repetir la misma huella).
- **Ajustes**: `POST /ajustes` al cambiar línea, rango, idioma, maestría o
  clave, y otra vez tras cada copia si no se pudo.
- **Apuntar** (`useApuntar`): con un draft de la tablet, Gané/Perdí no apunta
  aquí: `POST /resultado {desde, gane}` a los `DESHACER_APUNTADA_MS` (20 s, el
  plazo del «Deshacer»), al cerrar el aviso o en `pagehide` con `keepalive`.
  Si la tablet no lo toma, se apunta en el móvil. «No la terminé» manda
  `gane: null` en el acto y vacía con deshacer. La partida apuntada llega en
  `partida.registro` y se funde con SU `t` (`fundirPerfil`, sin duplicar, una
  quitada no vuelve); si es la del draft a la vista, el draft se cierra con
  «Deshacer». Sin tablet o con un draft a mano, se apunta aquí como siempre.
- **Vincular**: el QR trae dirección (IP privada tal cual, nunca un nombre) y
  código; se confirma con un toque. Si la tablet cambia de IP,
  `buscarTabletEnLaRed` prueba la subred con el reto PBKDF2
  (`RETO_VUELTAS`) y solo acepta la que demuestra el código. `GET /clave` trae
  la clave de jugador de la tablet si el móvil no tiene; `GET /estado` dice
  versión y `protocolo` (≠ 2 → «atrasada», con el enlace a la APK).
- Pruebas: `lector.e2e` (doce casos, con `tablet-falsa.mjs`, que habla el
  protocolo 2), `vincular.e2e`, `toques.e2e`, `deshacer.e2e`.

## Meter el draft deprisa

Medido en 3.16 con sus drafts reales: los baneos de otras líneas no mueven el
nº1; los compañeros sí (sin aliados cambia en la mitad de los drafts). Por eso:

- El selector de picks es UNA hoja para los dos equipos (`bandos`/`onBando`),
  multi-toque, otro toque quita, el otro bando y los baneados al final y
  deshabilitados. El de baneos arranca filtrado a tu línea («Tu línea (37)» /
  «Todos»; buscando sale cualquiera).
- El orden de las caras es `probablesDelBando` (draft.js) y se calcula al
  ABRIR la hoja o cambiar de pestaña (`useHojas.abrir`), nunca en cada render:
  la rejilla no se reordena bajo el dedo. Se midió contando las 12 primeras
  caras, lo que se ve sin bajar.
- El buscador solo se enfoca con puntero fino: en Android el teclado tapaba
  14 de 22 caras. `rapido.e2e` con `paginaCon({ tactil: true })`.

## Los altos, el material y el movimiento

- **[M] Ningún alto, relleno ni hueco se toca sin volver a medir.**
  `primera-pantalla.e2e`: a 360×640 la tarjeta nº1 ASOMA (`top < alto`; hoy
  ~589–594) y la composición no pinta «✓»; `responsive.e2e`: 32 px de toque
  en todo (la × con `min-width`, no depende de la letra). Los huecos del draft
  miden 38 (4 + cara de 30 + 4); la cara ES el botón de marcar al rival.
- Material «Liquid Glass» de iOS 26: todo en las variables de `:root`
  (`--r` 14, `--r-sm` 10, `--r-lg` 20, acento `#FFD60A`, colores de término).
  `backdrop-filter` solo en lo que FLOTA sobre contenido que se mueve (pie,
  cabecera de la maestría, panel del draft en escritorio, `.build-saltos`);
  en tarjetas y chips sería un repintado por toque. Las hojas, opacas (al sol
  no se leía). Sin modo claro: el acento y los colores no aguantan el
  contraste sobre blanco (está en los descartados de `docs/`).
- El aura de cada tarjeta va en `--cara` con dirección ABSOLUTA (`aura()`): un
  `url()` relativo en una variable se resuelve contra la hoja de estilos (404).
- **Un solo muelle** (`--muelle`, `linear()`; sin soporte, `ease`).
  `useDeslizar` (FLIP con `offsetTop`, que no incluye transformaciones) anima
  solo las tarjetas que CAMBIAN DE PUESTO, y con otra línea, rango o meta
  recién llegado (`contexto`) se colocan sin animar: al cargar, ocho tarjetas
  volaban 800 px.
- Las hojas entran con `@starting-style` (24 px, 260 ms) y se cierran
  arrastrando desde el asa o el título (`CERRAR_PX` 80 o 0,6 px/ms), nunca
  desde la rejilla, un botón o un campo; con la misma `onCerrar`.
- Vibración (`tacto.js`, 10 ms) solo desde lo que toca el dedo, nunca desde el
  estado (la limpieza al cargar no vibra); interruptor solo si hay
  `navigator.vibrate`, en `roam-picker:tacto`.
- Todo se apaga con «reducir movimiento». `movimiento.e2e`.

## Las hojas

- `useHojas`: `hoja`, `abrir`, `cerrar`, `deHojaAHoja`. Todas las hojas, el
  aviso de deshacer, el vínculo y el selector se montan en el MISMO hueco del
  árbol en baneos y en picks: una partida apuntada sola no desmonta lo que
  estabas escribiendo, solo cierra las hojas del draft.
- Toda hoja pasa por `Hoja.jsx`: atrás y Escape la cierran y devuelven el
  foco. **De hoja a hoja**: se cierra, se espera al `popstate` (o
  `DE_HOJA_A_HOJA_MS` 400) y se abre la otra; si no, el `history.back()` de la
  que se cierra cerraba la nueva.
- Páginas sueltas: `#capturas` y `#analisis` abren la app solo en esa hoja (el
  ordenador), aunque no haya línea; el hash se quita AL ABRIR con
  `replaceState`, o «atrás» la volvía a abrir.
- Medir dentro de una hoja espera a `getAnimations({ subtree: true })`.

## Modo ordenador

Desde `ANCHO_PC` (1.100 px) `BarraPC` saca lo de «Ajustes» (en el móvil,
`display: none`). Teclas (`atajos.js`): E, A, B; nunca en un campo, con una
hoja o diálogo abierto, con Control/Cmd/Alt, con la tecla mantenida ni sin el
draft a la vista. `app/atajos`, `pc.e2e`.

## Los idiomas

- Español e inglés en `src/app/i18n/` (`es.js`, `en.js`, `crearT`). Los
  motivos del motor son CLAVES (`{ clave, params }`) que traduce la app; una
  regla nueva lleva su clave en los dos idiomas (`app/i18n`: los dos
  completos y toda clave usada existe).
- La coma decimal la pone el traductor: un parámetro que es solo un número
  con un punto sale con coma; «3.58.1» o «2.268 partidas» no se tocan. Los
  porcentajes van como número y el «%» en la frase.
- Los nombres de héroe y de objeto no se traducen: son la clave de los datos y
  la API devuelve inglés en los 17 idiomas. La BÚSQUEDA acepta los dos
  (`motor/alias.js`, solo alias comprobados). El diagnóstico va en español.

## La versión y las novedades

- `vite.config.js` emite `version.json` (fuera de la precarga y de `/data/`) y
  mete `__APP_VERSION__` (`APP_VERSION` del entorno, o `package.json`) y
  `__CHANGELOG__`. El pie dice la versión y abre las novedades; «nuevo» sale
  hasta abrirlas (`roam-picker:version-vista`).
- Se actualiza sola: pregunta al volver a primer plano y se recarga cuando el
  worker nuevo toma el control (`controllerchange`, con pestillo). Es seguro
  porque todo el estado se guarda en cada cambio: estado nuevo sin guardar
  obliga a revisar esto.

## Licencias, token y administración

- `licencia.js` (puro): claves de invitado firmadas con ECDSA P-256;
  `comprobarClave` nunca lanza y dice el motivo. `public/licencias.json` pasa
  siempre por `sanearLicencias` (la privada no se publica nunca). La puerta va
  después de todos los hooks; sin `licencias.json` se deja pasar y el
  administrador siempre pasa. Es una puerta, no una caja fuerte.
- El token de GitHub (`useToken`, `roam-picker:envio` = `{ token }`) es solo
  de administración: viaja solo a `api.github.com` en la cabecera, nunca a
  props, perfil ni diagnóstico, y nada sube a incidencias (`app/token`).
  `escribirFichero` acepta el contenido como función de lo que hay AHORA en el
  repositorio y la Administración lee de la API, no de Pages (Pages tarda
  minutos y el siguiente cambio partía de la copia vieja).

## Las pruebas de navegador

- `npm run test:ui` = `dist-al-dia.mjs` (dist/ es la compilación de lo de
  ahora) + `node --test --test-concurrency=3` sobre
  `pruebas/interfaz/*.e2e.mjs`. Las corre `pruebas-ui.yml`.
- `navegador.mjs`: `servirDist`, `abrirNavegador` (`PLAYWRIGHT_CHROME`),
  `paginaCon` (siembra `roam-picker:*` una vez por contexto), `elegirEnSelector`.
  Cada fichero abre su Chrome y lo cierra en `after()`; los `test()` del nivel
  superior NO llevan `await` (con `after()`, el primero cerraría el navegador).
- `tablet-falsa.mjs` responde en `http://192.168.68.116:47323/**` con
  `context.route` (la última ruta registrada manda): `.viejo` (404 en
  `/draft`), `.caida`, `.retener`, `.pedidas`.
- `actualizacion.e2e` compila a un temporal con `APP_VERSION`: el repositorio
  no se toca. Aun así, **no se commitea con las pruebas de navegador en
  marcha** ni se recompila dist/ mientras corren.
- Las peticiones del service worker no pasan por `route`: `sinServiceWorker`.
