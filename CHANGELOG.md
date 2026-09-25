# Cambios

Sube la versión en `package.json` cuando cambies comportamiento y deja aquí una
línea explicando qué cambia **para quien usa la app**, no qué ficheros tocaste.
El despliegue falla si la versión que vas a publicar no tiene su entrada, así
que esto no se olvida.

Criterio: `0.X.0` cuando cambia cómo decide la app o qué hace; `0.0.X` para
correcciones.

## 3.12.1

- **El diagnóstico explica cuando las partidas profesionales no se han
  podido actualizar.** Si el lunes Liquipedia no deja leer (limita mucho
  las descargas desde los servidores de GitHub), la app conserva las
  partidas de la semana anterior, y ahora el diagnóstico lo dice con esas
  palabras y la edad de los datos, en vez de «? peticiones». El 21 de
  septiembre pasó exactamente eso; el lunes siguiente se reintenta solo.

## 3.12.0

- **Cada tarjeta enseña el winrate del héroe EN TU LÍNEA.** Debajo del
  winrate general sale, por ejemplo, «Exp 53.8%»: cómo le va a ese héroe
  jugando justo en la línea que has elegido. El general mezcla todas las
  líneas que juega, y hay héroes que cambian mucho según dónde: Saber gana
  el 53,8% en jungla y el 42,4% en roam; Natalia, el 54,8% en jungla y el
  48,2% en roam. La hoja «Meta» lo enseña también en cada fila («en Exp
  53.1%»), línea por línea.
- Es información, no cambia la nota: medido contra partidas profesionales,
  no predice mejor que el winrate general. Son unas semanas de Gloria, así
  que tras un reinicio de temporada tarda en ponerse al día. Se actualiza
  solo, dos veces al día, con el resto de los datos.

## 3.11.0

- **La fuerza de cada héroe ya no sale de un puñado de partidas tras un
  reinicio de temporada.** Gloria Mítica es el rango más alto y en cada
  temporada nueva se vacía: todos bajan y tardan semanas en volver. Desde
  el 23 de septiembre, con la semana entera ya dentro de la temporada
  nueva, el winrate de Gloria salía de tan pocas partidas que era casi todo
  ruido: se parecía al de Mítico a r = 0,67, cuando lo normal es 0,86–0,90,
  y héroes como Chip o Freya aparecían entre los más fuertes por azar.
  Ahora, si Gloria no se parece a Mítico, la fuerza de los héroes sale de
  Mítico, que tiene muchas más partidas y con Gloria llena se le parece
  mucho; en cuanto Gloria se rellena, vuelve a Gloria sola. Hoy cambia el
  nº1 en algo más de la mitad de los drafts de roam. La hoja «Meta» lo dice
  cuando pasa, y el diagnóstico también.
- Buscadas otras fuentes de winrate y de tier list, y medidas contra 805
  partidas profesionales antes de meter ninguna en la nota: el winrate de
  cada héroe POR LÍNEA (existe en la API y Chou, por ejemplo, gana el 42,8%
  de roam y el 46,0% de exp) y la curva de winrate por duración de partida.
  Ninguna mejora la predicción de forma distinguible de lo que ya hay, así
  que no puntúan. La tier list oficial de Moonton sigue retirada.

## 3.10.1

- **Quitar una partida la quita también del proyecto.** Hasta ahora, si
  apuntabas una partida por error y la quitabas en «Tus partidas», en el
  móvil desaparecía pero la base de datos del proyecto se la quedaba para
  siempre (con la subida automática, llega a los tres segundos de
  apuntarla), y al traer un código viejo en «Tu perfil» volvía a aparecer.
  Ahora quitarla deja una marca que viaja con tus datos: el proyecto la
  borra y ningún código viejo la devuelve. Corregir el resultado ya se
  propagaba bien; lo que fallaba era solo quitar.

## 3.10.0

- **Tus partidas se suben solas al proyecto.** En «Tus partidas» hay un
  bloque nuevo, «Subida automática»: pegas un token de GitHub (se crea en
  GitHub con acceso SOLO a las incidencias de este repositorio, y la propia
  hoja enlaza dónde y dice qué marcar) y desde ese momento cada partida que
  apuntes, corrijas o quites se sube sola a los pocos segundos, siempre a la
  misma incidencia, y el bot responde ahí con la medida. Sin abrir el
  navegador ni iniciar sesión: el botón «Enviar mis partidas al proyecto»
  abría GitHub y, sin sesión iniciada, el inicio de sesión con el código
  dentro de la dirección fallaba (error 501). Con el token, ese botón sube
  al momento por la API; sin token, sigue abriendo el formulario como antes.
  La hoja dice cuándo fue la última subida, si hay algo pendiente y, si el
  token caduca o no tiene permiso, qué hacer. Sin red se espera a que vuelva;
  tras un fallo no se insiste hasta pasados diez minutos o hasta que haya
  algo nuevo.
- El token se guarda solo en tu móvil y solo viaja a `api.github.com`, en la
  cabecera de la petición: no entra en el código de perfil ni en el
  diagnóstico (hay prueba de navegador de las dos cosas). Un token limitado a
  «Issues: read and write» de este repositorio no puede tocar nada más, y no
  tiene ninguna relación con tu cuenta del juego.

## 3.9.0

- **La app pregunta cómo fue aunque no hayas fijado tu pick.** Hasta ahora
  la pregunta «¿Cómo fue con X?» solo salía si habías tocado «Lo cojo»; si
  metías el draft entero y jugabas, no se apuntaba nada. Ahora, diez
  minutos después de que el draft esté completo (cinco enemigos y cuatro
  compañeros), al volver a la app pregunta «¿Jugaste con {nº1}?» con Gané,
  Perdí, «Otro héroe» (abre «Apuntar partida» con la lista) y «Más tarde».
  Cada partida apuntada es una más en la base de datos del proyecto.
- El canal de envío de partidas (3.8.0) está probado de extremo a extremo
  con una incidencia real del dueño: el bot la leyó, respondió y la cerró
  en quince segundos.

## 3.8.0

- **Tus partidas tienen base de datos en el proyecto** (`historial/partidas.json`).
  En «Tus partidas» hay un botón nuevo, «Enviar mis partidas al proyecto»:
  abre una incidencia de GitHub ya rellena con tu código de perfil dentro
  (partidas apuntadas con su draft, resultado, baneos, estimación y tu
  maestría) y tú solo confirmas. Un bot la lee, la funde con lo guardado
  sin perder nada (la copia del móvil gana si corregiste un resultado),
  mide el modelo contra tus partidas y te responde en la misma incidencia:
  si seguir a la app hace ganar (con su margen), si la probabilidad que
  enseñó se parece a lo que pasó, cómo puntúa el modelo de hoy los drafts
  que tuviste delante (Brier, AUC, pendiente), y tus números por héroe y
  por mes. Es público, porque es tu repositorio, y se dice antes de tocar.
  Solo se aceptan envíos del dueño del repositorio. Con eso el modelo se
  puede medir en TU cola, no solo en las partidas profesionales.
- El informe también se puede sacar a mano: `node scripts/medir-mias.mjs`.

## 3.7.1

- **La probabilidad con el draft a medias vuelve a estar centrada**: el
  equipo con más héroes en pantalla salía favorecido (con un héroe tuyo y
  cinco suyos, la app decía 45% aunque no supiera nada de los otros cuatro).
  El centro del término de héroe era la media simple de los 133 winrates y
  los héroes que salen en un draft son los populares, que este parche ganan
  más que esa media; ahora el centro es la media ponderada por lo que se
  juega (≈50%, como tiene que ser). Y el equilibrio de daño se centra en
  un equipo de uno por línea, no en cinco al azar: el oro es físico y el
  medio mágico, así que un equipo real mezcla más. Medido: 1 contra 5 pasa
  del 45% al 50%. El ranking de tu línea no cambia (los tres primeros son
  los mismos en 300 de 300 drafts medidos): el centro es el mismo para
  todos los candidatos. Los baneos sugeridos sí se mueven un poco: con el
  centro bajo, cualquier héroe popular parecía más amenaza que uno raro y
  fuerte, y ahora la amenaza se mide contra lo que cabe esperar del que
  cogerían en su lugar (el primer baneo cambia en el 13% de los drafts,
  casi siempre el tercero).
- **Los datos vuelven a publicarse dos veces al día.** Desde el 23 de
  septiembre el despliegue se paraba porque una prueba exigía que la banda
  de probabilidades de drafts al azar fuera la de un parche asentado, y
  una semana después del reinicio de temporada los winrates se dispersan
  más (5 puntos entre héroes en vez de 3). Esa prueba mide ahora la
  escala sobre datos sintéticos fijos y la banda del día solo se enseña.

## 3.7.0

- **La interfaz sigue el lenguaje visual actual de Apple (iOS 26, «Liquid
  Glass»)**: fondo negro con dos resplandores de color, paneles y tarjetas
  de cristal translúcido con arista de luz, esquinas grandes y concéntricas,
  botones y chips en píldora, letra del sistema con títulos gruesos (ya no
  hay mayúsculas condensadas) y números en la variante redondeada con cifras
  alineadas. El pie flota como una cápsula con desenfoque de lo que pasa
  debajo, el botón principal de la fase de baneos va relleno de amarillo y
  cada control se encoge un poco al tocarlo. Los colores pasan a la paleta
  del sistema (amarillo, azul, rojo, verde, morado, naranja).
- **Nada se ha movido de sitio**: los altos, huecos y áreas de toque son los
  de 3.6.0, así que la tarjeta nº1 sigue cabiendo en la primera pantalla y
  las pruebas de tamaño (320 a 1.920 px) siguen en verde.

## 3.6.0

- **La interfaz, medida y ajustada en doce tamaños de pantalla** (móviles de
  320 a 430 px en vertical y apaisado, tablets de 540 a 1.024, escritorio
  hasta 1.920) abriendo todas las hojas en cada uno. Lo que salió y se
  arregló: la tabla Meta se salía por la derecha en móviles de 320–360 px
  (pick y ban pasan a una segunda línea bajo el nombre); las × de los huecos
  y las marcas de rival tenían 21–31 px de ancho de toque (ahora 32 o más,
  sin ensanchar el hueco); las tablets en vertical (700–820 px) iban a una
  columna con huecos medio vacíos (ahora a dos, y la tarjeta nº1 se ve sin
  desplazarse); en pantallas anchas las hojas se estiraban a todo el ancho
  (se centran en 1.100 px) y desde 1.700 px las tarjetas van en tres
  columnas. Y queda vigilado: una prueba de navegador repite la medida en
  cuatro tamaños (320, 360, 768 y apaisado) con las hojas abiertas y falla
  si algo vuelve a salirse o a quedar por debajo de 32 px.
- **En el móvil el pie ya no flota**: tapaba lo que quedara debajo (a 320 px,
  el 92% del ancho). La versión sale ahora arriba, junto a la línea y la edad
  de los datos, y el detalle del pie sigue al final de la página.

## 3.5.1

- Los bots corren en Node 22: el 20 llegó a su fin de vida en abril y los
  runners lo ejecutaban forzado. Nada cambia en la app.
- La serie de salud cuenta los avisos distintos, no la suma de las cinco
  líneas: un aviso global (la ventana de 3 días tras el reinicio de
  temporada) salía como 10 en el historial donde el móvil decía 2.

## 3.5.0

- **«Lo cojo»: fija tu pick y todo lo demás habla de él.** Toca el nombre
  de una tarjeta (o el hueco «Tú» nuevo en tu equipo, que abre tu pool en el
  orden del ranking) y ese es tu pick: el análisis, la composición, el
  consejo a los compañeros y la estimación hablan de él y no del nº1, aunque
  cojas el nº2 (empatan en uno de cada cuatro drafts). Segundo toque lo
  suelta. Si fijas uno que va por debajo del nº1, el análisis te dice cuántos
  puntos le faltan; y la frase de «sigue siendo el nº1 en el X% de los
  finales» se calla para un pick que no es el nº1, porque no tendría sentido.
  Su tarjeta sube la primera (con su puesto real: el nº22 no se veía entre
  las ocho), y se guarda con el draft, así que sobrevive a cerrar la app.
- **La app pregunta cómo fue.** Diez minutos después de fijar el pick, al
  volver a la app: «¿Cómo fue con X? Gané / Perdí / Más tarde». Un toque y
  la partida queda apuntada; «Más tarde» vuelve a preguntar en otros diez
  minutos. Es lo que hace crecer el Veredicto y la calibración sin acordarse
  de nada.
- **Cada partida apuntada guarda el draft entero** (enemigos, aliados,
  línea, rival), unos 200 bytes. Es lo que permitirá medir el modelo en TU
  cola, no solo en las partidas pro: una partida apuntada sin su draft era
  irrecuperable. Va dentro del código de perfil, así que viaja contigo.
- **Filtro «Mis héroes».** Un botón en la cabecera de las tarjetas deja solo
  los héroes que llevas (con maestría o partidas) y dice quién sería el nº1
  fuera de ellos. Un héroe que nunca has jugado entra en el ranking «como tu
  media», que es optimista: el filtro es la versión honesta. Solo sale si
  tienes maestría.
- **Tu plan A · B · C en la fase de baneos**: tus tres mejores de la línea
  con el draft vacío y su tasa de ban, para saber antes de los 30 segundos
  si tu plan A va a llegar (Marcel llega baneado el 55% de las veces). Un
  plan ya baneado sale tachado.
- **Apuntar una partida con un héroe de otra línea**: «Otro héroe…» abre el
  resto del catálogo. Y con el pick fijado, apuntar es un toque: ya viene
  marcado.
- **El toque va más ligero.** El consejo a los compañeros (cuatro rankings
  más, medido: el doble que el tuyo, 40 ms aquí y 160–250 en un móvil) va
  ahora diferido como la simulación, con su propia marca de para qué pick se
  hizo. El consejo que se enseña es siempre coherente consigo mismo.
- **Corregido: un héroe recién salido sin estadísticas movía el centro de
  las parejas** (pesaba 133 veces lo que cualquier pareja; medido: 0,36
  puntos porcentuales por héroe). Y la simulación de finales lleva ahora la
  marca de con qué baneos se hizo: una hecha con otros baneos ya no se
  cruza con el draft de ahora.
- La cobertura («37/37 con datos · 37 con counters») solo se dice cuando
  falta algo: con todo cubierto ocupaba el sitio sin decidir nada, y la
  tarjeta nº1 sube 15 píxeles en la primera pantalla. El color de la barra
  de estado del móvil coincide ahora con el fondo de la app.

## 3.4.0

- **La nota tiene en cuenta el equilibrio de daño del equipo.** Un equipo con
  físicos y mágicos de verdad (no «mixtos») gana más que uno que pega todo
  de un tipo, y lo dice el dato, no una regla: en 1.830 partidas
  profesionales, los equipos sin ningún mago puro ganan el 42,9%, con uno
  el 45,3%, con dos el 51,6% y con tres el 52,2%. Es el único término nuevo
  de doce probados que mejora la predicción fuera de muestra (la
  verosimilitud sube 2,5–3,9 puntos por 1.000 partidas en ocho particiones
  distintas, y el AUC del modelo pasa de 0,57 a 0,59); los otros once (peor
  cruce, mejor cruce, cinco mejores cruces, cruces a favor y en contra por
  separado, héroe más flojo, héroe más fuerte, pickrate total, banrate
  total, la tier list, la peor pareja, y varias formas de contar el daño)
  no mejoran nada y no entran. Se cuenta min(físicos, mágicos) de los tuyos
  menos el de los suyos, centrado en lo que cabe esperar con los héroes que
  hay en pantalla, y pesa la mitad que un cruce (0,5, medido: el óptimo
  está entre 0,45 y 0,55 en las dos ventanas de partidas). La tarjeta lo
  dice cuando tu pick es el que mete el tipo de daño que faltaba («mete el
  daño mágico que le faltaba al equipo»), el desglose lleva una barra nueva
  («daño») y la probabilidad estimada se abre un poco (drafts al azar del
  38% al 62% en vez de 40–60): es la información nueva. Un héroe mixto no
  cuenta para ninguno de los dos, que es como se midió.
- **Lo que falta por salir se pondera por lo que se juega cuando no está
  baneado.** Un héroe que banean el 80% de las veces sale poco en las
  estadísticas, pero en TU partida no lo han baneado, así que es más
  probable de lo que dice su pickrate. Medido en 14.640 situaciones de
  draft profesional (adivinar los picks que faltan viendo 1–4 por equipo):
  por pickrate se acierta el 13,0% en el top 10; por pickrate/(1−banrate),
  el 15,3%. Afecta al término «por ver» de la nota y a la simulación de
  finales; los baneos sugeridos ya lo hacían.
- **Un héroe recién salido, sin estadísticas, ya no distorsiona el centro
  del equilibrio.** Cazado en pruebas antes de publicar: pesaba como los
  133 juntos.
- **Tras el reinicio de temporada la ventana de 3 días viene vacía unos
  días y la app usa la de 7 sola.** Pasó el 19 de septiembre: la de 3 días
  de Gloria trajo héroes al 100% y la guarda la descartó, como estaba
  previsto; el Diagnóstico lo dice («ventana de 7 días porque la de 3 no
  vale»). Es normal durante la primera semana de cada temporada. Una prueba
  que daba por hecho que la de 3 siempre entraría habría parado el
  despliegue por un dato legítimo; ya no.
- El script de ajuste (`scripts/ajustar-modelo.mjs`) mide el término nuevo
  y el bot lo repite cada lunes; la prueba de la escala exige además que el
  equilibrio siga mejorando la validación cruzada, y avisa si deja de
  hacerlo.

## 3.3.0

- La tier list de mlbb.gg sale en la app, al lado del winrate: una letra
  (SS, S, A, B, C, D) en cada tarjeta y en la pantalla Meta. Se busca en
  internet una tier list que se pudiera PEDIR en vez de copiar, y la de
  mlbb.gg se puede: la baja el bot con los datos. Es opinión curada, y se
  guarda como tal: se enseña para que puedas comparar y **no cuenta en la
  nota**. Está medido por qué: solo coincide con los datos en la cima (SS,
  53,9% de winrate medio), de S para abajo no distingue nada (S 50,3%, A/B/C/D
  entre 48,0% y 49,5%), y sabiendo el winrate la tier no dice nada de hacia
  dónde va un héroe (−0,045 puntos por escalón ± 0,015). Donde discrepan es
  sistemático: Fanny y Granger en S ganando el 40–42%, Argus y Dyrroth en C/D
  ganando el 52–54%. La tier mide «techo en buenas manos»; el winrate, «qué
  gana en Gloria». Tu techo de verdad ya lo pone tu maestría.
- Masha y Bruno llevan tags nuevos, leídos de sus habilidades tras el
  rework del parche 2.2.16 (Temporada 42): Masha ya no tiene anticuración y
  sí tres barras de vida, un salto y un aturdimiento; Bruno ya no es
  inmóvil y tiene un deslizamiento que aturde. Con la matriz de cruces al
  100% eso no cambia ningún counter; cambia el consejo de composición y el
  texto de los motivos.
- El aviso de héroes reworkeados de 3.1.0 no los vio: Moonton les
  reescribió las habilidades y les dejó la misma speciality y el mismo tipo
  de daño. Ahora la huella lleva también el texto de las habilidades (sin
  las cifras, para que un reequilibrio de números no la mueva), y el
  próximo rework así sí saltará.
- Y los datos de hoy ya llevan la ventana de 3 días de la 3.2.0: la app la
  está usando desde este despliegue, no desde la próxima descarga del bot.

## 3.2.0

- La app reacciona a un parche en tres días en vez de siete. La fuerza de
  cada héroe (el primer término de la nota, el que hace de tier list) sale
  ahora del winrate de los **últimos 3 días** en tu rango, no de los últimos
  7. Los cruces y las parejas siguen a 7 días. Está medido con la misma ruta
  y la misma población (`/api/heroes/rank` admite 1, 3, 7, 15 y 30 días): la
  ventana de 3 días dice lo mismo que la de 7 cuando no hay parche (r =
  0,997, diferencia mediana 0,18 puntos, 14 de los 15 primeros coinciden) y
  el ruido queda doce veces por debajo de la dispersión entre héroes. La de 1
  día NO vale (héroes al 0% y al 100%, r = 0,09) y por eso no se usa. Si
  algún día la de 3 viene igual de rara (temporada recién empezada, API a
  medias), la app vuelve sola a la de 7 y el Diagnóstico dice por qué.
  Hasta que el bot de datos pase, la app sigue con 7 días: no cambia nada
  hasta la siguiente descarga.
- Nueva pantalla **Meta** en Ajustes: la tier list que la app usa de verdad,
  por línea y con la tuya primero, en el mismo orden con el que empuja las
  tarjetas, con el winrate, el pick y el ban de cada héroe y cuánto se ha
  movido en los últimos 3 días respecto a la semana. No es otra fuente ni
  cambia la nota: es para que puedas compararla con la tier list que leas
  por ahí en vez de fiarte. Se buscó una tier list publicada que se pudiera
  pedir y no existe: la de la propia API está retirada en origen y mlbb.gg no
  la publica. Copiar una a mano envejece en días y no se puede medir.

## 3.1.0

- El Diagnóstico avisa cuando Moonton le rehace las habilidades a un héroe.
  Hasta ahora, un héroe reworkeado se quedaba con las etiquetas que alguien
  le escribió a mano para su kit anterior, y nadie se enteraba nunca: el
  aviso de «héroes sin tags propios» solo veía a los que FALTAN del catálogo.
  El catálogo guarda ahora la huella del kit (de qué pega y cómo lo etiqueta
  Moonton) con la que se escribieron sus tags; si deja de cuadrar, lo dice el
  Diagnóstico y el bot de los lunes abre una incidencia. No se le inventan
  etiquetas nuevas: eso lo mira una persona. Con la matriz de cruces al 100%
  un tag desfasado no decide ningún counter, pero sí ensucia el consejo de
  composición y el texto de los motivos.
  El aviso está calibrado para no dar la lata: entre el 7 y el 16 de
  septiembre cuatro héroes cambiaron su recuento de habilidades (Argus, Aulus,
  Bruno, Balmond) y otros cuatro de línea, y no habría saltado con ninguno.
- La pantalla del Veredicto vuelve a tener quien la vigile. Las tres reglas
  que la hacen honesta —el margen en la misma frase que la diferencia, no
  afirmar nada mientras la diferencia quepa en el margen, y decir que no está
  aleatorizado— tenían una prueba desde 1.17.0 y la reescritura de 3.0 la
  perdió por el camino. Con once partidas el margen es de ±29 puntos, así que
  el número sin el margen no dice nada.
- `npm run test:ui` ya no da un rojo falso cuando se te olvida compilar. Antes
  fallaba la prueba de las novedades diciendo que el CHANGELOG no cuadra;
  ahora dice «compila antes» y no gasta el tiempo de las demás.

## 3.0.1

- La línea «Pro» de las tarjetas contará tres partidas más: Liquipedia
  escribe a Dyrroth como «dyr» y ese nombre no se reconocía, así que esas
  partidas se descartaban enteras. Lo avisó el propio diagnóstico. El alias
  se comprobó contra el catálogo antes de escribirlo: «dyr» solo puede ser
  Dyrroth, y un alias adivinado mete al héroe de al lado, que es peor que
  perder la partida.

## 3.0.0

- La app está reescrita de arriba abajo con la misma cabeza: el motor de
  2.0 (la probabilidad de ganar el draft con cada pick, medida contra 902
  partidas profesionales), los mismos datos, las mismas claves guardadas en
  el móvil y las mismas pantallas. Nada de lo que sabía se ha perdido: un
  arnés comparó 2.0.2 con 3.0.0 en 2.000 drafts de las cinco líneas (nº1,
  probabilidad, motivos, empate, rival, simulación, composición, consejo a
  los compañeros, análisis, baneos y siguiente baneo) sin una sola
  diferencia, y el informe del diagnóstico sale letra por letra igual.
- Lo que cambia por dentro, y por qué te importa: un solo «cerebro»
  (`src/motor/draft.js`) del que beben la app, el botón Diagnóstico, el
  diagnóstico del bot y las pruebas, así que ya no puede haber un montaje de
  datos en la app y otro distinto en la vigilancia. El motor está partido en
  módulos de una responsabilidad (nombres, catálogo, matrices, maestría,
  modelo, ranking, baneos, líneas, robustez, equipo, análisis, composición,
  builds, alias, registro, perfil, diagnóstico) y la interfaz en pantallas,
  componentes con nombre propio y hooks de estado con una sola capa de
  persistencia.
- Las pruebas cambian de forma: un fichero por módulo bajo `pruebas/`, un
  arnés propio que espera las asíncronas, ESLint dentro de `npm test` (un
  identificador que no existe ya no llega a publicarse) y, por primera vez,
  las pruebas de navegador viven en el repositorio (`npm run test:ui`, y en
  GitHub con el Chrome del runner): fases, hojas, foco, botón atrás, chips
  estables, idioma inglés sin fugas, novedades y la tarjeta nº1 en la primera
  pantalla en 390×844 y 430×932.
- Los guardarraíles ya no llevan listas fijas: el de orden de declaraciones
  y el de CSS recorren toda la interfaz, la prueba de claves de idioma
  recorre todos los componentes y el motor, y hay pruebas de forma (el motor
  no importa de la app ni de React, sin ciclos, sin ficheros con el mismo
  nombre).
- La ingesta está partida en módulos bajo `scripts/ingesta/` y
  `scripts/ingest.mjs` es la entrada de siempre: los bots la llaman igual.
- Para quien usa la app: nada cambia de sitio ni de número. Si algo se ve
  distinto, es un fallo y el Diagnóstico lo debería cantar.

## 2.0.2

- La vigilancia automática volvía a funcionar: se caía al final por un
  import que se quitó en 2.0.0 (`matchup` en `diagnostico.mjs`), y abría una
  incidencia con la app publicada en perfecto estado. Ahora `npm test`
  ejecuta el diagnóstico entero contra los datos del repositorio y mira su
  código de salida.

## 2.0.1

- El diagnóstico ya no avisa de que «la escala no encaja» con una medición
  hecha por el bot con el modelo anterior: la medición guarda con qué escala
  se hizo y solo se compara si es la actual. Y la medición publicada se
  rehízo con el modelo de 2.0 (pendiente 1,00 ± 0,28 sobre 902 partidas).

## 2.0.0

- La app ordena los picks por la probabilidad de ganar el draft que resulta,
  y esa probabilidad sale de un único modelo medido contra 902 partidas
  profesionales con resultado (validación cruzada). Cada tarjeta enseña esa
  probabilidad y de dónde sale, en puntos por término: héroes, cruces,
  parejas, tú y lo que falta por ver. Antes había cinco componentes
  reescalados dentro del pool y sumados con pesos escritos a mano
  (0.22/0.40/0.15/0.08/0.15) que nunca se midieron contra un resultado; el
  nº1 cambia respecto a 1.x en el 44% de los drafts de roam.
- La probabilidad ya no exagera: la estimación de 1.28–1.41 daba un error
  (Brier) de 0.2510, peor que una moneda; con la escala medida (0.44 ± 0.12)
  baja a 0.2435 fuera de muestra. El bloque aparte de «probabilidad de ganar»
  desaparece: es la cifra de cada tarjeta.
- El rival de línea ya no pesa doble (medido en las partidas pro: el cruce de
  línea no vale más que los otros veinte) y los huecos de composición por
  etiqueta ya no puntúan (0,00 ± 0,07 por hueco): se siguen diciendo, no se
  suman. Sin castigo por «pick castigable a ciegas»: lo que falta por salir
  entra como la esperanza del cruce contra lo que se juega en cada línea
  abierta, ponderado por pickrate, y el aviso sigue como aviso.
- Los baneos sugeridos se ordenan por lo que te quitan: la probabilidad que
  pierdes si sale ese héroe, por lo que sale cuando no está baneado. Cada
  fila dice cuántos puntos te quita.
- Tu maestría sigue sustituyendo al winrate público del héroe, ahora también
  sin datos de la API (referencia 50%), y las reglas por etiqueta solo entran
  con un héroe sin cruces, a la misma equivalencia que en 1.x.
- Nuevo `scripts/ajustar-modelo.mjs`: mide qué coeficiente sale para cada
  término sobre las partidas pro, con validación cruzada; el bot de los
  lunes lo escribe al log y el diagnóstico avisa si la escala deja de encajar.

## 1.41.1

- La línea «Pro» de las tarjetas cuenta más partidas profesionales: 90 del
  corpus (el 6%, 21 de ellas en la ventana actual) llevaban alguna de diez
  abreviaturas de Liquipedia («bene», «yu», «teriz», «paqui», «minsi»…) que
  no se reconocían y descartaban la partida entera. Cada una es prefijo de un solo
  héroe del catálogo, y hay una prueba que lo exige para todo alias: si
  Moonton saca un héroe que la vuelva ambigua, la prueba lo dirá.
- Un hueco vacío del draft («none» en Liquipedia) ya no sale como «nombre
  sin reconocer» en el diagnóstico.

## 1.41.0

- Los baneos sugeridos DENTRO del selector ya no se mueven al tocar uno: el
  tocado se queda marcado en su sitio y el siguiente entra por el final, como
  los de fuera. Antes desaparecía y el siguiente ocupaba su hueco, y un doble
  toque baneaba a dos. Con los diez marcados, el resto se apaga.
- Un nombre guardado que ya no existe (un héroe renombrado por la API, un
  draft de antes de un cambio de catálogo) se quita solo del draft en cuanto
  llega el catálogo. Antes era invisible, no se podía quitar, contaba como
  cogido y dejaba un hueco de más; y el selector no tenía tope, así que se
  podían guardar seis enemigos.
- Las hojas (selector, maestría, partidas, diagnóstico, perfil…) reciben el
  foco al abrirse y lo devuelven al botón que las abrió al cerrar, y el pie se
  abre también con Enter o espacio. Con teclado o lector de pantalla el foco
  se quedaba detrás del overlay.
- «DM»/«DF» en las builds, el «% WR» de las tarjetas y el 50,0 de ejemplo de
  la maestría pasan por el idioma elegido; en inglés salen «MD»/«PD» y
  «50.0». La cabecera dice siempre tu línea (ya no puede salir «Pick Assist»)
  y el umbral de «datos viejos» (36 h) está en un solo sitio.

## 1.40.1

- Cinco guardas que no vigilaban, arregladas y comprobadas rompiéndolas: la
  regla «nada esencial oculto en móvil» llevaba muerta desde que se
  escribió (su expresión no casaba con nada); el control de orden no veía
  las declaraciones desestructuradas, que son las de React; los bots
  acababan en verde aunque el push fallara tres veces; el filtro de la
  ingesta aceptaba la corrida si el fichero guardado era ilegible; y el
  peso doble del rival de línea se podía cambiar sin que ninguna prueba se
  enterara.
- La ingesta no cambia a una ruta de cruces vacía por un fallo suelto al
  sondear (antes «0 pares» ganaba a «error»), conserva la speciality de la
  corrida anterior si la ficha falla, cuenta con tope de tiempo cada
  descarga de imagen y cada consulta a Liquipedia, y no se traga un flag
  como valor de otro (`--out --iconos`).
- Las partidas profesionales se fechan en UTC (desde un móvil en otra zona
  salía un día menos y la misma partida entraba dos veces), una plantilla
  anidada ya no descarta la partida, un lote truncado por la API deja
  rastro, y `pro.json` no cambia cada día por la fecha de la ventana.
- `npm run diagnostico` desde el móvil apunta a la web actual (llevaba la
  URL del repositorio antiguo) y el detalle de la ingesta guarda los fallos
  de descarga aunque haya datos previos.

## 1.40.0

- El Veredicto de tus partidas ya puede moverse. La referencia («tu winrate
  de siempre») llevaba dentro las mismas partidas que se comparaban contra
  ella, así que para cualquier héroe sin maestría escrita a mano la
  diferencia salía siempre +0,0 y «faltan unas Infinity partidas». Ahora la
  referencia es tu maestría a mano más las partidas de tu historial, nunca
  las jugadas con la app.
- El winrate público ya no empata a los héroes de las colas: con el recorte
  a ±6 puntos, Marcel al 59,1% valía lo mismo que Masha al 57,7%, y eso
  cambiaba el nº1 en el 14% de los drafts de roam.
- El análisis no repite la misma frase dos veces («os falta inicio» y «no
  tapas inicio» salían juntas en el 15% de los drafts) y así deja sitio a
  las que sí aportan.
- El aviso «la estimación acierta menos que una moneda» lleva margen: sin
  él saltaba un tercio de las veces con un modelo perfecto y 20 partidas.
- Un código de perfil malformado ya no envenena nada: partidas con fecha
  inválida, estimación fuera de rango o resultado no booleano se descartan o
  se corrigen, y una maestría con «500» como texto vale 500. Las dos grafías
  de un héroe («X.Borg» y «X Borg») suman en la maestría del registro.
- El diagnóstico dice qué nombres de tu maestría no casan con el catálogo
  (antes solo miraba el primero) y no abre incidencia cuando las partidas
  profesionales aún no dan 30 usables. Los héroes recién salidos (sin
  cruces) quedan descontados también en la sinergia por etiquetas y en la
  tabla de peligro de los baneos; el aviso de defensa no se calla por los 15
  de armadura de Immortality.

## 1.39.0

- Tu maestría pesa según la evidencia que hay detrás. Cinco partidas al 90%
  y mil al 70% daban la misma contribución (el peso entero) y apuntar una
  partida más cambiaba el nº1 en el 44% de los drafts: la reescala del
  ranking se comía el encogimiento. Ahora la maestría entra con su escala
  propia, centrada en tu nivel y medida en tu propia dispersión: con pocas
  partidas casi no mueve, con cientos mueve de verdad.
- El winrate público ya no se encoge por una muestra inventada. Se midió el
  ruido real entre catorce corridas de datos: es de dos milésimas frente a
  tres puntos de diferencia entre héroes. Un héroe raro al 57,7% se trataba
  como un 50,5%; ahora vale lo que dice. Cambia el nº1 en el 30% de los
  drafts de roam.
- La probabilidad estimada ya no favorece al equipo que lleva más héroes en
  pantalla: las parejas se centran en las que pueden ir juntas (líneas
  distintas). Medido con equipos reales, 1 contra 5 daba 46% y 5 contra 1,
  53%; ahora 51% y 49%.
- El consejo para los compañeros ya no pone a un aliado flexible en tu
  línea ni aconseja una línea que ese aliado ya cubre (pasaba en 132 de 400
  drafts jugando exp; ahora en 23).
- La ingesta funde la matriz de cruces héroe a héroe con la guardada y solo
  fecha la corrida como nueva si la matriz también se descargó; el
  comparador rechaza una corrida que la conservó. Antes, con la ruta de
  counters caída, salían los cruces de hace semanas con la fecha de hoy.
- El prior de la maestría ya no salta cuando un héroe llega a 30 partidas,
  y los ajustes avisan cuando eliges un rango distinto del de los cruces.

## 1.38.0

- Tu recomendación nº1 vuelve a caber en la primera pantalla del móvil. La
  probabilidad estimada ocupa la mitad (cifra, barra y una línea con el
  aviso; el desglose, plegado) y el consejo para los compañeros va después
  de tu nº1, no antes. Medido en 390×844: la tarjeta pasa de asomar 156 px
  a verse entera en todas las fases del draft.
- El botón atrás de Android y la tecla Escape cierran cualquier hoja
  (selector, maestría, partidas, perfil, diagnóstico, novedades, objetos,
  línea). Instalada como app, atrás con una hoja abierta salía de la app en
  mitad del draft.
- En la fase de baneos los chips no se desplazan al tocar: el tocado se
  queda en su sitio, tachado, y el candidato nuevo entra por el final. Un
  segundo toque en el tachado lo quita. Antes el siguiente ocupaba justo el
  hueco del tocado y un doble toque baneaba a dos.
- Buscando un héroe, Intro elige el que EMPIEZA por lo escrito («la» daba
  Angela; ahora Lancelot, Layla o Lapu-Lapu según lo jugados que estén).
- Las caras vuelven cuando los datos llegan después del catálogo (antes una
  imagen fallida no se reintentaba en toda la sesión), la fila de maestría
  no salta de sitio al escribir, el Veredicto se desplaza con la lista de
  partidas, y con «Ajustes» abierto en un móvil pequeño la lista de
  recomendaciones ya no desaparece.
- Una actualización de la app espera a que cierres la hoja que tengas
  abierta (antes recargaba con la maestría a medias de teclear) y no
  recarga en la primera instalación.
- Plurales bien en los dos idiomas («1 línea abierta», «falta 1 partida»),
  listas con «y», la frase del hueco sin tapar con texto propio, el idioma
  se puede cambiar desde la pantalla de elegir línea, el detalle del pie y
  la pantalla de fallo de arranque en los dos idiomas, la leyenda explica
  qué es «Pro», y botones de 40 px donde se toca con la partida delante.

## 1.37.0

- La vigilancia comprueba qué versión sirve de verdad la web publicada. Tras
  cada despliegue pide `version.json` sin caché y, si no es la que se acaba
  de subir, abre incidencia; en las corridas programadas lo deja en aviso.
  Antes el historial de salud decía «vigilancia» como versión en todas las
  filas y un despliegue que no llegaba a publicarse era invisible.
- La vigilancia solo corre tras despliegues que han publicado, no tras los
  cancelados o fallidos (que miraban la versión anterior, sana, y cerraban
  la incidencia abierta), y cada corrida escribe su fila del historial una
  sola vez, sin volver a ejecutar el diagnóstico.
- El filtro de la ingesta compara los recuentos de tamaño conocido (héroes,
  líneas, roles, daño, cruces, parejas) también con el máximo visto en el
  historial de salud: comparar solo con la corrida anterior era un trinquete
  hacia abajo, diez corridas perdiendo un 9% cada una habrían dejado los
  cruces en el 39% sin que saltara nada.
- Todos los trabajos de GitHub llevan tope de tiempo; el despliegue ejecuta
  `npm test` en vez de su propia lista de pruebas; las guardas de los
  workflows exigen que la comparación sea un comando y que el tope de
  antigüedad no pase de 72 h; `check-order` vigila también `let`. Cada
  guarda nueva se rompió a propósito antes de fiarse de ella.
- La ingesta guarda la «speciality» de Moonton de los 133 héroes y las
  tablas de deducción se regeneran de ahí, sin 133 peticiones ni una ruta
  escrita a mano; las imágenes de una corrida descartada ya no llegan a la
  web; las partidas profesionales solo cambian de fecha si hay partidas
  nuevas; el bot de datos no se solapa consigo mismo; el diagnóstico usa las
  mismas escalas que el motor; README al día con las dos fases del draft.

## 1.36.1

- En «Para tus compañeros» los motivos salen con su signo, ✓ y ✗, como en
  las tarjetas, y con lo bueno delante. Antes se cogía el primer motivo sin
  mirar el signo y salía «X.Borg: pierde contra Selena» como si esa fuera la
  razón para cogerlo: el nº1 de una línea puede perder un cruce y seguir
  siendo el mejor total del pool contra los cinco.

## 1.36.0

- Cada partida que apuntas guarda los baneos que había en el draft, y el
  «siguiente baneo probable» aprende de ellos: con baneos ya marcados, sube
  lo que en tus partidas ha caído junto a ellos. Sin historial manda la tasa
  de ban de tu rango, como antes, y el ajuste es continuo: una partida suelta
  mueve poco. El diagnóstico dice cuántas partidas llevan baneos apuntados.
  Los baneos viajan dentro del código del perfil al cambiar de dispositivo.

## 1.35.0

- En la fase de baneos la app te enseña el siguiente baneo probable para
  tocarlo en vez de escribirlo. Bajo los diez huecos hay ocho fichas con
  los héroes más baneados de tu rango que aún no están marcados, con su
  tasa de ban; al tocar una, se banea y entra el siguiente. El selector
  enseña la misma lista, con diez. Es la tasa de ban de la API por rango,
  que es por partida: los ocho primeros pasan del 50%. Se midió si la
  co-ocurrencia entre baneos (con las partidas profesionales) añadía algo
  y no se aplica: los profesionales banean otra cosa que Gloria.
- En el móvil los diez baneos van en dos filas de cinco. En una sola fila
  cada hueco quedaba en 28 px, la × se salía del hueco y pisaba al vecino, y
  la pantalla se movía de lado 8 px. Y con los diez marcados ya no se ofrece
  un undécimo.

## 1.34.0

- La app aconseja también qué pueden coger tus compañeros. Con algún enemigo
  a la vista, bajo la estimación aparece «Para tus compañeros», plegado:
  para cada línea que tu equipo aún no cubre, tres opciones contra ese
  equipo, con su rival de línea y el porqué de la primera. Es el mismo motor
  que decide tu pick, contigo ya dentro (tu nº1) y sin maestría, porque no
  sabemos con qué es bueno cada compañero. Toca una opción cuando un
  compañero la coja y entra en tu equipo.

## 1.33.0

- El draft va en dos fases, sin mezclar: primero los baneos, después los
  picks. La app arranca en la fase de baneos, sola en pantalla, con los diez
  huecos, el buscador multi-toque, los baneos que merecen la pena y un único
  botón dorado, «Ir a los picks». En la fase de picks los baneos quedan en
  una tira arriba, con sus caras y «Cambiar» para volver. Antes vivían
  dentro de «Baneos y ajustes» y con el draft corriendo costaba encontrar
  el botón. «Nuevo draft» vuelve a la fase de baneos.
- Un draft guardado antes de esta versión con picks metidos sigue en la
  fase de picks: no se pierde nada al actualizar.

## 1.32.5

- Dos guardarraíles que se dejaban engañar, reforzados. Se rompieron a
  propósito siete cosas que las pruebas dicen vigilar y tres pasaron sin
  ruido: un error de programación dentro de un endpoint de la ingesta (con
  la API caída esa ruta ni se ejecuta y en producción se tapa conservando lo
  anterior), las caras de los héroes metidas en la precarga del instalador
  (2,5 MB que la prueba no miraba porque solo buscaba png) y la regla de
  caché de imágenes borrada (la prueba se conformaba con una palabra en un
  comentario). Ahora la ingesta entera corre en las pruebas contra una API
  simulada en local y se comprueba que lo que sale es lo que sirvió, y la
  prueba del instalador compila de verdad y mira el `sw.js` que se publica.
- `npm test` tarda unos 15 segundos más por eso (compilar y la ingesta
  simulada).

## 1.32.4

- El análisis ya no dice «frágil 0%» de tu nº1 justo después de un toque.
  La simulación de finales va un paso por detrás del ranking para no
  bloquear la pantalla, y en ese paso podía cruzar la cuota del draft
  anterior con el nº1 nuevo. Ahora la simulación lleva la marca del draft
  para el que se hizo y el análisis se calla hasta que la tiene.
- Una prueba comprueba que toda clave de texto que usan la pantalla y el
  motor existe en los dos idiomas. Antes solo se comprobaban las reglas,
  y una clave mal escrita en la interfaz salía tal cual en pantalla.

## 1.32.3

- Los despliegues y las corridas de los bots tardan unos cuatro minutos
  menos: las dependencias se guardan enteras entre corridas y solo se
  reinstalan cuando cambia el lockfile. Antes cada corrida las instalaba de
  cero (3,7–4,7 minutos medidos, incluso con la caché de descargas de
  1.32.1). Hay una prueba de que todos los workflows que instalan llevan
  esa caché y no la pisan.

## 1.32.2

- El diagnóstico avisa si las partidas profesionales llegan sin la medición
  del motor. El bot semanal escribe `pro.json` y añade la medida después; si
  ese paso fallaba, el fichero salía sin ella y la línea «Estimación contra
  N partidas pro» desaparecía sin que nada lo dijera. Ahora, con 30 partidas
  o más y sin medición, es un fallo del diagnóstico y la vigilancia abre
  incidencia.

## 1.32.1

- Lo guardado en el móvil (maestría y partidas) se sanea al cargar, igual
  que un perfil importado: una entrada con la forma rota ya no puede dejar
  la pantalla de partidas en blanco. Los datos válidos quedan intactos, y
  hay una prueba de que así es.
- Publicar tarda menos: los workflows guardan la caché de npm (un `npm ci`
  llegó a costar siete minutos de un despliegue de ocho).
- La prueba que vigila que la simulación de finales predice algo ya no
  puede fallar por mala suerte con los datos del día: pasa de 150 a 300
  drafts y de una razón al filo a una diferencia con margen. Corre en cada
  despliegue, así que un fallo suyo bloqueaba el código sin motivo.

## 1.32.0

- **Los baneos sugeridos miran el cruce real contra tus aliados**, no una
  tabla de etiquetas. La tabla decía «salta encima de Melissa» o «revienta a
  Layla» sin comprobar nada: medido sobre 200 aliados al azar, en el 47% de
  las veces que se disparaba el cruce real iba en contra del supuesto
  peligro, y solo en el 12% era una ventaja destacable. Ahora cada candidato
  a baneo puntúa por lo que de verdad le gana a tus aliados, y el motivo
  dice el porcentaje: «le gana el cruce a Melissa (56%)». Cambia el primer
  baneo sugerido en dos de cada tres drafts. La tabla se queda solo para
  héroes tan nuevos que no tienen cruces.

## 1.31.3

- La simulación de «¿aguanta el pick?» usa un generador de números sin
  sesgo. El anterior tenía correlación entre extracciones seguidas y, medido
  con datos sintéticos, desplazaba de forma sistemática lo que se estima
  con él. El porcentaje de la frase puede moverse unos puntos respecto a
  ayer; es el ruido normal de 60 finales simulados, no un cambio del motor.
- Medido el peso doble del cruce contra el rival de línea, con 532 partidas
  profesionales: no lo respalda (la señal de los cruces está en los veinte
  que no son de línea). No se cambia todavía, porque son partidas de cinco
  coordinados y la muestra aún no separa cero de uno; queda documentado y
  el bot lo mide cada semana.

## 1.31.2

- Las partidas profesionales ya no se cuentan dos veces. Liquipedia lista
  algunas subpáginas de torneo (una fase de clasificación) también como
  torneo, y sus partidas entraban por las dos vías: 20 de las 304 recientes
  estaban repetidas en la línea «Pro» de las tarjetas y en la medida del
  motor. Ahora una partida es su contenido (fecha, equipos, picks y
  duración), venga de la página que venga.

## 1.31.1

- La fecha de los datos ya no miente cuando la API está caída. Una corrida
  sin red conserva los datos anteriores (eso está bien) pero salía fechada
  hoy, pasaba el comparador y habría engañado para siempre a la puerta de
  frescura del despliegue. Ahora conserva también la fecha, dice que ha
  conservado, y el comparador rechaza una corrida que no ha descargado el
  rango pedido.

## 1.31.0

- **Repaso general de la app, el motor y los bots.** Lo visible que estaba
  escrito en español a mano (pie, botones del diagnóstico) ya se traduce; el
  título es tu línea y no siempre «Roam»; la parte baja de la página ya no
  queda tapada por el pie en el móvil; los huecos de baneo enseñan «+» en
  vez de diez «Añad…» cortados; la × y el marcador de rival tienen área de
  toque de 40 puntos; los nombres largos ya no se cortan en el selector.
- **Baneos sin teclado saltando.** El buscador se enfocaba de nuevo con
  cada baneo y el teclado tapaba la rejilla. Ahora se enfoca una vez.
- **Los motivos de cada tarjeta se eligen después de quitar los comunes**,
  no antes: las tarjetas con menos de tres motivos bajan de 6.917 a 4.462
  de cada 10.087. Y «castigable a ciegas» es un solo criterio para la
  tarjeta y para el análisis.
- **Sin aliados, la composición no decide.** Con el equipo vacío premiaba
  solo acumular etiquetas, con el peso entero y sin motivo en la tarjeta.
  Cambia el nº1 en el 22% de los drafts vacíos, a favor del dato.
- **Tu maestría escrita como «X.Borg» le sirve al héroe «X Borg»**: por un
  punto, cientos de partidas desaparecían del ranking sin aviso.
- **Importar un perfil ya no duplica partidas corregidas** ni acepta
  códigos con la forma rota; una fila de maestría con errata conserva el
  valor anterior en vez de borrarlo.
- **Los bots**: el de datos hace rebase antes del push (se perdía la corrida
  si la vigilancia había movido `main`), guarda los retratos nuevos, y la
  ingesta vuelve a conservar lo anterior cuando falla un endpoint (leía el
  «anterior» del fichero temporal, que no existe). La vigilancia ya detecta
  un `npm test` en rojo. Un bot que descarta su corrida ya no redespliega.

## 1.30.0

- **Novedades dentro de la app.** Toca la versión del pie y salen los
  últimos cambios, resumidos por versión, con «ver todo» para el porqué. Se
  leen de este mismo fichero al compilar, así que van en el móvil sin red y
  no pueden desincronizarse de la versión que usas.
- El bot de partidas profesionales reconoce dos abreviaturas más (`fred`,
  `bal`), su medida ya no falla por un argumento mal leído, y su push
  vuelve a publicar la app, que hasta ahora no ocurría.

## 1.29.1

- El bot de partidas profesionales reconoce once abreviaturas más de
  Liquipedia (`guin`, `yz`, `melis`, `paq`...) que descartaban 71 de las
  304 partidas recientes, y ya no pierde su corrida si alguien sube código
  mientras lee.
- La medida del motor contra las partidas profesionales viaja dentro de los
  datos y el diagnóstico la enseña: con 233 partidas de 2026, la estimación
  acierta el 57,5% (AUC 0,61) y su escala sale algo optimista (pendiente
  0,62 ± 0,23). Con ese margen todavía no se toca.

## 1.29.0

- **Partidas profesionales de verdad, con resultado.** Un bot semanal lee de
  Liquipedia (CC-BY-SA 3.0) cada partida de los torneos S y A (MPL, MSC,
  M-Series...): los cinco picks de cada equipo, los baneos, el lado y quién
  ganó. Es lo que hace falta para medir el motor contra la realidad, y
  `scripts/medir-pro.mjs` lo hace término a término.
- **Lo que hacen los profesionales con cada héroe**, en su tarjeta: «Pro:
  84 picks · 54% · 35 bans» en los torneos de los últimos cuatro meses. Es
  dato, y se lee distinto que el winrate de tu rango: un héroe muy baneado
  en pro es fuerte aunque su winrate público sea del montón.
- El diagnóstico tiene sección PROFESIONAL: cuántas partidas, de cuándo, y
  si algún nombre de Liquipedia se ha quedado sin reconocer.
- Lo medido ya con 164 partidas de MPL Indonesia (un año antes que los datos
  actuales): el modelo completo no se distingue del azar, los cruces son el
  único término con señal y el de héroes no tiene ninguna en pro. Con tan
  pocas partidas y de otro parche no se cambia nada: hacen falta miles de la
  misma época, y para eso está el bot.

## 1.28.0

- **Probabilidad estimada de ganar.** Debajo del análisis sale «55% con
  Marcel» con su barra y de dónde viene: héroes, cruces, parejas y tú (tu
  maestría con ese héroe). Es un modelo aditivo sobre los winrates públicos
  de tu rango, no una promesa, y la app lo dice al lado del número. Cada
  partida que apuntes guarda la estimación que tenía delante, y «Partidas»
  compara lo previsto con lo que pasó: con 20 apuntadas te dice si el modelo
  acierta más que una moneda.
- **Qué tiene y qué le falta a cada equipo.** Una tira bajo el draft con el
  daño de cada lado (físico / mágico / mixto) y si hay primera línea,
  control, inicio y peel, para los dos equipos. El análisis lo dice en
  palabras: «a tu equipo le faltaba primera línea: Marcel lo tapa», «ellos
  van sin primera línea», y avisa si llevaríais dos del mismo rol (dos magos
  pierden 4 puntos de sinergia: medido en las parejas, no supuesto).
- **Banear en la mitad de toques.** El selector de baneos ya no se cierra
  con cada héroe: tocas los que quieras, se marcan, y «Listo». Arriba salen
  los que merece la pena banear, la rejilla va ordenada por tasa de ban y
  cada héroe lleva su cara. Tocar un baneado lo quita. Y en todos los
  selectores, Intro coge el primero de la lista: tres letras y Intro.

## 1.27.1

- La simulación de «¿aguanta el pick?» ya respeta los baneos: un héroe
  baneado no puede salir por ninguna línea enemiga ni cuenta como candidato
  tuyo. Antes, con el líder baneado, la simulación le seguía dando sus votos
  y llamaba «depende de lo que saquen» a un pick que en realidad era seguro.
- Si tu línea aún no tiene rival visible, el que sale por ella en cada final
  simulado cuenta como tu rival (su cruce pesa doble, como en el ranking
  real). Medido: cuando la app dice «pick seguro», acierta más que antes.

## 1.27.0

**La app razona sobre los enemigos que todavía no han salido, y el diagnóstico
se compara con su propio pasado.**

- **«Pick seguro» o «depende de lo que saquen».** Con el draft a medias, la app
  sabe por qué líneas van a salir los que faltan (por eliminación) y quién se
  juega en cada una y cuánto. Simula 60 finales de draft plausibles y te dice en
  qué fracción de ellos tu nº1 sigue siéndolo. Está medido que eso predice: con
  dos enemigos vistos, si aguanta al menos la mitad de los finales sobrevive al
  draft completo el 58% de las veces; si no, el 27%. Con tres, 59% frente a 27%.
  Y con uno visto casi nada es seguro, que es la verdad: espera si puedes.
  **No cambia la recomendación** —medido, ordenar por la simulación solo ayuda
  con un enemigo visto y con dos o tres no aporta nada— la explica.
- **El diagnóstico te dice por qué gana el nº1 y no el nº2**: el margen en
  puntos y qué componente lo decide (contra Khufra, «lo decide counter +4,1,
  luego meta +1,2»). Es lo que hace falta para discutir una recomendación en vez
  de creérsela.
- **Detecta datos imposibles**: un winrate del 90%, cuotas de pick que no
  suman uno, tasas de ban por encima del 100%, filas de counters planas. La
  descarga conserva lo anterior cuando un endpoint falla, así que una API rota
  no se nota en la forma del fichero: se nota en los valores.
- **Y se compara con su propio historial**: las últimas corridas de la
  vigilancia viajan con la app, y el diagnóstico avisa si cruces, sinergias,
  objetos, builds o el pool de tu línea han caído respecto a la mediana de la
  serie. La holgura sale de la dispersión de la propia serie, no de un número
  puesto a mano.

## 1.26.0

**Cero rivales equivocados.** Al deducir quién es tu rival de línea, el peso de
«este rol es típico de esta línea» era la única de sus constantes que no estaba
en meseta al medirla: bajándolo, los rivales mal nombrados pasan de un 1,3–2,7%
a **0 en 1.600 drafts**, a cambio de callarse un punto más. Un rival mal
nombrado dobla su cruce y sale en el análisis como si fuera un hecho; callarse
no cuesta nada. Lo que decide ahora es casi solo en qué líneas dice la API que
se juega cada héroe, que es el dato.

## 1.25.0

**Publicar un cambio de código pasa de doce minutos a dos.** El despliegue
volvía a descargar todos los datos en cada push, y no hace falta: el bot ya lo
hace dos veces al día y los guarda en el repositorio, y un winrate de ventana
de siete días no se mueve en horas. Peor: como cada despliegue nuevo cancela al
anterior, cinco cambios seguidos dejaron la app publicada 25 minutos por detrás
de lo subido —cada uno reiniciaba desde cero la descarga del anterior—.

Ahora solo descarga si el repositorio lleva más de 24 horas sin datos nuevos, es
decir, si el bot lleva un día fallando. (Veinticuatro y no doce porque GitHub
ejecuta el cron del bot con tres a cinco horas de retraso, medido en todas sus
corridas: los datos del repositorio tienen normalmente entre 12 y 17 horas.) Y
cuando el propio bot trae datos frescos, el despliegue que dispara tampoco los
vuelve a pedir.

## 1.24.1

Corrección en el mantenimiento semanal: su descarga de datos se saltaba el
guardarraíl que ya tenían el despliegue y el bot de datos. No llegaba a
commitear nada malo, pero derivaba las tablas y pasaba las pruebas sobre lo que
saliera, y podía quedarse colgada. Ahora hace lo mismo que los otros dos:
descarga a un temporal, compara con lo guardado, usa lo nuevo solo si no
empeora, y tiene tope de 20 minutos. La prueba que vigila esto cubre ya los
tres workflows, no dos.

## 1.24.0

**El despliegue ya no puede quedarse colgado esperando a la API.** Se vio en
directo: una ingesta llevaba veinte minutos en un paso que normalmente tarda
nueve. La descarga hace unas 570 peticiones con 15 segundos de tope cada una,
así que con la API a medias puede tardar más de dos horas — y el despliegue se
quedaba ahí, aunque desde la 1.6.0 sabe publicar con los datos del repositorio
cuando la descarga falla. Ahora la ingesta tiene tope de 20 minutos en los dos
workflows, y pasarse cuenta como fallo: se publica con lo guardado y queda
avisado en el registro.

## 1.23.0

**El diagnóstico lleva ahora el draft que tienes delante, con nombres.** Desde
que los huecos del draft enseñan la cara y no el nombre, una captura de pantalla
ya no dice quién estaba enfrente: para investigar la derrota con Minotauro hubo
que reconstruir el draft a medias. Ahora, cuando algo salga raro, con pegar el
diagnóstico basta: línea, enemigos, tu equipo, baneos, quién es tu rival (y si lo
marcaste tú o lo dedujo la app), los tres primeros con su nota y sus motivos, y
lo que dijo el análisis.

## 1.22.0

**«Lo llevas al X%» se decide ahora con lo que la app cree de verdad, no con el
número bruto.** Tenía el criterio al revés: 20 partidas al 60% sacaban motivo —y
son 12 victorias contra 11 esperadas, o sea nada— mientras 300 partidas al 57%
no sacaban ninguno, siendo una señal real. La evidencia débil se enseñaba y la
fuerte no. Ahora decide el estimado encogido, que ya tiene en cuenta cuántas
partidas hay, y el corte fijo de 20 partidas desaparece. Lo que ves sigue siendo
lo que pasó: «60% en 20 partidas», y tú ya ves que son veinte.

De paso: comprobado que los datos viajan comprimidos al móvil (180 KB, no 786),
y CLAUDE.md dejaba pendientes 7 héroes sin tags que ya se escribieron hace
tiempo.

## 1.21.0

**Tu rival de línea se deduce mirando el draft entero, no a cada enemigo por
separado.** Es la primera vez que se mide cómo de bien lo hacía, y hacía falta:
su cruce pesa el doble y de él sale la frase principal del análisis.

Antes miraba a cada enemigo solo: «¿juega esta línea?». Ahora reparte a los
cinco entre las cinco líneas a la vez y se queda con el reparto que mejor
encaja, que es como lo lee cualquiera: si la jungla ya está cogida, el que juega
exp o jungla va a la exp.

Medido contra 2.000 drafts con la línea de cada enemigo conocida:

- **Draft completo**: acierta el rival de exp el **88%** (antes 60%), de jungla
  el **91%** (antes 69%), de roam el **94%** (antes 78%). Y con menos errores.
- **Draft a medias** (2-3 enemigos): antes **se equivocaba del 10% al 21%**,
  porque nombraba a un rival que todavía no había salido —te ponía al mid como
  si fuera tu exp— y le doblaba el cruce. Ahora del 4% al 6%, y en su lugar se
  calla, que es lo correcto cuando tu rival aún no está.

Cambia el número 1 en el **3%** de los drafts, casi todos a medias: son los
casos en que antes doblaba el cruce equivocado.

## 1.20.0

**Barrido de todas las constantes del motor, buscando las gemelas del fallo
anterior.** Aparecieron dos más, y ninguna cambia la recomendación —comprobado
en 400 drafts: mismo número 1, mismo top 8— pero las dos cambian lo que lees.

- **«Combina bien con X» casi nunca salía.** Mismo 0,53 escrito a mano, tercera
  vez, y en las parejas es el **percentil 99**: salía en el 1,3% de ellas. Las
  parejas tienen su propia distribución (p90 = 0,5100, no 0,5154 como los
  cruces), así que ahora tiene su propio número medido. Los motivos de sinergia
  pasan de 63 a 320 en 2.000 tarjetas.
- **«Lo llevas al X%» se medía contra un 55% fijo.** A ti, que ganas el 53,4%,
  un héroe al 55% te salía como si destacara siendo tu media exacta. Y a un
  jugador del 45% no se le reconocía **nunca** su mejor héroe, porque nunca
  llega al 55%. Ahora se mide contra tu nivel y con la dispersión que la app ya
  saca de tus propios datos. Es el mismo arreglo que ya se hizo en la *nota* de
  maestría y que se había quedado a medias en el *motivo*.

Y para que no vuelva a pasar: hay una prueba que **falla si aparece cualquier
umbral de cruce escrito a mano** en el motor. Los tres fallos de esta tanda eran
el mismo número copiado a tres sitios sin volver a medirlo.

## 1.19.0

**El análisis del draft estaba casi mudo, y era el mismo fallo de calibración.**
Lo destapó una partida perdida con Minotauro: la app sabía que ese pick perdía el
cruce contra Ixia —lo ponía en rojo en la tarjeta— pero el análisis de arriba,
que es lo primero que lees, no decía nada. Con un draft completo, cinco enemigos
y cuatro aliados, salía **una sola frase**.

La causa: para avisar de «cuidado con X» exigía un cruce por debajo del 47%, que
es el **percentil 1,6%** de los cruces reales. Prácticamente nunca se cumplía.
Ahora usa el mismo umbral calibrado que las tarjetas (el 10% de cruces más
marcados), así que el análisis y la tarjeta dicen lo mismo del mismo cruce.

Medido en 400 drafts con rival marcado:

- «Cuidado con X, es tu peor cruce» pasa de salir **5 veces a 35**.
- «Ganas el cruce contra tu rival» pasa de **68 a 205** — y desplaza a la frase
  que solo comparaba winrates globales, porque el cruce es mejor dato.
- Drafts sin ninguna frase: del **13% al 7%**.

## 1.18.0

**Arreglado un acantilado en «tu nivel».** Buscando por qué la app te había
recomendado Estes con Kadita enfrente salió esto: tu nivel se calculaba con un
corte en 100 partidas —por debajo, 50%; por encima, tu winrate entero—. Medido:
apuntar **una sola partida más** (de la 99 a la 100) cambiaba el héroe
recomendado en **54 de 200 drafts**. Nadie cambia de nivel entre la partida 99 y
la 100.

Ahora tu nivel se encoge hacia el 50% de forma continua, como todo lo demás en
la app. El salto máximo entre dos pasos baja de 54 a 7 de 200, y ya no está
concentrado en un punto.

Sobre Estes contra Kadita: **el dato no dice que sea mal pick**. Kadita es el
cruce número 31 de 132 más malos para Estes (49,0%); sus peores de verdad son
Ixia, Nolan y Beatrix. Y medí si los héroes inmóviles sufren de verdad contra
los que hacen dive: la diferencia media es de **menos de dos décimas de punto**,
y para Estes en concreto no se distingue del ruido. La app no lo pone arriba
contra Kadita sola —queda el 30 de 37—; si te salió, fue por el resto del draft
o por tu maestría.

## 1.17.0

**«¿Te está funcionando?»**, dentro de tus partidas. Es la única prueba que
significa algo, así que se enseña con las tres cosas que la hacen honesta:

- Tu winrate siguiendo la app, tu winrate de siempre, y **la diferencia con su
  margen al lado**. Hoy, con tus 11 partidas: +21,4 puntos ± 29,5.
- **Mientras el margen se coma la diferencia, la respuesta es «todavía no se
  sabe»**, no «parece que sí». Y te dice cuántas partidas faltan.
- Y la trampa, escrita: tú eliges cuándo hacer caso, así que esto no es un
  experimento controlado. Es la mejor señal que se puede sacar sin pedirte que
  ignores la app a propósito, pero no es una prueba.

Un 73% en once partidas es exactamente lo que parecería una racha normal. Si
algún día enseñas esto para convencer a alguien, enséñalo entero: el número sin
el margen es publicidad.

## 1.16.0

**Los motivos de cada tarjeta ahora están respaldados por el dato.** La
recomendación no cambia —comprobado en 400 drafts: mismo número 1, mismo top 8,
mismas puntuaciones—; lo que cambia es lo que la app te cuenta para
justificarla.

Había dos cosas mal:

- **«Ganas el cruce contra X» casi nunca salía.** El umbral estaba en el 53% de
  victorias, que suena razonable pero es el **percentil 99** de los cruces
  reales: solo lo alcanzaba el 1,6%. La distribución de verdad es mucho más
  estrecha (el 90% de los cruces está entre 48,5% y 51,5%). Ahora el umbral es
  esa cola, así que el motivo sale cuando el cruce destaca de verdad.
- **Los motivos por etiqueta se decían aunque el cruce los desmintiera.** Salía
  «bloquea los dashes de Fanny» aunque contra Fanny pierdas. Medido héroe a
  héroe, esas etiquetas casi nunca predicen lo que afirman: de los nueve héroes
  con «anti-movilidad» solo Phoveus estorba de verdad a los móviles. Ahora la
  etiqueta explica el porqué **solo cuando el cruce va en el mismo sentido**.

En 2.000 tarjetas simuladas: los motivos sacados de partidas reales pasan del
14,5% al 50,4%, los de etiqueta bajan del 46% al 24% —y los que quedan están
respaldados—, y las tarjetas sin ningún motivo bajan del 27% al 13%.

## 1.15.0

**La app se actualiza sola.** Antes el diagnóstico te decía «cierra la app y
vuelve a abrirla», que es pedirte a ti que hagas el trabajo. Ahora comprueba si
hay versión nueva al volver a la app y se recarga en cuanto está lista. No
pierdes nada al recargar: el draft, la maestría y las partidas se guardan en el
móvil en cada cambio.

El aviso de «estás usando una versión vieja» sigue ahí, porque si un día el
mecanismo falla hay que poder verlo — pero ya no debería salirte.

**Y el titular del diagnóstico ya no se contradice.** Decía «Todo correcto (1
avisos)»: afirmaba que estaba todo bien y a la vez que había algo que mirar, y
encima en plural. Ahora dice «Sin fallos, 1 aviso», o «2 FALLOS y 3 avisos», o
«Todo correcto» cuando de verdad lo está.

## 1.14.0

**Repaso a la pantalla. Y por el camino apareció por qué se había ido al garete:
todo el diseño de móvil llevaba tiempo sin aplicarse.**

Las reglas de móvil estaban escritas al principio de la hoja de estilos, y una
regla normal escrita después las pisa entera. Resultado: en el móvil estabas
viendo el diseño de escritorio —nombres a 24px, huecos de 84px— y nada fallaba.
Medido antes de moverlas: el hueco del draft pedía 0 de ancho mínimo y salía 84.
Ya están al final, donde tienen efecto, y hay una comprobación que impide que
vuelvan a colocarse mal.

Lo que se nota, medido en una pantalla de 844px de alto:

- **La primera recomendación pasa de empezar en el píxel 602 a empezar en el
  391**, y se ven **cuatro** en vez de dos. La tira del draft baja de 390px a
  289: los cinco huecos de enemigos caben ahora en una fila, porque desde que
  llevan la cara ya no necesitan sitio para el nombre.
- **Los ajustes se han ido dentro de «Baneos y ajustes»** (tu maestría, tus
  partidas, tu perfil). Fuera se quedan los dos que usas con una partida
  delante: nuevo draft y apuntar partida. Antes eran cinco botones en dos filas
  comiéndose la pantalla.
- **El botón «Tu perfil» ya no se sale de la pantalla.** La fila de botones no
  se envolvía y, en un móvil, ese botón quedaba fuera sin forma de llegar a él.
- **El empate se decía dos veces** seguidas, con otras palabras. Ahora una.
- **La barra de colores de cada tarjeta ya no ocupa toda la fila.** En pantalla
  ancha era lo más grande de la tarjeta y lo único que no se podía leer; ahora
  va acotada y al tocarla te dice de dónde sale la nota.
- **Los motivos de equipo se distinguen de los del héroe.** «No hay primera
  línea» le vale igual a media lista y salía repetido en cuatro tarjetas
  compitiendo con «bloquea los dashes de Kagura», que es el que decide.
- **En pantalla ancha, las recomendaciones van en dos columnas**: se ven las ocho
  de un vistazo en vez de cuatro.
- **Los paneles ya no se transparentan.** Se veía el draft por detrás del texto.
- «37/37 con datos · 37 con counters» estaba escrito a mano en español y salía
  así con la app en inglés.

## 1.13.0

**El diagnóstico ahora te dice si estás usando una versión vieja.**

Pasó de verdad: el diagnóstico decía «todo correcto» con los datos de hoy y la
app de dos versiones antes. Y era cierto —todo lo que comprobaba estaba bien—,
solo que estaba comprobando una app que ya no era la publicada. Desde el móvil
no había forma de enterarse.

Es porque la app se guarda entera en el móvil para funcionar sin cobertura, y
los datos se refrescan por su cuenta: puedes acabar con los datos de hoy y la
app de ayer. Ahora el diagnóstico pregunta qué versión hay publicada y, si no
coincide con la que estás usando, lo dice como aviso y te pide que cierres y
vuelvas a abrir.

Si estás sin cobertura no puede preguntarlo, y entonces **no** avisa: no saberlo
no es un problema, y un diagnóstico que chilla sin motivo deja de leerse.

## 1.12.0

**Los objetos ahora se ven, y la build reacciona al draft entero.**

- **Cada objeto sale con su icono, y cada héroe recomendado con su cara.** Es la respuesta de verdad al problema del
  idioma: la API dice que acepta español pero devuelve todo en inglés —los
  nombres de objeto y hasta los de habilidad—, así que traducirlos habría sido
  escribirlos a mano, y un nombre mal puesto te manda a comprar otra cosa en
  mitad del draft. El dibujo lo reconoces juegues en el idioma que juegues. Los
  imágenes se sirven desde la propia app: no se piden al servidor de Moonton (tu
  IP no viaja a nadie) y funcionan sin cobertura. No se descargan al instalar
  —serían 4,6 MB de golpe—, sino cuando se ven, y luego se quedan guardadas.
- **La build ya no mira solo de qué pegan: mira qué traen.** Antes avisaba si el
  equipo enemigo era mágico o físico. Ahora también:
  - si **dos o más enemigos se curan** y tu build no lleva nada que corte la
    curación, te lo dice y te enseña los objetos que sí la cortan;
  - si **dos o más tienen control duro** y no llevas nada que lo acorte, igual.

  Y solo te propone objetos que **puedes comprar en tu línea**: nada de botas de
  jungla para un roam.
- **Y sigue callándose.** Como mucho salen dos avisos, el que más pesa primero,
  y ninguno aparece si la build ya lo cubre o si no hay ningún objeto que
  proponer. Contra un enemigo suelto no dice nada: uno no es una composición.

Lo que hace cada objeto no está escrito a mano en ningún sitio: se lee del texto
que el propio juego trae dentro del objeto («CC and Slow Duration reduced by
25%»). Por eso no envejece con los parches — y buena falta hacía: «Necklace of
Durance», que era EL objeto anti-curación, ya ni existe.

## 1.11.0

**Objetos.** Cada héroe de la lista tiene ahora un botón «Objetos» que abre lo
que compra la gente de tu rango con ese héroe **en tu línea**: los tres objetos
del núcleo, el emblema, el hechizo de batalla, cuánta gente la usa y cuántas
gana.

- **Ordenadas por uso, no por victorias, y se dice por qué.** Una build del 3%
  de uso sale con más victorias que la del 13%. Eso no significa que los
  objetos sean mejores: quien se sale de la build normal suele ser quien más
  domina al héroe, así que ese porcentaje lleva dentro al jugador. La app lo
  pone escrito debajo en vez de venderte la build "ganadora".
- **Y el ajuste que ninguna web de builds puede hacer: mirar tu draft.** Si
  cuatro de los cinco enemigos pegan mágico y la build no lleva defensa mágica,
  te lo dice y te propone los objetos que sí la dan. Sale de dos datos medidos
  —de qué pega cada enemigo, contado de sus habilidades, y cuánta defensa da
  cada objeto, leído del texto del juego— y va con su aviso: no es que se hayan
  medido builds contra este draft, ese dato no existe.
- Al lado de cada objeto sale la defensa que da, que es lo que conecta la build
  con lo que tienes enfrente. Los nombres van en inglés, como en el juego.

Si un día la descarga de builds falla, el botón simplemente no aparece y el
resto de la app funciona igual.

## 1.10.0

Repaso estadístico a "Tu maestría", que desde 1.9.0 pesa más porque las
partidas apuntadas también la alimentan. Dos cosas estaban mal.

- **Tu maestría se mide contra TU nivel, no contra el 50%.** Ganas el 53,4% de
  tus partidas. Un héroe jugado a esa media exacta no es mejor que uno que no
  has tocado nunca: es exactamente lo tuyo. Pues puntuaba 0,64 contra 0,50, o
  sea que la app **premiaba tener datos apuntados** en vez de ser bueno con el
  héroe. Y un héroe al 50%, que para ti es de los peores, salía neutro. Ahora
  por encima de lo tuyo sube, por debajo baja, y a tu media empata con un héroe
  desconocido.
- **Cuánto se fía de pocas partidas ya no es un número inventado.** Cinco
  partidas al 90% puntuaban 0,87, casi el tope: cualquier racha de dos tardes
  te reordenaba las recomendaciones. El valor que había equivalía a suponer que
  tu winrate varía ±11 puntos entre héroes — o sea, del 42% al 64%. Ahora se
  **mide de tus propios datos**: cuánto varía de verdad tu winrate de un héroe a
  otro, descontando lo que explica el azar. Con una maestría como la tuya sale
  ±4 puntos. Cinco partidas al 90% ahora puntúan 0,56, y cuatrocientas siguen
  puntuando alto.
- **La cuenta de "partidas que faltan" pedía casi cuatro veces de más.** Usaba
  la fórmula de comparar dos muestras, cuando lo que se compara es una muestra
  contra tu winrate de siempre — que sale de miles de partidas y no hay que
  pagarlo dos veces. Decía 178 donde son **39**.

En 2.500 drafts simulados esto cambia el héroe recomendado en el 21,8% de los
casos, y hace la app **menos** repetitiva: el héroe más frecuente baja del 15,8%
al 12,3%.

## 1.9.0

- **Botón "Partidas": ves todas las que llevas apuntadas.** Con su fecha, el
  héroe, si ganaste y si seguiste la recomendación. Si te equivocaste al
  apuntar, puedes **cambiar el resultado** (⇄) o **quitarla** (×).
- **Puedes meter partidas de tu historial del juego.** Es lo que hace que la app
  te conozca antes: cada partida que metas cuenta para tu maestría, y la
  maestría es el 15% de la recomendación.
- **Y esto es lo importante: apuntar partidas ahora personaliza de verdad.**
  Hasta ahora el registro y "Tu maestría" eran dos cosas que no se hablaban —
  podías llevar cincuenta partidas apuntadas y la recomendación no se enteraba.
  Ahora el motor usa las dos: de cada héroe, la que tenga más partidas. No se
  suman, se elige: si escribiste 3.821 partidas de Diggie a mano, esas ya
  incluyen las que apuntes ahora.
- Las partidas de tu historial **no** cuentan para comprobar si la app acierta,
  y es a propósito: cuando las jugaste no había ningún consejo que seguir ni que
  ignorar. Si contaran, meter cien partidas viejas llenaría la comparación con
  tu winrate de siempre y dejaría de decir nada.
- Dos partidas apuntadas en el mismo segundo compartían identificador, así que
  borrar una se llevaba las dos. Pasaba justo al meter varias del historial
  seguidas, que es a toques rápidos.

## 1.8.1

- La app no declaraba icono de pestaña, así que el navegador pedía
  `/favicon.ico` en cada carga y se llevaba un 404. Ahora usa el icono que ya
  existía para la app instalada.

## 1.8.0

- **Tu perfil, para llevarte tus datos a otro dispositivo.** Botón nuevo: te da
  un código, lo copias del móvil y lo pegas en el ordenador. Y ya tienes allí tu
  maestría y tus partidas.
  Sin cuenta, sin contraseña y sin servidor: tus datos caben en el propio código
  (unos 500 caracteres), así que viajan por donde tú los mandes — un WhatsApp a
  ti mismo, un correo, lo que sea. Siguen sin pasar por ningún sitio nuestro.
  **Al traerlos se juntan con lo que ya haya, nunca se sustituye.** Si juegas en
  los dos sitios, ninguna de las dos copias pierde nada: de cada héroe se queda
  la versión con más partidas, y las partidas se mezclan sin repetirse. Puedes
  importar las veces que quieras y en los dos sentidos.
  Si el código se pega a medias, lo detecta y no importa nada. Eso es a
  propósito: media importación podría llevarse por delante miles de partidas.
- **La app guarda un historial de su propia salud.** Cada revisión automática
  (dos al día y tras cada publicación) anota sus cifras: cobertura, ruido de los
  datos, cruces de la matriz, edad de los datos, héroes por línea. Un informe
  suelto dice si hoy está bien; cien informes dicen qué se está moviendo, que es
  lo que sirve para decidir qué va en la versión siguiente. No lleva nada tuyo:
  son corridas automáticas contra lo publicado, sin móvil.

## 1.7.0

- **El Diagnóstico compara tus partidas contra algo alcanzable.** Hasta ahora
  decía "faltan 47 para poder comparar", y esa cuenta no se iba a completar
  nunca: la rama "por libre" solo crece si ignoras a la app **a propósito**, y
  nadie va a jugar peor 28 veces para rellenar una muestra. Ahora compara
  también tu winrate siguiendo la app contra **tu winrate de siempre**, que sale
  de la maestría — miles de partidas tuyas que ya existen. Esa sí se llena
  jugando normal.
  Te dice la diferencia con su margen ("+19,3 puntos ± 26,3") y cuántas partidas
  más harían falta para que deje de poder ser casualidad. El número no es un
  umbral inventado: sale del tamaño de la diferencia que estás viendo.
  La comparación siguiendo/por libre sigue ahí, pero ahora dice claramente para
  qué sirve y para qué no: tú eliges cuándo hacer caso, así que no es un
  experimento limpio.
- La cobertura de la matriz decía 99,2% teniéndola completa. Contaba a cada
  héroe contra sí mismo como un cruce que faltaba. Ahora dice 100%.
- Datos frescos: la API volvió esta mañana tras la caída de anoche.

## 1.6.1

- **Un fallo de la API ya no impide publicar la app.** El despliegue descargaba
  los datos y, si la descarga fallaba, se paraba entero — aunque el cambio no
  tuviera nada que ver con los datos. Pasó de verdad: la 1.6.0 se quedó sin
  publicar porque la API estaba caída esa noche. Ahora, si la descarga falla o
  viene peor, se publica con los datos que ya hay guardados, que pasaron ese
  mismo filtro cuando se guardaron. Lo que sigue sin poder pasar es publicar
  datos rancios: por encima de 72 horas, o sin matriz de cruces, el despliegue
  se para igual.

## 1.6.0

Repaso a fondo de la estadística. Dos constantes del motor estaban puestas
contra una suposición que resultó ser falsa, y se han medido.

- **La app ya no castiga a los héroes poco jugados sin motivo.** Cuando miraba
  el cruce entre tu héroe y un enemigo, se fiaba menos si el enemigo se juega
  poco — la idea era que con menos partidas detrás el número es más tembloroso.
  Suena sensato y es falso: medido, los cruces de los héroes raros se mueven
  1,16 veces lo que los de los populares, y si de verdad fuera falta de muestra
  tendrían que moverse 2,65 veces. Además dos descargas separadas nueve minutos
  dan los mismos números con tres cienmilésimas de diferencia. La app estaba
  descontando diez veces más de lo que toca. Cambia el héroe recomendado en el
  14,5% de los drafts.
- **Las sinergias dejan de aplastarse.** El 5,3% de las parejas caía por debajo
  del mínimo de la escala, así que la peor combinación del juego (Chip con
  Lolita) y una mala del montón valían exactamente lo mismo. Ahora se recorta el
  1,1%, que son los cuatro casos extremos de verdad.
- **El Diagnóstico vigila las dos cosas.** Si la fuente de datos cambia de
  comportamiento y los números pasan a ser temblorosos, avisa en vez de dejar
  las constantes mal calibradas en silencio.

Y una corrección de lo que dije en 1.5.0. Escribí que solo una de las doce
reglas tácticas se veía en las partidas. **Estaba mal medido**: promediaba todos
los héroes con una etiqueta contra todos los que no, y si la etiqueta está
puesta a nueve héroes y solo la cumplen cuatro, el promedio los diluye.
Midiendo héroe por héroe, siete reglas encuentran más héroes de los que daría el
azar. Lo que está mal no es la regla: es la etiqueta. `anti_mobility` se lo
pierde a Obsidia, Hilda, Cyclops y catorce más.

Pero el hallazgo de verdad es otro: **las once reglas miden lo mismo**. La
ventaja de un héroe contra los que hacen dash y contra los que se lanzan encima
correlacionan a 0,93. No hay doce relaciones tácticas en el juego: hay una — a
quién te comes y quién te come — con los asesinos en un extremo y los supports
en el otro.

## 1.5.2

- **El buscador de héroes ya no te deja tirado.** Si lo que escribes no encaja
  con ningún nombre, ahora prueba con las letras en el orden que las has puesto
  aunque no estén pegadas: "Lyla" encuentra a Layla, "Tigral" a Tigreal,
  "Lucard" a Alucard. Solo entra cuando la búsqueda normal no devuelve nada, así
  que buscar como siempre sigue dando exactamente lo mismo. Pide tres letras: con
  dos, las letras sueltas encajan en casi cualquier nombre.

## 1.5.1

- **El Diagnóstico vuelve a decir la verdad.** Con la matriz completa daba tres
  fallos que no lo eran: seguía exigiendo que contra tres asesinos de dash la
  app propusiera un anti-dash, que es justo la creencia que el dato nuevo no
  sostiene. Ahora comprueba dos cosas mejores: que ante equipos enemigos
  opuestos cambie la lista de recomendados (no solo el primer nombre — un héroe
  puede ser la mejor respuesta a los dos), y que la nota de counter ordene igual
  que los cruces reales.

## 1.5.0

**La app deja de adivinar.** Hasta ahora, de cada 100 cruces posibles entre tu
héroe y un enemigo, la app tenía el dato real de 11. En los otros 89 decidía con
reglas que escribí yo a mano. Ahora tiene los 100.

- **17.556 cruces reales en vez de 1.330**, y lo mismo en sinergias. El dato
  estaba ahí desde siempre: la API tiene dos rutas para lo mismo y la app estaba
  pidiendo por la que devuelve cinco rivales por héroe en vez de los 132. Ahora
  la ingesta prueba las rutas candidatas y se queda con la que más trae, así que
  si vuelven a mover las cosas de sitio se entera sola.
- **Se nota mucho en lo que te recomienda.** En 3.600 drafts simulados, el héroe
  más repetido pasa de salir nº1 el 12% de las veces al 7%, y los héroes
  distintos que llegan a ser nº1 pasan de 85 a 105. Es decir: la app responde al
  draft que tienes delante en vez de repetir sus favoritos.
- **El aviso de "estás eligiendo a ciegas y este pick es castigable" vuelve a
  salir.** Estaba calibrado sobre los cinco cruces más extremos de cada héroe,
  que era todo lo que había; con la matriz entera, ningún héroe llegaba al
  umbral y el aviso no habría vuelto a aparecer nunca sin que nada fallara.
  Ahora sale en el 23% de los drafts.
- **La sinergia se lee en los dos sentidos.** Llevar a A con B es lo mismo que
  llevar a B con A, pero la app solo miraba un lado y se dejaba el 37% de los
  datos. Cambia el héroe recomendado en 1 de cada 10 drafts.
- **Ya no propone banear a quien salta encima de tu tanque.** Un tanque está
  etiquetado como "inmóvil", así que la app lo trataba como si hubiera que
  protegerlo. Era el 12% de los avisos de peligro. Al tanque le saltan encima a
  propósito: para eso está.
- El registro de partidas no se descuadra si la API cambia cómo escribe el
  nombre de un héroe. Tus partidas viven meses en el móvil y una partida vieja
  no puede cambiar de bando.
- El fichero de datos ocupa la mitad de lo que ocuparía y su diff se lee: una
  línea por héroe en vez de una por número.

Una cosa que descubrí de camino y te interesa saber: ahora que hay dato de
todos los cruces se pueden **medir las doce reglas tácticas** que llevo escritas
a mano. Solo una se ve en las partidas — la de cortar dashes, y por cuatro
décimas de punto. Las otras once no se distinguen del ruido. No las he borrado,
porque el dato de la API es de "estar en la misma partida" y no del duelo de
carril, así que diluye los efectos reales; pero deja claro que el motor no
debería apoyarse en ellas, y ya no lo hace: solo entran cuando se trata de un
héroe tan nuevo que la API aún no publica ni un cruce suyo.

## 1.4.0

- **Eligiendo pronto, te propone héroes que no te puedan castigar.** Ya lo hacía
  un poco; ahora el doble. Con un solo enemigo en pantalla, lo castigable que es
  el héroe recomendado baja de 0,48 a 0,38 en la escala de la app: una quinta
  parte menos de exposición. Y con los cinco enemigos ya elegidos esto no
  interviene para nada — ahí ya no te puede contrapickear nadie, así que la app
  va al counter y punto. Medido en 1.200 drafts por fase, sin que la app se
  cierre en unos pocos héroes (el líder sale en el 10,4% con un enemigo, igual
  que antes).

Lo que probé y NO subí, por si te lo preguntas: bajar el peso del counter
cuando se ve poco del equipo rival. Suena razonable y es falso — los enemigos
que faltan son desconocidos para todos los héroes por igual, así que no
favorecen a ninguno. Al medirlo, no hacía a los picks más seguros y reducía los
héroes distintos que la app llega a recomendar de 85 a 65. Lo que de verdad
cambia entre elegir pronto y tarde es que los que faltan te eligen a ti en
contra, y eso es justo lo que sí se ha reforzado.

## 1.3.0

- **La app ya mira de qué pega tu equipo.** Es el aviso de draft más repetido en
  MLBB y no lo tenía: si los cinco pegáis físico, al rival le basta con comprar
  armadura y os apaga a todos. Ahora, cuando llevas tres aliados elegidos y
  todos pegan del mismo lado, te lo dice — y si el héroe que te recomienda mete
  el daño que falta, te lo dice también, que es una razón para cogerlo.
  Además cuenta a la hora de recomendar: entre dos héroes parecidos, gana el
  que tapa el hueco. Medido en 3.000 drafts: el nº1 tapa el hueco el 64% de las
  veces, antes el 57%, y sin que la app se cierre en unos pocos héroes.
- **De qué pega cada héroe no lo decide su rol, lo dice el juego.** Sale del
  texto de las habilidades que publica Moonton, así que acierta los raros: Gusion
  es asesino y pega mágico, Hylos es tanque y pega mágico, Natan y Kimmy son
  tiradores y pegan mágico, Esmeralda pega de las dos cosas. Por el rol, los
  cuatro estarían mal. Los 133 tienen el dato.
- **Buscar "Cíclope" ya encuentra a Cyclops.** El juego en español traduce
  algunos nombres y el buscador solo miraba el inglés. Ahora acepta los dos, con
  tilde o sin ella. Van Cíclope, Minotauro, Urano, Maya, Silvana, Popol y Kupa,
  Ángela y Yi Sun Shin. Lo que se ve en pantalla sigue en inglés a propósito: es
  la clave de todos los datos, y cambiarla escondería fallos. Si te encuentras
  otro nombre que no aparece al buscarlo, dilo y se añade.

## 1.2.1

- **La app ya no puede publicarse con los datos a medias.** La descarga de datos
  se rompe en silencio a propósito: si la API falla, conserva lo anterior y
  sigue. El problema es que nadie comprobaba si lo nuevo era peor que lo
  guardado, y ya había pasado: una corrida dejó a los 133 héroes sin línea y sin
  rol, y los cruces de 133 héroes a 34. Con esos datos, cuatro de las cinco
  líneas se quedan sin héroes que recomendar y la app no tiene de qué quejarse.
  Ahora una corrida que resuelva menos que la anterior se descarta y el
  despliegue se para, que es lo correcto: te quedas con la app de antes
  funcionando.
- El aviso de "cuidado con" lee los cruces en las dos direcciones, como el resto
  del motor. Ve un tercio más de datos, aunque en la práctica el aviso sale casi
  las mismas veces: lo que se ganaba estaba casi todo del lado bueno.
- En inglés ya no se cuelan seis textos en español (el "Ver por qué" del
  diagnóstico y las etiquetas de accesibilidad de los botones).

## 1.2.0

La app se abre al público.

- **Español e inglés.** Coge el idioma del móvil y se puede cambiar abajo. Sin
  inglés la app no le sirve a la mayoría de la gente que juega a esto.
- **Aviso de no afiliación**: es un proyecto de aficionado, sin relación con
  Moonton, y ahora lo dice.
- **Nota de privacidad**: tus datos no salen de tu móvil. No hay cuentas, ni
  servidor, ni seguimiento. Es verdad desde el primer día, pero convenía
  decirlo.
- Hueco para un enlace de donación, vacío hasta que haya uno de verdad.
- El diagnóstico sigue en español: es una herramienta de depuración, y
  traducirlo era menos urgente que traducir lo que se ve al usar la app.

## 1.1.0

- **Dos o tres frases sobre tu draft**, arriba del todo: si ganas tu cruce,
  quién te va a doler de verdad, si estás eligiendo a ciegas y si al equipo le
  falta algo. Habla de la línea que juegues.
- Cuando hay matchup de la pareja lo usa, que es el dato bueno. Cuando no lo
  hay —y no lo hay casi nunca: la API cubre el 11% de los cruces— compara los
  winrates sueltos, y lo dice con otras palabras para no vender una cosa por
  otra.
- **Un 47% más de matchups reales.** La API da los cruces en un sentido o en
  otro, y cuando da los dos suman exactamente 1. Usar la vuelta cuando falta la
  ida sube la cobertura del 7,6% al 11,2%, sin inventar nada. Ahora el riesgo
  de contrapick se puede calcular para el 100% de los héroes de las cinco
  líneas.

## 1.0.0

La app deja de ser solo para roam. Ahora se llama **Mobile Legends Pick Assist**
y sirve para las cinco líneas.

- **Eliges tu línea al abrirla** y la app recomienda para ESA: roam, jungla,
  mid, gold o exp. Se pregunta una vez y se recuerda; se cambia desde «Baneos y
  ajustes».
- **Los pools no están escritos a mano**: salen de en qué línea se juega de
  verdad cada héroe, según la API. Roam 37, jungla 37, mid 29, gold 21, exp 40.
  Un héroe que se juega en dos líneas sale en las dos, que es lo correcto.
- **«El roamer enemigo pesa el doble» pasa a ser «tu rival de línea pesa el
  doble»**. Si juegas mid, el que te importa es su mediocarril. Con el mismo
  draft enemigo la app ya señala a un rival distinto para cada línea.
- **Counters de los 133 héroes**, no solo de los 35 roamers. Cobertura del 100%
  en las cinco líneas. Eso alarga la descarga de datos de 1 a 3 minutos y engorda
  el fichero de 139 a 199 KB, que es el precio de que sirva para cualquier rol.
- El diagnóstico comprueba **las cinco líneas**. Y es honesto con lo que no
  aplica: en gold no hay ni un anti-dash, así que ahí no lo exige en vez de
  fallar para siempre.
- Tu maestría y tus partidas **no se pierden**: siguen guardadas donde estaban.

## 0.9.0

- **La app se vigila sola.** Dos veces al día, y después de cada despliegue, una
  comprobación automática ejecuta el mismo diagnóstico del botón contra lo que
  la app está sirviendo de verdad. Si algo falla, abre una incidencia en GitHub
  con el informe entero dentro. Si vuelve a estar sano, la cierra.
- Botón **"A GitHub"** en el diagnóstico: abre el formulario de incidencia ya
  relleno con el informe. Un toque para confirmar, y sin ninguna credencial
  dentro de la app.
- **Mantenimiento los lunes**: si Moonton saca héroes nuevos, avisa; si las
  tablas de deducción se han quedado viejas, las regenera, pasa las pruebas y
  deja un pull request. Lo que necesita criterio —escribirle los tags a un
  héroe mirando sus habilidades— no lo toca nadie automáticamente.
- `npm run diagnostico` hace lo mismo desde Termux, contra lo publicado o con
  `--local` contra tus datos.

## 0.8.0

- **Botón "Apuntar partida"**: dos toques al acabar —con quién jugaste y si
  ganaste— y la app lo guarda. Se marca cuáles eran sus recomendaciones, así
  que con el tiempo podrá responder a la única pregunta que importa: ¿ganas más
  cuando le haces caso?
- El diagnóstico trae una sección **TUS PARTIDAS** con tu winrate siguiendo la
  recomendación y por libre, y cuántas faltan para que esa comparación
  signifique algo. No es un aviso: no hay nada que arreglar, solo que aún no
  has jugado bastante.
- Hasta ahora esto no existía. La nota de "cuando tengas unas 30 partidas de
  cada tipo" llevaba tiempo dando por hecho que se estaban apuntando, y no se
  apuntaba ninguna.

## 0.7.0

- Los 7 héroes que quedaban sin tags propios ya los tienen escritos: Marcel,
  Hirara, Sora, Zetian, Obsidia, Cici y Valir. **El catálogo cubre los 133**.
- No están puestos a ojo: salen de la descripción de sus habilidades, que la
  propia API publica. Un par de correcciones que el rol por defecto no podía
  ver: Marcel no cura nada (le sobraba `sustain`) y Obsidia no es inmóvil
  (tiene un tirón y un parpadeo).
- Al tener tags escritos, esos siete dejan de arrastrar el descuento por
  deducción. Medido sobre 300 drafts con datos reales, la recomendación apenas
  se mueve: el líder pasa del 41% al 39%.
- Tablas de deducción regeneradas con el catálogo ampliado. Ya no se aplican a
  nadie —los 133 tienen tags propios— pero quedan listas para el héroe que
  salga mañana.

## 0.6.0

- Los héroes que no están en el catálogo escrito a mano ya no dependen solo de
  los tags genéricos de su rol: la app traduce la etiqueta que Moonton le pone a
  cada héroe ("Guard", "Initiator", "Regen"…) a sus propios tags. Medido sobre
  los 126 héroes que sí tienes etiquetados, acierta el 52,5% de sus tags reales
  en vez del 39,6%, sin perder precisión.
- La traducción no está escrita a ojo: la deriva `scripts/derivar-tags.mjs`
  del propio catálogo, y se puede reejecutar cuando Moonton cambie sus
  etiquetas.
- Un filtro impide que una correlación se cuele como propiedad: casi todos los
  héroes con "Crowd Control" son tanques, así que sin él una maga con control
  salía marcada como primera línea y la composición se creía cubierta.
- Lo que sale de tags deducidos pesa menos que lo escrito a mano, en la misma
  proporción en que acierta. Sin eso, Marcel salía nº1 en el 69% de 300 drafts
  simulados —frente al 43% del líder anterior— solo por tener seis tags
  adivinados: el mismo sesgo por acumular etiquetas que ya costó una corrección
  con Carmilla. Con el descuento, la concentración se queda en el 42% de
  siempre y la recomendación solo cambia en el 7% de los drafts.
- Las dependencias quedan fijadas con lockfile: el despliegue instala versiones
  exactas y no puede colarse sola una versión nueva rota.
- La prueba de la ingesta ya corre de verdad sin red. Decía hacerlo, pero
  `--base` no se respetaba al descubrir rutas y acababa haciendo una ingesta
  completa contra la API real: más de un minuto y cuarenta peticiones en cada
  despliegue. Ahora tarda nueve segundos.

## 0.5.1

- Las recomendaciones avisan con un "tags de su rol" cuando el héroe no está en
  el catálogo escrito a mano y juega con los tags genéricos de su rol. Hoy le
  toca a Marcel, que acaba de entrar al pool.

## 0.5.0

- La ingesta ya lee el **rol y la línea** de los 133 héroes. Antes salían vacíos
  para todos, y eso tenía dos efectos invisibles: los héroes que no están en el
  catálogo escrito a mano se quedaban sin ningún tag (no con los de su rol, como
  se creía), y la detección del roamer enemigo perdía su señal principal.
- **Marcel entra al pool de roam**: es support de roam según la API y la app no
  lo ofrecía nunca. El pool pasa de 34 a 35.
- La ingesta pide counters a los mismos roamers que la app recomienda. Antes
  usaba solo el catálogo escrito a mano, así que un roamer nuevo entraba en las
  recomendaciones sin datos de matchup.
- Arreglado un fallo que llenaba el diagnóstico de cuatro errores falsos
  (`Cannot read properties of undefined`) y, al llegar al tope de errores,
  ocultaba los de verdad.
- El aviso de cobertura de counters ya no salta siempre. Exigía un 25% cuando el
  techo real de la API es el 7,5%: ahora avisa si la descarga se queda corta.

## 0.4.0

- Vuelve a funcionar el **riesgo de contrapick**, que llevaba muerto desde que se
  añadió: devolvía `null` para los 34 roamers porque las matrices de counters se
  indexaban solo en su primer nivel.
- El diagnóstico ya no anuncia un 0% de cobertura de cruces: era el mismo fallo.

## 0.3.1

- La prueba que ejecuta la ingesta de verdad ya no sobrescribe los datos
  publicados. Como las pruebas corren antes de compilar, su diagnóstico
  degradado era el que acababa en la app: decía que solo se había resuelto un
  rango cuando se resolvían los cuatro.

## 0.3.0

- Pie con la versión y la antigüedad de los datos, para saber desde el móvil si
  lo que estás viendo es lo que acabas de subir.
