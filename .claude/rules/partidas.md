---
paths:
  - "src/motor/registro.js"
  - "src/motor/perfil.js"
  - "src/motor/maestria.js"
  - "src/motor/habitos.js"
  - "src/app/envio.js"
  - "src/app/github.js"
  - "src/app/estado/useEnvio.js"
  - "src/app/estado/usePersonal.js"
  - "scripts/importar-partidas.mjs"
  - "scripts/medir-mias.mjs"
  - "historial/**"
  - "supabase/**"
  - "src/app/basedatos.js"
  - "src/app/estado/useComunidad.js"
  - "src/app/componentes/Comunidad.jsx"
  - "src/motor/comunidad.js"
  - "scripts/medir-comunidad.mjs"
  - "scripts/montar-supabase.mjs"
  - ".github/workflows/partidas.yml"
---

# Tus partidas y la maestría

Se carga al tocar el registro de partidas, la maestría, el perfil o su subida al proyecto.

## La base de datos de tus partidas (3.8.0)

`historial/partidas.json`: las partidas de Javi apuntadas con la app (con
su draft, resultado, baneos y estimación) y su maestría, fundidas envío a
envío. Es la ÚNICA forma de medir el modelo en su cola: hasta 3.8.0 esos
datos vivían solo en su móvil y ninguna sesión podía leerlos.

- **Cómo llegan**: «Tus partidas» → «Enviar mis partidas al proyecto»
  (HistorialPartidas.jsx) abre una incidencia de GitHub ya rellena con el
  código de perfil (`exportarPerfil`, el mismo de «Tu perfil»); si el
  código no cabe en la dirección (`TOPE_URL`, 7.000 caracteres) se copia
  al portapapeles y la incidencia se abre para pegarlo. `partidas.yml`
  escucha `issues` (opened, edited), SOLO del dueño del repositorio y SOLO
  si el cuerpo lleva `MLPA1.`; el cuerpo va por variable de entorno a un
  fichero, nunca dentro del mandato; `scripts/importar-partidas.mjs` busca
  la forma exacta del código, lo lee con `leerPerfil` (suma de control y
  `sanear`) y lo funde con `fundirPerfil` con el MÓVIL como copia que gana
  (lleva las correcciones); commitea con rebase y reintentos; y
  `scripts/medir-mias.mjs` responde en la incidencia y la cierra.
- **Qué mide `medir-mias.mjs`**: el Veredicto (`resumen`), la calibración
  de la estimación guardada (`calibracion`) y, lo nuevo, la RE-PUNTUACIÓN
  de cada draft guardado con el modelo y los datos de hoy (Brier, AUC,
  acierto del lado, pendiente logística sobre el log-odds con su error
  típico), más partidas por héroe y por mes. Cuando haya unas 100 partidas
  con draft, la pendiente dice si la escala 0,44 vale en su cola; hasta
  entonces manda el ±. El fichero se puede leer en cualquier sesión y
  `medir-mias.mjs` se puede pasar a mano. Desde 3.60.2 dice aparte las que
  apuntó el lector solo (`soloLector`), porque las de a mano pueden llevar
  sesgo. El 20 de octubre de 2026 salía un 55% en 56 del lector frente a un
  64% en 181 a mano, y +1,5 ± 16 puntos contra tu winrate de siempre. Los
  meses van en la hora de Madrid. Desde 3.60.3 cada partida con estimación
  guarda `modelo` (`VERSION_MODELO`, modelo.js; `sanear` lo valida y
  `cambiarHeroe` lo quita con la estimación). Las de antes se reparten por su
  instante con `CAMBIOS_DE_MODELO` (los commits de 3.4.0 y 3.56.0, marcadas
  como `deducido`). `calibracion` devuelve `porModelo` y `actual`, y el bot,
  el Diagnóstico y el Veredicto dicen aparte la del modelo de hoy. El 20 de
  octubre de 2026: modelo 1, 29 partidas (previsto 54%, real 69%); modelo
  2, 164 (54% / 63%); modelo 3, 25 (55% / 56%).
- **La subida automática (3.10.0)**: `src/app/envio.js` (puro: huella
  FNV-1a de partidas+maestría, `tocaSubir`, `ESPERA_MS` 3 s, `REINTENTO_MS`
  10 min), `src/app/estado/useEnvio.js` (el estado en `roam-picker:envio`:
  token, incidencia, huella subida, último error) y `subirIncidencia` en
  `src/app/github.js` (la API: PATCH a la incidencia guardada, POST con
  etiqueta si no hay o si ya no existe; 401 → `token`, 403/404 al crear →
  `permiso`, fetch roto → `red`). El token es de grano fino, limitado a
  «Issues: read and write» de este repositorio, lo pega Javi en «Tus
  partidas» y SOLO viaja a `api.github.com` en la cabecera Authorization:
  no entra en el código de perfil (`recogerPerfil` toma campos explícitos)
  ni en el diagnóstico, y la hoja recibe `activo`, no el token
  (`envio.e2e.mjs` lo comprueba, verificado por mutación). Con él, cada
  cambio en partidas o maestría se sube solo a la MISMA incidencia, que el
  bot procesa igual (`edited` también dispara `partidas.yml`), así que las
  respuestas quedan en hilo. Sin token, el botón sigue abriendo el
  formulario. Desde 3.60.2 cada subida lleva solo las `PARTIDAS_POR_ENVIO`
  (200) más recientes (`paraSubir`, envio.js); el bot funde por instante con
  lo que tiene. Con todas, el cuerpo pasaba de 65.536 caracteres hacia las
  350–400 partidas (237 eran 38.114) y GitHub la habría rechazado para
  siempre. Prueba con las partidas reales repetidas hasta 600. Si el token caduca, la hoja lo dice y no se insiste: los
  mismos datos que fallaron esperan `REINTENTO_MS` o un cambio. Nació de
  que el formulario ya relleno obligaba a iniciar sesión en GitHub desde el
  móvil y ese inicio de sesión, con el código dentro de la dirección,
  fallaba con un 501.
- **Las partidas quitadas dejan marca (3.10.1)**: `olvidadas` (instantes,
  `roam-picker:olvidadas`, tope `TOPE_OLVIDADAS` 1.000) viaja en el código
  de perfil y en `historial/partidas.json`, y `fundirPerfil` descarta toda
  partida marcada venga del lado que venga. Sin eso la fusión solo sumaba:
  una partida apuntada por error y quitada en el móvil se quedaba en la
  base de datos del proyecto (la subida automática la manda a los 3 s) y
  volvía al importar un código viejo. Corregir un resultado ya se
  propagaba (mismo instante, gana el móvil). Pruebas en perfil, partidas
  y `envio.e2e`, verificadas por tres mutaciones. Desde 3.60.2 la × del
  historial no borra en el acto: la fila dice «Quitada · Deshacer» durante
  `QUITAR_MS` (6 s) y solo después llama a `onOlvidar`; al cerrar la hoja
  también. Tiene que ser ANTES de la subida, porque en el proyecto la marca
  ya no se deshace.
- **No se redespliega**: la app no lee `historial/partidas.json` (el bot
  no está en el `workflow_run` de `deploy.yml` a propósito). Si algún día
  la app lo enseña, hay que meterlo ahí.
- **Privacidad**: es su repositorio público y lo manda él con un botón
  que lo dice; la promesa «tus datos no salen de tu móvil» sigue: salen
  porque los saca él. No hay servidor ni credencial en la app.

**El tope de 500 (3.60.8)**: `apuntar` recorta a `tope` por fecha y se
llevaba primero las `previa` (tu historial del juego, las más viejas). Desde
3.60.8, decisión de Javi, las previas no se recortan nunca: el tope cuenta
con ellas y solo quita apuntadas con la app. Prueba en `registro.test`, dos
mutaciones.

**«Para ti»: el número ajustado a tus partidas (3.68.0)**, pedido: «haz que
el programa pueda ir mejorando conforme juegue».
- Ya aprendían de cada partida la maestría (`maestriaEfectiva`, la que pesa
  en el ranking), la co-ocurrencia de baneos y las caras del lector. Lo que
  no aprendía era el número.
- `ajustePersonal` (registro.js) es una logística prudente
  ganar ~ a + b·logit(estimación), con a priori a ~ N(0, 0,5²) y
  b ~ N(1, 0,5²), sobre las partidas con estimación que no son previas.
- Medido el 24 de octubre de 2026 en 229 partidas, cada una predicha con
  las de antes (verosimilitud por partida):
  - tal cual, −0,6875;
  - σ 0,5, −0,6771 (+1,04 por 100 partidas);
  - sin prior, −0,6773;
  - σ 0,3, −0,6778;
  - solo el intercepto, −0,6799.
- Con todas: a 0,39, b 0,57. Javi gana el 62% y la media estimada era 54%;
  el número del modelo separa poco en su cola (b libre 0,18).
- `MINIMO_AJUSTE` 30 (desde donde se midió). `b ≥ 0,05`, para que nunca dé
  la vuelta al orden.
- Se enseña («Para ti», `.estimacion-tuya`, en la misma línea que
  «Con X · n de 10») y NO puntúa: el orden lo deciden el modelo y la
  maestría. La estimación que se guarda en cada partida sigue siendo la del
  modelo, sin ajustar: si se guardara la ajustada, el ajuste se ajustaría
  sobre sí mismo.
- Pruebas en `registro.test` y `primera-pantalla.e2e` (40 partidas: sale y la
  nº1 sigue asomando a 360×640).

## La base de datos de la comunidad (3.69.0)

Pedido por Javi: «una base de datos de todas las partidas por clave… para
saber si el programa ayuda». Eligió (preguntado) **clave por jugador** frente
a usuario y contraseña o seguir solo con la suya. La guía para montarla y lo
que se guarda: `docs/comunidad.md`.
- **El servidor** es un proyecto gratuito de Supabase de Javi, con
  `supabase/esquema.sql`. Tablas con RLS sin políticas Y sin permisos para
  `anon`/`authenticated` (dos capas: cada una sola aguanta, la prueba exige
  las dos). Solo se entra por cuatro funciones `security definer` con
  `search_path` fijo: `subir_partidas` (lote ≤ 200, partida ≤ 2 KB con `t`,
  `pick` y `gane`, y se guardan SOLO los campos conocidos; ≤ 5.000 por
  jugador, 200.000 y 20.000 jugadores en total; un winrate de siempre fuera
  de 30–70% no se guarda), `mis_partidas`, `borrar_mis_partidas` y `partidas_comunidad`
  (páginas de ≤ 1.000 por `(jugador, t)`, con un número de jugador y nunca
  la huella). La clave se guarda como SHA-256. En SQL, `<>` con un campo que
  falta da NULL y NO rechaza: se valida con `is distinct from` (la prueba lo
  cazó con una partida sin `gane`).
- **La prueba del SQL** (`pruebas/sql/esquema.sql.mjs`, `npm run test:sql`,
  también en `pruebas-ui.yml`) monta un Postgres temporal con los roles y los
  permisos POR DEFECTO de Supabase (todo lo nuevo de `public` se da a anon),
  pega el esquema dos veces y prueba como `anon`. Diecinueve mutaciones,
  todas cazadas; tres sobrevivían al principio y eran la prueba: quitar el
  RLS lo tapaba el `revoke` (hoy se mira cada capa), el tope de 1.000 filas
  se probaba con 2, y `huella_de` se llamaba con una clave inválida (fallaba
  por la clave, no por el permiso). No va en `npm test`: publicar no depende
  de tener Postgres.
- **La app**: `src/app/basedatos.js` (puro salvo la red inyectada).
  `sanearConfig` solo acepta `https://<20>.supabase.co` y una clave
  publicable (`sb_publishable_` o un JWT con `role: anon`), nunca
  `sb_secret_` ni `service_role`. `paraLaComunidad` saca de cada partida lo
  que sirve para medir: nada de `lector`. La primera subida va entera en lotes
  de 200; después, las 200 más recientes y las quitadas
  (`olvidadas`). `useComunidad` (`roam-picker:comunidad`, clave NUEVA:
  casilla, clave de jugador, huella subida) sube a los `ESPERA_MS` como
  useEnvio, con la huella de partidas, quitadas y referencia. El token de
  GitHub no pasa por aquí; la Administración publica `public/comunidad.json`
  con `escribir` de useEnvio. Sin ese fichero no se ve nada.
- **La medida** (`src/motor/comunidad.js`): siguiendo frente a por libre
  DENTRO de cada jugador (≥ `MINIMO_POR_RAMA` 5 en cada rama, pesado por
  1/(1/n₁+1/n₂)), contra el winrate de siempre de CADA uno (su
  `referencia`), lo mismo solo con `origen: 'lector'`, y la calibración de
  siempre. Conclusión solo con `MINIMO_JUGADORES` 3. La prueba tiene el caso
  de Simpson: dos jugadores que ganan igual sigan o no, uno sigue mucho y
  gana mucho; mezclados salen +27 puntos, dentro de cada uno 0.
- Pruebas: `app/basedatos` (Supabase de pega en `pruebas/fixtures/
  supabase-falso.mjs`, las mismas respuestas que el esquema: si cambias una,
  cambia la otra), `motor/comunidad` y `comunidad.e2e` (sin
  configuración no sale; la casilla sube sin lector ni token; quitar borra
  allí; «Dejar de guardar» no sube; tu clave en otro móvil trae y funde; Ver;
  borrar; la Administración no deja publicar la secreta). Mutaciones: 19 en
  el cliente y la medida, 9 en el navegador.
- **La revisión de seguridad (antes de publicar)** no encontró nada crítico
  (token, clave secreta y cuenta del juego, a salvo) y sí cuatro cosas,
  reproducidas y arregladas con su prueba y su mutación: los topes globales
  bloqueaban también a quien ya estaba (hoy solo frenan jugadores y
  partidas NUEVOS: quien está puede corregir y borrar aunque alguien llene
  el resto); se guardaba cualquier campo (4 KB × 300.000 pasaba de los 500
  MB gratuitos); un winrate de siempre inventado movía la medida de todos
  (`REFERENCIA_POSIBLE` en la medida, el mismo filtro en el servidor); y un
  `t` con «.0» daba un error genérico. Aceptado y dicho en la guía: sin
  cuentas, cualquiera puede subir partidas falsas, y bajar la comunidad
  entera muchas veces gasta la transferencia del plan gratuito.
- **Montarla sin el panel** (`scripts/montar-supabase.mjs`): con
  `SUPABASE_ACCESS_TOKEN` (un secreto del entorno, nunca en el chat), crea o
  reutiliza el proyecto, espera a `ACTIVE_HEALTHY`, pega el esquema por
  `/database/query`, elige SOLO una clave que pase `clavePublicable`
  (`api-keys?reveal=false`), comprueba `partidas_comunidad` con ella y
  escribe `public/comunidad.json`. El token solo va a api.supabase.com en
  la cabecera y no sale en ningún error. Prueba con una API de gestión de
  pega, siete mutaciones. Publicar comunidad.json cambia lo que hace la app:
  sube la versión.
- **No medible desde aquí**: el Supabase de verdad (la prueba es un Postgres
  con sus roles). Si el primer «Guardar mis partidas» dice «no acepta la
  clave pública», es la clave o el esquema sin pegar.

