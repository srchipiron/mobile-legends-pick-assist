# Lo que queda pendiente

- **Lo que dejó abierto la pasada de ECC de 3.40.0**: cerrado en 3.41.0
  y 3.42.0 (ver «Errores ya cometidos»). **De seguridad, decisiones de Javi** (`security-reviewer`): la app
  comparte origen (`srchipiron.github.io`) con otra app suya, así que
  cualquier página de ese origen lee el `localStorage` (el token) y el
  lector la acepta como origen; un dominio propio o mover la otra app lo
  cierra. La declaración de ECC sin fijar a un commit, y `lector.sh` ejecuta lo
  que traiga `git pull` sin preguntar. HECHO el 5 de octubre de 2026:
  `main` protegida con un conjunto de reglas de GitHub («Proteger main»:
  sin borrarla ni reescribir su historial, sin excepciones; NO pide pull
  request ni pruebas en verde, porque los cuatro bots y las sesiones
  suben directo a `main`, y ningún workflow hace `push -f` a `main`, solo
  mantenimiento a su rama), y desde 3.42.1 las acciones de los workflows
  van fijadas a un commit con su versión al lado (`@<sha> # vX.Y.Z`,
  prueba en `workflows.test`: cada `uses:` fijado y la misma acción al
  mismo commit en todos; cuatro mutaciones). Para ACTUALIZAR una: `git
  ls-remote --tags https://github.com/<acción>` (la API de GitHub no
  deja leer repositorios de fuera desde la sesión; `ls-remote` sí), coger
  el commit de `vX.Y.Z^{}` si la etiqueta es anotada, y cambiarlo en
  TODOS los workflows a la vez. No hay Dependabot: abriría pull requests
  que Javi tendría que fusionar desde el móvil. Y la verificación en dos
  pasos de su cuenta de GitHub, activada por él el mismo día (desde una
  sesión no se puede comprobar: `gh api user` da
  `two_factor_authentication: null` con el token de la sesión), y el token
  de la subida de partidas rehecho con caducidad y solo «Issues» de este
  repositorio (la subida de las 15:07 UTC llegó a la #11 y el bot la
  procesó: funciona). Y por diseño de 3.40.0: lo leído que
  no llegó a entrar (por el tope de cinco) cuenta como «quitado a mano» y
  no vuelve a entrar en ese draft aunque luego quede hueco; con el tope
  lleno uno de los seis leídos sobraba, y `cambiosDeHueco` ya cambia al
  que solo se miraba.

- **Lo que 3.0 perdió sin querer, repuesto en 3.1.0**: la prueba de que la
  PANTALLA del Veredicto enseña el margen junto a la diferencia existía en
  2.0.2 (leía el fichero de interfaz de 2.x desde la prueba del motor) y el
  port la perdió, porque el motor ya no puede leer la interfaz. Hoy es
  `pruebas/app/veredicto.test.mjs`, verificada por mutación en las tres
  reglas. Lección: al partir un proyecto en capas, una prueba que cruzaba dos
  capas no se mueve sola; hay que ir a buscarla. Y `npm run test:ui` compara
  `dist/version.json` con `package.json` antes de arrancar, porque con un
  `dist/` viejo lo que fallaba era la versión anterior y el mensaje no lo
  decía.
- **Lo que 3.0 dejó a medias, a propósito y con su porqué**: el pestillo
  contra el bucle de recargas (`yaRecargado` en `useActualizacion`) no tiene
  prueba —verificado por mutación: quitarlo no tumba nada, porque tras la
  recarga el hook se monta de cero y no se sabe simular aquí un navegador que
  dispare `controllerchange` varias veces en la misma vida de la página—;
  `aconsejarEquipo` no iba diferido (se difirió en 3.5.0, ver «Lo que
  cuesta un toque»); y no hay tipado comprobado (`tsc --checkJs` es el
  candidato razonable para la siguiente iteración, no entró en 3.0 por no
  meter un compilador nuevo en el despliegue el mismo día).
- Ya no queda ningún héroe con tags deducidos: los 7 que faltaban (Marcel,
  Hirara, Zetian, Sora, Obsidia, Cici, Valir) se escribieron a mano en
  `2917b2d`. El mecanismo de deducción (`tagsDeducidos`, `PRECISION_DEDUCIDA`)
  sigue vivo para el próximo héroe que saque Moonton antes de que alguien le
  escriba los tags, y `mantenimiento.yml` avisa cuando eso pase.
- La deducción se apoya en `SPECIALITY_TAGS` y `ROLE_VETO`, que NO se editan a
  mano: las regenera `node scripts/derivar-tags.mjs` del propio catálogo.
  Reejecútalo cuando crezca `heroes.json` o Moonton cambie sus etiquetas.
- **Un héroe REWORKEADO no lo ve `newHeroes`** (3.1.0): conserva su nombre y
  sigue en el catálogo, así que se quedaba con los tags que alguien le
  escribió para OTRO kit, callado y para siempre. Desde 3.1.0 cada héroe de
  `heroes.json` lleva su `kit`: la huella (`huellaDeKit`, tipo de daño +
  speciality ordenada) que daba la API cuando se le escribieron los tags. La
  ingesta compara (`kitsRehechos`, fusion.mjs), el diagnóstico lo canta y
  `mantenimiento.yml` abre incidencia. Se guarda en el CATÁLOGO y no contra la
  corrida anterior a propósito: así el aviso persiste hasta que una persona
  mire los tags, igual que con los héroes nuevos; contra la corrida anterior
  se apagaría solo al día siguiente. La huella ignora los RECUENTOS de
  habilidades por tipo: entre el 7 y el 16 de septiembre de 2026 cambiaron
  cuatro (Argus 4→5 de físico, Aulus 5→6, Bruno 4→3, Balmond +1 de verdadero)
  y otros cuatro héroes cambiaron de línea, y la huella no se movió en
  ninguno. Un aviso que salta con cada reequilibrio es un aviso que se deja de
  leer. Al revisar los tags de un héroe, actualiza su `kit` con lo que dé
  `huellaDeKit()` y el aviso se apaga solo.
- Desde 1.9.0 el registro SÍ personaliza: `maestriaEfectiva` junta la maestría
  escrita a mano con la que sale de las partidas apuntadas. Hasta 3.12 se
  quedaba con la fuente con más partidas de cada héroe «porque la escrita a
  mano ya las incluye», y eso solo era verdad si Javi la volvía a escribir
  tras jugar: con sus primeras 79 partidas en el repositorio (26 de
  septiembre de 2026), Rafaela tenía 564 a mano y 31 apuntadas al 77%, y
  las 31 no movían nada. Desde 3.13.0 cada héroe escrito a mano lleva
  `desde` (lo pone el editor al guardar: guardar es «estos son mis números
  del juego hoy»; un héroe sin tocar y con fecha la conserva) y se le SUMAN
  las partidas apuntadas después, sin las previas (el total del juego ya
  las lleva). Sin `desde` (guardada antes) sigue ganando la que tenga más
  partidas: no se sabe qué incluye. `sanear` y el código de perfil llevan
  la fecha. Medido con sus datos y la fecha antes de sus partidas: Rafaela
  53,0 → 54,3%, Minotaur 51,7 → 52,9%, y el nº1 de roam cambia en 18 de
  300 drafts. Es continuo (una partida más no salta) y por clave
  normalizada. Pruebas en maestria, perfil y `persistencia.e2e`,
  verificadas por mutación. Desde 3.13.1 la maestría SIN fecha se fecha
  sola al verla (`fecharMaestria`, un efecto en `usePersonal`, fuera de
  cualquier updater): tras publicar 3.13.0, 0 de los 11 héroes de Javi
  tenían fecha y la mejora no hacía nada hasta abrir el editor. Es seguro:
  lo escrito a mano no puede incluir partidas aún no jugadas, así que lo
  apuntado después se suma sin contarse dos veces, y lo de antes sigue
  fuera. Devuelve la misma referencia si no hay nada que fechar (si no, el
  efecto guardaría en bucle). El diagnóstico dice cuántas partidas
  apuntadas cuentan ya.
  **Desde 3.56.0 «mandan las recientes»** (elegido por Javi, con la medida
  delante): lo de siempre cuenta como mucho `TOPE_DE_SIEMPRE` (40) partidas
  por héroe y se suman TODAS las apuntadas con la app (la fecha `desde` ya
  no decide nada; `fecharMaestria` sigue, inofensiva). Medido el 13 de
  octubre de 2026 en sus 212 partidas con la app, cada una predicha con las
  demás: el winrate de siempre por héroe predice PEOR que una constante
  (logL/n −0,6633 frente a −0,6603) y el de la app encogido, mejor
  (−0,6559). Con el modelo entero (`estimarCon`, 165 drafts): −0,6825 con
  la maestría de antes, −0,6814 sin maestría, −0,6758 con la nueva; la AUC
  sigue en 0,50 y, recalibrando el intercepto, las tres quedan a 0,001:
  mejora sobre todo el NIVEL (calibración), no la discriminación entre
  partidas, y con 212 cabe en el error. Efecto: el nº1 cambia en 68 de 165
  drafts, Rafaela nº1 en 92 (antes 41), Diggie 9 → 5, Gloo 14 → 5. El
  Veredicto compara con `maestriaDeSiempre` (lo de siempre ENTERO), no con
  la acotada. Vigilar: con la maestría así, la app recomienda sobre todo
  los 3–4 héroes que mejor le van, y esos son los que más se apuntan; si
  dentro de unas 100 partidas el winrate con ellos baja a su media, el tope
  se vuelve a medir con `maestria-cv.mjs`/`loo-maestria.mjs` del scratch.
- **Cambiar el héroe de una partida (3.47.0)**, pedido por Javi para la
  de «Hayabusa» del 6 de octubre de 2026 (fue Diggie): en «Tus partidas» el
  nombre es un botón que abre el pool de la línea; `cambiarHeroe`
  (registro.js) cambia `pick` por el instante y QUITA `estimacion` y
  `fases`, que eran del héroe que no se jugó (con ellas, la calibración y
  `medirFasesMias` medirían el modelo con otra partida). Se propaga como
  corregir el resultado: mismo `t`, gana el móvil al fundir. Pruebas en
  `registro.test` y `persistencia.e2e`, dos mutaciones.
- **«Tus números» (3.48.0)**, pedido por Javi («busca apps parecidas, de
  otros juegos, e inspírate»): de los rastreadores de partidas (Dotabuff,
  DuoBot, Blitz, mlbb.io) se cogió lo que se calcula con SUS partidas y no
  pide datos nuevos: racha, sesión de hoy (partidas a menos de
  `HUECO_DE_SESION_MS` 45 min, si la última es de hace menos de 12 h),
  después de perder frente a después de ganar (la partida siguiente en la
  misma sesión), por franja horaria (<18, 18–21, 21+, hora LOCAL del móvil),
  por duración (solo con `duracion` posible) y por héroe (≥5 partidas,
  intervalo de Wilson; marcado solo si deja fuera tu media). Cada grupo
  contra el resto con `compararProporciones` (registro.js), la MISMA cuenta
  que el Veredicto entre ramas (hay prueba). Grupos de menos de
  `MINIMO_POR_GRUPO` (10) no se enseñan. Todos los cortes son decisiones de
  producto, dichas en el código. Medido con sus 182 partidas el 8 de
  octubre de 2026: tras perder 63,3% (49) frente a 63,7% (80), sin efecto
  «tilt»; antes de las 18 h 48,6% (37) frente a 64,8%, −16 ± 18, cabe en el
  margen. `src/motor/habitos.js`, `TusNumeros.jsx`, pruebas en
  `motor/habitos.test` (once mutaciones) y `persistencia.e2e` (dos).
- **La revisión del draft (3.49.0)**, como DraftGap: `revisarPartida` y
  `revisarDrafts` en draft.js (el único cerebro) re-puntúan el draft
  guardado de cada partida (línea, enemigos, aliados, baneos) con los datos
  de hoy y la maestría efectiva, y dicen el puesto del héroe jugado, el nº1
  y la diferencia, con los márgenes del ranking (`MARGEN_EMPATE` empate,
  `BRECHA_CLARA` «claramente mejor»). Un héroe de otra línea se puntúa
  aparte (sin puesto). Es a toro pasado: al elegir faltaban enemigos, y la
  pantalla lo dice. La última partida se revisa al abrir «Tus partidas» (un
  ranking); todas, con botón (136 drafts, 0,8 s aquí y unos 4 s en el
  móvil). Medido el 9 de octubre de 2026 con sus 136 drafts: el mejor o
  empatado en 51, claramente mejor en 44, y en esos ganó el 64% frente al
  60% (+4 ± 18): no se distingue. Los más «dejados» son Marcel (17) y Chip
  (15, por su maestría del 55%). `motor/revision.test` (siete pruebas,
  diez mutaciones) y `persistencia.e2e` (una).
- **Quién sube y quién baja (3.50.0)**, como el «trending» de mlbb.io:
  `src/motor/tendencia.js` (`movimientos`) por `movimientosDelMeta` en
  draft.js, en la hoja «Meta» (`EstaSemana`). La INGESTA guarda
  `historia` en `roam-meta.json`: una foto por día UTC del winrate y la
  cuota de pick de 7 días de tu rango y su respaldo (`anotarHistoria`,
  fusion.mjs), SOLO de los rangos descargados en esa corrida (una foto de
  datos conservados diría «no se movió» sin saberlo), la última del día
  manda, `HISTORIA_DIAS` 10 (+13 KB comprimidos; con 15 eran +20), winrate
  a la décima de punto y cuota a cuatro decimales. `comparar-ingesta`
  rechaza una corrida que pierda un día que aún está en su ventana
  (`diasPerdidos`, contado desde el ÚLTIMO día; contado desde el primero,
  una corrida que solo guardara hoy pasaba). La primera tanda se rellenó a
  mano el 9 de octubre de 2026 con las corridas de git (`anotarHistoria`
  sobre cada commit fresco y el serializador, byte a byte igual). La app
  compara la ventana de hoy con la foto más cercana a 7 días (entre 5 y 9)
  y nombra a un héroe si su cambio, MENOS la media de los cambios
  ponderada por cuota de pick, pasa de `UMBRAL_MOVIMIENTO` (1 punto) y el
  del otro rango del par va en el mismo sentido con `CONFIRMACION` (0,5).
  Medido en la historia de git: con el parche asentado (6–17 de
  septiembre) el cambio semanal es σ 0,25–0,3 puntos y casa entre Gloria y
  Mítico a r ≈ 0,7 (meta, no muestra), y con estas reglas salían 0–1
  héroes por semana; tras el reinicio Gloria se mueve 1–5 puntos, casa a
  0,4–0,6 y sin centrar «subían» 50 a la vez. El 8 de octubre: 9 suben y
  12 bajan (8 suben y 15 bajan con la foto exacta de 7 días). Es
  descripción, no predicción: no se ha medido si lo que sube sigue
  subiendo, y no puntúa. `motor/tendencia.test` (ocho pruebas, trece
  mutaciones), `scripts/ingesta.test` y `comparar.test` (siete),
  `ingesta-simulada` (la foto servida, y la de ayer conservada) y
  `hojas.e2e` (las fichas son las del motor).
- **Por qué no es el nº1 (3.51.0)**, lo que «Candidatos descartados»
  dejó pendiente en 3.5.0 («entrará cuando se mida cómo meterlo sin alto
  nuevo»): va de la nº2 para abajo, así que la nº1 no se mueve
  (`primera-pantalla.e2e` en verde). `porQueDetras` (ranking.js) resta
  término a término el nº1 menos el candidato en la escala del desglose
  (`ESCALA × logit × PUNTOS_POR_LOGIT`; entre candidatos del mismo draft
  solo cambia tu héroe), y da el término en que más pierde y el que más
  gana si pasa de `PUNTOS_A_FAVOR` (0,5, decisión de producto: por debajo
  es redondeo del desglose); dentro de `MARGEN_EMPATE`, empate. La frase,
  en `src/app/porque.js` (`fraseDetras`, pura). Medido el 9 de octubre de
  2026 con 300 drafts de roam, para la nº2: empate en 86 (29%, el p25
  documentado); en los otros 214, un término explica ≥ 60% en 164 (77%) y
  hay algo a favor en 148; el que más pesa es la fuerza del héroe (145),
  luego cruces (51) y parejas (18). `motor/porque.test` (cinco pruebas,
  siete mutaciones) y `pick.e2e` (la frase es la del motor con los datos
  servidos; comparar con la nº2 en vez de la nº1 la tumba).
- Las partidas metidas del historial del juego llevan `previa: true` y quedan
  FUERA de las dos ramas de la comparación (`esPrevia`). Sin eso irían todas a
  "por libre" -no tienen `recomendados`- y meter cien partidas viejas llenaría
  esa rama con el winrate de siempre. Cuentan para la maestría, que es para lo
  que se meten.
- El instante (`t`) ES la identidad de una partida: por ahí se quita, se corrige
  y se deduplica al fundir perfiles. `apuntar` desempata los instantes repetidos
  porque dos toques rápidos caían en el mismo milisegundo y borrar una se
  llevaba las dos.
- Desde 1.17.0 la comparación tiene pantalla propia (`Veredicto`, dentro de
  «Partidas»). Tres reglas que NO son negociables y tienen prueba: el margen va
  en la misma frase que la diferencia, no se afirma nada mientras la diferencia
  quepa en el margen, y se dice que no está aleatorizado. Si alguna vez se saca
  de la app para enseñársela a alguien, se saca entera: el número sin el margen
  es publicidad, y con 11 partidas el margen es ±29 puntos.
- El registro de partidas existe desde 0.8.0 (botón "Apuntar partida"). La
  comparación "siguiendo la app contra por libre" es la limpia en teoría y la
  inalcanzable en la práctica: la segunda rama solo crece si Javi ignora la app
  a propósito, y además no está aleatorizada -él elige cuándo hacer caso-. Por
  eso desde 1.7.0 el diagnóstico da también la comparación contra su winrate
  histórico (`winrateDeReferencia`, ponderado por partidas), que sí se llena
  jugando. Las partidas que faltan salen del tamaño del efecto observado, no de
  un umbral escrito a mano. Hasta que una de las dos se distinga del azar, NO
  toques la escala del modelo por sus partidas: la escala viene de las pro.
- El tipo de daño de cada héroe (`damage`, en `roam-meta.json`) se cuenta en los
  textos de habilidad de Moonton, no se deduce del rol: el rol se equivoca con
  Gusion, Hylos, Natan y Kimmy. Por eso NO lo encoge `PRECISION_DEDUCIDA`: es un
  dato medido, no una etiqueta adivinada, y encogerlo sería descontar dos veces.
  Cuenta habilidades, no daño real, así que a un tirador le falta su ataque
  básico: Melissa sale "mixto" cuando es física. Sale barato porque la ingesta ya
  pedía esa ficha; ahora la pide para los 133 en vez de para 7.
- La cobertura de la matriz de counters es del 100% desde 1.5.0: 132 rivales
  por héroe. `matchup()` y `sinergia()` siguen mirando los dos sentidos, que
  ahora solo hace falta para héroes recién salidos.
