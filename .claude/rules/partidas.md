---
paths:
  - "src/motor/registro.js"
  - "src/motor/perfil.js"
  - "src/motor/maestria.js"
  - "src/motor/habitos.js"
  - "src/motor/analitica.js"
  - "src/motor/comprobacion.js"
  - "src/motor/comunidad.js"
  - "src/app/github.js"
  - "src/app/estado/useToken.js"
  - "src/app/estado/usePersonal.js"
  - "src/app/estado/useApuntar.js"
  - "src/app/estado/useComunidad.js"
  - "src/app/componentes/Comunidad.jsx"
  - "src/app/componentes/HistorialPartidas.jsx"
  - "src/app/componentes/Analitica.jsx"
  - "src/app/componentes/ComprobarTablet.jsx"
  - "src/comun/basedatos.js"
  - "scripts/importar-partidas.mjs"
  - "scripts/medir-mias.mjs"
  - "scripts/medir-comunidad.mjs"
  - "scripts/montar-supabase.mjs"
  - "scripts/revisar-tablet.mjs"
  - "historial/**"
  - "supabase/**"
---

# Tus partidas, la maestría y el perfil

Se carga al tocar el registro de partidas, la maestría, el perfil, el
análisis o la base de datos. La crónica de cómo se llegó aquí y lo que
salió mal están en `docs/` (el archivo de 3.x y las lecciones).

## Quién apunta cada partida (protocolo 2)

- **Un draft de la tablet lo apunta la tablet**: vigila el final, pregunta
  «¿Cómo acabó?» y apunta. Si contestas en el móvil (Gané/Perdí del
  recordatorio o de «Apuntar partida»), el móvil manda `POST /resultado
  {desde, gane}` (`useApuntar`, tras los 20 s del «Deshacer»); la partida
  vuelve en `partida.registro` y se funde con el MISMO `t`. El móvil no apunta
  por su cuenta un draft de la tablet; solo si la tablet no toma el resultado.
- **Un draft hecho a mano** (o sin tablet) lo apunta el móvil, con su
  «Deshacer» (`apuntarAMano`). «No la terminé» solo existe con un draft de la
  tablet (`gane: null`).
- El pick: el fijado o leído; si no hay, el nº1 con `supuesto: true`.

## El registro (`registro.js`, `usePersonal`)

- `roam-picker:partidas`, tope 500 por fecha; las `previa` (tu historial del
  juego) no se recortan nunca: el tope solo quita apuntadas con la app
  (decisión de Javi).
- Cada partida con estimación guarda `modelo` (`VERSION_MODELO`); las de antes
  se reparten por instante (`CAMBIOS_DE_MODELO`, `deducido`). La estimación que
  se guarda es la del modelo: guardar una ajustada haría que el ajuste se
  ajustara sobre sí mismo. La app no enseña «Para ti» (tus resultados no
  entran en la nota, 3.93.0).
- **Quitar deja marca**: `olvidadas` (instantes, `roam-picker:olvidadas`,
  `TOPE_OLVIDADAS` 1.000) viaja en el perfil y a la base de datos, y
  `fundirPerfil` descarta toda partida marcada venga de donde venga. La × del
  historial dice «Quitada · Deshacer» `QUITAR_MS` (6 s) antes de olvidar: la
  marca, una vez subida, no se deshace.
- **Arreglos**: `editada` (la hora del arreglo) la ponen `corregirPartida`,
  `cambiarHeroePartida`, `cambiarDraftPartida` (hasta 5 enemigos y 4
  compañeros, sin tu pick ni repetidos entre equipos) y la tablet. En la
  misma partida gana la copia de fuera solo si se arregló DESPUÉS; `lector`
  (que la base de datos no guarda) se queda el local.
- **`esSupuesta`** saca de todo lo que mira con quién jugaste (Veredicto,
  calibración, maestría efectiva, comunidad, `revisarDrafts`, tus héroes) a la
  partida con pick supuesto; el resultado sí cuenta (racha, winrate). Cambiar o
  confirmar el héroe quita la marca.
- **`esFantasma`**: del lector, supuesta, sin `editada`, ≤ 1 héroe leído y < 2
  baneos distintos. `usePersonal` las quita como `olvidarPartida` (con marca,
  así la siguiente subida las borra también de la base de datos: borrar solo
  allí no basta, el móvil las volvería a subir). Una contestada en «Capturas»
  lleva `editada` y no es fantasma.
- **`esDudosa`/`conResultado`**: lo del lector entre `DUDOSAS_DESDE` y
  `DUDOSAS_HASTA` (octubre–noviembre de 2026: 132 victorias de 135) sin
  `editada` posterior no cuenta para nada que mida si ganaste. Toda medida que
  mire `gane` va por `conResultado` y se prueba en `motor/dudosas`. No se
  borran: en «Tus partidas» salen como «resultado dudoso» con ✓ y ⇄.

## La maestría y el perfil (`maestria.js`, `perfil.js`)

- La maestría (`roam-picker:mastery`) se edita a mano o se aprende de tus
  partidas (`maestriaEfectiva`), viaja en el perfil y a la tablet
  (`POST /ajustes`, hasta `MAESTRIA_MAX`). La app no se la pasa al motor.
- El código de perfil lleva los datos DENTRO (JSON, gzip si se puede,
  base64url, versión delante y suma de control detrás; ~500 caracteres).
  `recogerPerfil` toma campos explícitos: el token nunca entra.
- Importar FUNDE (`fundirPerfil`): de cada héroe gana la copia con más
  partidas (en el empate, la que trae fecha; nunca «la más reciente», porque
  `fecharMaestria` la pone cada dispositivo al verla); las partidas se juntan
  sin duplicar. La prueba lo mira EN LAS DOS DIRECCIONES.

## Lo que se mide (`habitos.js`, `analitica.js`, `comprobacion.js`)

- Nada se afirma dentro de su margen (`compararProporciones`, Wilson).
- `tusNumeros` (racha, sesión, franjas, duraciones, tras perder, héroes),
  `tuSemana` (`SEMANA_MS` contra la anterior; `MINIMO_SEMANA_HEROE` 3) y el
  Veredicto (`resumen`, con supuestas y dudosas aparte). En pantalla, uno solo:
  `TusNumeros.jsx`, que usan «Tus partidas», Analítica y el Veredicto.
- `analitica.js` (reloj inyectado): `evolucion` (12 semanas), `porCompaneros`
  (desde `MINIMO_CON_UNO` 8; mejores por el borde BAJO, peores por el ALTO),
  `porLinea`, `porDia`, `conLaApp`. Hoja `analisis`, también `#analisis`.
- **Comprobar la tablet cada semana**: `paraComprobar` elige AL AZAR (semilla
  por semana, FNV-1a) hasta `POR_SEMANA` (3) partidas del lector de los
  últimos siete días, con resultado, pick y sin `editada`: al azar para que el
  acierto sea una muestra sin sesgo. `precisionDeLaTablet` da aciertos con su
  Wilson y fallos por tipo. Se guarda en `roam-picker:comprobadas` (del
  móvil, `TOPE_COMPROBADAS` 500). `ComprobarTablet` va arriba en «Tus
  partidas»; sus comprobantes se piden con un efecto atado a url, clave
  pública y clave, no al objeto `comunidad.config` (se rehace en cada subida).

## La base de datos de la comunidad

Elegido por Javi: una clave por jugador, sin correo ni contraseña. Guía y qué
se guarda: `docs/comunidad.md`.

- **El servidor** (`supabase/esquema.sql`, un proyecto gratuito de Javi):
  tablas con RLS sin políticas Y sin permisos para `anon`/`authenticated` (dos
  capas; la prueba exige las dos). Solo se entra por funciones `security
  definer` con `search_path` fijo: `subir_partidas` (lote ≤ 200, partida ≤ 2
  KB con `t`, `pick` y `gane`, solo campos conocidos, topes por jugador y
  globales que frenan solo lo NUEVO; un winrate de siempre fuera de 30–70% no
  se guarda; `on conflict` solo si la `editada` que llega es ≥ la guardada),
  `mis_partidas`, `borrar_mis_partidas`, `partidas_comunidad` (páginas de
  ≤ 1.000, número de jugador, nunca la huella) y `subir_parte` /
  `partes_recientes` (los partes de la tablet). La clave se guarda como
  SHA-256. En SQL se valida con `is distinct from`: `<>` con un campo que falta
  da NULL y no rechaza.
- **La prueba del SQL** (`pruebas/sql/esquema.sql.mjs`, `npm run test:sql`,
  en `pruebas-ui.yml`, no en `npm test`) monta un Postgres con los roles y
  permisos por defecto de Supabase, pega el esquema dos veces y prueba como
  `anon`.
- **El cliente** (`src/comun/basedatos.js`, puro salvo la red inyectada):
  `sanearConfig` solo acepta `https://<20>.supabase.co` y una clave publicable
  (`sb_publishable_` o JWT `role: anon`), nunca la secreta. `paraLaComunidad`
  saca de cada partida lo que sirve para medir: nada del lector ni del
  perfil. La primera subida va entera en lotes de 200; después, las 200 más
  recientes, las de más atrás con `editada` y las quitadas. `queTraer` trae lo
  que falta y lo arreglado allí después.
- **`useComunidad`** (`roam-picker:comunidad`: casilla, clave de jugador,
  huella subida) sube a los `ESPERA_MS` de un cambio, con `huellaDeSubida`
  (partidas, quitadas, referencia; la misma cadena que en 3.x, así lo ya
  subido no se repite al actualizar) y reintenta a los `REINTENTO_MS`.
  Vinculado y sin clave propia, pide la de la tablet (`GET /clave`) y la usa.
  Sin `public/comunidad.json` no se ve nada; lo publica la Administración.
- **La medida** (`motor/comunidad.js`): siguiendo frente a por libre DENTRO
  de cada jugador (≥ `MINIMO_POR_RAMA` 5 por rama), contra su propio winrate
  de siempre; conclusión solo con `MINIMO_JUGADORES` 3. La prueba tiene el caso
  de Simpson.
- Aceptado y dicho en la guía: sin cuentas, cualquiera puede subir partidas
  falsas (`REFERENCIA_POSIBLE` acota su efecto en la medida).
- `scripts/montar-supabase.mjs` monta el proyecto con
  `SUPABASE_ACCESS_TOKEN` (secreto del entorno, solo a api.supabase.com) y
  escribe `public/comunidad.json` solo con una clave que pase
  `clavePublicable`. `scripts/revisar-tablet.mjs` lee los partes (sale con 1
  con algún FALLO, con 2 si la base de datos no contesta).
- Pruebas: `app/basedatos` (con `pruebas/fixtures/supabase-falso.mjs`, que
  responde como el esquema: si cambias uno, cambia el otro), `motor/comunidad`,
  `pruebas/sql` y `comunidad.e2e`.

## `historial/partidas.json` y el token

- Las partidas de Javi con su draft, resultado y estimación. Lo leen
  `medir-mias.mjs` (Veredicto, calibración por modelo, re-puntuación con el
  modelo de hoy) y `proponer-modelo` (que además baja la base de datos).
  `importar-partidas.mjs` sigue, a mano.
  Desde 3.98.0 el historial se quedó en octubre: `medir-mias.mjs --base` junta
  las de la base de datos (`partidas_comunidad`, tu número de jugador; con
  varios jugadores, `--jugador N`), sin repetir por `t` y con la arreglada después. La app no lo lee y no está en el
  `workflow_run` de `deploy.yml`.
- **Nada sube a incidencias de GitHub.** El token (`useToken`,
  `roam-picker:envio` = `{ token }`, `sanearToken` descarta lo de versiones
  viejas) es solo de administración: `leerFichero`/`escribirFichero` de
  `public/licencias.json` y `public/comunidad.json`, en la cabecera y solo a
  `api.github.com`. El botón del Diagnóstico abre una incidencia rellena en el
  navegador, a mano. Pruebas: `app/token` (forma de lo guardado y ningún
  fichero de `src/app` abre ni comenta incidencias por la API), `app/github`.
