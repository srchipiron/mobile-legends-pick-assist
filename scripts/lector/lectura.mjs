/**
 * Una lectura de la pantalla del draft, partida en tres trozos que no
 * dependen uno de otro (baneos, picks enemigos, tu equipo): en la tablet van
 * en tres hilos a la vez (`lectorEnHilos`) y dan EXACTAMENTE lo mismo que en
 * uno (`leerCaptura`). Puro salvo los hilos: recibe píxeles.
 */
import { Worker } from 'node:worker_threads';
import { leerBaneos, leerPicksEnemigos, leerAliados, filaPropia, sinRepetidos } from './leer.mjs';
import { carasAprendidas, aliadasAprendidas } from './aprender.mjs';

/** Los tres trozos, en el orden en que se reparten entre los hilos. */
export const PARTES = ['baneos', 'enemigos', 'aliados'];

/** Un trozo de la lectura de `img` (ya decodificada), con lo aprendido en esta tablet. */
export function leerParte(img, parte, caras, aprendido = null) {
  if (parte === 'baneos') return leerBaneos(img, caras);
  if (parte === 'enemigos') return leerPicksEnemigos(img, caras, { posiciones: aprendido?.picks ?? undefined, extra: carasAprendidas(aprendido) });
  if (parte === 'aliados') return { aliados: leerAliados(img, caras, { extra: aliadasAprendidas(aprendido) }), tuyoFila: filaPropia(img) };
  throw new Error(`parte desconocida: ${parte}`);
}

const plano = (r) => ({ nombre: r.nombre ?? null, candidato: r.candidato ?? null, parecido: Math.round((r.parecido ?? 0) * 1000) / 1000 });

/**
 * Los tres trozos juntos: baneos de cada lado, picks enemigos y tu equipo
 * (las cinco filas, cuál eres tú y tu héroe). [D] Los repetidos se quitan
 * DENTRO de cada lado: los dos equipos sí pueden banear al mismo héroe.
 */
export function juntarLectura({ ancho, alto }, { baneos, enemigos, aliados }) {
  const pickados = sinRepetidos(enemigos), nuestros = sinRepetidos(aliados.aliados);
  return {
    ancho, alto,
    tuyos: sinRepetidos(baneos.tuyos).map(plano), suyos: sinRepetidos(baneos.suyos).map(plano), enemigos: pickados.map(plano),
    aliados: nuestros.map(plano), tuyoFila: aliados.tuyoFila, tuyo: aliados.tuyoFila >= 0 ? (nuestros[aliados.tuyoFila].nombre ?? null) : null,
  };
}

/** La lectura entera de una imagen ya decodificada, en este hilo. */
export function leerCaptura(img, caras, aprendido = null) {
  const [baneos, enemigos, aliados] = PARTES.map((p) => leerParte(img, p, caras, aprendido));
  return juntarLectura(img, { baneos, enemigos, aliados });
}

/**
 * La lectura en tres hilos con la imagen en memoria compartida (sin copiar
 * sus 14 MB). Los hilos nacen con la primera lectura y viven con el
 * servidor. [D] Si un hilo falla, esa lectura se hace aquí entera y los hilos
 * se rehacen: leer más despacio es mejor que no leer.
 */
export function lectorEnHilos({ caras, registrar = () => {}, tarea = new URL('lectura-tarea.mjs', import.meta.url) }) {
  let hilos = null, siguiente = 0;
  const pendientes = new Map();
  const tirar = (motivo) => {
    for (const h of hilos ?? []) h.terminate().catch(() => {});
    hilos = null;
    for (const { rechazar } of pendientes.values()) rechazar(motivo);
    pendientes.clear();
  };
  const arrancar = () => {
    hilos = PARTES.map(() => {
      const h = new Worker(tarea, { workerData: { caras } });
      h.unref();
      h.on('message', ({ id, resultado, error }) => {
        const p = pendientes.get(id);
        if (!p) return;
        pendientes.delete(id);
        if (error) p.rechazar(new Error(error)); else p.resolver(resultado);
      });
      h.on('error', (e) => tirar(e));
      h.on('exit', (codigo) => { if (codigo !== 0 && hilos) tirar(new Error(`un hilo de lectura salió con ${codigo}`)); });
      return h;
    });
  };
  const encargar = (hilo, mensaje) => new Promise((resolver, rechazar) => {
    const id = ++siguiente;
    pendientes.set(id, { resolver, rechazar });
    hilo.postMessage({ id, ...mensaje });
  });
  return {
    async leer(img, aprendido = null) {
      try {
        if (!hilos) arrancar();
        const pixeles = new SharedArrayBuffer(img.rgba.length);
        new Uint8Array(pixeles).set(img.rgba);
        const [baneos, enemigos, aliados] = await Promise.all(PARTES.map((parte, i) => encargar(hilos[i], { parte, ancho: img.ancho, alto: img.alto, pixeles, aprendido })));
        return juntarLectura(img, { baneos, enemigos, aliados });
      } catch (e) {
        registrar(`Los hilos de lectura fallaron (${String(e?.message ?? e).split('\n')[0]}): leo en uno solo.`);
        tirar(e);
        return leerCaptura(img, caras, aprendido);
      }
    },
    cerrar: () => tirar(new Error('lector cerrado')),
  };
}
