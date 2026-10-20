---
paths:
  - "src/motor/plan.js"
  - "src/motor/fases.js"
  - "src/motor/builds.js"
  - "src/motor/directo.js"
  - "src/app/componentes/Builds.jsx"
  - "src/app/componentes/Plan*.jsx"
  - "scripts/medir-fases.mjs"
  - "pruebas/motor/plan.test.mjs"
  - "pruebas/motor/fases.test.mjs"
  - "pruebas/motor/builds.test.mjs"
---

# El plan de partida, las fases y las builds

Se carga al tocar el plan, las fases de la partida o las builds de objetos.

## El plan de partida (3.36.0)

`src/motor/plan.js`, por `planear` en `draft.js` (y `partida` en
`recomendar`). Pedido por Javi: «consejos sobre cómo jugar ese personaje en
esa partida en concreto, como focus a tal… que sirva también como
instrucciones para el equipo, así puedo dar consejos mientras juego en el
chat de voz». Va ARRIBA de la hoja de objetos (el botón de cada tarjeta
pasa a «Plan y objetos»): ni un píxel más en la tarjeta nº1. Lo que
conviene no olvidar:

- **Es consejo, no nota.** No cambia el ranking ni la probabilidad, y
  ninguna frase está medida contra partidas (en pro el kit no predice
  quién gana: «Qué hace cada héroe»). Lo medido son los NOMBRES: «focus a
  X» es el enemigo blando (sin `tanky`) con más término de héroe más
  cruces contra los vuestros, lo mismo que suma `evaluarDraft` visto desde
  su lado; tu peor y mejor cruce salen con los cortes p05/p95
  (`CRUCE_FUERTE`), no con el p10/p90: una orden por voz es una
  afirmación; las parejas, con `PAREJA_DESTACABLE`.
- **Las habilidades las trae la ingesta** (`extraerHabilidades`, campo
  `habilidades` de cada héroe en `roam-meta.json`, ~7 KB): de las
  etiquetas de Moonton de cada habilidad (`skilltag`: CC, AOE, Remove CC,
  CC Immune, Invincible, Death Immunity) y, para «quita controles», también
  del texto: medido el 3 de octubre de 2026, la etiqueta marca 5 de las 11
  que lo hacen (Argus, X.Borg, Masha, Akai, Joy y Nana solo lo dicen en el
  texto). `aliados` solo si además limpia y el texto habla de aliados
  (Diggie, Faramis: «clear all debuffs»). NO se identifica la ulti: por CD
  máximo fallaba en 11 de 111 héroes de cuatro habilidades (CD nulo en las
  de cargas) y los que se transforman llegan a 20 habilidades; se nombra
  la habilidad por su efecto y su nombre en inglés. Desde 3.37.0: la
  PASIVA (la primera de cada lista; no por el enfriamiento, que la ulti de
  Gatotkaca tampoco trae) no cuenta, porque no se lanza («guarda Molina's
  Gift» de Nana); `Death Immunity` NO es `inmortal` (Argus no muere pero
  se le controla: «guardad el control para cuando se le acabe» era lo
  contrario); y la ficha que llega sin nada que contar deja `[]`, no las
  de antes (un rework que quita el último control). Se conserva con la
  ficha caída, como `speciality`, y `comparar-ingesta` cuenta
  `conHabilidades`.
- **Medido en 300 drafts de roam completos** (5 contra 4): focus en el
  100%, «quédate con» 58%, «busca a» 53%, «rota con» 44%, «separaos» 37%,
  antisanación 31%, «abres tú» 30%, «proteged a» 27%, intocable 25%,
  «evita» 17%, cerrar pronto 6%, guardar la limpieza (Diggie) 5%, aguantad
  3%; ningún plan vacío. Con 3.37.0 (sin pasivas ni Death Immunity, y el
  ancla en el tirador inmóvil): «quédate con» 55% e intocable 8%; lo demás
  igual. Cazado ahí: «quédate con Fanny» (asesina con
  `assassin_late`): a quien se protege es al tirador inmóvil y nunca a
  quien salta (`dive`).
- Los umbrales de «escaláis mejor» (`DIFERENCIA_DE_ESCALADO` = 2, y desde
  3.37.0 solo con los dos equipos enteros: con picks tuyos por salir, los
  que faltan suelen ser justo los que escalan) y de «todo físico/mágico»
  (cuatro enemigos o más, ninguno del otro ni mixto) y los topes
  (`MAX_EQUIPO` 5, `MAX_TUYO` 4) son decisiones de producto. La hoja sale
  también sin builds (el botón dependía de `meta.builds`).
- «Copiar para el chat» copia lo del equipo en una línea (` · `).
- Pruebas: `motor/plan.test` (fixture determinista, 20 mutaciones),
  `scripts/ingesta.test` (formas reales de la API) e `ingesta-simulada`
  (servidas y conservadas), `interfaz/plan.e2e` (abre la hoja, focus a un
  enemigo blando, copia, nada fuera a 320 px; tres mutaciones). El
  diagnóstico enseña el plan del nº1 con sus claves.

## Las fases de la partida (3.43.0)

`src/motor/fases.js`, por `planear` en `draft.js`. Pedido por Javi: «que
solo leyendo sepa exactamente qué hacer… que seas capaz de predecir qué
problemas puedo tener y cómo jugar el early, mid y late». La hoja «Plan y
objetos» enseña la probabilidad de ganar SEGÚN EL MINUTO EN QUE ACABE la
partida (seis barras: 10–12 … 20+) y el plan por etapas (al principio, en
las peleas, al final, problemas). Lo que conviene no volver a suponer:

- **El dato es la curva por duración de la API** (`curvaLinea` en
  roam-meta.json: el winrate de cada héroe EN SU LÍNEA en las partidas que
  acaban en cada tramo de dos minutos, de la misma respuesta que
  `winrateLinea`, `recogerCurva` en extraccion.mjs: ni una petición más).
  Seis tramos fijos (`TRAMOS_CURVA` = `TRAMOS` de fases.js, con prueba de
  que coinciden); con otros tramos no se guarda. Se funde par a par como el
  winrate por línea y `comparar-ingesta` la cuenta (`curvaLinea` en `FIJAS`
  y en la fila de salud). La primera tanda (Gloria, 165 pares) se metió el
  5 de octubre de 2026 con el serializador de la ingesta; desde ahí la trae
  el bot.
- **Es señal**: la pendiente de cada héroe-línea casa entre Gloria y Mítico
  a r = 0,88 (poblaciones distintas); σ entre héroes 1,4 pp por tramo,
  residuo a la recta 1,1 pp. Por tercios de cuota de pick, la fiabilidad es
  0,87 en los poco jugados y 0,91 en los muy jugados (ruido de la
  diferencia 0,21 frente a 0,11): poco, así que NO se encoge por muestra
  (probado en pro: encoger con s = 0,001–0,012 da +5,06 a +5,08 frente a
  +4,91, dentro del ruido). Lo extremo de Natalia en roam (+1,24 / +1,04 de
  logit en los dos rangos) no es ruido.
- **Predice**: sobre 2.268 partidas pro con su duración, la forma de las
  curvas de los dos equipos (cada héroe en la línea del reparto de la app)
  EN EL TRAMO EN QUE ACABÓ, sumada al modelo, mejora la validación cruzada
  +4,9 por 1.000 con las curvas de Gloria y +6,2 con las de Mítico (el
  equilibrio de daño, que sí entró en el modelo, da +3), coeficiente 0,71 ±
  0,15 y 0,87 ± 0,16; a 120 días, 0,75 ± 0,23 y 0,90 ± 0,24. Con las
  curvas BARAJADAS entre héroes, +0,45 y el signo al revés. En crudo: el
  equipo «de late» gana el 39–42% de las partidas de menos de 13 minutos y
  el 49–50% de las de 18 o más. `COEF_FASE = 0.71` (las de Gloria, que son
  las que trae la ingesta). `scripts/medir-fases.mjs` lo repite (con prueba
  que lo ejecuta entero); si el coeficiente se aleja más de 2,5 SE, lo dice.
- **Lo que NO dice**: quién gana sin saber cuánto dura (eso sigue siendo la
  nota de `evaluarDraft`). El ranking es idéntico con y sin curvas (hay
  prueba). La probabilidad por tramo es la nota de siempre más
  `COEF_FASE × (forma vuestra − forma suya)` en ese tramo; cada forma se
  centra en lo que cabe esperar de lo que SALE (`centroDeFases`, ponderado
  por cuota de pick, con el «no sé» a 0), para que un equipo con menos
  héroes a la vista no parezca de early o de late por eso.
- **Umbrales, decisiones de producto con la frecuencia medida** (300
  drafts completos de roam): la diferencia entre la partida corta y la
  larga va de −26 a +29 puntos (p05/p95), p25/p75 −10/+13; «sois de early /
  de late» con `DIFERENCIA_DE_FASE` 10 puntos (sale en el 59%). Un héroe se
  nombra de early o de late con `PENDIENTE_DE_HEROE` 0,25 de logit (p20 y
  p80 de los 165 pares). «La partida cambia de lado en el minuto X» solo con
  tendencia. Las primeras cifras (0,05 y 0,12) lo decían de casi todo: el
  enemigo «de early» salía en el 84% de los drafts.
- **Por etapas** (plan.js): al principio, tu héroe por fases (con SU curva:
  «62% si acaba antes del 12, 56% si pasa del 20»), tu rival de línea y el
  cruce (p90/p10), con quién ir (vuestro más de early) y de quién cuidarse
  (el suyo); en las peleas, lo de 3.36.0; al final, su carta (el más de late
  que NO es tanque: «id a por él antes que a nadie» de un tanque contradecía
  el focus; la primera versión lo decía de Tigreal), la vuestra y el minuto
  en que cambia; problemas, tu peor cruce y la fase en contra (lo del equipo
  NO se repite: la primera versión decía tres cosas dos veces). «Cerrad
  pronto» / «aguantad» del chat de voz salen de la curva (con tres o más de
  cada lado); las etiquetas `hypercarry`/`assassin_late` solo sin curvas.
- **Las barras** salen de la línea del 50% (arriba verde, abajo rojo) con la
  MISMA escala en todos los drafts (±30 puntos llena la mitad): con una
  escala fija del 30 al 70% un draft al 74–78% pintaba seis bloques llenos
  iguales.
- **Sin órdenes contrarias (3.43.2)**, de una revisión a la contra sobre
  1.500 drafts completos: «no regales nada al principio» junto a «apriétale
  desde el principio» 30 veces, «juega agresivo» junto a «juega seguro» o
  «no forcéis peleas pronto» 54, «cuidado con X» del rival al que le ganas
  20, y «a partir del minuto 12 van por delante ellos» con las barras al
  57–69% desde el 16 (se cogía el PRIMER cruce del 50%; 76 de 1.347 cambios
  cruzan más de una vez). Hoy manda el cruce con tu rival, luego el plan del
  equipo, y la frase de tu héroe solo si no choca; el cambio de lado es el
  último cruce y en el sentido de la tendencia; las afirmaciones de fase
  (cambio, «vais por detrás») piden tres por bando y «el más … de los
  suyos», dos. El rival (`rivalDeLinea`) va en TU línea al leer las curvas:
  repartidos todos a la vez, el marcado caía en otra en el 4% de los drafts.
  Y `diagnostics.lineas.conservados`/`curvasConservadas` se escriben
  SIEMPRE (con la ruta cambiada de forma no se escribían y la app decía
  «37/37»), con aviso en el diagnóstico. Un consejo que se compone de
  frases independientes se prueba contra sí mismo: cada par de frases que
  pueden salir juntas.
- **La voz no contradice sus cifras (3.60.4)**: `guionEnDirecto` dice
  cada frase de fase solo si su cifra está del lado que dice, y solo con
  `plan.fasesConfiables` (tres por bando, la misma guarda del plan escrito).
  - «Vuestro momento» pide la corta ≥ 50%, «cada minuto en contra» la larga
    < 50%, «aguantad» la corta < 50% y «ahora vosotros» la larga ≥ 50%.
  - Antes salían al revés en 433 + 106 + 58 + 18 de 3.000 drafts.
  - Con el draft cerrado por la partida y un enemigo leído, la voz afirmaba
    fases que el plan escrito callaba.
  - Pruebas en `directo.test`; siete mutaciones.
- **Liquipedia** (preguntado por Javi): la ficha de un héroe trae
  estadísticas base, enfriamientos por nivel y el texto de las habilidades,
  lo mismo que la API, y nada de en qué fase es fuerte. De Liquipedia se
  siguen usando solo las partidas pro (que son las que miden esto).
- Pruebas: `motor/fases.test` (propiedades y datos reales), `plan.test`
  (etapas, con fixture), `scripts/ingesta.test` (`recogerCurva`),
  `ingesta-simulada` (servida y conservada), `comparar.test`,
  `diagnostico.test` (aviso sin curvas) y `interfaz/plan.e2e` (seis barras,
  frases traducidas, nada fuera a 320 px). 21 mutaciones, todas cazadas
  (una sobrevivía, «cambia de lado sin tendencia», y pidió su caso). Y la
  prueba de navegador del plan miraba el desborde con `.plan *`, una clase
  que desde 3.38.0 es la del plan A·B·C de los baneos: no miraba nada. Hoy
  `.plan-partida *`, y exige que haya algo que mirar.

## Las builds de objetos

Desde 1.11.0. `src/motor/builds.js`, y conviene tener clara la diferencia entre
sus dos mitades porque NO valen lo mismo:

- `buildsDe` es DATO: las tres builds más jugadas de ese héroe en esa línea, de
  la API, con su winrate y su cuota de uso.
- `ajusteDefensivo` es un CONSEJO. No sale de medir builds contra este draft
  —ese dato no existe en ninguna parte—, sale de dos hechos medidos (de qué pega
  cada enemigo, contado de sus habilidades; cuánta defensa da cada objeto, leído
  de `equiptips`) más una regla evidente del juego. La app lo enseña con su
  aviso. Si algún día se junta con lo otro sin decirlo, se está mintiendo.

Lo que hay medido y no conviene volver a suponer:

- **El winrate de una build no es causal.** Las builds del 3% de uso salen por
  encima de las del 13%, y el héroe entero por debajo de las tres. Quien se sale
  de la build por defecto suele ser quien más domina el héroe: ese porcentaje
  lleva dentro al jugador. Por eso se ordena **por uso**, nunca por winrate, y el
  aviso va escrito junto al dato, no en un tooltip.
- **57 de las 492 builds son indistinguibles en pantalla** (mismos objetos,
  mismo emblema, mismo hechizo): la API las separa por un talento de emblema que
  no descargamos. `fundirIguales` las junta, sumando el uso y **ponderando el
  winrate por uso** (el uso es proporcional a la muestra; promediar a pelo le
  daría a una del 0,4% el mismo peso que a una del 13%). No se juntan por
  objetos a secas: 115 pares comparten los tres objetos y cambian el hechizo, y
  ahí sí hay dos builds distintas.
- **La defensa de un objeto se lee del texto del juego, no de su categoría.**
  Tough Boots está catalogado como «Movement» y da 18 de defensa mágica. Mismo
  criterio que el tipo de daño de los héroes.
- `equipid` trae **tres objetos, el núcleo**, no los seis del inventario. No se
  completa lo que la API no da.
- **Lo que hace un objeto se lee de su texto**, igual que la defensa: la ingesta
  guarda `efectos` (`antiCuracion`, `cortaControl`) buscando lo que el juego
  escribe en el propio objeto. Nada de listas a mano: «Necklace of Durance» era
  EL objeto anti-curación y hoy ni existe en la API. NO se apunta «castiga los
  ataques básicos» aunque el texto lo diga, porque para usarlo haría falta saber
  quién pega con ataque básico y eso no lo sabemos: nuestro `damage` se cuenta
  de las habilidades, así que a un tirador le falta justo su ataque básico.
- **Solo se proponen objetos que ese jugador puede comprar.** El tipo lo trae la
  API (`equiptypename`): `Jungle` y `Roam` son de una línea, el resto valen para
  todos. Sin ese filtro, a un roamer con tres enemigos de control duro se le
  proponían las tres botas de JUNGLA. Salió probando el sitio PUBLICADO, no en
  las pruebas del motor. Y el objeto universal va delante del de línea aunque dé
  menos: dice lo mismo y no ata la build a una bendición.
- `ajustesDeBuild` da como mucho **dos** avisos, ordenados por peso, y solo si
  la build no lo cubre ya y hay algún objeto que proponer. Un enemigo suelto no
  cuenta como composición, y un enemigo con tags DEDUCIDOS cuenta 0,67: es el
  mismo descuento que el motor, y evita el sesgo que ya costó una versión con
  Marcel.
- Cuidado con los nombres, que se parecen a propósito: el DAÑO va en masculino
  (`fisico`/`magico`) y la DEFENSA de un objeto en femenino (`fisica`/`magica`).
  Leer un campo de defensa en un perfil de daño da `undefined` sin que falle nada.
- Se piden 164 builds, no 665: solo las líneas que cada héroe juega de verdad.
- El despliegue NO se para por quedarse sin builds -es un extra, y el botón
  simplemente no aparece-, pero `comparar-ingesta.mjs` sí rechaza una corrida que
  pierda builds u objetos respecto a la guardada.

**La build para ESTE draft y los avisos nuevos (3.57.0)**, pedido por Javi
(«mejorar el sistema que me dice qué equipamiento comprar»):

- **Talentos del emblema**: la API los traía en cada build
  (`new_rune_skill`, ids) y no se guardaban; los nombres salen de
  `/academy/emblems` (`giftid` → `skillname`, `gifttiers`, texto),
  `fetchTalentos` → `talentos` en roam-meta.json, conservados si la ruta
  cae. Entran en la firma de `fundirIguales` (las 57 de 492 builds que se
  juntaban por no tenerlos dejan de juntarse). `comparar-ingesta` cuenta
  `talentos` y `buildsConTalentos`.
- **Efectos nuevos leídos del texto** (`EFECTOS`, ahora también sobre
  `equiptips`): `antiEscudo` (Sea Halberd, Glowing Wand, Dominance Ice),
  `antiCritico` (Blade Armor) y `critico` (siete objetos de ataque).
  Comprobados contra los 152 objetos de la API el 13 de octubre de 2026.
  OJO (3.57.1, cazado con la ingesta real antes de que el bot la corriera):
  `equiptips` se lee SOLO para esos dos (`DE_ESTADISTICAS`); leído para
  todos, «+35% Slow Reduction +12 HP Regen» de Rapid Boots casaba con la
  antisanación y salían 13 objetos en vez de 3. Al ampliar el texto que
  lee una regla, mira qué más casa con las reglas que ya había.
- **Avisos nuevos**: `build.ajusteEscudo` (dos o más enemigos con `shield`)
  y `build.ajusteCritico`: quién va de crítico NO es una etiqueta, es su
  build más jugada en tu rango (`vaDeCritico`: algún objeto con `critico`).
  Mismo tope de dos avisos, por peso (defensa 3, curación 2, escudo y
  crítico 1,5, control 1).
- **`buildParaElDraft`**: de las builds que se juegan, la que deja menos
  avisos por cubrir (suma de pesos, sin tope); a igualdad, la más usada. La
  hoja la pone arriba con «te marco la N.ª más usada: ya lleva …» y la más
  usada queda debajo, marcada. Medido con los datos del 13 de octubre (sin
  los efectos nuevos todavía): cambia la build en 93 de 1.500 drafts al azar
  (6,2%), casi siempre por la antisanación (73). Sigue siendo CONSEJO sobre
  DATO: no hay winrate de builds contra drafts en ninguna parte.
- El motivo de maestría de la tarjeta dice números jugados de verdad
  (`motivoDeMaestria`: con la app, las de la app; sin ellas, lo de siempre
  ENTERO), no la mezcla acotada con la que puntúa el motor.
- Pruebas: `motor/builds.test` (talentos en la firma, la build elegida y sus
  empates, escudos, crítico por build), `ingesta-simulada` (talentos y
  efectos con la forma real) y `motor/maestria.test` (el motivo); la
  equivalencia del reconocimiento de caras cubre ya las opciones de criba de
  3.55.0 (sobrevive una mutación inofensiva: sin cribar a 1,2 los finalistas
  de tamaño 1 bastan en las capturas de prueba).
