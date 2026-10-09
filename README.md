# Mobile Legends Pick Assist

Qué héroe coger en tu línea según el draft que tienes delante. Eliges tu línea
(roam, jungla, mid, oro o exp), metes baneos y picks, y la app ordena tu pool por
la **probabilidad de ganar** el draft que sale con cada héroe: fuerza del héroe en
tu rango, cruces contra los enemigos, parejas con tus aliados, equilibrio de daño,
tu maestría y lo que falta por salir. En español e inglés.

**App:** <https://srchipiron.github.io/mobile-legends-pick-assist/>

Proyecto de aficionado, sin relación con Moonton. Mobile Legends: Bang Bang y sus
héroes son marcas de sus propietarios; datos © Moonton, a través de una API
comunitaria. Las partidas profesionales salen de
[Liquipedia](https://liquipedia.net/mobilelegends), bajo licencia
[CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

**Privacidad:** no hay cuentas, ni servidor, ni seguimiento. Lo tuyo (maestría,
partidas) vive en el navegador y solo sale si tú lo envías.

## Instalar

En el móvil, abre la app en Chrome y elige **Añadir a pantalla de inicio**. Se
instala como app, funciona sin conexión con los últimos datos descargados y se
actualiza sola al volver a abrirla. La versión sale en el pie.

## Usar

1. **Línea y rango**: arriba. El rango por defecto es Gloria Mítica.
2. **Baneos**: la primera fase. Toca varios seguidos; los de tu línea salen primero.
3. **Picks**: una sola hoja para los dos equipos. Otro toque quita al héroe.
4. **Tarjetas**: tu pool ordenado, con la probabilidad, los motivos y por qué cada
   una no es la nº1. Toca el **nombre** para fijar tu pick.
5. **Plan y objetos**: a quién hacer focus, cómo jugar cada fase y las builds más
   usadas. «Copiar para el chat» lo deja listo para el equipo.
6. **Tus partidas**: apunta cada partida (la app te pregunta a los diez minutos),
   mira tu racha, tus números por hora y héroe, y la revisión de tus drafts.
7. **Meta**: el orden de cada línea y quién sube o baja esta semana.
8. **Diagnóstico** → Copiar: un informe para cuando algo parezca raro.

Ninguna cifra se afirma si cabe en su margen de error: el draft inclina la
partida, no la gana.

### Leer el draft de la tablet (opcional)

Si juegas en una tablet y usas la app en el móvil, un lector en Termux captura la
pantalla de la tablet por depuración inalámbrica y le pasa a la app los baneos y
picks que ve. **Solo hace capturas**: nunca toca la pantalla, no instala nada y
no habla con el juego ni con tu cuenta (hay una prueba que lo exige). Escucha
solo en `127.0.0.1`.

```bash
pkg install nodejs android-tools git
git clone https://github.com/srchipiron/mobile-legends-pick-assist.git
cd mobile-legends-pick-assist
adb pair IP:PUERTO_DE_VINCULAR      # una vez, desde Depuración inalámbrica
bash scripts/lector/lector.sh       # después basta con: lector
```

En la app, activa **Leer solo**. Activa la depuración inalámbrica solo para jugar
y quítala después.

## Contribuir

```bash
npm install
npm run ingest      # descarga los datos a public/data (opcional: ya vienen)
npm run dev         # la app en local
npm test            # obligatorio antes de subir nada
npm run build && npm run test:ui   # pruebas de navegador (PLAYWRIGHT_CHROME=ruta)
```

- `src/motor/` es el motor, puro (sin React, red ni almacenamiento);
  `src/motor/draft.js` es el único punto de entrada. `src/app/` es la interfaz.
  `scripts/` tiene la ingesta, las mediciones y el lector. `pruebas/` las pruebas.
- **Mide antes de tocar el modelo**: `scripts/ajustar-modelo.mjs` sobre partidas
  pro. Un término entra solo si mejora la validación cruzada.
- **Cada prueba nueva se verifica rompiendo lo que vigila.**
- Todo texto visible pasa por `t()`, en `src/app/i18n/es.js` y `en.js`.
- Sube la versión en `package.json` y escribe la entrada en `CHANGELOG.md`
  pensando en quien usa la app.
- [`CLAUDE.md`](CLAUDE.md) es la memoria del proyecto: decisiones medidas, errores
  ya cometidos y lo descartado. Léelo antes de cambiar algo importante.

Al subir a `main`, GitHub Actions pasa las pruebas y publica en GitHub Pages; un
bot trae datos nuevos dos veces al día y otro vigila lo publicado.
