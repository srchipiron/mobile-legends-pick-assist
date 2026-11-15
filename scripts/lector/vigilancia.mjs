/**
 * La vigilancia del final de una partida: desde que se cierra el draft
 * (`desde`), el lector busca el INICIO por el minimapa, captura el final por
 * su cuenta y lee el resultado de la tabla. Una partida a la vez y nunca
 * hacia atrás. Lo que ve lo usa el modo solo para apuntar la partida.
 */
import { enPartida } from './partida.mjs';
import { fotogramaDe } from './miniatura.mjs';
import { tiraDe, reconocerResultado } from './resultado.mjs';
import { LECTURAS_EN_PARTIDA } from '../../src/comun/contrato.js';

/**
 * [D] Los plazos: el inicio se busca desde el minuto 0 cada 20 s y, sin verlo
 * al minuto 8, se estima en el 1; el final se mira del 8 al 25 del draft cada
 * 10 s (hasta el 40 de PARTIDA con el inicio visto); al perder el minimapa,
 * una ráfaga cada 2 s durante 90 s (la tabla pasaba entre dos capturas de 10 s).
 */
export const VIGILANCIA = { desdeMin: 8, hastaMin: 25, intervaloMs: 10000, maxFotogramas: 8, inicioDesdeMin: 0, inicioEstimadoMin: 1, intervaloInicioMs: 20000, partidaHastaMin: 40, rapidoMs: 2000, rafagaMs: 90000 };
/** [D] El inicio visto por las lecturas del draft vale si entre la última fuera y la primera dentro no pasó más que esto… */
export const HUECO_MAXIMO_LECTURAS_MS = 60000;
/** [D] …y si la primera de dentro cae en estos minutos antes del cierre del draft. */
export const MINUTOS_DEL_INICIO_LEIDO = 10;

/** ¿Toca capturar el final? Cada `intervaloMs`, o cada `rapidoMs` durante la ráfaga, con medio latido de margen. */
export function tocaCapturarFinal({ ultimaFinal = 0, rafagaHasta = 0 } = {}, t, vigilancia = VIGILANCIA, latido = Math.min(vigilancia.intervaloMs, vigilancia.rapidoMs)) {
  const paso = rafagaHasta > t ? Math.min(vigilancia.rapidoMs, vigilancia.intervaloMs) : vigilancia.intervaloMs;
  return t - ultimaFinal >= paso - latido / 2;
}

const VACIO = { desde: null, activa: false, acabada: false, resultado: null, resultadoId: null, resultadoEn: null, fotogramas: [], inicio: null, inicioEstimado: false, duracion: null };

/**
 * `capturar()` da la imagen ya decodificada; `alMirar(enPartida)` se llama
 * con cada captura (la burbuja se esconde en partida). Devuelve
 * `{ vigilar, estado, terminar, anotarLectura, parar }`.
 */
export function crearVigilancia({ capturar, resultados, ahora = () => Date.now(), registrar = () => {}, vigilancia: pedida = VIGILANCIA, alMirar = () => {} }) {
  const vigilancia = { ...VIGILANCIA, ...pedida };
  const latido = Math.min(vigilancia.intervaloMs, vigilancia.intervaloInicioMs, vigilancia.rapidoMs);
  const hora = (t) => new Date(t).toISOString().slice(11, 19);
  let final = null, capturando = false, reloj = null;
  /** Lo que dijeron las lecturas del draft de si la tablet ya estaba en partida. */
  const leidas = { fuera: null, dentro: null, seguidas: 0 };
  const yaVistas = new Set();

  const parar = () => { if (reloj) clearInterval(reloj); reloj = null; if (final) final.activa = false; };
  const estado = () => (final
    ? { desde: final.desde, activa: final.activa, acabada: !!final.acabada, resultado: final.resultado, resultadoId: final.resultadoId, resultadoEn: final.resultadoEn, fotogramas: final.fotogramas, inicio: final.inicio, inicioEstimado: final.inicioEstimado, duracion: final.duracion }
    : { ...VACIO, fotogramas: [] });

  /** [D] Dos capturas seguidas con minimapa: empezó (medio intervalo antes de la primera). MEDIDO solo si antes se vio fuera de partida. */
  const detectarInicio = (f, img, t, intervalo) => {
    if (f.inicio) return;
    if (!enPartida(img)) { f.seguidas = 0; f.vistoFuera = true; return; }
    f.seguidas += 1;
    if (f.seguidas === 1) f.primera = t;
    if (f.seguidas >= LECTURAS_EN_PARTIDA) {
      f.inicio = f.primera - intervalo / 2;
      f.inicioEstimado = !f.vistoFuera;
      if (!f.inicioEstimado) f.hasta = Math.max(f.hasta, f.inicio + vigilancia.partidaHastaMin * 60000);
      registrar(`La partida ha empezado hacia las ${hora(f.inicio)}${f.inicioEstimado ? ' o antes (ya estaba en partida al empezar a mirar: inicio estimado)' : ''}.`);
    }
  };

  /** Una captura del final: se queda si la pantalla cambia; la tabla siempre; las de la ráfaga no las saca nadie de después. */
  const mirarFinal = (img, t) => {
    const dentro = enPartida(img);
    alMirar(dentro);
    if (final.enJuego && !dentro && !(final.rafagaHasta > t)) {
      final.rafagaHasta = t + vigilancia.rafagaMs;
      registrar(`Sin minimapa a los ${Math.round((t - final.desde) / 60000)} minutos del draft: miro la pantalla cada ${vigilancia.rapidoMs / 1000} s para ver la tabla del final.`);
    }
    final.enJuego = dentro;
    detectarInicio(final, img, t, vigilancia.intervaloMs);
    const f = fotogramaDe(img, final.anterior);
    final.anterior = f.pequena;
    if (!f.cambio) return;
    const id = `fotograma-${new Date(t).toISOString().replace(/[:.]/g, '-')}`;
    const leido = reconocerResultado(tiraDe(img), resultados);
    const rafaga = final.rafagaHasta > t;
    const foto = { id, minuto: Math.round((t - final.desde) / 60000), miniatura: f.miniatura, tira: f.tira, ...(!leido.tabla && dentro ? { enPartida: true } : {}), ...(rafaga ? { rafaga: true } : {}), tabla: leido.tabla, resultado: leido.resultado, resultadoParecido: Math.round(leido.parecido * 1000) / 1000 };
    if (final.fotogramas.length >= vigilancia.maxFotogramas) {
      const sale = (x) => !x.tabla && (rafaga || !x.rafaga);
      const i = final.fotogramas.findIndex(sale);
      if (i >= 0) final.fotogramas.splice(i, 1);
      else if (!leido.tabla) return;
      else final.fotogramas.shift();
    }
    final.fotogramas.push(foto);
    if (leido.tabla) final.acabada = true;
    if (leido.tabla && final.duracion == null && final.inicio) {
      final.duracion = Math.round(((t - final.inicio) / 60000) * 10) / 10;
      final.hasta = Math.min(final.hasta, Math.max(final.desde + vigilancia.hastaMin * 60000, t + 2 * 60000));
      registrar(`Partida de unos ${final.duracion} minutos${final.inicioEstimado ? ' (inicio estimado: no se apunta)' : ''}.`);
    }
    if (leido.resultado && !final.resultado) Object.assign(final, { resultado: leido.resultado, resultadoId: id, resultadoEn: t });
    registrar(`Fotograma ${id} (minuto ${foto.minuto}): la pantalla ha cambiado${leido.tabla ? ` · tabla de resultado: ${leido.resultado ? (leido.resultado === 'gane' ? 'VICTORIA' : 'DERROTA') : 'palabra sin plantilla'} (${leido.parecido.toFixed(2)})` : ''}.`);
    if (leido.resultado) { parar(); registrar('Resultado leído: dejo de vigilar el final.'); }
  };

  const tic = async () => {
    if (!final || !final.activa || capturando) return;
    const yo = final;
    const t = ahora();
    if (t > final.hasta) {
      parar();
      registrar(`Vigilancia del final acabada a los ${Math.round((final.hasta - final.desde) / 60000)} minutos del draft: ${final.fotogramas.length} pantallas distintas${final.resultado ? `, resultado ${final.resultado === 'gane' ? 'ganada' : 'perdida'}` : ', sin ver la tabla de resultado'}.`);
      return;
    }
    const finDelInicio = final.desde + vigilancia.desdeMin * 60000;
    if (!final.inicio && t >= finDelInicio) {
      final.inicio = final.desde + vigilancia.inicioEstimadoMin * 60000;
      final.inicioEstimado = true;
      registrar(`No he visto empezar la partida: la doy por empezada hacia las ${hora(final.inicio)} (estimado).`);
    }
    const buscandoInicio = t < finDelInicio;
    if (buscandoInicio && (final.inicio || t < final.desde + vigilancia.inicioDesdeMin * 60000 || t - final.ultimaInicio < vigilancia.intervaloInicioMs)) return;
    if (!buscandoInicio && !tocaCapturarFinal(final, t, vigilancia, latido)) return;
    if (buscandoInicio) final.ultimaInicio = t; else final.ultimaFinal = t;
    capturando = true;
    try {
      let img;
      try { img = await capturar(); } catch (e) {
        if (final === yo && (buscandoInicio ? !final.fallosInicio++ : !final.fallos++)) registrar(`${buscandoInicio ? 'Buscando el inicio de la partida' : 'Vigilando el final'} no consigo la captura (${String(e?.message).split('\n')[0]}): sigo intentándolo.`);
        return;
      }
      if (final !== yo) return;
      if (buscandoInicio) { alMirar(enPartida(img)); detectarInicio(final, img, t, vigilancia.intervaloInicioMs); } else mirarFinal(img, t);
    } catch (e) {
      registrar(`Un fotograma del final no se pudo leer: ${e?.message}`);
    } finally { capturando = false; }
  };

  /** Empieza a vigilar el final del draft cerrado en `desde` (el mismo: sigue; uno anterior: no). */
  const vigilar = (desde) => {
    if (final?.desde === desde) return estado();
    if (final && Number.isFinite(final.desde) && desde < final.desde) {
      if (!yaVistas.has(desde)) { yaVistas.add(desde); registrar(`No vuelvo a vigilar el draft de las ${hora(desde)}: ya vigilo uno más nuevo (${hora(final.desde)}).`); }
      return estado();
    }
    parar();
    final = { desde, hasta: desde + vigilancia.hastaMin * 60000, activa: true, fotogramas: [], resultado: null, resultadoId: null, resultadoEn: null, anterior: null, fallos: 0, vistoFuera: false, acabada: false, inicio: null, inicioEstimado: false, seguidas: 0, primera: null, ultimaInicio: 0, fallosInicio: 0, duracion: null, ultimaFinal: 0, enJuego: false, rafagaHasta: 0 };
    if (ahora() > final.hasta) { final.activa = false; return estado(); }
    reloj = setInterval(tic, latido);
    reloj.unref?.();
    registrar(`Draft completo a las ${hora(desde)}: busco el inicio de la partida desde el minuto ${vigilancia.inicioDesdeMin} y vigilo el final del minuto ${vigilancia.desdeMin} al ${vigilancia.hastaMin}.`);
    const { fuera, dentro, seguidas } = leidas;
    if (seguidas >= LECTURAS_EN_PARTIDA && fuera != null && dentro > fuera && dentro - fuera <= HUECO_MAXIMO_LECTURAS_MS
      && dentro >= desde - MINUTOS_DEL_INICIO_LEIDO * 60000 && dentro <= ahora()) {
      final.inicio = (fuera + dentro) / 2;
      final.vistoFuera = true;
      final.hasta = Math.max(final.hasta, final.inicio + vigilancia.partidaHastaMin * 60000);
      registrar(`La partida empezó hacia las ${hora(final.inicio)} (lo vieron las lecturas del draft).`);
    }
    return estado();
  };

  return {
    vigilar,
    estado,
    parar,
    /** Esa partida ya tiene resultado (contestado o apuntado): deja de mirar. */
    terminar: (desde) => { if (final && final.desde === desde) { final.acabada = true; parar(); return true; } return false; },
    /** Lo que vio una lectura del draft en el instante `t`: con eso se mide un inicio que la vigilancia llega tarde a ver. */
    anotarLectura: (t, dentro) => { if (dentro) { leidas.seguidas += 1; if (leidas.seguidas === 1) leidas.dentro = t; } else { leidas.fuera = t; leidas.dentro = null; leidas.seguidas = 0; } },
    /** Vigilando el final de una partida ya empezada: ni burbuja ni botón (la grabación los cogía encima de la tabla). */
    alFinal: () => !!final?.activa && final.inicio != null,
  };
}
