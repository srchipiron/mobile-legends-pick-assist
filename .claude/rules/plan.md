---
paths:
  - "src/motor/plan.js"
  - "src/motor/fases.js"
  - "src/motor/builds.js"
  - "src/motor/registro.js"
  - "src/app/componentes/Builds.jsx"
  - "src/app/componentes/Plan*.jsx"
  - "scripts/medir-fases.mjs"
  - "pruebas/motor/plan.test.mjs"
  - "pruebas/motor/fases.test.mjs"
  - "pruebas/motor/builds.test.mjs"
---

# El plan de partida, las fases y las builds

La hoja «Plan y objetos» de cada tarjeta, por `planear` en `draft.js`. Es
CONSEJO, no nota: no cambia el ranking ni la probabilidad (hay prueba). La
crónica de 3.x, en `docs/archivo/reglas-3.102/plan.md`.

## El plan (`plan.js`, 3.36.0)

Pedido por Javi: instrucciones para él y para el chat de su equipo.

- **Lo medido son los NOMBRES**, no las frases:
  - «focus a X» es el enemigo blando (sin `tanky`) con más término de héroe
    más cruces contra los vuestros;
  - el peor y el mejor cruce usan el p05/p95 (`CRUCE_FUERTE`): una orden en
    voz alta es una afirmación;
  - las parejas usan `PAREJA_DESTACABLE`.
- **Las habilidades** llegan con la ingesta (`habilidades` en `roam-meta.json`):
  - salen de las etiquetas de Moonton (CC, AOE, Remove CC, CC Immune,
    Invincible, Death Immunity);
  - «quita controles» también se busca en el texto (la etiqueta marca 5 de 11);
  - la pasiva no cuenta, porque no se lanza;
  - `Death Immunity` no es `inmortal`: a Argus se le controla;
  - la ulti no se identifica: por enfriamiento fallaba en 11 de 111.
- **Quién es de apoyo** lo dice `esDeApoyo` (rol `support` o `tank`):
  - se le dice «rota pronto y lleva a tu equipo», no «juega agresivo»;
  - nunca es la carta del final;
  - el que se protege es el tirador inmóvil, nunca quien salta (`dive`).
- **Umbrales, decisiones de producto**:
  - «escaláis mejor» con `DIFERENCIA_DE_ESCALADO = 2` y solo con los dos
    equipos enteros;
  - «todo físico/mágico» con cuatro enemigos o más;
  - topes `MAX_EQUIPO = 5` frases para el equipo y `MAX_ETAPA = 3` por etapa.
- **Frecuencias** en 300 drafts de roam completos:
  - focus sale en el 100 %, «quédate con» en el 55 % y antisanación en el 31 %;
  - ningún plan sale vacío.
- **`crucesDelDraft`** (en `planear` como `cruces`) enseña tu cruce con CADA
  enemigo y tu pareja con CADA compañero, con los cortes de siempre.
- **Sin órdenes contrarias** (3.43.2, revisión de 1.500 drafts):
  - manda el cruce con tu rival, después el plan del equipo, y la frase de tu
    héroe solo si no choca;
  - las afirmaciones de fase piden tres por bando (`fasesConfiables`);
  - un consejo hecho de frases independientes se prueba frase contra frase.
- «Copiar para el chat» copia lo del equipo en una línea (` · `).

## Las fases (`fases.js`, 3.43.0)

La hoja enseña la probabilidad de ganar SEGÚN EL MINUTO EN QUE ACABE: seis
barras, 10–12 … 20+.

- **El dato** es `curvaLinea`: el winrate de cada héroe EN SU LÍNEA por tramo
  de dos minutos. Viene en la misma respuesta que `winrateLinea`.
  - `TRAMOS_CURVA` es `TRAMOS`, con prueba de que coinciden.
  - Se funde par a par y `comparar-ingesta` lo cuenta (`FIJAS`).
- **Es señal**:
  - la pendiente casa entre Gloria y Mítico a r = 0,88;
  - no se encoge por muestra (encoger sale dentro del ruido).
- **Predice** (2.268 partidas pro con duración):
  - la forma de las curvas en el tramo en que acabó mejora la validación
    +4,9 por 1.000;
  - con las curvas barajadas, +0,45;
  - `COEF_FASE = 0,71 ± 0,15`. `medir-fases.mjs` lo repite.
- **Cómo se calcula cada tramo**:
  - la probabilidad por tramo es la nota de siempre + `COEF_FASE` × (forma
    vuestra − forma suya);
  - cada forma se centra en lo que cabe esperar de lo que SALE
    (`centroDeFases`, con el «no sé» a 0);
  - NO entra en la nota: sin saber la duración no añade nada.
- **Umbrales** (300 drafts):
  - «sois de early/de late» con `DIFERENCIA_DE_FASE = 0,10` (sale en el 59 %);
  - un héroe es de early/de late con `PENDIENTE_DE_HEROE = 0,25` de logit
    (p20/p80);
  - «la partida cambia de lado en el minuto X» usa el ÚLTIMO cruce del 50 %
    y en el sentido de la tendencia.
- **Por etapas**:
  - al principio: tu héroe por su curva, tu rival y el cruce;
  - en las peleas: lo del plan;
  - al final: su carta (el más de late que NO es tanque), la vuestra y el
    minuto en que cambia;
  - problemas: lo del equipo no se repite.
- **Las barras** salen de la línea del 50 % con la MISMA escala en todos los
  drafts (±30 puntos llenan la mitad).
- `diagnostics.lineas.conservados` y `curvasConservadas` se escriben SIEMPRE.
- **Duración de tus partidas** (`registro.js`):
  - solo cuenta entre `DURACION_MINIMA` y `DURACION_MAXIMA` (3–90 min);
  - `tramoDeMinutos` la pone en su barra;
  - `medirFasesMias` compara lo previsto con lo que pasó.

## Las builds (`builds.js`)

Dos mitades que NO valen lo mismo, y la app lo dice:

- **`buildsDe` es DATO**: las más jugadas de ese héroe en esa línea, con
  winrate y cuota.
  - Se ordenan **por uso**, nunca por winrate. El winrate de una build no es
    causal: las del 3 % de uso salen por encima de las del 13 % porque lleva
    dentro al jugador.
  - `fundirIguales` junta las iguales en pantalla (mismos objetos, emblema,
    hechizo y talentos) con el winrate ponderado por uso.
  - `equipid` trae el núcleo (tres objetos); lo que la API no da no se
    completa.
- **`ajusteDefensivo`/`ajustesDeBuild` es CONSEJO**: de qué pega cada enemigo
  (contado de sus habilidades) y qué defiende cada objeto (leído de su texto,
  no de su categoría: Tough Boots es «Movement» y da defensa mágica).
  - Como mucho dos avisos, por peso (`AVISOS_POR_ETIQUETA`: defensa 3,
    curación 2, escudo y crítico 1,5, control 1).
  - Solo si la build no lo cubre y hay objeto que proponer.
  - Solo objetos que ese jugador puede comprar (`equiptypename`: `Jungle` y
    `Roam` son de línea). El universal va delante del de línea.
  - Un enemigo con etiquetas deducidas cuenta 0,67.
- **Efectos de un objeto, leídos del texto** (`EFECTOS`): `antiCuracion`,
  `cortaControl`, `antiEscudo`, `antiCritico`, `critico`.
  - `equiptips` se lee SOLO para los dos últimos (`DE_ESTADISTICAS`): leído
    para todos, las Rapid Boots casaban con la antisanación.
  - Al ampliar el texto que lee una regla, mira qué más casa.
- **El crítico de un enemigo** no es una etiqueta: es su build más jugada en tu
  rango (`vaDeCritico`).
- **`buildParaElDraft`**: de las que se juegan, la que deja menos avisos por
  cubrir; a igualdad, la más usada. Cambia la build en el 6,2 % de 1.500
  drafts.
- **Nombres que se parecen a propósito**: el daño va en masculino
  (`fisico`/`magico`) y la defensa en femenino (`fisica`/`magica`).
- **El despliegue no se para sin builds**, pero `comparar-ingesta` rechaza
  una corrida que pierda builds u objetos.

## Pruebas

- `plan.test` usa un fixture determinista y tiene mutaciones por frase.
- `fases.test` cubre las propiedades y los datos reales.
- `builds.test` cubre talentos, la build elegida, los empates, escudos y crítico.
- Fuera del motor: `ingesta-simulada` (habilidades, curvas y talentos con la
  forma real), `diagnostico.test` (aviso sin curvas) y la prueba de navegador
  del plan (seis barras, frases traducidas, nada fuera a 320 px; mira
  `.plan-partida *` y exige que haya algo que mirar).
