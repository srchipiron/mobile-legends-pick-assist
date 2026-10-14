# La paridad de la reescritura 3.0

El programa se rehízo entero en 3.0.0 SIN cambiar ninguna decisión medida: el
mismo modelo, los mismos datos, las mismas claves guardadas y las mismas
pantallas. La paridad se verificó con un arnés que compara 2.0.2 con 3.0 sobre
2.000 drafts de las cinco líneas —ranking entero, probabilidad, términos,
motivos, empate, rival, simulación, composición, consejo a los compañeros,
análisis, baneos sugeridos, siguiente baneo y estimación— con CERO diferencias,
y el informe del diagnóstico sale letra por letra igual. El arnés se queda en
`pruebas/paridad/viejo-vs-nuevo.mjs`: si algún día hay que rehacer otra cosa,
esa es la forma de hacerlo sin fiarse. NO corre en `npm test` (necesita los
dos árboles); para volver a pasarlo:

```bash
git worktree add /tmp/viejo becb6a5     # el último commit con src/engine (2.0.2)
ln -s "$PWD/node_modules" /tmp/viejo/node_modules
PARIDAD_VIEJO=/tmp/viejo node pruebas/paridad/viejo-vs-nuevo.mjs 2000
```

Tarda unos 3,5 minutos y tiene que decir «0 diferencias».

OJO: desde 3.4.0 la paridad con 2.0.2 se rompe A PROPÓSITO (el término de
equilibrio de daño y la disponibilidad con baneos cambian la nota), así que
contra `becb6a5` ya no da cero. El arnés sigue valiendo para lo que nació:
comparar dos versiones que DEBAN dar lo mismo (una reescritura), no dos
modelos distintos. Si se rehace otra cosa, la referencia es el commit
anterior a la reescritura, no 2.0.2.
