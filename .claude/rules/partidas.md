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
