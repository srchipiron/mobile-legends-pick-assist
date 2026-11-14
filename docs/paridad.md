# La paridad de una reescritura

Una reescritura no cambia ninguna decisión medida, y eso se comprueba, no se
supone: un arnés compara el motor viejo con el nuevo con los MISMOS datos sobre
miles de drafts deterministas de las cinco líneas y lista cualquier diferencia.
Está en `pruebas/paridad/viejo-vs-nuevo.mjs`. NO corre en `npm test` (necesita
los dos árboles):

```bash
git worktree add /tmp/viejo <commit anterior a la reescritura>
ln -s "$PWD/node_modules" /tmp/viejo/node_modules
PARIDAD_VIEJO=/tmp/viejo node pruebas/paridad/viejo-vs-nuevo.mjs 2000
```

Compara `prepararDatos` (y otros rangos), `recomendar` con y sin simulación,
`estimarCon`, `planear`, `probablesDelBando`, `siguientesBaneos`,
`crucesDelDraft`, `porQueDetras`, `fichaDeHeroe`, `tocadoPorElParche`,
`winrateEnLinea`, las builds, `planDePicks`, `movimientosDelMeta`,
`revisarPartida`/`revisarDrafts`, el buscador, lo de tus partidas (números,
semana, resumen, calibración, analítica, maestría, comprobaciones, comunidad,
perfil y su código) y el diagnóstico letra a letra. Si los dos lados lanzan lo
mismo, lo dice: esa comparación no mide nada.

- **3.0.0** (contra 2.0.2): 2.000 drafts, 0 diferencias.
- **4.0.0** (contra 3.102.0, `0c6d784`): 26.186 comparaciones sobre 2.000 drafts,
  0 diferencias. Quitado a propósito y normalizado en el arnés: el término `tu`
  (siempre 0) y `deLosTuyos` (siempre null). Del diagnóstico cambian a propósito
  las secciones MOTOR, MAESTRÍA y MODELO: ahora miden por el camino de la app.

Para una reescritura nueva, la referencia es el commit anterior a ella; para dos
modelos distintos este arnés no sirve (dará diferencias, que es lo esperado).
