// Lo mínimo que caza lo que ya costó una incidencia: un identificador que
// no existe (`matchup is not defined` pasó `npm test`, la compilación y el
// despliegue en 2.0.0) y un import que ya no se usa. No es una guía de
// estilo: es un guardarraíl, y por eso corre dentro de `npm test`.
import js from '@eslint/js';

const navegador = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  fetch: 'readonly', URL: 'readonly', Blob: 'readonly', CompressionStream: 'readonly', DecompressionStream: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', Response: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  requestAnimationFrame: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', URLSearchParams: 'readonly', history: 'readonly', location: 'readonly', console: 'readonly', crypto: 'readonly',
  Intl: 'readonly', AbortSignal: 'readonly', AbortController: 'readonly', btoa: 'readonly', atob: 'readonly',
  __APP_VERSION__: 'readonly', __BUILD_TIME__: 'readonly', __CHANGELOG__: 'readonly',
};
const node = {
  process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly',
  clearTimeout: 'readonly', AbortSignal: 'readonly', AbortController: 'readonly', TextDecoder: 'readonly', TextEncoder: 'readonly',
  structuredClone: 'readonly', Intl: 'readonly', URLSearchParams: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', crypto: 'readonly', Response: 'readonly', Blob: 'readonly',
  CompressionStream: 'readonly', DecompressionStream: 'readonly', localStorage: 'readonly', window: 'readonly',
  document: 'readonly', navigator: 'readonly', history: 'readonly', location: 'readonly', __dirname: 'readonly',
};

const reglas = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
  'no-undef': 'error',
  // El código escribe `for (;;)` y `while (true)` a propósito en los bucles de reintento.
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: navegador },
    rules: { ...reglas, 'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_|^[A-Z]' }] },
  },
  {
    // Las pruebas también: un `test` re-exportado sin importar pasó a seis
    // ficheros e2e porque este bloque no las incluía.
    files: ['scripts/**/*.mjs', 'pruebas/**/*.mjs', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: node },
    rules: reglas,
  },
];
