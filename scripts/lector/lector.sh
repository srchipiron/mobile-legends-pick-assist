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
instalar() {
  local envoltorio
  envoltorio="#!/usr/bin/env bash
exec \"$AQUI/lector.sh\" \"\$@\"
"
  if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ] && [ ! -e "$PREFIX/bin/lector" ]; then
    printf '%s' "$envoltorio" > "$PREFIX/bin/lector" && chmod +x "$PREFIX/bin/lector" && echo "Instalado el mandato «lector»: la próxima vez basta con escribir eso."
  fi
  if [ -d "$HOME/.shortcuts" ] || [ -d "$HOME/.termux" ]; then
    mkdir -p "$HOME/.shortcuts"
    [ -e "$HOME/.shortcuts/Lector" ] || { printf '%s' "$envoltorio" > "$HOME/.shortcuts/Lector" && chmod +x "$HOME/.shortcuts/Lector"; }
  fi
  if [ -d "$HOME/.termux/boot" ] && [ ! -e "$HOME/.termux/boot/lector" ]; then
    printf '%s' "$envoltorio" > "$HOME/.termux/boot/lector" && chmod +x "$HOME/.termux/boot/lector" && echo "Con Termux:Boot: el lector arrancará solo al encender el móvil."
  fi
}
instalar

# Que Android no duerma a Termux mientras espera (es un mandato de Termux, no de adb).
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# Lo último del proyecto, si hay red; si no, lo que haya.
git pull --ff-only -q 2>/dev/null || echo "Sin red para actualizar: sigo con lo que hay."

# Un lector anterior contestaría a la app en lugar de este.
pkill -f 'scripts/lector/servir.mjs' 2>/dev/null && sleep 1

mkdir -p "$HOME/capturas"
exec node "$AQUI/servir.mjs" --guardar-capturas "$HOME/capturas" "$@"
