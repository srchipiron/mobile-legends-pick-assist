# Cambios

Sube la versión en `package.json` cuando cambies comportamiento y deja aquí una
línea explicando qué cambia **para quien usa la app**, no qué ficheros tocaste.
El despliegue falla si la versión que vas a publicar no tiene su entrada, así
que esto no se olvida.

Criterio: `0.X.0` cuando cambia cómo decide la app o qué hace; `0.0.X` para
correcciones.

## 3.86.3

- Con la app del móvil abierta en un draft viejo, la tablet ya no pierde la
  partida que está vigilando. El móvil volvía a pedir vigilar su draft cada
  pocos segundos y le quitaba la partida en juego; ahora un draft más viejo
  no sustituye nunca a uno más nuevo.

## 3.86.2

- Si el móvil lleva el draft, la tablet ya no se queda con esa partida. El
  28 de octubre la tablet leyó la pantalla de carga como si fuera otro
  draft y apuntó la partida de las 21:27 con siete héroes sin leer y
  Rafaela «supuesto»: arréglala en «Tus partidas» si te acuerdas de
  quién iba.

## 3.86.1

- El botón amarillo de la burbuja ya no sale al empezar un draft: espera a
  ver dos veces seguidas que no hay draft ni partida delante, y se quita si
  la tablet deja de leer o el lector no contesta.
- «Revisar con las capturas» no enseña una partida si alguien más subió un
  recorte con su misma hora: así nadie puede colarte caras falsas.

## 3.86.0

- Puedes corregir los drafts desde el ordenador viendo las caras. En «Tus
  partidas» → «Revisar con las capturas del lector» salen las diez caras
  de cada draft que la tablet no leyó entero, con un campo al lado de cada
  una. Escribes quién era, tocas «Guardar» y la partida queda arreglada; la
  tablet aprende esas caras en las próximas horas.
- Va igual en el móvil. En el ordenador abre la app y pon tu clave en
  «Guardar mis partidas» (la misma del móvil) para traer tus partidas.

## 3.85.0

- Cuando la tablet no ve tu héroe (casi siempre eliges el último y tu
  hueco pasa enseguida a la foto de la skin), al acabar te pregunta
  «¿Con quién jugaste tú?» con tus héroes habituales como botones: un
  toque y listo, también desde el botón amarillo encima del juego.
- Con tu respuesta aprende la foto de esa skin, y en cuanto la vea en dos
  drafts te reconoce sola, sin preguntarte más.

## 3.84.1

- La tablet reconoce tu Minotaur con la skin roja. Hasta ahora no la
  conocía y, si no veía tu héroe, apuntaba la partida con el nº1 como
  «pick supuesto» (el 28 de octubre a las 22:25 puso Floryn y era
  Minotaur: puedes arreglarla en «Mis partidas»).
- Lo que la tablet sube para medir el lector dice ya de qué versión de la
  APK es.

## 3.84.0

- Ya no tienes que salir del juego para corregir un draft. Al acabar la
  partida, si la tablet no reconoció a alguien (o no vio cómo acabó), sale
  arriba un botón amarillo encima del juego. Tócalo y contestas ahí mismo:
  los diez huecos con lo que sí leyó, y al escribir te salen los nombres
  debajo para tocarlos. «Ahora no» lo deja para luego en la app.
- El botón solo sale fuera del draft y de la partida, y se quita solo en
  cuanto empieza el draft siguiente, para no taparte nada del juego. La
  burbuja del consejo sigue igual: no se puede tocar.
- Necesita la APK nueva (se actualiza sola desde la app).

## 3.83.2

- En Ajustes → «El sistema» el móvil te dice cuántas partidas has jugado
  desde que arrancó la tablet y cuántas apuntó ella sola. Si juegas tres y
  no apunta ninguna, sale en rojo: es que no está viendo el final de la
  partida. La revisión diaria también lo avisa como fallo. Antes, cinco
  horas jugando sin apuntar nada pasaban como «todo bien».

## 3.83.1

- Las partidas que la tablet apuntó sin saber tu héroe antes del 27 de
  octubre se suben otra vez con esa marca. Así dejan de contar en el móvil
  como «seguiste el consejo» (con el héroe que la app supuso, no el tuyo).
- Si la tablet no puede aprender de un draft que arreglaste (por ejemplo,
  se queda sin memoria), lo vuelve a intentar más tarde y lo dice. Antes lo
  daba por aprendido y no lo miraba nunca más.
- La tablet no se deja tumbar por una imagen preparada para ocupar cientos
  de megas al abrirla.

## 3.83.0

- La tablet ya no pierde la partida que está vigilando. Al acabar una
  partida (o en la carga o el vestíbulo) a veces «leía» un héroe suelto en
  una pantalla que no era el draft, creía que empezaba otro y dejaba de
  mirar el final de la partida de verdad: por eso casi nunca veía la tabla
  de VICTORIA/DERROTA y te preguntaba «¿Cómo acabó?» con el siguiente
  draft ya empezado. Ahora solo cuenta como draft la pantalla con la fila de
  baneos a la vista. Así puede apuntar sola el resultado y medir cuánto duró
  la partida.
- Lo que arreglas en tu historial enseña a la tablet sola. Si corriges quién
  iba en una partida que no leyó entera (en el móvil o en la tablet), cada
  pocas horas la tablet baja las caras que guardó de ese draft y aprende de
  ellas con lo que pusiste, con las mismas garantías de siempre: la cara de
  un compañero solo entra si sale igual en dos drafts y no se parece a otro
  héroe. Lo que la tablet leyó por su cuenta nunca cuenta como verdad.

## 3.82.1

- En Ajustes → «El sistema», el móvil te dice en rojo cuántas partidas
  dejó la tablet sin resultado (las que no supo si ganaste o perdiste).
  Hasta que las contestas en «Mis partidas» de la tablet no se suben ni
  cuentan para tus números, así que ahora no se te quedan olvidadas. La
  revisión diaria de la tablet también lo avisa.

## 3.82.0

- Lo que arreglas en tu historial sirve ahora para mejorar la lectura de
  los héroes. Si corriges quién iba en una partida (los rivales, tus
  compañeros o tu héroe), esa corrección se cruza con las caras que la
  tablet subió de ese draft: así se mide qué leyó mal, hueco a hueco, y qué
  skins de tus compañeros habituales pueden ir de serie para reconocerlas
  siempre. Las caras nuevas se revisan antes de añadirse: una equivocada
  haría que confundiera a dos héroes para siempre.

## 3.81.5

- La tablet ya no pierde las partidas de las que no sabe el resultado. Antes,
  si no contestabas «¿Cómo acabó?» antes de la siguiente, la partida se
  tiraba: solo el 27 de octubre, unas 20. Ahora se queda en «Mis partidas»
  como «Sin resultado», con su draft, y dices si ganaste o perdiste cuando
  quieras. Al decirlo se apunta y se sube como las demás.
- Cuando no reconoce el final de una partida, la tablet sube dos pantallas
  pequeñas de después de la partida, donde sale victoria o derrota, para
  arreglar por qué no las reconoce. A ese tamaño no se leen los nombres de
  los jugadores.

## 3.81.4

- La tablet vuelve a aprender de lo que le enseñas: cuando le dices quién
  era un héroe que no reconoció, ahora mira las capturas de la fase de
  picks, que es donde se ve su cara. Desde la 3.80.0, al leer más a
  menudo, solo se quedaba con los últimos segundos (la pantalla de carga y
  las skins), donde no hay nada que aprender.
- Los recortes que la tablet sube para mejorar la lectura también salen
  ahora de la fase de picks, y no se borran mientras dura el draft.

## 3.81.3

- Arreglar en el móvil una partida antigua (más allá de las 200 más
  recientes) ya llega a la base de datos y a la tablet. Antes se quedaba
  solo en el móvil aunque la app dijera que estaba todo subido.
- Una partida arreglada en la tablet ya no le quita al móvil lo que el
  lector leyó en ese draft, que es lo que sirve para medir cuánto acierta.

## 3.81.2

- Si la fuente de datos responde a medias con los objetos, ya no se pierde
  ninguno de los que la app conocía (su nombre y su icono en las builds).
  Es el caso contrario al de 3.81.1: sin esto, una actualización de los
  datos buena se habría descartado entera por perder 32 objetos.
- Las partidas apuntadas solas sin saber tu héroe (el lector no leyó tu
  fila y se apuntó el nº1 de la app) ya no cuentan como «seguiste el
  consejo». Ni en el Veredicto, ni en la medida de la comunidad, ni en tu
  maestría, ni en «Para ti», ni en tus héroes de «Tus números» y «Tu
  semana». Antes sí contaban, siempre a favor de la app: en tus partidas
  hay unas 17 así. El historial las marca como «héroe sin leer», y si
  eliges el héroe en la partida (aunque sea el mismo) la marca se quita.
- La marca llega a la base de datos, al móvil y a la tablet.
- Cuando la tablet no puede subir los recortes de un draft, lo dice en su
  registro y en el parte, con el motivo. Antes no dejaba rastro.
- Si los datos de la app pasan de 72 horas sin actualizarse, la vigilancia
  abre una incidencia en GitHub (te llega como notificación) y la cierra
  sola cuando vuelven. Antes solo avisaba con un fallo, y una API caída
  durante días no lo es.
- La app de la tablet ya no se publica sin pasar las pruebas, y se
  actualiza también cuando cambian los textos o la conexión con la base de
  datos (antes solo con cambios del lector o del motor).

## 3.81.1

- Si la fuente de datos falla a medias, los objetos ya no pierden lo que
  sabías de ellos (cuánta defensa dan, si llevan antisanación). El 27 de
  octubre la fuente falló así y la actualización de los datos se descartó
  entera por eso: la app siguió con los del día anterior, que es lo
  correcto, pero un fallo solo de los objetos no debe tirar unos datos
  buenos.

## 3.81.0

- Cuando la tablet apunta sola una partida en la que no reconoció a algún
  héroe, sube las caras de ese draft para que se pueda ver por qué falló y
  arreglarlo. Solo las diez caras de los héroes, sin los nombres de los
  jugadores, con la clave del lector (no la tuya). Si después dices quién
  era en «Enseña al lector» o arreglas la partida, eso sirve de respuesta.

## 3.80.0

- La tablet lee mejor los héroes del draft. Mira la pantalla cada 1,5
  segundos en vez de cada 5: el último rival y tu héroe solo se ven con su
  dibujo unos segundos antes de las skins, y se escapaban.
- Reconoce tus skins de siempre en tu fila (Estes, Diggie, Rafaela) y la de
  Ruby: en tus drafts, tu héroe se leía en 6 de cada 10 capturas y ahora en
  más de 7 de cada 10.
- Lee rivales que se quedaban justo por debajo, como Kaja, sin leer de más:
  medido en tus 51 drafts corregidos, ningún héroe equivocado nuevo.

## 3.79.0

- «Tu semana», en el móvil (Partidas) y en «Mis partidas» de la tablet: cómo
  te han ido los últimos 7 días frente a los 7 de antes, los héroes que te
  han funcionado y los que te han costado esa semana (con 3 partidas o
  más), y en cuántas cogiste el nº1 de la app y cómo te fue con él y sin
  él. Solo dice «vas mejor» o «vas peor» cuando la diferencia ya no cabe
  en el azar.

## 3.78.0

- En el móvil ya puedes arreglar quién iba en cada equipo de una partida
  apuntada: en el historial, toca la partida y quita o añade enemigos y
  compañeros. Antes solo se podía en la tablet; desde el móvil, solo el
  resultado y tu héroe. El arreglo se sube y la tablet lo ve igual.
- La voz en partida avisa de los objetivos: «la tortuga sale en 30
  segundos» al minuto 1:30 y «el Lord sale en un minuto» al minuto 7. Son
  los tiempos del parche actual (tortuga a los 2:00, Lord a los 8:00),
  comprobados hoy. Solo avisa de la primera aparición: lo que pasa después
  depende de cuándo la matéis, y eso el lector no lo ve.

## 3.77.0

- El móvil enseña el estado del sistema de un vistazo, en Ajustes → Lector
  en la tablet: si la tablet graba, con qué línea decide, cuántas lecturas
  lleva, cuántas partidas ha apuntado y cuántas faltan por subir, cuántos
  resultados reconoce sola y de cuándo son sus datos. Lo que hay que
  arreglar sale en rojo.
- La tablet tiene «Tus números» en «Mis partidas»: tu racha, cómo vas hoy,
  cómo te va la partida siguiente después de perder y los héroes con los
  que ganas o pierdes más de lo normal en ti.
- El aviso al acabar cada partida dice cómo va la sesión. Con dos o más
  derrotas seguidas, añade cómo te va normalmente la siguiente, con tus
  propias partidas. Solo sugiere un descanso si tus datos muestran de
  verdad que tras perder te va peor.

## 3.76.0

- El móvil es ahora tu centro de mando de la tablet. Al vincularlos, Pick
  Assist usa la misma clave que Lector MLBB, así que en el móvil ves todas
  las partidas que apunta la tablet, con tus estadísticas, sin activar
  nada a mano.
- Lo que arregles en una partida, en el móvil o en la tablet, aparece en el
  otro: gana siempre el arreglo más reciente.
- Una copia vieja ya no puede deshacer un arreglo. Antes, el móvil volvía a
  subir su copia y pisaba lo que habías arreglado en la tablet.

## 3.75.0

- Lector MLBB tiene «Mis partidas»: el registro de todas tus partidas tal
  como están en la base de datos, con fecha, tu pick, resultado, enemigos y
  compañeros, y cuántas has ganado.
- Puedes arreglar cualquier partida si el lector se equivocó: el
  resultado, tu pick, un enemigo o compañero que faltaba, o los baneos. Se
  sube corregida, y tus estadísticas, tu maestría y la medida del modelo
  usan la buena.
- Si arreglas el resultado de una partida reciente, el lector aprende a
  reconocer bien esa pantalla del final, así que la próxima vez acierta
  solo.
- Hay una guía completa dentro de la app («Guía completa», y se abre sola
  la primera vez). Explica paso a paso cómo dejarlo todo listo y qué hace
  cada parte.
- La revisión diaria mide cuántas veces reconoce sola el resultado y cuántas
  te lo tiene que preguntar.

## 3.74.6

- Las partidas que apunta Lector MLBB en la tablet ya se guardan en la base
  de datos aunque el móvil no le haya pasado tu clave. Usa la clave de la
  tablet, así que cuentan para medir y mejorar el modelo, pero no salen en
  Pick Assist del móvil. La pantalla de la tablet lo dice.
- Si algún día activas «Guardar mis partidas» en el móvil, las nuevas irán
  con tu clave. Las de antes se quedan con la de la tablet.

## 3.74.5

- La revisión diaria de la tablet solo da la alarma por fallos de verdad.
  Con los primeros partes reales salían dos falsas: un fallo del 25 de
  octubre que ya estaba arreglado, y los avisos de «no está grabando» de
  cuando la tablet simplemente no graba.
- El parte ya no sale marcado como «recortado» solo porque el registro es
  largo; solo cuando de verdad se pierde parte de un fallo.

## 3.74.4

- Lector MLBB hace más rápido los recortes y miniaturas que guarda: de 4 a
  6 veces más rápido, con el mismo resultado byte a byte.
- Las comprobaciones antes de publicar tardan un tercio menos (de casi 2
  minutos a 1 minuto 10), así que cada versión llega antes.

## 3.74.3

- Si en la tablet contestas «Enseña al lector» con la partida aún en
  marcha, ahora vale. Antes se perdía: la partida se guardaba con el draft
  a medias y la tarjeta volvía a salir.
- Si contestas tarde cómo acabó una partida, se guarda con la hora en que
  terminó, no con la hora en que contestaste.
- Si una partida se queda sin apuntar, porque llegó otra pregunta o
  contestaste demasiado tarde, Lector MLBB lo apunta en su registro y la
  revisión diaria lo ve.
- La guía de la app de la tablet ya no da por hecho el paso «el móvil lee»
  cuando quien lee es la propia tablet.

## 3.74.2

- El parte de salud de la tablet llega siempre. Con un fallo largo pasaba
  del tamaño que acepta la base de datos y se perdía, justo cuando había
  algo que ver. Ahora se recorta y lo dice.
- Los errores del registro de Lector MLBB van aparte en el parte, así que
  la revisión ve también los de hace más de 5 minutos.
- La revisión diaria avisa además cuando la app de la tablet deja de
  escribir su estado, cuando la tablet no tiene datos del juego válidos, y
  dice el motivo real de las capturas fallidas.

## 3.74.1

- Lector MLBB manda su parte de salud aunque el móvil no le haya pasado
  nunca tu clave. Antes solo lo mandaba con ella, y como tu base de datos
  estaba vacía, la revisión diaria no habría visto nada.
- Para eso usa una clave suya, creada en la tablet. Solo sirve para los
  partes: con ella no se ven ni se tocan tus partidas.

## 3.74.0

- Lector MLBB avisa por sí solo de cómo va en la tablet, sin que tengas que
  copiar nada. Cada 15 minutos sube un parte a tu base de datos de partidas:
  si graba, si la burbuja sale, cuántas capturas fallan, de cuándo son los
  datos, el último error y las últimas líneas de su registro.
- Una revisión automática lee esos partes cada día y, si algo falla, lo
  arregla y publica una versión nueva (con las pruebas de siempre).
- El parte sale limpio: sin direcciones IP, sin el código de vinculación y
  sin tu clave. No lleva nada de tu cuenta del juego. Solo se sube con tu
  clave de «Guardar mis partidas» puesta.
- Para que funcione hay que pegar una vez el esquema nuevo
  (`supabase/esquema.sql`) en Supabase; volver a pegarlo no borra nada.

## 3.73.1

- Lector MLBB usa siempre los datos del juego más nuevos que tenga.
  Antes, si dejaba de poder descargarlos, seguía con los viejos aunque la
  propia app trajera unos más recientes.
- La pantalla de la tablet, en «Sin móvil», ahora dice:
  - de hace cuánto son los datos con los que decide, y si son viejos;
  - cuántas partidas lleva apuntadas y si están guardadas en tu base de
    datos.
- Sin tu clave, tus partidas se quedaban solo en la tablet sin avisar.
  Ahora lo dice y explica cómo arreglarlo: abrir Pick Assist en el móvil una
  vez con «Guardar mis partidas» puesto y la tablet vinculada.
- Lo que quedó sin subir de otras veces se intenta subir al poco de
  arrancar, sin esperar 10 minutos.

## 3.73.0

- Lector MLBB ya no se queda atascado cuando no ve el final de la partida.
  Si no reconoce cómo acabó, o empiezas otro draft sin que haya visto la
  pantalla del resultado, te lo pregunta: te llega un aviso y en la app
  sale «¿Cómo acabó tu partida?» con Gané, Perdí o No la terminé.
- Con tu respuesta apunta la partida y aprende la pantalla del final. La
  victoria no venía aprendida de serie, así que la primera vez que ganes
  te lo preguntará, y a partir de ahí la reconocerá sola.
- El draft siguiente entra antes. Ya no espera 3 minutos tras la partida:
  en cuanto ve baneos nuevos, sabe que es otro draft. Y si alguien abandona
  en pleno draft y empezáis otro, ya no lo mezcla con el anterior.

## 3.72.4

- Arreglado por fin el cierre de Lector MLBB al empezar a leer. El lector
  traía una comprobación de nombres de héroe que la tablet no sabía
  entender. Desde la 3.70.0 el lector no llegaba a arrancar y se llevaba
  la app con él. Ahora esa comprobación está escrita de una forma que
  entiende cualquier tablet, y una prueba nueva impide que vuelva a
  colarse.

## 3.72.3

- Si el lector falla al arrancar, Lector MLBB ya no se cierra. La 3.72.2
  recogía los errores con el lector ya funcionando, pero no los de cuando
  se pone en marcha, justo al aceptar «Pantalla completa». Ahora esos
  también quedan apuntados: la app sigue abierta y el aviso rojo de arriba
  dice qué falló, con «Copiar».

## 3.72.2

- Un error del lector ya no cierra Lector MLBB. Hasta ahora, cualquier error
  del lector por dentro cerraba la app entera; Android solo decía «se cerró
  ella misma, código 1». Ahora el error se apunta con su detalle y la app
  sigue abierta.
- El aviso rojo de arriba dice qué falló dentro del lector, y «Copiar»
  lleva también las últimas líneas del registro, que es donde se ve el
  porqué exacto.

## 3.72.1

- Lector MLBB ya no se cierra al aceptar «Pantalla completa». Al abrir la
  app pedía grabar sola y, si a la vez tocabas «Empezar a leer», salían dos
  peticiones de Android una encima de otra; al aceptar, Android daba un error
  y cerraba la app. Ahora solo sale una.
- Si algo falla al empezar a grabar, la app ya no se cierra: lo dice arriba,
  en rojo, con un botón «Copiar» para pegármelo en el chat.
- Después de un fallo, la app no vuelve a pedir grabar sola al abrirla. Así
  ya no entra en el bucle de abrirse y cerrarse.

## 3.72.0

- El nº1 ya no es tu héroe solo porque lo juegas. Antes, cualquier héroe
  que hubieras jugado recibía un plus fijo por tu nivel, y por eso el nº1
  era uno tuyo en 9 de cada 10 drafts. Ahora tu nivel cuenta igual para
  todos, y lo único que sube a un héroe tuyo es que de verdad te va mejor
  con él. Medido en tus partidas: la app acierta igual que antes, y el nº1
  cambia en 1 de cada 6 drafts.
- Debajo de la tarjeta nº1, «De los tuyos, el mejor es…» te dice cuál de
  tus héroes va primero, por si prefieres ir con lo que dominas. La
  burbuja de la tablet también lo dice.
- Cada semana se vuelve a medir el modelo con todas las partidas que se
  van juntando (las pro, las tuyas y las de la comunidad). Si con ellas
  acertaría mejor, se abre una propuesta para revisarla; nada cambia solo.

## 3.71.0

- La voz de los consejos en partida ya sale de la tablet sola, sin el móvil:
  cuando empieza la partida, Lector MLBB te va diciendo los consejos de tu
  pick (los mismos que daba la app del móvil) y en tu idioma.
- Para callarla: en Lector MLBB → Ajustes, «Voz en partida»; o con el botón
  «Voz» de la app del móvil, que la tablet también respeta.
- La tablet aprende de ti poco a poco. Si en un draft no reconoció a algún
  héroe, al acabar la notificación te lo dice; tócala y escribe quién era
  (lo que sí leyó ya está puesto). El lector aprende de las capturas de
  ese draft, como cuando corregías en el móvil, y la próxima vez lo
  reconoce.
- Lo que corriges también arregla esa partida en tus partidas guardadas, y
  se vuelve a subir bien a la base de datos.

## 3.70.0

- Lector MLBB hace ya casi todo sola: abres la app en la tablet, aceptas
  grabar la pantalla (Android pide ese toque cada vez) y se abre Mobile
  Legends. Lee el draft, te da tu pick en la burbuja y, al acabar, apunta la
  partida con su resultado y te avisa con el resumen.
- La tablet decide con tu maestría, como la app del móvil: la toma la
  última vez que abres la app y le suma lo que la tablet apunta después.
- Lo que apunta la tablet se sube solo a la base de datos de partidas con
  tu clave, y la próxima vez que abras la app del móvil aparece en tus
  partidas, así que no se pierde nada.
- Si no quieres que se abra el juego al empezar, en Lector MLBB → Ajustes
  hay un botón para quitarlo.
- Más seguro: cuando la tablet cambia de IP y la app la busca en la wifi,
  ya no le da el código de vinculación a cualquier aparato que conteste;
  primero la tablet demuestra que lo conoce sin que el código viaje. Hasta
  ahora, un aparato de tu wifi hecho a propósito podía quedárselo.

## 3.69.3

- La burbuja ya se quita en la partida aunque la app del móvil esté
  cerrada: la tablet echa un vistazo al minimapa cada 10 segundos mientras
  enseña algo. Antes solo se quitaba si alguien estaba leyendo, y con el
  móvil apagado nadie leía, así que se quedaba toda la partida.
- La tablet sigue leyendo el draft sola cuando cierras la app del móvil,
  sin tener que elegir la línea en «Sin móvil»: usa la línea que tienes en
  la app. Si en Lector MLBB tocas «Apagado», no lee sola.
- El parte de salud de la tablet dice qué hace la tablet por su cuenta (si
  lee, con qué línea y qué leyó la última vez), y avisa si no lee.

## 3.69.2

- La burbuja de la tablet dice en qué fase del draft cree que estás:
  «Fase de baneos» o «Fase de picks», delante de la segunda línea. Si no
  coincide con lo que ves en el juego, algo no se está leyendo bien.
- La burbuja ya no te tapa el juego: en cuanto la tablet ve que ha empezado
  la partida (el minimapa, dos veces seguidas), se quita sola, y vuelve en
  el draft siguiente. En Lector MLBB el botón de la burbuja lo dice
  («ahora: escondida mientras juegas»).
- Las dos cosas llegan cuando Lector MLBB se actualice (lo hace sola cuando
  no está leyendo).

## 3.69.1

- La base de datos de partidas ya está en marcha: en Ajustes → Partidas →
  «Base de datos de partidas», toca «Guardar mis partidas» y se suben
  todas; desde entonces, cada partida nueva se sube sola.
- Copia tu clave de jugador a tus notas: con ella recuperas tus partidas en
  otro móvil.

## 3.69.0

- Base de datos de partidas: tus partidas se pueden guardar junto a las de
  los demás jugadores, con una clave de jugador al azar (sin correo ni
  contraseña, y nada que ver con tu cuenta del juego). Está en Ajustes →
  Partidas → «Base de datos de partidas», y desde que la activas cada
  partida se sube sola.
- Con tu clave te traes tus partidas a otro móvil, y puedes borrarlas de la
  base de datos cuando quieras.
- «Ver con las partidas de todos» dice si la app ayuda, sin mezclar
  jugadores: siguiéndola frente a ir por libre dentro de cada uno, contra el
  winrate de siempre de cada uno, solo con las que apuntó el lector, y si la
  probabilidad que enseña acierta.
- Para ponerla en marcha hace falta un proyecto gratuito de Supabase: la
  guía paso a paso está en docs/comunidad.md, y la dirección y la clave
  pública se publican desde Administración.

## 3.68.1

- La burbuja de Lector MLBB en la tablet ya sale. No salía nunca: Android
  no dejaba a la APK hablar con su propio lector (el que corre dentro de
  ella), así que la burbuja nunca recibía tu nº1. Por lo mismo el paso
  «el móvil ya lee» de la guía no se marcaba.
- En la APK, el botón de la burbuja dice cómo va («ahora: enseñando»,
  «esperando consejo»…), y si algo la vuelve a impedir, el parte de salud
  de la tablet lo avisa.

## 3.68.0

- La app aprende de cada partida que apuntas: junto a la estimación del
  draft sale «Para ti: 63%», lo que de verdad te espera a ti con ese pick.
  Con tus partidas se ve que ganas más de lo que da el modelo (62% de
  media, el modelo decía 54%), y el número se ajusta a eso. Se activa a
  partir de 30 partidas con estimación y se recalcula solo con cada una.
- El orden de las recomendaciones no cambia por esto: lo que adapta tus
  picks a tu juego sigue siendo tu maestría, que también aprende de cada
  partida apuntada.

## 3.67.0

- Cada héroe tiene su ficha. En Ajustes → Meta, toca un nombre y verás:
  - su winrate, pick y ban en tu rango, y su winrate en cada línea que
    juega;
  - a quién gana y quién le gana;
  - con quién combina mejor y peor;
  - su tier y cómo se ha movido esta semana.
  Toca cualquier héroe de sus listas para ir a su ficha. Son los mismos
  datos con los que la app decide.

## 3.66.0

- Lector MLBB ya funciona sin el móvil: decide ella sola y te dice el pick
  en la burbuja, en el mismo aparato donde juegas. En la pantalla de Lector
  MLBB, en «Sin móvil», elige tu línea. Desde ahí, mientras graba, la tablet
  lee el draft, lo pasa al mismo motor que Pick Assist y pinta en la
  burbuja a quién banear en los baneos y tu nº1 con los dos siguientes en
  los picks.
- Si Pick Assist del móvil está leyendo, manda el móvil, como hasta ahora.
  Con el móvil, además, se apuntan las partidas y suena la voz.
- En partida solo mira si sigue la partida (el minimapa, un instante): no
  reconoce caras mientras juegas, para no meter lag.
- Los datos (winrates, cruces) vienen dentro de Lector MLBB y se ponen al
  día solos cada 6 horas desde la web de Pick Assist.

## 3.65.5

- La pantalla de Lector MLBB ya no queda tapada por la barra de arriba.
  Android 15 dibuja las apps por debajo de la barra de estado y de la de
  abajo, y las primeras frases se quedaban escondidas. Además, en la tablet
  la pantalla va en dos columnas (la guía a un lado; el QR y los ajustes al
  otro), cada bloque en su tarjeta, y arriba dice la versión instalada.
- En la fase de baneos, la burbuja de la tablet dice a quién banear (los
  tres primeros que sugiere la app) y te recuerda tu nº1 de ese momento.
- Cuando la app se actualiza sola, la versión del pie lleva «nuevo» hasta
  que abres las novedades.

## 3.65.4

- Si la tablet cambia de dirección en la wifi, Pick Assist la encuentra sola.
  El router le da otra IP de vez en cuando (de la .116 pasó a la .112), y
  había que volver a escanear su QR. Ahora, si no contesta, la app la busca
  por la wifi al abrirse y cada 5 minutos, y se vincula a la nueva. El código
  de vinculación solo se manda al aparato que contesta como Lector MLBB.
- Lector MLBB se actualiza con esta versión: una pregunta sin código (la
  búsqueda) ya no cuenta como intento fallido.
- Las publicaciones ya no se cancelan cuando el bot de datos falla.

## 3.65.3

- Ajustes → Lector en la tablet siempre te dice algo de la tablet. Si no
  contesta, lo dice («La tablet no contesta en …»), te explica qué hacer y
  trae un botón «Volver a mirar». Antes solo salía «Vinculado…», sin más.
  Si contesta pero no se sabe cuál es la última publicada, te dice al menos
  tu versión.
- Con la API fallando a ratos, los cruces ya no salen mezclados. Si un
  héroe no llegaba, su fila se quedaba la de ayer y la de los demás era la
  de hoy, y el «A contra B» dejaba de cuadrar con el «B contra A». Ahora la
  fila de ayer se completa con lo de hoy. Esto también paraba la
  publicación de esta versión.
- Las caras de un draft que el lector no leyó se suben al proyecto una sola
  vez. Al reabrir la app con el draft completo se volvían a subir, a veces
  con todos los nombres en «?» porque el catálogo aún no había cargado.

## 3.65.2

- Pick Assist te dice si tu Lector MLBB está vieja. En Ajustes → Lector en
  la tablet sale qué versión tienes y, si hay una más nueva, un botón para
  descargarla. Las anteriores a la 3.64.0 no se actualizan solas, y las
  anteriores a la 3.63.0 tampoco dicen cómo están: el parte de anoche
  decía «Todo bien» con todo en «?». Ahora lo dice como aviso.
- El parte de salud de la tablet ya no se sube dos veces si tienes la app
  abierta en dos sitios a la vez.

## 3.65.1

- La Administración enseña al momento lo que acabas de cambiar. Antes leía
  la copia de la web, que tarda unos minutos en ponerse al día tras cada
  cambio: al volver a abrirla veías lo de antes («abierta» después de pedir
  clave), y un segundo cambio podía deshacer el primero. Ahora lo lee del
  repositorio con tu token, y cada cambio parte de lo último guardado.
- Arreglado: «Pedir clave para entrar» borraba tu clave pública y dejaba la
  app abierta. Tu clave está restaurada; vuelve a pulsar «Pedir clave para
  entrar» si lo quieres. Si alguna vez faltara la pública, la Administración
  lo dice y la vuelve a poner sola.
- Si ya hay una clave de administrador publicada, «Crear» te avisa antes de
  pisarla: crear otra deja sin valor todas las claves que diste. Lo normal
  es pegar tu copia de seguridad.

## 3.65.0

- La app puede ser solo por invitación: decides quién la usa. En Ajustes →
  Administración (solo te sale a ti, con tu token de GitHub) creas tu clave
  de administrador, das una clave a cada persona con su nombre y, si
  quieres, cuántos días vale, y se la mandas como enlace: al abrirlo, entra.
  Puedes quitársela cuando quieras. Mientras no actives «Pedir clave para
  entrar», la app sigue abierta para todos como hasta ahora.
- Guarda la copia de seguridad de tu clave de administrador fuera del
  móvil: sin ella, al cambiar de móvil tendrías que crear otra y las claves
  que diste dejarían de valer.
- El proyecto tiene licencia: PolyForm Noncommercial. Se puede usar,
  copiar y modificar, pero no para ganar dinero con él.

## 3.64.1

- La tablet ya puede reconocer si ganaste o perdiste. Lector MLBB empezó
  de cero y no tenía nada de lo que el lector de Termux había aprendido
  (cómo se ven la VICTORIA y la DERROTA en tu tablet y las caras de tus
  compañeros). Por eso veía la tabla del final y no se atrevía a decir el
  resultado. Nuevo botón en Pick Assist → Ajustes → Lector en la tablet:
  «Pasar a la tablet lo aprendido en Termux». Abre antes Termux y escribe
  `lector`. Sin Termux también aprende sola: cada partida que apuntes a
  mano le enseña cómo es ese final.

## 3.64.0

- «Lector MLBB» se actualiza sola, sin preguntar: al abrirla o al dejar de
  leer mira si hay una versión nueva en GitHub y la instala. Nunca mientras
  lee, para no cortarte una partida. La primera vez Android aún te pide
  confirmar; desde ahí, ya no.
- «Lector MLBB» trae una guía paso a paso para quien la instala por primera
  vez. Cada paso se marca solo cuando está hecho y tiene su botón al lado:
  avisos, ahorro de batería, burbuja, empezar a leer y vincular el móvil.
- El README explica cómo instalar y usar Lector MLBB, qué hace y qué no.

## 3.63.0

- La tablet manda un parte de salud al proyecto, sin que hagas nada. Con la
  subida de partidas activada, la app del móvil pregunta a «Lector MLBB»
  cómo va y lo sube a una incidencia «Salud de la tablet»: uno al día si va
  bien, y en el acto si algo falla (un cierre por memoria, la grabación
  parada, capturas que fallan, el ahorro de batería). Así se ve si todo va
  bien sin pedirte capturas. No lleva ni tu código ni la IP de casa.
- El Diagnóstico enseña también esa salud: lecturas, fallos, memoria y
  permisos de la tablet.

## 3.62.0

- Tu nº1 sale en la tablet, encima del juego. Una burbuja pequeña con tu
  pick y los dos siguientes, que se pone al día sola mientras metes el
  draft: ya no hace falta mirar el móvil. No se puede tocar (los toques
  pasan al juego) y en «Lector MLBB» eliges dónde va, o quitarla. La
  primera vez hay que darle el permiso de mostrarse sobre otras apps.
- Al apuntar cada partida, la tablet te avisa con un resumen: con quién
  jugaste, si era el nº1, qué os daba el modelo y cómo vas en las últimas.
- «Lector MLBB» se actualiza sola: si hay una versión nueva sale un botón
  «Actualizar», y Android te pide confirmar. Se acabó descargarla a mano.
  Esta vez todavía hay que instalarla a mano; desde aquí, ya no.

## 3.61.5

- «Lector MLBB» dice por qué se cerró la última vez: si Android la cerró
  por falta de memoria, por el ahorro de batería o por un fallo del lector.
  Sale en su pantalla y en el Diagnóstico de la app del móvil.
- Nuevo botón en la tablet para que el ahorro de batería no la cierre con
  el juego delante.
- Gasta algo menos de memoria mientras graba la pantalla.

## 3.61.4

- El Diagnóstico dice ahora cómo está el lector: si es el de la tablet o el
  de Termux, si contesta en este momento, lo que ha aprendido y cómo fue la
  última lectura. Si no contesta, dice qué hacer. Así, «Copiar» basta para
  saber por qué no lee, sin capturas de Termux.
- Si la tablet cambia de dirección en la wifi, el aviso de la app ya dice
  que vuelvas a escanear su QR.

## 3.61.3

- La app estrena icono, a juego con el de «Lector MLBB»: el mismo escudo
  dorado, con la diana de siempre dentro. Si la tienes instalada, Android lo
  cambia solo al actualizarse (a veces tarda un día; desinstalar e instalar
  lo cambia en el acto, sin perder nada si antes copias tu perfil).

## 3.61.2

- «Lector MLBB» estrena icono: un escudo hexagonal dorado con un ojo que
  lee, sobre azul noche. Se adapta a la forma de icono de tu Android, y la
  notificación usa su silueta.

## 3.61.1

- «Lector MLBB» ya abre en la tablet. Se cerraba nada más abrirla porque le
  faltaba una pieza de Android que necesita el lector. Y si algún día vuelve
  a cerrarse, al abrirla otra vez enseña por qué.

## 3.61.0

- El lector puede ir dentro de la tablet, sin Termux. La nueva app «Lector
  MLBB» se instala en la tablet y lee el draft de su propia pantalla, con
  el permiso normal de grabar pantalla: ya no hace falta la depuración
  inalámbrica, ni emparejar, ni puertos que cambian.
- Para vincularla, escanea con la cámara del móvil el QR que enseña la app
  de la tablet. La app del móvil se abre ya vinculada y con «Leer solo»
  encendido. También se puede escribir a mano en Ajustes → «Lector en la
  tablet».
- Solo la app vinculada puede pedirle nada a la tablet: hace falta el
  código, y tras varios códigos equivocados se bloquea unos minutos.
- Termux sigue valiendo. En Ajustes, «Usar el de Termux» vuelve a él.

## 3.60.9

- El lector vuelve a encontrar la tablet solo cuando cambia el puerto de
  la depuración inalámbrica. Probaba 1.024 puertos a la vez, más de los
  que Termux deja abrir, y muchos salían cerrados sin estarlo; entre ellos
  el de tu tablet. Ahora prueba menos a la vez, baja el ritmo si el móvil
  no da más y vuelve a probar los que no pudo comprobar.

## 3.60.8

- Las partidas de tu historial del juego ya no se borran nunca. La app
  guarda como mucho 500 partidas, y al pasar borraba las más viejas, que
  eran justo las de tu historial. Ahora el límite solo recorta las
  apuntadas con la app; esas siguen guardadas en el proyecto aunque salgan
  del móvil.

## 3.60.7

- Gané y Perdí tienen «Deshacer». Si te equivocas al apuntar una partida,
  durante unos segundos puedes deshacerlo: la partida se borra y el draft
  vuelve como estaba. Antes había que buscarla en Ajustes.
- Tu pick fijado ya no desaparece con «Mis héroes»: sigue arriba aunque aún
  no tengas partidas con él.
- La maestría ya no pierde filas sin avisar. Si rellenas las partidas sin
  el winrate (o al revés), el campo que falta sale en rojo y la hoja no se
  cierra hasta que lo completes. Guardar sin tocar una fila ya no le
  cambia los números.
- «Pick claro» sale solo cuando el nº1 saca de verdad 2 puntos al
  siguiente. Antes bastaba con 1,5 y salía en uno de cada cuatro drafts.
- Arreglado un «Deshacer» de «Nuevo draft» que podía volver a salir tras
  apuntar una partida y devolver el draft viejo.

## 3.60.6

- El lector ya no se queda atascado en la tablet «offline». Cuando apagas
  y enciendes la depuración inalámbrica, adb se queda con la conexión
  vieja y seguía contestando «ya conectada». Por eso el lector volvía al
  mismo puerto una y otra vez y nunca sacaba la captura. Ahora, si una
  captura falla, busca la tablet en otro puerto. Si no hay otro, Termux
  te dice qué escribir para soltar la conexión vieja.

## 3.60.5

- La app usa los datos más nuevos que tenga. Al abrirla sale al instante
  con los que guardó la última vez, también sin cobertura, y antes se
  quedaba con esos aunque ya hubieran llegado otros. Ahora, a los pocos
  segundos, vuelve a mirar y cambia a los nuevos.
- La línea «Pro» de las tarjetas cuenta bien:
  - Cecilion y Cici ya no se mezclan: 20 partidas de Cecilion contaban
    para Cici;
  - quita 8 partidas repetidas y 13 con un héroe dos veces, que eran
    erratas de la fuente;
  - reconoce a X.Borg y a Wanwan cuando la fuente los abrevia.
- El Diagnóstico ya no dice que tu maestría no se aplica cuando tienes un
  héroe justo en tu winrate medio.
- El Diagnóstico vigila más cosas:
  - comprueba que los cruces sean posibles, que A contra B y B contra A
    sumen 1 y que los nombres casen;
  - avisa de lo que la descarga dice que falló;
  - acaba con un resumen de todos los avisos.
- Una línea rota del historial de la vigilancia ya no lo vacía entero.

## 3.60.4

- La voz en partida ya no dice frases que contradicen sus cifras. Salía
  «cada minuto juega para ellos: bajáis al 66%» o «solo un 59%, aguantad»
  en uno de cada cuatro drafts. Tampoco afirma cómo va la partida por
  minutos con solo uno o dos enemigos a la vista.
- El lector ya no se bloquea tras «Nuevo draft». Si metías un héroe a mano
  antes de su primera lectura, tiraba todo ese equipo hasta el siguiente
  draft. Y una lectura que llega tarde, del draft anterior, ya no entra en
  el nuevo.
- El lector ya no aprende tu cara con un nombre equivocado. Cuando la
  partida se apunta sola sin tu pick fijado, la app ya no le dice que
  jugaste el nº1, que solo era una suposición.
- Dos correcciones del lector a la vez ya no se pisan.
- Los baneos sugeridos ya no proponen banear tu pick fijado, y cuentan sus
  cruces como de tu equipo.
- «Copiar» del Diagnóstico avisa cuando no puede copiar: deja el texto
  seleccionado y dice «mantén pulsado y copia».
- Seguridad de los bots:
  - lo que llega de la API de datos ya no puede convertirse en código
    dentro de la app;
  - tampoco puede escribir imágenes fuera de su carpeta;
  - los bots que no suben nada ya no guardan su credencial mientras
    ejecutan el código.

## 3.60.3

- Cada partida que apuntas guarda qué versión del modelo dio su
  probabilidad. Así se puede medir si la versión de hoy acierta sin
  mezclarla con las de antes. Las partidas viejas se reparten solas por su
  fecha.
- La calibración dice aparte la del modelo de hoy, en «Tus partidas», en el
  Diagnóstico y en la respuesta del bot. Por ahora son 25 partidas con
  previsto 55% y ganadas 56%. Mezcladas con las de antes salía previsto 54%
  y ganadas 63%, porque las versiones viejas se quedaban más cortas.

## 3.60.2

- El bot de datos ya no se queda con la ruta mala de cruces. Desde el 20
  de octubre una ruta de la API da solo 10 rivales por héroe. Si al
  medirlas falla la buena, ahora la reintenta, y si aun así llega una fila
  corta, cambia de ruta en plena corrida. Antes los cruces dejaban de
  actualizarse sin avisar.
- El bot ya no tira los cruces nuevos porque falten los winrates. Si la
  API da la matriz entera pero falla en los winrates de tu rango, se
  guardan los cruces y builds nuevos y se conservan los winrates de antes,
  con su fecha. Hoy ha pasado justo eso.
- Tus partidas se siguen subiendo cuando haya muchas. Cada subida manda
  las 200 más recientes: con todas, el mensaje pasaría del límite de
  GitHub hacia las 350 partidas y dejaría de subirse para siempre. El
  proyecto no pierde ninguna, porque las junta con las que ya tenía.
- Una partida apuntada sola por el lector ya no cierra la hoja que tengas
  abierta (maestría, partidas, diagnóstico) ni borra lo que estabas
  escribiendo.
- Quitar una partida del historial deja «Deshacer» unos segundos: la × está
  pegada a ⇄ y un toque de lado la borraba sin vuelta atrás.
- Al cambiar de línea, tu pick fijado se suelta si no se juega en la línea
  nueva. Antes seguía en «Tú» y «Apuntar partida» lo guardaba sin verse.
- El Diagnóstico ya no se queda colgado sin red: espera como mucho 4
  segundos.
- La respuesta del bot a tus partidas:
  - dice aparte cómo te va en las que apuntó el lector solo, que no tienen
    el sesgo de apuntar más las ganadas;
  - cuenta los meses en tu hora.
- Las lecturas que no reconocen a nadie ya cuentan en lo que tarda el
  lector.
- Datos del 20 de octubre: matriz de cruces y parejas nueva entera, tier
  list y builds de hoy. Los winrates siguen siendo los del 19, porque la
  API no los dio.

## 3.60.1

- Los cruces ya no se pueden estropear por un cambio de la API. Desde el
  20 de octubre la API da solo 10 rivales por héroe en una de sus rutas,
  y con la API fallando el bot habría cambiado 58 filas completas por
  filas de 10. Ahora una fila mucho más corta que la guardada no la
  sustituye.
- La edad de los datos dice la verdad. Si los cruces son más viejos que
  los winrates, la cabecera y el pie cuentan la edad de lo más viejo y se
  marcan «viejos». Antes ponía «0 h» aunque los cruces fueran de hace
  semanas. El pie dice aparte de cuándo son los cruces.
- La tier list: si mlbb.gg no da la tier de algún héroe, se queda con la
  anterior. Antes ese héroe se quedaba sin tier. Y el diagnóstico avisa
  justo cuando la app la deja de enseñar, también si viene sin fecha.
- Lector: las caras «aprendidas» que en realidad eran el icono de un hueco
  vacío se borran solas. Ya no cuentan como compañeros aprendidos ni le
  quitan sitio a las caras buenas.
- «Para tus compañeros» va siempre tras la tarjeta del héroe del que habla,
  también con «Sinergia» puesto.
- El punto verde de «lo puso el lector» ya no sale en un héroe que quitaste
  y volviste a meter a mano.
- «Sinergia» se apaga sola si te quedas sin compañeros, en vez de volver
  activada con el siguiente.

## 3.60.0

- Las sinergias se ven en cada recomendación: cada tarjeta dice con qué
  compañero de tu equipo combina mejor ese héroe y cuántos puntos rinden
  juntos por encima de una pareja normal («mejor pareja: Chou +2,1»).
- Botón «Sinergia» junto a «Mis héroes»: ordena las tarjetas por cómo
  encajan con tu equipo. El número y el porcentaje de cada una no cambian;
  otro toque vuelve al orden de siempre.
- La nota no le da más peso a las sinergias, a propósito: medido en 2.770
  partidas profesionales, darles el doble de peso acierta peor, y en tus
  182 partidas no predicen si ganas.

## 3.59.6

- Los datos del meta vuelven a actualizarse dos veces al día. Desde el 10
  de octubre la API de datos falla a ratos al dar los cruces y las
  parejas, y por eso el bot tiraba la actualización entera, también los
  winrates nuevos: 13 de cada 16 se perdieron, y el nerf de Rafaela tardó
  días en llegar. Ahora se guardan las estadísticas nuevas y se conservan
  los últimos cruces buenos, con su fecha; el diagnóstico avisa si pasan
  de una semana.
- La tier list de mlbb.gg, que bloquea al bot de GitHub, se baja aparte
  con una tarea programada fuera de GitHub.

## 3.59.5

- El lector lee a tus compañeros de siempre desde la primera partida: trae
  de serie las caras de Gord, Selena y Kadita con las skins que llevan tus
  amigos, y la de tu Diggie, sacadas de tus drafts del 10 al 19 de octubre.
  Gord salía siempre «?».
- Arreglado: el lector podía tomar tu hueco vacío (el cuadro azul que sale
  antes de que elijas) por Estes y meterlo como tu pick. Ya no lo aprende,
  y si ya lo había aprendido en tu móvil, deja de usarlo solo.

## 3.59.4

- La tier list de mlbb.gg está al día (19 de octubre): Rafaela baja de SS a
  S tras el nerf, Estes sube a SS y cambian otros 47 héroes. La anterior
  era del 4 de octubre: desde entonces mlbb.gg no deja descargarla al bot
  y la app seguía enseñando la vieja sin avisar.
- Una tier list de más de dos semanas ya no se enseña en las tarjetas ni en
  Meta, y el diagnóstico avisa en cuanto pasa de una semana.
- Los winrates ya recogían el nerf: Rafaela baja en Gloria del 58% al
  54,7% en los últimos tres días, y la app ya la recomendaba con eso.

## 3.59.3

- El lector reconoce a Minotaur de rival. Tu juego lo pinta con un dibujo
  nuevo (rojo, con cuernos) que la cara de la API todavía no tiene, y se
  quedaba siempre en «?». Ahora lleva su cara sacada de tus propias
  capturas.

## 3.59.2

- Los diez huecos de baneo van siempre en dos filas de cinco; en algunos
  móviles salían seis y cuatro, de tamaños distintos.
- El héroe baneado se ve en gris, y la × de quitarlo ya no sale tachada.
- La pista de la fase de baneos cabe en dos líneas, y la cabecera de los
  baneos probables («más baneados en Gloria») ya no se parte en el móvil.
- Las cuentas del lector («sin encontrar», «aprendidos») cuentan cada héroe
  una vez por partida: antes contaban una vez por captura mirada y salían
  hasta el triple (Minotaur 14 donde eran 5).

## 3.59.1

- En la hoja «Plan y objetos» hay dos botones fijos arriba, «Plan» y
  «Objetos», que te llevan a cada parte: con el draft completo los objetos
  empezaban pantalla y media más abajo.
- Las tarjetas son más cortas: los motivos van debajo, a todo lo ancho, y
  ya no se parten en dos líneas cada uno. «Plan y objetos» pasa al pie de
  la tarjeta, a la derecha.
- En español los decimales llevan coma: «57,1%», «−4,5 puntos».

## 3.59.0

- Las caras del draft se ven más grandes (30 px en vez de 22), también en
  móviles de 360 px. Para marcar a tu rival basta con tocar su cara: el
  circulito ○ de al lado ya no está. La × sigue quitando.
- Lo que metió el lector de la tablet lleva un punto verde en la esquina
  del hueco, para revisar de un vistazo lo que no pusiste tú.
- «Ajustes» y «Para tus compañeros» llevan una flecha que gira al abrirlos;
  antes, cerrados, parecían títulos de una sección vacía.
- La línea de partidas profesionales de cada tarjeta ocupa una línea en vez
  de tres («Pro 57% · 248 picks»). Deja fuera cuántas veces lo banean los
  profesionales, que es lo que menos te dice en tu draft.

## 3.58.1

- El lector ya no puede aprender como cara de un compañero el icono de
  «eligiendo» (la mano blanca sobre azul) que sale en el hueco de quien
  aún no ha elegido. Con 3.58.0, si un amigo elegía el último en dos
  partidas, se podía quedar con ese icono como su cara y leerle en
  cualquier hueco vacío. Lo que se hubiera aprendido así se descarta solo.
- Tampoco aprende una cara que se parezca a la ya aprendida de otro héroe
  (un cambio de héroe entre compañeros, o una corrección mal puesta).

## 3.58.0

- El lector aprende las caras de tus compañeros. Cuando apuntas una
  partida, aprende la cara de tu fila (tu héroe) y, si de tus cuatro
  compañeros reconoce a tres, la del cuarto. Una cara se empieza a usar
  cuando la ve igual en dos partidas distintas, así que los que juegan
  contigo a menudo con la misma skin (Selena, Gord, Kadita…) se leen solos
  a partir de la segunda partida. Medido con tus capturas del 10 al 14 de
  octubre: 15 compañeros más leídos y ninguno equivocado.
- El lector no aprende de tu equipo con una captura que no es de esa
  partida (por ejemplo una de la partida anterior que seguía guardada).

## 3.57.7

- Desaparece el aviso de «133 héroes rehechos» del diagnóstico. Era un
  falso aviso: se había cambiado la forma de calcular la huella de cada
  kit y los datos guardados seguían con la antigua. Ya están al día, y el
  texto de las habilidades se comprobó héroe a héroe.
- Los objetos que dan crítico se reconocen aunque otra parte de la API
  diga primero otra cosa de ellos, así que el aviso de «van de crítico» de
  la build ya no se pierde.
- El diagnóstico avisa si los cruces que usa la app son de un rango que la
  última comprobación descartó, como pasa hoy con la API a ratos.

## 3.57.6

- La app ya no vuelve a datos más viejos al publicar un arreglo cuando la
  API de datos está caída. Si no se pueden descargar datos nuevos, se
  publica con los que la app ya estaba usando, siempre que sean más
  recientes que los guardados y pasen la misma comprobación. Esta mañana
  un arreglo hizo que la app pasara de los datos de hoy a los del lunes.

## 3.57.5

- Los datos se actualizan aunque la API falle a ratos. Al bajar los cruces
  de cada héroe, los que fallan se vuelven a pedir una vez al final, y así
  una mala racha de la API ya no tira la descarga entera. Esta mañana
  llegaron 106 de 133 héroes y se perdió todo lo demás que sí estaba bien:
  las estadísticas de hoy, los talentos y las builds.

## 3.57.4

- Los arreglos de la app se pueden publicar aunque la API de datos lleve
  más de tres días caída. Hasta ahora el despliegue se paraba si los datos
  tenían más de 72 horas, y eso solo impedía publicar código: la app ya
  estaba usando esos mismos datos. Ahora se publica igual y queda un aviso,
  y el diagnóstico sigue diciendo de cuándo son los datos.

## 3.57.3

- Los cruces y las parejas ya no vuelven a los de Gloria cuando la API
  falla a medias. Del 6 al 10 de octubre la app los sacaba de Mítico porque
  había medido que los de Gloria estaban rotos (pocas partidas tras el
  reinicio de temporada). El 11 y el 12 la API solo dejó bajar una parte de
  Mítico, no se pudo volver a comprobar y la app volvió a usar los de
  Gloria, los mismos que acababa de medir como rotos. Ahora, si no se puede
  comprobar, se sigue con lo que dijo la última comprobación. Se notará en
  cuanto el bot vuelva a traer datos: hoy la API sigue caída.

## 3.57.2

- Las caras de los héroes y los iconos de los objetos vuelven a bajarse
  del servidor del juego, con su calidad original. Desde el 11 de octubre
  la API las sirve a través de un proxy que las recomprime, y eso hizo que
  se bajaran de nuevo las 210 imágenes y que el lector avisara de que sus
  133 caras estaban desfasadas.
- El aviso de «héroe rehecho» vuelve a servir: saltaba con los 133 a la
  vez porque la huella del kit contaba las direcciones de las imágenes.
  El texto de las habilidades no había cambiado (comprobado héroe a héroe).

## 3.57.1

- Corregido antes de que llegara a los datos: la 3.57.0 habría tomado por
  antisanación objetos que no lo son (Rapid Boots, Starlium Scythe, Endless
  Battle), porque leía también sus estadísticas. Ahora las estadísticas se
  leen solo para el crítico.

## 3.57.0

- «Plan y objetos» marca la build que mejor encaja con tu draft, no siempre la
  más usada. Entre las builds que más se juegan con tu héroe, si otra ya
  lleva lo que este draft pide (defensa mágica contra cuatro magos,
  antisanación contra los que se curan…), sale arriba diciendo qué cubre; la
  más usada sigue debajo, marcada.
- Cada build enseña los tres talentos de su emblema, con su nombre. Antes no
  se veían y algunas builds salían repetidas: eran la misma con otros
  talentos.
- Dos avisos nuevos contra el draft: si dos o más enemigos usan escudos, te
  propone un objeto que los reduce (Sea Halberd, Glowing Wand, Dominance Ice);
  si dos o más van de crítico (lo dice la build que se les compra en tu
  rango), Blade Armor. Igual que los de antes, son consejo sacado de lo que
  dice cada objeto, no una medida de builds contra drafts.
- Tu habilidad con un héroe sale en la tarjeta con números que de verdad has
  jugado: «con la app lo llevas al 75% en 60 partidas», no una mezcla.

## 3.56.0

- Tu habilidad con cada héroe se cuenta ahora con tus partidas con la app,
  no con las de siempre. La app creía que Diggie era tu mejor héroe (54% en
  3.821 partidas de siempre), pero con la app vas al 46% con él y al 75% con
  Rafaela, al 68% con Estes y al 64% con Minotaur. Medido en tus 212
  partidas: tu winrate de siempre no predice cómo te va ahora, y el de
  ahora sí. Lo de siempre cuenta ya como mucho como 40 partidas por héroe,
  de punto de partida para los que casi no has jugado con la app. En tus
  drafts el nº1 cambia en 68 de 165: Rafaela pasa a ser la primera en 92
  (antes en 41). El Veredicto sigue comparando con tu winrate de siempre
  entero.
- «Leer solo» ya no se queda sin meter picks de un equipo a mitad de draft.
  Si tres jugadores enseñaban un héroe y luego cogían otro que el lector no
  reconoce, la 3.54.0 dejaba de leer a ese equipo hasta el draft siguiente.
- Con la voz callada, los avisos que esperaban en cola ya no cuentan como
  dichos.

## 3.55.0

- El lector reconoce más héroes en la fase de picks. Algunos (Hanabi,
  Johnson…) el juego los pinta más grandes de lo que el lector buscaba y se
  le escapaban, o salía otro en su lugar (Wanwan donde estaba Hanabi). Ahora
  busca también ese tamaño. Medido con las caras que subió el lector del 10
  al 12 de octubre: enemigos bien leídos de 59 a 64 de 90 huecos, sin ningún
  enemigo inventado (antes uno), y en tu equipo de 51 a 53 con la mitad de
  inventados. Cada lectura tarda un poco más (unas décimas de segundo).

## 3.54.0

- «Leer solo» ya no cambia los picks con lo que ve en la fase de skins. Al
  pasar a elegir skins, cada jugador sale con la suya y el lector «veía» a
  Wanwan, Esmeralda, Joy o Beatrix donde no estaban, y además quitaba por
  ellos al héroe bueno que ya había leído. Ahora, si cambian a la vez más
  jugadores de un equipo de los que pueden estar eligiendo (como mucho dos),
  esa lectura no toca a ese equipo.
- El lector aprende de las capturas del draft que mejor se leen, no de las
  últimas. Las últimas solían ser ya de la fase de skins y casi no aprendía
  nada; ahora mira las que más enemigos leen, que son las de los picks. Las
  imágenes de los picks que se suben para medir salen también de ahí.

## 3.53.0

- Botón «Voz» para callar los consejos en directo cuando no quieras que
  hable. Sale debajo de «Leer del juego» con «Leer solo» encendido: en la
  fase de baneos, en la de picks cuando el draft ya está completo (que es
  cuando habla) y siempre en Ajustes. Callada, el lector no dice nada más
  hasta que la vuelvas a activar, también en las partidas siguientes; la
  frase que esté sonando en ese momento sí acaba. Se recuerda al cerrar la
  app y, si el lector se reinicia, se entera solo.

## 3.52.0

- Cuando el lector no reconoce a algún héroe en los picks, la app sube a la
  incidencia de pantallas las diez caras de los picks de tus dos últimas
  capturas del draft, junto con lo que leyó en cada hueco. Es para medir por
  qué falla: los baneos se leen al 100%, pero de los picks solo 7 de cada 10
  enemigos y la mitad de tu equipo, y bajar el umbral no lo arregla. Solo
  van las caras, sin los nombres de los jugadores, y solo si tienes puesto
  el token de subida.
- El lector ya no se cae si falla el aprendizaje de una corrección (por
  ejemplo, si el móvil se queda sin memoria): contesta con un error y sigue
  leyendo.

## 3.51.0

- Cada tarjeta de la nº2 para abajo dice por qué no es la nº1: cuántos
  puntos le faltan, en qué pierde más y, si toca, en qué gana. Por ejemplo,
  «1.2 puntos por detrás de Rafaela: más flojo en general (−1.5), aunque
  mejores cruces (+0.6)». Si la diferencia cabe en el ruido del modelo,
  dice que están empatados. Es como el «por qué no este» de los asistentes
  de draft de LoL. Con 300 drafts de roam, la nº2 sale empatada en el 29%;
  en el resto, un solo motivo explica casi toda la diferencia en 3 de cada
  4. La nº1 no cambia ni un píxel.

## 3.50.0

- La hoja «Meta» dice quién sube y quién baja esta semana en tu línea, y
  cuántos en todo el juego, como el «trending» de mlbb.io. Solo cuenta un
  cambio de un punto o más de winrate respecto a lo que se juega, y que se
  vea en Gloria y en Mítico a la vez: tras el reinicio Gloria se rellena y
  casi todos «subían» juntos, y eso no dice nada de ningún héroe. Con el
  parche asentado de septiembre no salía casi nadie, que es la verdad: el
  meta estaba quieto. Hoy, en roam, sube Minsitthar y bajan Chip, Baxia,
  Helcurt, Mathilda y Selena. Es lo que ha pasado, no una predicción, y no
  cambia ninguna recomendación.
- Para eso los datos guardan una foto al día de los últimos diez días
  (unos 13 KB más al descargarlos).

## 3.49.0

- «Tus partidas» revisa tu último draft: con el draft entero, ¿había en tu
  línea un pick con más probabilidad que el que cogiste, y cuánta? Con un
  botón revisa todos y dice en cuántos cogiste el mejor (o uno empatado),
  cuánto dejaste de media y, con 10 partidas de cada tipo, si dejar el
  mejor se nota en lo que ganas, con su margen. Es como la revisión de
  DraftGap en LoL. Con tus 136 drafts: el mejor o empatado en 51, uno
  claramente mejor en 44, y en esos ganaste el 64% frente al 60% del resto
  (+4 ± 18): no se nota. Es una lectura a toro pasado y lo dice: al elegir
  veías menos enemigos.

## 3.48.0

- «Tus partidas» trae «Tus números»: tu racha, la sesión de hoy, cómo
  juegas justo después de perder, por hora, por duración y con cada héroe,
  siempre con su margen. Es lo que enseñan los rastreadores de partidas de
  otros juegos, con la regla del Veredicto: nada se afirma mientras quepa en
  el azar. Con tus 182 partidas: después de perder ganas el 63% y después de
  ganar el 64% (perder no te afecta), antes de las 18 h el 49% frente al 65%
  del resto (cabe en el margen todavía) y Rafaela 73% en 56, entre 60 y 83%.
  Un héroe se marca en verde o en rojo solo si su margen deja fuera tu media.

## 3.47.0

- En «Tus partidas» ya puedes cambiar el héroe de una partida: toca su nombre y elige con quién jugaste. Hasta ahora solo se podía cambiar el resultado, y una partida apuntada con el héroe equivocado (como la de Hayabusa del 6 de octubre, que fue con Diggie) se quedaba así o había que borrarla. La estimación de esa partida se quita, porque era la del otro héroe; el resultado y el draft se quedan. El cambio se sube solo al proyecto.

## 3.46.1

- El lector ya no te pone un héroe de otra línea como tu pick. El 6 de octubre leyó tu fila como «Hayabusa» en una partida de roam: la voz se calló en esa partida y se apuntó con Hayabusa. En tus 134 partidas solo esa tiene tu héroe fuera de tu línea, así que ahora lo que lea en tu fila solo cuenta si es de tu línea.

## 3.46.0

- Si empieza la partida y en el draft falta alguien, la app lo da por cerrado sola y arranca todo igual: la voz, la duración y el resultado apuntado solo. Antes todo eso esperaba a tener los cinco enemigos y los cuatro compañeros, y si el lector no leía a un compañero no arrancaba nada: el 7 de octubre pasó en 2 de tus 6 partidas. Ahora, en cuanto el lector ve el minimapa en dos lecturas seguidas, el draft se cierra con lo que tenga, se sabe cuándo empezó la partida y deja de capturar la tablet mientras juegas. Si luego metes al que faltaba, sigue siendo la misma partida.

## 3.45.1

- La duración de cada partida vuelve a guardarse, y la voz dice al final cómo os iba según lo que duró. El lector empezaba a buscar el inicio de la partida un minuto después de completar el draft, y la partida empieza antes (en la del 6 de octubre a las 22:25, entre 15 y 55 segundos después): como ya la veía empezada, daba el inicio por estimado y ninguna de las cuatro partidas de esa tarde se apuntó con su duración. Ahora mira desde que completas el draft.

## 3.45.0

- El lector prueba a pedir la captura de la tablet sin comprimir y se queda
  con la que vaya más rápida en tu tablet y tu wifi. Hasta ahora casi 4 de
  los 5 segundos de cada lectura eran la captura: la tablet comprimía la
  imagen antes de mandarla. Las primeras lecturas alternan las dos formas, y
  después usa la más rápida y de vez en cuando vuelve a probar la otra.
- Si la captura sin comprimir falla o tu tablet la da en un formato que no
  sabe leer, la lectura sale igual con la de siempre y el lector deja de
  probarla hasta que lo reinicies.
- Solo en las lecturas del draft: durante la partida (inicio y final) sigue
  la captura comprimida, para no cargar la wifi mientras juegas.
- Tus partidas subidas dicen cuánto tarda cada forma (lo verás en la
  respuesta del bot y en el diagnóstico). Para estrenarlo, reinicia el
  lector con `lector`.

## 3.44.2

- Las partidas profesionales cuentan dos baneos que se perdían: Mathilda
  escrita «matilda» en Liquipedia, y el baneo que no se hizo a tiempo
  («default»), que ya no sale como nombre desconocido en el diagnóstico.

## 3.44.1

- Los consejos en directo ya no hablan de un héroe que no juegas: si tu pick
  fijado no es de tu línea, la voz se calla en vez de darte el plan del nº1.
  Y si eliges el último, el lector sigue mirando tu fila un minuto y medio
  después de completar el draft, para saber con quién juegas.
- Corregir un enemigo o un compañero con el draft ya completo (la × y meter
  al de verdad) ya no reinicia la vigilancia de la partida: antes el lector
  volvía a decir el aviso del inicio, retrasaba todos los consejos y perdía
  las pantallas del final.
- Con la partida acabada, la voz se calla: al ver la tabla del resultado
  (también la de victoria que aún no conoce) y al apuntar la partida en la
  app aunque el lector no viera la tabla.
- Las partidas de más de 23 minutos también se miden: con el inicio visto, el
  lector vigila hasta el minuto 40 de partida en vez de hasta el 25 del draft.
- Si al empezar a mirar la tablet ya estaba en partida, el inicio se da por
  estimado: esa duración no se apunta ni se dice un cierre que podría ser de
  otro tramo.
- Tras recargar la app con el draft completo, el lector ya no recibe un guion
  vacío antes del bueno (se perdía el aviso del minuto en que llegaba).

## 3.44.0

- Consejos en directo por voz: con «Leer solo», el móvil te va diciendo en
  voz alta qué hacer según el minuto de la partida. Al empezar te dice con
  cuánto salís, tu cruce y el focus. A los 5 minutos, lo de las peleas. Y
  luego, según vuestras fases: cuándo es vuestro momento, cuándo empieza a
  jugar en contra cada minuto, cuándo se pone la partida de un lado y qué
  pasa pasado el 20. Suena por el altavoz o los auriculares del móvil, con
  el móvil en el bolsillo.
- Para oírlos hace falta, una sola vez, la app Termux:API (de F-Droid) y en
  Termux `pkg install termux-api`. Sin ella todo funciona igual pero no
  suena, y la app lo dice debajo del botón del lector.
- El lector sabe cuándo empieza la partida: mira la tablet desde el minuto 1
  después del draft, una vez cada 20 segundos, y la reconoce por el minimapa.
  Sigue siendo solo una captura de pantalla; no toca nada.
- Al acabar te dice cuánto duró y qué probabilidad os daba el modelo para
  ese final, y la partida guarda su duración. Con eso el informe de tus
  partidas mide si las fases aciertan en tus partidas, no solo en las
  profesionales.
- Las pantallas de la partida que se suben al proyecto llevan ahora un
  recorte del marcador a resolución completa. Con unas cuantas, el lector
  aprenderá a leer las muertes de cada equipo y los consejos podrán contar
  cómo va la partida.

## 3.43.2

- El plan de partida ya no se contradice. Si le ganas el cruce a tu rival
  de línea, ya no te dice a la vez que «no regales nada al principio»; si
  te lo gana, no te dice «juega agresivo»; y si el equipo es de partida
  larga, tampoco. Manda lo más concreto: tu cruce y, después, el plan del
  equipo. «Cuidado con X al principio» ya no se dice de tu rival ni de
  alguien al que le ganas claro.
- «A partir del minuto X…» usa el último momento en que la partida cambia
  de lado, y solo si va en el mismo sentido que las barras. Antes podía
  decir «van por delante ellos desde el 12» con las barras al 57–69% desde
  el 16.
- Lo que el plan afirma de las fases necesita ya algo de draft delante. El
  cambio de lado y «vais por detrás» piden tres héroes por bando; «el más
  fuerte de los suyos» pide al menos dos.
- El rival de línea que marcas se lee con su curva de TU línea, no con la
  de otra línea suya.
- «Su carta para el final» ya no choca con el focus: dice que no le dejéis
  farmear, no «id a por él antes que a nadie».
- Si una descarga no trae las curvas por duración o el winrate por línea y
  se quedan los de antes, el diagnóstico lo dice.

## 3.43.1

- Los datos ya no se publican como de hoy si una parte importante viene de
  una descarga anterior: las estadísticas de Mítico (con las que la app
  decide qué rango puntúa tras un reinicio de temporada) o las parejas
  («combina bien con»). Con Mítico de hace días la app podía cambiar de
  rango por su cuenta: el nº1 de roam cambiaba en 112 de 300 drafts sin que
  nada lo dijera. Ahora esa corrida no se publica y el diagnóstico dice qué
  faltó.
- El diagnóstico ya no avisa de «dos poblaciones mezcladas» cuando las
  estadísticas y los cruces son del mismo rango, y dice si la fuerza de los
  héroes sale de un rango que la última descarga no trajo.
- La cuenta de aciertos del lector compara cada cosa leída con su lado del
  draft: un enemigo leído como compañero ya no cuenta como acierto (el
  acierto real de tus partidas era 92,0%, no 93,6%).
- El informe de tus partidas dice por qué no pudo re-puntuar los drafts en
  vez de decir que no hay ninguno.

## 3.43.0

- El plan de partida dice ahora cómo va a ir la partida según el minuto en
  que acabe: «Plan y objetos» de cualquier héroe enseña tu probabilidad de
  ganar si acaba entre el 10 y el 12, el 12 y el 14… o pasado el 20, en seis
  barras, y si sois más fuertes al principio o al final («95% si acaba antes
  del 12, 48% si pasa del 20: cuanto antes se cierre, mejor»). Sale de cómo
  gana cada héroe de ese draft según lo que dura la partida en tu rango, con
  un peso medido contra 2.268 partidas profesionales: predice de verdad
  quién gana las partidas cortas y las largas.
- El plan va por etapas: qué hacer al principio (si tu héroe es de partidas
  cortas o largas, tu rival de línea y si le ganas el cruce, con quién ir y
  de quién cuidarte), en las peleas, al final (su carta para el final, la
  vuestra y en qué minuto cambia la partida de lado) y los problemas que vas
  a tener. «Cerrad pronto» y «aguantad» para el chat de voz salen ahora de
  esos datos y no de etiquetas escritas a mano.

## 3.42.1

- Las herramientas que usan los procesos automáticos del proyecto (publicar
  la app, traer los datos, vigilar, guardar tus partidas) van ahora fijadas
  a una versión exacta que no se puede cambiar por detrás. Antes cogían
  «la última de la serie», que quien mantiene cada herramienta podía
  sustituir por otra sin avisar; ahora, para cambiarla, hay que hacerlo
  aquí. En la app no cambia nada.

## 3.42.0

- «Deshacer» ya deshace del todo: si vacías el draft con «Nuevo draft» y lo
  devuelves, las pantallas del final de esa partida siguen con ella (antes
  ya se habían subido al proyecto sin el resultado); y si deshaces una
  partida que se apuntó sola, el lector no aprende «ganada» o «perdida» de
  ella. Lo que va al proyecto y al lector espera a que pase el plazo del
  «Deshacer».

## 3.41.0

- Las caras de los héroes rehechos ya salen con su dibujo nuevo: Masha y
  Bruno seguían con la cara de antes del rework en las tarjetas y los
  huecos. Ahora la app vuelve a bajar una cara cuando Moonton la cambia, y
  tu móvil la pide de nuevo aunque tuviera la vieja guardada.
- Las pantallas del final de la partida ya no se pierden si no tienes red
  al apuntarla: esperan y se suben solas en cuanto vuelve la conexión.
- Lo que aprende el lector al terminar el draft ya llega a la partida: la
  app esperaba 20 segundos y aprender en el móvil tarda más; ahora espera
  hasta tres minutos.

## 3.40.0

- Con «Leer solo» encendido, lo que tocas ya no lo deshace la lectura
  siguiente: un héroe quitado con la × (un Joy o un Wanwan mal leído) no
  vuelve a los 5 segundos, y tu pick que fijó el lector y soltaste no se
  vuelve a fijar solo. El «Deshacer» se va a los 6 segundos de verdad
  (leyendo solo no caducaba nunca), y deshacer una lectura no hace que la
  siguiente lo vuelva a meter.
- El selector no se te mueve debajo del dedo: si una lectura llega con la
  hoja de baneos abierta, la hoja sigue abierta con lo que habías escrito;
  y si llega con la de picks abierta, las caras no cambian de sitio (el
  héroe recién leído se queda donde estaba, apagado).
- Con tu pick fijado de otra línea, la pregunta de cómo fue y lo que se
  apunta (a mano o solo) es tu pick, no el nº1 de la línea.
- El lector se queda con las ÚLTIMAS pantallas del final de la partida,
  no con las primeras, y al subirlas al proyecto la tabla del resultado
  va siempre (en las 15 últimas subidas no llegó ninguna: las miniaturas
  llenaban el mensaje antes de llegar a ella).
- Más seguro: lo que llega del lector solo se sube a GitHub si tiene la
  forma de una captura (nada de texto que pudiera dar órdenes), el
  lector rechaza peticiones que no vengan de tu propio móvil aunque
  traigan la dirección de la app, desaparece su ruta antigua de captura
  y Claude ya no se pone a trabajar por un «@claude» escrito en las
  incidencias que sube la app. La descarga de datos se niega a llamar
  a cualquier ruta de cuentas de usuario.
- Datos más honestos: si la API rechaza el rango o la línea, ya no se
  guardan los datos de todos los rangos como si fueran de Gloria; si una
  corrida trae los objetos sin su defensa, no se publica; y si fallan las
  builds de un héroe, se quedan las de antes en vez de perderse.
- Las dudas del lector que viajan con la partida son las del draft, no
  las de la pantalla de carga, y lo que aprendió el lector va con SU
  partida y no con la siguiente.

## 3.39.0

- El lector de la tablet va unas siete veces más rápido: con la misma
  captura, una lectura pasa de 4,8 s a 0,7 s en el ordenador de pruebas
  (en tu móvil tardaba varias veces más; ahora también bastante menos).
  Cuantas más lecturas caben mientras se elige, más picks se ven antes de
  que salgan las skins, y antes se cambia el héroe que el rival solo
  estaba mirando (Joy y Wanwan salían así en tus partidas).
- Lee más picks: afina la posición y el tamaño de cada cara antes de
  decidir. En la captura de prueba del 1 de octubre ahora lee los cinco
  picks enemigos (Gloo salía «?»), y en todas las caras de prueba no
  pone nombre a ningún héroe que no esté.
- Cada partida apunta lo que tardó cada lectura en tu móvil (y cuánto
  de eso fue la captura de la tablet): el informe de tus partidas lo
  dirá, para saber dónde se va el tiempo de verdad.

## 3.38.0

- Tu primera recomendación sube unos 100 píxeles en un móvil pequeño: en
  360×640 ya asoma sin bajar (antes empezaba fuera de la pantalla) y en un
  móvil normal queda más cerca de los compañeros. Se ha quitado lo que
  ocupaba sitio sin decir nada nuevo.
- La composición de cada equipo dice solo lo que FALTA («sin primera
  línea», «sin control»): los «✓» de lo que ya está cubierto ocupaban una
  fila entera.
- En la fase de picks, «Leer solo» va dentro de «Ajustes»; debajo de «Leer
  del juego» se sigue diciendo qué pasó con la última lectura. En la fase
  de baneos, «Buscar héroe», «Leer del juego» y «Leer solo» van en una
  sola fila.
- La aclaración de que la probabilidad es un modelo pasa a la leyenda de
  «Ver por qué»; junto a la estimación queda solo con quién y cuántos se
  ven.
- En el selector de héroes, los que no puedes tocar (del otro equipo o
  baneados) van al final: antes ocupaban sitio entre las primeras caras.
- El plan de la fase de baneos ya no hereda el estilo del plan de partida.
- El lector deja de hacer capturas en cuanto lee VICTORIA o DERROTA: hasta
  ahora seguía con una cada 10 segundos hasta el minuto 25, gastando
  batería del móvil con la partida ya acabada.
- El aviso «Partida apuntada sola» ya no se vuelve a montar al pasar a la
  fase de baneos: el botón «Deshacer» podía irse de debajo del dedo.

## 3.37.0

- El lector ya no deja metido al héroe que un jugador solo estaba mirando:
  si en el mismo hueco ve después a otro, cambia uno por otro. En tus 29
  partidas leídas hubo que quitar a mano 30 nombres (Joy cinco veces), todos
  de picks que el jugador miró y no cogió. «Deshacer» lo devuelve.
- La tabla del final se guarda siempre, también la de VICTORIA: con ocho
  pantallas ya guardadas se perdía, y por eso la victoria no se aprendía
  nunca.
- «Más tarde» ya no hace que el lector pierda el final de la partida, una
  partida apuntada sola que deshaces no se vuelve a apuntar al recargar, y
  apuntar a mano mientras el lector contestaba ya no la apunta dos veces.
- Al arrancar, `lector` borra de Descargas solo sus capturas: antes se
  llevaba la carpeta `capturas` entera, con lo que tuvieras dentro.
- El plan de partida ya no te manda guardar una pasiva (Nana, Masha), no
  llama «intocable» a quien solo no puede morir (Argus) y solo dice quién
  escala mejor con los dos equipos completos. Sale también si un día faltan
  las builds.
- Si un día la descarga de cruces falla a medias, ya no se mezclan los de
  Gloria y los de Mítico ni se etiqueta una matriz con el rango que no es; y
  Ajustes dice bien de qué rango son los cruces y de cuál las builds.
- Arreglados el botón «Copiar para el chat» (algo bajo para el dedo) y un
  aviso del compilador.

## 3.36.0

- Nuevo «Plan de partida»: el botón de cada tarjeta ahora es «Plan y
  objetos» y, arriba de la build, te dice qué hacer en ESTE draft. Para el
  equipo, frases cortas para decir por voz (a quién hacer focus, cuándo
  separarse del control en área de su iniciador, quién se vuelve intocable,
  a quién proteger, si os conviene cerrar pronto o aguantar, armadura o
  defensa mágica, antisanación), y «Copiar para el chat» para pegarlas en
  el chat del juego. Para ti, con ese héroe: cuándo gastar la habilidad que
  quita controles (con Diggie: guarda Time Journey para cuando entre el
  control de Minotaur), con quién ir, y tu peor y tu mejor cruce cuando son
  claros.
- Los nombres de cada frase salen de los datos (los cruces y las parejas,
  y lo que hace cada habilidad según el propio juego); las habilidades van
  con su nombre en inglés, que es el que da la API. Es consejo, no
  predicción, y la hoja lo dice.

## 3.35.0

- Los cruces y las parejas salen de Mítico mientras Gloria no tenga
  partidas: era la causa de los picks raros de estos días. Desde el reinicio
  de temporada del 16 de septiembre la fuerza de cada héroe ya salía de
  Mítico, pero quién gana a quién y quién combina con quién se seguían
  leyendo de Gloria, y hacia el 28 de septiembre Gloria se quedó con tan
  pocas partidas que esas tablas eran casi todo ruido (se parecían a las de
  Gloria de antes del reinicio menos que las de Mítico de hoy). Ahora cada
  descarga compara las dos y usa Mítico mientras Gloria no se le parezca;
  vuelve sola a Gloria cuando se rellene. La hoja «Meta» lo dice.
- «Pierdes el cruce» ya no sale por un punto y medio: entre el 48% y el 52%
  la frase dice «algo en contra» o «algo a favor», «por poco», y la etiqueta
  de la tarjeta «algo peor contra…». Sin matiz solo cuando es de verdad
  claro (el 5% de cruces más extremos).
- Arreglado el texto de «Leer solo» que salía con llaves: «última lectura
  bien (2 nombres nuevos)».

## 3.34.0

- Las capturas de la tablet ya no llenan el móvil: van en casa de Termux
  (no en la galería ni en Descargas) y el lector borra solas las de hace
  más de tres horas y las que pasan de 40 lecturas o 24 fotogramas, que es
  lo único que necesita para aprender. La carpeta de Descargas de antes se
  quita al arrancar `lector`.

## 3.33.1

- La tablet fijada con `lector --tablet IP:PUERTO` se recuerda en cuanto
  sale una captura: el siguiente `lector` a secas ya busca ahí, y no en la
  IP de la vez anterior (lo que pasaba en otra wifi).

## 3.33.0

- El final de la partida lo vigila el lector de Termux por su cuenta, no la
  app: con «Leer solo», al completar el draft la app le avisa y él mira la
  tablet del minuto 8 al 25 (una captura cada 10 s) aunque el móvil esté en
  el bolsillo con la pantalla apagada; cuando vuelves a abrir la app,
  recoge lo que vio y, si vio la tabla de resultado, apunta la partida
  (fechada cuando acabó) con «Deshacer». Hasta ahora era la app la que
  pedía las capturas y solo con la pestaña a la vista: en las tres
  partidas del 2 de octubre los únicos fotogramas eran de los momentos en
  que se miraba el móvil (rango, MVP, en partida) y la tabla no se vio
  nunca, así que nada se apuntó solo.
- «No veo la tablet» dice ahora qué hacer en una wifi ajena (la del
  trabajo puede aislar los aparatos: compartir internet desde el móvil) y
  cómo decirle al lector dónde está (`lector --tablet IP:PUERTO`).

## 3.32.1

- El acceso directo «Lector» de Termux:Widget vuelve a funcionar. Android
  decía «env: …/Lector: No such file or directory»: el widget lanza el
  guion sin el entorno de Termux y ahí `/usr/bin/env` no existe. Ahora los
  accesos directos (widget, arranque con Termux:Boot y el mandato `lector`)
  llevan el bash de Termux con su ruta entera y se reescriben solos al
  arrancar `lector`. Y si `lector` se actualiza al arrancar, se relanza ya
  con la versión nueva en esa misma corrida.

## 3.32.0

- El resultado de la partida se apunta solo. Con «Leer solo», desde el minuto
  8 la app mira la tablet cada 10 s (antes 30: la tabla de resultado dura
  poco en pantalla y se escapaba) y cuando ve la tabla con «VICTORY» o
  «DEFEAT» apunta la partida sin que toques nada, con «Deshacer» durante 20
  segundos por si no era. Sale de tus cuatro pantallas de final del 1 de
  octubre: la palabra va centrada arriba y la cabecera de la tabla es igual
  en victoria y derrota, así que la app solo decide en esa pantalla y nunca
  en la de rango o la de estadísticas. De serie reconoce «DEFEAT»; «VICTORY»
  lo aprende de tu primera partida ganada en la que se vea la tabla (hasta
  entonces esa te la sigue preguntando), y cada Gané/Perdí que contestes
  le enseña; una plantilla que contradiga lo que contestas se quita sola.

## 3.31.0

- El lector lee también a TUS compañeros y cuál eres tú. Con tu captura de la
  fase de picks del 1 de octubre se midió el panel de la izquierda: las
  cinco filas se leen con sus skins (Clint, Guinevere, Novaria, Leomord y
  Estes, entre 0,87 y 0,94) y tu fila es la del nombre en amarillo. Los
  otros cuatro entran como compañeros y el tuyo queda fijado como «Lo cojo»
  (si lo fijaste a mano, se respeta); así el draft se completa solo y la
  pregunta de cómo fue llega sola. Si el lector no distingue tu fila, no
  mete a nadie: uno de ellos serías tú.
- Los picks enemigos que el juego dibuja sin reflejar ya se leen. Rafaela,
  Eudora y Gloo iban sin espejo y Lesley y Aamon en espejo en la misma
  pantalla; el lector solo comparaba en espejo y los tres primeros salían
  siempre «?». Ahora compara de las dos formas: en tu captura pasa de 2 a 4
  de 5 (Gloo se queda a 0,80 por un pelo) sin inventar nadie en los huecos
  vacíos. Cada lectura tarda algo más (tres paneles en vez de dos).

## 3.30.1

- Los picks enemigos vuelven a leerse. El 1 de octubre el lector «aprendió»
  de tres capturas que no eran la pantalla del draft (con «Leer solo» se
  captura hasta completar el draft, y el draft se completa a mano ya en la
  carga o en la partida), movió el panel de picks entero y desde ese momento
  todos los picks salían como «?» aunque los baneos sí. Ahora la geometría
  medida manda (lo aprendido solo entra donde ella no lee a nadie), solo se
  aprende de capturas donde se lee la fila de baneos y de hallazgos que caen
  en un hueco, y lo aprendido con las versiones anteriores se descarta al
  arrancar `lector`. No hay que tocar nada: se vuelve a aprender solo.
- Un día de datos ruidosos ya no bloquea publicar la app. Esa misma noche
  las parejas llegaron más dispersas y «combina bien» salía en el 27% de los
  pares en vez de en el 10% calibrado; una prueba lo exigía sobre los datos
  del día y habría parado este arreglo. Ahora la prueba mira la distribución
  calibrada y el Diagnóstico avisa (con la cifra) cuando los motivos con dato
  se salen de la cola: el motivo dice menos ese día, pero la app sigue.

## 3.30.0

- **El final de la partida se vigila solo, sin botones.** Con «Leer solo»
  encendido y el draft completo, desde el minuto 8 la app mira la tablet
  cada 30 segundos y se queda solo con las pantallas que cambian (el juego,
  el cartel de VICTORIA o DERROTA, el vestíbulo). Al apuntar la partida, o
  al empezar otro draft, las sube al proyecto por su cuenta, reducidas y
  como texto en una incidencia, con tu token. Con eso se mide dónde está el
  cartel y después la app apuntará el resultado sola. Los botones de 3.29.0
  para mandar la pantalla a mano desaparecen: no hay que tocar nada.

## 3.29.0

- **Botón temporal para mandar la pantalla de resultado al proyecto.** Bajo
  «Leer del juego», «Mandar la pantalla de resultado al proyecto»: con la
  pantalla de VICTORIA o DERROTA en la tablet, tocas «gané» o «perdí» y el
  lector hace una captura reducida (pantalla entera a 320 px y la franja de
  arriba a 640 px, 252 colores) que se sube como texto a una incidencia con
  tu token. Con una ganada y una perdida se mide dónde está el cartel y la
  app podrá apuntar la partida sola. Después, el botón se quita. Solo sale
  con el token de subida puesto.

## 3.28.0

- **«Leer solo»: la app lee la tablet por su cuenta, sin tocar nada.** Un
  interruptor junto a «Leer del juego» (se recuerda). Encendido, mientras
  tengas la app delante y el draft a medias, pide una lectura cada 5
  segundos (cada 12 con el draft vacío, buscando si ha empezado uno) y mete
  lo que vaya saliendo; con una hoja abierta o con el draft completo se
  para sola. Debajo dice qué pasó con la última lectura. Tú juegas y
  corriges lo que falte; el resto se hace solo.
- **Lo que el lector lee, duda y aprende viaja con la partida apuntada**, y
  esa partida ya se sube sola al proyecto: cada hueco sin reconocer con a
  quién se parecía más, y lo aprendido o no encontrado al corregir. El
  bot lo resume en su respuesta y el Diagnóstico lo enseña. No hay que
  copiar nada de Termux.

## 3.27.1

- **Un mismo héroe leído dos veces entre los cinco baneos de un equipo (o
  entre los cinco picks enemigos) ya no entra dos veces**: uno de los dos
  huecos está mal leído, se queda el que más se parece y el otro sale como
  «?» con su candidato en Termux. Los DOS equipos sí pueden banear al
  mismo héroe, y eso se respeta: en la primera tarde real pasó con
  Belerick y con Atlas.

## 3.27.0

- **El lector aprende de tus correcciones.** Cuando el draft está completo
  y al apuntar la partida, la app le devuelve al lector lo que había de
  verdad (los enemigos y baneos finales, con lo que corregiste a mano) y
  él lo cruza con sus capturas: busca a cada enemigo que no reconoció por
  todo el panel de picks, aprende dónde caen los huecos en TU tablet y
  guarda la cara tal como la pinta tu pantalla. En la siguiente partida
  lee con eso. Lo que no encuentra con seguridad no lo aprende (un recorte
  equivocado le enseñaría a confundir a dos héroes) y lo dice en Termux:
  «No encuentro a X en la captura Y: manda esa captura».
- Todo pasa en el móvil: la verdad se guarda junto a cada captura
  (`capturas/lectura-….verdad.json`) y lo aprendido en
  `~/.config/lector/aprendido.json`. El aprendizaje corre aparte, así que
  el botón «Leer del juego» sigue contestando mientras tanto.

## 3.26.1

- **Cuando el lector no reconoce un hueco, dice en Termux a qué se quedó
  más cerca** («?(Clint 0.41)»): con eso se afina sin tener que abrir las
  capturas. En la primera partida real los diez baneos salieron bien y
  ningún pick enemigo, y las líneas de Termux no decían por qué.
- `lector` guarda las capturas en Descargas (`capturas/`) si Termux tiene
  acceso al almacenamiento (`termux-setup-storage`), para poder mandar una
  desde la galería; si no, en su carpeta de siempre.

## 3.26.0

- **El lector de la tablet se arranca con una palabra, `lector`, y
  encuentra la tablet solo.** Ya no hay que mirar el puerto de «Dirección
  IP y puerto» ni escribirlo en Termux: el lector pregunta a la wifi qué
  tablet tiene la depuración inalámbrica encendida, recuerda la última que
  funcionó y, si el puerto ha cambiado, la vuelve a buscar sin que toques
  nada. La primera vez se ejecuta `bash scripts/lector/lector.sh` desde la
  carpeta del proyecto; desde entonces basta con escribir `lector` (o
  tocar el acceso directo «Lector» si tienes Termux:Widget).
- `lector` cierra solo un lector anterior que se hubiera quedado abierto.
  Era lo que pasaba en la primera prueba real: el viejo seguía contestando
  a la app con el puerto que ya no valía y salía «no llega a la tablet»
  hicieras lo que hicieras.
- Los avisos del botón «Leer del juego» distinguen tres cosas: la tablet
  no está en la wifi (enciende su depuración inalámbrica), falta
  emparejarla con el móvil (una sola vez, con el código) o adb no consigue
  la captura. Cada uno dice qué hacer.

## 3.25.0

- **Botón «Leer del juego»: la app mete sola los baneos y los picks
  enemigos que hay en la pantalla de la tablet.** Funciona con el lector de
  Termux abierto en el móvil (`node scripts/lector/servir.mjs --tablet
  IP:PUERTO`); la primera vez Chrome pregunta si la app puede acceder a la
  red local: hay que permitirlo. Está en la fase de baneos y junto a «Nuevo
  draft» en la de picks.
- Solo añade: lo que ya habías metido se queda, y si algo sale mal, un
  toque en «Deshacer» lo devuelve todo. Si el lector no está abierto o no
  llega a la tablet, la app dice qué hacer.
- **El lector aprende de tus partidas.** Lo que leyó se guarda con la
  partida al apuntarla; comparándolo con el draft final se ve cuánto
  acierta y con qué héroes falla (en el diagnóstico y en la respuesta del
  bot a tus partidas).
- La seguridad no cambia: solo hace capturas de pantalla, no toca el juego,
  y lo que llega a la app son nombres de héroe, nunca la imagen.

## 3.24.1

- **«Nuevo draft» con el draft vacío ya no enseña «Deshacer».** No había
  nada que devolver.
- **El diagnóstico ya no dice «puesto 0 -> 0» en la maestría.** Cogía de
  ejemplo tu primer héroe aunque no jugara la línea elegida (Diggie con la
  línea en mid); ahora coge uno de tu línea, o dice que ninguno la juega.

## 3.24.0

- **Al abrir el selector de héroes ya no sale el teclado solo.** Tapaba
  media rejilla: en un móvil de 360×740 se veían 8 caras en vez de 22, y la
  rejilla va ordenada para que el que buscas esté entre las primeras. Para
  buscar por nombre, toca el campo de arriba. Con ratón y teclado sigue
  como antes.
- **El icono de la app instalada se adapta a la forma de Android** (círculo,
  gota…) en vez de salir cuadrado dentro de un círculo blanco.

## 3.23.0

- **«Nuevo draft» y la × ya se pueden deshacer.** Tras vaciar el draft o
  quitar a un héroe sale abajo un aviso con «Deshacer» durante unos
  segundos: un toque en falso a mitad de partida ya no te obliga a meterlo
  todo otra vez. Vuelve tal cual estaba: el orden, el rival marcado, tu
  pick y la fase. «Nuevo draft» está justo al lado de «Apuntar partida», y
  hasta ahora borraba todo sin preguntar.
- El aviso se va solo, o en cuanto cambias otra cosa del draft. Al apuntar
  una partida no sale: la partida ya está guardada.

## 3.22.0

- **Las tarjetas se deslizan a su puesto nuevo en vez de saltar.** Al
  quitar un enemigo, fijar tu pick o meter un compañero desde el consejo,
  se ve quién sube y quién baja; la que entra entre las ocho aparece con un
  fundido. Solo se mueven las que cambian de puesto, y nada se anima al
  cargar ni al cambiar de línea o de rango.
- **Las hojas suben con un pequeño muelle y se cierran arrastrando hacia
  abajo**, desde la barrita de arriba o el título, como en iOS y Android.
  Desde la rejilla de héroes no: ahí el dedo toca o desplaza, y cerrar sin
  querer en mitad del draft sería peor.
- **El móvil vibra un instante al meter o quitar un héroe** (baneos, picks,
  la ×, «Lo cojo»), para saber que entró sin levantar la vista. Solo en
  Android; se apaga con «Vibrar al tocar», junto al idioma, al final.
- Con «reducir movimiento» activado en el sistema no se anima nada.

## 3.21.1

- **Un héroe nuevo ya no puede dejar la app sin datos frescos.** Cuando
  Moonton saca un héroe, los primeros días no tiene winrate, y eso salía
  como FALLO en las comprobaciones: se paraba la publicación de los datos
  de cada día hasta que alguien lo arreglara. Ahora es un aviso («normal
  los primeros días»). Lo mismo con un héroe rehecho y con un objeto que
  Moonton quite o renombre.
- **Un héroe recién salido, sin datos de enfrentamientos, ya no descuadra
  la probabilidad de ganar.** Su ventaja contra ti y la tuya contra él
  ahora se compensan como en los datos reales. Hoy no cambia ninguna
  recomendación: todos los héroes tienen datos.
- Se revisaron las pruebas que miran los datos del día: cinco podían
  fallar con un dato normal (una de ellas habría fallado en 5 de las 40
  corridas de septiembre) y bloquear las actualizaciones.

## 3.21.0

- **Intro ya no te quita un héroe del draft.** Con Alice metida, escribir
  «al» y dar a Intro buscando a Alucard la quitaba sin avisar. Ahora Intro
  salta a los que ya están marcados y mete al siguiente.
- **Tu pick fijado no se queda colgado.** Si lo baneas se suelta, igual que
  si lo metes de enemigo. Antes el hueco «Tú» seguía enseñándolo y «Gané»
  apuntaba la partida a otro héroe. Y en la pestaña de tu equipo ya no se
  puede tocar: eres tú.
- **El lector de la tablet lee también los picks del enemigo.** Además de
  los diez baneos, mientras se elige reconoce a los cinco enemigos por su
  dibujo. En tu captura, Clint y Khufra, sin fallos en los huecos vacíos.
  Tus compañeros no se leen: se ven con su skin. Ahora reconoce a TODOS
  los héroes, también a los rehechos (tu tercer baneo era Masha, con su
  arte nuevo), porque compara con la cara del juego actual que da la API:
  177 de 178 caras de tus capturas bien leídas y ninguna mal.
- La pista de la fase de baneos decía que los de otras líneas no cambian
  nada; no cambian tu pick, pero el consejo a tus compañeros sí los usa, y
  ahora lo dice.
- Si abres el selector antes de que lleguen los datos, la rejilla se
  ordena sola cuando llegan (antes se quedaba en orden alfabético).

## 3.20.0

- **Las etiquetas de los 133 héroes se han revisado leyendo sus habilidades
  una a una.** Se usaron el texto oficial y las etiquetas de cada habilidad
  que pone Moonton. Cambian 102 héroes: 46 que controlan y no estaban
  marcados, 15 que se curan, 20 con escudo, 18 que inician peleas… y se
  quitan las que el kit no respalda (Estes no se cura a sí mismo, Chip y
  Franco no dan visión, Dyrroth y Ruby no cortan curación).
- **El consejo de botas anticontrol sale solo cuando dos o más enemigos
  ENCADENAN control.** Antes saltaba con cualquiera que controlase algo, y
  eso es casi todo el juego: salía en uno de cada tres drafts y ya no te
  decía nada. El de antisanación sale ahora más, porque hay más héroes que
  se curan bien marcados.
- **Ninguna recomendación cambia.** El ranking sale idéntico en 300 drafts
  de prueba: la nota se decide con los datos de cruces y winrates, no con
  estas etiquetas. Cambia lo que te dice la app: el análisis del draft
  («a tu equipo le falta un iniciador») y los consejos de objetos.
- Se midió si el kit predice quién gana (cuánto control, movilidad,
  curación o escudos lleva cada equipo) sobre 1.826 partidas
  profesionales: no lo hace, así que no entra en la nota.

## 3.19.0

- **Nuevo, en prueba: leer los baneos de la tablet desde el móvil.** Con
  la depuración inalámbrica de la tablet encendida, `node
  scripts/lector/leer.mjs --tablet IP:PUERTO` en Termux hace una captura
  del draft y te dice los diez baneos. Con tus capturas acierta todos los
  héroes que tienen cara sacada del juego (54 de 54) y lo que no reconoce
  con seguridad lo marca con «?» en vez de adivinar. Solo hace capturas de
  pantalla, como las tuyas a mano: no toca la tablet ni habla con Moonton.
  Todavía no está en la app: primero hay que ver que funciona en tu
  tablet de verdad.
- De 18 héroes aún no hay cara del juego (Barats, Belerick, Cecilion,
  Cyclops, Gatotkaca, Hanzo, Jawhead, Kalea, Khufra, Kimmy, Lancelot,
  Lukas, Masha, Melissa, Ruby, Suyou, Vale y Yi Sun-shin) y se usa el
  retrato de la API, que con el arte rehecho puede no casar: con una o dos
  capturas más de la rejilla se completan.

## 3.18.0

- **«¿Te está funcionando?» compara ya siguiendo la app con ir por libre,
  con su margen.** Con tus 95 partidas: siguiendo la app 69,8% (63), por
  libre 71,9% (32), −2 puntos con un margen de ±19. Esa diferencia cabe
  en el azar, así que todavía no se sabe cuál de las dos te va mejor, y la
  pantalla lo dice así. El informe que te llega por GitHub decía «ya hay 30
  y 30, se puede concluir» sin decir qué; ahora da la cifra y el margen.
- Sigue en pie la otra comparación: contra tu winrate de siempre vas +18,5
  puntos ± 12,3, que sí se distingue del azar (aunque no está
  aleatorizado, y el reinicio de temporada empuja en la misma dirección).

## 3.17.0

- **Al meter los picks, el héroe que buscas suele estar ya a la vista.** Las
  caras del selector van en el orden de lo más probable para ESE equipo: lo
  más jugado, y detrás los de las líneas que ese equipo ya tiene cubiertas
  (si el enemigo ya tiene tirador, los tiradores bajan; en tu equipo, los de
  tu línea bajan, porque esa eres tú). Medido con tus partidas: el
  compañero que salió de verdad estaba entre las 12 primeras caras el 45%
  de las veces (antes el 14%) y el enemigo el 33% (antes el 22%).
- El orden se decide al abrir la hoja o al cambiar de pestaña, y no se
  mueve mientras tocas: nada salta de sitio debajo del dedo.

## 3.16.0

- **Meter los picks es mucho más rápido: el selector ya no se cierra con
  cada héroe.** Toca un hueco, y en la misma hoja vas tocando todos los
  enemigos que salgan; arriba cambias a «Tu equipo» y sigues con tus
  compañeros. Otro toque sobre un héroe lo quita. «Listo» (o atrás) cierra.
  Antes era abrir, buscar y cerrar por cada uno.
- **El selector de baneos enseña primero los de tu línea.** Medido sobre
  tus 42 drafts: los baneos de otras líneas no cambian tu recomendación en
  ninguno, así que con prisa basta con marcar los de tu línea (de tus 4,4
  baneos por partida, 1,8 lo eran). «Todos» los enseña todos, y buscando
  sale cualquiera.
- Lo que sí conviene meter siempre son tus compañeros: sin ellos el nº1
  cambia en la mitad de los drafts.

## 3.15.0

- **«Merece la pena banear» avisa cuando el héroe es de tu plan A·B·C.** El
  baneo sugerido mide lo que te quita ese héroe en el OTRO equipo, y a
  menudo es justo el que ibas a coger: hoy en roam, dos de los cinco
  sugeridos son tu plan A y tu plan B. La fila lo marca («tu plan A») para
  que no te lo banees sin querer; decidir si compensa quitártelo a ti
  también sigue siendo cosa tuya.
- En pantallas estrechas el motivo de cada baneo sugerido va debajo del
  nombre, y la cifra de la derecha ya no se parte en cinco renglones.
- Los bots de partidas profesionales y de mantenimiento ya no pueden
  pisarse con una corrida a mano, y las pruebas de interfaz corren con
  permiso solo de lectura.

## 3.14.0

- **La fase de baneos y el pie dicen de qué rango salen los números.** Desde
  el reinicio de temporada Gloria tiene tan pocas partidas que la fuerza, el
  pick y el ban salen de Mítico, y la fase de baneos seguía poniendo «tasa
  de ban en tu rango» y «gana el 59% en tu rango». Ahora pone «en Mythic»
  mientras dure, y el pie dice de qué rango y de cuántos días son los
  winrates (antes decía «glory · 7 días» cuando eran de Mítico a 3).
- **Si un día la descarga de Mítico viene vacía, la app sigue con Gloria.**
  Antes se pasaba a Mítico igualmente y todos los héroes se quedaban sin
  fuerza, con un aviso que culpaba a Gloria.
- Al traer tus datos de otro dispositivo, si las dos copias de un héroe
  tienen las mismas partidas se queda la que sabe desde cuándo sumar tus
  partidas apuntadas (antes podía perderse y volver a empezar a contar).
- **Fechar la maestría ya no esconde partidas.** Si habías apuntado con la
  app más partidas de un héroe de las que tenías escritas a mano, la fecha
  automática de la 3.13.1 hacía que contaran las escritas a mano. Ahora
  cuenta la cifra mayor, como antes, y lo que apuntes después se le suma.
  Con tus partidas de hoy no cambia nada.
- **Si el código que mandas llega roto, el bot te lo dice** en vez de
  responder «Recibido» y cerrar la incidencia sin guardar nada.
- **La vigilancia ya no deja huecos en su historial** justo en los días
  malos, y avisa si no ha podido guardar una fila. El winrate por línea ya
  no se pierde a trozos cuando la API falla con algún héroe.

## 3.13.1

- **Ya no hace falta pulsar «Guardar» en la maestría para que tus partidas
  cuenten.** La 3.13.0 pedía guardarla una vez; ahora la app pone la fecha
  sola la primera vez que la ve, y desde ese momento cada partida que
  apuntes se suma a tu maestría. Las apuntadas antes siguen sin sumarse,
  porque no se sabe si tus números del juego ya las incluían.
- El diagnóstico dice cuántas partidas apuntadas cuentan ya en tu maestría.

## 3.13.0

- **Las partidas que apuntas con la app ya cuentan en tu maestría.** Hasta
  ahora, si un héroe tenía maestría escrita a mano (Rafaela, 564 partidas),
  la app se quedaba con esa cifra y las partidas apuntadas después no
  cambiaban nada: tus 31 de Rafaela al 77% no movían la recomendación. Ahora,
  al guardar la maestría, cada héroe recuerda el día, y las partidas que
  apuntes a partir de entonces se le suman solas (Rafaela pasaría de 53,0%
  a 54,3%). Cuando vuelvas a copiar los números del juego, esas partidas ya
  van dentro y no se cuentan dos veces.
- **Para activarlo, abre «Maestría» una vez y pulsa «Guardar»** (con tus
  números del juego al día). La maestría guardada antes de esta versión no
  sabe de qué día es, así que hasta entonces sigue como estaba.
- El informe de tus partidas en el proyecto da el margen de cada cifra: la
  «AUC 0,36» de tus primeras 34 partidas con draft es ± 0,24, o sea que
  todavía no dice nada, ni bueno ni malo.

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
