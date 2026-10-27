# Candidatos descartados

Lo examinado y dejado como está, con su medida, para que la siguiente
iteración no lo repita. Si aparece evidencia nueva, se reabre.

- **Lo examinado en la revisión de arriba abajo de 3.5.0 y dejado como
  está**: (1) el tamaño de `roam-meta.json` (933 KB en crudo, 178 KB gzip;
  cruces y parejas son el 60% y YA van a cuatro decimales; quitar la mitad
  antisimétrica de los cruces ahorraría ~15% comprimido y obligaría a
  reconstruirla en cada carga: no compensa); (2) el aviso «Node.js 20 is
  deprecated» de `actions/cache@v4` en los runners: es un aviso, el paso
  corre en Node 24 forzado y funciona; se cambia cuando haya una versión de
  la acción que lo pida, no antes; (3) el pie (`footer role="button"` con
  un botón dentro) es un control anidado: funciona en táctil y en teclado,
  y arreglarlo pide rehacer el pie, que no está en el camino del draft; (4)
  `stats.matches` viene `null` de la API para todos: no hay recuento de
  partidas por héroe, así que ningún encogimiento por muestra es posible
  aunque se quisiera (y no se quiere, ver «Qué son los datos»). De las
  ideas de producto medidas en 3.5.0 quedaron fuera, con su porqué: el
  desglose RELATIVO al nº1 en cada tarjeta (medido: un solo término explica
  ≥60% de la diferencia nº1–nº2 en el 59% de los drafts de roam, así que
  vale, pero añade una línea a cada tarjeta y la nº1 va a 11 px del borde
  en 390×844 con 5v4; entrará cuando se mida cómo meterlo sin alto nuevo);
  «quién pesa más en su draft» (leave-one-out, mediana +3,5 puntos al
  quitar al que más pesa, coincide con tu peor cruce solo el 43%: es lectura
  del modelo, no medible contra resultado, y el análisis ya va a tres
  frases); el winrate por duración (`/api/academy/heroes/{id}/win-rate/
  timeline`, 164 peticiones más; en pro la señal por héroe es ruidosa, σ≈7
  pp y 8 de 64 héroes fuera de 2 SE donde el azar daría 2,9: se enseñaría,
  no puntuaría, y antes hay que medirlo en `ajustar-modelo.mjs`); la
  versión del parche (`/api/academy/meta/version`) y la dificultad de la
  ficha (`difficulty`, `abilityshow`, ya descargadas y no guardadas): baratas
  y pendientes de un hueco en pantalla que no empuje la nº1; la tasa de ban
  a 3 días para el siguiente baneo (medir primero, como el winrate, cuando
  la ventana corta vuelva a ser coherente tras el reinicio); compartir el
  draft por enlace y el modo dúo con la maestría del compañero (app de una
  persona; se reabren si alguien más la usa).
- **La esperanza del término de héroe de las líneas abiertas** (3.7.1):
  el gemelo de `esperanzaCruces` para la fuerza de los héroes que faltan.
  Medido con el centro ponderado: el término medio por línea queda en
  roam +0,04, jungla +0,02, medio −0,01, oro 0,00, exp −0,02 de logit sin
  escalar, o sea menos de medio punto de probabilidad con cuatro líneas
  abiertas. No compensa un término más; se reabre si algún parche separa
  las líneas más de 0,1 de logit (el diagnóstico no lo vigila: `medir-sesgo.mjs`
  en el scratch de la sesión lo medía).
- **`avgByRank` y `patchAvgWinRate` de la ingesta** (3.7.1): siguen siendo
  medias simples y siguen escribiéndose por compatibilidad, pero el motor
  ya no las lee (el centro sale de `mediaDeWinrate` sobre la ventana en
  uso). Cambiarlas a ponderadas no cambia nada en la app y tocaría la
  ingesta y su prueba simulada por nada; se quitan cuando toque la ingesta
  por otra razón.
- **El modo claro** (3.7.0): el rediseño al estilo de iOS 26 va solo en
  oscuro. El amarillo `#FFD60A` que es el acento de todo (notas, nombres,
  botón primario) y los seis colores de término están elegidos para negro:
  sobre blanco el amarillo no llega a 2:1 de contraste. Hacerlo bien pide
  una segunda paleta (Apple usa otros seis valores en claro) y pasar por
  las ~30 reglas que tiñen con `rgba(255, 214, 10, …)`; no es una consulta
  de medios sobre `:root`. Se reabre si Javi lo pide o si alguien más usa
  la app en claro.
- **La frase de empate cortada por el tope de tres del análisis**: medido en
  300 drafts con tres enemigos y tres aliados, 76 con empate y 0 cortadas.
  No hay problema.
- **Que los baneos miren también tu propio pool** (además de los aliados):
  el cruce está en la matriz, pero no hay resultado con el que medir si
  mejora los baneos, y sin medida es una regla nueva. Se reabre si hay
  forma de medirlo (partidas apuntadas con baneos, por ejemplo).
- **El peso doble del rival de línea**: quitado en 2.0 (ver «El modelo»).
- **La escala de la probabilidad estimada**: medida en 2.0 (0,44 ± 0,12 con
  902 partidas, validación cruzada). Las partidas de Javi la contrastan.
- **Diez términos más, medidos en 3.4.0 y sin entrar** (ΔlogL fuera de
  muestra por 1.000 partidas, 120/400 días, y coeficiente libre): el peor
  cruce de cada equipo (Cmin −0,56/+0,33; −1,02 ± 0,90/−1,19 ± 0,63), el
  mejor (Cmax −1,39/−0,38), los cinco mejores (Ctop5 +0,75/+0,72;
  −1,05 ± 0,61/−0,92 ± 0,43), cruces a favor y en contra por separado
  (−1,23/−0,60), el héroe más flojo (Hmin +0,47/−0,51) y el más fuerte
  (Hmax +0,08/−0,50), el pickrate total del equipo (−0,85/−0,20), el
  banrate total (+0,17/−0,42), la peor pareja (Smin −1,10/−0,75) y la tier
  de mlbb.gg (+0,65/+1,97; 0,038 ± 0,020/0,040 ± 0,014: al borde, y es
  opinión que se mueve con cada parche, así que se queda en pantalla). Del
  equilibrio de daño se probaron también −|f−m|, «ambos ≥ 1», mixto a
  medias, nº de mixtos, nº de magos, magos ≥ 2 y magos == 1: ninguna gana
  a min(f, m). Y para predecir qué falta por salir (14.640 situaciones
  pro): condicionar por sinergia o por cruce no añade nada a la
  disponibilidad, ordenar por winrate acierta menos (11,1%) y la
  frecuencia pro es otra población. Lo leído por ahí (regresión logística
  con sinergias y counters, embeddings/factorization machines, MCTS sobre
  el draft, modo «counterpick» de las herramientas de LoL) pide decenas de
  miles de partidas de la MISMA cola para ganar algo: con 1.830 pro no se
  distingue ni un coeficiente por término. Se reabre con más partidas o
  con una fuente de solo queue.
- **Un coeficiente por término, el lado azul, los huecos por etiqueta, el
  hueco de daño, el contrapick por orden de pick** (2.0): medidos en
  `ajustar-modelo.mjs` y ninguno mejora la validación cruzada ni sale del
  error (ver «El modelo»). Se reabren con más partidas o con una fuente de
  partidas de solo queue.
- **Las reglas negativas por etiqueta en héroes sin cruces** (`clamp01`
  deja la nota en 0.5 y enseña el motivo): solo afecta a héroes sin dato
  del cruce, hoy ninguno. Se reabre con el próximo héroe nuevo.
- **`update-data.yml` falla dos veces al día si la API está caída** (el
  comparador rechaza una corrida sin nada nuevo): es la señal correcta,
  no ruido; la vigilancia no la duplica porque mira lo publicado.
- **La simetría de la matriz de parejas**: los 8.778 pares están en los dos
  sentidos y la diferencia máxima |s[a][b]−s[b][a]| es 0,0000, así que
  `sinergia()` mirando los dos sentidos no puede dar dos valores distintos.
- **El orden de los picks en la estimación**: `estimarVictoria` da el mismo
  número barajando aliados y enemigos en 300 de 300 drafts. No hay término
  que dependa del orden.
- **Un pool con un solo candidato**: `rankRoamers` devuelve 0.5 con las
  contribuciones neutras (la normalización de un componente sobre un único
  valor no divide por cero). No hace falta caso especial.
- **`cache: npm` en `setup-node`** (1.32.1): medido después, `npm ci` sigue
  en 3,7–4,7 minutos con la caché (despliegue 99, vigilancia 77): esa caché
  guarda las descargas, no `node_modules`, y 346 paquetes se siguen
  instalando. Desde 1.32.3 `actions/cache` guarda `node_modules` entero
  por hash del lockfile y `npm ci` solo corre si la caché no lo trae
  (`npm ci` BORRA `node_modules` antes de instalar: sin esa condición la
  caché no sirve de nada). Hay prueba para todo workflow con `npm ci`.
- **`historial.json` con una fila corrupta en `salud.jsonl`**: `vite.config.js`
  descarta el historial entero y el diagnóstico dice «sin historial a mano».
  La fila la escribe un solo `echo >>` y va commiteada, así que una fila a
  medias no se ha visto; si aparece, tolerar línea a línea y contar las rotas.
- **`candidatos` ausente en el `ctx` de la simulación** (`robustez.js`): el
  riesgo de contrapick solo entra en la nota con `cegera > 0`, y los finales
  simulados tienen los cinco enemigos, así que da igual que no llegue.
- **El encogimiento del cruce por presencia del rival** (`PICKRATE_FIABLE`,
  1.x): quitado en 2.0, el cruce entra sin encoger porque el dato no lo
  pide (ver «Qué son los datos»). Queda como aviso de forma: en 1.x con un
  solo enemigo era un factor igual para todo el pool y la normalización lo
  borraba; sin normalización, un factor global SÍ mueve la probabilidad.
- **`cache: npm` en `setup-node`** (quitada en 1.37.0): redundante con la
  caché de `node_modules` y restauraba `~/.npm` en cada corrida para nada.
- **`medir-rival.mjs || true` en `pro.yml`**: solo escribe al log y su
  resultado no entra en ningún fichero, así que un fallo suyo no deja nada a
  medias; el caso de `medir-pro` era distinto porque su salida SÍ entra en
  `pro.json` (arreglado en 1.32.2 con una comprobación en el diagnóstico).

- **La prueba de que la simulación predice, hecha con las líneas DEDUCIDAS**
  (3.0): al portarla se midió con cinco semillas si daba igual usar la vía de
  la app (`draft.simular`, líneas deducidas) que el diseño con el que se
  calibró (líneas abiertas reales). Diseño calibrado: diferencia de tasas
  0,26 / 0,32 / 0,28 / 0,43 / 0,27, dentro del 0,25–0,33 documentado. Vía de
  la app: 0,19 / 0,23 / 0,24 / 0,43 / 0,33, o sea una semilla a 1,4 errores
  típicos del umbral 0,12. Se conserva el diseño calibrado; la deducción de
  líneas ya tiene su propia prueba de precisión.
- **Traducir los nombres de héroe en pantalla** (3.0, otra vez): sigue siendo
  no. Son la clave de todos los datos y enseñar «Cíclope» mientras el motor
  busca «Cyclops» es el fallo invisible que ya costó una corrección. Lo que
  acepta los dos idiomas es la BÚSQUEDA (`motor/alias.js`).
- **Meter una tier list publicada EN LA NOTA** (3.1.0–3.3.0, pedido tras el
  cambio de temporada). Se buscó en internet y se probó pidiendo datos, no
  leyendo documentación. Lo que hay: (1) la propia API la tenía y está
  retirada en origen (`/api/academy/heroes/ratings` → `{"code":10407,
  "message":"接口下线"}`); (2) mlbb.gg SÍ la publica, héroe a héroe, en
  `back.mlbb.gg/api/v1/heroes/{id}` (`tier`: SS/S/A/B/C/D; la lista en
  `/api/v1/heroes`; ignora `rank`), y desde 3.3.0 la baja la ingesta
  (`scripts/ingesta/tiers.mjs`, `--tiers`, apagada con la base fijada);
  (3) mlbb.io, mlbbhub, mlbbmeta, mobadraft, esports.gg, sportskeeda,
  gfinity, pocketgamer: páginas sin ruta de datos (404 en `/api/...`, 403 en
  `api.mlbb.io`), y mlbbhub es de todas formas el winrate ordenado por
  escalones, o sea lo mismo que ya tenemos. **La de mlbb.gg se enseña y no
  puntúa**, y está medido por qué (18 de septiembre de 2026, 133 héroes,
  Gloria): winrate medio SS 53,9%, S 50,3%, A 48,7%, B 48,7%, C 49,5%, D
  48,0% —de S para abajo no distingue—; Spearman tier~winrate 0,51 (~pick
  0,22, ~ban 0,37); y en `wr3 ~ a + b·wr7 + c·tier` sale b = 1,027 ± 0,007
  y **c = −0,045 pp/escalón ± 0,015**: sabiendo el winrate, la tier no dice
  nada de hacia dónde va un héroe. Donde discrepan es sistemático y es el
  eje de la DIFICULTAD: Fanny (S) 40,6%, Granger (S) 41,9%, Bruno (S) 46,3%,
  Kaja (S) 47,5%; Argus (C) 53,7%, Valir (C) 52,4%, Sun (D) 52,1%, Dyrroth
  (D) 52,1%. La tier mide «techo en buenas manos»; el winrate, «qué gana en
  Gloria»; el techo de Javi con cada héroe ya lo pone su maestría. Meterla
  en la nota sería sumar una opinión que, medida, no predice. Se reabre si
  algún día hay forma de medirla contra un resultado (partidas apuntadas
  con la tier del día, por ejemplo). El precedente es la línea «Pro» de las
  tarjetas: se enseña, no puntúa.
- **Reaccionar antes a un parche con la serie diaria** (`/api/heroes/{id}/trends`,
  3.1.0): la ruta está VIVA y da winrate, pickrate y banrate día a día. No se
  usa: sus números no reconcilian con los de la app en la misma ventana
  (mediana 3,28 pp; Granger 42,0% guardado frente a 52,5%; Minotaur 54,3%
  frente a 39,5%), salta ±10 pp de un día a otro y los dos últimos días vienen
  a medias. OJO: la primera medida se hizo pasando `days`, y en esa ruta el
  parámetro se llama `past-days` (el esquema lo dice; hay que leerlo, no
  suponerlo). Aun así el desajuste de población está ahí. Lo que SÍ sirvió
  para reaccionar antes fue la ventana de 3 días de `/api/heroes/rank`, que
  es la misma ruta y la misma población (ver «Qué son los datos»). Se reabre
  solo si hace falta algo más fino que 3 días.
- **La tier list, en pantalla en vez de en la nota** (3.2.0, hoja «Meta»,
  `src/app/componentes/Meta.jsx`): enseña por línea, con la tuya primero, el
  orden del término de héroe con el que puntúa el modelo, con winrate, pick,
  ban y la deriva de 3 días frente a la semana. No es una fuente nueva ni
  toca el motor: es para poder comparar con la que se lea por ahí. El botón
  va el ÚLTIMO de la fila de `.tools` a propósito: las pruebas de navegador
  abren maestría e historial por posición.
- **Un tipado de verdad (TypeScript o JSDoc comprobado)** (3.0): el motor
  lleva JSDoc en las funciones de contrato, pero nadie lo comprueba. Añadir
  `tsc --checkJs` es un candidato razonable para la siguiente iteración;
  no entró en 3.0 porque la reescritura ya se verificaba por paridad y
  meter un compilador nuevo en el despliegue el mismo día era cambiar dos
  cosas a la vez.
- **`useOrdenEstable` y el foco de las hojas, comprobados por mutación en el
  navegador** (1.41.0): quitar la limpieza de nombres, el desmarcado del
  rival, el orden estable de la hoja o la devolución del foco hace fallar las
  pruebas de navegador. Desde 3.0 están EN el repositorio
  (`pruebas/interfaz/hojas.e2e.mjs`, `npm run test:ui`) con
  `playwright-core`, que no descarga navegador. El tope de `anadir` en el
  selector de enemigos sigue sin prueba que lo vea: con la limpieza de
  nombres no queda camino en la interfaz para abrir el selector con los
  cinco huecos llenos, así que es defensa en profundidad.

- **Lo examinado en la iteración posterior a 3.9.0 y dejado como está**
  (25 de septiembre de 2026, sin cambio de código): (1) los baneos y la
  maestría en la re-puntuación de `medir-mias.mjs` (`repuntuar` llama a
  `estimarCon` sin ninguno de los dos, y la partida guarda los dos). Medido
  con los datos del día, 1.500 drafts con los diez más baneados de Gloria
  fuera: los baneos mueven la probabilidad una mediana de 0,09 pp con un
  enemigo, 0,04 con tres, 0,00 con cuatro (p90 0,29 / 0,20 / 0,09 pp, máximo
  0,82) y exactamente 0 con el draft completo, que es el caso de casi todas
  las partidas apuntadas desde 3.9.0: solo pesan en el término «por ver». La
  maestría se deja fuera a propósito: esa sección re-puntúa el modelo
  PÚBLICO con los datos de hoy, y la estimación guardada (`calibracion`) ya
  lleva la maestría del día. Si algún día se pasan los baneos, que sea por
  coherencia, no porque cambie una cifra. (2) La pendiente de `medir-pro` a
  1,24 ± 0,25 (857 partidas, datos del 21 de septiembre, una semana después
  del reinicio de temporada; en la primera corrida 1,00 ± 0,28): a un error
  típico de 1, dentro del margen de dos que vigila el diagnóstico, y es lo
  que «Qué son los datos» anticipa tras un reinicio (σ de winrates 5 pp en
  vez de 3,3). Se mira en las corridas de octubre; si sigue lejos de 1 con
  el ± por debajo de 0,15, se vuelve a medir con `ajustar-modelo.mjs`. (3)
  Preguntar cómo fue diez minutos después de COMPLETAR el draft (3.9.0): en
  el juego el draft se completa justo antes de empezar y una partida dura
  10–20 minutos, así que la pregunta está esperando al volver a la app; un
  plazo más largo la retrasaría a quien vuelve pronto y uno más corto la
  sacaría en mitad de la partida. Se reabre si se ve «Más tarde» repetido
  (hoy no se cuenta; habría que apuntarlo antes). (4) `partidas.yml` con
  `issues: edited`: editar una incidencia ya cerrada la reimporta y vuelve a
  responder; la fusión es idempotente por instante (el fichero no cambia y
  el bot no commitea) y la respuesta de más es una molestia, no un fallo. Se
  deja: sirve para reenviar un código que llegó cortado sin abrir otra
  incidencia. (5) Las incidencias #4 y #6 abiertas son diagnósticos manuales
  de agosto y septiembre («Todo correcto»), no de vigilancia: el bot no las
  toca y se cierran a mano cuando toque. (6) `guardarPartida` desde el
  recordatorio sin pick fijado apunta al nº1 del draft COMPLETO, no al que
  era nº1 cuando se eligió: es lo que la pregunta dice en pantalla («¿Jugaste
  con X?») y «Otro héroe» abre «Apuntar partida» para corregirlo; medir el
  nº1 «de entonces» pediría guardar el ranking en cada toque, y con el
  Veredicto a 0 partidas no hay con qué decidir si compensa.

- **Lo examinado en la iteración posterior a 3.10.0** (25 de septiembre de
  2026; entró 3.10.1, las marcas de borrado): (1) el tamaño del código de
  perfil contra el límite de 65.536 caracteres del cuerpo de una incidencia
  de GitHub: medido con partidas realistas (draft entero, diez baneos,
  estimación, maestría de los 133), 12.532 caracteres con 100 partidas,
  29.377 con 300 y 45.987 con 500, que es el tope de `apuntar` en el
  móvil. Cabe con margen 1,4; solo se pasaría si una importación de otro
  dispositivo dejara más de ~700 partidas en el móvil (`fundirPerfil` no
  recorta). Si pasa, la API responde 422, la hoja dice «GitHub ha
  respondido con un error» y se reintenta cada 10 minutos: visible, no
  silencioso. (2) La cola de `partidas.yml` con subidas seguidas
  (`cancel-in-progress: false`): GitHub deja una sola corrida pendiente y
  cancela la anterior en espera, y la que queda lleva el cuerpo del ÚLTIMO
  evento, que es el completo; no se pierde nada. (3) Un comentario del bot
  por cada partida subida: es ruido en la incidencia, pero cada uno es la
  medida al día; se reabre si molesta (se podría comentar solo cada N).

- **Otras fuentes de winrate y de tier list, buscadas y medidas en 3.11.0**
  (25 de septiembre de 2026). Rutas de la API que la app no usaba, pedidas
  una a una: (1) `/api/academy/heroes/{id}/win-rate/timeline?lane=` trae el
  winrate del héroe EN ESA LÍNEA (`total_win_rate`) y por tramos de
  duración (10–12 … 20+ min); descargado para las 165 combinaciones
  héroe-línea: su población casa con Gloria a 15/30 días (r = 0,99) y la
  diferencia entre las líneas de un mismo héroe es real y grande (mediana
  3,0 pp; Saber jungla 53,8% y roam 42,4%; Lukas exp 49,6% y jungla
  55,8%). Medido en `ajustar-modelo` (805 partidas pro de 120 días y 1.830
  de 400, cinco semillas, reparto de líneas igual que la app): contra el
  winrate global de la MISMA ventana gana en 9 de 10 comparaciones pero
  por +0,0 a +1,5 de logL por 1.000 partidas, dentro del ruido; juntos,
  0,19 ± 0,49 y 0,43 ± 0,47, no se distinguen. No entra en la nota. Se
  reabre con partidas de solo queue (en pro cada héroe juega casi siempre
  su línea principal, así que ahí la línea apenas añade). Desde 3.12.0 SÍ
  se enseña (ver «El winrate por línea»). (2) La
  curva por duración como término (lo que sube un héroe de 10 a 20+ min,
  tuyos menos suyos): −0,56 ± 0,29 encima del término de héroe, ganancia
  de −0,7 a +0,8 según la semilla. Descartada. (3)
  `/api/heroes/{id}/relations`: dos «fuerte contra», dos «débil contra» y
  dos «combina con» por héroe, elegidos a mano por Moonton; la matriz de
  cruces ya los tiene todos medidos. (4) `/api/academy/recommended`: guías
  de usuarios (UGC), opinión. (5) `/api/academy/heroes/{id}/lane` y
  `/api/heroes/positions`: etiquetas fijas de línea, sin winrate. (6)
  `/api/academy/heroes/ratings`: sigue retirada (`10407 接口下线`). (7)
  Otros rangos y ventanas de `/api/heroes/rank` como término de héroe: en
  pro gana Gloria a 30 días (+5,4 a +6,5 por 1.000) y «todos» a 30 (+3,3 a
  +3,7), pero las partidas pro son de ANTES del reinicio, igual que esas
  ventanas: es la época, no el rango. No se cambia la ventana por eso; lo
  que sí entró es la guarda de rango (ver «Qué son los datos»).

- **Lo que dicen las primeras 79 partidas de Javi, examinado en 3.13.0**
  (26 de septiembre de 2026): (1) la AUC de 0,36–0,40 sobre las 34 con
  draft NO es un fallo de `repuntuar`: la estimación guardada en su momento
  da lo mismo sobre esas partidas (0,397) y las dos correlacionan a 0,84;
  con 27 ganadas y 7 perdidas el error típico es ±0,12. Desde 3.13.0 el
  informe lo dice con su margen (`errorDeAuc`, Hanley-McNeil). (2) Previsto
  53% y ganado 75% en 63 partidas con estimación: la calibración global
  está 22 puntos por debajo (4 errores típicos), pero un desplazamiento
  igual para todos los candidatos NO cambia el orden, y su causa no está
  clara: antes del reinicio del 16 de septiembre ya iba al 64,3% (42
  partidas), después al 76,9% (39), frente a su 51,3% histórico. Puede ser
  que juegue mejor, que tras el reinicio le toque gente de menos nivel, o
  que apunte más las que gana. No se toca la escala ni el nivel por esto
  («No ajustes el modelo por una partida»); con la maestría sumando lo
  apuntado (3.13.0) su nivel ya se mueve con lo que juega. Se reabre con
  unas 100 partidas con draft y alguna racha fuera del reinicio. (3) El
  «+17,8 puntos, se distingue del azar» del Veredicto: cierto contra su
  histórico, y la pantalla ya dice que no está aleatorizado; el reinicio es
  otro sesgo que empuja en la misma dirección y la app no sabe de fechas de
  temporada. Siguiendo la app 69% y por libre 75% en el MISMO periodo: esa
  comparación, que no tiene el sesgo del reinicio, no dice que la app ayude.

- **La calibración en la cola de Javi, por meses** (5 de octubre de 2026,
  reabierto como pedía el punto anterior al pasar de 100 drafts): con 144
  partidas con estimación, previsto 54,4% y ganado 63,9%, pero partido por
  meses el desfase es SOLO septiembre (105 partidas: previsto 54,1%, ganado
  68,6% ± 8,9, la racha tras el reinicio del 16) y octubre cuadra (39:
  previsto 55,0%, ganado 51,3% ± 15,7, su 51% de siempre). Con ≥50%
  previsto gana el 70,3% (101) y con <50% el 48,8% (43): el número separa
  en su cola. La re-puntuación de hoy (115 drafts) da pendiente 0,78 ±
  0,72 y AUC 0,56 ± 0,11: el ± sigue mandando. No se toca ni la escala ni
  el nivel; se vuelve a mirar por meses cuando octubre pase de 100.
- **Lo examinado en 3.14.0 y dejado como está** (26 de septiembre de 2026,
  dos revisiones en paralelo, del código de 3.10–3.13 y de los bots): (1)
  una partida apuntada DESPUÉS de fechar la maestría pero jugada antes (se
  guarda la maestría con la partida ya dentro y luego se responde «Gané») se
  cuenta dos veces: es una partida entre cientos y arreglarlo pediría guardar
  cuándo se jugó, no cuándo se apuntó. (2) Un héroe BORRADO de la maestría en
  el móvil se queda en `historial/partidas.json` (no hay marca de borrado
  como `olvidadas`); se reabre si pasa. (3) `sanear` acepta un `desde` en el
  futuro (congelaría la suma); solo con el reloj del móvil mal. (4) «N héroes
  con datos tuyos» del diagnóstico cuenta también héroes con una sola
  partida apuntada: es cierto, es una cuenta. (5) `partidas.yml` mira el
  autor de la incidencia y no quién la edita: en un repositorio personal
  solo edita el dueño. (6) `pro.yml` y `mantenimiento.yml` sin grupo de
  concurrencia y `pro.yml` en verde con Liquipedia bloqueando: lo dice el
  diagnóstico desde 3.12.1; si el lunes 28 vuelve a pasar, los datos pro
  tendrán dos semanas. (7) Ninguna prueba ata los nombres del `workflow_run`
  de `deploy.yml` a los bots. (8) `pruebas-ui.yml` sin `permissions:`. (9)
  «Merece la pena banear» y el plan A·B·C pueden nombrar al MISMO héroe.
  RESUELTOS en 3.15.0: la concurrencia de (6), (7) y (8) con una prueba por
  forma sobre TODOS los workflows (permisos declarados, grupo de
  concurrencia en todo el que hace push, cada nombre del `workflow_run`
  existe y todo bot que commitea bajo `public/` está en él; cuatro
  mutaciones), y (9) marcando la fila («tu plan B», `BaneosSugeridos` con
  `plan`), sin tocar el motor: con los datos del 26 de septiembre, en roam
  dos de los cinco sugeridos eran el plan A y el B, en jungla y exp dos, en
  medio y oro ninguno. Quitarlos de la lista sería decidir por él (banear
  tu plan A con 77% de ban es a veces lo sensato); la marca solo evita el
  baneo sin querer. `pro.yml` en verde con Liquipedia bloqueando sigue
  igual. (10) Las caras en negro de las capturas de página
  entera eran la carga diferida (`loading="lazy"`), no retratos que falten.

- **ECC («Everything Claude Code», affaan-m/ECC), pedido el 3 de octubre de
  2026**: es un plugin de Claude Code (68 agentes, 293 skills, 94 mandatos,
  hooks), no un programa que corra sobre el repo. La instalación del plugin
  en ámbito de proyecto (`npx ecc-universal@2.2.3 install --guided --harness
  claude --claude-scope project --claude-hooks off --yes`) la BLOQUEÓ el
  clasificador de permisos de la sesión en la nube («Self-Modification»:
  cambia la configuración del propio Claude Code); se instala a mano desde
  una sesión de Claude Code con `/plugin marketplace add
  https://github.com/affaan-m/ECC` y `/plugin install ecc@ecc` (desde
  el móvil, «/plugin isn't available in this environment»). Por eso desde
  el mismo día va DECLARADO en `.claude/settings.json`
  (`extraKnownMarketplaces` + `enabledPlugins`), que cada sesión carga al
  arrancar, con `env.ECC_HOOKS_ENABLED = "false"`: el interruptor general
  de ECC (su `hook-flags.js`), comprobado ejecutando sus propios
  hooks en una casa vacía (encendido escriben y dejan cinco ficheros;
  apagado, nada). `pruebas/scripts/claude-config.test.mjs` falla si ECC
  queda activado con los hooks encendidos o apunta a otro repositorio
  (tres mutaciones). El marketplace NO va fijado a una versión: sigue la
  rama principal de ECC. Se eligió SIN hooks a propósito: el perfil «standard» puede reescribir mandatos,
  bloquear ediciones y mandar texto de la conversación a otro LLM, y aquí
  ya hay guardarraíles propios. Lo que sí se ejecutó: (1) AgentShield 1.6.0
  (`npx ecc-agentshield@1.6.0 scan --path .`): nota C, 420 hallazgos de
  los que 409 son los hashes `sha512` de `package-lock.json` tomados por
  «claves de Azure» (falso positivo) y los 11 restantes son párrafos de
  plantilla que echa en falta en CLAUDE.md (que el usuario no puede anular
  instrucciones, no revelar secretos, etc.); el único con sustancia aquí es
  tratar como datos lo que llega de fuera (API, incidencias, lecturas de la
  tablet), que las pruebas y el código ya hacen. No se añadió plantilla a
  CLAUDE.md. (2) `/skill-create` (la receta local, hecha a mano con las
  mismas medidas): `.claude/skills/mobile-legends-pick-assist-patterns/
  SKILL.md`, las convenciones MEDIDAS en el historial (un commit por
  versión con package.json + CHANGELOG + CLAUDE.md, 17 de 17 commits de
  `src/` con prueba, es.js y en.js siempre juntos); CLAUDE.md sigue
  mandando sobre él.
  **El 5 de octubre de 2026 se comprobó que la declaración NO instala nada
  en las sesiones en la nube**: `~/.claude/plugins/installed_plugins.json`
  vacío y ninguna habilidad de ECC en la sesión; solo llegaba el `env`. Y
  `/plugin marketplace add` / `/plugin install` escritos desde el móvil no
  hacen nada en la nube (es un mandato de la CLI de escritorio). Así que lo
  que sirve va COPIADO y adaptado en `.claude/` (ver `.claude/ecc/README.md`,
  con la licencia MIT): los agentes `silent-failure-hunter`,
  `security-reviewer` y `pr-test-analyzer` (`.claude/agents/`, solo leen) y
  la habilidad `click-path-audit` (`.claude/skills/`, Claude Code la detectó
  en la misma sesión al crearla). Cada uno lleva las reglas de AQUÍ (la
  lista de fallos silenciosos, la seguridad de la cuenta, la regla de
  mutación, los hooks de estado de la app) en vez de las genéricas de ECC,
  que hablaban de Zustand, SQL o bcrypt. `claude-config.test` exige nombre
  y descripción (sin ellos no se cargan), la licencia y que los agentes
  traídos no puedan escribir (dos mutaciones). La declaración del plugin se
  deja: si un día carga, sus hooks siguen apagados.
  **Primera pasada (3.40.0)**, con los cuatro en paralelo y la orden de
  reproducir antes de afirmar: `click-path-audit` 6 fallos (los seis
  reproducidos y arreglados), `silent-failure-hunter` 9 (arreglados 7:
  fotogramas, subida, comparador de objetos, 422, builds, dudas,
  aprendizaje a destiempo), `security-reviewer` 7 (arreglados los de
  código; los de configuración de GitHub son de Javi, abajo). Desde ahí
  el bucle está en `/revisar` (`.claude/commands/revisar.md`): los
  agentes que tocan según el diff, verificar, arreglar con prueba y
  `pr-test-analyzer` antes de publicar. Ese último, sobre el diff de
  3.40.0, rompió 25 cosas y sobrevivieron 8; las reales se cerraron
  antes de subir: la prueba de SEGURIDAD nueva se saltaba con
  `process.getBuiltinModule`, `(()=>{}).constructor(…)`, `Reflect` y un
  «//» dentro de una cadena que escondía un `import(` (hoy quita los
  comentarios con esbuild, no con una expresión, y prohíbe además toda
  llamada a un miembro calculado), el `Host` aceptaba
  `localhost.atacante.example` si se quitaba el `$` sin que nada fallara,
  la vigilancia podía guardar «las tres primeras y la última», y la × de
  baneos y compañeros, el «Deshacer» de una lectura y la partida apuntada
  sola con tu pick no tenían prueba. **De las dos guías de Affaan
  (5 de octubre de 2026)** se aplicó lo que sirve sin ordenador: agentes
  con herramientas acotadas (solo lectura), habilidades y mandatos del
  proyecto, bucle de verificación, reglas en un solo CLAUDE.md. Lo que
  NO aplica aquí: atajos de teclado, editores (Zed), tmux, `/fork`,
  `/statusline`, `/plugin` y los hooks de memoria (piden la CLI de
  escritorio; en la nube cada sesión empieza de cero y la memoria es
  este fichero). Lo que es de Javi y no se puede hacer desde una sesión:
  desactivar en claude.ai los conectores que no usa (Gmail, Calendar,
  Spotify, Strava: cargan herramientas en cada sesión y la guía pide
  menos de 10 servidores activos), proteger `main`, fijar las acciones de
  los workflows por SHA y separar el origen de la app (ver «Lo que queda
  pendiente»).
- **Lo examinado el 6 de octubre de 2026 (3.44.2)**, con el lector en sus
  47 partidas leídas: (1) el umbral `PARECIDO_MINIMO` 0,80 está bien puesto
  en los cuatro lados: de las 353 dudas guardadas (`lector.dudas`), el
  candidato era el de verdad en 20 de 151 enemigos, 6 de 97 aliados, 4 de
  49 baneos tuyos y 3 de 48 suyos, también entre 0,75 y 0,80; bajarlo
  metería más falsos que aciertos. (2) Lo que sí es de un héroe: Gord,
  candidato en 19 huecos enemigos, era él en 10, con un máximo de 0,77, y
  sale 10 veces en «sin encontrar al corregir»: su dibujo en el panel no
  se parece lo bastante a la cara de la API (que sí es la de 2.2.16) y el
  aprendizaje no lo coge (0,78). Se arregla con UNA captura del draft con
  Gord: sin ella, cualquier cambio sería a ciegas. Argus, igual (9). (3)
  La lectura tarda 4,9 s de mediana en su móvil y 3,8 s son la captura de
  la tablet (146 lecturas): lo que queda por ganar está en `screencap`,
  no en el reconocimiento. Probar la captura en crudo (sin `-p`) cambia
  el mandato permitido y manda 14 MB por wifi en cada captura, también
  durante la partida (vigilancia del final): se decide con Javi, no solo.
  (4) Los guiones de voz con tres drafts reales leen bien (nombres,
  porcentajes, sin llaves); el aviso del inicio es el más largo (unos 200
  caracteres, la mitad del tope).

- **Lo examinado el 14 de octubre de 2026 (3.57.3)**: (1) el lector leyó 14
  veces como pick a un héroe baneado en sus partidas del 1 al 13 de
  octubre (Yi Sun-shin compañero estando baneado, el 13), y ninguno llegó
  al draft: la app no deja meter a un baneado. `lector.enemigos/aliados` es
  la unión de lo leído, no el draft. (2) Con la API caída (500 de
  Cloudflare el 13; 404 de Vercel el 14 por la mañana, tras un rato
  contestando 200) el bot rechaza cada corrida (`rangoFresco` y
  `relacionesFrescas` 1 → 0): es lo correcto. (3) Devolver a mano al
  repositorio la matriz de Mítico del 10 de octubre en lugar de la Gloria
  sin comprobar de hoy: no, sería decidir sin medir con una matriz de
  cuatro días; la próxima corrida con Mítico entero lo decide sola. (4)
  Las lecturas de los enemigos el 13 de octubre (con la criba de 3.55.0):
  26 de 29 en el draft final y 1 de más, frente a unas 7 de cada 10 antes;
  seis partidas, se vuelve a mirar con más.

- **Lo examinado el 14 de octubre de 2026 por la mañana (sin cambios de
  código)**: (1) la ingesta real de las 08:30 UTC, con la API sobrecargada
  («Worker exceeded resource limits», 500/503), confirma 3.57.2 con datos de
  verdad: ningún aviso de kit cambiado, los 133 `kitTexto` igual que el
  catálogo, ninguna cara ni retrato por el proxy y la cara de Miya otra vez
  de 3.795 bytes (77 iconos y 133 retratos rebajados UNA vez, al volver la
  URL a la de Moonton). La corrida se rechaza por `rangoFresco` y
  `relacionesFrescas` (Mítico 22 de 120): correcto. (2) `objetos/fuentes.json`
  conserva la URL del icono 2004, un objeto que la API ya no sirve:
  `bajarImagenes` solo mira los que se enseñan; sobra una línea, no falla
  nada. (3) La puerta de 72 h del despliegue (`deploy.yml`) también para la
  publicación de CÓDIGO cuando la API lleva tres días caída, aunque el
  código nuevo publicaría los mismos datos que ya sirve Pages; el
  diagnóstico ya avisa a las 36 h. Cambiarla toca un workflow que
  despliega: se propone a Javi, no se hace solo.

- **Lo examinado el 14 de octubre de 2026 a mediodía (3.57.5)**: (1) aflojar
  el comparador para que acepte una corrida con las estadísticas frescas y
  la matriz al 80% (`relacionesFrescas` 1 → 0 la tira entera aunque cada
  fila sea igual o más nueva que la guardada): no se toca un guardarraíl
  que protege la fecha del fichero; se ataca la causa (los fallos
  pasajeros) con la segunda pasada de 3.57.5. Si con ella siguen llegando
  corridas al 80–89%, se reabre. (2) «Kit cambiado» de Alucard y Alice en
  la corrida del bot de las 10:12: sus fichas fallaron y se conservó el
  `kitTexto` guardado, calculado con la huella de antes de 3.57.2 (con las
  URL dentro). Falso y pasajero: se apaga con la primera ficha que llegue.

- **La revisión de pruebas de 3.57.1–3.57.6 (pr-test-analyzer, 42
  mutaciones, 17 sobrevivían)**: cerradas las que importan, cada una con su
  prueba (la salvaguarda de la segunda pasada en los dos sentidos, que
  falte solo una de las dos matrices, la API caída entera sin segunda
  pasada, la URL de los datos publicados, el crítico leído de las
  estadísticas). Se dejan, por baja gravedad: un objeto con «Crit Chance»
  solo en la pasiva (E5); la fecha del motivo de `ultima` (C2); la rama
  `catch` de la guarda en cli.mjs, inalcanzable porque `fetchRelations` no
  lanza (C3/C4); las cuentas del diagnóstico de la segunda pasada
  (`recuperados`, `ok`, `conId`: R7–R9); `>` frente a `>=` al comparar
  fechas con Pages (D1, inofensivo); la rama «corrida nueva buena» con los
  publicados (D10) y `curl` sin `-f` (D11, un 404 cae igual al repositorio
  porque `require` del HTML revienta). Y la segunda pasada puede alargar
  la ingesta con la API lenta (hasta 66 héroes × 2 × 2 rangos a 15 s):
  en el despliegue, un tope de 20 min que cae a los datos publicados; en
  el bot, 40 min de job. Se mira si algún día una corrida se acerca.
- **Aprender enemigos por eliminación (como tu equipo en 3.58.0)**, medido
  el 15 de octubre de 2026 en los 30 drafts de recortes: de 15 huecos
  etiquetados por descarte, cuatro eran el hueco vacío (rojo) con nombres
  distintos (Joy/Esmeralda 0,985, Martis/Natan 0,98) y solo uno (Floryn)
  tenía otro recorte del mismo héroe con el que confirmarse: las skins de
  los rivales cambian en cada partida. No entra; sigue `buscarCara` con la
  cara de la API.
- **Bajar el peso de la maestría (20 de octubre de 2026)**, preguntado por
  Javi («no sé hasta qué punto compensa que tengan tanto peso»). Medido con
  la maestría efectiva (11 héroes de siempre + 240 apuntadas, nivel 0,539,
  k 290) en 193 partidas leave-one-out: λ del término `tu` libre 3,5 ± 1,9
  (solo posteriores al 26/09: 1,4 ± 2,1); logL/n λ=1 frente a λ=0 +4,5 ±
  2,8 ‰. Cualquier λ entre 0 y 3 cabe. Casi todo el término es el NIVEL
  (`esperado = w + (nivel − 0,5)`): +1,7 pp a CUALQUIER héroe jugado y 0 a
  los no jugados, el doble de la brecha nº1–nº2 (0,7–0,8 pp); lo propio de
  cada héroe, 0,35 pp de mediana (Rafaela +0,82, Kaja −0,74). Sin maestría
  cambia el nº1 en el 40% de sus drafts; con ella, el nº1 es héroe suyo en
  el 91%. Javi eligió dejarlo como está («comodidad» con lo jugado) hasta
  poder medir héroes no jugados (192 de 193 partidas eran con jugados).
  Opciones abiertas: el nivel para todos (nº1 cambia en ~25%) o la mitad
  del nivel a los no jugados. Ver `pendiente.md`.
- **Pausar la grabación de la tablet entre capturas (iteración del 22 de
  octubre de 2026)**: la APK mantiene la pantalla virtual de MediaProjection
  componiendo a resolución completa mientras el juego corre, lo que PODRÍA
  restar fotogramas al juego. Pausarla (`setSurface(null)`) entre capturas
  no entra a ciegas: con la pantalla quieta (el draft) puede no llegar
  ningún fotograma nuevo tras reenganchar, y la lectura fallaría. Primero
  se mide en su tablet: FPS del juego con el lector grabando y sin él.
- **Que la propia tablet compruebe su versión contra GitHub en el parte**
  (3.65.2): ya lo hace `Actualizar.sola` desde 3.64.0. Lo que fallaba eran
  las APK de antes, que no tienen ese código, y eso solo se puede ver desde
  el móvil. Por eso va en la app y no en la APK.
- **Un candado entre pestañas para el parte** (Web Locks o BroadcastChannel):
  leer lo guardado antes de subir quita el caso visto (dos comentarios en un
  segundo). Dos pestañas en el MISMO milisegundo siguen pudiendo duplicarlo,
  y un comentario de más no hace daño.
- **Usuario y contraseña para la base de datos de partidas** (3.69.0,
  decidido por Javi: «clave por jugador»): pedía guardar correos de otras
  personas (protección de datos) y un paso más para cada jugador, para lo
  mismo que da una clave al azar. Tampoco se exige la clave de invitación
  para subir: el servidor no puede comprobar una firma ECDSA sin
  extensiones, y la puerta de la app ya es «una puerta, no una caja fuerte».
- **Bajar las partidas de la comunidad al repositorio**: son de otras
  personas, aunque vayan sin nombre. `medir-comunidad.mjs --guardar` las deja
  en un fichero fuera del repositorio para medir el modelo con ellas.
- **Fijar en el código el proyecto de Supabase de Javi** (revisión de 3.70.0):
  la tablet sube a cualquier `https://<20>.supabase.co` que diga
  `comunidad.json`. Quien puede cambiar ese fichero (escribir en el
  repositorio) puede cambiar también el código que lo comprueba, así que no
  protege de nada, y rompería «Administración → publicar la base de datos».
- **`supuesto` y `fuente` en la base de datos común**: la partida que apunta la
  tablet sin tu fila leída lleva el nº1 como pick (`supuesto`), y ni ese campo
  ni `fuente` están en el esquema, así que suben como un pick normal. Es lo
  mismo que hace la app al apuntar sola sin pick fijado; meterlos pediría
  volver a pegar el esquema en Supabase. Se reabre si las estadísticas lo piden.
- **Que el lector aprenda solo de lo que él mismo leyó** (3.71.0, al pedir
  Javi «que vaya mejorando la app sola»): dar por verdad el draft leído y
  aprender de él. Lo que nunca se leyó (el «?») no entra, que es justo lo
  que hay que aprender; y una lectura equivocada se aprendería como buena y
  se reforzaría sola (la lección de 3.30.1: lo que se aprende solo no puede
  mandar sobre lo medido). Por eso la tablet PREGUNTA tras la partida, en
  un toque, y aprende de tu respuesta.
- **`apk.yml` sin `npm test` antes de publicar (iteración del 25 de octubre
  de 2026)**: el push en rojo de 3.72.3 publicó la APK igual (su código era
  el bueno). Meter las pruebas en ese workflow es tocar uno que publica: va
  a `pendiente.md` para que Javi lo apruebe, no se hace solo.
- **Los datos del motor en la tablet, más a menudo que cada 6 h**: la ingesta
  corre dos veces al día; bajarlos más a menudo no trae nada nuevo. Lo que
  faltaba era SABER su edad (hecho en 3.73.1).
- **`reconocer` con tablas por número de héroe en vez de Maps por nombre
  (26 de octubre de 2026, buscando velocidad)**: el perfil de
  `aprender.test` ponía 13,7 s en `comparar`, pero el cambio daba lo mismo
  en 125 casos reales y tardaba igual (3.411 frente a 3.379 ms): el tiempo
  es el producto escalar, que ya va de cuatro en cuatro. No entra.
- **Paralelizar las nueve corridas de la ingesta en `ingesta-simulada`**
  (35 s): son procesos hijos que ya corren con `--pausa 0`; meterlos a la
  vez cambiaría una prueba que compara corridas encadenadas (`--previo`).
- **Repetir el aprendizaje de la tablet para leer mejor (3.80.0)**: con
  `aprenderDe` sobre los 40 drafts de recortes hasta #125, los 14 siguientes
  se leen igual (rivales 57,5% → 57,5%, tu equipo 66,4% → 66,4%). Las caras
  de rivales nuevas no salen: ningún héroe repite recorte entre drafts.
- **El margen sobre el segundo en tu equipo (3.80.0)**: 0,79 con 0,05 daba
  +4 compañeros de 476 sin falsos; no compensa otra constante.
- **La iteración del 27 de octubre de 2026 por la tarde (3.81.2)**: (1) las
  dos ingestas fallidas del 26 (21:38) y el 27 (10:33): la primera, la API
  con 500 en estadísticas y relaciones (`nadaFresco`: correcto); la
  segunda, la de 3.81.1. Nada más que hacer. (2) `conHabilidades` 101 de
  133 en la salud: son los héroes sin ningún efecto que contar (`[]` por
  diseño), no una pérdida. (3) `recortesDe` ordena los ids como texto
  (`-10` antes que `-9` en el mismo segundo): solo cambia cuál de las 8
  últimas se mira, con capturas cada 1,5 s no pasa. (4) El Supabase falso
  mide el recorte en caracteres y el SQL en bytes del `jsonb` (con
  espacios): el margen de `TOPE_RECORTE_BYTES` (118.000 frente a 120.000)
  cubre los ~200 bytes de diferencia; si se sube el tope, igualarlos antes.
  (5) Los ids de las capturas de la corrección están protegidos de la poda
  (`correccionVigente`), así que a los recortes no les faltan capturas al
  acabar la partida.
- **Dos sospechas de la revisión del móvil (27 de octubre de 2026, 3.81.3)**,
  sin tocar: (1) con el reloj de la tablet por detrás del del móvil, un
  arreglo de la tablet hecho justo después de uno del móvil se descarta en
  el servidor (`editada` menor) sin aviso. Con la hora de red de Android el
  desfase es de segundos; pedir `max(ahora, editada + 1)` no cubre el caso
  real, que es editar en los dos a la vez. (2) Editar en un aparato con la
  copia vieja (antes de los `TRAER_CADA_MS` 5 min) pisa la partida entera,
  sin fundir campo a campo. Es el diseño de 3.76.0 («gana la arreglada más
  tarde»); fundir por campo pediría una hora por campo. Se reabre si pasa.
