# Errores ya cometidos, para no repetirlos

Todos estos llegaron a producción y costaron rondas enteras de ida y vuelta:

- **`ROUTES is not defined`** — la ingesta reventaba en la primera línea. Pasaba
  `node --check` porque la sintaxis era válida. Hay una prueba que la ejecuta de
  verdad; no la quites.
- **El tercer workflow fuera del guardarraíl** — `mantenimiento.yml` ejecutaba
  la ingesta sin `--out`, directa sobre `public/data`, sin comparar y sin tope;
  la prueba del guardarraíl solo listaba los otros dos. No commiteaba el
  fichero, pero derivaba las tablas y pasaba `npm test` sobre lo que saliera.
  Hoy los tres hacen lo mismo y la prueba recorre los tres. Si añades un
  workflow que llame a la ingesta, va en esa lista o no está protegido.
- **La ingesta sin tope de tiempo** — `continue-on-error` cubre que falle, no
  que se cuelgue: ~570 peticiones con 15 s de timeout son 140 minutos con la
  API a medias, y el despliegue se quedaba ahí sabiendo publicar con los datos
  del repositorio. Se vio en directo (20 minutos en un paso de 9). Hoy los dos
  workflows llevan `timeout-minutes: 20` en la ingesta y hay prueba. Si un paso
  llama a un servicio externo, tiene tope de tiempo; si no, no está protegido.
- **`continue-on-error` en el paso de ingesta** — publicaba la app nueva con los
  datos congelados del despliegue anterior, sin ninguna señal. Se quitó, y hay
  una comprobación de que el JSON se ha regenerado.
- **Uso antes de declarar en `App.jsx`** — dejó la pantalla en negro. De ahí
  salió `comprobar/orden.mjs`, que desde 3.0 recorre `src/` entero en vez de
  una lista de dos ficheros.
- **La × de quitar un pick, oculta en móvil por CSS** — de ahí salió
  `comprobar/css.mjs`.
- **Nombres de héroe** — la API y el catálogo escriben distinto ("X.Borg" /
  "X Borg"). Todo se busca con `normName`. La matriz de counters tiene DOS
  niveles y hay que indexar los dos: `indexByName(m, 2)`. Esto volvió en 0.4.0:
  la app indexaba con profundidad 1, el segundo nivel se quedaba crudo y
  `riesgoContrapick` devolvía `null` para los 34 roamers sin que nada chillara.
  El motor no se enteró porque `counterScore` busca con `lookup` en los dos
  niveles y `lookup` prueba también la clave cruda. Dentro de una fila, usa
  siempre `lookup(fila, nombre)`, nunca `fila[normName(nombre)]`.
- **`main_hero_channel.id` (2678829) colándose por `main_heroid` (93)** — la API
  devolvía 422 en las 133 peticiones. Los ids de héroe se validan por rango.
- **Motivos que le salían a todo el pool** ("no hay primera línea" es cierto
  para los 34 roamers) — se filtran los que aparecen en más del 60%.
- **El peel recomendado hacia tanques aliados**, porque un tanque también está
  etiquetado como `immobile`.
- **Pruebas que medían el orden del fichero, no el motor** — dos invariantes
  (concentración y "responde al equipo enemigo") repartían winrates sintéticos
  recorriendo el array de héroes, así que ordenar `heroes.json` alfabéticamente
  las hacía fallar sin tocar una línea del código. Peor: pasaban en parte por
  suerte del orden. Ahora el winrate de cada héroe sale de SU NOMBRE. Si añades
  héroes, mételos al final igualmente: es el diff mínimo.
- **Pruebas asíncronas que no se contaban** — el arnés esperaba 60 ms fijos y
  luego llamaba a `process.exit`. En local llegaban; en GitHub, seis se
  quedaban fuera, así que un fallo suyo NO tumbaba el despliegue. Entre ellas la
  que vigila el fallo de `ROUTES`. Ahora se apuntan y se esperan con
  `Promise.all`. Si añades una prueba `async`, no le pongas plazos: ya se espera.
- **Tags deducidos tratados como certezas** (0.6.0, cazado antes de publicar).
  Al deducir los tags de Marcel desde su `speciality` le salían seis, disparaba
  más reglas que nadie y era nº1 en el 69% de 300 drafts simulados, contra el
  43% del líder anterior. Mismo sesgo por acumular etiquetas que el de Carmilla.
  Ahora todo lo que sale de tags deducidos (reglas de counter y composición) se
  encoge por `PRECISION_DEDUCIDA`. Si añades otro componente que lea `tags`,
  descuéntalo también.
- **El límite de profundidad de la ingesta, en 6** — la API envuelve el dato
  hondo: el título de la línea vive en el nivel 8. Los 133 héroes salían sin rol
  y sin línea y nada fallaba. Efecto invisible doble: los héroes que no están en
  `heroes.json` se quedaban con CERO tags (no con los de su rol, como decía este
  fichero), y `detectarRoamEnemigo` perdía su señal principal y nunca acertaba.
  Constante `HONDURA`, hoy en 12. Si la API vuelve a envolver más, súbela.
- **`diagnostics.relations.ejemplos` sin inicializar** — se leía su `.length` y
  saltaba un `TypeError` por cada roamer al que SÍ le llegaban los counters. Los
  datos se salvaban, así que solo se notaba en cuatro errores falsos dentro del
  diagnóstico… que además, al llenar el tope de errores, tapaban los de verdad.
  Hay una prueba que comprueba que todo campo leído esté inicializado.
- **Un encogimiento que la normalización se comía entero** — `compScore`
  multiplica por `confidence` (aliados/3) para pesar menos con el draft a
  medias, y ese factor NO llega al ranking: `normalizarComponente` reescala
  cada componente dentro del pool, así que un factor igual para todos los
  héroes desaparece en la reescala. Medido: el rango de la contribución de
  `comp` es 0.0800 con uno, dos o tres aliados, o sea el peso entero. Lo mismo
  le pasaría a cualquier otro encogimiento global que añadas. Si hay que pesar
  menos un componente por el estado del draft, el ÚNICO sitio donde se nota es
  el peso. Lo que sí sobrevive es lo que varía entre héroes, como
  `PRECISION_DEDUCIDA`.
- **Elegir la ruta de la API por su nombre en vez de por lo que devuelve** — el
  descubrimiento descartaba a propósito las rutas de `/academy` ("son material
  didáctico"). Era falso: `/academy/heroes/{id}/counters` devuelve los 132
  cruces de cada héroe y la que se prefería, CINCO. La app decidía el 89% de los
  counters con reglas escritas a mano teniendo el dato disponible, y nada
  fallaba. Ahora `elegirRutaConMasDatos` llama a cada candidata y se queda con
  la que más pares trae. Si añades un objetivo a `WANTED`, recoge TODOS los
  candidatos de todos los patrones, no solo los del primero que acierte: por
  cortar ahí, la ruta de `teammates` no llegaba a compararse nunca.
- **La maestría medida contra el 50% en vez de contra TU nivel** — `masteryScore`
  encogía hacia 0.50 y centraba la escala en 0.50. Para un jugador del 53,4%,
  un héroe jugado a su media exacta puntuaba 0.64 y uno sin tocar, 0.50: la app
  premiaba TENER DATOS, no ser bueno con el héroe. Hoy `tuNivel` saca su media
  ponderada y todo va centrado ahí. Si añades algo que compare winrates
  personales, compáralo contra su nivel, nunca contra 0.50.
- **Las constantes del rival de línea, sin medir** — con el arnés de drafts de
  línea conocida se midieron las cuatro (`base`, `alt`, `rol`, `veto`); tres en
  meseta, y `rol` monótono: a 0.10 cero rivales equivocados en 1.600 drafts
  frente al 1,3–2,7% a 0.30, por 1–1,5 puntos de cobertura. Ver `ROL_TIPICO`.
  La prueba de precisión mide ahora también drafts a medias, que es donde se
  distingue.
- **El rival de línea, deducido enemigo a enemigo** — nunca se había medido y
  con draft a medias se equivocaba del 10% al 21%: nombraba a un rival que aún
  no estaba en el draft y le doblaba el cruce. Desde 1.21.0 reparte a todos los
  enemigos entre las líneas a la vez (eliminación) y hay una prueba de
  precisión sobre drafts con la línea conocida: exp ≥80% acierto, ≤5% error. El
  margen para nombrar a alguien (`MARGEN_PARA_HABLAR`) está medido, no puesto.
- **El mismo 0.53 escrito a mano en TRES sitios** — counters, análisis del draft
  y sinergias. En los tres es el percentil 99 de su distribución, o sea «casi
  nunca». Y las parejas ni siquiera comparten distribución con los cruces
  (p90 0.5100 frente a 0.5154), así que copiar el número de un sitio a otro es
  doblemente erróneo. Hay una prueba que falla si vuelve a aparecer un umbral de
  cruce suelto en el motor.
- **El motivo de maestría decidido con el winrate bruto y un corte de 20
  partidas** — 20 partidas al 60% sacaban «lo llevas al 60%» (encogido: 54%,
  nada) y 300 al 57% no sacaban nada (encogido: 55,7%, señal real). La
  evidencia débil se enseñaba y la fuerte no. Hoy decide el estimado encogido,
  que ya lleva dentro el tamaño de muestra, y el corte de partidas desapareció
  con `MASTERY_CONFIDENCE_GAMES`. Si una condición mira una cantidad cruda
  habiendo un estimado encogido de la misma cosa, está mirando la equivocada.
- **El umbral del motivo de maestría, absoluto** — la NOTA se arregló para
  medirse contra tu nivel y el MOTIVO se quedó en `>= 0.55`. A un jugador del
  53,4% le decía «lo llevas bien» de un héroe en su media exacta, y a uno del
  45% no le reconocía nunca su mejor héroe. Si arreglas un sesgo, mira si el
  mismo componente lo tiene en otro sitio.
- **El mismo umbral mal calibrado, en dos sitios** — al arreglar el de las
  tarjetas (0.53/0.47, percentil 99) se quedó vivo el gemelo de `analisis.js`
  (`MATCHUP_CLARO = 0.03`), y por eso el análisis del draft enmudecía justo con
  la información delante: un draft completo daba UNA frase. Hoy los dos salen de
  `CRUCE_MALO`, y hay una prueba de que `analisis.js` no tiene umbral propio. Si
  calibras una constante contra la distribución, busca sus gemelas.
- **Un corte donde debía haber un encogimiento** — `tuNivel` usaba el 50% por
  debajo de 100 partidas y tu winrate entero por encima. Apuntar UNA partida más
  (de la 99 a la 100) cambiaba el nº1 en 54 de 200 drafts. Hoy encoge de forma
  continua con `PRIOR_DE_TU_NIVEL`, y hay una prueba de que ningún par de
  valores consecutivos salta. Si añades otro umbral duro sobre una cantidad que
  crece sola, pregúntate primero qué pasa justo al cruzarlo.
- **Un prior de encogimiento puesto a ojo** — `MASTERY_CONFIDENCE_GAMES = 20`
  equivalía a suponer que su winrate varía ±11 puntos entre héroes (del 42% al
  64%). En un encogimiento bayesiano el prior NO es libre: `k = 0.25/σ²`, con σ
  la dispersión real. Hoy `priorDeMaestria` la mide de sus propios datos
  descontando la varianza de muestreo; sale ±4 puntos, o sea k≈156. Con 20,
  cinco partidas al 90% puntuaban 0.87.
- **Una cuenta de potencia con la fórmula equivocada** — "faltan N partidas"
  usaba la de dos muestras y con el coeficiente doblado, y pedía 178 donde son
  39. Se compara UNA muestra contra una referencia conocida (miles de partidas),
  así que su error no se paga dos veces. Y el error tipico va con la referencia,
  no con lo observado: con 11 partidas ganadas todas, Wald da error CERO.
- **Constantes calibradas contra una suposición, no contra el dato** — la
  confianza en un cruce se encogía con `pickRate/(pickRate+0.004)`, y ese 0.004
  salía de dar por hecho que el dato venía de unos pocos miles de partidas.
  Nunca se comprobó. Medido, el ruido no crece con lo raro que sea el héroe ni
  de lejos como supone esa fórmula: la constante castigaba a los héroes poco
  jugados el doble de lo que toca, y cambiaba el nº1 en el 14,5% de los drafts.
  Antes de encoger nada por muestra, MIDE que la muestra sea el problema.
- **Un `clamp01` comiéndose el 5% de los datos** — la sinergia se mapeaba con
  `(x-0.46)/0.10`, y el 5,3% de las parejas caía por debajo de 0.46: la peor
  sinergia del juego (0.20) y una mala del montón (0.45) salían las dos a cero.
  Hoy el rango es (0.42, 0.16) y recorta el 1,1%. El diagnóstico lo vigila.
- **Constantes calibradas sobre una muestra sesgada** — `riesgoContrapick`
  dividía por 0.08 porque el p10 de los cruces parecía 0.467. Ese p10 salía de
  los cinco cruces MÁS EXTREMOS de cada héroe, que era todo lo que daba la ruta
  corta. Con la matriz entera el p10 real es 0.485, ningún héroe pasaba de 0.43
  y el aviso de "pick castigable a ciegas" no habría vuelto a salir jamás. Hoy
  la constante es `PEOR_CRUCE_REAL`. Si cambias de fuente de datos, revisa
  TODAS las constantes calibradas contra la anterior.
- **La sensatez táctica apoyada en un agujero** — la prueba "contra tres
  asesinos de dash el nº1 corta dashes" solo pasaba porque el 89% de los cruces
  no tenía dato y mandaban las reglas por tags. Con dato para todo, deja de
  cumplirse, y medir dice por qué: los anti-dash promedian 0.5042 contra los
  dashers y el resto 0.4999. La prueba se cambió por dos que sí se sostienen
  (que la recomendación cambia con el equipo enemigo, y que el componente de
  counter ordena igual que el dato real), más otra que vigila las reglas donde
  siguen mandando: los héroes sin dato.
- **Dos criterios distintos de "quién es roamer"** — la app usaba
  `mergeCatalog` (catálogo + rol de la API) y la ingesta miraba solo el catálogo,
  así que Marcel entraba en las recomendaciones sin que nadie le pidiera
  counters. Ahora la ingesta importa `mergeCatalog`. No vuelvas a duplicarlo.
- **Quedarse con UNA ruta de objetos habiendo dos** — el descubrimiento elegía
  `/academy/equipment/expanded` (152 objetos, con `equiptips`) y descartaba
  `/academy/equipment` (184, sin tips). Tres builds enseñaban `#10001` en vez de
  «Lantern of Hope». Hoy `fetchEquipo` lee la ruta elegida Y sus alternativas y
  funde campo a campo: la primera que da cada dato manda. Mismo error de forma
  que el de `/academy` en los counters, y por eso `alternativas` ya se guarda
  para todas las claves, no solo para las que llevan `{id}`.
- **Toda la hoja de estilos de móvil, muerta** — los tres bloques `@media`
  estaban al PRINCIPIO del fichero, y una consulta de medios no añade
  especificidad: cualquier regla base escrita después la pisa entera. El móvil
  llevaba quién sabe cuánto enseñando el diseño de escritorio y nada fallaba.
  Medido: `.slot` pedía `min-width: 0` y salía 84px; `.pick-name` pedía 16px y
  salía 24px. Hoy los bloques van AL FINAL y `comprobar/css.mjs` falla si vuelve a
  aparecer una regla normal después del primer `@media`. Si añades una consulta
  de medios, va al final del fichero, siempre.
- **La fase de baneos a un héroe por apertura** — el selector se cerraba con
  cada toque, y diez baneos en medio minuto no daban tiempo. Desde 1.28.0
  el selector de baneos es multi-toque (`multi` en `HeroSheet`), con los
  sugeridos arriba y ordenado por tasa de ban. Si añades otro selector con
  varios toques seguidos, reutiliza ese modo en vez de cerrar y reabrir.
- **Diez baneos en una fila de 336 px** — con `flex: 1 1 0` cada hueco
  quedaba en 28 px: la cara (22) más la × (27, con margen negativo) no
  caben, la × se salía del hueco, pisaba al vecino y el décimo sacaba 8 px
  por el borde de la página. Las comprobaciones de anchura se hacían con
  dos baneos, no con diez. Desde 1.35.0 `.side.bans .slot` lleva base 56 px
  (dos filas de cinco) y las pruebas en navegador llenan los diez. Cuando
  midas un desborde, llena el contenedor hasta el máximo que admite.
- **Los baneos escondidos en «Baneos y ajustes»** — con el draft corriendo
  costaba encontrar el botón que separa baneos de picks. Desde 1.33.0 el
  draft va en dos fases (`fase` dentro de `roam-picker:draft`, `baneos` |
  `picks`): la de baneos sola en pantalla y la de picks con la tira de
  baneos arriba. Un draft guardado sin `fase` con picks dentro arranca en
  picks; vacío, en baneos. `reset()` vuelve a baneos. Lo que se toca en
  mitad de una partida no va dentro de un desplegable.
- **El «conservo lo anterior» de la ingesta, leyendo del temporal** — cada
  endpoint que falla conserva los datos previos, pero `previous` se leía de
  la ruta de SALIDA (`--out /tmp/nueva.json`, que no existe) y conservaba
  la nada: un fallo suelto tiraba la corrida entera. Hoy se lee de
  `public/data/roam-meta.json`. Si cambias dónde se escribe, mira de dónde
  se lee.
- **Los datos de ayer con la fecha de hoy** — al arreglar lo anterior, una
  corrida con la API caída conservaba TODO (también `statsByRank`) y salía
  con `generatedAt` nuevo: idéntica a la guardada, el comparador la
  aceptaba, el bot la commiteaba y la puerta de frescura (72 h) no habría
  saltado jamás. Hoy la fecha solo avanza si se descargó el rango pedido
  (`diagnostics.frescos`, `conservado`) y `comparar-ingesta` cuenta
  `rangoFresco`. Cada vez que un fallback conserve algo, pregúntate qué
  METADATO deja de ser verdad.
- **Un bot haciendo push sin rebase** — la vigilancia commitea su fila de
  salud varias veces al día; la ingesta tarda diez minutos; el push se
  rechazaba y la corrida se perdía en silencio (pasó con `pro.yml` en su
  primera corrida). Todo bot que commitea hace `git pull --rebase` antes,
  y hay prueba.
- **`npm test | tee` sin pipefail en la vigilancia** — el paso devolvía el
  código de `tee` y un motor roto nunca abría incidencia. `shell: bash`.
- **Motivos cortados a tres ANTES de quitar los comunes** — el 12% de las
  tarjetas se quedaba con menos de tres teniendo un cuarto válido.
  `scoreHero` devuelve todos y `rankRoamers` corta después de filtrar.
- **La composición con el equipo vacío** — sin aliados no hay hueco que
  tapar, pero `comp` premiaba acumular etiquetas con el peso entero (el
  sesgo de Marcel otra vez) y sin motivo en la tarjeta. Se deja plana hasta
  que hay alguien: cambia el nº1 en el 22% de los drafts vacíos (medido,
  300 drafts). Un factor global se lo come la normalización; PONER A 0.5
  todos los valores no, porque los iguala.
- **Maestría con la clave cruda** — «X.Borg» escrito a mano y «X Borg» en el
  catálogo: 400 partidas fuera del ranking sin aviso. `maestriaEfectiva`
  devuelve claves normalizadas y todo se lee con `lookup`.
- **Fundir perfiles por instante+pick+resultado** — una partida corregida
  aquí y reimportada de un código viejo salía dos veces. La clave es `t`, y
  gana la copia local.
- **El peligro de un baneo, por etiquetas con el dato delante** — `suggestBans`
  medía «cuánto castiga a tus aliados» con `DANGER_RULES` (dive contra
  immobile, burst, antiheal...) teniendo la matriz de cruces al 100%.
  Medido: la tabla se dispara 6.308 veces sobre 200 aliados al azar y en el
  47% el cruce real va EN CONTRA (el «peligro» pierde contra el aliado);
  solo el 12% es una ventaja destacable. Desde 1.32.0 manda el cruce (escala
  continua desde el 50%, sin escalón) y la tabla solo entra sin dato. Mismo
  patrón que `counterScore` en 1.5.0: si un componente lee `tags` habiendo
  matriz, sobra.
- **Una prueba estadística al filo del umbral, dentro del despliegue** — la
  prueba de que la simulación predice exigía razón ≥ 1,5 sobre 150 drafts;
  medida con cinco semillas salía 1,45–2,51, y corre en `deploy.yml` sobre
  los datos del día: un dato malo habría bloqueado la publicación de código
  sin regresión alguna. Hoy son 300 drafts y diferencia de tasas ≥ 0,12
  (real 0,25–0,33, error típico 0,05; simulación rota −0,38). Toda prueba
  que mida un estadístico sobre datos reales lleva su margen medido con
  varias semillas, o no es una prueba: es una moneda.
- **Texto escrito a mano en la interfaz** — «37/37 con datos · 37 con counters»
  estaba en español dentro de App.jsx y salía tal cual con la app en inglés.
  Todo lo que se ve pasa por `t()`; la única excepción a propósito es el
  diagnóstico, que es depuración.
- **La simulación diferida cruzada con el ranking nuevo** — `robustez` va con
  `useDeferredValue` (60 rankings, para no bloquear el toque) y `ranked` no:
  en el render de en medio el nº1 ya era el nuevo y la cuota la del draft
  anterior, y un héroe que esa simulación no había votado salía «frágil 0%».
  Desde 1.32.4 la simulación lleva `enemigos`/`aliados` y `analizarDraft` se
  calla si no son los de ahora. Si difieres otro cálculo, marca para qué
  entrada se hizo o el consumidor lo cruzará con la entrada nueva.
- **La prueba de claves i18n que solo miraba las reglas** — `t('pro.inexistente')`
  en la interfaz pasaba `npm test` y salía la clave cruda en pantalla (probado
  por mutación). Desde 1.32.4 la prueba recorre `t('…')`, `t(\`prefijo.${…}\`)`
  y `clave: '…'` en la interfaz y el motor. Un guardarraíl se comprueba
  rompiendo lo que vigila, no leyendo su nombre.
- **Un guardarraíl con la expresión muerta** — `comprobar/css.mjs` buscaba
  `\\.slot` (barra literal + un carácter) y la comprobación de la × oculta,
  que nació de un fallo real, no casaba con nada desde que se escribió. Y
  `comprobar/orden.mjs` no veía `const [x] =` ni `const { x } =`, que son la
  mitad de las declaraciones de App.jsx. Desde 1.40.1 los dos scripts
  aceptan una ruta por argumento y hay pruebas que les dan un fichero roto.
- **El bucle de rebase+push en verde** — el último mandato del `for` era
  `sleep`, así que tres pushes rechazados salían con estado 0: la corrida
  perdida en silencio que el bucle venía a evitar, y encima el despliegue
  se disparaba «con éxito» sobre los datos viejos. Un bucle de reintentos
  acaba con una comprobación de que alguno lo consiguió.
- **`0 > -1`: una ruta vacía ganando a un error** — `elegirRutaConMasDatos`
  medía `-1` cuando la ruta principal fallaba y cualquier alternativa con
  cero pares la sustituía: las 266 peticiones iban a una ruta vacía. Un
  error no es un cero; se reintenta y solo se cambia por una ruta que
  traiga MÁS.
- **`Date.parse` de una fecha sin hora es medianoche LOCAL** — `fechaISO`
  daba un día menos en cualquier zona al oeste de UTC, y la clave de la
  partida lleva la fecha: dos claves para la misma partida según dónde se
  ejecutara. Las fechas de datos se parsean en UTC, siempre.
- **La referencia del Veredicto con las partidas comparadas dentro** —
  `resumen` recibía `maestriaEfectiva(mastery, partidas)`, que lleva las
  partidas jugadas CON la app: para un héroe sin maestría a mano la base
  eran esas mismas partidas, la diferencia salía 0,000 y «faltan Infinity».
  Desde 1.40.0 la referencia es la maestría manual más las partidas previas
  (`esPrevia`), y `runSelfTest` recibe `maestriaManual` aparte de la
  efectiva. Una comparación no puede llevar dentro lo que compara.
- **El recorte de `metaScore` empatando a las colas** — `clamp01` a ±6 puntos
  dejaba a 9 de 133 héroes en 0 o en 1 (Marcel 59,1 = Masha 57,7 = 1.000):
  el nº1 cambiaba en 42 de 300 drafts de roam, justo en el 1,9σ superior.
  La reescala min-max del ranking ya acota; un recorte antes de reescalar es
  información destruida.
- **«Peor que una moneda» sin margen** — comparar el Brier a secas con 0.25
  avisaba en el 34% de los casos con un modelo perfectamente calibrado y 20
  partidas (Brier esperado 0.24, error típico 0.05). Toda comparación de un
  estadístico lleva su error típico o es una moneda.
- **`sanear` fiándose de `>` con texto** — `"500" > 0` es true: la maestría
  guardaba el texto, `tuNivel` daba 0,0000037 y la referencia «050050»
  partidas. Coacciona con `Number` y exige `Number.isFinite`.
- **La reescala min-max comiéndose el encogimiento de la maestría** — cada
  componente se normaliza al rango 0..1 dentro del pool, y min-max es
  invariante a escala: toda la calibración de `masteryScore` (k≈156, medido)
  decidía el ORDEN entre héroes con maestría pero no cuánto pesaba frente al
  resto. Medido: 5 partidas al 90% y 1.000 al 70% daban la misma
  contribución (0.150, el peso entero) y apuntar UNA partida (de la 9 a la
  10, cruzando `SENAL_MINIMA`) cambiaba el nº1 en el 44% de los drafts.
  Desde 1.39.0 la maestría NO pasa por la normalización (su escala ya es
  fija: 0.5 tu nivel, 1 dos desviaciones por encima con la σ medida de tus
  datos) y la señal mínima es una rampa, no un corte. Si un componente
  lleva una escala calibrada, no lo reescales.
- **El centro de las parejas en la media de toda la matriz** — mezclaba las
  parejas de la misma línea (las malas, 0,486) con las que pueden ir juntas
  (0,500). En 5v5 se cancelaba y la prueba solo miraba 5v5; a medias
  favorecía al equipo con más héroes en pantalla (1 contra 5: 46%; 5 contra
  1: 53%, medido con equipos de uno por línea). Hoy `mediaDeSinergia` recibe
  `lineas` y `stats` y centra en las parejas de líneas distintas ponderadas
  por pick. Toda prueba de un modelo a medias tiene que probar A MEDIAS.
- **Los aliados repartidos entre las cinco líneas, incluida la mía** —
  `aconsejarEquipo` ponía a un aliado flexible (Lukas, jungla/exp) en MI
  línea y aconsejaba la suya como abierta: 132 de 400 drafts jugando exp.
  `lineasOcupadas` acepta las líneas candidatas y se reparte sin la mía.
- **La matriz de ayer con la fecha de hoy, otra vez** — la honestidad de
  `generatedAt` solo miraba las estadísticas: con la ruta de counters caída
  la matriz de hace semanas salía fechada hoy, pasaba el comparador (mismos
  recuentos) y la puerta de 72 h. Y la matriz nueva sustituía a la guardada
  ENTERA en vez de fundirse héroe a héroe, así que una corrida a medias
  borraba filas. Hoy `frescosRecursos`, fusión por héroe y
  `relacionesFrescas` en el comparador. Cada recurso que se conserva tiene
  que dejar marca en la fecha.
- **`medir-rival.mjs` con la frecuencia de líneas vacía** — le pasaba el
  catálogo fundido (sin `lanes`) a `frecuenciaDeRoles`, así que el reparto
  «igual que la app» no lo era. Con la frecuencia de la app: bR 0,24 ± 1,15,
  bO 0,77 ± 0,73, razón 0,32 (259 partidas de 120 días); ganar ≥3 cruces de
  línea sí acompaña a ganar (62% frente a 53%), pero la razón sigue sin
  distinguirse de 1 ni de 2. La conclusión aguanta; las cifras de antes, no.
- **Una interfaz que solo se había medido en dos anchos** (3.6.0) — las
  comprobaciones de desborde se hacían a 360 y 390 px y con lo que hubiera
  en pantalla. Medido en doce tamaños (320–1.920, dos apaisados) abriendo
  TODAS las hojas: la fila de uso de la hoja «Meta» se salía 48 px a 320 y
  8 a 360, la × del hueco enemigo se salía 1 px a 320 (la huella de ○, cara
  y × sumaba 54 px en un contenido de 50), las × y los ○ medían 21–31 px de
  toque y el pie 21 px de alto; y de 700 a 820 px (tabletas en vertical)
  la app iba a una columna con huecos de 190 px. Hoy el corte de una
  columna está en 699 px, el pie es estático en el móvil (flotando tapaba
  el 92% del ancho a 320) y `pruebas/interfaz/responsive.e2e.mjs` repite
  la medida en 320, 360, 768 y 640×360 con las hojas abiertas (verificada
  por mutación: quitar el arreglo de Meta o volver la × a 31 px la tumba).
  Cuando midas un desborde, mide en el ancho MÁS estrecho que admita la
  app y con cada hoja abierta, no solo en el móvil que tengas a mano.
- **Un `backdrop-filter` en el pie encerrando la hoja de novedades** (3.7.0,
  cazado en pruebas) — `backdrop-filter`, como `filter` y `transform`,
  convierte al elemento en bloque contenedor de sus descendientes
  `position: fixed`, y la hoja de novedades se monta DENTRO del pie: con el
  desenfoque en el propio pie la hoja quedaba metida en una cápsula de 32
  px y la cabecera interceptaba «ver todo». Hoy el desenfoque va en un
  `::before` del pie, que no tiene descendientes. Antes de poner un filtro
  o una transformación en un elemento, mira si algo `fixed` cuelga de él;
  y por lo mismo el encogimiento al tocar (`button:active { transform }`)
  no se aplica al pie.
- **El centro del término de héroe en la media SIMPLE de los 133** (3.7.1,
  incidencia #9, dos días sin publicar datos) — `avgByRank` de la ingesta y
  `mediaDeWinrate` eran medias sin ponderar (0,482 el 24 de septiembre de
  2026) y los héroes que salen en un draft son los populares, que ganan
  más que esa media: cada héroe visto sumaba +0,09 de logit y el equipo con
  más héroes en pantalla iba por delante (1 contra 5: 45%; con la de 7 días
  del 20 de septiembre, 47,8%, dentro del margen de la prueba pero ya
  sesgado). La media ponderada por cuota de pick es ≈0,50 por
  construcción (cada partida tiene un ganador) y es lo que cabe esperar
  del héroe que sale. Y tenía GEMELO: `equilibrioEsperado` centraba en
  «cinco al azar de los 133» (multinomial) cuando un equipo real lleva uno
  por línea y las líneas no reparten el daño igual: −0,13/+0,11 de logit,
  1,2 puntos. Hoy se promedia sobre subconjuntos de líneas. El ranking no
  cambia con ninguno de los dos (el centro es el mismo para todos los
  candidatos); cambia la probabilidad con el draft a medias, que es lo que
  se enseña. Un centro es «lo que cabe esperar de lo que SALE», no la media
  de lo que existe.
- **Una banda de probabilidad exigida sobre los datos del día** (3.7.1, la
  misma incidencia) — `modelo-medido.test` pedía p05 en 0.37–0.40 sobre
  1.000 drafts al azar con los datos reales, calibrado en un parche
  asentado (σ de winrates 3,3 pp). El 23 de septiembre de 2026, una semana
  después del reinicio de temporada, la σ subió a 5,0 pp en las DOS
  ventanas, la banda se abrió a 0.356 con la escala intacta y el
  despliegue de los datos se paró dos días. Es la lección de 3.4.0 otra
  vez («una prueba sobre datos reales comprueba que el código reacciona
  bien al dato que haya, nunca que el dato sea el de un día bueno»), en
  otra prueba. Hoy la banda se mide sobre `pruebas/fixtures/meta-sintetico.mjs`
  (determinista: 0.3741/0.6259 a 0.44; 0.3366/0.6634 a 0.58) y la del día
  se escribe en el registro. Toda prueba nueva que mida un estadístico
  con los datos reales tiene que preguntarse qué pasa con el dato del
  primer día de temporada.
- **La tarjeta nº1 fuera de la primera pantalla** — cada bloque nuevo encima
  de las tarjetas (análisis, estimación de 141-152 px, consejo para los
  compañeros, composición) fue empujando el nº1: medido en 390×844 asomaba
  156 px, y en 360×640 estaba fuera en todas las fases. Desde 1.38.0 la
  estimación es compacta (80 px) y el consejo va DESPUÉS del nº1. Hay un
  script en el scratch (`primera-pantalla.mjs`) para medirlo; cada vez que
  se añada algo encima de las tarjetas, medir la posición del nº1 en
  360×640, 390×844 y 430×932 antes de subirlo.
- **Una hoja que el botón atrás no cerraba** — instalada como app, atrás con
  una hoja abierta salía de la app en mitad del draft: no había entrada de
  historial que retirar. `useCerrarConAtras` (app/componentes/Hoja.jsx) mete una al abrir y
  la retira al cerrar por botón. Toda hoja nueva la usa.
- **`Imagen` que no se reintentaba** — `roto` se quedaba a true para siempre
  aunque cambiara `src` (el meta llega después del catálogo y el héroe gana
  su id), y pedía `./heroes/undefined.jpg` en el primer render. Un estado
  derivado de una prop se resetea cuando cambia la prop.
- **Los chips del siguiente baneo desplazándose** — al tocar uno, el
  siguiente candidato ocupaba justo su hueco y un doble toque baneaba a dos.
  Lo que se toca a contrarreloj no se mueve de sitio.
- **Un nombre guardado que ya no resuelve** — el draft guarda nombres, y un
  héroe renombrado por la API (o un catálogo cambiado) dejaba un nombre que
  no pintaba ficha, no se podía quitar, contaba como cogido y dejaba un hueco
  de más; el selector, sin tope, admitía seis enemigos. Desde 1.41.0 `App`
  limpia los nombres desconocidos al llegar el catálogo, desmarca el rival si
  ya no está entre los enemigos y `anadirA(setter, max)` es el ÚNICO sitio
  que añade al draft. Un estado guardado por nombre se valida contra el
  catálogo al cargar, no se confía.
- **Los chips sugeridos de la hoja, con el orden de fuera pero sin su
  estabilidad** — la tira de fuera se hizo estable en 1.38.0 y la de DENTRO
  del selector de baneos se quedó desplazándose. `useOrdenEstable` (app/componentes/useOrdenEstable.js)
  es el mismo hook para las dos; si aparece otra tira que se toca a
  contrarreloj, usa ese hook. Arreglar un comportamiento en un sitio pide
  buscar sus gemelos.
- **Plurales fijos** — «1 líneas abiertas», «Les faltan 1 picks». `crearT`
  entiende `{n|singular|plural}`; úsalo en toda frase con una cantidad.
- **La vigilancia sin saber qué versión sirve Pages** — `diagnostico.mjs`
  pasaba `version: 'vigilancia'` y nunca pedía `version.json`: la columna
  `version` del historial decía «vigilancia» en todas las filas, y un
  despliegue «completado» que Pages no llegaba a servir era invisible al
  bot. Desde 1.37.0 lo pide sin caché y lo compara con `package.json`: FALLO
  tras un despliegue (`GITHUB_EVENT_NAME=workflow_run`), aviso en las
  programadas. Lo que el botón del móvil ya comprobaba, el bot no.
- **La vigilancia disparada por despliegues cancelados o fallidos** — con
  `cancel-in-progress` en el despliegue, cada push en ráfaga «completaba» un
  despliegue cancelado, la vigilancia miraba la versión anterior (sana) y
  cerraba la incidencia abierta; y eran ~20 corridas al día, que llenaban
  la ventana de 40 filas del historial con repeticiones. Filtro
  `conclusion == 'success'`, como ya tenía `deploy.yml`.
- **El comparador de la ingesta como trinquete hacia abajo** — cada corrida se
  aceptaba si no bajaba del 90% de la ANTERIOR ACEPTADA, y esa pasaba a ser
  la referencia. Los recuentos de tamaño conocido se comparan también con el
  máximo del historial de salud (`FIJAS` en `comparar-ingesta.mjs`).
- **Guardas por texto, no por forma** — `run: echo "antes: node
  scripts/comparar-ingesta.mjs"` pasaba la prueba del guardarraíl, `h > 7200`
  pasaba la del tope de antigüedad, quitar `comprobar/css.mjs` de `npm test` pasaba
  todo, y `comprobar/orden.mjs` solo veía `const` (un `let` usado antes es el
  mismo TDZ). Si una prueba busca una cadena, pregúntate si la cadena en un
  comentario o en un echo también la pasaría.
- **`matchup is not defined` en `diagnostico.mjs`, después del último OK**
  (2.0.0) — al recortar un import se quitó una función que seguía usándose
  más abajo; `npm test` no ejecutaba el script, y en local se leyó la
  salida filtrada por `grep`, que enseñaba «[OK] Pages sirve la 2.0.0» y
  no el `ReferenceError` de tres líneas después. Abrió la incidencia #7.
  Hoy hay una prueba que ejecuta `diagnostico.mjs --local` entero y mira el
  CÓDIGO DE SALIDA. Cuando compruebes un script, mira `$?`, no la salida; y
  `npm test | tail` devuelve el código de `tail` (ya pasó con `tee`).
- **Cinco componentes con pesos a mano que nunca se midieron contra un
  resultado** — meta 0.22, counter 0.40, sinergia 0.15, composición 0.08,
  maestría 0.15, cada uno reescalado min-max dentro del pool. Se calibraron
  con drafts simulados (concentración, «responde al enemigo»), nunca con
  partidas ganadas o perdidas. Medido en 2.0 contra 902 partidas pro: los
  términos de datos pesan igual, la composición nada, y el rival de línea
  nada más que los otros. Y la estimación de 1.28–1.41 sumaba los mismos
  términos sin escala: Brier 0.2510, peor que una moneda. Toda constante
  del motor que se pueda medir contra un resultado se mide contra un
  resultado; la concentración y la sensatez táctica son comprobaciones,
  no calibración.
- **Una corrida degradada commiteada por el bot de datos** — `update-data.yml`
  ejecutaba la ingesta encima de `public/data` y commiteaba lo que saliera. Salió
  una corrida con los 133 héroes SIN `lanes` y SIN `role`, y con counters de 34
  héroes en vez de 133. Cuatro de las cinco líneas se quedaban con el pool vacío.
  El diff no chillaba porque la ingesta conserva los datos anteriores cuando un
  endpoint falla: parecía una corrida normal con `generatedAt` nuevo. El
  despliegue tampoco lo habría parado: comprobaba la frescura y que hubiera
  estadísticas, no que se hubiera resuelto tanto como antes. Ahora las dos
  ingestas escriben a un temporal (`--out`), `scripts/comparar-ingesta.mjs`
  compara con lo guardado y solo se copia encima si no empeora. Hay una prueba
  que falla si alguien vuelve a apuntar la ingesta directa a `public/data`.

- **Un `export ... from` NO mete el nombre en el ámbito del módulo** (3.0) —
  `pruebas/interfaz/navegador.mjs` reexportaba `test` del arnés y lo usaba
  dentro: `ReferenceError` en los seis ficheros de navegador a la vez. Y
  ESLint, que lo habría cazado en la primera línea, no miraba ahí: su
  configuración listaba `src/**` y `scripts/**`, no `pruebas/**`. Un fichero
  que el linter no mira no está protegido, y la configuración del linter es
  otra lista fija de las que este proyecto ya ha pagado tres veces.
- **Ampliar un guardarraíl a más ficheros puede hacerlo mentir en la otra
  dirección** (3.0) — `comprobar/orden.mjs` pasó de dos ficheros a `src/`
  entero y empezó a dar falsos positivos en el motor: su heurística de «dos
  espacios de sangría = cuerpo de la función» tomaba por lo mismo una variable
  anidada y un parámetro de flecha que se llaman como una de fuera. Hoy sobre
  un directorio solo mira los `.jsx` (que es donde vive el fallo que caza) y
  descuenta los parámetros de flecha. Al ampliar un guardarraíl hay que
  comprobar LAS DOS cosas: que sigue cazando lo roto y que no chilla con lo
  bueno.
- **Una prueba puede perder su poder de detección sin que nadie se entere**
  (3.0) — la de «los motivos se filtran antes de cortar a tres» muestreaba 30
  drafts reales, y con el modelo de 2.0 los motivos comunes casi no existen:
  medido, 0 de 30 drafts y 0 de 1.078 tarjetas afectadas (en 1.x acortaba 478
  de 1.017). Seguía en verde y ya no vigilaba nada: la mutación lo dijo y se le
  añadió un fixture determinista que no depende de los datos del día. Cuando
  cambie el modelo, las pruebas calibradas contra los datos del modelo anterior
  hay que volver a mutarlas, no solo volver a pasarlas.
- **Una prueba vieja que falla no siempre acusa al código nuevo** (3.0) — al
  reescribir la interfaz, el script de los baneos probables del scratch daba
  dos fallos; corriéndolo contra 2.0.2 compilado daba los mismos dos. Era la
  prueba la que estaba desfasada, no la app. Antes de arreglar nada por lo que
  diga una prueba vieja, córrela contra la versión anterior.

- **Una prueba de navegador que comprobaba su propio sembrado** (3.0) — el
  ayudante de las pruebas de interfaz metía el estado de partida con
  `addInitScript`, que corre en CADA navegación: al recargar para comprobar
  que algo PERSISTE, el sembrado volvía a escribirse encima y tapaba lo que
  la app había guardado. La prueba nueva del perfil lo destapó fallando; las
  que solo leen no se enteraban. Hoy se siembra una vez por contexto, con
  pestillo. Mismo error de familia que las pruebas que medían el orden del
  fichero en vez del motor: comprobar el andamio en lugar de la app.
- **Una huella de kit que no veía un rework** (3.1.0 → 3.3.0, el mismo día):
  la de tipo de daño + speciality se calibró contra nueve días sin reworks y
  salió muda, pero el parche 2.2.16 (Temporada 42, 16 de septiembre de 2026)
  rehizo a Masha y a Bruno DEJÁNDOLES la misma speciality y el mismo tipo de
  daño: Moonton reescribe las habilidades y no siempre reetiqueta. Se supo
  por la prensa del parche, no por el aviso. Hoy la huella lleva un tercer
  trozo, `kitTexto` (`huellaTexto` en extraccion.mjs): FNV-1a del texto de
  la ficha sin etiquetas, sin cifras y sin espacios, para que un
  reequilibrio de números no la mueva y un rework sí. Se conserva con la
  ficha caída, como `speciality`. Los tags de Masha y Bruno se reescribieron
  leyendo sus habilidades en la API (Masha: 3 barras de vida, salto, carga
  con aturdimiento y empujón, sin anticuración; Bruno: deslizamiento que
  aturde, patada con empujón y aturdimiento, ya no inmóvil). Un guardarraíl
  calibrado en un periodo sin el fallo que vigila no está calibrado: hay que
  esperar al primer caso real y mirar si lo vio.
- **Un parámetro de la API adivinado en vez de leído del esquema** (3.1.0,
  no llegó a producción) — la ruta de tendencias se probó con `days` y su
  parámetro se llama `past-days`; la de estadísticas admite `days` de 1 a 30.
  El esquema OpenAPI está descargado en cada ingesta: antes de decir que una
  ruta «no cuadra», leer sus parámetros y sus enumeraciones ahí. La ingesta
  ya lo hace (`discoverRoutes`); a mano hay que hacer lo mismo.
- **Una prueba que exigía que el dato real fuera BUENO, no que la guarda
  decidiera bien** (3.3.0 → 3.4.0, incidencia #8) — `draft.test` comprobaba
  que con los datos reales la ventana fuera la de 3 días. El 19 de
  septiembre de 2026, tres días después del reinicio de temporada, la de 3
  vino vacía, la guarda la descartó (lo correcto) y la prueba tumbó el
  despliegue de los datos de la tarde y abrió la incidencia de vigilancia.
  Hoy exige que `prepararDatos` decida lo mismo que `elegirVentana`. Una
  prueba sobre datos reales comprueba que el código reacciona bien al dato
  que haya, nunca que el dato sea el de un día bueno.
- **Un peso por defecto de 1 entre cuotas que suman 1** (3.4.0, cazado en
  pruebas) — `equilibrioEsperado` ponderaba cada héroe por su pickrate con
  `?? 1` para el que no tuviera dato: un héroe recién salido, sin
  estadísticas, pesaba tanto como los 133 juntos y movía el centro del
  término. Un valor por defecto tiene que estar en la escala de lo que
  sustituye; entre cuotas, el «no sé» vale 0, no 1. Y tenía un GEMELO:
  `mediaDeSinergia` hacía lo mismo desde 1.x (medido en 3.5.0 con los datos
  reales: quitar las estadísticas de UN héroe movía el centro de las
  parejas 0,36 pp). Si arreglas un patrón, busca sus gemelos con `grep`
  (`?? 1` sobre `pickRate`).
- **Un canal que dependía de iniciar sesión en GitHub desde el móvil**
  (3.8.0 → 3.10.0) — «Enviar mis partidas al proyecto» abría el formulario
  de incidencia ya relleno; funcionó en la prueba (#10, sesión iniciada,
  perfil vacío) y falló en la primera de verdad: sin sesión, GitHub manda
  al inicio de sesión con la dirección entera (el código dentro) como
  `return_to`, y eso acabó en un 501. Aquí no se reproduce (el proxy
  devuelve 403 en `/login`), así que la causa exacta queda sin confirmar;
  lo que se hizo fue quitar el navegador del camino: con un token la app
  habla con la API. Un canal de envío que depende de una sesión en otro
  sitio no es un canal; y una prueba con el perfil vacío no prueba el
  tamaño real.
- **Ruido de muestra leído como cambio de meta** (3.7.1 → 3.11.0) — la
  subida de la dispersión de Gloria a 5 pp tras el reinicio de temporada se
  documentó como «el parche separa más a los héroes» y se ajustó una prueba
  para convivir con ella; nadie miró si otro rango la tenía. Mítico seguía
  en 3,3 pp: era Gloria con cuatro partidas por héroe, y la app puntuó
  con ruido del 23 al 26 de septiembre (el nº1 cambiaba en la mitad de los
  drafts de roam). Antes de explicar un cambio en los datos con el juego,
  compáralo con una población más grande del MISMO periodo: si solo se
  mueve la pequeña, es muestra.
- **La tubería sin pipefail, otra vez, en `partidas.yml`** (3.8.0 → 3.14.0) —
  `importar-partidas.mjs ... | tee` sin `shell: bash`: un código roto salía
  con el código de `tee`, el bot respondía «Recibido.» y CERRABA la
  incidencia sin guardar nada, y el mensaje de error (stderr) ni llegaba a
  la respuesta. La prueba del `tee` de la vigilancia miraba un solo paso de
  un solo fichero. Hoy recorre TODOS los pasos de TODOS los workflows: una
  tubería sin `shell: bash` falla. Mismo fallo, tercera lista fija.
- **La vigilancia sin fila justo en los días malos** (hasta 3.14.0) — el
  diagnóstico de lo publicado no llevaba `if`, así que con `npm test` en rojo
  se saltaba: no se miraba lo publicado y no quedaba fila en
  `salud.jsonl` (cuatro corridas del 23 al 25 de septiembre de 2026,
  incidencia #9). Y el push de la fila llevaba `continue-on-error`, así que
  una fila perdida dejaba el trabajo en verde sin avisar a nadie. Hoy el
  diagnóstico corre con `!cancelled()` y los dos pasos de la incidencia
  miran `steps.guardar.outcome`; hay prueba de las dos formas. Un paso con
  `continue-on-error` no puede ser el que avisa de que algo se perdió.
- **Una fecha automática que cambiaba lo que contaba** (3.13.1 → 3.14.0,
  cazado en revisión, sin efecto en los datos de Javi) — `fecharMaestria`
  fecha lo escrito a mano, y con fecha la base dejaba de ser «la fuente con
  más partidas»: 4 partidas a mano tapaban 40 apuntadas antes, y las previas
  de un héroe fechado no contaban. Hoy hay una prueba de PROPIEDAD (200
  casos al azar): fechar después de todo lo apuntado no cambia nada. Una
  migración automática se prueba así, contra el comportamiento de antes, no
  con el caso que la motivó. Y su gemela, cazada antes de publicar: «al
  fundir gana la copia con fecha más reciente» parecía arreglar las erratas
  a la alta, y con la fecha automática dejaba que un dispositivo recién
  abierto borrara la maestría buena del otro. Un campo que puede escribir
  una migración no significa lo que significaba cuando solo lo escribía la
  persona.
- **«Se puede concluir» sin decir qué** (hasta 3.18.0) — con 30 partidas
  siguiendo la app y 30 por libre, `medir-mias` escribía «ya hay 30 y 30,
  se puede concluir» y el diagnóstico «hay muestra en las dos ramas», sin
  la diferencia ni el margen: con sus 95 partidas eran 69,8% frente a 71,9%,
  −2 puntos ± 19, o sea nada. Las tres reglas del Veredicto solo se habían
  aplicado a la comparación contra su winrate de siempre. Hoy `resumen`
  devuelve `entreRamas` (dos proporciones con el error AGRUPADO: con Wald,
  30/30 frente a 0/30 daba margen cero y no afirmaba la diferencia más
  grande posible) y la pantalla, el informe y el diagnóstico la dicen con
  su margen. Una regla de honestidad se aplica a TODAS las comparaciones
  que se enseñan, no a la primera que se escribió.
- **Guardar en el almacén DENTRO de un updater de `setState`** (3.0) — React
  puede llamar a un updater más de una vez (evaluación ansiosa, modo
  estricto, reproceso de la cola), así que ahí dentro no va ningún efecto.
  Hoy `usePersonal` calcula fuera, con una referencia al último valor para no
  leer un cierre viejo, y guarda una sola vez. Funcionaba por suerte:
  `apuntar` genera el instante con `Date.now()` y dos llamadas habrían dado
  dos partidas distintas.
- **Una prueba de navegador que exigía que el dato del día fuera bueno, otra
  vez** (3.20.0) — `equipo.e2e` pedía que el primer motivo del consejo a
  los compañeros fuera positivo; el 27 de septiembre de 2026 la mejor
  opción de la primera línea solo tenía «pierde contra Layla» y fallaba
  igual con la versión anterior. Hoy comprueba el ORDEN (ningún motivo en
  contra delante de uno a favor) y el orden vive en una función pura
  (`src/app/motivos.js`) con su prueba, porque con los datos de ese día
  ninguna sugerencia mezclaba signos y la de navegador no cazaba la
  mutación. Cuarta vez de la misma lección: una prueba sobre datos reales
  comprueba cómo reacciona el código, no cómo viene el día.
- **Intro quitaba un héroe en el selector multi-toque** (3.16.0 → 3.21.0,
  cazado en revisión) — `conIntro` cogía el primero de la lista que no
  estuviera en `cogidos`, y los ya marcados del mismo bando no están ahí:
  con Alice metida, «al» + Intro buscando a Alucard la QUITABA. En
  multi-toque tocar es alternar; un atajo que elige tiene que saltarse a
  los marcados. Y su gemelo: tu pick fijado no se soltaba al banearlo
  (`anadir` sí lo hacía con enemigos) y se podía meter de compañero, así que
  el hueco «Tú» lo enseñaba y «Gané» apuntaba al nº1.
- **Un ejemplo del diagnóstico fuera de la línea** (hasta 3.24.1, visto en
  la incidencia #12) — la sección de maestría cogía el PRIMER héroe de la
  maestría para enseñar su puesto con y sin ella; con la línea en mid y
  Diggie el primero, el ranking de mid no lo tiene y salía «puesto 0 ->
  0» (un `findIndex` de −1 más uno). Hoy elige uno del pool de la línea y,
  si no hay, lo dice. Un índice que puede ser −1 no se enseña sumándole 1.
- **Un servidor viejo contestando con un dato caducado** (3.25.0 → 3.26.0,
  primera prueba real del lector) — el puerto de la depuración
  inalámbrica cambia cada vez que se enciende; el lector lo recibía por
  argumento y el que se quedó abierto en otra sesión de Termux seguía
  contestando a la app con el puerto viejo mientras el nuevo moría con
  «puerto en uso». Para quien lo usa era «no llega a la tablet» hiciera
  lo que hiciera. Hoy el lector encuentra la tablet solo y la vuelve a
  buscar cuando falla, y `lector` mata al anterior antes de arrancar.
  Un dato que cambia por su cuenta no se pide por argumento: se descubre.
- **Dar por hecho que el adb de Termux es el de Google** (3.26.0, cazado
  antes de publicar) — la primera idea fue `adb mdns services`; el paquete
  `android-tools` de Termux se compila de nmeum/android-tools con el mDNS
  apagado, y habría fallado en su móvil sin que las pruebas de aquí lo
  vieran. Antes de apoyarse en un mandato de una herramienta empaquetada
  por terceros, leer con qué opciones la compilan.
- **Lo aprendido solo mandando sobre lo medido** (3.27.0 → 3.30.1, un
  día en producción) — el lector leía los picks SOLO con los huecos
  aprendidos cuando los había, y la primera tanda real los aprendió de
  capturas que no eran el draft (ver «El lector aprende»): los picks
  dejaron de leerse toda una tarde y en Termux parecía una lectura
  normal. Se vio en las partidas subidas (`lector.dudas`), que es para lo
  que viajan. Hoy la medida manda y lo aprendido solo entra donde ella
  no lee. Un ajuste automático se añade a la referencia, no la sustituye.
- **`#!/usr/bin/env bash` en un acceso directo de Termux:Widget** (3.26.0 →
  3.32.1) — el widget y Termux:Boot lanzan el guion SIN el entorno de Termux
  (sin `termux-exec` precargado), y en Android `/usr/bin/env` no existe:
  «env: …/.shortcuts/Lector: No such file or directory» al tocar el widget.
  Los envoltorios llevan ahora `#!$PREFIX/bin/bash` y `exec "$PREFIX/bin/
  bash" lector.sh`, se reescriben siempre (un envoltorio viejo se arregla
  solo) y `lector` se relanza a sí mismo si `git pull` lo cambió
  (`--actualizado`, una vez). Lo que arranca Android por su cuenta no tiene
  el PATH de Termux: rutas enteras.
- **La cara comparada solo en espejo** (3.21.0 → 3.31.0) — se midió con
  dos picks (Clint y Khufra, reflejados) y se dio por hecho que el panel
  reflejaba a todos; Rafaela, Eudora y Gloo van sin reflejar en la misma
  pantalla y salían «?» siempre, y de rebote «tu equipo no se lee» (0,72)
  era falso: con las dos orientaciones se lee entero. Una geometría medida
  en dos ejemplos no está medida: mide con una pantalla LLENA.
- **La sexta prueba que exigía el dato de un día bueno** (3.30.1, la
  misma noche que lo anterior) — `matrices.test` pedía que «combina
  bien» (pareja ≥ 0,51) saliera en el 4–20% de las parejas DEL DÍA; la
  corrida de las 21:56 del 1 de octubre de 2026 trajo las parejas más
  dispersas (σ 0,030 → 0,037, p90 0,5152 → 0,5269; «combina bien» en el
  27,4%, cruces al 18,3% con tope en 20) y la prueba tumbó el despliegue
  de un arreglo que no tocaba el motor. Hoy se exige sobre
  `meta-sintetico` (la distribución con la que se calibraron los
  umbrales), la cifra del día va al registro y `seccionSalud` del
  diagnóstico AVISA con ella (`medirColas`, `COLA_DEL_MOTIVO`): un día
  ruidoso se dice, no bloquea. Queda por decidir si el umbral debería
  ser un percentil del día en vez de un número fijo (motor: se propone,
  no se hace solo); mientras tanto, ese día el motivo dice menos.
- **Cinco pruebas más que exigían el dato de un día bueno** (auditoría de
  3.21.1, pasando las pruebas del motor contra las 40 corridas de datos de
  septiembre y simulando un héroe nuevo, un rework y un renombrado):
  la ganancia del equilibrio de daño a 120 días con UNA semilla (las ocho
  daban −0,26 a +1,20; hoy se exige la media de ocho a 400 días > 0, que
  sigue cazando el signo cambiado); el consejo con y sin líneas abiertas
  comparado por nombres (falló en 5 de 40 corridas; hoy por probabilidad);
  la huella de kit contra la API (un rework tumbaba el despliegue; es el
  AVISO del diagnóstico); «Winrates: faltan» como FALLO con un héroe
  recién salido (hoy aviso si es `inferred`); y objetos exigidos por
  nombre (hoy solo si existen, más «algún objeto con cada efecto»). Y un
  fallo real que destapó: el cruce por reglas (héroe sin cruces) no era
  antisimétrico, ida + vuelta sumaban hasta 1,075; hoy resta la regla del
  otro lado. Dejadas a propósito, con su margen medido: la simulación
  (diferencia de tasas 0,24–0,40 con la semilla de la prueba en 9 corridas,
  umbral 0,12), 1 contra 5 (±2,5 puntos, hoy 0,94), la nº1 en la primera
  pantalla (e2e, no bloquea) y los héroes elegidos por nombre en equipo y
  draft (cambian de línea poco). Antes de escribir una prueba sobre
  public/data, pásala contra las corridas guardadas: `git log` las tiene.

- **La guarda de rango solo en la fuerza, con su gemela suelta en las
  matrices** (3.11.0 → 3.35.0) — cuando Gloria se vació tras el reinicio
  de temporada, 3.11.0 pasó la FUERZA de los héroes a Mítico y dejó cruces
  y parejas en Gloria, «porque no se degradaron» (r = 0,96 el 25 de
  septiembre). Era verdad ese día: esas rutas acumulan la temporada y
  tardan más en vaciarse. Hacia el 28 dejaron de valer (r = 0,64 con
  Mítico, 0,62 con la propia Gloria de antes) y nada lo vigilaba; Javi lo
  notó como «picks muy raros últimamente» (Diggie «pierde» contra Minotaur
  con parejas a −8). Una guarda que se pone a una fuente se pone a todas
  las que comparten población, y «no se ha degradado» se vigila, no se
  comprueba una vez.
- **Un plural con un hueco dentro** (3.28.0 → 3.35.0) — «{n|1 nombre
  nuevo|{n} nombres nuevos}» salía crudo en pantalla porque la regla del
  plural de `crearT` cortaba en la primera llave. Hoy admite huecos en cada
  rama y una prueba recorre TODAS las claves de los dos idiomas con 1 y con
  2: ninguna deja llaves.

- **Las pruebas de navegador en rojo dos pushes seguidos sin que nadie
  mirara** (3.35.0 → 3.37.0) — `pruebas-ui.yml` no bloquea el despliegue
  (a propósito: no puede depender de un Chrome), así que su rojo no para
  nada; el botón «Copiar» medía 31,x px de alto en el Chrome del runner y
  32 aquí. Después de cada push, mirar también esa corrida. Y un atributo
  JSX repetido (`lectorAuto` dos veces en App.jsx) solo salía como aviso
  en el registro de Vite: hoy `pruebas/app/avisos-jsx.test.mjs` compila
  cada fichero de `src/` con esbuild y falla con cualquier aviso.
- **Lo recién publicado, revisado a la contra, tenía 14 fallos** (3.37.0)
  — tres revisiones en paralelo del código de 3.33–3.36, cada una con la
  orden de reproducir antes de afirmar: pasivas tratadas como habilidades,
  un tipo de inmunidad leído como otro, una tabla de victoria que no podía
  entrar, un `rm -rf` de una carpeta pública, una etiqueta de rango que
  mentía con la API caída… Ninguna prueba los veía porque las pruebas se
  escribieron con el caso que motivó cada cambio. Tras una tanda de
  versiones seguidas, una revisión así antes de seguir añadiendo.
- **Dos componentes con la misma clase CSS** (3.36.0 → 3.38.0) — el plan
  de partida se llamó `.plan`, que ya era el plan A·B·C de la fase de
  baneos, y su `display: flex; flex-direction: column` se le aplicaba
  también a ese. `comprobar/css.mjs` mira que toda clase usada tenga
  estilo, no que una clase nueva no exista ya: antes de nombrar una clase,
  `grep` en `styles.css` y en `src/`.
- **«Leer solo» deshaciendo lo que se tocaba a mano** (3.28.0 → 3.40.0,
  cazado por la primera pasada de `click-path-audit` de ECC, seis fallos
  reproducidos en `toques.e2e.mjs`): la × quitaba un héroe y la lectura de
  5 s después lo volvía a meter (`aplicarLectura` solo sumaba; hoy lo leído
  y ya no presente es un rechazo, `rechazados`); soltar el pick que fijó el
  lector y volvía a fijarse (`soltadoAMano`); el «Deshacer» no caducaba
  porque cada lectura vacía lo reapuntaba y el temporizador iba atado al
  objeto (hoy `creado`); una lectura con enemigos pasaba a picks y
  desmontaba la hoja de baneos abierta (el aviso y la hoja van en el mismo
  hueco en las dos fases); el selector de picks reordenaba la rejilla al
  entrar un compañero leído (`fueraAlOrdenar` se fija al abrir); y con el
  pick fijado de otra línea se preguntaba y apuntaba el nº1. Cada uno
  funcionaba solo; juntos, el proceso automático pisaba al dedo. Todo lo
  que escribe un proceso automático sobre un estado que también toca la
  persona tiene que saber qué quitó la persona.
- **La vigilancia del final guardaba las PRIMERAS pantallas y la subida
  cortaba la tabla** (3.33.0 → 3.40.0, `silent-failure-hunter`): con ocho
  ya guardadas, el lector y `fundirFinal` descartaban las nuevas, así que
  la tabla (que es de las últimas) solo entraba por su excepción; y
  `cuerpoDeFotogramas` metía miniaturas por orden hasta llenar el mensaje
  (10–12 mil caracteres cada una): las incidencias #21–#35 dicen «8
  pantallas» y ninguna lleva la tabla. Hoy se quedan las últimas y la
  subida va por importancia (tablas, luego de la más nueva a la más
  vieja), con «N de M» en el título.
- **Un canal de la app que podía mandar a Claude** (hasta 3.40.0,
  `security-reviewer`, sin que llegara a pasar): `claude.yml` atiende a
  comentarios del dueño con «@claude», y las incidencias de pantallas y
  partidas las escribe la APP con el token de Javi, con texto que llega
  del puerto local del lector. Hoy la app solo sube fotogramas con la
  forma del lector (`fotogramaValido`: id, minuto, base64), el lector
  exige `Host` local (contra el rebinding de DNS) y ya no tiene `/captura`,
  y `claude.yml` no se dispara en incidencias con etiqueta `pantalla`,
  `partidas` o `vigilancia` ni por el «@claude» del cuerpo (prueba que
  EVALÚA la condición contra eventos). Lo que entra por un canal
  automático no puede llegar a un canal que obedece órdenes.
- **El 422 que soltaba el rango** (hasta 3.40.0, `silent-failure-hunter`,
  sin constancia de que pasara): `callRoute` reintentaba sin parámetros,
  así que una API que rechazara `rank` daba los datos de todos los rangos
  guardados como de Gloria (y la guarda de rango los veía idénticos a los
  de Mítico) y una que rechazara `lane`, las builds de otra línea. Hoy
  rango y línea no se sueltan nunca, lo soltado va con la respuesta
  (`sin`) y `fetchStats` falla si pidió 3 días y le quitaron `days`. Y
  la descarga se niega a llamar a una ruta de cuentas (`RUTA_PROHIBIDA`,
  en el descubrimiento y en `request`). Un reintento que afloja tiene que
  saber qué parámetros dicen DE QUÉ es el dato.
- **Una imagen con el mismo nombre que cambia de dibujo** (hasta 3.41.0)
  — la ingesta solo bajaba las caras que FALTABAN, así que Masha y Bruno,
  rehechos en 2.2.16 (16 de septiembre de 2026), siguieron tres semanas
  con la cara vieja en las tarjetas aunque la API ya diera otra URL
  (comprobado el 5 de octubre: el fichero guardado y el de la URL de hoy
  eran dibujos distintos). Y aunque se hubiera bajado, el móvil la tenía en
  `CacheFirst` con el mismo nombre y no la habría pedido nunca; y el
  despliegue copiaba con `cp -n`, que no pisa. Hoy cada carpeta lleva
  `fuentes.json` (id → URL; `bajarImagenes` baja de nuevo si cambia), el
  despliegue parte de una copia de public/ y copia encima, y la app pide
  cada imagen con `?v=` y la huella de SU CONTENIDO (`__HUELLAS__`,
  `scripts/huellas.mjs`, en la clave de la caché): una bajada fallida no
  deja un dibujo viejo con una clave nueva. Lo que se guarda en caché
  «para siempre» necesita en el nombre algo que cambie con el contenido.
  Y lo destapó de rebote: la prueba «la ingesta arranca sin errores»
  corría sin `--iconos` ni `--retratos`, así que escribía en public/ (no
  se notaba porque todo «ya estaba»); con `fuentes.json` nuevo bajó las
  206 imágenes del CDN de verdad dentro del repositorio. Hoy va a una
  copia y comprueba que public/ no se toca. Al añadir una salida a la
  ingesta, mira qué pruebas la corren sin decirle dónde escribir.
  El 5 de octubre de 2026, al estrenarlo, cambiaron ocho caras (Masha,
  Bruno, Brody, Paquito, Clint, Kadita, Badang, Luo Yi).
- **Subidas que se daban por hechas antes de hacerse** (3.30.0 → 3.41.0):
  `volcarFotogramas` vaciaba la lista y llamaba a `subirAparte` sin mirar
  qué contestaba: sin red al apuntar, las pantallas del final de esa
  partida se perdían. Hoy van a una cola (`encolarAparte`/`vaciarCola` en
  envio.js, `MAX_APARTE` 4, en memoria) que se reintenta cada minuto y con
  el evento `online`; si la incidencia se crea y el comentario falla, queda
  solo el comentario con su número. Y `/corregir`, que ESPERA a que el
  lector aprenda (decenas de segundos por captura en el móvil), tenía el
  plazo de una lectura (20 s): hoy `PLAZO_CORREGIR_MS` (3 min). No se puede
  medir cuántas se perdían: una corrección sin nada aprendido tampoco deja
  `aprendizaje` (16 de 39 lo llevan).
- **Un «Deshacer» que no deshacía lo que ya había salido** (3.23.0/3.32.0
  → 3.42.0): «Nuevo draft» subía en el acto las pantallas del final sin
  resultado (y al devolver el draft con «Deshacer» ya no estaban), y una
  partida apuntada sola le enseñaba al lector «ganada» o «perdida» y subía
  sus pantallas antes de que se pudiera deshacer. Hoy lo que sale de la app
  (al proyecto o al lector) espera al plazo de su «Deshacer»
  (`crearDiferido`, src/app/diferido.js, con la clave del draft:
  `completoDesde`); si ese draft vuelve, se cancela y las pantallas vuelven
  a la lista; si llega otra cosa que esperar o la app se va (`pagehide`),
  lo pendiente sale ya. `corregirLectura` sigue saliendo en el acto: la
  verdad del draft no cambia al deshacer. Pruebas en `app/diferido.test` y
  `toques.e2e` (las dos de deshacer y la de «sin deshacer, sale al acabar
  el plazo»). Un «Deshacer» solo deshace lo que aún no ha salido de la
  app: lo que se manda fuera espera a su plazo.
- **La frescura medida en lo pedido, no en lo que DECIDE** (hasta 3.43.1,
  `silent-failure-hunter`, sin constancia de que pasara): la fecha del
  fichero miraba las estadísticas de Gloria y las filas de CRUCES, pero la
  guarda de rango compara Gloria con Mítico y puntúa con él, y cada fila de
  cruces arrastraba las parejas de la corrida anterior si la ruta de
  parejas venía vacía. Con el Mítico del 27 de septiembre y los datos del 5
  de octubre la guarda pasaba de Mítico a Gloria (r 0,76 → 0,87) y el nº1
  de roam cambiaba en 112 de 300 drafts, con la fecha de hoy, el comparador
  conforme y el diagnóstico «Datos frescos». Hoy `estadisticasFrescas`
  (fusion.mjs) exige también el rango de respaldo, la ingesta lo pide
  aunque `--ranks` no lo lleve, `anotarFrescura` cuenta las parejas aparte
  (`frescosRecursos.parejas`), el comparador mira las dos cosas
  (`rangoFresco`, `relacionesFrescas`) y el diagnóstico dice QUÉ faltó
  (`queFaltaDeLaCorrida`) y si la fuerza sale de un rango no descargado. En
  la misma pasada: la fila de salud no llevaba `conRol` ni `conSpeciality`
  aunque estaban en `FIJAS` (trinquete sin fondo: diez corridas perdiendo
  un 9% se aceptaban, 133 → 55; hoy la fila lleva TODAS las de `FIJAS`,
  contadas con `medir`, y la prueba lo exige para todas), el aviso de «dos
  poblaciones» comparaba tu rango con `meta.rank` y no con
  `relaciones.rango`, `aciertosDelLector` comparaba cada nombre leído con
  todo el draft (11 de 677 eran del lado equivocado) y `medir-mias` se
  tragaba el error de leer el meta. Toda marca de frescura tiene que cubrir
  lo que DECIDE, no solo lo que se pidió.

- **Buscar el inicio de la partida cuando ya había empezado** (3.44.0 →
  3.45.1): el lector miraba la tablet desde el minuto 1 tras completar el
  draft, y la partida empieza antes. El 6 de octubre de 2026 el marcador
  de la cuarta partida (subido con sus pantallas, #42) decía 15:35 a las
  20:41:11, o sea que empezó a las 20:25:37, y el draft se completó entre
  las 20:24:42 y las 20:25:22: de 15 a 55 s antes. La primera captura ya
  era de juego, el inicio salía estimado (bien marcado, por 3.44.1) y
  NINGUNA de las cuatro partidas de esa tarde guardó su duración ni dijo
  su cierre; la voz iba con un inicio aproximado. Hoy se mira desde el
  minuto 0 (`inicioDesdeMin`) y la estimación sin ver sigue en el 1
  (`inicioEstimadoMin`), con prueba de una partida que empieza a los 30 s.
  Un plazo que se supone («la partida empieza pasado un minuto») se mide
  con la primera partida de verdad: el reloj del juego estaba en el
  marcador que ya se subía.

- **Tu fila leída fijando un héroe de otra línea** (3.31.0 → 3.46.1): las
  skins hacen que la fila propia sea la peor leída, y el 6 de octubre de
  2026 «Hayabusa» (jungla) quedó fijado como tu pick en una partida de
  roam: la voz se calló (el plan de un pick fuera del ranking no se dice)
  y la partida se apuntó sola con él. Javi no jugó Hayabusa. En sus 134
  partidas con línea esa es la ÚNICA con el héroe fuera de la línea, así
  que `tuyoDeTuLinea` (src/app/lector.js) descarta lo leído en tu fila si
  no está en el pool de tu línea (sin pool conocido, no filtra). Y de
  rebote: en `app/lector.test` una prueba de 3.44.0 iba DESPUÉS de
  `terminar()` en la misma línea; no se esperaba y, si fallaba tarde, el
  código de salida ya estaba a 0. Hoy el arnés da por fallo toda prueba
  declarada tras `terminar()` (`scripts/arnes.test`, que lo comprueba con
  el código de salida de un proceso aparte). Al añadir una prueba al
  final de un fichero, va ANTES de `terminar`.

- **Una prueba con el tiempo real dentro de su reloj simulado** (hasta
  3.50.0, sin llegar a tumbar un despliegue): `directo-lector.test` da al
  lector `ahora = Date.now() + desfase`, así que los segundos que tarda la
  propia prueba cuentan como minutos de partida. El 9 de octubre de 2026,
  en una máquina más lenta (la prueba tardó 100 s en vez de 63), midió 15,6
  minutos donde exigía 15 ± 0,5 y dijo un aviso del minuto 13 antes de ver
  la tabla del 12,5, con la 3.49.0 igual que con la nueva. Congelar el reloj
  rompe la vigilancia (programa sus capturas con él). Hoy la duración se
  exige entre lo que llevaba la prueba al poner la tabla y al leerla (sigue
  cazando medir desde el draft o un minuto de más), y la segunda partida
  lleva su propio `desde` y la tabla al 12,05. Una prueba con un reloj
  simulado que suma el real tiene que acotar con el real, no con un margen
  fijo.
  Y tenía GEMELAS: el 9 de octubre, con tres revisores corriendo a la vez,
  el punto medio de 3.46.0 salió a 15–18 s (margen ±5) y las duraciones de
  14 y 26 minutos con 0,6–0,7 de más, en `npm test` y sola (2 de 4). Hoy el
  reloj de cada duración se fija respecto al instante en que se pone
  (`inicio - Date.now()`) y el punto medio se acota con el reloj del lector
  antes y después de cada lectura; tres copias a la vez dan 12 de 12, y dos
  mutaciones (la última lectura en partida, la duración desde el draft) se
  cazan. Al arreglar una prueba de tiempos, busca sus gemelas con `grep
  "Date.now() + desfase"`.

- **Un proxy de imágenes que la API puso por su cuenta** (3.57.2): el 11
  de octubre de 2026 cada imagen pasó a llegar como `https://wsrv.nl/?url=
  <la de Moonton>`. `fuentes.json` guarda la URL, así que se rebajaron las
  210 imágenes (recomprimidas: 3.795 → 2.783 bytes la de Miya), el lector
  daba por desfasadas sus 133 caras (`carasDesfasadas` compara URL) y
  `huellaTexto` metía las URL en la huella del kit: el aviso de rework
  salió para los 133 héroes, con el texto idéntico (comprobado
  desenvolviendo las URL: las 133 dan la huella del 10). Hoy `urlOriginal`
  (extraccion.mjs) desenvuelve cara, retrato e icono, la huella ignora las
  direcciones y `heroes.json` lleva las huellas nuevas; la API simulada
  sirve las imágenes por el proxy. Una huella de CONTENIDO no lleva
  direcciones dentro.
- **Una guarda comparada con un estado que ella misma no deja avanzar**
  (3.54.0 → 3.56.0, cazado por `silent-failure-hunter` el día siguiente):
  `fueraDeLosPicks` comparaba la lectura con `huecosLeidos`, que conserva el
  nombre viejo donde ahora hay «?» (`b ?? a`, a propósito para
  `cambiosDeHueco`). Un héroe que se miraba y se cambiaba por uno que el
  lector no reconoce contaba como cambio PARA SIEMPRE; con tres así, todas
  las lecturas de ese equipo se tiraban hasta el draft siguiente, sin más
  señal que «sin nada nuevo». Hoy compara con `huecosCrudos`: los huecos tal
  cual de la última lectura ACEPTADA. Prueba en `app/lectura-draft.test`,
  el hook de verdad con un React mínimo empaquetado con esbuild y lecturas
  seguidas (falla con 3.55.0). Una guarda que decide si se actualiza su
  propia referencia se prueba con una SECUENCIA, no con una lectura.

- **Un CLAUDE.md que cada iteración hacía crecer** (hasta el 14 de octubre de
  2026): la fase 5 de `/iterar` y el cierre de `/revisar` añadían su lección
  al final, y llegó a 3.948 líneas y 272 KB, unos 75.000 tokens cargados en
  cada sesión, cada subagente y cada «@claude» antes de escribir nada. Hoy
  `CLAUDE.md` lleva lo que vale para cualquier tarea (con tope, en
  `claude-config.test`), lo de cada zona va en `.claude/rules/` (se carga al
  tocar esa zona, por `paths:`; la prueba exige que cada glob case con algún
  fichero) y la historia aquí. Al partirlo se vio que `rutas.test` nunca
  había mirado una ruta que empezara por punto: `\b` no casa entre una
  comilla invertida y `.github/…`. Un fichero que se carga siempre tiene
  tope, o el primer año lo llena.

- **Una guarda que, sin poder medir, olvidaba lo que ya había medido**
  (3.37.0 → 3.57.3): con Mítico a medias, `elegirRangoDeRelaciones` se
  quedaba «la pedida», Gloria, aunque la corrida anterior la acabara de
  medir rota. El 11 y el 12 de octubre de 2026 la app volvió a decidir con
  esos cruces, con un solo aviso en el diagnóstico. Hoy recuerda su última
  medida (`relaciones.ultima`). Cuando una guarda no puede comprobar, su
  respuesta por defecto es la de su última comprobación, no la del caso
  sin guarda.

- **Una prueba nueva que leía «lo anterior» de public/data** (3.57.3 →
  3.57.4, tumbó un despliegue): la sexta corrida de `ingesta-simulada` no
  llevaba `--previo` y leía `public/data/roam-meta.json`, que antes de
  3.57.3 no tenía `relaciones.ultima`. El 14 de octubre de 2026 el
  despliegue bajó datos que SÍ midieron Mítico (cruces 0,82, parejas 0,61),
  los copió a public/data antes de `npm test` y la prueba, que suponía
  «sin medida guardada», falló con el comportamiento correcto. Hoy cada
  corrida que depende de lo anterior lo recibe por `--previo`. Séptima vez
  de la misma lección: una prueba no puede depender de lo que haya en
  public/data, ni siquiera de un campo que hoy no existe.

- **Un push de código que devolvía la app a datos viejos** (hasta 3.57.6):
  el despliegue publica con la ingesta del momento o, si falla, con los
  datos del repositorio, y no commitea. El 14 de octubre de 2026, con la API
  a ratos, el despliegue de las 09:34 publicó datos de las 09:42 y el de las
  10:39, sin API, volvió a los del 12 por la noche. Hoy mira antes lo que ya
  sirve Pages. Lo publicado también es un estado: un paso que lo sustituye
  tiene que saber si lo que trae es peor.
