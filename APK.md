# La app Android: Lector MLBB

La app Android del proyecto es **Lector MLBB** (`android/`): graba la pantalla
de la tablet, lee el draft, lo lleva, pone el consejo en una burbuja encima
del juego y apunta la partida. Pick Assist en el móvil copia ese draft y deja
corregirlo. Cómo instalarla y usarla: el apartado «Que lea el draft solo» del
[README](README.md). Cómo está hecha y por qué: `.claude/rules/lector.md`
(seguridad, protocolo 2, la APK).

Se compila y se publica sola con `.github/workflows/apk.yml` (release
`lector-vX.Y.Z`, siempre con la misma firma); la tablet se actualiza sola.

Pick Assist no necesita APK: se instala desde Chrome con «Añadir a pantalla de
inicio».
