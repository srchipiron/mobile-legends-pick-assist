# Lecciones

Lo que salió mal una vez y la prueba o la regla que lo vigila hoy. Una línea por
lección. Léelo antes de tocar una zona que no conozcas. La crónica de cada una,
con fechas e incidencias, está en `docs/archivo/errores-3.102.md`.

## Pruebas (todas las zonas)

- Una prueba con plazo fijo dejaba fuera a las asíncronas en GitHub → `node --test` espera todo y una que falla tarde cuenta.
- Código suelto tras las pruebas corre ANTES que ellas con `node --test` → limpieza en `after()` (4.0).
- Un guardarraíl con una expresión que no casaba con nada pasó años en verde → toda guarda nueva se rompe a propósito (mutación) antes de fiarse.
- Una guarda que busca texto se salta con un comentario o un alias → leer por FORMA (AST, pasos troceados), nunca `includes` sobre texto con comentarios.
- Siete pruebas exigían que el dato del día fuera bueno y pararon despliegues legítimos → sobre datos reales se prueba la REACCIÓN del código; los estadísticos, sobre `fixtures/meta-sintetico.mjs`.
- Pruebas que dependían del orden de un fichero → valores sintéticos por NOMBRE (`porNombre`).
- Al cambiar el modelo, una prueba perdió poder sin fallar → re-mutar al cambiar lo que vigila, no solo re-pasar.
- Al partir en capas (3.0) se perdió la prueba que cruzaba capas → inventario por comportamiento antes de borrar ninguna.
- Un reloj simulado que suma el real → acotar con el real; las pruebas de la vigilancia llevan su reloj.
- Un servidor de prueba sin cerrar colgaba la corrida → `finally`.
- Una prueba de navegador con su servidor en el mismo proceso no mide plazos con esperas fijas → se mira dentro de la página.

## Motor

- Grafías distintas dejaban héroes sin datos → todo por `nombreClave`, matrices indexadas en sus dos niveles, `buscar` con respaldo crudo (`nombres`, `matrices.test`).
- El orden decide números (catálogo, `Object.entries`, ordenaciones estables, primer máximo, consumo del azar) → una reescritura se verifica con paridad (`docs/paridad.md`).
- Centros en la media simple favorecían al equipo con más héroes en pantalla → «lo que cabe esperar de lo que SALE»: ponderado por pick, parejas de líneas distintas, equilibrio por subconjuntos de líneas (`draft.test`, `modelo.test`).
- Entre cuotas un `?? 1` le daba a un héroe nuevo el peso de todos → el «no sé» vale 0.
- Umbrales de cruce escritos a mano (0,53 en tres sitios) → percentiles medidos en `matrices.js`; ESLint prohíbe otro.
- Motivos cortados antes de quitar los comunes → filtrar (>60 %) ANTES de cortar a tres; una regla por etiqueta solo se dice si el cruce va en su sentido (`ranking.test`).
- El rival enemigo a enemigo se equivocaba en el 10–21 % → reparto conjunto, margen 0,20 y encaje mínimo (`lineas.test`); aliados sin tu línea (`equipo.test`).
- Un corte duro sobre algo que crece solo (99 → 100 partidas) cambiaba el nº1 → encogimiento continuo.
- Un estadístico sin su error típico avisaba «peor que una moneda» con el modelo perfecto → siempre con su ±.
- Cambiar `evaluarDraft` sin subir `VERSION_MODELO` → la huella de `modelo.test` falla.
- El diagnóstico llamaba al ranking por su cuenta y medía otro modelo (3.93–3.102) → todo por `draft.js`; prueba en `diagnostico.test` (4.0).
- Peel a un tanque → `hayQueProtegerlo` en parejas, peligro y plan.
- Banear tu propio pick fijado → `conTuPick` (`draft.test`).

## Interfaz

- Usar algo antes de declararlo dejó la app en negro → ESLint `no-use-before-define`.
- La × oculta en móvil y reglas tras el primer `@media` → `scripts/comprobar/css.mjs`.
- Un desborde solo se ve en el ancho MÍNIMO y con el contenedor LLENO (`responsive.e2e`); la nº1 asoma en 360×640 (`primera-pantalla.e2e`).
- `filter`/`transform` en un ancestro de algo `fixed` lo descoloca.
- Lo que se toca a contrarreloj no se mueve bajo el dedo (orden estable, rejilla calculada al abrir).
- Nada con efectos dentro de un updater de `setState`.
- Lo diferido lleva la marca del draft para el que se calculó (`robustez`, consejo).
- Lo automático que escribe donde también toca la persona respeta lo que ella quitó (`rechazados`, `aMano`).
- «Una vez por draft» se marca en lo que sobrevive a una recarga, no en un ref.
- Un informe que dice «bien» tiene que haber visto con qué: falta de dato es aviso.
- No se commitea con las pruebas de navegador en marcha (una compilaba con la versión cambiada).

## Lector (tablet)

- La seguridad se vigila por FORMA y la prueba se porta antes que el código (`lector.test`, `android.test`).
- Lo aprendido nunca manda sobre lo medido; nada se aprende en marcha del resultado (142 de 145 victorias falsas, 3.99.0) → plantillas fijas medidas y aviso con 10 iguales seguidas.
- Lo que identifica una pantalla (fila de baneos) va antes que lo que se lee en ella; una puerta de una sola zona necesita otra entrada (4 picks) y su aviso.
- Una zona que deja de leerse da falsos sueltos → un baneo cuenta junto a otro, un elegido no es baneado, se cuentan héroes distintos, un héroe ocupa un hueco.
- Tu fila por la última lectura daba el héroe de un compañero → por mayoría.
- Dos que pueden llevar lo mismo se pisan → una sola conductora del draft: la tablet (protocolo 2, 4.0).
- Al cambiar el ritmo de un bucle, toda ventana contada en vueltas pasa a tiempo.
- Un `catch` mudo en un aparato sin logcat → cada bucle deja su estado en `salud.json`, el registro o el parte.
- El Node de la APK no entiende `\p{}` ni el indicador `v` → prohibidos en todo lo que carga la APK.
- Dos peticiones de grabar → `SecurityException` en bucle → una sola, con cerrojo.
- «Contesta como el mío» no es «es el mío» → el reto PBKDF2 antes de dar el código.
- Lo que manda a borrar se lee con la clave del dueño, nunca de una tabla pública.
- Arreglar el lector no arregla lo ya apuntado → `esDudosa`/`conResultado` en toda medida.
- El esquema de `versionCode` desbordó en 3.100.0 (4.0.0 habría sido menor que 3.102.0) → `mayor·1e6 + menor·1e3 + parche`, con prueba de que no baja (4.0).

## Datos (ingesta)

- La ingesta se EJECUTA entera contra una API simulada, a temporales, y se comprueba que sale lo servido, no lo conservado (`ingesta-simulada`).
- Elegir ruta midiendo lo que trae; una fila de menos de la mitad no sustituye (`esCorta`).
- Leer el esquema OpenAPI, no adivinar parámetros; nunca rutas de la cuenta.
- Todo «conservo lo anterior» se pregunta qué metadato deja de ser verdad (fechas por recurso, `relaciones.ultima`).
- El comparador mira lo guardado Y el máximo del historial (`FIJAS`).
- Fundir por filas una matriz antisimétrica rompe la simetría → `recoser`.
- Caché «para siempre» con la huella del contenido en el nombre (`?v=`).
- Fechas en UTC.
- Un cambio de `supabase/esquema.sql` no está hecho hasta aplicarlo y probarlo como `anon`.

## Bots, CI y publicación

- Las guardas de los workflows se barren en TODOS (`workflows.test`): ingesta con `--out` y comparador, plazos, `shell: bash`, rebase antes del push, reintentos que acaban en rojo, SHA fijado.
- `npm test | tail` devuelve el código de `tail` → mirar el código de salida de `npm test`.
- Lo publicado también es estado: el despliegue no vuelve a datos más viejos que los de Pages.
- Un push con `GITHUB_TOKEN` no dispara `on: push` → los bots que commitean van en `workflow_run` de `deploy.yml`.
- Tras una tanda de versiones, revisión a la contra (`/revisar`).
