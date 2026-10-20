/**
 * `pedirPublicada` (3.60.2): con la red colgada no espera para siempre. El
 * botón Diagnóstico no respondía y el informe salía minutos después.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { pedirPublicada } from '../../src/app/entorno.js';

test('con la red colgada devuelve null en el plazo; con respuesta, lo que diga', async () => {
  const real = globalThis.fetch;
  // El temporizador de AbortSignal.timeout no sostiene el proceso de Node: este sí.
  const vivo = setTimeout(() => {}, 10000);
  try {
    // Una petición que nunca contesta, salvo que la corten.
    globalThis.fetch = (_url, { signal } = {}) => new Promise((_, rechazar) => signal?.addEventListener('abort', () => rechazar(new Error('cortada'))));
    const t0 = Date.now();
    const r = await pedirPublicada({ plazo: 200 });
    ok(Date.now() - t0 < 2000, `con la red colgada tarda ${Date.now() - t0} ms`);
    ok(r.publicada === null && r.historial === null, JSON.stringify(r));
    globalThis.fetch = async (url) => ({ ok: true, json: async () => (String(url).includes('version') ? { version: '9.9.9' } : [1]) });
    const bien = await pedirPublicada({ plazo: 200 });
    eq(bien.publicada?.version, '9.9.9');
    eq(bien.historial?.length, 1);
  } finally { globalThis.fetch = real; clearTimeout(vivo); }
});

await terminar('app/publicada');
