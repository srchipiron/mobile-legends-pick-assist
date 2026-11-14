# Mobile Legends Pick Assist

Qué héroe coger en tu línea según el draft que tienes delante. Eliges tu línea
(roam, jungla, mid, oro o exp), metes baneos y picks, y la app ordena tu pool por
la **probabilidad de ganar** el draft que sale con cada héroe: fuerza del héroe en
tu rango, cruces contra los enemigos, parejas con tus aliados, equilibrio de daño
y lo que falta por salir. En español e inglés.

**App:** <https://srchipiron.github.io/mobile-legends-pick-assist/>

Proyecto de aficionado, sin relación con Moonton. Mobile Legends: Bang Bang y sus
héroes son marcas de sus propietarios; datos © Moonton, a través de una API
comunitaria. Las partidas profesionales salen de
[Liquipedia](https://liquipedia.net/mobilelegends), bajo licencia
[CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

## Instalar

En el móvil, abre la app en Chrome y elige **Añadir a pantalla de inicio**. Se
instala como app, funciona sin conexión con los últimos datos descargados y se
actualiza sola al volver a abrirla. La versión sale en el pie; tocarla enseña
qué ha cambiado.

## Usar

1. **Línea y rango**: arriba. El rango por defecto es Gloria Mítica.
2. **Baneos**: la primera fase. Toca varios seguidos; los de tu línea salen primero.
3. **Picks**: una sola hoja para los dos equipos. Otro toque quita al héroe.
4. **Tarjetas**: tu pool ordenado, con la probabilidad, los motivos y por qué cada
   una no es la nº1. Toca el **nombre** para fijar tu pick.
5. **Plan y objetos**: a quién hacer focus, cómo jugar cada fase y las builds más
   usadas. «Copiar para el chat» lo deja listo para el equipo.
6. **Tus partidas**: apunta cada partida (la app te lo recuerda), mira tu racha,
   tus números por hora y héroe, el análisis y la revisión de tus drafts.
7. **Meta**: el orden de cada línea y quién sube o baja esta semana.
8. **Diagnóstico** → Copiar: un informe para cuando algo parezca raro.

Ninguna cifra se afirma si cabe en su margen de error: el draft inclina la
partida, no la gana.

## La tablet: Lector MLBB (opcional)

Si juegas en una **tablet o un móvil Android** y miras Pick Assist en **otro**
móvil, la app **Lector MLBB** lee el draft de la pantalla del juego. La tablet
lleva el draft entero: lo lee, lo cierra, vigila el final de la partida, te
pregunta cómo acabó y la apunta. Pick Assist copia ese draft cada dos segundos
mientras la miras, te deja corregirlo (lo que tocas vuelve a la tablet) y
contesta «Gané / Perdí» por ella. La burbuja de la tablet enseña tu nº1 encima
del juego.

1. En el aparato donde juegas, descarga e instala
   [lector-mlbb.apk](https://github.com/srchipiron/mobile-legends-pick-assist/releases/latest/download/lector-mlbb.apk)
   (Android pedirá permiso para instalar apps de fuera de Play Store).
2. Ábrela y sigue su **paso a paso**: cada paso se marca solo cuando está
   hecho (avisos, ahorro de batería, burbuja, empezar a leer).
3. En el móvil donde usas Pick Assist, escanea con la cámara el QR que enseña
   Lector MLBB y toca **Vincular**. Los dos, en la misma wifi. Si la tablet
   cambia de IP, Pick Assist la vuelve a encontrar sola.

Después se actualiza sola; si la tablet lleva una versión vieja, Pick Assist
lo dice y enlaza la nueva.

**Qué hace y qué no.** Solo MIRA la pantalla, con el permiso normal de grabar
pantalla de Android. No toca el juego, no usa accesibilidad ni gestos, no
instala nada y no se conecta a tu cuenta; lo único que abre es Mobile Legends
al empezar a grabar, como su icono. La imagen no sale de la tablet: al móvil
solo van nombres de héroes, y solo al móvil vinculado con su código. Los
nombres de los otros jugadores nunca salen de la tablet. Aun así es una
herramienta de terceros: **úsala bajo tu responsabilidad**.

## Privacidad

No hay cuentas ni seguimiento. Lo tuyo (maestría, partidas, ajustes) vive en el
navegador del móvil y solo sale si tú lo sacas:

- **Tu perfil**: un código que copias tú para llevarte la maestría y las
  partidas a otro aparato.
- **Guardar mis partidas** (si lo activas): tus partidas, sin nombres de
  jugadores, van a una base de datos con una clave de jugador que genera la app.
  Con esa clave las recuperas en otro móvil; el servidor guarda su huella, no
  la clave. «Dejar de guardar» y «Borrar» hacen lo que dicen.
- Sin tablet vinculada, la app no habla con ninguna tablet.

## Acceso por invitación

La app puede pedir una clave para entrar. Quien la administra da a cada
persona un enlace con su clave (con nombre y, si quiere, caducidad) y puede
retirarla cuando quiera. Las claves van firmadas (ECDSA P-256) y la app las
comprueba con la clave pública de `public/licencias.json`, sin servidor. Es
una puerta, no una caja fuerte: la app es estática y su código está a la
vista.

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE.md): puedes usarla, copiarla y
modificarla para cualquier fin no comercial. Para un uso comercial, pregunta.

## Contribuir

```bash
npm install
npm run ingest      # descarga los datos a public/data (opcional: ya vienen)
npm run dev         # la app en local
npm test            # obligatorio antes de subir nada
npm run build && npm run test:ui   # pruebas de navegador (PLAYWRIGHT_CHROME=ruta)
```

- `src/motor/` es el motor, puro (sin React, red ni almacenamiento);
  `src/motor/draft.js` es el único punto de entrada. `src/comun/` es lo que
  comparten móvil y tablet (el contrato del protocolo). `src/app/` es la app
  del móvil. `scripts/` tiene la ingesta, las mediciones y el lector;
  `android/` la APK; `pruebas/` las pruebas.
- **Mide antes de tocar el modelo**: `scripts/ajustar-modelo.mjs` sobre
  partidas con resultado. Un término entra solo si mejora la validación cruzada.
- **Cada prueba nueva se verifica rompiendo lo que vigila.**
- Todo texto visible pasa por `t()`, en `src/app/i18n/es.js` y `en.js`.
- Sube la versión en `package.json` y escribe la entrada en `CHANGELOG.md`
  pensando en quien usa la app.
- [`CLAUDE.md`](CLAUDE.md) y `.claude/rules/` son la memoria del proyecto;
  `docs/` guarda lo que salió mal, lo descartado y lo que se decidió.

Al subir a `main`, GitHub Actions pasa las pruebas y publica en GitHub Pages; un
bot trae datos nuevos dos veces al día y otro vigila lo publicado.
