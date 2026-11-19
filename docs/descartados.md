# Descartados

Lo examinado y dejado como está, con su medida. No se reabre sin evidencia
nueva. La crónica completa, en `docs/archivo/descartados-3.102.md`.

## Modelo

- Diez términos más (peor y mejor cruce, top-5, héroe más flojo/fuerte, pick y ban totales, peor pareja, tier de mlbb.gg…): ninguno mejora la verosimilitud fuera de muestra (3.4.0).
- Un coeficiente por término, el lado azul, los huecos por etiqueta, el hueco de daño, el contrapick por orden: no mejoran la validación cruzada (2.0).
- El equilibrio de daño a vigilar (19-11-2026): su coeficiente libre baja a 0,06 ± 0,06 (120 d) y 0,09 ± 0,05 (400 d) frente al 0,22 que supone el motor; quitarlo gana +3,3 por 1.000 a 120 d pero +0,8 a 400 d. No concluye: se sigue midiendo, no se toca.
- Otras formas del equilibrio de daño (−|f−m|, «hay de los dos», mixtos a medias, nº de magos): ninguna gana a min(f, m).
- Qué falta por salir: condicionar por sinergia o cruce no añade; la frecuencia pro es otra población (14.640 situaciones).
- El winrate por LÍNEA en la nota: +0,0 a +1,5 de logL por 1.000, dentro del ruido (se enseña).
- La curva por duración como término: −0,56 ± 0,29 (se enseña como fases).
- La tier list en la nota: −0,045 pp por escalón ± 0,015 sabiendo el winrate (se enseña).
- La serie diaria `/trends`: no reconcilia (±10 pp por día).
- Otros rangos o ventanas como término: la ganancia es la época, no el rango.
- Peso doble del rival de línea: no apoyado (R −0,56 ± 0,62 frente a O 0,78 ± 0,32).
- Más peso a las parejas: ×2 da −1,0 de logL por 1.000 en 2.770 partidas pro (se enseña `mejorPareja`).
- Ordenar por la simulación: solo mejora con un enemigo visto.
- Ajustar la escala por las partidas de Javi: AUC ± 0,12, no concluye.
- Ponderar por recencia al ajustar la escala (19-11-2026, validación hacia delante en 4 bloques del pro de 400 días): τ = 180/90/45 días empeora −0,40 ± 0,28 / −0,77 ± 0,42 / −1,31 ± 0,57 de logL por 1.000; la pendiente es estable por época (0,39/0,44/0,40).
- Seguir al nº1 en las partidas de Javi (19-11-2026, 180 drafts completos): con el nº1 gana el 57,4 % (n 54) y con otro el 60,0 % (n 125), −2,6 ± 15,7 puntos; AUC en sus drafts 0,50 ± 0,09. No concluye: no está aleatorizado y Estes/Rafaela (63 %/71 %) suelen ir a mitad del ranking.
- Tus resultados o tus héroes en la nota: fuera por decisión de Javi (3.93.0, 3.94.0).
- Traducir nombres de héroe: son la clave de los datos (la búsqueda sí acepta los dos idiomas).

## Interfaz

- Modo claro: el amarillo no llega a 2:1 sobre blanco; pide una segunda paleta.
- Content-Security-Policy: `connect-src` tendría que seguir la IP cambiante de la tablet.
- Botones fijos de compañeros: el que falta está entre los 6 habituales solo el 23 % → rejilla de 24 caras.
- Compartir draft por enlace o modo dúo: la app es de una persona.
- View Transitions, números que cuentan al cambiar, esqueletos de carga: peor con prisa o sin espera que tapar.

## Datos y bots

- Recortar `roam-meta.json` (quitar la mitad antisimétrica ahorra ~15 %): no compensa.
- `stats.matches` es null en la API: no hay encogimiento por muestra posible.
- `update-data` en rojo con la API caída: es la señal correcta.
- Aflojar el comparador o devolver a mano una matriz: no.
- Histéresis en el pool de una línea: el pool es el dato.
- Dependabot: PRs que Javi tendría que fusionar desde el móvil.

## Lector

- Bajar `PARECIDO_MINIMO` de 0,80: mete más falsos de los que gana.
- Aprender rivales por eliminación (4 de 15 eran el hueco vacío) o repetir el aprendizaje (57,5 % → 57,5 %).
- Leer las skins de los rivales: el mejor candidato acierta 8 de 153.
- Que aprenda de lo que él mismo leyó o de las tablas en marcha: no (3.30.1, 3.99.0).
- Pausar la grabación entre capturas: solo tras medir los FPS en su tablet.

## Partidas y base de datos

- Usuario y contraseña: no, una clave por jugador.
- Fundir por campo con el reloj de la tablet: gana la copia arreglada más tarde.
- Borrar o marcar a mano las victorias dudosas del 26-10 al 10-11: no sin Javi.

## Herramientas de Claude

- El plugin ECC: no carga en la nube y sus hooks reescriben mandatos; sus agentes útiles van copiados en `.claude/agents/` (licencia en `.claude/ecc/`).
