# La base de datos de partidas: cómo ponerla en marcha

Desde 3.69.0 la app puede guardar las partidas de todos los jugadores en una
base de datos, cada uno con su **clave de jugador** (sin correo ni
contraseña), y medir con todas ellas si la app ayuda. La base de datos es un
proyecto **gratuito de Supabase** que es TUYO. Se monta una vez, desde el
móvil, en unos diez minutos.

## Lo que hay que saber antes

- **Nada de esto toca tu cuenta del juego.** La app no pide ni guarda la
  contraseña de Mobile Legends. La clave de jugador es un texto al azar que
  genera la app.
- **Supabase te da dos claves.** La **publicable** (`sb_publishable_…`) va
  dentro de la app y puede verla cualquiera: está hecha para eso, y con ella
  solo se puede llamar a las cuatro funciones del esquema. La **secreta**
  (`sb_secret_…`) abre la base de datos entera: **no la copies en ningún
  sitio**. La app no deja publicarla.
- La contraseña de la base de datos que pide Supabase al crear el proyecto
  no se usa en la app. Guárdala en tus notas y no se la des a nadie.
- Un proyecto gratuito se **pausa tras 7 días sin uso**. Con partidas
  subiéndose no pasa. Si pasa, se reactiva desde el panel de Supabase con un
  botón; mientras tanto la app sigue funcionando y las partidas esperan en
  el móvil.

## La forma corta: que lo monte Claude

1. Crea la cuenta en <https://supabase.com> (entra con GitHub). Es lo único
   que exige iniciar sesión.
2. *Account* (tu foto, arriba a la derecha) → *Access Tokens* → *Generate
   new token*. Ponle de nombre `pick-assist` y, si deja elegir, que caduque
   en un día.
3. En la app de Claude, en el menú del entorno de la nube (la barra del
   título de la sesión) → *Edit*: añádelo como secreto o variable de
   entorno con el nombre `SUPABASE_ACCESS_TOKEN`. **No lo pegues en el
   chat.**
4. Abre una sesión nueva (el secreto se carga al empezar) y pide «monta la
   base de datos de Supabase». Claude corre `node scripts/montar-supabase.mjs`:
   crea el proyecto `pick-assist` en Frankfurt, pega el esquema, saca la
   clave publicable, comprueba que contesta y publica `public/comunidad.json`.
5. Cuando acabe, **borra el token** en *Access Tokens* y quítalo del
   entorno: da acceso a toda tu cuenta de Supabase y ya no hace falta.

## Paso a paso, a mano

1. **Crea la cuenta.** Abre <https://supabase.com> → *Start your project* →
   entra con tu cuenta de GitHub.
2. **Crea el proyecto.** *New project*:
   - *Name*: `pick-assist` (el que quieras).
   - *Database password*: inventa una y guárdala en tus notas.
   - *Region*: una de Europa (por ejemplo *Frankfurt*).
   - Plan *Free*. Pulsa *Create new project* y espera un par de minutos.
3. **Pega el esquema.** Abre en el navegador del móvil
   <https://raw.githubusercontent.com/srchipiron/mobile-legends-pick-assist/main/supabase/esquema.sql>,
   mantén pulsado → *Seleccionar todo* → *Copiar*. En Supabase:
   *SQL Editor* → *New query* → pega → *Run*. Tiene que decir
   *Success. No rows returned*. Si algún día cambia el esquema, se vuelve a
   pegar igual: no borra nada.
4. **Copia la dirección y la clave publicable.** En Supabase, botón
   *Connect* (arriba) o *Project Settings* → *API Keys*:
   - la dirección del proyecto: `https://<20 letras>.supabase.co`;
   - la *Publishable key*: empieza por `sb_publishable_`.
5. **Publícalas desde la app.** Ajustes → *Administración* → *Base de datos
   de partidas* → pega las dos → *Publicar la base de datos*. Pages tarda
   unos minutos en servir el cambio.
6. **Guarda tus partidas.** Ajustes → *Partidas* → *Base de datos de
   partidas* → *Guardar mis partidas*. Se suben todas (las tuyas son unas
   250) y desde entonces cada partida nueva se sube sola.
7. **Copia tu clave de jugador** (*Copiar mi clave*) a tus notas. Con ella,
   en otro móvil, *Usar esta clave* te trae todas tus partidas.

## Qué se guarda y qué no

De cada partida: el instante, tu héroe, los tres que recomendaba la app, si
ganaste, el rango, la probabilidad que enseñó (y su versión del modelo), los
baneos, el draft (tu línea, enemigos, compañeros), la duración y quién la
apuntó (tú o el lector). Y tu winrate de siempre (de la maestría), para
comparar.

No se guarda: tu nombre, tu cuenta, nada del lector (capturas, dudas), tu
maestría héroe a héroe, ni el token de GitHub. El servidor tampoco guarda tu
clave: solo su huella (SHA-256).

Cualquiera puede ver las partidas de todos (es para medir), pero cada una va
con un número de jugador, nunca con la clave. Nadie puede cambiar ni borrar
las de otro. *Borrar mis partidas de la base de datos* se lleva todas las
tuyas de allí (en el móvil se quedan).

Los partes de la tablet (3.74.0): con tu clave puesta, Lector MLBB sube cada
15 minutos cómo va (si graba, los permisos, la memoria, de cuándo son sus
datos, el último error y las últimas 60 líneas de su registro, sin IPs, sin
el código de vinculación y sin tu clave). Se guardan los 100 últimos y 7 días
por jugador, y como mucho uno cada 4 minutos. Se leen con la clave pública,
con el número de jugador y nunca la clave: llevan nombres de héroes, tiempos
y el modelo de la tablet. Los lee `node scripts/revisar-tablet.mjs`.

## Cómo se mide si la app ayuda

En Ajustes → *Partidas* → *Ver con las partidas de todos*, o por consola con
`node scripts/medir-comunidad.mjs` (`--guardar fichero` deja las filas para
medir el modelo con ellas; no se commitean, son de otras personas):

- **Dentro de cada jugador**, siguiendo la app frente a ir por libre. No se
  mezclan jugadores: uno que gana mucho y sigue mucho la app haría parecer
  que ayuda aunque no cambie nada.
- **Contra el winrate de siempre de cada uno.**
- Lo mismo **solo con las que apuntó el lector**, sin el sesgo de apuntar
  más las ganadas.
- Si la **probabilidad** que enseña se parece a lo que pasa (Brier).

Hacen falta al menos 3 jugadores para dar una conclusión. Y no es un
experimento: cada uno elige cuándo hacer caso.

Dos límites de no tener cuentas, aceptados a propósito: cualquiera con la
app podría subir partidas inventadas (el servidor tira lo que no tiene
forma y los winrates de siempre imposibles, pero no puede saber si una
partida pasó), y bajar las de todos muchas veces gasta la transferencia
del plan gratuito. Si algún día pasa, se ve en el panel de Supabase y se
borra a ese jugador.

## Para quien toque el código

- El esquema: `supabase/esquema.sql`. Su prueba, contra un Postgres de
  verdad con los permisos por defecto de Supabase: `npm run test:sql` (corre
  también en `pruebas-ui.yml`).
- El cliente: `src/app/basedatos.js`; el estado, `src/app/estado/useComunidad.js`
  (`roam-picker:comunidad`); la medida, `src/motor/comunidad.js`.
- La configuración pública: `public/comunidad.json` (`{ url, clave }`). Sin
  ese fichero no se ve nada de esto.
