---
name: click-path-audit
description: Sigue cada botón de la app hasta el estado final para encontrar los que «no hacen nada» o hacen otra cosa porque una función deshace lo que hizo la anterior, un efecto lo pisa o una carrera lo cambia. Úsalo tras tocar useDraft, usePersonal, App.jsx o un botón que Javi diga que falla.
---

<!-- Adaptado de ECC (affaan-m/ECC, skills/click-path-audit/SKILL.md, MIT). Ver .claude/ecc/README.md. -->

# Auditoría de caminos de toque

Las pruebas comprueban que cada función funciona; esta auditoría comprueba
que lo que pasa al TOCAR es lo que dice el botón. El fallo típico: dos
llamadas que funcionan solas y juntas se anulan. Aquí ya pasó: el «Deshacer»
que se iba de debajo del dedo porque el aviso se volvía a montar al cambiar
de fase (3.38.0), o el `tic` que llamaba a la `apuntarSola` de un render
viejo y marcaba el draft como apuntado sin apuntar nada (3.33.0).

## Paso 1: el mapa de estado

Antes de mirar un solo botón, apunta qué escribe y qué BORRA cada acción de
los hooks de `src/app/estado/` (sobre todo `useDraft.js`: `anadir`,
`quitar`, `aplicarLectura`, `vaciarConDeshacer`, `reiniciar`, `restaurar`,
`setFase`…; y `usePersonal`, `useAjustes`, `useEnvio`) y qué efectos de
`App.jsx` reaccionan a cada campo:

```
useDraft.aplicarLectura → escribe {baneos, enemigos, aliados, lectura, fase, miPick?}
                          BORRA/ANULA {paraDeshacer si el draft cambió por otra vía}
efecto X en App.jsx      → mira {draft.completoDesde} y llama a …
```

Lo peligroso son las acciones que tocan campos de otra: `completoDesde`,
`apuntadaSola`, `miPick`/`miPickLeido`, `paraDeshacer`, `fase`.

## Paso 2: cada punto de toque

Para cada botón, chip, hueco, × o interruptor de `src/app/pantallas/` y
`src/app/componentes/`:

1. el manejador y cada llamada EN ORDEN;
2. qué lee y qué escribe cada una, y qué efectos dispara después;
3. ¿alguna llamada posterior, o un efecto, deshace lo de una anterior?
4. ¿el estado final (y lo guardado en `roam-picker:*`) es lo que dice la
   etiqueta del botón?
5. ¿hay algo asíncrono (lector, GitHub, `useDeferredValue`) que pueda
   resolverse tarde y pisar un estado más nuevo? ¿Se comprueba después de
   cada `await` que el draft sigue siendo el suyo?

Patrones que buscar: deshacer en cadena, carrera asíncrona, cierre viejo
(una función del render de antes llamada desde un efecto o un temporizador),
transición que falta (el botón dice «Apuntar» y no apunta en algún caso),
camino muerto (una condición que nunca se cumple ahí) y efecto que pisa.

## Paso 3: informe

Por hallazgo: el botón y `fichero:línea`, el patrón, la traza (qué escribe
cada paso y dónde se pisa), qué espera Javi y qué pasa. **Antes de darlo por
bueno, reprodúcelo**: una prueba de navegador en `pruebas/interfaz/` con
`paginaCon` (ver `navegador.mjs`) o una prueba pura si la lógica vive en
`src/app/*.js`. Lo que no se reproduce va como sospecha. Cada fallo
confirmado se queda con su prueba, comprobada rompiendo el arreglo.

Es caro: limita el alcance a la pantalla o al hook que se ha tocado, salvo
que se pida la app entera.
