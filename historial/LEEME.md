# Historial

- `salud.jsonl`: una línea por corrida de la vigilancia (`vigilancia.yml`).
- `pro-partidas.jsonl`: las partidas profesionales de Liquipedia (`pro.yml`),
  ordenadas por fecha e índice; solo crece.
- `partidas.json`: tus partidas importadas a mano (`importar-partidas.mjs`);
  la leen `medir-mias` y `proponer-modelo`, no la app.

## La salud

Un informe suelto dice si la app está bien HOY; cien dicen **qué se está
moviendo** (la cobertura que baja, el ruido que sube, los datos que envejecen
porque la actualización lleva días fallando). Un umbral solo salta cuando ya
es tarde.

```sh
node scripts/tendencia.mjs            # lo que ha cambiado
node scripts/tendencia.mjs --todo     # todas las filas
```

| campo | para qué |
|---|---|
| `fallos`, `avisos` | si la app publicada está sana (avisos distintos entre las cinco líneas) |
| `version`, `versionRepo` | qué sirve Pages y qué hay en el repositorio |
| `datosDe`, `edadHoras` | si la actualización automática sigue viva (más de 72 h abre incidencia) |
| `heroes`, `conLinea`, `conRol`, `conDano`, `conSpeciality`, `conHabilidades` | si la ficha de los héroes llega entera |
| `cruces`, `sinergias` | si la matriz sigue completa (17.556 cada una) |
| `winrateLinea`, `curvaLinea` | pares héroe-línea del winrate y de la curva por duración |
| `cobertura` | qué parte de las decisiones de roam se apoya en datos reales |
| `ruido` | si el dato de los héroes poco jugados sigue siendo firme |
| `objetos`, `builds`, `pools` | objetos, builds y héroes por línea |
| `fuerza`, `coherenciaRango` | de qué rango sale la fuerza y cuánto se parece Gloria a Mítico |
| `relaciones`, `coherenciaCruces`, `coherenciaParejas` | de qué rango salen cruces y parejas |

Los recuentos de `FIJAS` (scripts/comparar-ingesta.mjs) van contados como los
cuenta el comparador, que no acepta una corrida por debajo del máximo de esta
serie. Las filas viejas pueden traer columnas que ya no se escriben
(`recorteCounters`, `recorteSinergias`). No lleva NADA personal: son corridas
automáticas contra lo publicado.
