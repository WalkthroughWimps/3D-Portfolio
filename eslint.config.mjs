import js from '@eslint/js';
import globals from 'globals';

const browserFiles = [
  '_0-start/**/*.js', '_1-about/**/*.js', '_2-videos/**/*.js',
  '_3-graphics/**/*.js', '_4-games/**/*.js', '_5-music/**/*.js',
  '_6-docs/**/*.js', '_7-shared-scripts/**/*.js',
  'debug/**/*.js', 'js/**/*.js', 'tools/local-admin/**/*.mjs'
];

export default [
  {
    // Scope lint to maintained site code. Generated games, vendored libraries,
    // experiments, and old piano copies are not part of the seven routes.
    ignores: [
      '**/node_modules/**', 'assets/vendor/**', 'games/**', 'labs/**',
      'unused/**', 'backups/**', 'output/**', 'tmp/**',
      '_0-start/stupid.js',
      '_5-music/music-piano-controls.js',
      '_5-music/music-piano-controls.v2(1).js'
    ]
  },
  {
    files: browserFiles,
    ...js.configs.recommended,
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser, gsap: 'readonly', KUTE: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^(_|e)$' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['sw.js'],
    ...js.configs.recommended,
    languageOptions: { sourceType: 'script', globals: globals.serviceworker }
  },
  {
    files: ['tools/*.js', 'tools/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { sourceType: 'module', globals: globals.node }
  }
];
