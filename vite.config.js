import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { parsearChangelog } from './scripts/changelog.mjs';
import { huellasDeImagenes } from './scripts/huellas.mjs';
import { filasDeSalud } from './scripts/salud.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// [P] La versión sale de package.json; las pruebas compilan «otra» con APP_VERSION sin tocar el repositorio.
const VERSION = process.env.APP_VERSION ?? pkg.version;
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    // Las novedades, del mismo CHANGELOG.md que exige la versión documentada.
    __CHANGELOG__: JSON.stringify(parsearChangelog(leer('./CHANGELOG.md'))),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // La huella del contenido de cada cara e icono: se piden con `?v=` y una rehecha entra aunque haya otra en caché.
    __HUELLAS__: JSON.stringify({
      heroes: huellasDeImagenes(new URL('./public/heroes', import.meta.url).pathname, '.jpg'),
      objetos: huellasDeImagenes(new URL('./public/objetos', import.meta.url).pathname, '.png'),
    }),
  },
  // En GitHub Pages el despliegue pasa BASE_PATH=/nombre-del-repo/.
  base: process.env.BASE_PATH ?? './',
  plugins: [
    react(),
    // La versión compilada, SIN caché: el diagnóstico compara lo que corre con lo publicado.
    {
      name: 'version-publicada',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION, buildTime: new Date().toISOString() }) });
      },
    },
    // Las últimas corridas de la vigilancia (fuera de /data y sin caché, por lo mismo), línea a línea.
    {
      name: 'historial-de-salud',
      generateBundle() {
        let filas = [];
        try {
          const leido = filasDeSalud(leer('./historial/salud.jsonl'), { max: 40 });
          filas = leido.filas;
          if (leido.rotas) this.warn(`historial/salud.jsonl: ${leido.rotas} líneas rotas, descartadas`);
        } catch { /* sin historial todavía: el diagnóstico lo dice */ }
        this.emitFile({ type: 'asset', fileName: 'historial.json', source: JSON.stringify(filas) });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Mobile Legends Pick Assist',
        short_name: 'Pick Assist',
        description: 'Qué héroe coger en tu línea, según el draft y el meta actual',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        // 'any': forzar el apaisado giraba la app instalada en un móvil en vertical.
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // [M] Adaptable: el dibujo cabe en la zona segura (radio 165 de 205 a 512 px; hay prueba).
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // [M] Sin imágenes en la precarga (1,7 MB de objetos y 2,9 de caras): se guardan al verlas.
        globPatterns: ['**/*.{js,css,html,svg}', 'icon-*.png'],
        runtimeCaching: [
          {
            // Una cara o un icono no cambian salvo rediseño, y entonces cambia su huella (`?v=`).
            urlPattern: /\/(objetos|heroes)\/\d+\.(png|jpg)(\?v=[0-9a-f]+)?$/,
            handler: 'CacheFirst',
            options: { cacheName: 'imagenes', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 } },
          },
          { urlPattern: /\/data\/.*\.json$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'meta-data' } },
        ],
      },
    }),
  ],
});
