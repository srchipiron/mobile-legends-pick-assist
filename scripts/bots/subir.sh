#!/usr/bin/env bash
# Sube lo commiteado a main: rebase y push, tres intentos. Otro bot (o un
# push de código) mueve main mientras corre, y un push rechazado perdía la
# corrida. Si fallan los tres, en ROJO: un bucle que acaba en `sleep` sale
# con 0 [C]. Los argumentos van tal cual a `git push` (vacío: el de siempre).
#
#   bash scripts/bots/subir.sh                  # git push
#   bash scripts/bots/subir.sh origin HEAD:main
for intento in 1 2 3; do
  git pull --rebase --autostash origin main && git push "$@" && exit 0
  echo "push rechazado (intento $intento)"
  [ "$intento" = 3 ] || sleep 5
done
echo "::error::push rechazado tres veces"
exit 1
