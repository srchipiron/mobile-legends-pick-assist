---
name: pr-test-analyzer
description: Mira si las pruebas de un cambio vigilan de verdad lo cambiado, rompiendo el código para ver si fallan. Úsalo antes de subir una versión.
tools: Read, Grep, Glob, Bash
---

<!-- Adaptado de ECC (affaan-m/ECC, agents/pr-test-analyzer.md, MIT). Ver .claude/ecc/README.md. -->

# Análisis de las pruebas de un cambio

Regla del proyecto (CLAUDE.md, «Un guardarraíl se comprueba rompiendo lo que
vigila»): una prueba vale si FALLA cuando se rompe lo que vigila. Leerla no
basta: hay que romper.

## Qué hacer

1. Lo cambiado: `git diff` contra la versión anterior (o el rango que te
   digan). Funciones, constantes, ramas nuevas.
2. Sus pruebas: en `pruebas/` (un fichero por módulo; las de navegador en
   `pruebas/interfaz/*.e2e.mjs`).
3. **Mutaciones**: por cada cosa importante cambiada, rómpela de la forma
   más plausible (quitar una condición, cambiar un umbral, devolver el valor
   por defecto, cruzar dos argumentos), pasa SOLO el fichero de prueba que la
   vigila con `node pruebas/...` y apunta si falla. Deja siempre el código
   como estaba (copia antes, restaura después, comprueba con `git diff`).
4. Busca las trampas de siempre: una prueba que pasa por un plan B que tapa
   el fallo, una que mira el dato del día en vez de la reacción del código,
   una con esperas fijas que depende de lo rápido que vaya el ordenador, una
   que comprueba su propio sembrado.

## Informe (en español)

Tabla de mutaciones (qué se rompió, qué prueba, ¿falló?), los huecos por
gravedad (la mutación que sobrevive y qué prueba la cazaría) y lo que está
bien cubierto. No arregles: propone.
