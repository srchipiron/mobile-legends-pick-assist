---
paths:
  - "src/motor/**"
  - "scripts/ajustar-modelo.mjs"
  - "scripts/proponer-modelo.mjs"
  - "scripts/medir-*.mjs"
  - "scripts/derivar-tags.mjs"
  - "public/data/heroes.json"
  - "pruebas/motor/**"
  - "pruebas/paridad/**"
---

# El motor y el modelo

Antes de cambiar una constante, mídela (agente `medidor-motor`). Lo medido y
dejado está en `docs/descartados.md`; la crónica de 3.x, en
`docs/archivo/reglas-3.102/motor.md`.

## La forma (4.0)

- `draft.js` es el único cerebro: `prepararDatos` indexa el meta y arma los
  pools una vez; `contextoDe` monta el contexto; `ordenar`, `recomendar`,
  `estimarCon`, `simular`, `planear`, `siguientesBaneos`… son lo que consumen
  app, tablet, diagnóstico y scripts. Nada monta el contexto por su cuenta (el
  diagnóstico lo hacía y midió otro modelo de 3.93 a 3.102).
- `estadistica.js`: `logit`, `sigmoide`, `clamp01`, `correlacion`, `fnv1a`,
  `DIA_MS`, `SEMANA_MS`. Una sola copia de cada cosa.
- `lineas.js`: UN reparto (`repartos`: combinaciones × permutaciones en orden
  fijo, primer máximo estricto, caché por `info` y `frecuencias`). Sobre él,
  `lineasOcupadas`, `asignarLineas` y `detectarRivalDeLinea`.
- Ninguna función recibe `maestria` y `recomendar` no devuelve `deLosTuyos`
  (decisiones de Javi en 3.93.0 y 3.94.0, `docs/decisiones.md`).
- Puro: sin React, sin red, sin almacenamiento, sin Node (ESLint).
- Paridad 4.0 contra 3.102.0: 0 diferencias en 26.186 comparaciones
  (`docs/paridad.md`).

## El modelo (`modelo.js`, `VERSION_MODELO` 5)

La nota de un pick ES la probabilidad de ganar el draft que resulta con él:
log-odds aditivos de cinco términos centrados, sumados con coeficiente 1 y
multiplicados por UNA escala medida:

`logOdds = ESCALA · (heroes + cruces + parejas + equilibrio + porVer)`

- `ESCALA = 0,44 ± 0,12`: regresión logística sobre partidas pro con
  resultado (`scripts/ajustar-modelo.mjs`, 10 pliegues; 120 y 400 días dan lo
  mismo). Con 1 el Brier fuera de muestra era 0,2510, peor que una moneda;
  con 0,44, 0,2435. La prueba falla si la escala de hoy se aleja más de 2,5 SE.
- **Los tres de datos pesan igual**: coeficientes libres H 0,50 ± 0,16,
  C 0,49 ± 0,29, S 0,11 ± 0,36; libres no mejoran la validación cruzada.
- **El rival de línea no pesa doble** (R −0,56 ± 0,62 frente a O 0,78 ± 0,32).
  Se deduce para enseñarlo.
- **El equilibrio de daño** (`PESO_EQUILIBRIO_DANO = 0,5`): min(físicos,
  mágicos) tuyo menos el suyo; el mixto no cuenta. Único de doce candidatos
  que mejoró la validación (+2,5 a +3,9 de logL por 1.000; AUC 0,574 → 0,591).
  Con el draft a medias cada equipo se centra en lo que cabe esperar de su
  tamaño (`equilibrioEsperado`). Vigilar: el 3-10-2026 su coeficiente libre
  bajó a 0,13 ± 0,056 (el motor supone 0,22, a 1,6 SE). La prueba exige que
  siga > −3 por 1.000 fuera de muestra.
- **«Por ver»**: lo que falta por salir entra como ESPERANZA del cruce contra
  lo que se juega en cada línea abierta, ponderado por
  `disponibilidad = pickRate/(1−banRate)` (MRR 0,081 frente a 0,054 por
  pickrate a secas, 14.640 situaciones pro). El contrapick por orden mide
  0,000 (19.072 pares): no hay castigo adversarial.
- **Centros**: héroes en la media PONDERADA por cuota de pick (≈0,50); cruces
  en 0,5 (son antisimétricos: c[a][b]+c[b][a] = 1 en los 8.778 pares; centrar
  en la media de fila daba +0,6 log-odds al primer equipo); parejas en su
  propia media calculada (0,4954). Mediana de 200 drafts al azar: 50 ± 6.
- **AUC 0,56–0,59**: el draft inclina, no gana. Lo que prometa más está mal.
- Las reglas por etiqueta entran SOLO sin dato (cruce o pareja nula), con la
  más fuerte valiendo un cruce del 56 % (`CRUCE_POR_REGLA_MAXIMA = 0,06`).
- **Las parejas se ENSEÑAN, no pesan más** (×2: −1,0 de logL por 1.000 en
  2.770 pro). `evaluarDraft` devuelve `mejorPareja` y el botón «Sinergia»
  reordena por `terminos.parejas` sin tocar la nota.
- El ranking ordena por `logOdds`, luego por `heroes`, luego por nombre.

**La huella** (`modelo.test`): un draft fijo sobre datos INVENTADOS. Si
cambia lo que da `evaluarDraft`, falla hasta subir `VERSION_MODELO` y apuntar
la huella nueva en `HUELLAS`. La versión va con cada partida apuntada para no
mezclar modelos al calibrar. Las pruebas usan `VERSION_MODELO`, nunca un
número.

**El bot del modelo** (`modelo.yml` → `scripts/proponer-modelo.mjs`): mide la
escala con las pro de 120 días y las de Gloria con draft completo. PROPONE
(incidencia `modelo`) solo con ≥ 300 partidas, ganancia ≥ 2 por 1.000 y la
escala nueva a más de 2 SE. Nunca commitea. OJO: los términos salen de las
matrices de HOY, no de las del día de cada partida.

**Lo que NO decide**: tus resultados (3.93.0), qué héroes juegas (3.94.0),
la tier list, el winrate por línea, la curva por duración, «parche: hace N d».
Se enseñan. `maestria.js` sigue para enseñar tus números, no para puntuar.

## Márgenes y motivos

- `MARGEN_EMPATE = 0,004` (p25 de la distancia nº1–nº2: empate en uno de cada
  cuatro) y `BRECHA_CLARA = 2` puntos (p85). La distancia mediana nº1–nº2 es
  0,9 puntos: en la mitad de los drafts el modelo NO distingue al nº1 del nº2.
- Cortes de cruce medidos, nunca a mano (ESLint lo prohíbe):
  `CRUCE_DESTACABLE`/`CRUCE_MALO` p90/p10 (0,5154/0,4846), `CRUCE_FUERTE`
  p95 (0,5208: entre p90 y p95 se dice «por poco»), `PAREJA_DESTACABLE` 0,51.
- Un motivo por etiqueta solo se enseña si el cruce real va en su sentido; sin
  dato, se enseña. Los comunes (>60 % del pool) se quitan ANTES de cortar a tres.
- Las once reglas medibles miden UN SOLO eje (dash/dive r = 0,93;
  mobile/immobile −0,87): «a quién te comes y quién te come». Una regla nueva
  repite esa. Cada regla nueva es deuda.

## Las líneas y el rival (`lineas.js`)

El reparto conjunto de un equipo por las frecuencias de línea de la API. El
rival de tu línea es el enemigo que el reparto pone en ella, si su encaje
pasa de `ENCAJE_MINIMO = 0,3` y gana al segundo por `MARGEN_PARA_HABLAR = 0,20`;
si no, no se dice (el enemigo a enemigo se equivocaba en el 10–21 %). Los
aliados se reparten sin tu línea (`equipo.test`).

## Baneos (`baneos.js`)

- **Sugeridos** = pérdida esperada: `disponibilidad` × (término de héroe +
  cruces contra tus aliados). Sin pesos. Tu pick fijado cuenta como aliado
  (`conTuPick`): antes se proponía banearlo en 34 de 1.500 drafts.
- **El siguiente probable** es la `banRate` (por partida: los 133 suman 8,85)
  por la co-ocurrencia de TU historial: media geométrica de P(x|g)/P(x) con
  `K_COOCURRENCIA = 2` (en pro, top-10 56,8 → 62,2 % con 100 partidas). Sin
  historial el factor es 1. La co-ocurrencia pro no se usa: banean otra cosa
  (su top-10 cubre el 26,5 % de los de Gloria).

## Simulación (`robustez.js`)

Finales plausibles por las líneas enemigas abiertas, muestreando por
`disponibilidad`, sin baneados, cada final puntuado COMPLETO (`lineasAbiertas:
[]`, o «por ver» contaría dos veces). Se cuentan VOTOS de nº1. Determinista
(mulberry32, semilla fija; ruido ±6 puntos con 60 finales: si hace falta más
fino, sube `FINALES_POR_DEFECTO`). `CUOTA_ROBUSTA = 0,5` separa (con 2
enemigos, ≥0,5 aguanta el 71 % y <0,5 el 28 %). NO ordena (solo mejora con un
enemigo visto). Si el ranking gana una entrada de contexto, pásala también a
la simulación.

## El consejo y tu pick

- **Compañeros** (`equipo.js`): para cada línea que tu equipo no cubre, el
  mismo ranking sobre su pool con tu elección como aliado. Nunca tu línea ni
  alguien cogido o baneado. Va diferido en la app, con su `yo`.
- **Tu pick fijado**: `eleccionDe(ranking, miPick)` es el ÚNICO sitio que
  decide de quién se habla (el fijado si está, si no el nº1). El ranking y la
  simulación no cambian; con un fijado que no es el nº1 se dice cuánto le
  falta (`tuPickPorDebajo`).
- **Composición** (`composicion.js`): lo medido en parejas (`ROL_DOBLE_PP`:
  dos magos −4,0 pp, dos asesinos −2,6, dos tanques −1,95, dos tiradores
  −1,26) y los huecos por etiqueta (`TEAM_NEEDS`, regla escrita, se dice con
  tres aliados). Los huecos no predicen (0,00 ± 0,07).

## Las etiquetas (`heroes.json`, `catalogo.js`)

- Revisadas leyendo el kit entero (27-9-2026, 102 héroes; 7-11-2026, 16
  cambios) con los criterios de `tagLegend` y una cita literal por cambio. El
  kit NO predice quién gana en pro; las etiquetas solo deciden sin dato, así
  que el ranking fue idéntico en 300 drafts las dos veces.
- **`dash` es «depende de desplazamientos para entrar y salir»**, no «tiene
  uno»: en el sentido amplio lo tenían 94 y Chou salía nº1 en el 71 %. Antes
  de cambiar lo que significa una etiqueta, mira qué regla la lee.
- Una etiqueta que casi todos cumplen no sirve de aviso: botas anticontrol
  mira `cc_chain` (33 % de los equipos), no `cc_hard` (99,6 %).
- Coherencia en `catalogo.test`: `immobile` excluye `dash` y `mobile`;
  `cc_chain` y `engage` implican `cc_hard`; todo tag está en la leyenda.
- Un héroe nuevo sin etiquetas: la deducción lo cubre con descuento 0,67;
  `derivar-tags.mjs` regenera las tablas. `fiabilidad` (catalogo.js) lo dice.
- **El parche**: `huellaDeKit` quita las cifras (un cambio solo de números no
  sale en `heroesCambiados`). `tocadoPorElParche` marca 7 días a los tocados
  (3.102.0): su porcentaje aún mezcla días de antes. Se enseña, no puntúa.

## Lo que cuesta un toque (medido en 3.0)

Portátil del contenedor con datos reales; un móvil de gama media va 4–6×
más lento.

| | 1 enemigo | 3 | completo | móvil |
|---|---|---|---|---|
| `prepararDatos` (una vez) | 44 ms | — | — | ~0,2 s |
| ranking (CADA toque) | 11,4 ms | 6,0 | 3,6 | 20–60 ms |
| consejo a compañeros (diferido) | 21,9 ms | 12,5 | 8,0 | 40–110 ms |
| baneos | 0,9 ms | 0,5 | 0,5 | ~4 ms |
| simulación, 60 finales (diferida) | 78 ms | 62 | — | 0,3–0,5 s |

Cuanto más vacío el draft, más caro (más líneas abiertas para «por ver»). Lo
diferido lleva la marca del draft para el que se calculó. Si añades algo al
toque, mídelo aquí.
