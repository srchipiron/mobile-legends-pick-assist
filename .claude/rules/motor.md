---
paths:
  - "src/motor/**"
  - "scripts/ajustar-modelo.mjs"
  - "scripts/medir-*.mjs"
  - "scripts/derivar-tags.mjs"
  - "public/data/heroes.json"
  - "pruebas/motor/**"
---

# El motor y el modelo

Se carga al tocar el motor, sus mediciones o el catálogo de héroes. Antes de cambiar una constante, mídela (agente `medidor-motor`).

## Las reglas por etiqueta, medidas

Lo que dice hoy, y conviene leerlo entero antes de tocar `reglas.js`:

- Siete de las once reglas medibles encuentran más héroes de los que daría el
  azar. El efecto existe.
- Pero el TAG los captura fatal. `anti_mobility` está puesto a 9 héroes: lo
  cumplen 4, y hay 17 sin la etiqueta que lo cumplen -Obsidia (+1,17pp, t=5,96),
  Hilda, Cyclops, Jawhead...-. La regla es cierta y la etiqueta está mal, que es
  otro problema y se arregla de otra manera.
- **Y sobre todo: las once reglas miden UN SOLO EJE.** La ventaja de un héroe
  contra `dash` y contra `dive` correlacionan a r=0,93; contra `mobile` e
  `immobile`, a −0,87. Los grupos de enemigos se solapan al 68%. No hay doce
  relaciones tácticas: hay una, "a quién te comes tú y quién te come a ti", con
  los asesinos en un extremo y los supports en el otro. Una regla nueva no añade
  información: repite esa misma.

Cada regla nueva es deuda, y ahora además está medido.

Desde 1.16.0 esto tiene consecuencia en pantalla: un motivo por etiqueta solo se
enseña **si el cruce real va en el mismo sentido**. La regla explica el porqué;
el dato dice si es verdad. Sin dato del cruce (héroe recién salido) la regla se
enseña igual, que es justo para lo que está. Y el umbral de «ganas el cruce»
salió de medir la distribución (p90/p10 = 0.5154/0.4846), no de suponer que un
53% es ventaja: 0.53 era el percentil 99 y por eso el motivo bien fundado casi
nunca salía. Medido en 2.000 tarjetas: motivos con dato del 14,5% al 50,4%.
Desde 3.35.0, entre ese p90 y el p95 (0,5208/0,4792, `CRUCE_FUERTE`) el
motivo y el análisis lo dicen «por poco» (claves `…Poco`, mismo
`idMotivo`): un 48,4% salía «pierdes el cruce: 48%».

## El modelo (2.0)

`src/motor/modelo.js` y `src/motor/ranking.js`. La nota de un pick ES la
probabilidad de ganar el draft que resulta con él: un modelo aditivo en
log-odds con seis términos (héroes, cruces, parejas, equilibrio de daño
desde 3.4.0, tú, por ver), todos centrados, sumados con coeficiente 1 (el
equilibrio con 0,5, medido) y multiplicados por UNA escala medida
(`ESCALA = 0.44 ± 0.12`). No hay reescala min-max dentro del pool ni pesos por
componente. Todo lo de abajo está medido con `scripts/ajustar-modelo.mjs`
(regresión logística sobre 902 partidas pro de 120 días con resultado, 10
pliegues de validación cruzada; 1.528 partidas de 400 días dan lo mismo) y
se repite en cada corrida de `pro.yml` al log. NO vuelvas a suponer:

- **Los tres términos de datos pesan lo mismo.** Coeficientes libres: H 0.50
  ± 0.16, C 0.49 ± 0.29, S 0.11 ± 0.36; la validación cruzada no mejora con
  ellos (logL/n −0.6810 frente a −0.6801 con una sola escala). Iguales y
  una escala. Si un día el bot mide otra cosa con ± pequeño, se cambia AQUÍ
  y se documenta.
- **La escala es 0,44, no 1.** Con coeficiente 1 (la estimación de 1.28 a
  1.41) el Brier fuera de muestra era 0.2510, peor que una moneda; con 0.44,
  0.2435. `medir-pro.mjs` mide la pendiente del modelo YA escalado y debería
  salir 1 (hoy 1.00 ± 0.28); el diagnóstico avisa si se aleja más de dos
  errores típicos.
- **El cruce de línea no pesa más** (R −0.56 ± 0.62 frente a O 0.78 ± 0.32
  al partir C; con 400 días 0.07 ± 0.48 frente a 0.83 ± 0.24). El ×2 de 1.x
  desapareció de todo: ranking, consejo a compañeros y simulación. El rival
  se sigue deduciendo para el análisis.
- **Los huecos de composición por etiqueta no predicen** (0.00 ± 0.07 por
  hueco, σ del término 0.96). TEAM_NEEDS se dice (composicion.js), no puntúa.
  El hueco de daño COMO REGLA (todo físico o todo mágico, con un mixto
  tapándolo) no se puede medir: 0 de 902 equipos pro lo tienen. Se dice
  igual, como consejo. Lo que SÍ se mide es el equilibrio, abajo.
- **El equilibrio de daño puntúa** (3.4.0, `terminoEquilibrio`,
  `PESO_EQUILIBRIO_DANO = 0.5`): min(físicos, mágicos) de los tuyos menos el
  de los suyos, con el tipo de daño contado del texto de las habilidades y
  el MIXTO sin contar para ninguno (así se midió; contarlo medio, o
  −|f−m|, o «ambos ≥ 1», o el nº de magos, salen peor o igual). Es el único
  de doce candidatos medidos en 3.4.0 que mejora la validación cruzada:
  winrate por nº de magos puros (400 días): 0 → 42,9% (77 equipos), 1 →
  45,3% (782), 2 → 51,6% (1.610), 3 → 52,2% (1.045), 4 → 47,2% (144).
  Coeficiente libre 0,22 ± 0,09 (120 días) y 0,21 ± 0,06 (400); ganancia
  fuera de muestra con ocho semillas de partición: +3,05 a +3,87 de logL
  por 1.000 partidas a 120 días y +2,52 a +3,38 a 400 (con el signo
  cambiado, negativa); AUC 0,574 → 0,591 y 0,565 → 0,581. El peso 0,5 sale
  de una rejilla con la escala única: el óptimo está en 0,45–0,55 en las
  dos ventanas, y la escala con él dentro es 0,48 ± 0,10 y 0,42 ± 0,07,
  compatible con 0,44. Con el draft a medias cada equipo se centra en lo
  que cabe esperar de su tamaño (`equilibrioEsperado`, multinomial por
  cuota de pick: sin centrar, 1 contra 5 daba el 39,8%), con cinco y cinco
  se cancela. Motivo en la tarjeta solo cuando TU pick sube el mínimo. La
  prueba de la escala exige además que el término siga mejorando la
  validación cruzada (mínimo 0,5 por 1.000, cinco veces por debajo de lo
  medido) y `ajustar-modelo.mjs` lo enseña como `+dano` y `escala+dano`.
  La banda de drafts al azar se abre de 40/60 a 38/62 (p05/p95): es la
  información nueva, no ruido. **Vigilar**: el 3 de octubre de 2026, con
  el corpus pro en 2.301 partidas a 400 días (188 posteriores al reinicio)
  y los cruces de Mítico, la ganancia fuera de muestra del término bajó a
  ≈0 (media de ocho semillas −0,01 por 1.000; a 120 días −2,0) y su
  coeficiente libre a 0,13 ± 0,056 (el motor supone 0,5 × 0,44 = 0,22: a
  1,6 SE, dentro del error, así que no se toca). La prueba exige desde
  3.35.0 > −3 (el signo cambiado da −8 a −9), no > 0. Si el coeficiente
  sale del error en las corridas siguientes de `pro.yml`, se reajusta. OJO (3.7.1): esa banda depende de la
  dispersión de los winrates del parche (5 pp en vez de 3 la semana
  después de un reinicio de temporada → 36/64) y por eso ya no se exige
  sobre los datos reales, sino sobre el meta sintético.
- **El orden de pick de Liquipedia no lleva contrapick medible**: el cruce
  medio del héroe elegido después contra el elegido antes es 0.000 (n=19.072
  pares). Así que no hay castigo adversarial; lo que falta por salir entra
  como ESPERANZA del cruce contra lo que se juega en cada línea abierta
  (`esperanzaCruces`, ponderado por lo que se juega cuando no está baneado,
  `disponibilidad = pickRate/(1−banRate)`, desde 3.4.0). Medido en 14.640
  situaciones de draft pro (dados 1–4 picks por equipo, adivinar los que
  faltan): por pickrate, MRR 0,054 y el 13,0% de acierto en el top 10; por
  pickrate/(1−banrate), 0,081 y 15,3%; condicionar además por sinergia con
  los aliados vistos (13,3%) o por cruce con los enemigos (13,2%) no añade
  nada, y la frecuencia pro (42,6% con leave-one-out) es otra población y
  no vale para Gloria. El aviso de «arriesgado como
  pick ciego» sigue como aviso (`riesgoContrapick`, `esPickCiego`), no
  puntúa.
- **El lado azul** vale 0.07 ± 0.07 (120 días) y 0.02 ± 0.05 (400): nada
  que la app pueda usar, y no sabe el lado.
- **La AUC es 0.56–0.59** (0,57 sin el equilibrio, 0,58–0,59 con él). Es lo
  que consiguen los predictores de draft en MOBA: el draft inclina, no
  gana. Cualquier cosa que prometa más está mal.
- **Las parejas solas no se distinguen** (sin S la validación es igual).
  Se dejan con la misma escala porque el dato es real (dos magos −4pp) y
  no empeora; si algún día estorban, se mide, no se supone.
- **La maestría sustituye al término de héroe** (como en la estimación de
  1.28): tu winrate encogido hacia lo que cabe esperar de ti con ese héroe,
  también sin winrate público (referencia 50%). Escalada por la misma
  ESCALA que todo. Sus motivos se miden contra lo esperado ± σ.
- **Las reglas por etiqueta** solo entran sin dato (cruce o pareja nula) y a
  la equivalencia de 1.x: la regla más fuerte vale un cruce del 56%
  (`CRUCE_POR_REGLA_MAXIMA`); las de peligro en los baneos, igual.
- **Márgenes en probabilidad**, decisiones de frecuencia medidas en 300
  drafts de roam: empate `MARGEN_EMPATE = 0.004` (p25 de la distancia
  nº1–nº2, se dice en uno de cada cuatro), «pick claro» `BRECHA_CLARA = 2`
  puntos (p85). La distancia nº1–nº2 mediana es 0,9 puntos: en la mitad de
  los drafts el modelo NO distingue al nº1 del nº2, y eso es verdad.
- **Cambia el nº1 respecto a 1.x en el 44% de los drafts** (168 de 300
  iguales; el nº1 viejo queda entre los tres nuevos en el 84%). Es la
  consecuencia de medir en vez de pesar a mano.
- **Los baneos sugeridos** son pérdida esperada: (pickrate cuando no está
  baneado, `disponibilidad`) × (su término de héroe + sus cruces contra
  tus aliados). Sin pesos. Desde 3.4.0 esa misma función pondera el término
  «por ver» y la simulación: una sola definición de «lo que se juega».

**La versión del modelo (3.60.3)**: `VERSION_MODELO` va con cada partida
apuntada para no mezclar modelos al calibrar en la cola de Javi. Si cambias
lo que da `evaluarDraft` para el mismo draft (un término, la escala, cómo se
centra, cómo entra la maestría), súbela. La prueba «la huella del modelo»
de `modelo.test` falla hasta que se sube: corre un draft fijo sobre héroes y
datos INVENTADOS, sin `heroes.json` ni el meta del día, para que un cambio
de catálogo no la dispare. Se sube la versión y se apunta la huella nueva
en `HUELLAS`.

Para volver a ajustar: `node scripts/ajustar-modelo.mjs` (y `--dias 400`),
mirar `logL/n` fuera de muestra, y cambiar `ESCALA`/`AJUSTE` en modelo.js
solo si la diferencia sale del error. La prueba «el modelo: la nota es la
probabilidad…» falla si la escala medida hoy se aleja más de 2,5 SE de la
del código.

**«Céntrate en sinergias» (3.60.0), medido antes de tocar nada** (agente
`medidor-motor`, 19 de octubre de 2026): coeficiente libre de S 0,20 ± 0,36
(120 días, 1.469 partidas pro) y 0,26 ± 0,23 (400 días, 2.770); logL/n
fuera de muestra con S ×1,5/×2/×3: −0,4/−1,0/−2,4 por 1.000 a 400 días
(quitarlo, 0); AUC 0,579 → 0,574 (×2). En las 182 partidas de Javi con ≥3
aliados el término de su equipo sale −3,0 ± 1,4 (AUC 0,44; poco fiable:
matrices de hoy, aliados que no elige él). ×2 cambiaría el nº1 en el 25–28%
de 300 drafts de roam. Así que NO pesa más: se ENSEÑA. `evaluarDraft`
devuelve `mejorPareja` (con quién de tu equipo combina mejor tu pick, en
puntos de winrate sobre la pareja media, solo con dato) y la tarjeta la
dice; el botón «Sinergia» (`.filtro-sinergia`) reordena por
`terminos.parejas` sin tocar número ni nota. Pruebas en `modelo.test` y
`pick.e2e`, dos mutaciones.

## La probabilidad estimada de ganar

Desde 1.28.0, y desde 3.0 dentro de `src/motor/modelo.js` (`evaluarDraft`,
la misma función que puntúa el ranking: la nota ES la probabilidad). Modelo
aditivo en log-odds con los términos de «El modelo» (desde 3.4.0 también el
equilibrio de daño), y cada uno está medido antes de sumarse. Lo que NO conviene
volver a suponer:

- **El centro del término de héroe es la media PONDERADA por cuota de pick
  de la ventana en uso** (3.7.1): ≈0,50 por construcción. La media simple
  de los 133 (0,482 tras el reinicio de temporada, 0,493 antes) sesgaba a
  favor del equipo con más héroes vistos. Y `equilibrioEsperado` centra en
  un equipo de uno por línea, no en cinco al azar (ver «Errores»).
- **Las tres matrices están centradas.** Los cruces son antisimétricos
  (c[a][b]+c[b][a] = 1.0000 en los 8.778 pares) y no llevan la fuerza de
  nadie (r=0,009 con wrA−wrB). Las parejas TAMPOCO llevan la fuerza de los
  dos (pendiente 0.000 sobre wrA+wrB, r=0.000), aunque su media no sea 0.5
  (0.4954) y no sean antisimétricas: se centran en su propia media, que se
  calcula de la matriz, no se escribe.
- **Centrar los cruces en la media de la fila (0.494) es un error**, aunque
  el CLAUDE.md diga que esa es la media: metía +0.6 log-odds a favor del
  primer equipo y la mediana de drafts al azar salía al 64%. Se centran en
  0.5. Hay una prueba de que la mediana en 200 drafts al azar queda en 50±6.
- **La escala está medida en las partidas pro** (2.0): 0.44 ± 0.12 (ver «El
  modelo»). Con drafts completos al azar da entre el 40% y el 60% (p05/p95);
  antes, sin escala, entre el 30% y el 70%, y eso era exagerar. Lo que sigue
  sin saberse es si en la cola de Javi vale lo mismo que en pro: por eso
  cada partida apuntada guarda `estimacion` y `calibracion()` en registro.js
  compara previsto con ocurrido (Brier contra 0.25 con su error típico, y
  winrate real con ≥50% frente a <50%). Cuando haya partidas de sobra, ESO
  es lo que dice si el número vale para él.
- **Tu maestría sustituye al término de tu héroe, no se suma encima.** Tu
  winrate con él se encoge (mismo prior que la maestría) hacia lo que cabe
  esperar de ti con ese héroe: su winrate público más tu ventaja sobre el
  50%. Hay una prueba de que el término de héroes no cambia con la maestría.

La composición (`composicion.js`) separa dos cosas que no valen lo mismo: lo
medido en las parejas (dos del mismo daño rinden 0,54 puntos peor; dos magos
−4,0pp, dos asesinos −2,6, dos tanques −1,95, dos tiradores −1,26, en
`ROL_DOBLE_PP`) y los huecos por etiqueta (`TEAM_NEEDS`), que son regla
escrita a mano y se enseñan como tal. Solo se dicen en voz alta con tres
aliados, como el daño: es una afirmación sobre el equipo. Las listas de
claves en los params de un motivo (`lista: ['comp.tanky']`) las traduce `t()`
elemento a elemento.

## Simular lo que falta por salir

Desde 1.27.0, `src/motor/robustez.js`. Con el draft a medias se simulan
finales plausibles —por las líneas enemigas abiertas (`lineasOcupadas`, el
mismo reparto que el rival) y muestreando cada línea por lo que se juega
cuando no está baneado (`disponibilidad`, desde 3.4.0; antes por pickrate a
secas)— y se cuenta
en qué fracción tu nº1 sigue siéndolo. Dos cosas medidas que no conviene volver
a suponer:

- **La cuota predice**: en roam con 2 enemigos vistos, cuota ≥ 0.5 → el nº1
  aguanta el 71% del draft completo; < 0.5 → 28%. Con 3: 62/26. Con 4: 71/31.
  Con 1 visto casi nada es robusto (14 de 200). `CUOTA_ROBUSTA = 0.5` es donde
  separa. Medido en 1.x con el rival doble; con el modelo de 2.0 la prueba
  de que predice (diferencia de tasas ≥ 0,12 sobre 150 drafts) sigue en
  verde.
- **El final simulado tiene que parecerse al real** (1.27.1): los baneados no
  salen por ninguna línea ni son candidatos (la primera versión votaba a un
  héroe baneado que la app no enseñaba, y llamaba «frágil» al nº1 real con
  una cuota falsa), y cada final se puntúa COMPLETO: `lineasAbiertas: []`
  al llamar a `rankRoamers`, o el término «por ver» contaría dos veces a
  los que la simulación acaba de sacar (hay prueba). Si `rankRoamers` gana
  otra entrada de contexto que cambie el ranking, pásala también a la
  simulación.
- **No se usa para ordenar.** Medido con 120 simulaciones y dos semillas:
  ordenar por la simulación solo mejora con un enemigo visto (+4–6 puntos de
  acierto del nº1) y con dos o tres no aporta nada; cambiar de mecanismo en una
  sola fase sería un acantilado. Se enseña como información.
- Se cuenta por **votos** de nº1, no por media de puntuaciones: la nota se
  reescala dentro de cada draft y promediar escalas distintas es el fallo del
  encogimiento que se comía la normalización.
- Es determinista (semilla fija): sin eso el número bailaría entre dos
  aperturas del diagnóstico. El generador es mulberry32 (1.31.3): el
  congruencial de antes tenía correlación serial (−0,011) y sesgaba de forma
  sistemática (+0,034 en un intercepto conocido, 8 semillas × 20.000). Con
  60 finales el cambio de generador mueve la cuota del nº1 una mediana de 5
  puntos (p90 13), o sea el ruido ±6 documentado: si alguna vez hace falta
  un número más fino, sube `FINALES_POR_DEFECTO`, no cambies el generador.
  Las pruebas que generan drafts sintéticos con el congruencial no importan
  (muestrean, no calibran); una que AJUSTE algo con él, sí.

## El consejo para los compañeros

Desde 1.34.0, `src/motor/equipo.js`. Con algún enemigo a la vista, para cada
línea que tu equipo aún no cubre (`lineasOcupadas` con tus aliados, el mismo
reparto que con los enemigos) se ejecuta `rankRoamers` sobre el pool de esa
línea, con tu nº1 como aliado ya elegido, sin maestría (el término «tú» es
cero) y con las mismas líneas enemigas abiertas. El rival de ESA línea se
enseña junto al consejo; desde 2.0 no pesa doble. No hay pesos nuevos ni
constantes nuevas: es el motor de tu pick apuntando a otra línea.
Nunca aconseja tu línea, ni a nadie cogido o baneado. Va plegado bajo la
estimación para no empujar tu primera recomendación fuera de pantalla, y
tocar una opción la mete en tu equipo. Prueba con datos reales: cuatro líneas
sin aliados, la jungla se cierra con Fanny aliada, el baneado no sale, el
consejo cambia entre tres asesinos y tres magos (verificado por mutación).

## El siguiente baneo probable

Desde 1.35.0, `src/motor/baneos.js`: en la fase de baneos, los más baneados
del rango que aún no están marcados, para tocar en vez de escribir. Es la
`banRate` de la API sin más, y está medido por qué no hay más:

- `banRate` es por partida (los 133 suman 8,85 con diez baneos por partida):
  ordenar por ella es ordenar por la probabilidad de caer baneado. Los ocho
  primeros de Gloria pasan del 50% (Hirara 80%, Belerick 65%, Eudora 65%...).
- La co-ocurrencia entre baneos SÍ añade algo en las 527 partidas pro con los
  diez baneos: dados cinco, acertar los otros cinco con diez candidatos sube
  del 57% al 62% en la misma época (del 42% al 58% mezclando épocas, que es
  deriva del meta, no asociación). Pero los profesionales banean OTRA COSA:
  el top 10 de `banRate` de Gloria cubre solo el 26,5% de sus baneos (top 20,
  el 37%). Llevar la co-ocurrencia pro a un draft de Gloria sería medir en
  una población y aplicar en otra. `scripts` no lo lleva: la medida está en
  el scratch de la sesión y se resume aquí.
- Desde 1.36.0 cada partida apuntada guarda `bans` (nombres, hasta diez;
  `sanear` los limpia y quita el campo si queda vacío) y la co-ocurrencia se
  mide en SU historial (`coocurrenciaDeBaneos`): dados los baneos marcados,
  cada candidato se multiplica por la media geométrica de P(x|g)/P(x), con
  P(x|g) = (n_xg + K·p_x)/(n_g + K) y `K_COOCURRENCIA = 2`. K se eligió en
  el corpus pro simulando un historial de M partidas y prediciendo el resto
  (acierto del top 10 sobre los cinco que faltan dados cinco): K=2 gana con
  M=20 (56,9 → 58,7%), M=100 (56,8 → 62,2%) y M=200 (53,9 → 58,0%); K≥10 va
  perdiendo lo ganado. Sin historial el factor es 1 y no hay escalón. Los
  baneos van dentro del perfil exportado (son parte de `partidas`).

## Tu pick fijado (3.5.0)

Desde 3.5.0 el draft guarda `miPick` y `miPickDesde` (dentro de
`roam-picker:draft`, la misma clave). Se fija tocando el NOMBRE de una
tarjeta (el nombre es el botón: cada bloque nuevo en la tarjeta empujaba la
nº1 fuera de la primera pantalla, medido en `primera-pantalla.e2e.mjs`) o
el hueco «Tú» de tu equipo, que abre tu pool en el orden del ranking
(`SelectorDeHeroe` con `orden='dado'`). `eleccionDe(ranking, miPick)` en
`draft.js` es el ÚNICO sitio que decide de quién se habla: el fijado si
está en el ranking, si no el nº1. De él hablan el análisis (`eleccion`), la
composición, el consejo a los compañeros, la estimación en pantalla y
«Apuntar partida» (viene marcado). Lo que NO cambia con el pick fijado: el
ranking (sigue siendo el de la línea) y la simulación de finales, que
cuenta votos de nº1: por eso `analizarDraft` se calla la frase de
robustez para un pick fijado que no es el nº1 («sigue siendo el nº1 en el
0%» no dice nada) y dice en su lugar cuántos puntos le faltan
(`analisis.tuPickPorDebajo`, con el mismo umbral `BRECHA_CLARA`).

Diez minutos después de fijarlo (`MINUTOS_PARA_RECORDAR`, una partida dura
más), al volver a la app (`useAhora`: cada minuto y en `visibilitychange`),
se pregunta cómo fue: Gané/Perdí apuntan con un toque y «Más tarde» vuelve
a poner el instante. Desde 3.9.0 también SIN pick fijado: el draft guarda
`completoDesde` (cuándo llegó a cinco enemigos y cuatro compañeros;
`completoDesdeDe` lo conserva, arranca o borra en cada cambio, y `cargar`
lo descarta si el draft guardado no está completo) y a los diez minutos se
pregunta por `rec.eleccion` (el nº1) con «Otro héroe» para abrir «Apuntar
partida». Sin esto, quien mete el draft entero y no toca «Lo cojo» no
apuntaba nunca, y la base de datos de partidas (3.8.0) no crecía. Es lo que hace crecer el Veredicto (30+30) y la
calibración (20) sin acordarse de nada. Cada partida apuntada lleva desde
3.5.0 su `draft` (`sanearDraft` en registro.js: línea, enemigos, aliados,
rival; unos 200 bytes; pasa por `sanear` del perfil y viaja en el código):
sin el draft, una partida apuntada era irrecuperable para medir el modelo en
la cola de Javi. Desde 3.8.0 llegan al repositorio (ver «La base de datos de
tus partidas») y `medir-mias.mjs` las mide.

El consejo a los compañeros va DIFERIDO desde 3.5.0 (`useDeferredValue`
sobre enemigos, aliados, baneos y el pick), con su propio `yo` en el
resultado (`consejos.yo`) para que lo que se enseña sea coherente consigo
mismo aunque vaya un render por detrás. Medido antes de diferirlo: 41 ms
con un enemigo (160–250 en un móvil), el doble que el ranking; ahora el
toque síncrono es el ranking (10 ms) más el análisis.

## Qué hace cada héroe (3.20.0)

Las etiquetas de `heroes.json` se revisaron el 27 de septiembre de 2026
leyendo el kit ENTERO de los 133: el texto oficial de cada habilidad y sus
etiquetas de Moonton (`skilltag`: CC, Mobility, Heal, Shield, Slow, Burst,
AOE…), que vienen en `/api/heroes/{id}` y la ingesta ya descargaba para el
tipo de daño. Cinco revisores en paralelo con los MISMOS criterios (ahora
en `tagLegend`) y cita literal de la habilidad por cada cambio; las 48 dudas
se decidieron a mano. Cambiaron 102 héroes: `cc_hard` +46, `cc_chain`
+31/−5, `shield` +20/−2, `engage` +18, `heal` +15/−3, `immobile` +11/−9,
`zone` +3/−8… Tres cosas medidas que no conviene volver a suponer:

- **El kit NO predice quién gana en pro**, ni con las etiquetas viejas ni
  con las nuevas. Sobre el modelo actual, 22 candidatos (hueco por
  necesidad, recuentos de habilidades CC/Mobility/Heal/Shield/Slow/Burst/AOE
  por equipo, héroes con cada una): los que asoman a 120 días (movilidad
  −0,18 ± 0,06; peel +0,59 ± 0,23 con las etiquetas nuevas) desaparecen a
  400, y con 22 candidatos uno así sale por azar. Los huecos se DICEN, no
  puntúan (como ya decía «El modelo»). `medir-kits.mjs` y `kits.json` están
  en el scratch de la sesión.
- **Ninguna recomendación cambió**: el ranking es idéntico en 300 drafts
  (nombres y probabilidades), porque las reglas por etiqueta solo mandan sin
  dato. Cambia lo que se DICE: el aviso de antisanación pasa de 15 a 37 de
  300 drafts (más curanderos bien marcados) y el análisis se mueve poco.
- **Una etiqueta de hecho que casi todos cumplen no sirve de aviso**: 101 de
  133 aturden, levantan o empujan con alguna habilidad, así que el aviso de
  botas anticontrol con `cc_hard` saltaba en el 99,6% de los equipos (en el
  76% ya con las etiquetas viejas). Desde 3.20.0 mira `cc_chain` (dos o más
  que encadenan: el 33% de los equipos realistas, 101 → 46 avisos en 300
  drafts). Y «ellos no tienen control» ya no sale casi nunca: es verdad.

Y una trampa en la que se cayó a medias: **`dash` NO es «tiene un
desplazamiento»**, es «depende de dashes o parpadeos para entrar y salir»
(la regla `antiDash` va contra eso). Los criterios de la revisión lo leyeron
en el sentido amplio, lo pusieron a 94 héroes (Tigreal, Akai…) y la prueba
de concentración sin datos lo cazó (Chou nº1 en el 71%); medir-reglas lo
confirma (con el sentido amplio la cumplen 2 anti-dash, con el estricto 5).
Se aceptaron solo las retiradas (Aamon, Pharsa: ningún desplazamiento). La
regla `escudoPoke` se probó a quitar por lo mismo y no era la causa: se
queda, sin efecto medible (0 de 24) y sin decidir nada con dato. Antes de
cambiar lo que significa una etiqueta, mira qué regla la lee.

`catalogo.test` comprueba la coherencia interna (`immobile` excluye `dash` y
`mobile`, `cc_chain` y `engage` implican `cc_hard`, todo tag está en la
leyenda; cuatro mutaciones). Las etiquetas de RELACIÓN (`anti_mobility`,
`anti_dive`) y de escalado (`hypercarry`, `assassin_late`) no se tocaron:
salen de datos, no del texto, y ya no deciden nada con la matriz completa.

## Lo que cuesta un toque (medido en 3.0)

Medido en el portátil del contenedor con los datos reales (`coste.mjs` en el
scratch de la sesión). Un móvil de gama media va entre cuatro y seis veces más
lento, así que la columna que importa es la de la derecha:

| | 1 enemigo | 3 enemigos | draft completo | en el móvil |
|---|---|---|---|---|
| `prepararDatos` (una vez por carga) | 44 ms | — | — | ~0,2 s |
| `ordenarPicks` (CADA toque) | 11,4 ms | 6,0 ms | 3,6 ms | 20–60 ms |
| `aconsejarEquipo` (DIFERIDA desde 3.5.0) | 21,9 ms | 12,5 ms | 8,0 ms | 40–110 ms |
| `baneosSugeridos` + `siguientesBaneos` | 0,9 ms | 0,5 ms | 0,5 ms | ~4 ms |
| `simularFinales` (60 finales, DIFERIDA) | 78 ms | 62 ms | — | 0,3–0,5 s |

Tres cosas que se leen de ahí:

- **Cuanto más vacío el draft, más caro**: con un enemigo hay cuatro líneas
  abiertas y el término «por ver» recorre el pool de cada una. Es justo al
  revés de lo que uno supondría.
- **La simulación es lo caro y por eso va diferida** (`useDeferredValue` en
  `useRecomendacion`), con la marca de para qué draft se hizo: sin la marca,
  el análisis cruzaba la cuota del draft anterior con el nº1 nuevo.
- **`aconsejarEquipo` cuesta el doble que el ranking y por eso va diferido
  desde 3.5.0** (en 3.0 no lo iba, y se dejó a propósito para no cambiar dos
  cosas a la vez): son cuatro rankings más, y se calculan aunque el bloque
  venga plegado. Diferirlo pidió la misma marca que la simulación
  (`consejos.yo`: si no, enseñaría el consejo de un draft con el nº1 de
  otro). Hoy el toque síncrono es el ranking (10 ms) más el análisis. Si
  añades algo al toque, mídelo aquí.
