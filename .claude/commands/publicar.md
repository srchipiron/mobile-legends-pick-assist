---
description: Publicar una versión de principio a fin, sin saltarse un paso: pruebas, compilación, navegador, push y comprobar que Pages sirve lo subido.
---

# Publicar una versión

Argumentos recibidos: `$ARGUMENTS` (vacío = publicar lo que hay en el árbol).

Cada despliegue le cuesta minutos a Javi desde el móvil: no se sube a
medias, y un paso que falla PARA la lista (se arregla y se vuelve a empezar
por el paso 1). Lleva la cuenta con una casilla por paso.

## Antes de subir

1. **Versión y novedades.** `package.json` sube (`0.X.0` si cambia cómo
   decide la app o qué hace, `0.0.X` si es una corrección) y `CHANGELOG.md`
   tiene su entrada, escrita para quien USA la app: la primera frase de
   cada viñeta dice QUÉ cambia. Un cambio que no toca la app (solo
   `.claude/`, `docs/`, pruebas) no sube versión.
2. **Lo aprendido, en su sitio.** Lo de una zona en su regla de
   `.claude/rules/`; un error que llegó a producción en
   `docs/historia/errores.md`; lo descartado en
   `docs/historia/descartados.md`. `CLAUDE.md` no crece (tiene tope).
3. **`npm test`**, mirando el CÓDIGO DE SALIDA, no la última línea
   (`npm test > /tmp/t.txt 2>&1; echo $?`): `npm test | tail` devuelve el
   código de `tail`.
4. **`npm run build`** con código 0.
5. **Pruebas de navegador** sobre `dist/`, si se tocó `src/`, `vite.config.js`
   o `pruebas/interfaz/`:
   `PLAYWRIGHT_CHROME=$(ls -d /opt/pw-browsers/chromium*/chrome-linux/chrome | head -1) npm run test:ui`
   (o `node pruebas/correr.mjs --e2e <ficheros>` para las de lo tocado).
   No bloquean el despliegue, pero su rojo después del push nadie lo para.
6. **Releer el diff** (`git diff --stat` y `git diff`) a la contra: nada
   accidental, ningún `.bak` de una mutación, ningún identificador de modelo
   en el código ni en el CHANGELOG, ningún secreto.

## Subir

7. Un commit (asunto `X.Y.Z: qué cambia para quien usa la app`, cuerpo con
   el porqué y lo que cazó la prueba; las líneas de atribución que pida la
   sesión).
8. A `main`, con rebase por si los bots han commiteado mientras tanto:
   `git fetch -q origin main && git rebase -q origin/main && git push -q origin HEAD:main`.
   Si la sesión tiene rama de trabajo, súbela también. Si hay un pull
   request abierto para el cambio, NO se empuja a `main`: se sube a su rama.

## Después de subir

9. **El despliegue**: la corrida de `deploy.yml` del commit subido en verde
   (`gh api "repos/srchipiron/mobile-legends-pick-assist/actions/runs?head_sha=<sha>"`).
   Si tarda doce minutos, es que el bot lleva medio día sin traer datos:
   mira `update-data.yml`, no el despliegue.
10. **Pages sirve la versión**:
    `curl -s -H 'Cache-Control: no-cache' https://srchipiron.github.io/mobile-legends-pick-assist/version.json`
    dice la de `package.json`. Espera con un bucle en segundo plano, nunca
    con `sleep` en primer plano.
11. **La vigilancia contra lo publicado**: `node scripts/diagnostico.mjs`
    con código de salida 0 (los avisos se leen; los fallos paran).
12. **Las otras corridas del commit**: `pruebas-ui.yml` y la vigilancia
    en verde. Un rojo ahí es trabajo ahora, no «luego».

## Informe

Corto, en español, legible en el móvil: versión publicada, qué cambia para
Javi, pruebas (cuántas, y las de navegador si se pasaron) y el estado de
cada corrida. Si algo quedó en rojo, qué y por qué.
