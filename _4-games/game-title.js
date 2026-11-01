import { GAME_NAMES } from './game-names.js';
const parts = location.pathname.split('/').filter(Boolean);
const id = parts.at(-1) === 'index.html' ? parts.at(-2) : parts.at(-1);
if (GAME_NAMES[id]) document.title = GAME_NAMES[id];
