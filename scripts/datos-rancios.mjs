#!/usr/bin/env node
/**
 * La vigilancia, tras guardar su fila (3.81.2): sale con 1 y lo dice si los
 * datos publicados pasan de `DATOS_RANCIOS_H`. Así la incidencia de siempre
 * se abre (y se cierra sola cuando vuelven a entrar).
 *
 *   node scripts/datos-rancios.mjs historial/salud.jsonl
 */
import { readFileSync } from 'node:fs';
import { filasDeSalud, datosRancios } from './salud.mjs';

const ruta = process.argv[2] ?? 'historial/salud.jsonl';
let texto = '';
try { texto = readFileSync(ruta, 'utf8'); } catch (e) { console.log(`No se puede leer ${ruta}: ${e.message}`); process.exit(0); }
const motivo = datosRancios(filasDeSalud(texto).filas);
if (motivo) { console.log(motivo); process.exit(1); }
console.log('Datos al día.');
