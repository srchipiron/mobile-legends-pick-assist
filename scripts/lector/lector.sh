#!/usr/bin/env bash
# «lector» (3.26.0): arrancar el lector de la tablet con UN mandato en Termux
# (o un toque, con Termux:Widget). Hace lo que antes había que escribir a
# mano cada vez: ponerse en la carpeta del repositorio, traer lo último,
# cerrar un lector que se hubiera quedado abierto (contestaba a la app con
# el puerto viejo y salía «no llega a la tablet») y arrancar el nuevo, que
# busca la tablet solo. La primera vez se instala a sí mismo como mandato
# `lector` y como acceso directo de Termux:Widget.
#
# SEGURIDAD: aquí no hay ningún mandato de adb; la captura es la de leer.mjs.
set -u
AQUI="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
REPO="$(cd "$AQUI/../.." && pwd)"
cd "$REPO" || exit 1

# Instalarse: el mandato `lector`, el acceso directo del widget y, si está
# Termux:Boot (existe su carpeta), arrancar también al encender el móvil.
# Los envoltorios llevan el bash de Termux con su ruta ENTERA (3.32.1):
# Termux:Widget y Termux:Boot lanzan el guion sin el entorno de Termux, y
# ahí `#!/usr/bin/env` no existe (Android decía «env: …/Lector: No such
# file or directory»). Se reescriben siempre, para que un envoltorio viejo
# se arregle solo.
BASH_BIN="bash"
[ -n "${PREFIX:-}" ] && [ -x "$PREFIX/bin/bash" ] && BASH_BIN="$PREFIX/bin/bash"
instalar() {
  local envoltorio cabecera
  cabecera="#!/usr/bin/env bash"
  [ "$BASH_BIN" != "bash" ] && cabecera="#!$BASH_BIN"
  envoltorio="$cabecera
exec \"$BASH_BIN\" \"$AQUI/lector.sh\" \"\$@\"
"
  escribir() {
    if [ ! -e "$1" ] || [ "$(cat "$1" 2>/dev/null)" != "$(printf '%s' "$envoltorio")" ]; then
      printf '%s' "$envoltorio" > "$1" && chmod +x "$1" && return 0
    fi
    return 1
  }
  if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
    escribir "$PREFIX/bin/lector" && echo "Instalado el mandato «lector»: la próxima vez basta con escribir eso."
  fi
  if [ -d "$HOME/.shortcuts" ] || [ -d "$HOME/.termux" ]; then
    mkdir -p "$HOME/.shortcuts"
    escribir "$HOME/.shortcuts/Lector" && echo "Acceso directo «Lector» para Termux:Widget al día."
  fi
  if [ -d "$HOME/.termux/boot" ]; then
    escribir "$HOME/.termux/boot/lector" && echo "Con Termux:Boot: el lector arrancará solo al encender el móvil."
  fi
}
instalar

# Que Android no duerma a Termux mientras espera (es un mandato de Termux, no de adb).
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# Lo último del proyecto, si hay red; si no, lo que haya. Si este mismo
# guion ha cambiado con la actualización, se relanza ya actualizado (una
# sola vez: `--actualizado`), para que lo nuevo entre en esta misma corrida.
ACTUALIZADO=0
ARGS=()
for a in "$@"; do [ "$a" = "--actualizado" ] && ACTUALIZADO=1 || ARGS+=("$a"); done
set -- "${ARGS[@]+"${ARGS[@]}"}"
if [ "$ACTUALIZADO" = 0 ]; then
  ANTES="$(cksum "$AQUI/lector.sh" 2>/dev/null)"
  git pull --ff-only -q 2>/dev/null || echo "Sin red para actualizar: sigo con lo que hay."
  DESPUES="$(cksum "$AQUI/lector.sh" 2>/dev/null)"
  if [ "$ANTES" != "$DESPUES" ]; then
    echo "El lector se ha actualizado: arranco la versión nueva."
    exec "$BASH_BIN" "$AQUI/lector.sh" --actualizado "$@"
  fi
fi

# Un lector anterior contestaría a la app en lugar de este.
pkill -f 'scripts/lector/servir.mjs' 2>/dev/null && sleep 1

# Las capturas van en casa de Termux, NO en la galería del móvil, y el lector
# borra solas las de hace más de unas horas (3.34.0: «se me está llenando el
# móvil de fotos de partidas»). La carpeta de Descargas de antes se quita.
CAPTURAS="$HOME/capturas"
if [ -d "$HOME/storage/downloads/capturas" ]; then
  rm -rf "$HOME/storage/downloads/capturas" && echo "Quitadas las capturas de Descargas: ya no se guardan en la galería."
fi
mkdir -p "$CAPTURAS"
exec node "$AQUI/servir.mjs" --guardar-capturas "$CAPTURAS" "$@"
