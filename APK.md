# La app Android: Lector MLBB

La app Android del proyecto es **Lector MLBB** (`android/`), que lee el draft
de la pantalla del juego y se lo pasa a Pick Assist. Cómo instalarla y usarla:
el apartado «Que lea el draft solo» del [README](README.md). Cómo está hecha y
por qué: `.claude/rules/lector.md` («El lector EN LA TABLET»).

Lo que había antes en este fichero (empaquetar la web como TWA con
pwabuilder) se quedó atrás: Pick Assist se instala desde Chrome con «Añadir a
pantalla de inicio», y no necesita APK.
